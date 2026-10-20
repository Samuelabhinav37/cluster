# Cluster codebase audit: scan, sorting/cleanup and security algorithms (state at e9db356, 2026-10-20)

Method: read the source at `/home/user/cluster` (HEAD `e9db356`, last 60 commits reviewed with `git log --oneline -60`). All citations are `path:line` relative to the repo root. "Verified" = read in code. "Inferred" = my reasoning from verified code, not executed against a live mailbox. `scripts/bench-pipeline.mts` was not run: `node_modules` is absent (0 entries) and the script only benchmarks the in-memory CPU stages, not network/quota (`scripts/bench-pipeline.mts:1-8`). One small offline re-implementation of the lookalike edit-distance check was run against `src/lib/data/brandDomains.json` (results in Q3; marked as such).

---

## Q1. Scan pipeline: how a scan runs, quota/time cost, caching, progressive rendering, redundancy

### Takeaway
Gmail now runs on a persistent IndexedDB mail index (cap 20,000 rows/account) filled once by `syncMailIndex` and then kept current by `history.list`; the first screen appears after ~150 `messages.get` (3,000 units), but the full first build still issues one 20-unit `messages.get` per listed message plus one per Sent message (up to ~25,000 gets / ~500k units, ≥ ~85 min at Google's 6,000/min ceiling), because "fetch one, count many" only re-orders reads, it does not skip them. Outlook has no change feed, no census and no Sent index, so it re-lists and re-reads the last 7 days on every sync and its background pass still uses the legacy 150-message scan.

### Cited Findings

**Entry points and orchestration (verified)**
- Dashboard starts one index run per provider via `startIndexSync`, under a storage lock, passing `windowDays = settings.scanWindowDays`, `cap = MAIL_INDEX_CAP`, `quickCount = DEFAULT_QUICK_COUNT`, and (Gmail only) `waitForHeadroom` — [src/dashboard/dashboard.ts:614-641](src/dashboard/dashboard.ts)
- `waitForGmailHeadroom` polls every 3 s until ledger headroom ≥ `BUILD_HEADROOM_UNITS = 1500` — [src/dashboard/dashboard.ts:604-611](src/dashboard/dashboard.ts)
- Defaults: `scanWindowDays: 180`, `maxMessagesPerProvider: 150` — [src/lib/settingsStore.ts:172](src/lib/settingsStore.ts), [src/lib/settingsStore.ts:178](src/lib/settingsStore.ts)
- Index cap `MAIL_INDEX_CAP = 20_000`; row version `MAIL_ROW_VERSION = 2` (adds To/Cc, thread, List-Id, Return-Path, Feedback-ID) — [src/lib/mailIndex.ts:14](src/lib/mailIndex.ts), [src/lib/mailIndex.ts:19](src/lib/mailIndex.ts)
- Stores: `messages`, `state`, `sent`, `census` in IndexedDB `cluster-mail-index` v3; falls back to an in-memory store if IndexedDB fails — [src/lib/mailIndex.ts:136-141](src/lib/mailIndex.ts), [src/lib/mailIndex.ts:279-291](src/lib/mailIndex.ts)
- Account switch clears the index (`getAccountId` mismatch → `store.clear`) — [src/lib/mailSync.ts:103-111](src/lib/mailSync.ts)

**`syncMailIndex` sequence (verified)**
1. If index complete and cursor present, apply the change feed (`listChangesSince`); expired cursor → drop cursor and fall through to re-list — [src/lib/mailSync.ts:120-130](src/lib/mailSync.ts)
2. `changesOnly` (background) returns after changes, risky-ids refresh and `enforceLimits` — [src/lib/mailSync.ts:132-140](src/lib/mailSync.ts)
3. Re-list when no change feed applied, window changed, or rows outdated; `pendingCursor` captured before listing so mid-build mail is replayed — [src/lib/mailSync.ts:145-170](src/lib/mailSync.ts)
4. `buildFromListing`: one list page of `FIRST_PAGE = 500`, read the newest `quickCount` (150) unknown ids **unpaced**, signal quick-ready — [src/lib/mailSync.ts:27-31](src/lib/mailSync.ts), [src/lib/mailSync.ts:257-272](src/lib/mailSync.ts)
5. Sent backfill next (`SENT_CAP = 5_000`), paced — [src/lib/mailSync.ts:185](src/lib/mailSync.ts), [src/lib/mailSync.ts:192-211](src/lib/mailSync.ts), [src/lib/mailSync.ts:274-276](src/lib/mailSync.ts)
6. Full listing up to cap; ids gone from the listing are deleted from the index — [src/lib/mailSync.ts:278-287](src/lib/mailSync.ts)
7. Without a change feed (Outlook) rows younger than `REFRESH_WINDOW_MS = 7 days` are re-read; outdated-shape rows re-read last — [src/lib/mailSync.ts:24](src/lib/mailSync.ts), [src/lib/mailSync.ts:291-306](src/lib/mailSync.ts)
8. `discoverAndCount` ("fetch one, count many"): reads in batches of `DISCOVERY_BATCH = 8`; for a sender "worth counting" (≥2 seen, or List-Id/List-Unsubscribe/promo/Precedence bulk/Auto-Submitted/CATEGORY_UPDATES|SOCIAL|FORUMS) runs one `from:(addr) newer_than:Nd` search (≤5,000 ids) and marks those ids "claimed" so they are skipped during discovery — [src/lib/mailSync.ts:436-453](src/lib/mailSync.ts), [src/lib/mailSync.ts:464-548](src/lib/mailSync.ts), [src/lib/providers/gmailProvider.ts:229-232](src/lib/providers/gmailProvider.ts)
9. **Then every claimed-but-unread id is read anyway** in the `"detail"` phase: `rest = [...discovery.pending, ...upgrade]; readInto(..., "detail")` — [src/lib/mailSync.ts:307-309](src/lib/mailSync.ts), [src/lib/mailSync.ts:547](src/lib/mailSync.ts)
10. Reads go 4-wide (`FETCH_CONCURRENCY = 4`), written in batches of `WRITE_BATCH = 25`; a failed message is logged and skipped, not fatal — [src/lib/mailSync.ts:25](src/lib/mailSync.ts), [src/lib/mailSync.ts:31](src/lib/mailSync.ts), [src/lib/mailSync.ts:412-433](src/lib/mailSync.ts)
11. Each sync ends with a risky-attachment search and `enforceLimits` (drop rows past window, then oldest past cap) — [src/lib/mailSync.ts:550-577](src/lib/mailSync.ts)
- Gmail scope of the index: `(category:promotions OR category:updates OR in:inbox) newer_than:Nd`; TRASH/SPAM/DRAFT are out of scope — [src/lib/providers/gmailProvider.ts:49-55](src/lib/providers/gmailProvider.ts), [src/lib/providers/gmailProvider.ts:70-82](src/lib/providers/gmailProvider.ts). Social and Forums tabs are not listed (also an `it.fails` "KNOWN GAP: Social-tab mail is excluded from the cleanup lane" — [src/lib/providers/gmailProvider.normalize.test.ts:117](src/lib/providers/gmailProvider.normalize.test.ts))
- `messages.get` uses `format=metadata` with From, Reply-To, List-Unsubscribe(-Post), Subject, Authentication-Results, DKIM-Signature, Precedence, Auto-Submitted plus relationship headers — [src/lib/gmailApi.ts:376-397](src/lib/gmailApi.ts)

**Quota accounting (verified)**
- Per-call cost table: batchModify/batchDelete 50, history 2, messages.get 20 (comment), default 5 — [src/lib/gmailApi.ts:16-47](src/lib/gmailApi.ts)
- Every Gmail call reserves cost in a cross-context ledger (`chrome.storage.local` + Web Lock), 60 s window, `BUDGET = 5500` (500 under Google's 6,000); storage failure halves the budget; a single call is admitted if the ledger is empty — [src/lib/gmailQuotaLedger.ts:17-24](src/lib/gmailQuotaLedger.ts), [src/lib/gmailQuotaLedger.ts:43-47](src/lib/gmailQuotaLedger.ts), [src/lib/gmailQuotaLedger.ts:89-112](src/lib/gmailQuotaLedger.ts)
- A rate-limit 403 that survives retries front-loads a full window (`penalizeGmailQuota`) — [src/lib/gmailQuotaLedger.ts:120-125](src/lib/gmailQuotaLedger.ts), [src/lib/gmailApi.ts:123](src/lib/gmailApi.ts)
- Retries: 3, base 1 s exponential with jitter, honours Retry-After capped at 10 s; retries 429, 5xx and 403 bodies matching rateLimitExceeded; retries do not re-reserve quota — [src/lib/httpRetry.ts:8-19](src/lib/httpRetry.ts), [src/lib/httpRetry.ts:23-32](src/lib/httpRetry.ts), [src/lib/httpRetry.ts:50-76](src/lib/httpRetry.ts), [src/lib/gmailQuotaLedger.ts:20-23](src/lib/gmailQuotaLedger.ts)
- Background triage and the 5-minute inbox-limits sweep skip when headroom < 1500 — [src/background.ts:114-122](src/background.ts), [src/background.ts:324-327](src/background.ts)
- Historical context: the 2026-09-06 audit established messages.get = 20 units, 6,000/min per user, ~50 concurrent requests cap, and that the old dual-lane scan cost ~13,000 units — [research/2026-09-06-gmail-quota-403-audit.md](research/2026-09-06-gmail-quota-403-audit.md) (section 1)

**Caching (verified)**
- Primary cache = the IndexedDB index, no TTL; rows live until they leave the listing/window/cap or change via history — [src/lib/mailSync.ts:285-287](src/lib/mailSync.ts), [src/lib/mailSync.ts:565-577](src/lib/mailSync.ts)
- Label-only changes (read/star/category) are applied from history events without re-reading — [src/lib/mailSync.ts:340-356](src/lib/mailSync.ts)
- Legacy warm cache `clusterMetadataCache` in `chrome.storage.local`: `MAX_ENTRIES = 2000`, mail newer than `FRESH_WINDOW_MS = 7 days` always re-fetched; still used by background for providers without an index and by the time-limits runner when the index isn't ready — [src/lib/metadataCache.ts:25-30](src/lib/metadataCache.ts), [src/background.ts:349-376](src/background.ts), [src/lib/inboxTimeLimitsRunner.ts:45-46](src/lib/inboxTimeLimitsRunner.ts)
- Risky-attachment ids are stored on index state and re-applied on read — [src/lib/mailIndex.ts:41-43](src/lib/mailIndex.ts), [src/lib/mailSync.ts:581-594](src/lib/mailSync.ts)

**Progressive rendering (verified)**
- `onQuickReady` after the first 150, `onSentReady` after Sent, `onCounted` after discovery; status line "Finding everyone who emails you: X of Y" / "Reading their mail in detail" — [src/lib/mailSync.ts:51-62](src/lib/mailSync.ts), [src/dashboard/dashboard.ts:614-699](src/dashboard/dashboard.ts)
- While a long build runs, user actions are reflected by `catchUpIndex` (replays label/delete events, reads nothing) — [src/lib/mailSync.ts:596-625](src/lib/mailSync.ts), [src/dashboard/dashboard.ts:790](src/dashboard/dashboard.ts)

**Background (verified)**
- Alarms: triage every 360 min (first after 5), Athena flush 5 min, durable jobs 5 min, datasets 1440 min, inbox-limits sweep every `INBOX_SWEEP_MINUTES = 5` — [src/background.ts:61](src/background.ts), [src/background.ts:70-74](src/background.ts)
- Triage: for providers with a built index (requires `listChangesSince` → Gmail only), `changesOnly` sync then read senders from the index; security lane = newest `SECURITY_SCAN_MAX_MESSAGES = 100` inbox messages in `SECURITY_SCAN_WINDOW_DAYS = 30` — [src/background.ts:62-63](src/background.ts), [src/lib/indexTriage.ts:28-52](src/lib/indexTriage.ts), [src/lib/indexTriage.ts:61-75](src/lib/indexTriage.ts)
- Providers without an index (Outlook always) get the legacy `buildSenderSummaries` (150 msgs) plus `buildIncrementalSenderSummaries` (Outlook delta) each cycle — [src/background.ts:357-376](src/background.ts), [src/lib/incrementalSync.ts:20-60](src/lib/incrementalSync.ts)

**Outlook (verified)**
- Lists only `mailFolders/inbox` (`$select=id`, `$top=999`, `$orderby receivedDateTime desc`), ignoring the purpose argument — [src/lib/providers/outlookProvider.ts:85-97](src/lib/providers/outlookProvider.ts)
- Per-message GET selects `sender` (not `from`), subject, flag, internetMessageHeaders, isRead, size, hasAttachments, inferenceClassification, conversationId, `$expand=attachments($select=name…)` — [src/lib/providers/outlookProvider.ts:141-156](src/lib/providers/outlookProvider.ts)
- Provider object lacks `listChangesSince`, `getChangeCursor`, `listMessageIdsFrom`, `listLabelledIds`, `listSentMessageIds`, `getSentRecord`, `getAccountId`, `listRiskyAttachmentMessageIds` — [src/lib/providers/outlookProvider.ts:681-705](src/lib/providers/outlookProvider.ts). Consequences: no census (discovery returns everything as pending, [src/lib/mailSync.ts:473-475](src/lib/mailSync.ts)), 7-day re-read on every sync ([src/lib/mailSync.ts:300](src/lib/mailSync.ts)), no index-backed background ([src/lib/indexTriage.ts:36](src/lib/indexTriage.ts)), "people you write to" only via the legacy 150-message sent query ([src/lib/providers/outlookProvider.ts:637-640](src/lib/providers/outlookProvider.ts)).

**Redundant / legacy fetch paths (verified)**
- `senderModel.METADATA_FETCH_CONCURRENCY = 5` legacy scanner still exists and is used for unindexed providers — [src/lib/senderModel.ts:199](src/lib/senderModel.ts), [src/lib/senderModel.ts:225](src/lib/senderModel.ts), [src/lib/senderModel.ts:272-297](src/lib/senderModel.ts)
- `listSentCorrespondents` (Gmail: up to 150 `messages.get` = 3,000 units, 5-wide) runs only when `sentCorrespondents` is stale (TTL 7 days); once the index has Sent mail, `applyIndexedCorrespondents` refreshes `fetchedAt`, so it is skipped for Gmail — [src/lib/gmailApi.ts:535-556](src/lib/gmailApi.ts), [src/lib/screener.ts:13-17](src/lib/screener.ts), [src/lib/screener.ts:27-49](src/lib/screener.ts), [src/lib/indexTriage.ts:128-130](src/lib/indexTriage.ts), [src/background.ts:440-446](src/background.ts)
- The research target for the index was "Full 20,000-message index: under 20 minutes on Gmail" and "Dashboard open after setup under 1 second, zero API reads" — [research/2026-10-16-smart-scanning-and-accounts.md:222-231](research/2026-10-16-smart-scanning-and-accounts.md)

### Inferences
- **messages.get count, Gmail first build** (from steps 4-9): ≈ N_listed (≤ 20,000) + N_sent (≤ 5,000). Plus list calls: ~40 pages listing + up to ~80 pages for unread/starred listings ([src/lib/mailSync.ts:476-485](src/lib/mailSync.ts)) + one `from:` search per counted sender + sent listing. Units ≈ 20 × (N_listed + N_sent) + 5 × (pages + counted senders). Worst case ≈ 400,000 + 100,000 + ~10,000 ≈ 510k units.
- **Wall time**: at Google's 6,000/min hard ceiling the 25k-get worst case cannot finish in < ~85 min; with the dashboard holding 1,500 units headroom (effective ≲ 4,000/min ≈ 200 gets/min) it is ≈ 2 h. The "< 20 minutes" target is unreachable unless the detail phase is dropped or made lazy (census-only rows) — the census already supplies counts/unread/starred per sender ([src/lib/mailSync.ts:494-508](src/lib/mailSync.ts)), and suggestions already only act on read ("checked") ids ([src/lib/suggestions.ts:18-20](src/lib/suggestions.ts)).
- **First screen**: 1 list call + 150 unpaced gets = 3,005 units; likely 10-30 s latency-bound at 4-wide (not measured).
- **Repeat Gmail scan (index complete, cursor valid)**: history.list at 2 units/page + 20 × (new in-scope messages) + 5 (risky search). Typically a few hundred units. If the historyId has expired, a full re-list (≈200 units) without re-reading known rows.
- **Repeat Outlook scan**: full inbox re-list (≤ 21 pages of 999) + a GET for every unknown message + a GET for every message younger than 7 days, on every dashboard open. No unit quota on Graph, but per-mailbox throttling applies (not handled by a ledger; Graph batching has its own Retry-After handling at [src/lib/providers/outlookProvider.ts:300-345](src/lib/providers/outlookProvider.ts)).
- Discovery batch of 8 can read up to 7 extra messages from a sender before its census lands (by design, [src/lib/mailSync.ts:439-441](src/lib/mailSync.ts)); the waste is small versus the detail phase.
- `enforceLimits` loads all 20k rows from IndexedDB on every sync including the 6-hourly `changesOnly` run ([src/lib/mailSync.ts:572](src/lib/mailSync.ts)) — CPU/memory, not quota.
- Background security scoring covers only the newest 100 inbox messages per 30 days; a mailbox receiving > 100 inbox messages per 6 h has some messages never scored by the auto-quarantine path (inferred from [src/background.ts:63](src/background.ts) + [src/lib/indexTriage.ts:73-74](src/lib/indexTriage.ts)).

### Gaps
- No timing measured; `bench-pipeline.mts` not run (no `node_modules`; and it excludes network stages by design).
- Did not verify Gmail's `from:` search precision for census (listed as open question at [research/2026-10-16-smart-scanning-and-accounts.md:233-240](research/2026-10-16-smart-scanning-and-accounts.md)).
- Whether Outlook's `size` `$select` breaks live scans is an open item in the same doc; not verified here.

---

## Q2. Sorting / filtering / cleanup: classifiers, thresholds, feedback loops, friction

### Takeaway
Classification is deterministic: first-match English subject regexes for message kind, a ~120-domain hand list for categories, a per-sender 70% majority vote for sender kind, and unread-flag "open rate" for engagement. There is no learned model; feedback is per-sender overrides, a 30-day dismissal snooze and an undo≥accept veto. Safety gating is strong on delete paths but inconsistent across Sort, time limits, rules and smart-view archive, and most automation (Screener, time limits, auto-quarantine) is off by default.

### Cited Findings

**Message kind (verified)**
- Order: OTP (unless alert/disabled/changed/new sign-in/suspicious) → shipping → receipt → social → newsletter (List-Unsubscribe) → other — [src/lib/messageKind.ts:7-26](src/lib/messageKind.ts)
- Broad tokens: shipping matches "delivery", "tracking", "arriving"; receipt matches "statement", "paid" — [src/lib/messageKind.ts:13-15](src/lib/messageKind.ts). Registered known bugs: "Free delivery" → shipping, "tracking" newsletter → shipping, "statement" newsletter → receipt, "Please verify your device" not OTP — [src/lib/algorithmAudit.test.ts:133-142](src/lib/algorithmAudit.test.ts)
- `looksLikeDisposableCode` (code phrase or 4-8 digit / 6-8 alnum token) gates OTP trash in rules — [src/lib/messageKind.ts:30-39](src/lib/messageKind.ts), [src/lib/rules.ts:157-161](src/lib/rules.ts)
- `looksAutomated` = List-Unsubscribe or Precedence bulk/list/junk or Auto-Submitted auto-* — [src/lib/messageKind.ts:53-62](src/lib/messageKind.ts)
- Optional on-device AI (Chrome Prompt API) only for "other" subjects, 25 per batch, JSON-schema constrained, in-memory cache; `aiVerdictAllowed` only lets a protected "other" (no bulk signal) move to receipt/shipping — [src/lib/aiMessageKind.ts:22-24](src/lib/aiMessageKind.ts), [src/lib/aiMessageKind.ts:77-142](src/lib/aiMessageKind.ts), [src/lib/aiMessageKind.ts:154-160](src/lib/aiMessageKind.ts)

**Sender profile and kind (verified)**
- Per-message vote: reply to your mail → person; otp/receipt/shipping by subject; social; Gmail promotion; list (List-Id/unsubscribe/forums); non-bulk → person — [src/lib/senderProfile.ts:135-146](src/lib/senderProfile.ts)
- `KIND_MAJORITY = 0.7`, else "mixed" — [src/lib/senderProfile.ts:18](src/lib/senderProfile.ts), [src/lib/senderProfile.ts:148-159](src/lib/senderProfile.ts)
- Open rate = read share of sampled rows older than `OPEN_GRACE_MS = 3 days` (UNREAD flag only) — [src/lib/senderProfile.ts:16](src/lib/senderProfile.ts), [src/lib/senderProfile.ts:251-282](src/lib/senderProfile.ts)
- Tiers: close (≥3 sent to them within 365 d), known (wrote/starred/replied/allowlist), new (<14 d), regular (machine, open ≥ 0.4), ignored (machine, open < 0.1, judged ≥ 5), else other — [src/lib/senderProfile.ts:203-211](src/lib/senderProfile.ts)
- Template key masks digits, dates, amounts, quoted names (min 3 per template) — [src/lib/senderProfile.ts:90-111](src/lib/senderProfile.ts), [src/lib/senderProfile.ts:186-201](src/lib/senderProfile.ts)
- Duplicate Message-IDs dropped and counted — [src/lib/senderProfile.ts:226-241](src/lib/senderProfile.ts)
- Company key only for non-free-mail domains with a passing aligned DKIM — [src/lib/senderProfile.ts:176-184](src/lib/senderProfile.ts)

**Suggestions (verified)**
- Only "ignored" tier → clearOld (stopped sending) / unsubscribe (has header) / mute; "regular" machine with ≥4/month and ≥5 in inbox → keepSorted — [src/lib/suggestions.ts:30-31](src/lib/suggestions.ts), [src/lib/suggestions.ts:57-86](src/lib/suggestions.ts)
- Any protected message excludes the whole sender; dismissed → hidden 30 days; undos ≥ accepts → hidden — [src/lib/suggestions.ts:105-110](src/lib/suggestions.ts), [src/lib/engagementModel.ts:20](src/lib/engagementModel.ts), [src/lib/engagementModel.ts:38-65](src/lib/engagementModel.ts)
- "Never read": ≥3 messages past grace, all unread, none protected — [src/lib/neverRead.ts:10-23](src/lib/neverRead.ts)

**Sort my inbox / taxonomy (verified)**
- 11 buckets; kind wins, then curated domain category, then Gmail Promotions — [src/lib/sortTaxonomy.ts:10-21](src/lib/sortTaxonomy.ts), [src/lib/sortTaxonomy.ts:109-115](src/lib/sortTaxonomy.ts)
- Default file-out: otp, receipt, shipping, newsletter, social, promotions; label-in-place: shopping, travel, finance, productivity, education — [src/lib/sortTaxonomy.ts:49-61](src/lib/sortTaxonomy.ts)
- Default inbox time limits: otp 1 d, promotions 1 d, social 2 d, newsletter 3 d, shopping 3 d, receipt/shipping 7 d, others stay — [src/lib/sortTaxonomy.ts:69-81](src/lib/sortTaxonomy.ts)
- Per-sender override ("never" or forced bucket) wins — [src/lib/sortTaxonomy.ts:126-137](src/lib/sortTaxonomy.ts)
- Sender kind overrides message kind (except it never creates OTP) — [src/lib/autoSort.ts:122-135](src/lib/autoSort.ts)
- `buildSortPlan` excludes only `isProtected` (starred); the full protection gate is used only as an advisory `sensitiveWhenFiled` flag — [src/lib/autoSort.ts:67](src/lib/autoSort.ts), [src/lib/autoSort.ts:89-97](src/lib/autoSort.ts)
- Domain categories: hand-curated lists (≈26 shopping, 17 travel, 19 finance, 13 social, 19 productivity incl. google.com/microsoft.com, 14 newsletter, 10 education); everything else "other" — [src/lib/domainCategories.ts:27-66](src/lib/domainCategories.ts)

**Protection policy (verified)**
- Order: starred → provider IMPORTANT/CATEGORY_PERSONAL → known correspondent (allowlist ∪ sent) → active-offer regex (expires, ends tonight, return by…) → receipt/shipping kind → sensitive subject (tax, ticket, booking, password reset, security alert…) → "other" with no bulk signal — [src/lib/protectionPolicy.ts:46-86](src/lib/protectionPolicy.ts), [src/lib/screener.ts:51-55](src/lib/screener.ts)
- Sender-wide moves (Mute, Keep sorted, Screener, Block) only exclude starred/IMPORTANT — [src/lib/protectionPolicy.ts:139-145](src/lib/protectionPolicy.ts)
- Known bugs registered: "ends tonight" promo becomes undeletable; plural "tickets"/"reservations" not protected — [src/lib/algorithmAudit.test.ts:155-165](src/lib/algorithmAudit.test.ts)

**Inconsistent gates (verified)**
- Rules: starred always excluded; trash additionally excludes IMPORTANT and non-code OTP; otherwise no transactional/known-correspondent gate (registered: "a Trash rule matches receipts the central protection policy protects") — [src/lib/rules.ts:147-171](src/lib/rules.ts), [src/lib/algorithmAudit.test.ts:321](src/lib/algorithmAudit.test.ts)
- Rule run cap default 100, max 500 per run — [src/lib/rules.ts:73-74](src/lib/rules.ts)
- Smart views: archive/count variant checks only `isProtected`; trash variant uses full gate — [src/lib/smartViews.ts:53-58](src/lib/smartViews.ts), [src/lib/smartViews.ts:74-83](src/lib/smartViews.ts)
- Inbox time limits: tag ≤100 untagged inbox messages from the last 2 days, sweep ≤300 per run; skip known senders and starred, not the transactional/sensitive gate — [src/lib/inboxTimeLimits.ts:21-26](src/lib/inboxTimeLimits.ts), [src/lib/inboxTimeLimits.ts:79-105](src/lib/inboxTimeLimits.ts), [src/lib/inboxTimeLimits.ts:129-160](src/lib/inboxTimeLimits.ts)
- Retention expiry: otp 2 d, newsletter 30 d, social 30 d, full protection gate — [src/lib/retentionPolicy.ts:9-13](src/lib/retentionPolicy.ts), [src/lib/expiryTriage.ts:20-53](src/lib/expiryTriage.ts)
- Keep newest N per sender uses the full gate — [src/lib/keepNewest.ts:10-28](src/lib/keepNewest.ts)
- Screener: holds senders not known, no protected message, not excluded — [src/lib/screener.ts:62-73](src/lib/screener.ts)

**Defaults that add friction (verified)**
- `screenerEnabled: false`, `autoQuarantineHighRisk: false`, `timeLimitsEnabled: false` — [src/lib/settingsStore.ts:188](src/lib/settingsStore.ts), [src/lib/settingsStore.ts:204](src/lib/settingsStore.ts), [src/lib/settingsStore.ts:215](src/lib/settingsStore.ts)
- README describes the flow: Sort my inbox opens a preview (bucket → sender → message, ticks, "wrong bucket?"), label-collision prompts, then "Keep sorting new mail" as a separate opt-in; every destructive action behind a confirm — [README.md:19-66](README.md); collision prompts "Reuse"/"Skip them" — [src/dashboard/sortInbox.ts:655-686](src/dashboard/sortInbox.ts)

**Unsubscribe (verified, brief)**
- RFC 2369/8058 parsing, one-click requires verified DKIM covering the List-Unsubscribe headers; mailto gated; outcome grace 3 d, observation 14 d — [src/lib/unsubscribe.ts:29-90](src/lib/unsubscribe.ts), [src/lib/mailtoGate.ts:47](src/lib/mailtoGate.ts), [src/lib/unsubscribeOutcome.ts:11-12](src/lib/unsubscribeOutcome.ts)

### Inferences
- Accuracy is bounded by English keywords and a tiny domain list: most real senders fall to "other" category; kind errors flip protection (receipt/shipping are protected, newsletter is not) so one keyword changes a message's fate. Non-English mailboxes get mostly "other" (protected if no bulk header) → low recall for cleanup, high safety.
- Open rate from UNREAD is biased: users who bulk mark-as-read look "engaged"; mail read in preview counts; mail Cluster itself filed out of the inbox stays unread and self-reinforces "ignored" (U13 in the 10-05 audit, still open).
- Protection via Gmail `IMPORTANT` is broad (Gmail marks many commercial messages important), likely suppressing many valid suggestions (whole sender excluded on any protected message, [src/lib/suggestions.ts:108-109](src/lib/suggestions.ts)).
- Sort/time limits can file a friend's "Re: tracking number" or "delivery" email out of the inbox after 7 days (only starred/known-sender exempt) — moves, not deletes, so recoverable.
- Click path estimate (not counted in UI): install → OAuth consent → dashboard quick screen → Sort my inbox → preview → (label conflicts) → confirm → optional "Keep sorting" → separately Suggestions per sender / Subscriptions / Screener opt-in. Roughly 5-8 clicks to a sorted inbox, more for unsubscribes (per-row or bulk) — inferred from README and sortInbox.ts, not walked through.
- No confidence scores exist anywhere in the sort/kind path; "confidence" is implicit (majority 0.7, open-rate cutoffs 0.1/0.4, judged ≥ 5).

### Gaps
- Did not walk the dashboard DOM to count exact clicks; `setupTab.ts`, `homeTab.ts` not fully read.
- Did not read `ruleRunner.ts`, `ruleDryRun.ts`, `bulkActions.ts`, `unsubscribe*.ts` line-by-line beyond constants.

---

## Q3. Security: every signal, weights, data sources, FP/FN risks, provider coverage, network, auto-quarantine

### Takeaway
Security is header-only rules: 11 signal kinds with ordinal weights summed into a score; a "hold" needs score ≥ 6 and either a decisive kind (blocklist or freemail brand claim) or ≥ 2 kinds, judged per message. Several registered false positives (person named Chase on gmail.com → hold; chess.com ~ chase.com) and false negatives ("Google Security" @gmail.com, "Microsoft Account Team" @outlook.com, "Apple Support" @icloud.com) remain open; the blocklist is thin (388 URLhaus hosts, empty hand seed), Outlook auth trust is still the suffix match the 10-05 audit flagged, and auto-quarantine is opt-in and Gmail/Outlook-labels only.

### Cited Findings

**Signals and weights (verified)** — weights at [src/lib/threatSignals.ts:444-459](src/lib/threatSignals.ts); score = Σweight + 1 per high-confidence signal — [src/lib/threatSignals.ts:466-471](src/lib/threatSignals.ts); risk tier high ≥ 6, elevated ≥ 3 — [src/lib/threatSignals.ts:473-477](src/lib/threatSignals.ts)

| Signal | Weight / conf | Fires when | Source |
|---|---|---|---|
| blocklisted-domain | 6 / high (=7) | sender domain or parent on blocklist | [threatSignals.ts:383-386](src/lib/threatSignals.ts) |
| freemail-brand-claim | 5 / high (=6) | display name matches a brand and sender is one of 7 free-mail domains | [threatSignals.ts:130](src/lib/threatSignals.ts), [threatSignals.ts:286-300](src/lib/threatSignals.ts) |
| lookalike-domain | 4 / high (=5) or medium (=4, combosquat) | registrable domain within edit distance ≤ 2 of a brand domain (brand label ≥ 5, domain ≥ 6), confusable skeleton match, or brand-word + lure-word combosquat | [threatSignals.ts:138-150](src/lib/threatSignals.ts), [threatSignals.ts:230-276](src/lib/threatSignals.ts) |
| failed-authentication | 3 / high (DMARC fail, =4) or medium (SPF+DKIM fail, no DMARC pass, =3) | per message | [threatSignals.ts:308-326](src/lib/threatSignals.ts) |
| brand-impersonation | 3 / medium | brand name (word-boundary regex) in display name, domain not the brand's | [threatSignals.ts:168-178](src/lib/threatSignals.ts), [threatSignals.ts:299](src/lib/threatSignals.ts) |
| reply-to-mismatch | 3 / medium | Reply-To on one of 7 free-mail domains, different from From | [threatSignals.ts:340-352](src/lib/threatSignals.ts) |
| risky-attachment | 3 / medium | risky extension and DMARC not pass | [threatSignals.ts:360-365](src/lib/threatSignals.ts) |
| identity-change | 3 | familiar sender (≥3 msgs over ≥30 d) with new DKIM/Reply-To domain; new domains promoted after 7 d re-observation | [senderLedger.ts:42-47](src/lib/senderLedger.ts), [senderLedger.ts:139](src/lib/senderLedger.ts) |
| punycode-domain | 2 / medium | any `xn--` label in sender domain | [threatSignals.ts:367-371](src/lib/threatSignals.ts) |
| lure-language | 2 / medium | subject regex (suspended/locked, verify within N hours, unusual sign-in…) | [threatSignals.ts:332-338](src/lib/threatSignals.ts) |
| link-mismatch | 4 | only from manual "Deep scan" (format=full body fetch), Gmail-only | [threatSignals.ts:36-40](src/lib/threatSignals.ts), [linkMismatch.ts](src/lib/linkMismatch.ts), [gmailApi.ts:826-832](src/lib/gmailApi.ts), [README.md:107-109](README.md) |

**Verdict / hold rule (verified)**
- `HOLD_SCORE = 6`, `WARN_SCORE = 3`; hold requires a floor kind (blocklisted-domain, freemail-brand-claim) or ≥ 2 distinct kinds — [src/lib/verdict.ts:62-66](src/lib/verdict.ts), [src/lib/verdict.ts:186-192](src/lib/verdict.ts)
- Known correspondent with no auth failure drops brand/lookalike/punycode signals — [src/lib/verdict.ts:67-72](src/lib/verdict.ts), [src/lib/verdict.ts:148-159](src/lib/verdict.ts)
- Each message held only on sender-address signals plus its own — [src/lib/verdict.ts:175-181](src/lib/verdict.ts)
- Review loop: released −1, confirmed +1 — [src/lib/quarantineReview.ts:30-36](src/lib/quarantineReview.ts), [src/lib/verdict.ts:161-168](src/lib/verdict.ts)
- Examples (computed from weights): lookalike alone = 5 → warn; lookalike + lure = 7, 2 kinds → hold; brand-impersonation + SPF/DKIM fail = 6 → hold; freemail-brand-claim alone = 6, floor → hold; blocklist alone = 7 → hold.

**Auto-quarantine (verified)**
- Opt-in (`autoQuarantineHighRisk` default false); runs in the 6-hourly triage on the security lane; skips protected and already-held ids — [src/lib/settingsStore.ts:204](src/lib/settingsStore.ts), [src/background.ts:229-274](src/background.ts), [src/background.ts:405](src/background.ts)
- Gmail action: apply "suspicious" Cluster label and remove INBOX (no delete) — [src/lib/providers/gmailProvider.ts:338-341](src/lib/providers/gmailProvider.ts); Outlook equivalent via category/messageRule per README — [README.md:96-106](README.md)

**Authentication parsing (verified)**
- Tokenised RFC 8601 parser (comments stripped, per-resinfo method), DKIM "any pass wins" — [src/lib/emailAuth.ts:64-170](src/lib/emailAuth.ts) (commit `2089ab3`)
- Trust: Gmail only `mx.google.com`; Outlook any authserv-id equal to/ending in `outlook.com` or `protection.outlook.com`; first trusted header selected — [src/lib/emailAuth.ts:31-50](src/lib/emailAuth.ts)

**Data sources (verified)**
- Brand list: 37 brands / 70 domains; google includes `gmail.com`, microsoft includes `outlook.com`, apple includes `icloud.com` — [src/lib/data/brandDomains.json](src/lib/data/brandDomains.json)
- Remote patch may only add domains to existing brands, must be Ed25519-signed (`trust="allow"`); block lists accept unsigned only when no key ("no-key"), but a key ships — [src/lib/threatSignals.ts:90-124](src/lib/threatSignals.ts), [src/lib/datasetSignature.ts:26-29](src/lib/datasetSignature.ts), [src/lib/datasetSigningKey.ts:13](src/lib/datasetSigningKey.ts)
- Malware blocklist: 388 domains from URLhaus hostfile (2026-08-29); hand seed empty — [src/lib/data/malwareDomains.generated.json](src/lib/data/malwareDomains.generated.json), [src/lib/blocklistSeed.ts:11-14](src/lib/blocklistSeed.ts)
- Spam list: 10,764 domains (8,368 disposable-email + 2,396 StopForumSpam toxic), used for "Suggested spam" — [src/lib/data/spamDomains.generated.json](src/lib/data/spamDomains.generated.json), [src/lib/spamSuggestions.ts:50](src/lib/spamSuggestions.ts)
- Confusables: ~20 Cyrillic/Greek letters + 0/1/5 digits, applied to domains only — [src/lib/threatSignals.ts:188-199](src/lib/threatSignals.ts)
- Free-mail sets disagree: threatSignals uses 7 domains; `freeMail.ts` has 16 (adds googlemail, ymail, live, msn, me, mac, proton.me, gmx, mail.com) — [src/lib/threatSignals.ts:130](src/lib/threatSignals.ts), [src/lib/freeMail.ts:1-21](src/lib/freeMail.ts)
- Risky attachment extensions: html, htm, iso, img, docm, xlsm, pptm + double-extension; Gmail via `filename:` search, Outlook via inline attachment names — [src/lib/riskyAttachments.ts:17-37](src/lib/riskyAttachments.ts), [src/lib/gmailApi.ts:200-210](src/lib/gmailApi.ts)

**Registered FP/FN bugs (verified as `it.fails`)** — [src/lib/algorithmAudit.test.ts:194-211](src/lib/algorithmAudit.test.ts)
- FP: person named Chase on gmail.com scored HIGH; chess.com flagged as chase.com lookalike; "Start-Ups Weekly" matches UPS.
- FN: "Microsoft Account Team" @outlook.com, "Google Security" @gmail.com, "Apple Support" @icloud.com not flagged.

**My offline lookalike re-check (re-implemented `editDistance` ≤ 2 vs the 70 brand domains, label ≥ 5, domain ≥ 6; not the real module)** — would flag legitimate or unrelated domains: chess.com, chime.com, case.com (~chase.com); discovery.com (~discover.com); adobe.io (~adobe.com); amazon.fr (~amazon.ca); google.ca (~google.com); fedex.ca (~fedex.com); linkedin.cn; tmobile.com (~t-mobile.com); usps.gov (~uscis.gov); apply.com/ample.com (~apple.com). All would receive "high" confidence per [src/lib/threatSignals.ts:251](src/lib/threatSignals.ts) (score 5 → warn; any second kind → hold).

**Network calls (verified)**
- Hosts: gmail.googleapis.com, graph.microsoft.com, login.microsoftonline.com, samuelabhinav37.github.io (datasets, daily, ≥6 h min interval); optional `https://*/*` for user-approved one-click unsubscribe; Athena endpoints only under managed policy — [manifest.json:31-38](manifest.json), [src/lib/remoteDataset.ts:12-17](src/lib/remoteDataset.ts), [src/lib/athenaIntegration.ts:38-139](src/lib/athenaIntegration.ts)
- Sender favicons fetched from `www.google.com/s2/favicons?domain=…` per sender domain via `<img>` — [src/lib/senderLogos.ts:139-153](src/lib/senderLogos.ts), [src/dashboard/senderTile.ts:35](src/dashboard/senderTile.ts). Disclosed in [docs/privacy.md:56-57](docs/privacy.md) but contradicted by the module header "zero network" at [src/lib/senderLogos.ts:1-10](src/lib/senderLogos.ts) and omitted from SECURITY.md's destination list [SECURITY.md:149-156](SECURITY.md).
- SSRF guard for unsubscribe/Athena: HTTPS only, no creds, no loopback/RFC1918/link-local/ULA — [src/lib/netGuard.ts:1-67](src/lib/netGuard.ts)
- OAuth scopes: gmail.modify + gmail.settings.basic; `mail.google.com` only for opt-in fast delete — [manifest.json:41-44](manifest.json), [src/lib/gmailApi.ts:612-623](src/lib/gmailApi.ts)

**Provider coverage (verified)**
- Gmail-only: risky-attachment search, Deep scan/link-mismatch, census, index-backed background, Sent index ([src/lib/providers/outlookProvider.ts:681-705](src/lib/providers/outlookProvider.ts), [README.md:107-109](README.md)). Outlook reads `sender` not `from` ([src/lib/providers/outlookProvider.ts:141](src/lib/providers/outlookProvider.ts)).
- Gmail security lane is `in:inbox` only; mail Cluster filed out of the inbox is not re-scored — [src/lib/providers/gmailProvider.ts:51](src/lib/providers/gmailProvider.ts), [src/lib/providers/gmailProvider.ts:58-67](src/lib/providers/gmailProvider.ts)

### Inferences
- Brand display-name matching on common words (chase, discover, apple, zoom, fidelity, ups, amazon) + freemail floor rule = holds of ordinary first-time personal mail (e.g. "Chase Miller" @gmail.com scores 6 with a floor kind). Known-correspondent suppression only helps once you have written to them.
- The highest-value impersonations (brand name from the brand's own free-mail service) score 0 because gmail.com/outlook.com/icloud.com are listed as brand domains.
- Display names are not normalised (no NFKC, zero-width or bidi stripping; confusables applied to domains only), so "PayPaI", "Pay​Pal" evade brand matching (consistent with 10-05 audit TL;DR #5).
- Outlook `endsWith(".outlook.com")` trust plus `find` (first match) may accept an attacker-inserted header with an outlook-like authserv-id, depending on header order Graph returns (not verified live).
- The URLhaus slice targets malware distribution hosts, not sender domains, so `blocklisted-domain` will rarely fire on From addresses; the empty hand seed means the 7-point decisive signal is mostly dormant.
- Missing common attachment vectors: .svg, .zip/.rar/.7z (contents invisible), .one, .lnk, .hta, .msi, .xlam (the 10-05 audit proposed several).
- Risk weights are ordinal, uncalibrated, and no precision/recall was ever measured.

### Gaps
- Did not read `senderModel.ts` signal-merge code (how identity signals are taken across a sender's messages) or `securityTab.ts` scoring scope in the dashboard.
- Live Outlook Authentication-Results shape remains unverified (also open in the 10-05 audit).
- The google.com/s2 favicon leak's user-facing toggle (if any) not checked.

---

## Q4. Tests / evaluation: is there a labelled precision/recall set?

### Takeaway
No. There is a synthetic fixture builder, safety invariants and a register of 20+ `it.fails` known bugs, but no labelled corpus and no precision/recall metrics; the 10-05 audit's evaluation plan (C.4) is not implemented.

### Cited Findings
- `algorithmAudit.test.ts` = invariants (`it`) plus known bugs (`it.fails`) built through the real pipeline via `src/test/mailFixtures.ts` — [src/lib/algorithmAudit.test.ts:1-14](src/lib/algorithmAudit.test.ts)
- Safety invariant suite: nothing protected offered for deletion across By-domain, expiry, trim, smart-view trash, unsubscribe cleanup; never-opened excludes known correspondents — [src/lib/algorithmAudit.test.ts:53-119](src/lib/algorithmAudit.test.ts)
- Open `it.fails`: kind (133-142), protection (155-165), threat (194-211), scan 404 (231), shared-platform grouping (253), subscriptions (277-284), rules vs protection (321), sampling-dependent scoring (340) — [src/lib/algorithmAudit.test.ts](src/lib/algorithmAudit.test.ts); plus `gmailProvider.normalize.test.ts:74,117` and `nonfunctional/robustness.test.ts:132`
- `pipeline.contract.test.ts` is a single shape contract: "feeds every downstream consumer a well-formed scan" — [src/lib/pipeline.contract.test.ts:67-68](src/lib/pipeline.contract.test.ts)
- Proposed but absent: labelled corpus (~300 items), `evaluation.test.ts` with per-class P/R floors (protection recall ≥ 0.99, threat-high precision ≥ 0.9, OTP precision ≥ 0.95), adversarial survival suite, local "Accuracy check" panel — [research/2026-10-05-algorithm-audit-and-upgrades.md:787-826](research/2026-10-05-algorithm-audit-and-upgrades.md)
- Network egress is pinned by test — [SECURITY.md:167-170](SECURITY.md) (`src/lib/networkEgress.test.ts`)

### Inferences
- The "scan 404 fails entire scan" `it.fails` applies to the legacy `senderModel` path; the index path already skips failed messages ([src/lib/mailSync.ts:419-424](src/lib/mailSync.ts)).
- Without a corpus, the many hard-coded thresholds (0.7 majority, 0.1/0.4 open rate, edit distance 2, HOLD 6) cannot be tuned or regressed.

### Gaps
- Test suite not executed (no `node_modules`); pass/fail state of `it.fails` assumed from code.

---

## Q5. What prior research proposed vs implemented vs open

### Takeaway
Header/auth parsing, dataset signing, combosquat/punycode, the explicit hold rule, AI guard rail, the mail index, sender profile and unsubscribe verification shipped; unified protection, two-signal protection, brand model v2 (free-mail split, common-word stop list), identity normalisation, Outlook trust fix, security-lane coverage, feature-based kinds, language packs, the learned per-user layer and the evaluation harness are still open.

### Cited Findings (10-05 audit U1-U16, [research/2026-10-05-algorithm-audit-and-upgrades.md:671-701](research/2026-10-05-algorithm-audit-and-upgrades.md))

| Item | Status | Evidence |
|---|---|---|
| U1 tokenised AR parser | Done | [src/lib/emailAuth.ts:64-170](src/lib/emailAuth.ts); commit `2089ab3` |
| U2 Outlook trust boundary / read `from` | Open | suffix trust [src/lib/emailAuth.ts:36-41](src/lib/emailAuth.ts); `$select=sender` [outlookProvider.ts:141](src/lib/providers/outlookProvider.ts) |
| U3 identity normalisation | Partial (punycode decode + small domain confusables) | [threatSignals.ts:188-199](src/lib/threatSignals.ts), [threatSignals.ts:242](src/lib/threatSignals.ts); display name raw [threatSignals.ts:173-178](src/lib/threatSignals.ts) |
| U4 brand model v2 | Partial: combosquat done (`c1d15f8`); free-mail still in brand lists; no common-word stop list | [brandDomains.json](src/lib/data/brandDomains.json); `it.fails` [algorithmAudit.test.ts:194-211](src/lib/algorithmAudit.test.ts) |
| U5 rule-table combining | Partial: decisive/2-kind hold rule (`7904555`) | [verdict.ts:186-192](src/lib/verdict.ts) |
| U6 sender-rate first contact | Partial: sender ledger familiarity (`a01dfce`); firstContact unchanged | [senderLedger.ts:42-50](src/lib/senderLedger.ts), [firstContact.ts:17-37](src/lib/firstContact.ts) |
| U7 one protection policy everywhere | Open | [autoSort.ts:67](src/lib/autoSort.ts), [smartViews.ts:57](src/lib/smartViews.ts), [rules.ts:156-161](src/lib/rules.ts), [inboxTimeLimits.ts:88](src/lib/inboxTimeLimits.ts) |
| U8 two-signal protection/expiry | Open | [protectionPolicy.ts:64-76](src/lib/protectionPolicy.ts); `it.fails` [algorithmAudit.test.ts:155](src/lib/algorithmAudit.test.ts) |
| U9 kind as scored features | Open (sender-majority vote added instead) | [messageKind.ts:18-26](src/lib/messageKind.ts), [senderProfile.ts:148-159](src/lib/senderProfile.ts) |
| U10 language packs | Open | English-only regexes [messageKind.ts:7-16](src/lib/messageKind.ts) |
| U11 per-user learned layer | Open | no model module exists; [engagementModel.ts](src/lib/engagementModel.ts) counts only |
| U12 AI guard rails | Done | [aiMessageKind.ts:154-160](src/lib/aiMessageKind.ts) |
| U13 engagement v2 | Partial (index-based open rate with 3-day grace); Cluster-filed mail not excluded | [senderProfile.ts:251-282](src/lib/senderProfile.ts) |
| U14 signed datasets | Done (`e904a5a`, `54effb0`) | [datasetSignature.ts:26-29](src/lib/datasetSignature.ts), [remoteDataset.ts](src/lib/remoteDataset.ts) |
| U15 auth-gated categories | Open | [sortTaxonomy.ts:109-115](src/lib/sortTaxonomy.ts) has no auth input |
| U16 security scan sees filed mail | Open | [gmailProvider.ts:51](src/lib/providers/gmailProvider.ts) |
| Small: .svg/.lnk/.one/.hta/.msi/.xlam attachments | Open | [riskyAttachments.ts:17](src/lib/riskyAttachments.ts) |
| Evaluation harness C.4 | Open | Q4 |

**Sender deep-dive report ranks** ([research/reports/Cluster sender algorithm deep dive.md](research/reports/Cluster%20sender%20algorithm%20deep%20dive.md), "Ranked recommendations")
- Rank 1 header capture: done (`MAIL_ROW_VERSION 2`, [mailIndex.ts:16-19](src/lib/mailIndex.ts)); rank 2 sender profile: done but pure/in-memory rather than separate IndexedDB stores, and the four "known" stores (knownSenders, sentCorrespondents, senderLedger, engagement) were not retired ([senderProfile.ts:1-5](src/lib/senderProfile.ts), [screener.ts:51-55](src/lib/screener.ts), [firstContact.ts](src/lib/firstContact.ts)); rank 3 coverage: Gmail done (index + history + Sent), Outlook not; rank 4 decayed "who matters" accumulators: open (tiers are rule-based, [senderProfile.ts:203-211](src/lib/senderProfile.ts)); rank 5 Important strip: not found in code (inferred from no matching module); rank 6 impostor checks (contact-name gate, fake thread, correspondent lookalike): open; rank 7 sender kind + template key: done (`1980de6`, `77059bb`); rank 8 corrections/learning: only overrides + dismiss snooze; rank 9 unsubscribe verification: done (`57744fe`, `293f570`, [unsubscribeOutcome.ts](src/lib/unsubscribeOutcome.ts)); rank 0 local metrics/replay harness: open.

**Unsubscribe/grouping/filing report** ([research/reports/Cluster unsubscribe grouping and filing.md](research/reports/Cluster%20unsubscribe%20grouping%20and%20filing.md))
- Implemented per git log: backstop filter, verify after grace then Trash, Suggestions v2, filing within 10 min + 5-min sweep, mailto send with confirmation sheet, Senders filters/sorts, template lines (commits `fa7be9a`, `1f8ce68`, `293f570`, `ef764d1`, `fca7041`, `fbfa75c`, `bb508d6`, `c75133e`, `20bc613`, `4acf683`); "Filed today" record and local counters not verified in code.

**Smart scanning doc** ([research/2026-10-16-smart-scanning-and-accounts.md:205-220](research/2026-10-16-smart-scanning-and-accounts.md))
- Steps 2-6 (headers, index, move consumers, live sync, claim phase + 20k cap) done for Gmail (`8433174`, `c4e6e45`, `3898181`, `10adad0`, `510e73d`); step 1 (Outlook size/from live check) and Graph delta in the index, steps 7-9 (multi-account switcher) open; README still says one account per provider ([README.md:96-99](README.md)).

### Inferences
- The highest-leverage open items for a plan: (a) make the detail phase lazy so first-build quota drops from ~N to ~senders; (b) Outlook index parity (delta + sent); (c) brand model v2 + display-name normalisation + common-word gate (fixes all six registered threat FP/FN); (d) one protection policy; (e) evaluation corpus with P/R floors before any learned layer.

### Gaps
- Earlier roadmap docs (2026-08/09, 10-05 walkthrough, 10-10 UX docs) were not cross-checked item by item.
