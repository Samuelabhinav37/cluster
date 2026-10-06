# Cluster: sync efficiency and UI information architecture

_2026-10-05. Branch `feature/inbox-time-limits` at `22ba332` (plus the uncommitted working tree).
Builds on `2026-10-05-inbox-intelligence-research.md` (the "intelligence note"),
`2026-10-05-algorithm-audit-and-upgrades.md` (the "algorithm note") and
`2026-09-06-code-architecture-and-complexity.md` (the "architecture note"). Those cover features,
classifiers, quota costs per method and in-memory complexity. This note covers two things the
user raised: "why are we checking the whole ~3,200 emails each and every time?" and "the UI is
a mess, unorganized, I can't work on it". Research only. No source code was changed._

Conventions, same as the earlier notes:

- **Verified** claims carry an inline link to the source that owns them.
- **(Inference)** marks my own reasoning or design suggestions.
- **Not reached** marks a source I tried and could not read.
- "Via search summary" means I saw the claim in a search result, not on the page itself.
- Code references are `path:line` on this branch.

## TL;DR

1. **Every action re-reads the whole sample.** Each dashboard action ends in `rescan()`, which
   is `scanAndRender()` (`src/dashboard/dashboard.ts:2452`, `:523`). It hides the screens, lists
   every candidate id again and rebuilds every sender summary.
2. **The warm cache cannot hold a 3,200-message sample.** `MAX_ENTRIES = 2000`
   (`src/lib/metadataCache.ts:25`) and it keeps the newest. So the oldest ~1,200 messages are
   evicted on every save and re-fetched on every scan. Mail newer than 7 days is also always
   re-fetched (`metadataCache.ts:30`). (Inference) A warm scan of 3,200 still costs about
   28,000 quota units, which is about 5 minutes at Gmail's 6,000 units/minute per-user limit.
3. **Google's documented pattern is "full sync once, then partial sync via `history.list`".**
   `history.list` costs 2 units and reports `messageAdded`, `messageDeleted`, `labelAdded` and
   `labelRemoved`. A 404 means "do a full sync". Cluster already uses this, but only for new
   inbox mail in the background security lane (`src/lib/gmailApi.ts:235-274`).
4. **Push (`users.watch`) is not a fit.** It needs a Cloud Pub/Sub topic, renewal every 7 days
   and somewhere to receive the push. Cluster has no server. Polling `history.list` on the
   existing 5-minute alarm costs about 576 units a day. (Inference)
5. **Design: a local message index in IndexedDB.** One record per message id with the
   immutable headers plus the mutable `labelIds`. Backfill once, newest first, resumable.
   Then apply history deltas, including label changes, instead of refetching a 7-day window.
   After an action, update the index locally and re-render. No rescan.
6. **Quota after the change:** a dashboard open an hour later costs about 2 to 100 units instead
   of ~28,000. First-time backfill of 3,200 messages stays ~64,000 units (~11 minutes paced),
   but it happens once and the screen is usable after the first few hundred. (Inference)
7. **The UI has 9 sidebar screens, a header with 4 controls, a settings sheet and up to 4
   banners.** The Organize screen alone holds 4 big sections and roughly 50 fixed controls
   before any sender rows.
8. **The same job lives in several places.** "Where does this kind of mail go and for how
   long" is set in 4 places (Sort my inbox, Inbox time limits, Ready to clean up, Rules).
   "Decide about a sender" happens in 5 lists. "Get it out of my inbox for now" has 4 verbs
   (Snooze, Read later, time limits, Screener hold).
9. **Competitors with a clear mental model give each place one job.** HEY splits by kind of
   mail (Imbox, Feed, Paper Trail) plus a Screener. Clean Email puts each tool in its own
   left-nav item and lets you create a rule from any group. Shortwave separates "splits"
   (where mail lives) from "bundles" (how it is grouped).
10. **Proposed IA: 5 areas plus Settings.** 🏠 Today · 🗂 Categories · 👤 Senders · 🧹 Clean up ·
    🛡 Security, with 🕘 Activity in the footer and the gear sheet for Settings. The core change is
    "one list of categories", where each row holds the label, inbox time limit, on/off and filter
    status.

---

## Part 1. Sync and scan efficiency

### 1.1 What happens today (verified from code)

**The dashboard scan.**

- `scanAndRender()` (`dashboard.ts:523-590`) sets the status line, hides `senderGroupsEl`,
  `domainSectionEl` and `expirySectionEl`, and shows "Scanning recent mail… the first run can
  take a minute."
- It loads the warm cache (`dashboard.ts:536`), then calls `buildCombinedSenderSummaries`
  (`src/lib/senderModel.ts:296-353`) with `maxMessagesPerProvider` and
  `SECURITY_SCAN_MAX_MESSAGES = 250` (`dashboard.ts:104`).
- The Gmail query is `(category:promotions OR category:updates OR in:inbox) newer_than:Nd`
  (`src/lib/providers/gmailProvider.ts:45-50`). It is listed up to `maxMessagesPerProvider`
  ids at 500 per page (`gmailApi.ts:163-188`). The security lane is then sliced out of the same
  set (`senderModel.ts:342-345`), so the sample size equals the "Max messages per account"
  setting. (Inference) The user's ~3,200 means that setting was raised from the default 150
  (`src/lib/settingsStore.ts:149`). The input allows up to 5,000 (`index.html`, `max-messages-input`).
- It also runs a risky-attachment `messages.list` (`senderModel.ts:318-331`).
- `fetchAllMetadata` (`senderModel.ts:184-211`) calls `messages.get format=metadata` for every
  id not in the cache, 5 at a time (`senderModel.ts:170`).
- The progress counter increments for cache hits too (`senderModel.ts:201-202`). So
  "1,800/3,200" does not tell the user how many network fetches remain.
- After the fetch it saves the cache, updates engagement, first-contact and health, then
  re-renders all 11 blocks (`dashboard.ts:558-620`).

**Who calls it.** `setBridge({ rescan: scanAndRender, logAction })` (`dashboard.ts:2452`).
Callers after an action:

| Caller | Trigger |
|---|---|
| `sortInbox.ts:595` | Apply a sort |
| `screenerTab.ts:88`, `:270` | Let through / allow-list change, Screener toggle |
| `screenerBacklog.ts:211` | Sort the held mail |
| `recentTab.ts:44`, `:92` | Undo |
| `rulesTab.ts:386` | Apply enabled rules now |
| `dashboard.ts:2617`, `:2717`, `:2809`, `:2904`, `:2937`, `:2983` | Bulk unsubscribe, keep sorted, snooze, never-read accept, expiry clean-up, delete domains |
| `dashboard.ts:2287` | Settings "apply" with `refresh: true` (clears the cache first) |

So one click on "Undo" costs a full scan.

**The warm cache.** `src/lib/metadataCache.ts`:

- Stored as one object under one key in `chrome.storage.local` (`metadataCache.ts:16`, `:76`).
  Every save serialises the whole map (~1.5 KB per entry per the file's own comment, so ~3 MB).
- `MAX_ENTRIES = 2000` (`:25`). On save it sorts by `receivedAt` and keeps the newest 2,000
  (`:70-74`).
- `FRESH_WINDOW_MS = 7 days` (`:30`). On load it drops anything newer than 7 days so label
  state (unread, starred) is re-read (`:44-50`).
- "Rescan" clears it entirely (`:84-90`).

(Inference) With a 3,200 sample the cache is a treadmill. The 1,200 oldest messages are
evicted on every save and re-fetched on every scan. The newest week is re-fetched on every scan
on purpose. The middle ~1,800 are the only real hits.

**Background.** `src/background.ts:60-64`:

- Triage every 6 hours (`TRIAGE_ALARM`). It runs a full cleanup `buildSenderSummaries` over the
  same sample (`background.ts:281-289`), plus the incremental security lane
  (`background.ts:290-298`). Same cache, same treadmill.
- Time limits every 15 minutes (`INBOX_LIMITS_ALARM`, `src/lib/inboxTimeLimitsRunner.ts`). The
  tagger lists `in:inbox newer_than:2d has:nouserlabels` up to 100 ids and reads their metadata
  (`src/lib/inboxTimeLimits.ts:20-21`, `:69-71`). Because the cache drops anything newer than
  7 days, every one of those reads is a cache miss. The sweep lists 2 to 3 queries per category
  (11 categories) and reads up to 300 messages (`inboxTimeLimits.ts:24`, `:131-155`).
- Incremental history exists but is narrow. `listInboxMessageIdsSince` asks only for
  `historyTypes=messageAdded` with `labelId=INBOX` (`gmailApi.ts:243-249`). Label changes,
  deletions and anything outside the inbox are ignored. `gmailProvider.listIncrementalMessages`
  uses it only when `purpose === "security"` (`gmailProvider.ts:95-122`).
- Outlook uses delta for the inbox, but selects only `id`, discards `@removed` entries, and then
  calls `getMessageMetadata` per id (`src/lib/providers/outlookProvider.ts:96-134`, `:136-140`).

### 1.2 What the platforms say

**Gmail sync guide.** Google's [Synchronizing clients with Gmail](https://developers.google.com/workspace/gmail/api/guides/sync)
describes a full sync (list ids, batch `messages.get`, cache, store the latest `historyId`)
followed by partial syncs with `history.list`. It says history records "are typically available
for at least one week and often longer", but the period "might be significantly shorter". If
`startHistoryId` is out of range the API returns 404 and "your client must perform a full sync".
It recommends push notifications to avoid "needless polling".

**`history.list`.** [Reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list):

- History types: `messageAdded`, `messageDeleted`, `labelAdded`, `labelRemoved`.
- `maxResults` default 100, max 500.
- A `historyId` "is typically valid for at least a week, but in some rare circumstances may be
  valid for only a few hours". Invalid ids return 404.
- `labelId` filter: "Only return messages with a label matching the ID."
- Messages in the response "will typically only have `id` and `threadId` fields populated". The
  change arrays (`messagesAdded`, `labelsAdded`, `labelsRemoved`, `messagesDeleted`) carry the detail.

**Quota.** [Usage limits](https://developers.google.com/workspace/gmail/api/reference/quota):
6,000 units per minute per user per project. `messages.get` 20, `messages.list` 5,
`history.list` 2, `messages.batchModify` 50, `getProfile` 1, `watch` 100, `threads.get` 40,
`threads.list` 10, `labels.get` 1. (Cluster's ledger already matches, `gmailApi.ts:30-45`.)

**Batch.** [Batching requests](https://developers.google.com/workspace/gmail/api/guides/batch):
"limited to 100 calls in a single batch request", "recommend sending batches of no more than 50",
and "a set of n requests batched together counts toward your usage limit as n requests". So
batching saves round trips, not quota.

**Partial responses.** [Performance tips](https://developers.google.com/workspace/gmail/api/guides/performance):
the `fields` parameter returns "only the fields you really need", and gzip needs
`Accept-Encoding: gzip`. The intelligence note already recommends a `fields=` mask to drop
`snippet`. It shrinks bytes, not quota.

**`messages.list` vs threads.** `threads.list` costs 10 and `threads.get` 40 (quota page above).
Cluster's unit is the message and its sender. (Inference) Stay on messages. Threads would double
the cost of every read and the sender model would have to split them again.

**Push.** [Push notifications](https://developers.google.com/workspace/gmail/api/guides/push):
needs a Cloud Pub/Sub topic, with publish rights granted to
`gmail-api-push@system.gserviceaccount.com`. "You must call the `watch` method at least once
every 7 days." Each user is limited to "one event per second". Delivery is push (HTTP POST to
your endpoint) or pull (your app polls the subscription). (Inference) Push needs a public
HTTPS endpoint, so a server. Pull would need Pub/Sub credentials in the extension and a Cloud
project the user does not own. Both break the "no server" promise. Polling `history.list` every
5 minutes costs 288 × 2 = 576 units a day, which is negligible.

**Microsoft Graph.** [Delta query for messages](https://learn.microsoft.com/en-us/graph/delta-query-messages):

- Per folder: "Delta query is a per-folder operation."
- Supports `$select`, `$top`, `$expand`. `$filter` only on `receivedDateTime ge/gt`, and with a
  filter it "returns only up to 5,000 messages". No `$search`.
- `changeType=created|updated|deleted` narrows the change type. `Prefer: odata.maxpagesize`
  sets page size.
- Deleted items arrive with `@removed`.

[Delta overview](https://learn.microsoft.com/en-us/graph/delta-query-overview): for Outlook
messages the token lifetime "isn't fixed; it's dependent on the size of the internal delta token
cache". Expired tokens return a 40X such as `syncStateNotFound`, and a `410 Gone` means "restart
with a full synchronization". Replays are possible, so merges must be idempotent.

**Storage.** [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage):
`storage.local` is 10 MB, more with `unlimitedStorage`. [Storage and cookies in extensions](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies):
IndexedDB is available in service workers, and `unlimitedStorage` "affects both extension and
web storage APIs and exempts extensions from both quota restrictions and eviction". Cluster
already has `unlimitedStorage` (`manifest.json`). Without it, [web.dev](https://web.dev/articles/storage-for-the-web)
says an origin "can use up to 60% of the total disk space" and LRU eviction applies.
(Inference) The win from IndexedDB is not size. It is per-record reads and writes instead of
re-serialising a 3 MB object on every save, plus indexes by sender and date.

### 1.3 How competitors sync

| Product | Where the index lives | What is public | Source |
|---|---|---|---|
| Clean Email | Server. Indexes "the envelope and header information"; bodies "never downloaded". Deletes stored metadata 45 days after last login without a subscription. | Help and safety pages | [Is Clean Email safe](https://clean.email/is-clean-email-safe), [Privacy](https://clean.email/privacy) (via search summary) |
| SaneBox | Server. "We 'talk' to your server and identify unimportant emails based on headers." Uses IMAP IDLE (via search summary). | Help center | [How does SaneBox work](https://www.sanebox.com/help/155-how-does-sanebox-work), [Privacy](https://www.sanebox.com/help/412-privacy-and-security-i-don-t-want-sanebox-reading-my-mail) (via search summary) |
| Mailstrom | Server. Reads "only message metadata (sender, subject, date, size)" and groups the whole mailbox. | Marketing pages | [Mailstrom](https://mailstrom.co/email-management) (via search summary) |
| Leave Me Alone | Server scan over a chosen window (1 week, 1 month, 6 months); "doesn't store any email content (unless needed to create Rollups)". | FAQ, alternatives page | [Alternatives](https://alternativeto.net/software/leave-me-alone/about/) (via search summary), [FAQ](https://leavemealone.com/faq/) not read |
| Shortwave | Server. Gmail API plus server-side search (ElasticSearch, vector DB) over the whole history. | Third-party reviews, Firebase post | [Review](https://email-tools.me/posts/shortwave-review/) (via search summary). No first-party engineering post found. |
| Superhuman | Client cache for offline use (CacheStorage, WebSQL, LocalStorage per search summary). | Engineering blog | [Architecting a web app to "just work" offline](https://blog.superhuman.com/architecting-a-web-app-to-just-work-offline-part-1/) **not reached** (ECONNRESET twice); claim via search summary only |
| Simplify Gmail | No API access. Restyles Gmail's own UI. "None of your data is collected, stored, or sent." | Store listing | [Chrome Web Store](https://chromewebstore.google.com/detail/simplify-gmail/pbmlfaiicoikhdbjagjbglnbfcbcojpj?hl=en) (via search summary) |
| Inbox When Ready | No API access. Hides the inbox in Gmail's UI. "Stores no data beyond your preferences." | Privacy page | [Terms & privacy](https://inboxwhenready.org/terms-privacy/) (via search summary) |

(Inference) The cleaners that feel fast keep a whole-mailbox index on a server and update it from
the provider's change feed. The no-server extensions avoid the problem by not reading mail at all.
Cluster sits in between. The client-side equivalent of the server index is a local IndexedDB
index that Superhuman-style apps already use. Nobody public does "re-scan the sample on every
click".

### 1.4 Design for Cluster: a local message index

All of 1.4 is **(Inference)** built on the facts above.

**Record shape** (`messages` object store, key `"gmail:<id>"` / `"outlook:<id>"`):

```
{ key, provider, id, threadId,
  // immutable, read once
  from, displayName, replyTo, subject, listUnsubscribe, listUnsubscribePost,
  authResults[], dkimSignatures[], precedence, autoSubmitted,
  receivedAt, sizeEstimate, hasRiskyAttachment,
  // mutable, kept current by history
  labelIds[], updatedAt,
  // derived, recomputed when the classifier version changes
  kind, bucket, classifierVersion }
```

Indexes: `by_sender` (address), `by_receivedAt`, `by_label` (multiEntry on `labelIds`).
A second store `syncState` holds `{ provider, historyId | deltaLink, backfillPageToken,
backfillDone, lastSyncAt, lastFullReconcileAt }`. ~1.5 KB per record means 10,000 messages is
~15 MB. Fine with `unlimitedStorage`.

**Step 1: backfill, once.**

1. `getProfile` (1 unit). Save `historyId` before listing, as `gmailProvider.ts:104-107`
   already does, so mail that arrives during backfill is replayed.
2. `messages.list` newest first, 500 per page. Persist `pageToken` after each page.
3. `messages.get format=metadata` for each id not already in the index. Write each record as it
   lands.
4. The dashboard renders from whatever is in the index after the first page or two. Backfill
   continues in the background on the jobs alarm, paced by the existing quota ledger.
5. Scope: start with the current query and window, but stop treating "Max messages" as a scan
   size. It becomes "how far back to index".

**Step 2: incremental, every time after.**

- One `history.list` call with `historyTypes` = all four types and no `labelId` filter
  (the current `labelId=INBOX` filter would hide archive and label moves).
- `messagesAdded` → fetch metadata for new ids only (20 each).
- `labelsAdded` / `labelsRemoved` → patch `labelIds` in place. **No fetch.** This replaces the
  7-day `FRESH_WINDOW_MS` refetch entirely. Read, starred, archived, trashed and our own labels
  all arrive this way.
- `messagesDeleted` → delete the record.
- Commit the new `historyId` only after the writes succeed (the pattern in
  `incrementalSync.ts:16-18` already says this).
- Run it on dashboard open, on focus if older than 1 minute, and on the 5-minute jobs alarm.

**Step 3: optimistic local updates after actions.**

- Replace the `rescan` bridge with `applyLocal(mutation)`. A trash, archive, label or unarchive
  call already knows the ids and the label delta. Write that delta to the index, rebuild summaries
  from the index, re-render the affected screen.
- The next `history.list` sees our own change as `labelAdded`/`labelRemoved`. Applying it again
  is a no-op, so it is safe.
- If the API call fails, do not write the delta. Show the error in place.
- Recompute is cheap. The architecture note measured `buildSenderSummariesFromStubs` at about
  25 µs per message, so 3,200 messages is ~80 ms and 10,000 is ~250 ms.
- Unsubscribe and filter creation do not change messages, so they only update settings and
  the affected rows.

**Step 4: recovery.**

- **404 on `history.list`:** do not refetch everything. List ids again (5 units per 500) and fetch
  only ids missing from the index. Then rebuild label state from cheap list queries:
  `in:inbox`, `is:unread`, `is:starred`, `in:trash`, plus one per Cluster label. Each is 5 units
  per 500 ids. Drop index records whose id no longer lists.
- **Daily reconcile** (same list-query trick) as a safety net for missed events.
- **Classifier change:** bump `classifierVersion` and re-derive `kind`/`bucket` locally. No fetch.
- **Outlook:** keep the deltaLink per folder (Inbox first). Handle `@removed` by deleting the
  record. Ask delta for the fields the model needs via `$select`, so updates like `isRead` and
  `flag` arrive without a per-id `get`. On `410` or `syncStateNotFound`, restart that folder's
  delta from scratch. (Whether `internetMessageHeaders` can be selected inside delta is
  untested. Keep the per-id `get` for new messages until a live probe says otherwise.)

**Step 5: everything reads from the index.**

- Dashboard render, the 6-hour triage, the 15-minute time-limits runner and Rules all query the
  index instead of calling `buildSenderSummaries` over the network.
- Time limits: "inbox mail in category X older than the limit" becomes an index query on
  `by_label` + `receivedAt`. The Gmail list queries in `inboxTimeLimits.ts:131-144` can stay as
  a cross-check, but the 300 metadata reads per sweep go away.

### 1.5 Quota math

All rows are **(Inference)** from the costs above. Assumptions: 3,200-message sample; ~30 new
messages a day in the scanned set (~200 in 7 days); 6,000 units/minute ceiling.

| Scenario | Today | With the index |
|---|---|---|
| First ever scan, 3,200 | 7 list pages × 5 + 3,200 × 20 ≈ **64,035 units**, ≥ 10.7 min | Same, once. First screen after ~500 messages ≈ 10,000 units (~1.7 min). |
| Dashboard open, warm | 35 + (1,200 evicted + ~200 fresh) × 20 ≈ **28,000 units**, ~4.7 min | `history.list` 2 + new mail × 20. One hour later with 2 new: **~42 units**. Next morning with 30 new: **~600 units**. |
| One action (e.g. Undo, Apply sort) | Same as a warm open: **~28,000 units**, UI hidden | API call only (`batchModify` 50). **0 extra read units.** |
| 6-hour background triage | Same treadmill: ~28,000 units | `history.list` + new mail: **~200 to 600** |
| 15-minute time-limits run | ~11 × 2–3 lists + up to 100 + 300 reads ≈ up to **8,000 units** | Index query + `batchModify`: **~50 to 100** |
| First ever, 10,000 messages | 20 pages × 5 + 10,000 × 20 ≈ **200,100 units**, ≥ 33 min | Same once, in the background. |
| Lost history (404), 10,000 indexed | Full rescan | 20 pages × 5 + ~6 label lists × ~2–7 pages × 5 + new × 20 ≈ **~300 units** |
| Polling every 5 minutes for a day | n/a | 288 × 2 = **576 units/day** |

### 1.6 What the progress UI should show

(Inference)

- **Never hide the screens to sync.** Render from the index immediately. Today the scan hides
  three containers (`dashboard.ts:525-527`).
- **One quiet status line in the header**, replacing the Rescan pill:
  "Up to date · checked 2 min ago" or "Updating · 3 new, 12 changed".
- **Backfill gets its own line**, only while it runs: "Indexing your mailbox · 1,240 of 3,200 ·
  first time only. You can use Cluster while this runs." Count network fetches only. Show a
  time estimate from the ledger's pace (6,000 units/minute ≈ 300 messages/minute).
- **Counts that depend on coverage say so.** "Based on 1,240 of 3,200 messages so far."
- **"Rebuild index"** moves into Settings as a maintenance action. It is a recovery tool, not a
  daily button.

---

## Part 2. UI information architecture

### 2.1 Current UI inventory (verified from `src/dashboard/index.html` and renderers)

**Chrome around every screen.**

| Area | Items |
|---|---|
| Header | Brand · account pill · **Connect Outlook** · **Rescan** · ⚙ Settings sheet |
| Settings sheet | Scan window (days) · Max messages per account · Theme · Fast permanent delete |
| Sidebar | Overview · _Clean up:_ Delete, Organize, Subscriptions, Phishing · _More:_ All senders, Rules, Screener, Recently done · privacy note |
| Banners above every screen | Status line · onboarding "Got it" · label tidy-up (`labelTidy.ts`) · Athena (managed installs) · connect gate (first run) |

**Screens.** Control counts are approximate fixed controls, then per-row controls.

| Screen | Sections and cards | Controls (approx.) |
|---|---|---|
| **Overview** (`renderOverview`, `dashboard.ts:747`) | Cap note · cleanup-plan hero (total + **Start cleanup** + Review suggestions + "N senders worth a decision" link) · health score + 12-week trend · "Needs a person" list · "Working while you were away" · "Recently done" (latest with Undo) + Full history | ~5 + Undo per entry |
| **Delete** | Metric band · **Your cleanup plan** (never opened, expired, spam groups; include + Review) · hidden legacy panels opened by Review: Personalized cleanup suggestions (**Mute suggested…**, **Trash suggested…**), Suggested spam (Select all, Trash selected), **Ready to clean up** (Clean up) · **Trim to newest** disclosure (N, Trim) · **By domain** (Select safe, Delete selected domains, per-domain checkbox) · floating bar | ~12 fixed + 1–2 per plan row + 1 per domain |
| **Organize** | **Senders worth a decision** (select all, per row: checkbox, primary action, Options → Unsubscribe / Keep sorted / Mute / Snooze, Not useful, Load 25 more; bulk bar: Select safe, Bulk unsubscribe, Bulk keep sorted, Snooze-for select, Bulk snooze) · **Inbox time limits** (toggle, 11 category selects, Save, Apply to mail already in my inbox…, backlog card) · **Sort my inbox** (button, config disclosure with 11 × include + keep-in-inbox checkboxes, Keep doing this for new mail, Trash codes after 2 days, seed card Reuse/Skip, preview with per-sender move select, Apply) · **Smart views** (5 chips + result actions) · **More tools** (Digest, Classify ambiguous mail) | ~50 fixed + ~4 per sender row (25 rows ≈ 100) |
| **All senders** | Search · filter: All / Never opened / Subscriptions / Muted · rows with the same action groups | 5 fixed + ~4 per row |
| **Subscriptions** | **Paid subscriptions & trials** (awareness only) · **Newsletters** (Unsubscribe all verified one-click, Outcome filter with 5 options; per row: Unsubscribe / Email / Open page, Unsubscribe + clean…, Read later…, Keep) · floating bar | ~2 fixed + ~4 per row |
| **Phishing** | Auto-quarantine toggle · Quarantine review (Confirm, Release) · sender cards (Block sender, This is genuinely them, Deep scan) · caveats | 1 fixed + 3 per card |
| **Rules** | NL composer (input, example chips, Draft, Save draft) · rules list (Edit, Delete) · dry-run preview · **Customize manually** (14 fields + Add rule) · **Apply enabled rules now** | ~22 fixed + 2 per rule |
| **Screener** | Toggle · backlog card (sort held mail, Start over) · queue (Let through / Block / Keep screening) · Always allow (Remove) | 1–3 fixed + 3 per sender |
| **Recently done** | Full log with Undo · last background sweep line | 1 per entry |

### 2.2 Duplication and confusing names

(Verified locations; the judgement that they confuse is **Inference** unless cited.)

**A. "Where does this kind of mail go, and for how long" is set in four places.**

| Place | What it sets | Settings it writes |
|---|---|---|
| Organize → Sort my inbox → config | Which categories, keep in inbox or file out, keep doing it, trash codes after 2 days | `autoSort.enabledBuckets`, `fileOutByBucket`, `keepSorting`, `expireOtp` (`settingsStore.ts:72-81`) |
| Organize → Inbox time limits | Hours each category stays in the inbox | `autoSort.timeLimitsEnabled`, `inboxHoursByBucket` (`settingsStore.ts:93-96`) |
| Delete → Ready to clean up | Hard-coded retention: codes 2 days, newsletters 30, social 30 | `retentionPolicy.ts` (no UI) |
| Rules | Any kind + older-than + action | `rules` |

Two filter systems back them: `serverSort.ts` (`filterIdsByBucket`) and `categoryFilters.ts`
(`filterSpecByBucket`). Smart views add a fifth entry point for codes and shipping.

**B. "Decide about a sender" happens in five lists.** Organize (Senders worth a decision), All
senders, Subscriptions (Newsletters), Delete (never-opened group with Mute suggested), Screener
queue. Unsubscribe appears in three, Mute in three, Keep sorted in two.

**C. Three standing "from:" filters that look alike.** Keep sorted (skip inbox into a category
label, `dashboard.ts:2017-2040`), Mute (skip inbox into Muted), Screener block. The user sees
three verbs for one mechanism.

**D. Four ways to get mail out of the inbox for now.** Snooze (resurfaces), Read later (label),
time limits (moves after N hours), Screener hold.

**E. Deleting lives in six places.** Delete screen (plan, spam, expiry, trim, by domain),
Subscriptions "Unsubscribe + clean", Smart views (older than 1 year, large), Rules (trash),
Phishing "Block sender", Never-read "Trash suggested".

**F. Names.**

- "Delete" moves to Trash, and "Organize" says "Nothing here deletes anything". Users must learn
  the split by verb.
- "Clean up" is a nav group, "Your cleanup plan" a section, "Ready to clean up" another section,
  "Start cleanup" a button, and "Clean up" a button. Five uses of one phrase.
- "Sort my inbox", "Keep sorted", "Keep doing this for new mail" and "Inbox time limits" all
  describe filing. Their differences are not visible in the names.
- Phishing is under the "Clean up" group. The algorithm note and
  `2026-09-18-phishing-security-ux-separation.md` both argue security needs its own surface.
- The screen id is `impersonation`, the label is "Phishing", the Gmail label is "Possible Phishing".
- "All senders" is under "More", but it is the most complete sender list.
- "Rescan" is a primary header pill but is the most expensive button in the product (Part 1).
- Settings exposes "Max messages per account", an implementation detail.

**G. Global banners stack above every screen.** Onboarding, label tidy-up, Athena and the status
line can all show at once, before the screen's own content.

NN/g's guidance on [information scent](https://www.nngroup.com/articles/information-scent/) is
that labels should be "clear and self-explanatory" and "a succinct yet accurate description of
what the page is about". The overlapping names above give weak, competing scent. (Inference)

### 2.3 How competitors organise the same jobs

| Product | Top-level structure | The one idea worth copying | Source |
|---|---|---|---|
| **HEY** | Imbox · The Feed · Paper Trail · Screener · Set Aside · Reply Later | Split by **kind of mail**, not by tool. Imbox is "important, immediate emails"; The Feed "shows all of your newsletters"; Paper Trail holds "receipts, confirmations, and transactional emails". Screener History lets you "screen them back in". | [HEY features](https://www.hey.com/features/), [The Screener](https://www.hey.com/features/the-screener/) |
| **Clean Email** | Left nav: Smart Folders, Auto Clean, Screener, Unsubscriber, Cleaning Suggestions, Read Later, Sender Settings, Privacy Monitor… | Any group → **Create Rule** in place: "When you select a message group in any Smart Folder, the action bar… includes the Create Rule action button." Auto Clean has one master toggle. | [Help center](https://clean.email/help), [Auto Clean](https://clean.email/help/auto-clean/overview) |
| **SaneBox** | Folders in your own mail client: @SaneLater, @SaneBlackHole, @SaneNoReplies + daily Digest | Training is **moving mail**: "Moving an email back to your Inbox 'retrains' SaneBox." No dashboard needed for the daily job. | [How SaneBox works](https://www.sanebox.com/help/155-how-does-sanebox-work), [Sane folders](https://www.sanebox.com/help/138-beyond-sanelater-more-sane-folder-choices) (via search summary) |
| **Leave Me Alone** | Subscriptions list + Rollups | Rollups move chosen subscriptions to a folder and send one digest "daily or weekly", up to 10 rollups. | [Rollups](https://leavemealone.com/blog/new-feature-rollups/) (via search summary) |
| **Shortwave** | Splits (tabs) + Bundles (grouped rows) | Two separate concepts: Splits divide the inbox into tabs, Bundles "condense multiple emails into just one compact line". "Designed to enhance each other – not replace each other." | [Bundles](https://www.shortwave.com/docs/guides/bundles/), [Splits](https://www.shortwave.com/blog/split-email-inbox-by-importance/) (via search summary) |
| **Superhuman** | Split Inbox + Auto Labels, both configured from libraries in Settings | Category definitions live in one **library** in Settings. Daily screens stay clean. | [Custom Split Inbox](https://help.superhuman.com/hc/en-us/articles/46005636204941-Custom-Split-Inbox), [Auto Labels](https://help.superhuman.com/hc/en-us/articles/40127432866323-Auto-Labels) (via search summary; the algorithm note hit 403 on direct fetch) |
| **Gmail** | More → **Manage subscriptions**: senders sorted by frequency with a count and Unsubscribe | One list, one count, one button per row. | [Gmail Help](https://support.google.com/mail/answer/15621070?hl=en&co=GENIE.Platform%3DDesktop) |
| **Apple Mail** | Primary · Transactions · Updates · Promotions. Per-sender "Categorize Sender". Time-sensitive mail also shows in Primary. | Four fixed categories and one per-sender override. | [Apple Support](https://support.apple.com/guide/iphone/use-categories-iphfe4a36baf/ios) (via search summary) |
| **Outlook** | Focused / Other; **Sweep** per sender: delete all from sender, "keep only the latest", or delete older than 10 days | Per-sender retention is one sheet off the message. | [Sweep](https://support.microsoft.com/en-us/office/organize-your-inbox-with-archive-sweep-and-other-tools-in-outlook-on-the-web-49b26f63-6399-4b4a-a580-14b9b1efe96d), [Focused Inbox](https://support.microsoft.com/en-us/outlook/mail/focused-inbox-for-outlook) (via search summary) |

**UX guidance.**

- NN/g, [Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/):
  show "only a few" important options first, "disclose everything that users frequently need up
  front", and avoid going past two levels because "users often get lost when moving between the
  levels".
- NN/g, [8 guidelines for complex applications](https://www.nngroup.com/articles/complex-application-design/):
  "Reduce clutter without reducing capability" through "staged disclosure, where options are
  shown to the user only when they are relevant"; help users "keep a record of their actions"
  (an activity log); let users see supplemental information "without leaving the primary
  screen" (a side sheet, not a new screen).
- Chrome, [Side panel launch post](https://developer.chrome.com/blog/extension-side-panel-launch)
  (via search summary): follow the single-purpose policy and help users "accomplish tasks with as
  little distraction as possible".

(Inference) The pattern across all of them: **one place per kind of mail, one place per
sender, one place for one-off clean-up, and configuration of categories in a single list.**
None of them asks the user to configure the same category on two screens.

### 2.4 Proposed information architecture

Everything in 2.4 is **(Inference)**. Visual design stays as is: Apple-glass cards, grouped
lists, emoji category labels, the existing sidebar shell. This changes structure and names only.

**Top-level areas (5, plus Activity and Settings).**

| Area | One job | Question it answers |
|---|---|---|
| 🏠 **Today** | What needs me now | "Anything to do, and what did Cluster do while I was away?" |
| 🗂 **Categories** | Where each kind of mail goes, and for how long | "What happens to codes, receipts, newsletters…?" |
| 👤 **Senders** | Decide about a sender once | "What do I want from this sender?" |
| 🧹 **Clean up** | Clear out mail that is already there | "What can I remove right now?" |
| 🛡 **Security** | Suspicious mail, separate from tidying | "Is anything dangerous?" |
| 🕘 Activity (sidebar footer) | History and undo | "What changed, and can I put it back?" |
| ⚙ Settings (sheet) | Account, sync, appearance, advanced | Things set once |

**The "one list of categories" model.** One settings object per category replaces
`enabledBuckets`, `fileOutByBucket`, `keepSorting`, `expireOtp`, `timeLimitsEnabled` and
`inboxHoursByBucket`:

```
category: {
  bucket,            // otp, receipt, shipping, newsletter, social, promotions, shopping, …
  label,             // "🔑 One-time codes" (user may rename / reuse own label)
  on,                // label new mail in this category
  inboxFor,          // 0 = straight to label, N hours, null = stays in inbox
  thenAfter,         // null = keep forever, N days = move to Trash (opt-in, codes default 1–2 d)
  filter: { status: "active" | "client-only" | "error", id? }   // shown as a small pill
}
```

Each row shows: emoji label · on/off · "Stays in inbox for [select]" · "Then [keep | trash after N
days]" · count now in the inbox · filter status pill ("Gmail filter ✓" or "Sorted while Chrome is
open"). One **Save** for the whole list. One "Apply to mail already in my inbox" action at the
bottom. Retention from `retentionPolicy.ts` becomes the default `thenAfter` per row, visible
and editable, instead of hidden. Custom rules move to a collapsed **Advanced: custom rules**
section at the bottom of this screen, because a rule is a hand-written category.

**The one sender sheet.** Any sender row anywhere opens the same side sheet:

```
Groupon  deals@groupon.com · 214 messages · 0% opened · 🛍 Shopping
  Future mail:  ( ) Inbox   (•) 🛍 Shopping   ( ) Muted   ( ) Blocked
  Unsubscribe:  [Unsubscribe]  verified one-click
  Existing mail: [Move to Trash…]  [Keep newest 3…]
  Why: newsletter header, never opened, 30/week
```

"Future mail" folds Keep sorted, Mute, Screener allow/block and the per-sender sort override
into one radio group backed by one filter. Snooze stays as a small "Hide for…" link.

**Mapping old → new.**

| Old place | New home | Note |
|---|---|---|
| Overview hero, health, "Needs a person", "Working while you were away" | 🏠 Today | Health score shrinks to a single line |
| Overview "Recently done" mini list | 🏠 Today (last 3) → 🕘 Activity | |
| Delete → Your cleanup plan | 🧹 Clean up (top) | |
| Delete → Never opened (Mute suggested / Trash suggested) | 🧹 Clean up for Trash · 👤 Senders "Never opened" chip for Mute | Ends "Mute on the Delete screen" (walkthrough note 1.6) |
| Delete → Suggested spam | 🧹 Clean up | Security-grade domains also surface in 🛡 |
| Delete → Ready to clean up (expiry) | 🧹 Clean up as one-off · 🗂 Categories `thenAfter` as standing | |
| Delete → Trim to newest | 👤 sender sheet "Keep newest N" · bulk in 🧹 | |
| Delete → By domain | 🧹 Clean up, "Group by domain" toggle | |
| Organize → Senders worth a decision | 👤 Senders, default chip "Needs a decision" | |
| Organize → bulk Unsubscribe / Keep sorted / Snooze | 👤 Senders bulk bar | One bar |
| Organize → Inbox time limits | 🗂 Categories (the list itself) | Merged |
| Organize → Sort my inbox (+ config, keep sorting, trash codes) | 🗂 Categories: list + "Apply to mail already in my inbox" | Merged. Preview stays |
| Organize → Smart views: codes, shipping | 🗂 Categories (category counts) | Removed as views |
| Organize → Smart views: older than 1 year, > 2 MB, promotions | 🧹 Clean up filters | |
| Organize → More tools: Digest | 🏠 Today, "Summarise" link | |
| Organize → More tools: Classify ambiguous | ⚙ Settings → Advanced (on/off, then automatic) | |
| All senders (search, filters, Muted) | 👤 Senders (search + chips: Needs a decision · Newsletters · Never opened · New · Muted · Blocked · All) | |
| Subscriptions → Newsletters | 👤 Senders "Newsletters" chip + "Unsubscribe all verified" | Gmail does the same in one list |
| Subscriptions → Unsubscribe + clean / Read later | 👤 sender sheet (Unsubscribe, then Existing mail) · Read later becomes a category | |
| Subscriptions → Paid subscriptions & trials | 🏠 Today card when a renewal is near · 👤 "Paid" chip | Awareness only, as now |
| Phishing (all) | 🛡 Security | Out of the Clean up group |
| Phishing → Block sender | 🛡 card + 👤 sheet "Blocked" (standing filter, per intelligence note) | |
| Screener toggle + queue | 👤 Senders "New" chip with the toggle at its top · 🏠 Today "3 new senders waiting" | HEY-style first-contact decision |
| Screener backlog card | 👤 "New" chip, shown when the held label is non-empty | |
| Screener → Always allow | 👤 sender sheet "Future mail: Inbox" + "Allowed" in All | |
| Rules | 🗂 Categories → Advanced: custom rules (collapsed) | NL composer stays first |
| Recently done | 🕘 Activity | Plus background runs (time limits, quarantine, rules) |
| Header Rescan | Header sync status line · ⚙ Settings → Rebuild index | |
| Header Connect Outlook | ⚙ Settings → Accounts | |
| Settings: scan window, max messages | ⚙ Settings → Sync: "Index mail from the last [N] months" | |
| Settings: theme, fast delete | ⚙ Settings (unchanged) | |
| Label tidy-up banner | ⚙ Settings → Maintenance, plus a one-time Today card | Off the global banner stack |
| Athena banner | ⚙ Settings → Organisation (managed only) | |
| Onboarding banner | First-run flow | |

**Where security lives.** Its own sidebar item, set apart below the others with a separator, and
a red count only for high-risk items. A high-risk finding also appears as the first card on
Today, never mixed into clean-up lists. That follows the separation note
(`2026-09-18-phishing-security-ux-separation.md`).

**Where history and undo live.** Every action shows an inline toast with Undo (existing
`recentTab.ts` undo). The full log is 🕘 Activity, which also lists background runs ("Time
limits moved 12 messages · Undo"). Today shows the last three.

**First-run flow** (staged disclosure, three steps):

1. **Connect** (current connect gate, unchanged copy).
2. **Indexing** starts. Today appears at once with "Indexing · 400 of 3,200 · keep going".
3. **Pick a starting setup** for Categories, a single card with three presets:
   "Just label things" (all categories on, everything stays in inbox) · "Calm inbox" (codes,
   promotions, newsletters leave after 1 day) · "Custom". Then land on Today.
   Screener and Security auto-quarantine stay off until the user opens them.

**What moves into Settings.** Accounts (Gmail, Outlook), Sync (index depth, status, Rebuild
index), Appearance (theme), Deleting (fast permanent delete), Advanced (AI classify, digest
model), Maintenance (label tidy-up), Organisation (Athena, managed only).

**Wireframes.**

Shell and Today:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⬡ Cluster                     Up to date · 2 min ago   (SA) sam@…   ⚙    │
├──────────────┬───────────────────────────────────────────────────────────┤
│ 🏠 Today     │ Today                                                     │
│ 🗂 Categories│ ┌───────────────────────────────────────────────────────┐ │
│ 👤 Senders  3│ │ 🛡 1 message looks like phishing          [Review]    │ │
│ 🧹 Clean up  │ └───────────────────────────────────────────────────────┘ │
│ ──────────── │ ┌─ Waiting for you ─────────────────────────────────────┐ │
│ 🛡 Security 1│ │ 👤 3 new senders to screen                   [Open]   │ │
│              │ │ 🧹 412 messages ready to clear               [Review] │ │
│              │ │ 💳 Netflix renews in 3 days                  [View]   │ │
│              │ └───────────────────────────────────────────────────────┘ │
│              │ ┌─ While you were away ─────────────────────────────────┐ │
│              │ │ Time limits filed 38 messages             [Undo]      │ │
│ 🕘 Activity  │ │ Unsubscribed from 4 lists                  [View]      │ │
│ privacy note │ └───────────────────────────────────────────────────────┘ │
└──────────────┴───────────────────────────────────────────────────────────┘
```

Categories:

```
Categories                                                       [Save]
How long each kind of mail stays in your inbox, and what happens next.
┌──────────────────────────────────────────────────────────────────────┐
│ On  Category          In inbox for      Then              Now  Filter│
│ [✓] 🔑 One-time codes  [1 hour      ▾]  [Trash after 2d▾]  6   ✓ Gmail│
│ [✓] 🧾 Receipts        [Stays       ▾]  [Keep          ▾]  14  ✓ Gmail│
│ [✓] 📦 Shipping        [1 day       ▾]  [Keep          ▾]  9   ✓ Gmail│
│ [✓] 📰 Newsletters     [Straight to ▾]  [Keep          ▾]  0   ✓ Gmail│
│ [ ] 🏷 Promotions      [—           ▾]  [—             ▾]  52  off    │
│ …                                                                    │
└──────────────────────────────────────────────────────────────────────┘
[Apply to mail already in my inbox…]   Last run 4 min ago · moved 12
▸ Advanced: custom rules (2)
```

Senders with the sheet:

```
Senders   [Search senders…]
(Needs a decision 24) (Newsletters 61) (Never opened 18) (New 3) (Muted) (All)
┌────────────────────────────────────────┐ ┌───────────────────────────────┐
│ [ ] 🟦 Groupon      214 · 0% opened  › │ │ Groupon                       │
│ [ ] 🟥 Medium       88 · 4% opened   › │ │ Future mail                   │
│ [ ] 🟩 Duolingo     61 · 0% opened   › │ │ ( ) Inbox (•) 🛍 Shopping       │
│ …                                      │ │ ( ) Muted ( ) Blocked         │
│ 2 selected: [Unsubscribe] [Send to ▾]  │ │ [Unsubscribe] verified        │
└────────────────────────────────────────┘ │ Existing: [Trash…] [Keep 3…]  │
                                           │ Why: never opened, 30/week    │
                                           └───────────────────────────────┘
```

Clean up:

```
Clean up                                      Everything here ends in Trash.
┌─ Suggested ─────────────────────────────────────────────── [Review all] ┐
│ [✓] 18 senders you never open · 640 messages                   [Review] │
│ [✓] 212 expired codes and old newsletters                      [Review] │
│ [✓] 6 senders on a spam list · 40 messages                     [Review] │
└─────────────────────────────────────────────────────────────────────────┘
Find more:  (Older than 1 year) (Larger than 2 MB) (Promotions) (By domain)
```

Control budget per screen (target): Today ≤ 6 · Categories one row per category + 3 ·
Senders 1 primary per row + the sheet · Clean up 1 per suggestion + 4 filters · Security ≤ 3 per
card. That keeps each screen to one primary action per item, which the
decision-fatigue note (`2026-09-09-competitor-ux-decision-fatigue-patterns.md`) already argued for.

---

## Part 3. Phased implementation order

Effort: S ≤ 2 days, M ≤ 1 week, L > 1 week. **(Inference)** throughout.

### Phase A: stop rescanning (do first; it fixes the felt slowness)

| # | Step | Effort | Files |
|---|---|---|---|
| A1 | **Optimistic local apply.** Replace `rescan()` after actions with a local delta on the in-memory metadata + re-render. Keep a real sync only on open. Works even before IndexedDB. | S | `src/dashboard/state.ts`, `dashboard.ts:2452` and the 6 call sites, `sortInbox.ts:595`, `screenerTab.ts`, `screenerBacklog.ts`, `recentTab.ts`, `rulesTab.ts` |
| A2 | **Stop hiding the UI during sync**; header status line; progress counts network fetches only; Rescan → Settings "Rebuild index". | S | `index.html`, `dashboard.ts:523-590`, `senderModel.ts:184-211` |
| A3 | **IndexedDB message index** with the record shape above; migrate `clusterMetadataCache`; drop `MAX_ENTRIES` and `FRESH_WINDOW_MS`. | M | new `src/lib/messageIndex.ts`, `src/lib/metadataCache.ts` (shim then remove), `senderModel.ts` |
| A4 | **Full history sync**: all four history types, no `labelId` filter; label patches without fetch; commit cursor after writes; run on open, focus and the 5-minute jobs alarm. | M | `src/lib/gmailApi.ts:235-274`, `gmailProvider.ts:95-122`, `src/lib/incrementalSync.ts`, `src/background.ts` |
| A5 | **Resumable newest-first backfill** in the background with a persisted `pageToken`. | M | `messageIndex.ts`, `background.ts`, `gmailApi.ts:163-188` |
| A6 | **404 recovery and daily reconcile** via label list queries. | S | `incrementalSync.ts`, `gmailApi.ts` |
| A7 | **Readers use the index**: time limits, 6-hour triage, rules. | M | `inboxTimeLimitsRunner.ts`, `inboxTimeLimits.ts`, `background.ts:260-345`, `ruleRunner.ts` |
| A8 | **Outlook delta**: keep `@removed`, `$select` fields, 410 restart. | M | `outlookProvider.ts:96-140` |

### Phase B: information architecture

| # | Step | Effort | Files |
|---|---|---|---|
| B1 | **Regroup and rename the sidebar** without moving logic: Today, Categories, Senders, Clean up, Security, Activity footer. Move banners (label tidy, Athena) into Settings. | S | `index.html`, `dashboard.css`, `dashboard.ts` nav wiring, `labelTidy.ts` |
| B2 | **One category model** (settings v14 migration) and the **Categories** screen merging time limits + sort config + retention; custom rules collapsed below. | M | `settingsStore.ts`, `timeLimitsTab.ts`, `sortInbox.ts`, `categoryFilters.ts`, `serverSort.ts`, `retentionPolicy.ts`, `rulesTab.ts` |
| B3 | **Senders screen + one sender sheet** merging Organize decisions, All senders, Subscriptions and the Screener queue. One "future mail" filter per sender. | L | `dashboard.ts` (`renderDecisionSenders`, `renderAllSenders`, row cells `:1669-2100`), `subscriptionsTab.ts`, `screenerTab.ts`, `screenerBacklog.ts`, `gmailApi.ts` filter helpers |
| B4 | **Clean up screen** consolidating Delete + old/large views. | M | `dashboard.ts` (`renderCleanupPlan`, `renderDomainGroups`, `renderExpirySection`, `renderSmartViews`) |
| B5 | **Today** from Overview, plus Activity with background runs. | S | `dashboard.ts:747-1000`, `recentTab.ts` |
| B6 | **First-run presets** card. | S | `dashboard.ts` connect flow, `settingsStore.ts` |

Order: A1, A2, B1 first (all S, visible relief in days). Then A3 + A4 together. Then B2, B3.
Update the DOM tests (`*.dom.test.ts`) alongside each B step; `testHarness.ts` already drives
the screens.

---

## Open questions

1. **How far back should the index go?** All mail, or the scan window (180 days today)? All mail
   for a 10,000-message box is ~33 minutes of one-time paced backfill.
2. **Is "Then: Trash after N days" welcome in Categories?** It makes retention a standing,
   destructive automation. Today only codes have it, and it is opt-in.
3. **Should the Screener be first-class** (its own area, HEY-style) or a "New" chip inside
   Senders as proposed?
4. **Do custom Rules stay visible at all**, or only under Advanced? Categories cover most of what
   the rule form can express.
5. **Outlook parity**: worth the A8 work now, or Gmail-first until Outlook has users?
6. **Is the ~3,200 the "Max messages" setting** raised by hand? If so, should that setting
   disappear once the index exists?
7. **Does the user want a side panel next to Gmail** (Chrome side panel API) rather than a tab?
   That would change the shell, not the IA above.
