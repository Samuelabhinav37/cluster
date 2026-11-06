# First scan: read everything, ask above 20,000 (research + plan, 2026-11-06)

Status: plan only, nothing built. Waiting on the user's answers to the open questions.

## What the user asked

- The first scan reads all mail when the mailbox has fewer than 20,000 emails.
- Above 20,000, Cluster counts the emails first and asks: all of them, or the newest 20,000, with a time estimate for each.
- Learn how competitors scan and label, and stay inside Gmail's rules.

## How Cluster does it today

- The first scan reads 180 days (`scanWindowDays: 180`), newest first: 150 emails quickly, then sent mail, then the last 30 days, then older mail.
- It labels as it reads, keeps going in the background, and shows the Overview scan card.
- The index holds up to `MAIL_INDEX_CAP` = 20,000 rows.
- Only Sort inbox → Everything widens the read to all mail (d9597d7).

## Competitors

| Product | How far back | How long | What the user sees |
|---|---|---|---|
| Shortwave | Last 90 days at signup. Full history only on a paid plan. | Full history takes "several hours", and days in the worst case. | Imports in the background, newest first. |
| Leave Me Alone | Last 6 months. | Most scans take a few minutes; big mailboxes take longer. | The user can leave the page. The scan keeps going and notifies them when it's done. Spam and Trash are skipped. |
| SaneBox | Not stated officially. Reviews range from 4–6 weeks of history to 11 years. | Setup takes about 5–10 minutes. Accuracy improves over 1–3 weeks. | Filtering starts within minutes and learns from corrections. |
| Clean Email | The whole mailbox, headers only, building an index. | "Usually quick." A user with 100,000 emails said it took "forever". | A loading step, then the dashboard. |
| Unroll.me | Whole inbox. | Minutes for more than 10,000 emails (an old review). | |
| Mailstrom | Metadata only. | Not stated. | A loading step, then the dashboard. |

Patterns they share:
1. Newest first, with useful results early.
2. Keep working in the background and notify the user when finished.
3. Most limit how far back they go by default. Shortwave charges for full history.
4. Read headers only, never bodies.

No competitor I found asks the user up front with a count and a time estimate. That's an opening for Cluster to be clearer than they are.

## Gmail's rules (as of 2026)

**Rate limits**
- The per-user limit is 6,000 quota units a minute for projects created after 1 May 2026. It used to be 15,000. The per-project limit is 1,200,000 units a minute.
- Going over returns `429` or `403 rateLimitExceeded`. Google asks apps to back off and retry.
- Cluster already paces to 5,500 units a minute (`gmailQuotaLedger.ts`).

**Costs per call**

| Call | Units | What it does |
|---|---|---|
| `messages.get` (metadata) | 20 | reads one email's headers |
| `messages.list` | 5 | lists up to 500 ids |
| `history.list` | 2 | lists changes since last check |
| `getProfile` | 1 | returns the total email count |
| `batchModify` | 50 | changes labels on up to 1,000 emails |

At 5,500 units a minute, Cluster can read about **225 emails a minute**:
- 10,000 emails take about 45 minutes;
- 20,000 take about 1 h 30 min;
- 50,000 take about 3 h 45 min.

**Daily threshold and billing**
- Each project has a daily threshold of **80 million units**. Google has said it will start charging above that later in 2026, with 90 days' notice.
- A full read of 20,000 emails costs about 400,000 units, so roughly 200 such first scans a day stay under the threshold.
- Reading 100,000-email mailboxes in full would cost about 2 million units each. That's the real cost risk as Cluster grows.

**Policy**
- `gmail.modify` is a restricted scope. Going past 100 users needs OAuth verification plus a yearly CASA security assessment.
- Under the Limited Use policy, data must only be used for the user's own features, and Cluster has to disclose what it reads. Cluster keeps the index on the user's computer, which is the easiest position to defend.
- "Not making Google mad" means: stay under the limits, back off when Google says so, read metadata only, use the change feed (`history.list`) instead of re-reading, and label with `batchModify`. These are not workarounds. They are the rules, and Cluster already follows them.

## The key insight: labelling old mail doesn't need reading it

- A Gmail search (`messages.list` with a filter's own query) plus `batchModify` labels thousands of emails for a few hundred units. That's the same thing Gmail's own "also apply filter to matching conversations" does.
- Reading each email (20 units) is only needed for what search can't tell: who the user writes to, how often a sender mails, scams, and Cleanup numbers.
- So every email can get its label within minutes, whatever the mailbox size, while the slow read only builds the index.

## Plan

### Step 1. Count first
- At sign-in, before the read starts, call `getProfile` (1 unit) for `messagesTotal`.
- Subtract Spam and Trash, which come from `labels.get` at about 1 unit each.
- Store the count in the scan state.

### Step 2. Label everything by search (minutes)
- Run `searchLabelInbox` over **all mail**, not just the inbox, for every filter query.
- This covers every email whatever the size, for a few thousand units.

### Step 3. Read, depending on the count
- **Up to 20,000:** read everything. The window is set to all mail and there's no question.
- **Over 20,000:** setup shows one step:
  > You have 48,210 emails.
  > **Newest 20,000** · about 1 h 30 min (Recommended)
  > **All 48,210** · about 3 h 35 min

  The estimate is count ÷ 225 a minute, rounded. After the first few minutes the card switches to the measured rate.
- "Newest 20,000" means the read stops at the cap. Older mail still has its label from Step 2.

### Step 4. What the user sees
- Overview card: "Reading 1,240 of 20,000 · about 1 h 20 min left · 640 labelled".
- The card says the user can close the tab, and a notification arrives when the read is done. Both already exist; only the time-left part is new.

### Step 5. After the first scan
Nothing changes from today:
- Gmail filters label new mail instantly.
- Every 5 minutes the change feed picks up new mail, and labelled mail leaves the inbox after 1 hour.
- One computer does the work.

### Step 6. Tests
- Count → no question at 20,000 or fewer, and the question above 20,000.
- The estimate text.
- The search pass labels archived mail.
- The cap is respected when the user picks "Newest 20,000".

## Open questions for the user

1. **"All" above 20,000.** Reading all of them means raising the 20,000 index cap. That's more disk space and more Gmail quota, about 2 million units for a 100,000-email mailbox. My recommendation: offer "All", cap it at 100,000, and label everything older by search anyway.
2. **Ask during setup, or after?** Asking during setup is one more step. Alternatively, start with the newest 20,000 and ask on the Overview card. My recommendation: ask in setup, because the user wanted to be asked when the count is known.
3. **Search-labelling archived mail.** This puts labels on years of old archived mail in one go. My recommendation: yes. The mail stays archived; only the label is added.
