# Dashboard plan (2026-11-20)

Goal: the Dashboard tells you, at a glance, how your mail is doing compared with before, what Cluster did
for you, what is waiting for you, and gives you the next action in one click.

## Research (Mobbin, web)

| Pattern | Seen in | Why it matters for Cluster |
|---|---|---|
| Action buttons under the greeting | Mercury (Send, Transfer…), Midday, Aboard, Mailchimp "Quick actions" | Today every action is one page away |
| Change vs previous period under each number | Klaviyo ("↗ 420% vs. previous period"), Stripe, Mercury, Base44 | A bare "332" says nothing |
| "Last updated now" stamp | Klaviyo, Stripe ("Updated 10 Sept, 07:00") | Cluster reads in the background; freshness builds trust |
| Calm zero states | Midday ("You're all caught up. Nothing needs your attention"), HoneyBook ("You've approved them all"), Stripe Health ("✓ No alerts") | "In the Screener 0" as a big number reads like a missing value |
| Automations card with Pending and Activity tabs | HoneyBook | Exactly Cluster's job: what waits for you, what it did |
| Recent activity on home | Stripe, Base44 Workflows Activity, incident.io runs (n8n is not on Mobbin) | Cluster's log is hidden in Settings > Diagnostics |
| Metric tabs that switch one chart | Substack, Klaviyo, Searchable, Base44 | Four cards + a chart that only shows "Received" |
| Breakdown as a ranked list with % bars | Mercury "By ledger account" | The gauge is hard to read exactly |
| Equal cards, colour only in data | Stripe, Mercury, Base44, Midday, HoneyBook | Our blue first card reads as "selected" |

## What exists today (read before touching code)

- `src/dashboard/homeDashboard.ts` `renderHomeDashboard`: greeting (dashboard.ts), `metricTiles` (2x2, first `is-hero` blue + sparkles mark, arrow per tile), `inboxCard` (Received Mails chart + Total / Per day / Busiest day), `gaugeChart` "Mail by category", `topSendersCard`.
- Change badges already exist (`tileFoot`): Received vs the same days before (`receivedPrev`), Unread vs a week ago (`unreadWeekAgo`). They hide when the earlier period is 0/unknown; the preview only has 30 days of mail, so they never show there. Screener and Cleanup tiles have no "before" value.
- Data ready for an activity card: `ActionLogEntry` (`src/lib/actionLog.ts`: at, kind, summary, undo) and `RunReport` (`src/lib/runReport.ts`), newest 200 / 20 kept. `filed` and `cleared.byDay` give per-day series.
- "Waiting for you" (`autonomy.ts renderWaiting`, `#overview-waiting`) already lists approvals (Mute / Not now), shown only when non-empty.
- `sweptAt` (last background look at the inbox) exists; `sweepLine` only shows when it is stale.
- Range picker drives Received Mails (8cbb2df); Plan 1.2-1.3 made one range across Overview, Cleanup, Security (83c41a1). Any change keeps one range.
- Your choices on record: the tile style and blue hero came from your reference dashboard (145bcc6), the gauge in shades of blue (145bcc6), top senders with share bars (c946363), Kai with a gutter (0d3a4b2).
- Budgets: dashboard JS 803.8 / 820 KB, CSS 177.0 / 180 KB. CSS has ~3 KB left: step 0 frees room.
- Design rules (memory): one muted colour, bare numbers, verb-only buttons, no page subtitles, no "why" lines, (i) popover for explanations, Apple as reference.

## Steps

Each step: one commit, tests in `homeDashboard.test.ts` (or the file named), preview screenshot at desktop and 375 px, `tsc`, `eslint`, `npm test`, `check:bundle`. No push.

0. **Room.** Delete dead CSS from the onboarding rounds (`.onb-voice`, `.onb-kai-row`, `.ss-feed` leftovers, unused `.lbl-count`); 26 matches to check one by one. Preview seed gets 60 days of mail so change badges show.
1. **Calm zeros.** A tile whose number is 0 shows a muted "–"-free "0" and "✓ All caught up" (Screener) / "✓ Nothing to clear" (Cleanup) in its foot. (Midday, HoneyBook, Stripe Health)
2. **Updated stamp.** Beside the date range: "Updated 2 min ago" from `sweptAt` or the last read; the stale warning stays. (Klaviyo, Stripe)
3. **Action buttons under the greeting.** Up to three, each hidden when its count is 0: "Clean up" (opens Cleanup's confirm via existing `HomeAct`), "Check new senders" (Screener), "Sort now". (Mercury, Midday, Aboard)
4. **Cluster's work card (HoneyBook "Automations").** Two tabs: *Waiting* (moves today's `#overview-waiting` list in) and *Activity* (newest 6 `ActionLogEntry`: time, summary, Undo where `undo` exists). Empty Waiting: "✓ Nothing waiting". "View all" opens Settings > Diagnostics. Placement: see question C.
5. **Change on every tile.** Screener: new senders this range vs before (from the senders index first-seen dates). Cleanup: cleared this range vs before (`cleared.byDay`). Badge wording stays "from the 30 days before".
6. **(Needs your yes) Category list.** "Mail by category" as a ranked list with share bars like Top senders; click opens the kind (same `openKind`). (Mercury)
7. **(Needs your yes) Metric strip drives the chart.** The four tiles become tabs over one chart: Received (`receivedDays`), Unread (`unreadByDay`, 7 days only: falls back to "Last 7 days"), In the Screener, Cleared (`cleared.byDay`). (Substack, Klaviyo)
8. **(Needs your yes) Equal tiles.** Drop the blue hero and its mark; the selected tab (step 7) is the only highlighted one.

Not planned: a separate "Compare" dropdown (Stripe). Badges already compare with the same-length period before; a picker adds a control for little gain.

## Risks

- CSS budget: steps 4, 6 and 7 add CSS; step 0 must land first, and step 6 deletes the gauge CSS.
- Step 4 moves "Waiting for you": `waiting.dom.test.ts` checks `#overview-waiting`; keep the id.
- Step 5 needs first-seen dates per sender; check the senders index has them before building (else drop Screener's badge).
- Step 7 changes how the range picker and the chart talk; Plan 1.6's "every screen agrees" test (61772fd) must still pass.
