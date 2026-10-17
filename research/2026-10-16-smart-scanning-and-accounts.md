# Smart scanning and easier account switching

Date: 2026-10-16. Follows `research/reports/Cluster sender algorithm deep dive.md`.

Owner decisions taken into this note:

- History cap is **20,000 messages per account**. Full history is opt-in later.
- **Gmail and Outlook first.** Yahoo comes after (it needs IMAP, so a native helper; parked).
- Stop rescanning. Scan once, then stay in sync.
- Make switching between accounts easy instead of sign out and sign in.

Labels: **[verified]** = checked in code (`path:line`) or a cited source. **[inference]** = my reasoning or
an estimate that needs a live test.

## 1. What scanning looks like today

Cluster has six separate scanners. Each one lists mail and fetches headers on its own. They share
only a 2,000-entry cache, and that cache refetches anything newer than 7 days every time.

| Scanner | When it runs | What it fetches | Where |
|---|---|---|---|
| Dashboard cold open | Every dashboard open | Up to 150 promo/updates/inbox messages from 180 days | `dashboard.ts:571-580`, `senderModel.ts:309` |
| Background clean-up scan | Every 6 hours | Same 150 candidates again | `background.ts:324-331` |
| Background security lane | Every 6 hours | Inbox history since last cursor, or a 100-message rebuild | `background.ts:333-341`, `gmailProvider.ts:96-121` |
| Inbox time limits | **Every 15 minutes** | Lists inbox ids, then reads senders through the cache | `background.ts:68`, `inboxTimeLimitsRunner.ts:41-52` |
| Screener backlog | On demand | Its own candidate list | `screenerBacklog.ts:113-114` |
| Sent correspondents | Weekly | Last 150 sent messages, one get each | `screener.ts:13,35-39`, `gmailApi.ts:416` |

Other facts that shape the cost [verified]:

- One Gmail `messages.get` costs **20 units**. `messages.list` costs **5 units per page of up to 500 ids**. `history.list` costs 2. The per-user limit is 6,000 units a minute. Batching saves round trips, not units.
- So the expensive part is reading headers one message at a time. Listing ids is about 2,000 times cheaper per message.
- Read and starred state drift, so the cache refetches the whole last week on every scan (`metadataCache.ts:27-30`). Gmail history sync watches only new inbox mail, so it can't keep labels fresh (`gmailApi.ts:244-249`).
- Outlook lists only ids, then does one GET per message with attachments expanded (`outlookProvider.ts:82-140`). Graph can return almost every field we need inline on the list call, 999 messages a page.
- Gmail sign-in is `chrome.identity.getAuthToken`, which only ever gives the Chrome profile's main Google account (`gmailApi.ts:56-60`). That is why switching means signing out of Chrome-level identity.

**The core waste:** every scanner starts from nothing, fetches the same recent mail, keeps a
summary in memory, and throws it away.

## 2. The new model: one local index, one sync engine

```
             ┌──────────── Sync engine (one per account) ────────────┐
 Gmail/Graph │ Seed → Sent → Recent → Claim → Deepen → Live (deltas) │
             └───────────────────────────┬────────────────────────────┘
                                         ▼
                    IndexedDB per account: messages, senders, cursors
                                         ▲
     Dashboard · triage · time limits · Screener · rules · scams  (read only, no scanning)
```

Rules:

1. **Only the sync engine talks to the mail API for reading.** Every feature reads the local index.
   Actions (trash, label, filter) still call the API directly.
2. **The dashboard never scans.** It opens instantly from the index and shows "Up to date, 2 min ago"
   or the backfill progress.
3. **After the first build, only changes are fetched.** Gmail `history.list` with all event types,
   Outlook delta per folder.
4. **Learn from headers, count with search.** Fetch headers to learn a sender once. After that, let
   Gmail's own search find, count and select that sender's mail.

## 3. The speed trick: fetch one, count many

Most mail comes from a small number of senders. A bulk sender might have 400 messages in your
mailbox, and Cluster currently pays 20 units for each one to learn the same thing 400 times.

Instead:

1. Fetch headers for one message (20 units). Now we know the sender is `news@shop.com`.
2. Run `messages.list q="from:news@shop.com"` (5 units per 500 ids). Now we have all 400 ids.
3. Mark those ids as claimed by that sender. Never fetch them one by one.
4. Get read, starred, important and category state for all of them from **global label lists**
   (list `is:unread`, `is:starred`, `is:important`, each category once, 5 units per 500 ids)
   and intersect locally.
5. For age, ask Gmail with two or three cheap lists (`from:x newer_than:30d`, `older_than:1y`)
   instead of reading dates one by one.

For actions on old mail, Gmail does the selection: "trash everything from x older than 30 days,
not starred" is one list call with `from:x older_than:30d -is:starred`, then `batchModify`. No
per-message fetch is needed at all.

What still gets full headers, message by message:

- All sent mail (who you write to, names, threads). This is the most valuable data.
- The last 30 days of inbox mail (security needs per-message auth, Reply-To and threading).
- 3 samples per sender, newest first, so kind votes and baselines aren't based on one message.
- Any sender Cluster hasn't met yet.

**Rough cost for a 20,000-message Gmail account** [inference, needs the local census]:

| Approach | Header fetches | Units | Time at 5,500/min |
|---|---|---|---|
| Fetch everything (naive) | 20,000 | 400,000 | ~73 min |
| Fetch one, count many | ~3,000 to 5,000 | ~70,000 to 110,000 | **~13 to 20 min** |

The estimate assumes about 1,500 distinct senders, 2,000 sent and 1,500 recent inbox messages. Real
mailboxes with a few big senders do better. A mailbox where everyone is a person (many tiny senders)
does worse, but then the cap is reached on fewer messages.

The 80M-units-a-day project limit stretches the same way: about 4 to 5 times more first-time setups a
day than the naive approach.

## 4. The order the engine fills the index

Each phase is useful on its own, so the dashboard improves while the backfill runs.

| Phase | Gmail | Outlook | Result for the user | Time (inference) |
|---|---|---|---|---|
| 1 Seed | `getProfile` (historyId), label id lists: SENT, STARRED, IMPORTANT, UNREAD, categories | Folder list, Focused overrides | Counts on Home within seconds | < 1 min |
| 2 Sent | Headers for sent mail, newest first: To, Cc, names, Message-ID, In-Reply-To, References | `sentitems` list, recipients inline | "People you write to" is complete, not 150 messages | 2 to 8 min |
| 3 Recent | Full headers, inbox last 30 days | Inbox list with full `$select`, headers by GET for 30 days | Scams and New senders work fully | 3 to 6 min |
| 4 Claim | One sample per new sender, then `from:` list to claim the rest | Not needed, list is inline | Senders, Subscriptions, Clear out cover the whole mailbox | 5 to 10 min |
| 5 Deepen | 2 more samples per sender until 20,000 messages are covered | Remaining folders to the cap | Better kinds and baselines | background |
| 6 Live | `history.list` every 5 min while open, every 15 min in background. Types: messageAdded, messageDeleted, labelAdded, labelRemoved. No label filter | Delta link per folder (Inbox, Sent, Archive, Cluster folders) | Always current, no rescans | 2 units per check |

Pacing:

- One shared quota ledger per account (`gmailQuotaLedger.ts`). Backfill uses at most **4,000
  units a minute**, which leaves 1,500 for clicks and actions so the dashboard never stalls.
- If Gmail returns a rate-limit 403 or 429, the backfill pauses. User actions don't.
- Work is checkpointed after every page (`durableJobs.ts`). An alarm tick does at most about 4
  minutes of work, under Chrome's 5-minute limit for one event. While the dashboard tab is open
  the page itself can run the engine, which has no time limit.

## 5. What gets stored

IndexedDB, one database per account, under the existing `unlimitedStorage`. Sizes are estimates.

| Store | Key | Holds | Size at 20,000 |
|---|---|---|---|
| `messages` | message id | sender key, threadId, date (when known), label bits, your position (To/Cc), recipient count, auth bits, list bits, kind, fetched yes/no | ~4 to 6 MB |
| `senders` | address key | display names, first/last seen, counts, read/star rates, decayed "matters" counters, signing domains, Reply-To set, kind votes, overrides | ~2 MB |
| `threads` | threadId | participants, whether you replied, last sender | ~1 MB |
| `sync` | singleton | historyId or delta links, phase, page tokens, coverage counts | tiny |

No subjects are stored in full. Kind matching uses a masked template ("Your order #… has shipped").
The four separate "known sender" stores are replaced by `senders`, as the deep-dive report says.

Freshness comes from history events, not refetching. So the 7-day refetch window in
`metadataCache.ts` goes away, and so does the 2,000-entry cap.

## 6. Each existing scanner after the change

| Today | After |
|---|---|
| Dashboard cold-open scan | Reads the index. "Rescan" becomes "Rebuild index" in Advanced settings |
| 6-hour triage cleanup scan | Reads the index after each Live sync |
| 6-hour security lane | Runs on new messages from Live sync only |
| 15-minute time-limits run | Reads inbox ids and kinds from the index. Only `batchModify` calls the API |
| Screener backlog | Index query: senders with no sent history, first seen after the Screener was turned on |
| Weekly sent scan | Gone. Phase 2 plus Live keeps it current |
| Rules | Run on new messages from Live sync. "Apply to existing" uses a Gmail search |

## 7. Outlook gets cheaper too

- List calls carry the fields inline: `from, sender, toRecipients, ccRecipients, replyTo,
  receivedDateTime, isRead, flag, inferenceClassification, conversationId, internetMessageId,
  hasAttachments`, 999 a page. 20,000 messages are about 20 to 40 requests, a minute or two.
- Raw headers (auth results, List-Unsubscribe) still need a GET per message. Do it only for
  the last 30 days and for 3 samples per sender, like Gmail.
- Use `Prefer: IdType="ImmutableId"` so moving mail between folders doesn't change its id.
- First, fix `size` in the `$select` (not a v1.0 property) and use `from` next to `sender`. This
  needs the live test from the deep-dive report.

## 8. Easier account switching

### The problem

Gmail sign-in uses `chrome.identity.getAuthToken`. It only returns the Google account Chrome
itself is signed into, and choosing another account is behind a flag. So a second Gmail
address means changing who Chrome is signed in as. Outlook already uses `launchWebAuthFlow`,
which can pick any account.

### The fix

Move Gmail to the same flow as Outlook: `chrome.identity.launchWebAuthFlow` opening Google's
normal sign-in page with `prompt=select_account`. Then:

- **Add account** opens Google's account picker. Any Gmail address works, whatever Chrome is signed into.
- Each account gets its own token record, its own IndexedDB database and its own sync engine.
- The header shows an **account switcher** (avatar, address, sync status). Switching is instant
  because the other account's index is already on the device.
- Background sync takes turns across accounts. Gmail's per-minute quota is per user, so two
  accounts don't slow each other. They do share the 80M-a-day project limit.
- **Remove account** deletes its local database and revokes its token.
- Later: an "All accounts" Home view that merges counts and the Important strip.

### What needs a spike first

The 10-10 accounts note left one question open, and it decides how smooth this feels:

| Option | How it renews access | Feel | Risk |
|---|---|---|---|
| A. Authorization code + PKCE with refresh token | Silent, for months | Best: sign in once | Google may require a client secret for this client type. Needs a spike |
| B. Token flow, renewed silently with `prompt=none` and `login_hint` | Silent while the user stays signed into that Google account in Chrome | Good: no prompts in normal use | Breaks if the user signs out of Google in the browser. Then one click to reconnect |
| C. Keep `getAuthToken` for the main account, use B for extra accounts | Mixed | Fine | Two code paths |

Recommendation: spike A for a day. If Google refuses without a secret, ship B. It's what most
extensions do, and the reconnect case is one click.

Data and settings currently live in one global settings blob. Moving to per-account data needs a
migration that copies today's data into the first account's database.

## 9. Build order

Each step ships on its own and keeps the suite green.

| Step | What | Why first | Size |
|---|---|---|---|
| 1 | Outlook `size`/`from` live check and fix | May be breaking every Outlook scan today | Small |
| 2 | Capture the headers we throw away (deep-dive rank 1) | The index needs them | Small |
| 3 | IndexedDB index plus sync engine, phases 1 to 3 (Seed, Sent, Recent) | Biggest value early: full sent history, recent mail complete | Medium |
| 4 | Move the dashboard, triage and time limits onto the index | Removes the repeated scans | Medium |
| 5 | Live sync with all history event types and Graph delta | Keeps the index current at 2 units a check | Small to medium |
| 6 | Claim phase ("fetch one, count many") and the 20,000 cap | Full-mailbox coverage at a fraction of the cost | Medium |
| 7 | Account spike (option A vs B) | Decides the sign-in design | Small |
| 8 | Per-account storage, Add account, switcher, Remove account | Ends sign out and sign in | Medium |
| 9 | "All accounts" Home | Nice to have once 8 works | Small |
| Later | Yahoo through a native helper | Owner chose after Gmail and Outlook | Large |

## 10. How we'll know it worked

All measured locally:

- **First open to useful dashboard:** target under 2 minutes (phases 1 to 3), down from 30 to 45 seconds for a 150-message sample that covers under 10% of mail.
- **Full 20,000-message index:** target under 20 minutes on Gmail, under 5 on Outlook.
- **Units spent per day after setup:** target under 5,000 per account (Live sync plus actions).
- **Dashboard open time after setup:** target under 1 second, with zero API reads.
- **Coverage:** share of the mailbox the index knows, shown in Settings.
- **Switching accounts:** one click, no Chrome sign-out.

## Open questions

| Question | Needs |
|---|---|
| How many distinct senders, sent messages and threads does a real 20,000-message mailbox have? | Local census on the owner's mailbox. It sets the real cost of section 3 |
| Does `from:` search match every message from an address, including old ones and aliases? | Live test against counts from fetched headers |
| Does Google issue a refresh token to `launchWebAuthFlow` without a client secret? | Spike |
| Does the `size` select break Outlook today? | Live test |
| Should the backfill run only while the dashboard is open, or also in the background? | Owner decision. Background is slower (alarm ticks) but needs no open tab |
