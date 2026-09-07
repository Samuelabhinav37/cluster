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
providers**, then drive real click-throughs. Each test asserts the three side
effects that matter for a user action:

- the **provider call** (args, ids, label),
- the **persisted-settings mutation** (`storedSettings()`),
- the **Recently-done entry + working Undo** where the flow has one.

The shared harness is `src/dashboard/testHarness.ts`:

```ts
const dash = await bootDashboard({ settings?, mailbox?, gmail?, outlook?,
                                   grantOrigins?, denyFilterScope?, fetchImpl?,
                                   online?, tolerateScanError? });
dash.showTab("cleanup");
dash.button("never-read-section", /Trash suggested/i)!.click();
await confirmStep(dash.el("never-read-trash-slot"));
expect(dash.gmail.trashMessages).toHaveBeenCalled();
expect(dash.storedSettings().mutedSenders).toContain("…");
```

`bootDashboard()` calls `vi.resetModules()` and re-imports, so every test gets
isolated module state (`state.ts`'s `ctx`, event listeners). It's safe to call
more than once per test.

Coverage today: boot smoke (`dashboard.dom.test.ts`), clean-up
(`cleanup.actions`), rules (`rules.actions`), subscriptions
(`subscriptions.actions`), security (`security.actions`), screener
(`screener.actions`), sort-my-inbox (`sortInbox.actions`), and the error /
offline paths (`dashboard.errors`).

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
- Chrome's on-device `Summarizer` / `LanguageModel` availability.

## Adding a DOM action-flow test

1. New `src/dashboard/<surface>.actions.dom.test.ts` with the
   `// @vitest-environment jsdom` pragma.
2. `bootDashboard()` (pass `settings` for state the flow needs — it's stamped
   with the current schema version so no migration blanks it).
3. Find the control (`dash.button(containerId, text)` or query the section),
   click, `await confirmStep(container)` for a `renderConfirmStep` flow or
   `vi.waitFor` on the effect.
4. Assert the provider spy, `storedSettings()`, and Recently-done.
5. Keep assertions on data (`data-*`, `textContent`, `disabled`), never layout.
