# Apple-style redesign plan

Research: `research/2026-10-10-apple-style-redesign.md`. Branch: `ui/apple-structure` (from
`ui/copy-trim`). Baseline: 894 tests pass + 26 expected fail.

Rules for every stage: keep element ids (tests and handlers use them), no behaviour change unless
the stage says so, one commit per stage, suite green, checked in the preview harness at 1440 and
390 px in light and dark.

## Stage 1. Visual layer (CSS only)
Moat's redesign tokens at the end of `dashboard.css`: neutral surfaces (`#0a0a0c`/`#161618`,
`#f5f5f7`/`#fff`), Apple font stack, 40 px page titles with a grey 17 px lead, 22 px cards with an
inset hairline, pill buttons, quiet row buttons (no box until hover), neutral nav counts (red only
for scams), no decorative green ticks.

## Stage 2. Header and banners
- One account menu holds the address, Connect Outlook, Rescan, Activity and Settings.
- The label tidy-up banner no longer sits above every page. It shows on Home only.

## Stage 3. Five areas in the sidebar
Two levels, children shown only for the open area (HIG: at most two levels).

| Area | Screens |
|---|---|
| Home | overview |
| Clean up | delete |
| Senders | senders, subscriptions |
| Sorting | organize, rules |
| Safety | impersonation (Scams), screener (New senders), report |

Activity and Settings live in the account menu and the sidebar footer.
"Senders worth a decision" moves from Sorting to Clean up, so Sorting starts with the time limits.

## Stage 4. Home
Weather-style headline sentence that changes with state, two status pills (Safety, Sorting), a
Recommendations list (iPhone Storage style: one line, a count, one button) built from data we
already have: setup, scams to check, new senders waiting, never-opened senders, verified
unsubscribes, label tidy-up. Recently done stays. Health score becomes one line.

## Stage 5. Settings trim
Scan size fields move into a collapsed "Advanced" group.

## Later (not in this pass)
Sender detail pane (split view) replacing per-row buttons on every list.
