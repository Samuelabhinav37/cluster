# Testing Cluster

`npm test` runs everything (Vitest). `npm run typecheck && npm run lint && npm test && npm run build`
is the gate CI enforces on every push.

## The three layers

### 1. Unit tests — `src/**/*.test.ts` (node env)

Pure functions, one module each. Deterministic: injected clocks, fake
`chrome.storage`, mocked providers, no real network. This is the bulk of the
suite and where new logic should land first.

### 2. Pipeline contract — `src/lib/pipeline.contract.test.ts`

One fixture mailbox pushed through the whole pure chain (senderModel → expiry /
spam / sort / never-read / smart-views / rules / first-contact). Catches
field-shape regressions that per-module unit tests miss.

### 3. DOM action-flow tests — `src/dashboard/*.dom.test.ts` (jsdom env)

Boot the real `index.html` + `dashboard.ts`'s `main()` into jsdom with **spy
providers**, then drive real click-throughs. Each test asserts the effects
that matter for a user action, not just that a button renders:

- the **provider call** (method, args, exact ids),
- the **persisted-settings mutation** (`storedSettings()`),
- the **Recently-done entry + working Undo** where the flow has one.

The shared harness is `src/dashboard/testHarness.ts`:

```ts
const dash = await bootDashboard({ settings?, mailbox?, gmail?, outlook?,
                                   grantOrigins?, denyFilterScope?, fetchImpl?,
                                   online?, tolerateScanError? });
dash.showScreen("delete");
const btn = dash.button("expiry-cleanup-slot", /Clean up/i)!;
btn.click();
await confirmStep(dash.el("expiry-cleanup-slot"));
expect(dash.gmail.trashMessages).toHaveBeenCalled();
expect(dash.storedSettings().unsubscribeRequests?.["gmail:…"]).toBeTruthy();
```

`bootDashboard()` calls `vi.resetModules()` and dynamically `import("./dashboard")`,
so every test gets isolated module state (`state.ts`'s `ctx`, event
listeners) — it's safe to call more than once per file, and each test in a
file boots its own fresh instance. That dynamic `import()` is what lets
`vi.doMock()` calls registered earlier in a test (see `dashboard.errors.dom.test.ts`
for an example that mocks one tab module to throw) take effect on the next
boot without touching every other module's real implementation.

The dynamic import itself trips `networkEgress.test.ts`'s "no dynamic
`import()` anywhere under `src/`" guard (dynamic import can pull a remote
module at runtime — the guard exists to keep the extension's egress surface
fixed and reviewable). `testHarness.ts` is carved out in a narrow, named
`ALLOWED_DYNAMIC_IMPORT_CALLERS` allowlist there, same pattern as the
existing `ALLOWED_FETCH_CALLERS` list: it's test-only, tree-shaken from the
real build, and its one `import()` target is always the local `dashboard.ts`
module graph, never a remote specifier.

### The fixture mailbox

`testHarness.ts`'s `fixtureMailbox()` is deliberately not a generic "some
mail" fixture — each message id is there to trip one specific piece of
downstream logic, so a test can assert on that id directly instead of
re-deriving which message should have matched:

| id(s)      | sender                     | exists to trigger…                                                                 |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------ |
| `s1`–`s3`  | `deals@shop.example`        | unsubscribe-capable newsletter; a clean, fully-deletable domain group                |
| `f1`, `f2` | `statements@chase.com`      | receipt-kind mail (protected as "transactional"); no unsubscribe, so Mute is primary  |
| `p1`, `p2` | `family@personal.example`   | `p1` starred at scan time; `p2` unstarred but protected by "no-bulk-signal" (real person, not a company) — the whole domain ends up fully protected |
| `o1`       | `code@auth.example`         | an aged one-time code — the "ready to clean up" expiry bucket                        |
| `b1`       | `reports@bigmail.example`   | large (5 MB) and >1 year old — Smart Views' "Large" and "Older than 1 year" chips     |
| `x1`       | `paypal-help@gmail.com`     | free-mail brand-claim — the Phishing screen's threat detection                       |

No message sets `lanes` — `senderModel.ts` treats an absent `lanes` field as
"belongs to every lane" (see P1.1's one-pass combined scan), so every fixture
message shows up in both the cleanup scan (Delete/Organize) and the security
scan (Phishing) without needing to hand-tag each one for both.

`makeGmailSpy(mailbox, overrides)` stubs every `EmailProvider` method with a
benign `vi.fn()` default; `listProtectedMessageIds` defaults to an empty
`Set` (no live re-check hit). Override it to simulate a message starred
*since* the scan — this is how `delete.actions.dom.test.ts` and
`rules.actions.dom.test.ts` regression-test the live protection re-check
(`bulkActions.filterOutProtected`, and its rule-engine equivalent fixed in
commit `ffdd1ef`) at runtime, not just that a guard call exists in the
source (that's what `bulkDeleteGuard.test.ts`'s source scan checks instead).

Coverage today: boot smoke (`dashboard.dom.test.ts`), by-domain delete and
expiry cleanup (`delete.actions`), decision rows / Smart Views / Sort my
inbox (`organize.actions`), verified one-click unsubscribe
(`subscriptions.actions`), the rule composer and "Apply enabled rules now"
(`rules.actions`), the Screener hold/allow/block flow (`screener.actions`),
Phishing's Block-sender and quarantine review (`phishing.actions`), and
`safeRender` isolation / scan failure / offline handling (`dashboard.errors`).

Deliberately scoped down rather than exhaustively covered (each file's own
header comment says why): Sort my inbox's label-collision resolution,
per-sender bucket overrides, and seed-from-existing card; the Subscriptions
"Unsubscribe + clean" and "Read later" durable-job flows; the on-device AI
rule-draft path itself (only its deterministic-fallback behavior is testable
in jsdom, since Chrome's `LanguageModel`/`Summarizer` API has no jsdom shape
at all).

## Only verifiable in a real browser

These can't be faked in jsdom — they're the manual reload-unpacked pass, tracked
in [`live-test-checklist.md`](./live-test-checklist.md):

- The OAuth / incremental-consent flow (`chrome.identity.getAuthToken`).
- Real Gmail per-minute quota behaviour (the 403 handling is unit-tested; the
  actual rate is not).
- Gmail `criteria.from` OR-list syntax and length limits.
- Graph `messageRules` create / delete against a live Outlook mailbox.
- Whether `dmarc=fail` ever appears on delivered Promotions / Updates mail.
- MV3 CSP under real Chrome; the `managed_schema.json` load path.
- Chrome's on-device `Summarizer` / `LanguageModel` availability and the
  actual on-device rule-draft output quality.
- The redesign's visual layer against a real mailbox. For layout and
  appearance against fake data, use the UI preview below.

## UI preview — `npm run preview:ui`

Builds `dist/` and serves it at `http://127.0.0.1:4599/` with
`scripts/preview/chrome-stub.js` injected ahead of the dashboard bundle. The
stub replaces `chrome.*` and answers the Gmail REST endpoints from a fixed fake
mailbox (shops, newsletters, receipts, codes, contacts, cold outreach, brand
lookalike phishing). The real bundle then runs in an ordinary tab: no OAuth, no
real mail, and browser automation can drive it, which it can't do for
`chrome-extension://` pages.

Fake state lives in the tab's `localStorage`, so writes (trash, labels,
filters, settings) survive a reload. Query flags:

| Flag | Effect |
|---|---|
| `?reset` | Wipe fake state: a fresh install with Gmail not connected (the root URL redirects here) |
| `?consent` | Show a simulated sign-in overlay on Connect, with Allow and Cancel |
| `?deny` | The interactive sign-in fails as a cancelled prompt would |
| `?offline` | Every Gmail call fails with a network error |
| `?pinned` | Report the toolbar icon as pinned, hiding the pin tip |

It proves layout and flow, not Gmail: real quota, real headers and Google's
real consent screens still need the reload-unpacked checklist. The server adds
`<meta name="darkreader-lock">` because the Dark Reader extension re-tints
localhost pages (it can't reach the real extension page), which made early
previews look like a broken light theme.

## Adding a DOM action-flow test

1. New `src/dashboard/<surface>.actions.dom.test.ts` with the
   `// @vitest-environment jsdom` pragma.
2. `bootDashboard()` (pass `settings` for state the flow needs — it's stamped
   with the current schema version so no migration blanks it).
3. Find the control (`dash.button(containerId, text)` or query the screen —
   `dash.showScreen("delete")` etc. clicks the sidebar nav), click, `await
   confirmStep(container)` for a `renderConfirmStep` flow or `vi.waitFor` on
   the effect. Capture any element you'll query again (like a confirm
   step's container) *before* clicking whatever triggers a re-render — the
   original node can get detached from the DOM once the click handler
   replaces its container's contents.
4. Assert the provider spy, `storedSettings()`, and Recently-done.
5. Keep assertions on data (`data-*`, `textContent`, `disabled`), never layout.
