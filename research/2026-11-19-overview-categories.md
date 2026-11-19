# Decision A: what Overview's "Mail by category" chart shows (2026-11-19)

## The question

Cluster files mail into 13 Gmail labels, plus 👤 Personal and ✋ Screener. Overview's
"Mail by category" chart doesn't show those labels. It shows four groups borrowed from Apple
Mail, and each label is counted inside one of them:

| Overview group | Labels inside it |
|---|---|
| People | 👤 Personal, plus unlabelled mail that looks like it's from a person |
| Transactions | 🧾 Receipts, 📦 Orders & shipping, 💳 Finance, 🧳 Travel |
| Updates | 🔑 One-time codes, 🔐 Accounts, 📰 Newsletters, 💬 Social, 💼 Work, 🎓 Education, 📋 Jobs |
| Offers | 🏷 Promotions, 🛍 Shopping |

Code: `HOME_KINDS`, `BUCKET_KIND` and `kindOf()` in `src/dashboard/homeDashboard.ts`. The same
four groups also head the Labels page, the Details filter, Ask Kai and the report.

So the user sees **two vocabularies**: four groups on Overview, and 15 labels in Gmail's sidebar.
Decision A asks which one Overview should speak.

## What the research says

- **Apple Mail (iOS 18.2)** uses Primary, Transactions, Updates and Promotions, sorted on the
  device. Its Updates means newsletters, news and social. Many users turned the feature off. The
  usual complaint is "I thought I wasn't getting mail, it was in a category I didn't expect",
  plus misfiled newsletters. ([MacRumors](https://www.macrumors.com/2024/10/23/ios-18-2-mail-app-categories/),
  [MacRumors forum](https://forums.macrumors.com/threads/how-to-turn-off-apple-mail-categories.2454449),
  [Spam Resource](https://www.spamresource.com/2025/02/staying-calm-about-categories-in-apple.html))
- **Gmail's own tabs** are Primary, Social, Promotions, Updates and Forums. **Gmail's "Updates"
  means "confirmations, notifications, statements and reminders"**: receipts and bank statements.
  ([Google Help](https://support.google.com/mail/answer/3094499))
- That's a clash. A Cluster user lives in Gmail. If Overview says "Updates 900" and they click
  Gmail's Updates tab, they find receipts, which Cluster calls Transactions. The word means a
  different thing in each place.
- None of the four group names exists in the Gmail sidebar. A number on Overview can't be checked
  in Gmail, which breaks Rule 2 in `docs/goal-and-plan-2026-11-18.md`: numbers match what Gmail
  really has.
- On the other side, 15 slices is too many for the half-ring chart. Charts stay readable at
  about 5 to 7 categories. Beyond that, a sorted bar list reads better than a ring.

## The options

**1. Labels themselves.** Overview lists labels by count, largest first, as a bar list. It shows
the top 6 and a "12 more" row that opens the Labels page.

```
Mail by label · last 30 days
📰 Newsletters        ████████████  412
🏷 Promotions         ████████      288
🧾 Receipts           █████         174
👤 Personal           ████          140
🔑 One-time codes     ███            96
📦 Orders & shipping  ██             61
12 more labels                       ›
```

- Pro: one vocabulary everywhere. Every number can be checked by clicking the label in Gmail.
- Con: longer, and the "big picture" (how much is marketing) takes a second look.

**2. The four groups (today).** Keep the ring with People, Transactions, Updates and Offers. Tapping a group lists its labels.

- Pro: one glance, and Apple uses the same groups.
- Con: two vocabularies, the Updates clash with Gmail, and no number matches a Gmail label.

**3. Both, labels first (recommended).** Overview shows the bar list from option 1. Each row
carries a small tag for its group (Transactions, Updates, Offers), and the Labels page keeps the
four groups as section headings, where they help scan a long list. Rename **Updates to "News &
alerts"**, so it no longer collides with Gmail's tab.

- Pro: the numbers match Gmail, the big picture is still there, and it's a small change to one
  widget plus one rename.
- Con: a group name shows up in two places, but only as a heading, never as a number.

## Recommendation

Option 3. Overview's job is "show the state of your mailbox", and Gmail is where the user checks
it, so the numbers must use Gmail's words. The groups stay as a way to organise the list.

What it touches: `homeDashboard.ts` (the widget and the `Updates` label), `timeLimitsTab.ts`
(heading text), `detailsPanel.ts` and `askKai.ts` (the group name). Kinds stay the same in code,
so no data changes.
