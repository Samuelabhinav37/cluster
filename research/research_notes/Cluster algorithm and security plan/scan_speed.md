# Scan speed and quota: fast, metadata-only mailbox scanning from a Chrome MV3 extension (Gmail + Outlook)

> Method note (read first): in this research session, direct page fetches (WebFetch/curl) to developers.google.com, learn.microsoft.com and other hosts were blocked by the egress proxy (DNS failure / 403 on CONNECT). All findings below come from web-search result extracts of the cited pages, not full-page reads. Where an extract quoted an official Google/Microsoft page, that page is cited; where only third-party pages supported a claim, that is stated. The coordinator should do a final manual check of the official Gmail quota table before publishing exact numbers.

## 1. Gmail API quota (2026): per-method unit costs and per-user / per-project limits

### Takeaway
The project's own measurement is **confirmed**. For Cloud projects created on or after **1 May 2026**, the limit is **6,000 units per user per minute** (it was 15,000) and **messages.get costs 20 units** (it was 5). Projects that used the Gmail API between Nov 2025 and Apr 2026 keep the old quotas for now. Under the new table a full metadata scan built on messages.get can do about **300 messages per minute per user**. At that rate 10k messages take about 33 minutes and 100k take about 5.5 hours. Under the old table the same scan ran at 3,000 messages per minute.

### Cited Findings
- Official usage-limits page (search extract): **6,000 quota units per minute per user per project**; **80,000,000 quota units per day per project**. Per-method costs: **labels.get 1**, **history.list 2**, **messages.list 5**, **threads.list 10**, **messages.get 20 (60 for format=full/raw/html)**, **threads.get 40 (120 for format=full)**, **messages.batchModify 50**. — [Gmail Usage limits](https://developers.google.com/workspace/gmail/api/reference/quota)
- Release notes say the quota units changed for drafts.get, messages.attachments.get, **messages.get**, messages.trash, **threads.get** and threads.trash, with a tiering update dated **May 1, 2026**. — [Gmail API release notes](https://developers.google.com/workspace/gmail/release-notes)
- Third-party sources agree on the details. Projects created on or after 1 May 2026 get 6,000 units/user/min (previously 15,000) and 1,200,000 units/min/project. An 80M-unit daily "billing threshold" applies but does not yet trigger billing, and Google says billing details will follow later in 2026 with at least 90 days' notice. Projects that used the API between Nov 2025 and Apr 2026 keep their previous quotas. — [Nylas: Gmail API quotas 2026](https://cli.nylas.com/guides/gmail-api-quotas-2026); [Nylas cookbook](https://developer.nylas.com/docs/cookbook/email/gmail-api-quotas/); [Unipile](https://www.unipile.com/gmail-api-limits/)
- A GitHub issue gives a field report matching the project's measurement: "Gmail quotas changed on 1 May 2026: new projects get 6,000 units per user per minute and higher per-method costs". messages.get now costs 20 units instead of 5. On a new project, a client still assuming 5 units overshoots the per-user limit several times over, and initial sync keeps hitting 403 rate-limit errors. — [ronboger/mishmail #16](https://github.com/ronboger/mishmail/issues/16)
- **Conflicting / outdated figures to ignore.** Some official-domain cached copies and older guides still show 15,000 units/user/min, messages.get = 5, threads.get = 10, or "250 units/user/second". These are the pre-May-2026 (and pre-2015) values. Even within Nylas, one page says 5 and another says 20. — [Gmail quota page (older cached copy)](https://developers.google.com/gmail/api/reference/quota); [Nylas rate-limits comparison](https://cli.nylas.com/guides/email-api-rate-limits-compared)
- Historical context: the release notes record a 10x cost reduction in 2014, and in 2015 the default per-user quota was raised to 250 units/user/second. — [Gmail API release notes](https://developers.google.com/workspace/gmail/api/release-notes)

### Inferences
- **Throughput maths, new-project tier (6,000 units/min).** All figures are per user per minute.
  - messages.get (metadata, 20 units): 300 messages/min.
  - messages.list (5 units, up to 500 IDs per page): up to 1,200 pages/min, or about 600k IDs/min. Listing is essentially free compared with fetching.
  - labels.get (1 unit): 6,000 calls/min.
  - history.list (2 units): 3,000 calls/min.
  - threads.get (40 units): 150 threads/min.
- **Full metadata scan times on the new tier** (messages.get bound): 5k msgs ≈ 17 min; 10k ≈ 33 min; 50k ≈ 2.8 h; 100k ≈ 5.6 h. Listing all IDs for 100k messages costs 200 pages × 5 = 1,000 units, about 10 seconds of quota.
- **Old tier** (15,000 units/min, 5 units per get): 3,000 msgs/min, so 100k ≈ 33 min. Moving to the new tier makes per-message fetching about 10x slower.
- The per-project limit of 1.2M units/min equals 200 users scanning at full speed at once. A popular extension could reach this before any one user hits their own limit. The scheduler should treat both limits as real.
- Design consequence: every messages.get avoided saves 20 units, while every list page costs 5 units for up to 500 messages. The cheapest strategy turns a classification signal into a server-side search, then reads only ID sets (see section 2).

### Gaps
- Could not read the live quota table in full. The costs of threads.list (10), history.list (2) and labels.get (1) come from a search extract of the official page and should be confirmed. The figures for `labels.list`, `messages.batchGet` (not an existing method) and `getProfile` were not retrieved.
- Not confirmed: which existing projects are "grandfathered", for how long, and whether a new OAuth client in an old project counts as old.

## 2. Signals available without messages.get (list + q=, resultSizeEstimate, labels.get, threads.list, history.list, threads.get)

### Takeaway
Many classification signals can be computed as **set membership** with no messages.get at all. Run messages.list with a server-side `q=` query for each signal (category:promotions, has:attachment, larger:, older_than:, list:, from:) and intersect the returned ID sets locally. Each signal then costs about 0.01 units per message (5 units per 500 IDs), against 20 units per message for a get. labels.get (1 unit) gives exact per-label counts. resultSizeEstimate is only an estimate. threads.get(format=metadata) at 40 units only pays off for threads with three or more messages. **Major caveat:** with the restricted `gmail.metadata` scope, `q=` is reportedly unusable, so this whole strategy requires `gmail.readonly` (or broader).

### Cited Findings
- The `q` parameter on messages.list "supports the same query format as the Gmail search box". The filtering guide is more careful: it says "most of" the advanced search syntax, and links to a page on UI-vs-API differences. Dates in `q` are interpreted as midnight PST, so use epoch seconds for exact cut-offs. — [users.messages.list](https://developers.google.com/gmail/api/v1/reference/users/messages/list); [Searching for messages](https://developers.google.com/gmail/api/guides/filtering)
- Useful operators: `category:promotions` (also social, updates, forums), `has:attachment`, `larger:10M`, `older_than:6m` (d/m/y), `filename:` and negation with `-`. `list:` and `from:` are standard Gmail operators. — [Mailmeteor operator guide](https://mailmeteor.com/blog/gmail-search-operators); [Google filtering guide](https://developers.google.com/gmail/api/guides/filtering)
- `q` cannot be used with the `gmail.metadata` scope. This is reported by a third-party guide citing the messages.list reference and was not confirmed on an official page in this session. — [Nylas: Gmail API search query](https://cli.nylas.com/guides/gmail-api-search-query)
- With `gmail.metadata`, `format=full` and `format=raw` are not allowed. `metadata` (IDs, labels, headers) and `minimal` remain available. `gmail.metadata` is a **restricted** scope. If restricted-scope data is stored on servers or transmitted, a security assessment (CASA) is required. — [Format reference](https://developers.google.com/gmail/api/reference/rest/v1/Format); [Choose Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- `resultSizeEstimate` is documented only as "Estimated total number of results". A developer report says it was far off from the Gmail UI's unread count for INBOX+UNREAD. threads.list `maxResults` defaults to 100 and allows up to 500. A thread in threads.list does not contain its message list; you need threads.get for that. — [users.threads.list](https://developers.google.com/gmail/api/reference/rest/v1/users.threads/list); [forum report](https://html.developreference.com/article/20488381/How+to+get+the+number+of+unread+threads+in+INBOX+with+Gmail+API)
- threads.get costs 40 units (120 for full). `format=metadata` returns "only email message IDs, labels, and email headers", and `metadataHeaders` does not change the price. — [Gmail usage limits](https://developers.google.com/workspace/gmail/api/reference/quota); [users.threads.get](https://developers.google.com/gmail/api/reference/rest/v1/users.threads/get)
- history.list (2 units) returns changes since a startHistoryId: messages added, deleted or relabelled. — [users.history.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list); [Nylas pagination/sync cookbook](https://developer.nylas.com/docs/cookbook/email/gmail-api-pagination-sync/)

### Inferences
- **Set-membership classification (recommended core technique).** For each signal S, page through `messages.list?q=S&maxResults=500` and build a bitmap or Set of IDs.
  - Example: 100k-message mailbox, 8 signals (category:promotions, category:social, category:updates, has:attachment, larger:5M, older_than:1y, list:*, is:unread). Worst case is 8 × 200 pages × 5 units = 8,000 units, about 1.3 minutes of quota. Fetching the same mailbox with messages.get takes about 5.6 hours.
  - Narrow signals return far fewer pages, so the real cost is lower.
- **Sender-level aggregation without fetching every message.**
  1. Fetch metadata for a newest-first sample (for example, the newest 1-3k messages, which takes about 3-10 minutes of quota on the new tier) to find candidate senders.
  2. For each top sender, run `q=from:addr`. One list page (5 units) returns up to 500 IDs.
  3. That gives the sender's full message set, and its size, without fetching any of those messages. resultSizeEstimate gives a rough count for one call.
  4. Apply the sender verdict to all of them.
  5. 1,000 senders × 1-2 pages ≈ 5-10k units, about 1-2 minutes.
- **`list:` / unsubscribe.** `list:` matches mail that has a List-Id header. Searching `unsubscribe` is free text and matches the body, so it is noisier but still costs only list-level quota. This is an inference from operator semantics; I did not verify that `list:` works with a wildcard.
- **labels.get** (1 unit) for INBOX, CATEGORY_PROMOTIONS, CATEGORY_SOCIAL, CATEGORY_UPDATES, CATEGORY_FORUMS, SPAM, TRASH, UNREAD and user labels gives exact messagesTotal/messagesUnread/threadsTotal counts for a dashboard almost instantly. Prefer these exact counts over resultSizeEstimate wherever the signal maps to a label. The field names come from the Gmail Label resource; that page was not re-read in this session.
- **threads.get vs messages.get break-even** (new tier): 40 vs 20 × n units. threads.get is cheaper for threads of 3 or more messages, equal at 2, and twice as expensive for single-message threads. Most bulk/newsletter mail is single-message threads, so threads.get is a poor default. Use it only where threads.list shows long threads, or where a conversation-level verdict is enough. Under the old tier (threads.get 10, messages.get 5) the break-even is the same ratio.
- threads.list (10 units/page) may return a `snippet` per thread. The Thread resource has a snippet field. I did not confirm that threads.list fills it in, so treat it as a candidate signal only.

### Gaps
- Not verified: the official list of UI-vs-API search differences, and whether `category:` works identically in the API. The page was linked from the filtering guide but could not be retrieved.
- Could not confirm from an official page that `q` is blocked under `gmail.metadata`. This decides the choice of scope and must be checked.
- No source quantified how inaccurate resultSizeEstimate is.

## 3. Gmail HTTP batch endpoint (multipart /batch/gmail/v1)

### Takeaway
Batching saves **HTTP round trips and connection overhead only, not quota**. Each inner call is charged as an individual request. The hard cap is 100 calls per batch, and Google recommends **50 or fewer**, because larger batches tend to trigger rate limiting. On the new 6,000 units/min tier, one 50-call messages.get batch costs 1,000 units, so at most about 6 such batches per minute per user.

### Cited Findings
- "You're limited to 100 calls in a single batch request. If you must make more calls than that, use multiple batch requests." — [Gmail batch requests guide](https://developers.google.com/workspace/gmail/api/guides/batch)
- "Larger batch sizes are likely to trigger rate limiting. We recommend sending batches of no more than 50 requests." The error-handling guide repeats this: do not send batches larger than 50. — [Gmail batch guide](https://developers.google.com/workspace/gmail/api/guides/batch); [Resolve errors](https://developers.google.com/workspace/gmail/api/guides/handle-errors)
- Google counts a batch of n requests as n requests, so batching saves round trips only. This comes from a third-party guide; the official batch page's wording was not retrieved in full. — [Unipile Gmail API limits](https://www.unipile.com/gmail-api-limits/)

### Inferences
- Practical pacer for the new tier: a token bucket of 6,000 units/min (100 units/s), refilled continuously.
  - Send 5-10 messages.get per batch every 1-2 s (100-200 units), rather than large bursts.
  - Large bursts of 50 × 20 = 1,000 units hit per-user rate limits (429/403 `rateLimitExceeded`) and waste retries.
  - When a 429/403 arrives, back off exponentially per inner response, because inner parts fail independently.
- For list-heavy scanning (section 2), batching several list calls (5 units each) is low-risk and cuts latency.
- **Old cliché to discard:** older tutorials (2014-2020) assume 250 units/s and 5-unit gets, and so suggest 50-call get batches back to back. On a new project that exceeds the per-minute limit in about 6 seconds.

### Gaps
- Gmail's official documents give no numbers for latency or round-trip savings. I did not find an official statement on whether one failed inner part throttles the rest.

## 4. Prioritization and progressive scanning; how commercial cleaners do it

### Takeaway
No engineering blog posts were found from Clean Email, SaneBox, Leave Me Alone, Unroll.me, Mailstrom or Trimbox describing their scan internals. The public material is marketing. It confirms metadata/header-based **grouping by sender, list, subject, date and size**, then bulk actions per group. The best pattern for quota-limited, client-only scanning:
1. Instant counts from labels.get.
2. List ID sets per signal and per sender.
3. A small newest-first metadata sample to discover senders and List-Unsubscribe headers.
4. Sender-level verdicts applied to whole ID sets.
5. Progressive UI updates.
6. Early stopping once marginal discovery of new senders falls off.

### Cited Findings
- Cleaner tools connect via OAuth (some also via IMAP). Built-in Gmail/Outlook features detect subscriptions from headers. Third-party tools "group messages by sender, list, subject, or age". — [Mailbird: email cleaner apps](https://www.getmailbird.com/email-cleaner-apps-what-they-do-and-whether-you-need-one/)
- Reviews say Clean Email "scans email headers and metadata, then it groups similar messages", with views such as Top senders, Old newsletters, Social notifications and Emails older than a year. These are review claims, not engineering documentation. — [work-management.org review](https://work-management.org/productivity-tools/clean-email-review/); [InboxPurge comparison](https://www.inboxpurge.com/blog/best-email-cleaner-for-gmail)
- Mailstrom groups mail by sender, subject, date, size and mailing list for bulk handling. — [Mailbird](https://www.getmailbird.com/email-cleaner-apps-what-they-do-and-whether-you-need-one/)
- Bulk unsubscribe is commonly driven by the List-Unsubscribe header, falling back to the sender's web page. — [aiemaily buyer's check](https://aiemaily.com/blog/are-email-cleaner-apps-worth-it)
- A 2026 vendor blog focuses on Gmail API rate limits as a constraint for cleaners. It was not read in full. — [Mailsweeper: Gmail API rate limits](https://www.mailsweeper.co/blog/gmail-api-rate-limits-why-they-matter)

### Inferences (design, quantified against the new tier)
- **Phase 0, under 1 s and about 15 units:** labels.get on about 10 system labels gives category totals and unread counts. Show these immediately.
- **Phase 1, about 1-2 min of quota and about 8k units for 100k messages:** list ID sets for 6-10 signals (section 2). Messages in no "bulk" set (for example, not promotions/social/updates/forums and no list header) are probably personal mail. They can be deprioritized for fetching or skipped entirely.
- **Phase 2, newest-first sample:** messages.get with `format=metadata&metadataHeaders=From&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Id&metadataHeaders=Subject&metadataHeaders=Date`, restricted to the bulk ID sets. Order by recency, since messages.list returns newest first. 1,500 messages ≈ 30k units ≈ 5 min.
- **Phase 3, per-sender expansion:** for each discovered sender, run `q=from:<addr>` (5 units per 500 IDs) to get every message ID, then propagate the verdict. Sample 1-3 messages per sender (20-60 units) rather than all of them.
  - Example: a sender with 400 messages costs about 25-65 units in total instead of 8,000.
- **Early termination:** track new senders discovered per 100 fetched messages. Stop or slow sampling when that falls below a threshold (for example, under 2 new senders per 100). Sender frequency in bulk mail is long-tailed, so the top few hundred senders usually cover most of the volume. This is a hypothesis; no source quantified it.
- **Progressive results:** write each batch's results to IndexedDB and stream sender cards to the UI. Show "estimated" counts from resultSizeEstimate until exact ID-set counts arrive.
- **Messages to skip entirely:** those in `-category:promotions -category:social -category:updates -category:forums` with no `list:`. This avoids most of the quota spent on personal mail, which is also the most privacy-sensitive.

### Gaps
- No engineering blogs or talks were found from Clean Email, SaneBox, Leave Me Alone, Unroll.me, Mailstrom or Trimbox on scan architecture or throughput. Their actual numbers are unknown. They are mostly server-based, which matters because servers can spread quota across time, and some predate the May 2026 tier.
- No empirical data was found on how concentrated bulk mail is among senders.

## 5. Incremental sync: Gmail history.list / watch, Microsoft Graph delta / change notifications / throttling / $batch / $select / $top

### Takeaway
**Gmail:** after the first scan, store the latest historyId and poll `history.list` (2 units/call) when the extension wakes. A 404 means the history has expired and a full resync is needed. History is retained "typically at least one week", not guaranteed. `watch` + Pub/Sub push needs a Pub/Sub subscriber, so it is not practical without a server; poll instead. **Outlook/Graph:** the limits are per app per mailbox: **10,000 requests / 10 min, 4 concurrent, 150 MB upload / 5 min**. JSON `$batch` holds at most **20** requests, and each is throttled individually. Delta query on mailFolders/{id}/messages supports `$select` and `Prefer: odata.maxpagesize`. Change notifications need a public HTTPS webhook (a server). Because Graph list responses carry properties, a Graph metadata scan is far cheaper per message than Gmail's.

### Cited Findings — Gmail
- If startHistoryId is outside the available range, history.list returns HTTP 404, and "your client must perform a full sync". History records "are typically available for at least one week and often longer", but the available period "may be significantly less and records may sometimes be unavailable in rare cases". Store the historyId of the most recent message after a full sync. — [Synchronize clients with Gmail](https://developers.google.com/workspace/gmail/api/guides/sync)
- Some third parties claim history is kept about 30 days and that 410 is also returned. Neither appears in Google's documentation, so treat 404 as the documented signal. — [Nylas pagination/sync](https://cli.nylas.com/guides/gmail-api-pagination-sync)
- watch costs 100 units and delivers via Cloud Pub/Sub. One guide recommends re-calling watch after a 404 resync. — [Nylas quotas](https://cli.nylas.com/guides/gmail-api-quotas-2026); [Unipile push guide](https://www.unipile.com/gmail-api-push-notifications/)

### Cited Findings — Microsoft Graph
- Outlook service limits apply per app ID + mailbox: **10,000 API requests in a 10-minute period**, **4 concurrent requests**, **150 MB upload (PATCH/POST/PUT) per 5 minutes**, on both v1.0 and beta. Exceeding the limits on one mailbox doesn't affect other mailboxes. — [Microsoft Graph service-specific throttling limits](https://learn.microsoft.com/en-us/graph/throttling-limits)
- A Microsoft Q&A answer (community guidance) says these per-mailbox limits are fixed and not customer-configurable. It recommends honouring Retry-After on 429 and using exponential backoff when Retry-After is absent. — [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5853334/increasing-microsoft-graph-per-mailbox-throttling)
- JSON batching "currently limited to 20 individual requests"; "requests in a batch are evaluated individually against the applicable throttling limits"; each sub-response has its own status (an individual 429 can occur inside a successful batch). — [JSON batching](https://learn.microsoft.com/en-us/graph/json-batching); [Office365itpros primer, Jul 2026](https://office365itpros.com/2026/07/21/json-batching-primer/)
- Historical Outlook batch behaviour (older, 2020-2023 reports):
  - Batches with more than 4 Outlook requests produced concurrency errors for requests beyond the 4th.
  - Another author says the effective limit was 15 in practice and later 4 for Outlook resources, and that the Outlook-specific note was removed from the docs on 28 Sep 2022.
  - Current behaviour was not confirmed. — [gsexdev 2020](https://gsexdev.blogspot.com/2020/09/the-mailboxconcurrency-limit-and-using.html); [svrooij 2023](https://svrooij.io/2023/03/03/batching-in-microsoft-graph/)
- Message delta:
  - Supports `$select`, `$top` and `$expand`, and `id` is always returned.
  - `Prefer: odata.maxpagesize={x}` sets the page size.
  - `$filter`/`$orderby` support is limited (receivedDateTime only).
  - Query options must be set on the initial request, after which you follow @odata.nextLink and finally @odata.deltaLink. — [Get incremental changes to messages](https://learn.microsoft.com/en-us/graph/delta-query-messages); [message: delta](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0)
- Change notifications:
  - They require webhook endpoints (notificationUrl plus lifecycleNotificationUrl), and both must be validated.
  - Outlook message subscriptions receive lifecycle events (subscriptionRemoved, missed); a missed notification should be followed by a delta resync.
  - Third parties put the maximum subscription lifetime for Outlook messages at about 7 days (10,080 min), or about 1 day with resource data. This was not confirmed on Microsoft's subscription page. — [Lifecycle notifications](https://learn.microsoft.com/pl-pl/graph/change-notifications-lifecycle-events); [Change notifications overview](https://learn.microsoft.com/en-us/graph/change-notifications-overview); [Hookdeck](https://hookdeck.com/webhooks/skills/microsoft-graph-webhooks.md); [Nylas](https://cli.nylas.com/guides/microsoft-graph-change-notifications)

### Inferences
- **Gmail incremental cost:** one history.list poll is 2 units, and a page covers many changes. Polling every few minutes while the extension is active costs almost nothing. Fetch metadata only for newly added messages, at 20 units each. Filter with `historyTypes=messageAdded` (and labelAdded/labelRemoved if label moves matter, for example a user archiving or moving a message out of Promotions). On a 404, fall back to the phased scan from section 4, not a blind full fetch.
- Without a server, Gmail push (watch + Pub/Sub) and Graph change notifications are both impractical, because each needs a reachable endpoint. Poll on browser startup, on popup open and on `chrome.alarms`.
- **Graph throughput maths.** 10,000 requests per 10 min is about 16.7 requests/s, with at most 4 in flight.
  - If list/delta pages return about 1,000 messages with `$select=id,from,sender,subject,receivedDateTime,isRead,inferenceClassification,hasAttachments,categories,parentFolderId`, then 100k messages ≈ 100 requests, well under 1% of the 10-minute budget.
  - The real limit becomes latency × 4 concurrency, not quota. For example, 100 pages at about 1-2 s each across 4 parallel folder/date-range partitions ≈ 30-60 s. (The ~1,000/page figure is a commonly cited `$top` maximum for messages that I could not confirm in this session.)
- **Graph `$batch`:** it does not save throttle budget, since each sub-request counts, and the concurrency cap of 4 applies. Use batches of up to 4 for Outlook to avoid concurrency 429s (a conservative choice based on the historical reports). Batching is only useful for many small per-message GETs, for example when fetching headers.
- **`internetMessageHeaders`** (needed for List-Unsubscribe on Outlook) usually has to be `$select`ed per message, which means one request per message. For 10k messages that is 10k requests, about the whole 10-minute budget. So use the same sampling strategy as Gmail: fetch headers for 1-3 messages per sender, and use `inferenceClassification` (Focused/Other) plus sender aggregation for the rest.

### Gaps
- Not confirmed: whether `internetMessageHeaders` can be `$select`ed on list or delta endpoints, and whether doing so carries extra cost. Not confirmed: the current official maximum for `$top`/maxpagesize on messages (commonly cited as 1,000).
- Not confirmed: whether Outlook still enforces 4 sub-requests per batch in practice in 2026.
- The official Graph subscription maximum lifetime for messages was not retrieved.

## 6. Local compute speed: IndexedDB patterns, Web Workers / offscreen documents in MV3, caching sender verdicts

### Takeaway
Local processing is not the bottleneck. API quota is, by two to three orders of magnitude. Still:
- Batch IndexedDB writes: one transaction per about 1,000 records, without awaiting each put.
- Never await network calls inside a transaction.
- Run heavy classification in an offscreen document or a dedicated worker, because the MV3 service worker is killed after 30 s idle.
- Persist the scan cursor and pageToken so a killed worker can resume.
- Cache verdicts per sender (and per List-Id) so repeat scans only touch new senders.

### Cited Findings
- The MV3 service worker terminates after **30 s of inactivity**, if a single request takes **more than 5 minutes**, or if a **fetch() response takes more than 30 s** to arrive. Events and extension API calls reset the idle timer. Chrome 110 removed the hard 5-minute total lifetime. — [Chrome: extension service worker lifecycle](https://developer.chrome.com/docs/extensions/mv3/service_workers/service-worker-lifecycle); [Longer extension service worker lifetimes](https://developer.chrome.com/blog/longer-esw-lifetimes)
- Putting many put() calls in one transaction without awaiting each lets IndexedDB pipeline the writes and commit once. Chunks of about 1,000 keep transactions bounded. Awaiting unrelated async work causes auto-commit and then TransactionInactiveError. — [mv3-extension.com: Keeping IndexedDB fast](https://mv3-extension.com/testing-debugging-performance-optimization/performance-profiling-optimization/keeping-indexeddb-fast-in-an-extension/)
- A general (non-extension) demo reports one transaction is about 100x faster than one transaction per record. — [W3Tweaks IndexedDB guide](https://www.w3tweaks.com/javascript/javascript-indexeddb-complete-guide/)
- Offscreen documents:
  - They share the extension's IndexedDB and are not subject to the 30 s idle eviction.
  - Only one may exist per extension at a time.
  - Creating one takes tens of milliseconds.
  - Messages are serialised, so large payloads should be passed by IndexedDB key rather than through messaging.
  - Source: a third-party MV3 guide site, not Chrome docs. — [mv3-extension.com: heavy compute outside the SW](https://mv3-extension.com/manifest-v3-architecture-extension-lifecycle/offscreen-documents-dom-access/running-wasm-and-heavy-compute-outside-the-service-worker/); [Messaging between offscreen and worker](https://mv3-extension.com/manifest-v3-architecture-extension-lifecycle/offscreen-documents-dom-access/messaging-between-offscreen-documents-and-the-worker/)
- Microsoft's Accessibility Insights team documented MV3 migration lessons, including state persistence across service-worker restarts. — [Engineering@Microsoft](https://devblogs.microsoft.com/engineering-at-microsoft/learnings-from-migrating-accessibility-insights-for-web-to-chromes-manifest-v3/)

### Inferences
- A scan paced at 100 units/s, with a fetch every second or so, keeps the service worker alive through activity. Any single fetch must still finish within 30 s; split large batches if needed.
- Long scans should checkpoint to IndexedDB after each page: the current phase, the pageToken for each signal query, the processed ID ranges and the latest historyId. Resume on `chrome.alarms` or `runtime.onStartup`.
- Store ID sets as sorted arrays or bitsets keyed by an internal integer index rather than as Sets of 16-char hex strings. 100k IDs are about 1.6 MB as strings, which is fine either way. Set intersection over 100k items takes milliseconds in a worker.
- **Sender-verdict cache:**
  - Key by normalized from-address plus List-Id. Store the verdict, confidence, last-sampled message ID, a count and a timestamp.
  - On rescan, only senders that are new or stale (for example, older than 30 days or with a changed List-Id) need sampling. This turns repeat scans into list + history work costing tens to hundreds of units.
- Classification for metadata only (headers, labels, counts) is cheap. Even 100k messages in rule-based or small-model scoring take seconds in a worker, which is negligible next to quota time. This is an inference; I did not find a benchmark.

### Gaps
- I found no official Chrome benchmarks of IndexedDB from an offscreen document vs a service worker, and no benchmark of Web Worker classification inside an offscreen document. The offscreen-document claims come from a third-party guide site.
