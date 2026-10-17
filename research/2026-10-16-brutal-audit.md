# Brutal audit: what is broken, slow and confusing

Date: 2026-10-16. Built from master (e9db356), run in the UI preview (`npm run preview:ui`, new `?big` mailbox of 2,000 messages with five LinkedIn addresses), plus the code. Every number below was measured there unless marked.

## 1. Broken (bugs)

| # | What you see | Cause | Where |
|---|---|---|---|
| B1 | LinkedIn, Facebook, Reddit and Quora never appear on Senders, Clear out or Subscriptions | Mail is split into a "cleanup" lane (Promotions, Updates) and a "security" lane (Inbox). Social-tab mail only gets the security lane, so every clean-up screen skips it. 146 LinkedIn messages were in the index and Senders showed none | `src/lib/providers/gmailProvider.ts:58` `lanesFromLabelIds` |
| B2 | LinkedIn shows as several senders, never as "LinkedIn" | Every screen groups by exact address. LinkedIn sends from at least five (notifications-noreply, jobalerts-noreply, messages-noreply, invitations, editors-noreply). Company grouping exists only behind the Companies filter | `senderListView.ts`, `domainGrouping.ts` |
| B3 | Clear out's "By domain" splits one company into many | It groups by full host: `em.target.com` and `target.com` are separate rows, each with a red "Delete domain…" button | `domainGrouping.ts` |
| B4 | Activity and Settings disappear unless you open Safety | The sidebar is `position: sticky` but stretches to the page height (`align-self: stretch`), so its spacer pushes Activity and Settings to the bottom of the whole page. Measured: sidebar 1,081 px tall in an 819 px window. Safety is long enough that you scroll to them | `dashboard.css:466` |
| B5 | Subscriptions, Rules, New senders and Scam report are hard to find | They are sub-items that only appear after you open their parent | `index.html` nav, `dashboard.css:3278` |
| B6 | "Cluster has found and counted all your mail" appears while most mail is unread | The message fires when the counting search ends, not when reading ends. Measured: shown at 388 of 804 messages read | `dashboard.ts` `showIndexOffer` |
| B7 | Numbers disagree and keep changing | Home said "Clear out 315 emails" while the Clear out badge said 177, later 6. Counts mix census totals, read messages and suggestions, and change as reading continues | `dashboard.ts`, `homeTab.ts` |
| B8 | The connect screen says Cluster never sends email for you | No longer true since unsubscribe by email | `index.html` connect card |

## 2. Slow

Measured on 804 messages in the 180-day window:

| Time | Read | What the screen said |
|---|---|---|
| 15 s | 182 | Finding everyone who emails you: 47 of 804 |
| 15 to 60 s | 182 | Same line, nothing moves |
| 75 s | 388 | "found and counted all your mail" |
| 75 to 120 s | 388 | Nothing moves |
| 135 s | 613 | Same |

**Why.** Cluster spends its own Gmail budget in bursts. It reads about 225 messages in ten seconds, then waits 45 to 60 seconds for the minute to roll over. Effective speed is about 225 messages a minute, so 2,000 messages take at least 9 minutes. Before reading your inbox at all, it reads your whole Sent folder, up to 5,000 messages at the same cost. Your report of 777 in 10 minutes fits a Sent folder of several hundred to a thousand.

**The likely big lever (needs a check in Google Cloud).** Google's quota page says the new limits (20 units per `messages.get`, 6,000 units a minute per user) apply to Cloud projects created on or after 1 May 2026. Projects that used the API between November 2025 and April 2026 keep their earlier quotas. If Cluster's project is one of those, the old costs apply (5 units per read, 250 units a second per user), and Cluster is pacing itself about 12 times slower than it needs to.

Other fixes that don't depend on that:
- Read the inbox before Sent. Who you write to can come from a cheap Sent listing first, with full Sent reads at the end.
- Pace evenly instead of in bursts, so progress never sits still.
- Show progress as "Read 388 of 804", and only say "done" when it is.

## 3. Too many words, too many places

| Screen | Words | Buttons | Height |
|---|---|---|---|
| Clear out | 571 | 110 | 4,092 px (five screens) |
| Senders | 621 | 33 | 2,263 px |
| Sorting | 610 | 9 | 1,379 px |
| Subscriptions | 482 | 81 | 3,021 px |
| Safety | 202 | 12 | 1,061 px |
| Home | 133 | 10 | 1,015 px |

What makes it feel scattered:

- **Eleven destinations in three levels:** Home, Clear out, Senders (Subscriptions), Sorting (Rules), Safety (New senders, Scam report), Activity, Settings.
- **The same jobs are spread over several screens.** Unsubscribe lives on Clear out, Senders, Subscriptions and Home. Mute lives on Clear out, Senders and Home. "Who emails me" is split between Senders, Clear out's sender list and Clear out's domain table.
- **Home leads with chores, not answers.** The first things on Home are "Tidy up Cluster's labels" and "Set Cluster up for you", then two status pills, then four text rows. There are no charts. "Inbox health 51 of 100" sits in grey at the very bottom.
- **Clear out stacks everything at once:**
  - a metric band and a cleanup plan
  - "Senders worth a decision", with a bar of four bulk buttons and a "Snooze for" menu
  - "Keep only each sender's newest mail"
  - a "By domain" table with red Delete buttons
  - "Suggested spam"
- **Sorting is a wall of sentences.** Eleven rows read "Receipts (orders, invoices, payments) stay in your inbox [for 7 days] then move to the 🧾 Receipts label." Each row has a dropdown, and Save is a separate button. Then come Sort my inbox, a collapsed "Which labels, and where the mail goes", "Smart views" (unexplained chips) and a collapsed "More tools".
- **Each Senders row has a long line.** Example: `Opens 70% · 4 a month · still sending · mostly "ups update: package scheduled for delivery tomorrow" ×11 · mcinfo@ups.com`. That's five facts, lowercased, in one line.
- **Reassurance is stacked.** Most screens repeat "Trash keeps it for 30 days", "Starred mail is skipped" and "Undo from Activity", sometimes twice on one screen.

## 4. What the audit says the redesign must do

1. **Fix B1 to B8 first.** They make any design look broken.
2. **Group senders into companies by default** (LinkedIn, Amazon, Target). Expand to addresses only on demand.
3. **Organise around four questions:**
   - What's in my inbox? An overview with charts.
   - What can I get rid of?
   - How should new mail be sorted?
   - Is anything dangerous?

   That makes fewer than six destinations, and every action lives in one place.
4. **Replace sentences with controls.** The time limits could be one compact table or a single slider per category, not eleven sentences.
5. **Make Home a dashboard:**
   - an inbox health score
   - mail by category (Primary, Promotions, Social, Updates)
   - top companies
   - read rate
   - what Cluster can clear

   Each tile has one number, one chart and one action.
6. **Hold copy to one line under each heading,** with no repeated reassurance.

## 5. Tooling added for this audit

`scripts/preview/chrome-stub.js`:

- **`?big`:** a 2,000-message mailbox, with LinkedIn sending from five addresses, plus To, Message-ID, List-Id and DKIM `h=` headers.
- **`sendAs`:** the fake Gmail now answers it.
- **`from:(address)` searches:** fixed. They had matched every message.
- **`?reset`:** now also clears the mail index.
