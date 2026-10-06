# Redesign fix plan

Execution plan for the 39 findings in the three-lens audit of
`redesign/apple-glass-v3` (PR #8). Ordered by phase; each phase's tasks are
independent unless a dependency is noted. Every task ends with a green gate:
`npm run typecheck && npm run lint && npm test && npm run build`.

Legend — **Effort**: S ≤1h · M ≤half day · L ≥1 day. **Risk**: low / med / high
(chance of a regression that a test won't catch).

Finding IDs map to the audit
(<https://claude.ai/code/artifact/aecb4dbb-fd91-43ec-a8e3-002cbd2fe3f3>).

---

## Phase 1 — Stabilise the foundation

Merge-gate work. Land these before PR #8 becomes the baseline. One commit per
task.

### P1.1 — One-pass cold scan · `SW-1`, `DATA-1` · Effort L · Risk med

**Problem.** `scanAndRender` runs `buildSenderSummaries(..., "cleanup")` then
`buildSenderSummaries(..., "security")` back to back. Two candidate lists, two
metadata passes (the shared cache only helps overlap), ~250 `messages.get` @ 20
units on a cold open ≈ 5,000 units against the 5–6k/min ceiling.

**Change.** Collapse to one candidate list + one metadata pass, tagging each
message with which lane(s) want it.

1. `src/lib/providers/gmailProvider.ts` / `outlookProvider.ts`:
   `listCandidateMessages` gains a `purpose: "combined"` mode that ORs the two
   queries — Gmail: `(category:promotions OR category:updates OR in:inbox) newer_than:${windowDays}d`.
   Keep `"cleanup"` / `"security"` for callers that still want a narrow list
   (background triage).
2. `src/lib/senderModel.ts`: `NormalizedMessageStub` / `NormalizedMessageMetadata`
   gain `lanes: ("cleanup" | "security")[]` — set from which sub-query matched
   (Gmail: re-run the classifier locally on `labelIds` — `CATEGORY_PROMOTIONS` /
   `CATEGORY_UPDATES` → cleanup, `INBOX` → security; a message can be both).
3. `buildSenderSummaries` returns `{ cleanup: SenderSummary[]; security: SenderSummary[] }`
   partitioned by lane, from the single fetched set. Deprecate the `purpose`
   param on this entry point (keep `buildSenderSummariesFromStubs` as-is).
4. `dashboard.ts` `scanAndRender`: one call, destructure `{ cleanup, security }`.
   Delete `SECURITY_SCAN_WINDOW_DAYS` / `SECURITY_SCAN_MAX_MESSAGES` (or keep as
   a post-filter cap on the security slice — cheaper than a second fetch).
5. `src/background.ts`: leave its narrow `"cleanup"` / `"security"` calls alone
   (background triage isn't quota-pressured the same way).

**Verify.** New unit test in `senderModel.test.ts`: a fixture message with both
`CATEGORY_PROMOTIONS` and `INBOX` labels lands in both slices; a promo-only
message lands in `cleanup` only. Manually: cold reload-unpack, watch the
quota-ledger console line — one scan window, no `403`.

**Fallback if lane-tagging is too fiddly.** Keep two scans but defer the
security one: `scanAndRender` renders the cleanup surface, then
`requestIdleCallback(() => runSecurityScan())`. Smaller change, still fixes the
"cold open stalls" symptom; doesn't cut total quota.

---

### P1.2 — Per-screen error isolation · `SW-6` · Effort S · Risk low

**Problem.** `scanAndRender` calls ~12 render functions in sequence; one throw
kills the rest and shows a global "couldn't load your mail" over a scan that
actually succeeded.

**Change.** In `dashboard.ts`:

1. Add `function safeRender(name: string, fn: () => void)` — try/catch, on
   error `log.error(name, err)` and write a small `.screen-error` note into that
   screen's root container ("This section didn't load — Reload").
2. Wrap each post-scan render call: `safeRender("overview", () => renderOverview(...))`,
   etc.
3. `showScanError` stays only for a genuine scan-phase throw (the `try` around
   `buildSenderSummaries`).

**Verify.** `dashboard.dom.test.ts`: add a case that stubs `renderSubscriptionsTab`
to throw and asserts Overview + Recently-done still rendered and `#status`
stayed hidden.

---

### P1.3 — Land the action-flow harness · `SW-7` · Effort M · Risk low

**Problem.** The redesign's DOM builders have no tests; `dashboard.dom.test.ts`
is a boot smoke. PR #6 (`test/dashboard-action-flows`) has the harness but
predates the redesign.

**Change.**

1. `git checkout test/dashboard-action-flows`, rebase onto
   `redesign/apple-glass-v3`. Expect conflicts in `testHarness.ts`,
   `*.actions.test.ts` selectors, `docs/testing.md`.
2. Rewrite the harness selectors for the new structure: `#sidebar button[data-screen]`,
   `section.screen`, `.list-row`, `.toolbar`, `.instead-strip`.
3. Re-point / re-write the per-surface tests: `cleanup.actions` → the new plan
   rows + decision rows; `subscriptions.actions` → the grouped-list rows;
   `security.actions` → the threat cards.
4. Add new tests: (a) plan-row "Mute all" opens a confirm and calls the provider;
   (b) decision-row primary button opens the options strip and fires the
   matching group's confirm; (c) `senderTile` renders a monogram when
   `faviconUrl` returns null, and an `<img>` otherwise; (d) the floating bar
   appears when a plan-group checkbox is ticked and clears on "Clear".
5. Land as its own PR merged into the redesign branch (so PR #8's diff shows the
   tests).

**Verify.** Test count up ~25; `npm test` green.

---

### P1.4 — Live protection re-check before bulk delete · `DATA-5` · Effort M · Risk med

**Problem.** `loadMetadataCache` serves mail >7 days old from the warm cache with
its cached `isProtected`. Star an old thread → cache still says unprotected →
bulk "Clean up" trashes it.

**Change.** A cheap label-only re-verify on the actual delete path, not a cache
policy change.

1. `src/lib/providers/emailProvider.ts`: add optional
   `filterUnprotected(token, ids: string[]): Promise<string[]>` — returns the
   subset that is NOT starred/flagged, checked live.
2. `src/lib/gmailApi.ts`: implement via `users.messages.batchGet` with
   `format=minimal` (label ids only, ~5 units for the batch, not 20/message) —
   or `users.messages.get?format=minimal` in a `mapWithConcurrency` for small
   sets. Drop any id whose `labelIds` includes `STARRED`.
3. `src/lib/providers/gmailProvider.ts` / `outlookProvider.ts`: wire it
   (`outlookProvider` → `$select=flag` on a `$batch`).
4. `src/dashboard/dashboard.ts` — in `executeSmartDelete` / the bulk delete
   handlers, and `src/lib/bulkActions.ts` `executeBulkDeleteDomains`: before the
   trash call, `ids = await provider.filterUnprotected?.(token, ids) ?? ids`,
   and if the count dropped, adjust the confirm summary / result string
   ("skipped 2 newly-starred").
5. Do the same in `expiryTriage` cleanup and the never-read / spam trash flows.

**Verify.** `bulkActions.test.ts`: `filterUnprotected` mock removes one id →
that id is not passed to `trashMessages` and the result count reflects it.

---

### P1.5 — Sample honesty · `DATA-1` · Effort S · Risk low

**Problem.** Sampled counts read as inbox totals.

**Change.**

1. `src/lib/senderModel.ts`: `buildSenderSummaries` result carries
   `{ scannedCount, capHit: boolean }` (capHit = candidate list length ===
   `maxMessagesPerProvider`).
2. `dashboard.ts`:
   - `renderOverview` headline already says "Scanned N senders · M messages" —
     keep, and when `capHit`, append " · showing the most recent {max} per
     account".
   - `renderSuggestedMetricBand`: "messages ready to clean up" → "in this scan".
   - `renderCleanupPlan` row subs: append " · counted in this scan" where a
     count leads.
   - `updateNavCounts`: no change (badges are inherently "current").
3. When `capHit`, a one-line `.text-meta` under the Overview headline: "Scan
   window is {N} days, capped at {max} messages — widen in Settings for the full
   picture." Link opens the settings sheet.

**Verify.** `dashboard.dom.test.ts`: fixture with `capHit` → the notice
renders; without → it doesn't.

---

## Phase 2 — Pay down the render architecture

Independent of Phase 1. Do P2.1 (row builder) first — P2.2 and the remnant
rebuilds depend on it.

### P2.1 — Shared `listRow()` builder · `SW-2`, `SW-8` · Effort L · Risk med

**Problem.** Eight bespoke row trees, each setting its grid inline.

**Change.** New `src/dashboard/listRow.ts`:

```ts
interface ListRowSpec {
  selectable?: { checked: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void };
  lead?: HTMLElement; // tile / icon
  title: string;
  titleBadges?: HTMLElement[];
  sub?: string | HTMLElement;
  meta?: HTMLElement; // right-aligned count / engagement bar
  actions?: HTMLElement[]; // primary + ellipsis etc.
  disclosure?: HTMLElement; // full-width strip appended after the row
  href?: () => void; // whole-row click (All senders)
}
export function listRow(spec: ListRowSpec): HTMLElement;
```

- Grid templates become named modifier classes in `dashboard.css`:
  `.list-row--check-media-actions` (22px / 1fr / max-content),
  `.list-row--media-meta-actions` (1fr / 92px / max-content), etc. No inline
  `gridTemplateColumns`.
- `title` element always gets `title={full text}` (fixes `UX-9`).
- Separator handling (`.row-sep.inset`) moves into a `listGroup(rows)` helper
  so callers stop hand-inserting `<div class="row-sep">`.

**Migrate, one call site per commit:** `renderDecisionSenders`,
`renderAllSenders`, `renderCleanupPlan`, subscriptions rows, screener allowlist,
rules rows, recent rows, quarantine rows. Each migration is a pure refactor —
snapshot the rendered `outerHTML` in the dom test before, assert unchanged
after (modulo the new `title` attr).

**Verify.** `listRow.test.ts` (jsdom): each spec permutation renders the
expected structure. Existing dom test still green after each migration.

---

### P2.2 — Per-screen modules on the `state.ts` seam · `SW-3` · Effort L · Risk med

**Problem.** `dashboard.ts` is 2,900 LOC; only 5 tabs were ever extracted.

**Change.** Extract, one module per commit, in this order (least → most
coupled):

1. `src/dashboard/overviewScreen.ts` — `renderOverview` + its helpers
   (`makeCard`, `makeNeedsRow`, the trend, `ICON_*`). Depends only on
   `inboxHealth`, `buildEngagementSuggestions`, `buildExpiryBuckets`,
   `suggestSpamSenders`, `state`.
2. `src/dashboard/allSendersScreen.ts` — `renderAllSenders`, `filteredSenders`,
   `wireAllSendersControls`, `allSenders*` module state.
3. `src/dashboard/suggestedScreen.ts` — `renderSuggestedMetricBand`,
   `renderCleanupPlan`, `renderDecisionSenders`, `buildDecisionRow`,
   `pickDecisionSenders`, `renderSuggestedFloatingBar`, `revealLegacySection`.
   Needs `buildActionGroups` + the `build{Mute,Unsubscribe,KeepSorted,Snooze}Cell`
   builders — extract those into `src/dashboard/senderActions.ts` shared by this
   and All-senders.
4. Leave the bulk-bar handlers, smart views, keep-newest, domain groups in
   `dashboard.ts` for now (the cleanup-core tangle) — they retire in P2.5.

`dashboard.ts` keeps: `main()`, `scanAndRender`, nav wiring, theme, settings
sheet, offline handling, the `setBridge` call.

**Verify.** `dashboard.dom.test.ts` green unchanged (it imports `./dashboard`,
which still runs `main()`). `dashboard.ts` LOC target < 1,000.

---

### P2.3 — Targeted updates · `SW-4` · Effort M · Risk med

**Problem.** A checkbox toggle full-re-renders the list; scroll + focus lost.

**Change.** After P2.1, each row from `listRow` keeps a handle. In
`suggestedScreen.ts` / `subscriptionsTab.ts`:

1. Checkbox `onChange` updates only: the row's own selected class, the
   select-all header's indeterminate/checked state, the count spans, and
   `renderSuggestedFloatingBar()` (which is cheap — it rebuilds one small bar).
   No list rebuild.
2. "Not useful" removes just that row node + calls `saveEngagementFeedback`; no
   `renderDecisionSenders`.
3. Keep full re-render for: a rescan, and structural changes (select-safe
   changing many rows at once — a rebuild is fine there).

**Verify.** `dashboard-action-flows` (from P1.3): after toggling a checkbox,
assert the other rows' DOM nodes are the same object references (not rebuilt),
and `document.activeElement` is unchanged.

---

### P2.4 — Settings dispatcher · `SW-5` · Effort M · Risk med

**Problem.** 20+ `ctx.settings = await updateSettings({...})` call sites; stale
in-memory reads between a module's read and its write.

**Change.** `src/dashboard/state.ts`:

```ts
export async function applySettings(
  mutate: (current: ClusterSettings) => Partial<ClusterSettings>,
): Promise<void> {
  ctx.settings = await mutateSettings((cur) => ({ ...cur, ...mutate(cur) }));
  notifySettingsChanged(); // small pub/sub → screens re-derive counts
}
```

- `mutateSettings` (settingsStore) already reads-fresh under the storage lock —
  `applySettings` just makes every dashboard write go through the read-fresh
  path and refresh `ctx.settings` from the returned value.
- Codemod the 20 call sites: `ctx.settings = await updateSettings({ x })` →
  `await applySettings(() => ({ x }))`. Sites that already use `mutateSettings`
  with a function stay, just routed through `applySettings`.
- `notifySettingsChanged` fan-out: nav counts, the floating bar, any screen
  showing a settings-derived number. Cheap; no full re-render.

**Verify.** `settingsStore.test.ts` unchanged. New `state.test.ts`: two
concurrent `applySettings` calls both land (last-write-wins per key, no lost
update).

---

### P2.5 — Retire the old-design remnants · `§04` · Effort L · Risk low

Each is a self-contained rebuild onto `listRow` / `.grouped-list`.

1. **Never-read & spam "Review" sections** (`dashboard.ts` `renderNeverReadSection`
   / `renderSpamSection`) — replace the `<table>` + `headerRow(...)` with a
   `.grouped-list` of `listRow`s (tile + name + fit/reason + a checkbox). Drop
   `.review-panel`'s need to wrap a table.
2. **Domain groups** (`renderCategoryGroups` / `renderDomainGroups`) — keep the
   `<details>` category grouping but render rows via `listRow`; delete
   `.category-group` table CSS and `ui.ts` `headerRow` / `groupByCategory` once
   nothing else uses them (grep first).
3. **Rule dry-run** (`rulesTab.ts` `renderRuleDryRun`) — the per-impact
   `<details>` bodies become a `.grouped-list`; `<ul><li>` → row + `.text-meta`.
4. **`sortInbox.ts`** (665 LOC) — the biggest. Rebuild the bucket → sender →
   message preview tree with `<details>` + `listRow`; `.setting-toggle` →
   `.check-label`; `.sort-preview-*` classes deleted. Do this last; it's behind
   "More tools" so low urgency, high line count.
5. **`.hint` → `.text-meta` migration** — mechanical `sed` across the tab
   modules once the above stop using `.hint`; then delete the `.hint` alias from
   CSS. Same for `.caveat` / `.recent-detail` if they collapse cleanly.
6. Delete `.provider-badge` from CSS (grep confirms unused).

**Verify.** Visual (reload-unpack "More tools" + a "Review" click). Dom test:
`#domain-group-list` / `#never-read-list` contain `.list-row`, not `table`.

---

## Phase 3 — Finish the visual craft

Independent; can interleave with Phase 2. All CSS-or-small-JS.

### P3.1 — Loading skeletons · `UX-1` · Effort M · Risk low

`dashboard.ts` `main()`: before `scanAndRender`, render a skeleton Overview —
two `.glass-card` shells with `.skeleton` shimmer blocks and a 3-row skeleton
list, into `#overview-content`, and show the `overview` screen immediately.
`scanAndRender` replaces `#overview-content` on success. New `.skeleton` CSS:
a `linear-gradient` sweep keyframe, `@media (prefers-reduced-motion)` → static
`--surface-2` fill.

### P3.2 — Focus on screen switch · `UX-5` · Effort S · Risk low

`selectScreen` (dashboard.ts): after `showScreen`, `screenPanels.find(p => p.dataset.screen === target)?.focus({ preventScroll: true })`.
Screens already have `tabindex` toggled. Add `scroll-margin-top: 72px` on
`.screen` so a focused screen isn't hidden under the sticky header.

### P3.3 — Mobile nav grouping · `UX-3` · Effort M · Risk low

`dashboard.css` `@media (max-width: 900px)`:

- Un-hide `.nav-group-label` in the strip, style as a vertical divider + tiny
  caps label (`writing-mode` or just a short inline label).
- `.sidebar { scroll-snap-type: x proximity }`, `.nav-item { scroll-snap-align: start }`.
- Right-edge affordance: `mask-image: linear-gradient(90deg, #000 85%, transparent)`
  on `.sidebar`, removed once `scrollLeft` is near the end (tiny scroll listener,
  or accept the always-on fade).
- `selectScreen` → active `.nav-item.scrollIntoView({ inline: "center", block: "nearest" })` when the strip is horizontal.

### P3.4 — Trend endpoint by value · `UX-4` · Effort S · Risk low

`renderOverview` trend loop: the last bar gets `.peak` only if
`last >= Math.max(...points) - 3`; otherwise `.on`. Add a 2px baseline tick
(`.trend .now`) under the final bar regardless, so "this week" is still marked.

### P3.5 — Metric-band divider · `UX-2` · Effort S · Risk low

`dashboard.css`: `.metric-band .divider { display: none }` and instead give
`.metric-secondary` group a `border-top: 0.5px solid var(--hairline); padding-top: 14px`
when the band has wrapped — use a container query
(`@container (max-width: 520px)`) or just always show the top border and drop
the vertical rule (simpler, still clean). Update `renderSuggestedMetricBand` /
`subscriptionsTab` to stop emitting the `.divider` span.

### P3.6 — Half-empty two-up · `UX-7` · Effort S · Risk low

`renderOverview`: when "Working while you were away" has no entries, don't append
the wrapper at all (currently appended then `hidden`). `.two-up` with
`repeat(auto-fit, minmax(320px, 1fr))` then collapses the lone Recently-done
card to full width.

### P3.7 — `prefers-contrast` · `UX-11` · Effort S · Risk low

`dashboard.css`:

```css
@media (prefers-contrast: more) {
  :root {
    --glass: var(--glass-solid);
    --hairline: rgba(0, 0, 0, 0.5);
    --label-4: var(--label-2);
  }
  .glass-card,
  .grouped-list,
  .app-header {
    backdrop-filter: none;
    border-width: 1px;
  }
}
```

Repeat the overrides in the dark blocks with the dark `--glass-solid`.

### P3.8 — `z-index` scale · `SW-12` · Effort S · Risk low

`dashboard.css` `:root`: `--z-base: 1; --z-sticky: 20; --z-overlay: 40; --z-toast: 60`.
Replace the literals (header, sidebar, floating-bar, settings-sheet, ambient).

### P3.9 — Theme-stamp dedup · `SW-14` · Effort M · Risk med

`dashboard.ts` `applyTheme`:

```ts
function applyTheme(pref: ClusterSettings["theme"]) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
```

Subscribe once to `matchMedia("(prefers-color-scheme: dark)")` `change` and
re-apply when `pref === "system"`. Then delete the entire
`@media (prefers-color-scheme: dark)` block from `dashboard.css` — only
`:root` (light) + `:root[data-theme="dark"]` remain. **Risk:** the un-stamped
state no longer exists, so verify the dom test (which doesn't set a theme) still
gets a palette — it will, because `applyTheme` runs in `main()` and stamps
`light`. Add an assertion that `documentElement.dataset.theme` is set after boot.

### P3.10 — Monogram flash · `UX-8` · Effort S · Risk low

`senderTile.ts`: keep `.logo-mono` at `opacity: 1` always; the `<img>` is
`opacity: 1` and opaque, layered on top (it covers the monogram when it
paints). On `error`, remove the img — monogram is already visible, no fade.
Drop the `.logo-mono { transition }` and the `has-favicon`
opacity-0 logic.

### P3.11 — Status line gutter · `UX-13` · Effort S · Risk low

Move `#status` inside each `.screen` as the first child (or a single shared
`#status` positioned with the screen's `padding-inline`). Simpler: give
`#status` `padding-inline: clamp(16px, 5vw, 32px)` to match `.screen`.

---

## Phase 4 — Make the data layer earn its confidence

Depends on Phase 1 (P4 changes ride on the one-pass scan). Each is a pure-`lib`
change with unit tests; low UI risk.

### P4.1 — Classification confidence · `DATA-2` · Effort M · Risk med

`src/lib/messageKind.ts`:

- `classifyMessageKind` → returns `{ kind: MessageKind; confidence: "high" | "low" }`.
  Regex hit = high; `List-Unsubscribe` fallback = low; `"other"` = high (we're
  sure it's unclassified).
- New rule: `List-Unsubscribe` → `"newsletter"` **only if** none of the
  transactional regexes matched _and_ the subject has no order/receipt/shipping
  token. Otherwise the transactional kind wins even with the header present.
- Document the precedence order + rationale in the file header.
- `MessageRecord` gains `kindConfidence`.
- `expiryTriage.buildExpiryBuckets`: skip `kindConfidence === "low"` messages
  (don't auto-suggest deletion for a guess).
- `senderModel.addToSenders`: thread the confidence through.

**Verify.** `messageKind.test.ts`: "your receipt has shipped" → `shipping`
high; a plain newsletter with `List-Unsubscribe` → `newsletter` low; a shipping
notice _with_ `List-Unsubscribe` → `shipping` high (not newsletter).

### P4.2 — Personalised retention · `DATA-3`, `DATA-4` · Effort L · Risk med

New `src/lib/retentionModel.ts`:

- `deriveRetentionDays(kind, actionLog): number` — from `actionLog` entries of
  kind `trash` whose summary/undo names this message-kind, compute the median
  `(trashedAt − receivedAt)` in days; clamp to `RETENTION_DAYS[kind] × [0.5, 2]`;
  fall back to the static default with < 5 samples.
- Requires `actionLog` entries to carry enough to attribute a kind — extend
  `ActionLogEntry` with an optional `kinds?: Partial<Record<MessageKind, number>>`
  written by the trash flows (they already know the bucket).
- `expiryTriage.buildExpiryBuckets(senders, retentionDaysByKind)` takes the
  derived map instead of importing `RETENTION_DAYS` directly.
- `DATA-4`: bump `shipping` static default to 90; add a `subject`-only veto —
  a future month name or "arriving"/"estimated delivery"/"out for delivery
  {future date}" holds the message out of the bucket. New
  `retentionModel.hasLiveDeliverySignal(subject): boolean`.

**Verify.** `retentionModel.test.ts`: fixture action log with three
`newsletter` trashes at 40/45/50 days → derived ≈ 45, clamped within
`[15, 60]`; < 5 samples → static 30. `hasLiveDeliverySignal("Arriving Tuesday")`
→ true.

### P4.3 — Domain-level sender identity · `DATA-6` · Effort L · Risk high

**Risk high:** changes the grouping key that most of the UI and `settingsStore`
maps are keyed on.

- Add `senderGroupKey(address): string` = registrable domain, _except_ free-mail
  domains (`gmail.com`, `outlook.com`, …) which stay per-address (a helper list
  already exists in `domainGrouping.ts`).
- `SenderSummary` gains `groupKey` alongside `key`. `addToSenders` still keys
  the `Map` by exact `key` (mute/filter act on the address), but a second pass
  merges same-`groupKey` summaries into a `SenderGroup` for _display_ and for
  the `count ≥ 3` / engagement thresholds.
- `buildEngagementSuggestions`, `pickDecisionSenders`, `renderAllSenders`
  iterate `SenderGroup`s; the per-row action still targets the constituent
  addresses.
- `engagementModel` records: migrate keys? No — keep per-address records, sum
  them at read time by `groupKey`. Avoids a settings migration.

**Verify.** `senderModel.test.ts`: `news@mail1.brand.com` (2 msgs) +
`news@mail2.brand.com` (2 msgs) → one `SenderGroup` with count 4, crosses the
`≥ 3` bar; `a@gmail.com` + `b@gmail.com` stay separate.

### P4.4 — Persist AI kind + loosen engagement cold-start · `DATA-8`, `DATA-9` · Effort M · Risk low

- `src/lib/aiMessageKind.ts`: add a `chrome.storage.local` cache keyed by a
  cheap subject hash → `{ kind, at }`, TTL ~90 days, cap ~2,000 (same shape as
  `metadataCache`). `classifyOtherSubjects` checks the cache first, only calls
  the model for misses, writes results back.
- Wire it so the cached kind is applied on _every_ scan render, not just after
  the button click (the dashboard call site reads the cache and overlays
  `message.kind` for any `"other"` with a hit).
- `engagementModel.buildEngagementSuggestions`: escape hatch
  `messages.length >= 5 && currentRatio === 1` → `>= 0.9`. And seed `samples`
  from within-scan evidence: if `receivedAt` spans ≥ 60 days across ≥ 5
  messages, treat as `samples >= 2` even on a first scan.

**Verify.** `aiMessageKind.test.ts`: second call with the same subjects makes
zero model calls. `engagementModel.test.ts`: a first-scan sender with 6 messages
over 4 months, 24/25 unread → produces a suggestion.

### P4.5 — Wire PR #4's learned engagement model · `DATA-10` · Effort L · Risk high · **gated**

Do not start until there's a beta cohort and P4.1–P4.4 have shipped and been
live-tested. Then follow `research/2026-09-07-engagement-model-v1-design.md`:
refit `globalWeights`, add the settings schema bump for `w_user`, SGD-on-feedback
from the action log, rank the lists by `p`. Keep the deterministic
`buildEngagementSuggestions` as the contract-tested fallback.

---

## Phase 5 — Reach & polish

Independent; pick up any time after Phase 1.

### P5.1 — Health-score breakdown · `DATA-11` · Effort M · Risk low

`inboxHealth.inboxHealthScore` → also return
`contributions: { unreadRatio: number; neverOpened: number; subscriptionLoad: number; expiryBacklog: number }`
(the four penalty terms). `renderOverview` health card: a small expandable
`<details>` showing each term as a mini bar with its week-over-week delta
(from `healthHistory` — needs the history to store the contributions too, so a
schema bump: `HealthSnapshot.contributions`).

### P5.2 — Account switching · `UX-12` · Effort L · Risk med

Header pill → `<button>`; menu with "Use a different Google account" →
`chrome.identity.getAuthToken({ interactive: true, account: {...} })` /
`removeCachedAuthToken` + re-scan. Full multi-account-per-provider (two Gmail
accounts scanned together) stays deferred — `ProviderId` is a closed 2-value
union threaded everywhere.

### P5.3 — Code-split rare screens · `SW-13` · Effort M · Risk low

`wireNav`: on first `selectScreen("rules" | "screener")`, `await import("./rulesTab")`
etc. before rendering. `sortInbox` → dynamic `import()` when "More tools" opens.
Vite splits automatically. Guard against double-import.

### P5.4 — Real logo set · `SW-11` · Effort L · Risk low

Options, cheapest first: (a) a test that validates `BRAND_COLORS` values +
contrast, ship as-is; (b) bundle SVG marks for the top ~200 senders
(`src/lib/data/senderMarks.generated.*`, a refresh script), retire the Google
favicon call and the `networkEgress` exception; (c) a locally-cached favicon
store behind a first-run opt-in. Recommend (a) now, (b) when there's a
maintenance owner.

### P5.5 — CI loads `dist/` · `SW-15` · Effort S · Risk low

`.github/workflows/ci.yml`: after `npm run build`, a step that
`JSON.parse`s every `dist/**/*.json` and runs
`web-ext lint --source-dir dist` (or a small script validating
`dist/manifest.json` shape). Fails on the `managed_schema.json` class of bug.

### P5.6 — Remaining UX notes · `UX-6`, `UX-9`, `UX-10`

- `UX-6`: options strip hides the primary group until the primary button is
  pressed (small change in `buildDecisionRow`).
- `UX-9`: covered by `listRow` always setting `title` (P2.1).
- `UX-10`: `revealLegacySection` → `scrollIntoView({ block: "nearest" })` and
  render the panel adjacent to its plan row (P2.5 rebuild makes this natural).

---

## Suggested commit / PR sequence

| #   | Branch                               | Contents                      | Merges into               |
| --- | ------------------------------------ | ----------------------------- | ------------------------- |
| 1   | `redesign/apple-glass-v3`            | P1.2, P1.5 (small, safe)      | — (already open as PR #8) |
| 2   | `fix/one-pass-scan`                  | P1.1                          | PR #8                     |
| 3   | `fix/bulk-protection-recheck`        | P1.4                          | PR #8                     |
| 4   | rebase `test/dashboard-action-flows` | P1.3                          | PR #8                     |
| —   | **merge PR #8**                      | redesign + Phase 1            | `master`                  |
| 5   | `refactor/list-row`                  | P2.1 + migrations             | `master`                  |
| 6   | `refactor/screen-modules`            | P2.2                          | `master`                  |
| 7   | `refactor/render-updates`            | P2.3, P2.4                    | `master`                  |
| 8   | `chore/retire-remnants`              | P2.5                          | `master`                  |
| 9   | `polish/visual-craft`                | Phase 3 (one commit per task) | `master`                  |
| 10  | `data/classification-retention`      | P4.1, P4.2                    | `master`                  |
| 11  | `data/sender-identity`               | P4.3                          | `master`                  |
| 12  | `data/ai-cache-engagement`           | P4.4                          | `master`                  |
| 13+ | as needed                            | Phase 5 items                 | `master`                  |

Phase 1 is the only hard gate. Everything after can land in any order that keeps
`master` green.
