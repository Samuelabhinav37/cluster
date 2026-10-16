# Data access and code baseline for a per-sender "who matters / who is normal" profile

Scope: what a header-only Chrome MV3 extension can get from Gmail API, Google People API, Microsoft Graph, Yahoo/IMAP; what it costs; how Cluster's current code (`C:/Users/samue/cluster-inspect`, branch `feat/kai-2026-10`, HEAD `c811ff2`, 2026-10-16) collects and discards it; and a feasible backfill + incremental sync plan.

Labels: **[verified]** = checked against a primary doc (linked) or the repo (file:line). **[inference]** = my reasoning from verified facts. Code references are `path:line` relative to `C:/Users/samue/cluster-inspect`.

---

## Q1. Gmail API: scopes, fields, costs, quotas, backfill time

### Takeaway
Gmail exposes everything a sender profile needs at header level (From/To/Cc/Reply-To/Message-ID/In-Reply-To, labelIds incl. IMPORTANT, CATEGORY_*, STARRED, UNREAD, SENT, threadId, internalDate, sizeEstimate), but nothing about *why* a message is Important. The binding constraint is quota: 6,000 units/min/user and 20 units per `messages.get`, so a 50k-message full-history backfill takes about 3 hours at Cluster's 5,500-unit pacing. Since May 2026 there is also a project-wide 80M units/day billing threshold. Each 50k-message backfill uses 1M units, so this caps free full backfills at about 80 per day for the whole user base.

### Cited Findings
**Scopes**
- `gmail.metadata` is a **restricted** scope: "View your email message metadata such as labels and headers, but not the email body." `gmail.readonly` and `gmail.modify` are also restricted, and so are `gmail.settings.basic` and `https://mail.google.com/`. **[verified]** [Gmail scopes (updated 2026-09-10)](https://developers.google.com/workspace/gmail/api/auth/scopes)
- `messages.list` `q`: "Parameter cannot be used when accessing the api using the gmail.metadata scope." So the metadata scope cannot use `q` search. **[verified]** [messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- `format=full` and `format=raw` "cannot be used when accessing the api using the gmail.metadata scope". `metadata` "Returns only email message ID, labels, and email headers". `minimal` "Returns only email message ID and labels". **[verified]** [Format enum](https://developers.google.com/workspace/gmail/api/reference/rest/v1/Format)
- `metadataHeaders[]` applies only with `format=METADATA` and limits the returned headers to the ones named. **[verified]** [messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)
- **Cluster does NOT use gmail.metadata.** The manifest requests `gmail.modify` + `gmail.settings.basic` **[verified]** (`manifest.json:41-44`). The opt-in permanent delete adds `https://mail.google.com/` **[verified]** (`src/lib/gmailApi.ts:498-502`). The manifest description says "Metadata-only…", but that is a code convention, not a scope boundary **[verified]** (`manifest.json:5`). Every candidate query depends on `q`: `category:promotions`, `newer_than:`, `in:sent`, and the `filename:` risky-attachment search **[verified]** (`src/lib/providers/gmailProvider.ts:43-49`, `src/lib/gmailApi.ts:417`). A switch to `gmail.metadata` would break all of them.
- **[inference]** Moving to `gmail.metadata` buys nothing for verification, because it is restricted just like `gmail.modify`. Cluster also needs `gmail.modify` for batchModify label, archive and trash, and `gmail.settings.basic` for filters. The restricted classification is shown on the scopes page above. I did not fetch the CASA requirements page.

**Message resource fields**
- The Message resource fields are id, threadId, labelIds, snippet, historyId, internalDate, payload, sizeEstimate, raw and classificationLabelValues. None of them carries an "importance reason" or a Priority Inbox score. **[verified]** [Message resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages#Message)
- **[inference]** `classificationLabelValues` is for Workspace data-classification labels, not Priority Inbox. Gmail's importance model is exposed only as the binary `IMPORTANT` label. I found no documented API for Gmail's "important because…" reasons.
- **[inference]** I did not verify whether `snippet` comes back under `format=metadata`. Even if it does, it is body text, and that conflicts with Cluster's metadata-only promise.
- `messages.list` returns only `id` and `threadId` per message, with no labels. `maxResults` defaults to 100 with a max of 500. `labelIds[]` returns only messages carrying all the given labels, and `includeSpamTrash` is available. **[verified]** [messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)

**Quota costs and limits (page last updated 2026-09-10)**
- Per-project limit: 1,200,000 units/min. Per user per project: **6,000 units/min**. Per project per day: **80,000,000 units**, described as a billing threshold: usage under it "doesn't incur extra charges" and it can't be increased. **[verified]** [Gmail quota](https://developers.google.com/workspace/gmail/api/reference/quota)
- These limits apply to projects created on or after **May 1, 2026**. Projects that used the API between Nov 2025 and Apr 2026 keep their earlier quotas. **[verified]** [Gmail quota](https://developers.google.com/workspace/gmail/api/reference/quota)
- Costs: messages.get 20, messages.list 5, threads.get 40, threads.list 10, history.list 2, messages.batchModify 50, getProfile 1, labels.list/get 1, labels.create/update/delete 5, filters.list/get 1, filters.create/delete 5. **[verified]** [Gmail quota](https://developers.google.com/workspace/gmail/api/reference/quota)
- Cluster's cost table matches these figures **[verified]** (`src/lib/gmailApi.ts:30-46`). Its persistent ledger paces to **5,500 units per 60 s**, or half that when storage is unavailable **[verified]** (`src/lib/gmailQuotaLedger.ts:19,24,46`). A rate-limit 403 parks the ledger for a full window **[verified]** (`src/lib/gmailApi.ts:118-123`, `src/lib/gmailQuotaLedger.ts:123`).
- Batch: at most 100 calls per batch. "A set of n requests batched together counts toward your usage limit as n requests". Google recommends ≤50 per batch because larger batches are "likely to trigger rate limiting". **[verified]** [Gmail batch guide](https://developers.google.com/workspace/gmail/api/guides/batch)

**history.list (incremental sync)**
- `startHistoryId` "is typically valid for at least a week, but in some rare circumstances may be valid for only a few hours". An invalid ID returns 404, and the app "should perform a full sync". `historyTypes` can be messageAdded, messageDeleted, labelAdded or labelRemoved. `labelId` filters by label. Max 500 per page. Returned messages usually carry only id and threadId. **[verified]** [history.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)
- Cluster calls history with `historyTypes=messageAdded&labelId=INBOX` only, for the security lane **[verified]** (`src/lib/gmailApi.ts:235-274`, `src/lib/providers/gmailProvider.ts:89-117`). Label changes (read, star, Important flips, archive) are never synced, which is why `metadataCache` re-fetches anything under 7 days old **[verified]** (`src/lib/metadataCache.ts:27-30`).

### Inferences: backfill math (at Cluster's 5,500 units/min pacing)
| Mailbox size | messages.get only (20 u) | Time at 5,500 u/min | At theoretical 6,000 u/min |
|---|---|---|---|
| 5,000 (e.g. a full Sent folder) | 100,000 u | ~18 min | ~17 min |
| 10,000 | 200,000 u | ~36 min | ~33 min |
| 50,000 | 1,000,000 u | **~3.0 h** | ~2.8 h |
| 100,000 | 2,000,000 u | **~6.1 h** | ~5.6 h |
- Listing IDs is negligible: 50k IDs / 500 per page × 5 u = 500 u.
- **threads.get** (40 u, returns every message in the thread) beats messages.get only when a thread averages more than 2 messages. At 2.5 messages/thread the cost is 16 u per message (−20%). Bulk mail is almost all single-message threads, where threads.get costs double. A hybrid works: use messages.list's `threadId` to group the IDs, then call threads.get only for threadIds that appear ≥3 times in the ID list.
- **Batching doesn't save units.** It only cuts HTTP round-trips and service-worker wakeups. With n calls counted as n, pacing stays the limit.
- **Project-level ceilings matter for a shared OAuth client** (one `client_id` in `manifest.json:39`): 1.2M u/min ÷ 5,500 means about 218 users can backfill at full speed at once. The 80M u/day threshold allows about 80 × 50k-message backfills per day across *all* users. A user pacing at 5,500 u/min around the clock would burn about 7.9M u/day, so roughly 10 such users reach the threshold. A full-history backfill must therefore be throttled well below the per-user cap (spread over days), or limited in depth, or both.
- `format=minimal` (labels only) still costs 20 u, because the cost is per method, not per format (the quota table lists no per-format cost). Re-reading labels with messages.get is no cheaper than a metadata fetch. Label drift should come from `history.list` (2 u per page) with `labelAdded/labelRemoved`.
- Cheaper label-membership sets: `messages.list?labelIds=STARRED` / `IMPORTANT` / `SENT` / `CATEGORY_*` costs 5 u per 500 IDs. That gives exact membership counts per label at about 1% of the cost of fetching. The sender is still unknown until each ID is fetched, but a table of IDs already fetched can be joined against these sets. Cluster already does this for STARRED (`src/lib/gmailApi.ts:209`).

### Gaps
- Whether `snippet` is returned under `format=metadata` (not stated in the docs fetched).
- The exact meaning of "billing threshold" for 80M/day: whether calls past it are billed or rejected for a project without billing. The quota page says only that usage under it is free.
- Whether this project (client 995931931748…) was created before May 2026 and kept older quotas. The code comment says 6,000 applies (`src/lib/gmailApi.ts:12-13`), but that is unverified against the Cloud console.
- The CASA / restricted-scope verification cost for a public listing was not fetched this round.

---

## Q2. Google People API: Other Contacts as a cheap "who you write to" source

### Takeaway
`otherContacts.list` with `contacts.other.readonly` returns Google's auto-created contacts "from interactions", with names and email addresses, at up to 1,000 per page. It could replace or seed the 150-message sent scan, and it keeps display names. It needs a new scope and a new host permission.

### Cited Findings
- Other Contacts are "typically auto created contacts from interactions". Scope: `https://www.googleapis.com/auth/contacts.other.readonly`. readMask fields with the default source: emailAddresses, metadata, names, phoneNumbers, photos. pageSize is 1–1000. Sync tokens "expire 7 days after the full sync" (error `EXPIRED_SYNC_TOKEN`), and deleted entries come back with `PersonMetadata.deleted`. The first page of a full sync has its own quota, which returns 429 when exceeded and "is fixed and can not be increased". **[verified]** [otherContacts.list](https://developers.google.com/people/api/rest/v1/otherContacts/list)
- Cluster's host_permissions don't include `people.googleapis.com`, and the OAuth scopes are only gmail.modify + gmail.settings.basic **[verified]** (`manifest.json:32-44`).

### Inferences
- Other Contacts records *that* you interacted with, not how often or how recently. It is a "known" signal, not a "matters" ranking. Frequency and recency still have to come from Sent headers.
- Other Contacts gives the display names the sent-mail scan throws away (`src/lib/gmailApi.ts:405`). That makes it a direct input for contact-impersonation checks (gap A4 in the 2026-10-11 audit).
- `people.connections.list` ("My Contacts", scope `contacts.readonly`) would add deliberately saved contacts. I did not fetch its doc.

### Gaps
- People API per-minute read quotas (not fetched).
- How completely Other Contacts covers people you replied to versus everyone you emailed (not documented in what I read).

---

## Q3. Microsoft Graph: fields, delta, throttling, People, Focused overrides

### Takeaway
Graph is much cheaper than Gmail for a profile: list and delta calls return sender, from, toRecipients, ccRecipients, replyTo, isRead, flag, inferenceClassification and conversationId inline with `$select`. The limit is a request count (10,000 per 10 min per app per mailbox, 4 concurrent), not per-message units. Two extras are worth having: `/me/people`, a relevance-ranked list that works on personal accounts with `People.Read`, and Focused Inbox sender overrides, which need `Mail.Read`. Raw headers may still need per-message GETs. Cluster's Outlook metadata call also selects `size`, which is not a v1.0 property, so it needs a live check.

### Cited Findings
**Message fields**
- The v1.0 message properties include bccRecipients, body, bodyPreview, ccRecipients, changeKey, conversationId, conversationIndex, createdDateTime, flag, from, hasAttachments, id, importance, inferenceClassification ("focused or other … based on inferred relevance or importance, or on an explicit override"), internetMessageHeaders ("Requires $select to retrieve"), internetMessageId, isDraft, isRead, lastModifiedDateTime, parentFolderId, receivedDateTime, replyTo, sender, sentDateTime, subject, toRecipients, uniqueBody, webLink, plus categories in the JSON. **There is no `size` property in v1.0.** **[verified]** [message resource](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0)
- `from` is "the owner of the mailbox from which the message is sent". `sender` is "the account that is used to generate the message". They differ for shared mailboxes and delegates. **[verified]** [message resource](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0)
- The headers note says: "To get the headers of a message, apply the `$select` query parameter in a get message operation." **[verified]** [message resource](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0)
- The `id` changes when a message moves folders unless you send `Prefer: IdType="ImmutableId"`. **[verified]** [message resource](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0)
- Mail.ReadBasic is described as covering everything except body, previewBody/bodyPreview, attachments and extended properties. This comes from a secondary source; I did not reach the official permissions page. **[secondary]** [graphpermissions.merill.net Mail.ReadBasic](https://graphpermissions.merill.net/permission/Mail.ReadBasic); isRead is available under it per [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/283657/count-unread-emails-with-mail-readbasic-permission)
- Cluster requests `offline_access Mail.ReadBasic Mail.ReadWrite` **[verified]** (`src/lib/providers/msalAuth.ts:5`). Because Mail.ReadWrite is granted, the ReadBasic exclusions don't actually limit the token **[inference]**.

**Delta**
- Delta is **per mail folder** (`/me/mailFolders/{id}/messages/delta`). It supports `$select`, `$top` and `$expand`. `$filter` allows only `receivedDateTime ge|gt`. `$orderby` allows only `receivedDateTime desc`. There is no `$search`. Query params are encoded into the nextLink/deltaLink. `@removed` entries appear for deletes and moves, and read/unread changes surface as updates. Mail.ReadBasic is the least-privileged permission, and personal accounts are supported. `Prefer: odata.maxpagesize` is available. **[verified]** [message: delta](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0)
- Cluster's delta covers the **Inbox folder only**, with `$select=id`, `$top≤100`, and a fall back to full resync on 410 **[verified]** (`src/lib/providers/outlookProvider.ts:96-134`). It then makes one GET per id for metadata **[verified]** (`src/lib/providers/outlookProvider.ts:136-140`).

**Throttling**
- Outlook limits per app ID + mailbox: **10,000 API requests per 10 minutes**, **4 concurrent requests**, and 150 MB upload per 5 min. These cover message, mailFolder, messageRule, contact and **person** (People API). In a JSON batch, Graph sends at most 4 requests at a time to Outlook. **[verified]** [Graph throttling limits](https://learn.microsoft.com/en-us/graph/throttling-limits)
- The global limit is 130,000 requests per 10 seconds per app across all tenants **[verified]** (same page).
- Cluster's Outlook batches run 4-wide with Retry-After handling **[verified]** (`src/lib/providers/outlookProvider.ts:214-263`).

**People API (relevance ranking)**
- `GET /me/people` returns person objects "ordered by their relevance to the user, which is determined by the user's communication and collaboration patterns, and business relationships". It works on **personal Microsoft accounts with People.Read**. Each person carries `scoredEmailAddresses[].relevanceScore` and supports `$top/$skip/$search/$filter`. The **People API is in maintenance mode**, and Microsoft recommends the Search API for new development. **[verified]** [List people](https://learn.microsoft.com/en-us/graph/api/user-list-people?view=graph-rest-1.0)

**Focused Inbox overrides**
- `GET /me/inferenceClassification/overrides` lists "overrides that a user has set up to always classify messages from certain senders". There is one per sender SMTP address, with `classifyAs: focused|other` and `senderEmailAddress{name,address}`. The least-privileged permission is **Mail.Read**, for both work and personal accounts. **[verified]** [List overrides](https://learn.microsoft.com/en-us/graph/api/inferenceclassification-list-overrides?view=graph-rest-1.0)

### Inferences
- **Graph backfill cost:** list `/me/mailFolders/{inbox|sentitems|archive|…}/messages` with `$select=from,sender,toRecipients,ccRecipients,replyTo,receivedDateTime,isRead,flag,inferenceClassification,conversationId,internetMessageId,categories,parentFolderId,hasAttachments`. Cluster already pages at `$top=999` (`outlookProvider.ts:85,564`), so 50k messages take about 50–500 requests, a tiny share of 10,000 per 10 min. Only the header-dependent signals (Authentication-Results, DKIM, List-Unsubscribe, Precedence) need per-message GETs, at about 50k requests ÷ 1,000/min, so ≥50 min for 50k at 4-wide concurrency. A profile can drop headers for old mail and keep them only for recent mail.
- **`size` in `$select` (`outlookProvider.ts:138`) is not a v1.0 property.** Graph normally answers an unknown `$select` property with HTTP 400. If so, every Outlook `getMessageMetadata` call would fail, so this needs live checking. The memory notes say Outlook live-testing is still open. The size data exists as the MAPI extended property PR_MESSAGE_SIZE, but extended properties are outside Mail.ReadBasic.
- **Cluster uses `sender`, not `from`** (`outlookProvider.ts:151,159`). For "on behalf of" mail the visible From is lost. Display-name impersonation checks should key on `from`.
- `inferenceClassification` is per message, and overrides are per sender. Together they are Outlook's equivalent of Gmail's IMPORTANT plus the user's explicit "always Focused" choices. The latter is a strong, user-authored "this sender matters" signal, and Gmail has nothing like it.
- `/me/people` is the cheapest "who matters" seed for Outlook: one request for the top ~100 ranked people with names. It needs the extra People.Read scope, and maintenance mode is a longevity risk.
- Delta per folder means a full profile needs delta tokens for Inbox, Sent Items, Archive, and any folders Cluster moves mail into. Moved mail shows as `@removed` in one folder and as created in another.

### Gaps
- Whether `internetMessageHeaders` can be `$select`ed on list and delta responses, or only on single GET. The docs hint at GET only, but I found no explicit prohibition.
- Official Mail.ReadBasic wording; the permissions-reference page was too large to reach that section.
- Max `$top` and `odata.maxpagesize` for message lists (the code assumes 999).
- Whether `inferenceClassification` and overrides exist for every outlook.com consumer mailbox (Focused Inbox on vs off).

---

## Q4. Yahoo Mail and IMAP-level equivalents

### Takeaway
Yahoo has no public REST mail API. Access is IMAP (and CardDAV/CalDAV) with OAuth2, gated by a commercial-access application. A Chrome MV3 extension can't open raw IMAP TCP connections, so Yahoo isn't feasible without a server or a native helper. That conflicts with Cluster's no-server design.

### Cited Findings
- Yahoo "no longer supports proprietary Mail APIs" and offers access through IMAP, CardDAV and CalDAV with OAuth2. Third parties must apply for commercial access and "provide evidence that they are honoring our policies and guidelines". **[verified]** [Yahoo Developer Access](https://senders.yahooinc.com/developer/developer-access)
- Nylas describes the process: submit the Yahoo Mail API Access form, then sign a Commercial Access Agreement. Scopes are `mail-r` (read) and `mail-w`. An IMAP app password works for testing. **[secondary]** [Nylas Yahoo auth guide](https://developer.nylas.com/docs/provider-guides/yahoo-authentication/)

### Inferences
- MV3 extensions have `fetch` and WebSocket but no raw TCP socket API. `chrome.sockets` belonged to the deprecated Chrome Apps platform. IMAP (port 993) would need a native messaging host or a server-side proxy. Both break the "on-device, no-server" model, and a proxy would also see credentials. Not verified against a doc this round.
- The IMAP equivalents for a profile would be: `FETCH (FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO CC REPLY-TO MESSAGE-ID IN-REPLY-TO …)])` for headers; `\Seen`/`\Flagged` flags; CONDSTORE/QRESYNC (RFC 7162) `MODSEQ` for incremental sync; and Gmail's `X-GM-LABELS`/`X-GM-THRID` extensions. Not verified this round. IMAP has no per-unit quota but has connection and bandwidth limits.
- The Nylas note about "last 90 days" is about Nylas's own cache, not a Yahoo IMAP limit. Don't cite it as a Yahoo constraint.

### Gaps
- Yahoo approval timelines and whether a browser-only OAuth client would be approved.
- Yahoo IMAP rate limits.

---

## Q5. Chrome MV3 runtime and storage constraints

### Takeaway
A multi-hour backfill must run as resumable chunks driven by `chrome.alarms` (min period 30 s), with a checkpoint after each page, because the service worker dies after 30 s idle or after 5 min on one event. For about 100k compact header records, IndexedDB is the better fit. Cluster today keeps whole maps in single `chrome.storage.local` keys, which it reads and writes in full on every update.

### Cited Findings
- The service worker is terminated after 30 s of inactivity. A single event or API call running past 5 minutes, or a `fetch()` waiting more than 30 s for a response, also terminates it. Extension API calls reset the idle timer (Chrome 110+). Since Chrome 120, alarms can be set to a 30 s minimum period. **[verified]** [SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- `storage.local` is limited to 10 MB (5 MB in ≤113) unless the extension holds `unlimitedStorage`. Values must be JSON-serializable, and quota is measured by JSON-stringified size. It's available in service workers. **[verified]** [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- Cluster has `unlimitedStorage` and `alarms` **[verified]** (`manifest.json:31`). Existing alarms: triage every 360 min, jobs every 5 min, inbox-limits every 15 min **[verified]** (`src/background.ts:62-67`). A durable-jobs mechanism already exists **[verified]** (`src/lib/durableJobs.ts:41-48`).
- No IndexedDB usage anywhere in `src`. All persistence goes through `chrome.storage.local` **[verified]** (grep over `src` for `indexedDB|IDB` found nothing. The storage.local users are `settingsStore.ts:338,365`, `metadataCache.ts:45,77`, `senderLedgerStore.ts:29,42`, `gmailQuotaLedger.ts:52,66`, `durableJobs.ts`, `ruleCompletionLedger.ts`, `remoteDataset.ts` and `msalAuth.ts`).

### Inferences: size estimates
- The current cache entry is about 1.5 KB of `NormalizedMessageMetadata` (`metadataCache.ts:21-22` comment), so 100k entries would be about 150 MB of JSON. That is too heavy to read and write as one key.
- A compact profile record would hold: provider-id, message id, threadId, internalDate, from address, from display name, an 8-bit label bitmask (INBOX/UNREAD/STARRED/IMPORTANT/SENT/CATEGORY_*), To/Cc counts or hashed recipients, a reply-to domain, a DKIM d= domain, a List-Unsubscribe bit and sizeEstimate. That is about 250–400 B as JSON, so 100k records come to **~25–40 MB**. That fits `storage.local` with unlimitedStorage, but only if sharded (for example by month), since `get/set` on one key serializes the whole value.
- IndexedDB (available in extension service workers and pages) gives per-record writes, indexes (by sender, by threadId, by date) and cursors. It suits a 100k-row message table plus a ~5–20k-row sender aggregate table. `chrome.storage.local` stays fine for small aggregates (sender profiles at about 200 B × 20k senders ≈ 4 MB) and for cursors.
- **Per-sender aggregates are what the algorithm needs.** Raw rows are needed only to recompute aggregates and to answer "first seen" questions. Keeping just aggregates plus a rolling window of raw rows (e.g. the last 90 days) cuts storage by roughly 10×.

### Gaps
- Real IndexedDB eviction behaviour for extensions under storage pressure. With `unlimitedStorage` it's believed exempt, but I did not verify this.

---

## Q6. Code audit: current scan and profile pipeline (as of `feat/kai-2026-10` @ c811ff2)

### Takeaway
Cluster fetches a rich header set per message but samples very little: 150 cleanup messages over 180 days, 100 inbox messages over 30 days, and 150 sent messages. It reduces labels to a few booleans, never reads To/Cc/threadId/Message-ID on received mail, drops sent-mail display names, and spreads "known" across four stores that don't share data. Only one of them, `knownSenderSet`, feeds the protection gate and the verdict.

### Cited Findings: where scanning happens
- **Entry points.** Background triage, every 6 h: a cleanup scan via `buildSenderSummaries`, then the security lane via `buildIncrementalSenderSummaries` **[verified]** (`src/background.ts:325-342`). The security lane is capped at 100 messages and 30 days **[verified]** (`src/background.ts:56-57,336-337`). The dashboard cold open uses `buildCombinedSenderSummaries`, a single combined pass with a security slice ≤250 **[verified]** (`src/lib/senderModel.ts:320-377`).
- **Defaults.** `maxMessagesPerProvider: 150` and `scanWindowDays: 180` in settings **[verified]** (`src/lib/settingsStore.ts:152-158`). The library's own defaults are 500/180 but are overridden by callers **[verified]** (`src/lib/senderModel.ts:188-189`).
- **Gmail candidate queries.** Cleanup is `(category:promotions OR category:updates) newer_than:Nd`. Security is `in:inbox newer_than:Nd`. Combined is the union **[verified]** (`src/lib/providers/gmailProvider.ts:43-49`). Archived Primary mail (often from people) is never in the population.
- **Gmail metadata fetch.** `format=metadata` with headers From, Reply-To, List-Unsubscribe, List-Unsubscribe-Post, Subject, Authentication-Results, DKIM-Signature, Precedence, Auto-Submitted, plus labelIds, internalDate and sizeEstimate **[verified]** (`src/lib/gmailApi.ts:291-325`). Concurrency is 5, paced by the ledger **[verified]** (`src/lib/senderModel.ts:194`).
- **Gmail normalization (what survives).** STARRED→`isProtected`, UNREAD→`unread`, INBOX/CATEGORY_PROMOTIONS/CATEGORY_UPDATES→`lanes`, CATEGORY_PROMOTIONS→`gmailPromotion`, `IMPORTANT || CATEGORY_PERSONAL`→a single `providerMarkedPersonal` boolean **[verified]** (`src/lib/providers/gmailProvider.ts:120-150`). The From display name is parsed and kept **[verified]** (`gmailProvider.ts:64-73,127`).
- **Outlook.** It lists the Inbox only with `$select=id` **[verified]** (`outlookProvider.ts:82-94`) and makes one GET per id selecting `sender,subject,flag,internetMessageHeaders,receivedDateTime,isRead,size,hasAttachments,inferenceClassification` plus `$expand=attachments($select=name)` **[verified]** (`outlookProvider.ts:136-140`). It maps flagged→protected and focused→`providerMarkedPersonal` **[verified]** (`outlookProvider.ts:164-179`).
- **Per-sender aggregation.** `addToSenders` keys by `provider:fromAddress` and builds `MessageRecord`s (subject, receivedAt, kind, isProtected, unread, sizeBytes, providerMarkedPersonal, looksAutomated, promotion, dkimDomains, replyToDomain). It keeps the *first* display name seen and re-scores identity signals when the name changes **[verified]** (`src/lib/senderModel.ts:120-185`). `SenderSummary` objects are in-memory per scan and not persisted **[verified]** (`senderModel.ts:49-75`).

### Cited Findings: what is thrown away or never collected
- **Received mail.** `To`, `Cc`, `Date`, `Message-ID`, `In-Reply-To`, `References`, `Sender`, `List-Id` and `Return-Path` are never requested **[verified]** (`gmailApi.ts:293-305`). Without In-Reply-To/References or threadId nobody can tell "they replied to me" from "they wrote first" **[inference]**.
- **threadId** is returned by messages.list (`gmailApi.ts:158-160`), but `listCandidateMessages` maps stubs to `{id, provider}` only **[verified]** (`gmailProvider.ts:89-92`). The Outlook path never selects `conversationId` **[verified]** (`outlookProvider.ts:138`).
- **Labels collapsed.** IMPORTANT and CATEGORY_PERSONAL are merged into one boolean. SENT, CATEGORY_SOCIAL and CATEGORY_FORUMS are dropped, CATEGORY_UPDATES is used only for lanes, and user labels are dropped **[verified]** (`gmailProvider.ts:120-150`).
- **Sent mail.** `listSentCorrespondents` lists `in:sent newer_than:2y`, capped at **150** messages, and fetches only To and Cc. `parseAddressList` keeps the `<addr>` part and **discards display names**. Results are capped at 1,000 addresses, and no per-recipient counts or timestamps are kept **[verified]** (`gmailApi.ts:401-440`). Outlook does the same: `$select=toRecipients,ccRecipients`, 150 messages, names not kept **[verified]** (`outlookProvider.ts:554-579`). Bcc is not fetched on either.
- **Address parsing.** `parseAddressList` splits on `,`, so a quoted name like `"Doe, John" <j@x.com>` is split in two. The fragment without `@` is filtered out, so the address usually survives **[verified]** (`gmailApi.ts:401-410`). The Gmail From parser keeps everything before `<` as the name **[verified]** (`gmailProvider.ts:64-73`).
- **Outlook `sender` vs `from`.** Only `sender` is selected **[verified]** (`outlookProvider.ts:138,151,159`).
- **Outlook `size`** is selected but isn't a v1.0 message property **[verified against docs]** ([message resource](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0)). Its runtime effect is unverified (see Q3).
- **Read/star drift.** Gmail history syncs only `messageAdded` into INBOX **[verified]** (`gmailApi.ts:244-249`), so later reads and stars are seen only on a re-fetch. The cache ignores entries under 7 days old to compensate **[verified]** (`metadataCache.ts:27-30,46-52`).

### Cited Findings: the four "known sender" notions, their storage and every consumer
1. **`settings.knownSenders` + `firstContact.ts`**: "seen at least once since install".
   - Storage: `Record<"provider:address", firstSeenMs>` inside the single settings blob in `chrome.storage.local`. **No size cap** and no TTL **[verified]** (`settingsStore.ts:59-61,179-180`; `firstContact.ts:17-37`).
   - Written from security-lane senders only. Background: `background.ts:356-368`. Dashboard: `dashboard.ts:607-622` **[verified]**.
   - Consumers: `sender.firstContact` drives the "new since Cluster started tracking" label **[verified]** (`dashboard.ts:1273`), plus the dashboard's newly-seen set (`dashboard.ts:614-616`). It is **not** used by protection, verdict or Screener **[verified by grep]**.
2. **`screener.knownSenderSet`**: "on the explicit allowlist ∪ addresses I sent to".
   - Storage: `settings.screenerAllowlist` + `settings.sentCorrespondents {addresses, fetchedAt}`, refreshed on a 7-day TTL. Each refresh *unions* into the previous list, so it can grow past the 1,000-per-fetch cap over time **[verified]** (`screener.ts:13-56`; `settingsStore.ts:34,40,169-171`).
   - Consumers:
     - The protection gate. `protectionDecision` returns `known-correspondent` and blocks every clean-up path **[verified]** (`protectionPolicy.ts:20-29,61-62`), which is built by `buildProtectionContext` (14 call sites).
     - The verdict. `knownCorrespondent` drops look-alike signals unless auth failed **[verified]** (`verdict.ts:57-58,149-153`). The flag is set at `background.ts:227-232`, `securityTab.ts:112,142,266,271` and `reportTab.ts:158,163`.
     - Screener: `background.ts:166`, `screenerTab.ts:43,108`, `screenerBacklog.ts:122`.
     - Inbox time limits: `inboxTimeLimitsRunner.ts:57` **[verified]**.
3. **`senderLedger.ts` / `senderLedgerStore.ts`**: "familiar" = ≥3 messages over ≥30 days, plus DKIM and Reply-To domain baselines with 7-day promotion.
   - Storage: its own `chrome.storage.local` key `senderLedger`, under a storage lock. Entries are forgotten after 400 days unseen, with no count cap **[verified]** (`senderLedger.ts:20-52`; `senderLedgerStore.ts:7-44`).
   - Fed by security-lane senders only. Background: `background.ts:372`. Dashboard: `dashboard.ts:617` **[verified]**.
   - Consumer: it adds `identity-change` threat signals only **[verified]** (`senderLedgerStore.ts:31-38`). Its `messages`/`months`/`firstSeen` history is **not** read by protection, Screener or engagement **[verified by grep]**.
4. **`engagementModel.ts`**: "bulk I read / ignore", an EMA of the unread ratio.
   - Storage: `settings.senderEngagement`, at most 1,000 records with a 365-day TTL and EMA weight 0.35 **[verified]** (`engagementModel.ts:10-23,36-39,61-110`; `settingsStore.ts:66,183`).
   - Updated from cleanup-lane senders: `background.ts:353` and `dashboard.ts:604`. Both call it **without a ProtectionContext**, so it defaults to empty **[verified]** (`engagementModel.ts:65`).
   - Consumers: `buildEngagementSuggestions` at `dashboard.ts:748,1038,1121,1300,2292`. Feedback is recorded at `dashboard.ts:1524,1778,2723`, `recentTab.ts:97-99` and `subscriptionsTab.ts:90-91` **[verified]**.
- **Other persisted state:** `clusterMetadataCache` (≤2,000 entries at ~1.5 KB each, 7-day fresh window) **[verified]** (`metadataCache.ts:16-30`); `gmailQuotaLedger`; `incrementalSyncCursors` in settings **[verified]** (`background.ts:376-383`).

### Inferences
- The four notions are fed by **different populations**: knownSenders and the ledger from the 100-message inbox lane, engagement from the 150-message promotions/updates lane, and knownSenderSet from 150 sent messages. A single sender can sit in all four with contradictory meanings (this matches A6 in `research/2026-10-11-how-cluster-solves-it.md` §2.4).
- `knownSenders` and the ledger both record "first seen" but never reconcile. `knownSenders` sits inside the settings blob, so its unbounded growth bloats every `mutateSettings` read-modify-write.
- Because nothing persists per-message rows beyond the 2,000-entry cache, every "who matters" score is recomputed from a fresh small sample. That explains A3 ("same inbox scores differently").

### Gaps
- I did not trace every one of the 14 `buildProtectionContext` call sites, or check whether the background cleanup path passes it to every consumer.
- I did not run the test suite or a live scan. Runtime claims (Outlook `size`, the actual header payload) remain unverified.

---

## Q7. Feasible full-history backfill + incremental sync + storage plan

### Takeaway
A full-history profile is feasible within quotas if it is (1) prioritized: Sent first, then IMPORTANT/STARRED, then the rest, newest first; (2) paced well below the per-user cap and spread over days to respect the project's 80M/day threshold; (3) incremental after that via Gmail `history.list` (all label types, no INBOX filter) and Graph per-folder delta; and (4) stored as compact rows in IndexedDB with per-sender aggregates. Outlook is cheap; Gmail is the slow one.

### Inferences (plan; every number is derived from the verified costs above)
**Phase 0: free seeds (minutes, under 1k units)**
- Gmail: `messages.list` ID sets for `labelIds=SENT`, `STARRED`, `IMPORTANT`, `CATEGORY_PERSONAL` at 5 u per 500 IDs. A 50k mailbox with 10k IMPORTANT costs about 100 u.
- Optional new scope: `contacts.other.readonly` gives Other Contacts with names at 1,000 per page ([doc](https://developers.google.com/people/api/rest/v1/otherContacts/list)).
- Outlook: `/me/people` (People.Read) for relevance-ranked contacts ([doc](https://learn.microsoft.com/en-us/graph/api/user-list-people?view=graph-rest-1.0)); `/me/inferenceClassification/overrides` (Mail.Read) for user-pinned Focused/Other senders ([doc](https://learn.microsoft.com/en-us/graph/api/inferenceclassification-list-overrides?view=graph-rest-1.0)).

**Phase 1: Sent-mail backfill (highest value per unit)**
- Gmail: list every SENT ID, then `messages.get format=metadata` with `metadataHeaders=To,Cc,Bcc,Date,Message-ID,In-Reply-To,References,From`. Keep display names and per-recipient count, first and last timestamps. 5,000 sent messages = 100k u, about 18 min at 5,500 u/min.
- Outlook: list `sentitems` with `$select=toRecipients,ccRecipients,bccRecipients,sentDateTime,conversationId,internetMessageId`, and recipient names inline (`emailAddress.name`). About 5–50 requests.

**Phase 2: received backfill, newest first, resumable**
- Gmail: page `messages.list` with no `q` (or `-in:spam -in:trash`), store id and threadId, then fetch metadata in chunks. Cap at about **1,500–2,500 u/min** (≈75–125 msg/min) instead of 5,500 so foreground scans keep headroom and the project-wide daily budget stretches. 50k messages then take about 7–13 h of wall-clock spread over sessions/days. Use threads.get (40 u) only for threadIds with ≥3 listed IDs.
- Checkpoint after each page (`pageToken` + last fetched id) through the existing `durableJobs`/alarms (`background.ts:65`, `durableJobs.ts`). Each alarm tick does ≤ ~4 min of work to stay under the 5-minute event limit ([SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)).
- Graph: list every folder with the full `$select` (no headers) at about 50k/999 ≈ 50 requests. Per-message GET for headers only on the last N days (e.g. 90), which is far under 10,000 per 10 min ([throttling](https://learn.microsoft.com/en-us/graph/throttling-limits)).
- Add a project-level safety valve. The client can't see project usage, so the backfill should be opt-in or depth-limited by default (e.g. 2 years or 20k messages) and treat 403/429 as "stop until tomorrow".

**Phase 3: incremental sync**
- Gmail: take `getProfile.historyId` before the backfill. Every alarm tick, call `history.list` with `historyTypes=messageAdded,labelAdded,labelRemoved,messageDeleted` and **no labelId filter** at 2 u per page. Fetch metadata only for new ids, and patch label bits from labelAdded/labelRemoved with no re-fetch. A 404 triggers a bounded re-baseline (re-list IDs and diff against stored ids, which only lists; costs 5 u per 500) ([history.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)). Run at least daily, since history IDs are "typically valid for at least a week" but sometimes only hours.
- Graph: one deltaLink per tracked folder (Inbox, Sent Items, Archive, Cluster's folders) with the full `$select`, and handle `@removed` and read-state updates ([delta](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0)). Use `Prefer: IdType="ImmutableId"` so folder moves don't change ids ([message](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0)).

**Storage layout**
- IndexedDB `messages` store: about 300 B per row, so ~30 MB for 100k rows. Indexes on `sender`, `threadId` and `date`.
- IndexedDB or chrome.storage.local `senders` aggregate: per `provider:address`, holding first and last seen, received and sent counts, reply count (from In-Reply-To or thread membership), IMPORTANT/STARRED/UNREAD counts, distinct months, known names, DKIM/Reply-To baselines (absorbing `senderLedger`) and the engagement EMA (absorbing `senderEngagement`). About 200 B × 20k ≈ 4 MB.
- Small cursor/progress keys stay in chrome.storage.local.
- This one store would replace `knownSenders`, `sentCorrespondents`, `senderLedger` and the `senderEngagement` inputs. That fixes A6 and A3 and keeps sent-mail names, which addresses A4.

### Gaps
- Real mailbox shape for the owner (share of Sent, thread depth, IMPORTANT rate) sets the actual backfill time. The 2026-10-11 doc §6 lists this as missing too; a local count-only census would settle it.
- Whether the Cloud project has billing enabled, and what happens past 80M/day.
- Whether CWS review or Google OAuth verification treats a full-history header backfill differently from today's sampled scan. I found no doc; worth checking against the Limited Use policy.
