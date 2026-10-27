# Dashboard plan: fewer things, each one clear

Research: `research/2026-10-27-dashboard-friction.md`. Each track is its own branch and
commits; nothing is pushed until told. Track 0 comes first because the app can't be tested
without it. Tracks 2 to 6 start with a rendered prototype at true size, and the version you
like becomes the base (no redesign each round).

## How the problem is divided

The complaints split into five causes. Fixing them in this order means each step makes the next
one easier to judge.

| Cause | Shows up as | Track |
|---|---|---|
| A. Things that look broken | scan seems stuck at ~850, no progress, PayPal split | 0 |
| B. Too many places | 11 screens + a second Home | 1 |
| C. Too much on each place | 6 Home tiles, 4,000 px lists, 168 controls on Stop mail | 2, 3 |
| D. Blank starts | Rules and Sorting begin with an empty form; New senders one click each | 4, 5 |
| E. Too many words, cheap look | every screen explains itself; thin charts | 6 |

## Track 0: make it testable (no redesign)

- **Scan progress bar**, pinned at the bottom of every screen: "Reading your mail · 3,120 of
  12,400 · about 40 min". Gmail pauses say so. Gone when done.
- **The view updates itself** every ~500 newly read messages and once at the end, without
  jumping the scroll. "Update view" goes away.
- **One row per business.** Group addresses by brand when the mail is authenticated, using
  the existing brand → domains list, so `service@paypal.com`, `paypal@mail.paypal.com` and
  PayPal's marketing domain are one "PayPal". Needs your PayPal addresses to confirm.
- **Top 10, then "Show all"** on Clear out and Stop mail.
- Done when: you can run the live test; a 12,000-message mailbox shows progress throughout.

## Track 1: five places, not eleven

Proposed (decision 1):

| Place | Holds | Was |
|---|---|---|
| Home | the picture + up to 3 next steps | Home, simple Home |
| Senders | every business, one row each; tap for its digest | Senders |
| Clean up | recommendations, then a sorted list; Trash / Unsubscribe / Mute per row | Clear out, Stop mail |
| Organize | preset gallery for rules and sorting | Rules, Sorting |
| Protect | warnings first, then new senders in batches; report inside | Safety, New senders, Scam report |

Activity and Settings move to the account menu.

Done 2026-10-27 (`5e12737`): one panel with the five places, the rail removed, a place's
sub-pages shown only while it is open, Activity and Settings in the account menu. The
sub-pages (Stop mail, Rules, New senders, Scam report) fold into their place in Tracks 3 to 5.

## Track 2: Home, the iPhone Storage way

- One bar: your inbox by Apple Mail's four kinds (decision 2): Primary, Transactions, Updates,
  Promotions. One number above it.
- Up to three recommendations, each one line and one button ("Unsubscribe from 12 you never
  open"). A safety warning, if any, is always first.
- Nothing else. The other five tiles' facts move to the screen they belong to.
- Target: ≤ 40 words, ≤ 5 controls, no scrolling at 1280×800.

Done 2026-10-27: the total (whole inbox, from the security lane) with "+N this week", the
four-kind bar in muted blues with a legend, and up to three cards (scams, Mute senders you never
open, Trash mail past its date, new senders waiting). A card's button opens its place and starts
that place's own confirm, so nothing changes without a second click. The six tiles, the health
ring, "Working while you were away" and "Recently done" are gone (Activity has the history).
Pages are now up to 1320px wide.

## Track 3: lists that end

- Every list is businesses sorted by volume, top 10, "Show all".
- A row: logo, name, one fact ("41 emails · you open none"), one button. Other actions in a
  "⋯" menu.
- Tapping a row opens its digest: addresses, recent subjects, every action.
- Targets: Clean up ≤ 120 words and ≤ 25 controls before "Show all"; no screen over 2
  viewport heights by default.

## Track 4: presets for Organize

- A gallery of 6 to 8 named presets, grouped like Shortcuts: "Codes: delete after 2 days",
  "Receipts: file under Receipts", "Newsletters: archive after a week", "Promotions: trash
  after 30 days", "Mute what you never open", "Social: skip the inbox".
- Tap one: see how many emails it touches now, then "Turn on". Undo in one tap.
- "Make your own" opens today's editor.

## Track 5: decisions in batches (Protect)

Research: `research/2026-10-27-protect-grouping.md`; mockup: Protect in
`research/2026-10-27-home-cleanup-mockup.html`.

- Three tiles as subsections: Likely scams, New senders, Held so far (replaces Scam report).
- Scams in two tiers, "High priority" and "Worth a look"; one row per email, one reason line,
  one button, the rest under ⋯.
- New senders as groups, not rows: "9 you've written to: let in all", "14 businesses you already
  get mail from: let in all", "3 strangers: review". Review is one card at a time with
  Hold / Let in, keyboard ← →.
- Each hold switch sits in its own subsection.

## Track 6: words and look

- A word budget per screen, enforced by a test that counts rendered words and controls (the
  same measurement as the research note). One sentence under a title at most.
- Copy rules already agreed: no over-explaining, no stacked reassurance, no dashes.
- Look: research real design tokens (Apple system colours and type scale, Gmail's Manage
  subscriptions) before changing anything; one accent colour; charts only where there's a
  decision, drawn properly (axis-free bars with labels, consistent sizes).

## Decisions needed

1. The five places above, or keep the current eleven and only declutter each?
2. Apple Mail's four kinds (Primary, Transactions, Updates, Promotions) as Cluster's own
   categories, replacing today's mix (tabs, kinds, "service", "payments")?
3. Start Track 0 now, then prototype Home + Clean up for your approval before Tracks 1 to 3?
4. Your PayPal rows: which addresses appear separately (a screenshot is enough)?
