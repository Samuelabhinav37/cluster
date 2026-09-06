# Gmail 403 `rateLimitExceeded` during scan — audit + fix research

**Date:** 2026-09-06
**Trigger:** live testing showed `Couldn't load your mail (… 403 … rateLimitExceeded)` on the
dashboard's first scan. Commit `3ee215f` on `fix/gmail-rate-limit-retry` added retry-on-403 and
trimmed the security lane; a follow-up WIP (`quotaLimiter.ts`, uncommitted) tries to pace calls.
This doc establishes the real cause and what actually fixes it.

---

## 1. Root cause — the quota math, corrected

The code and its comments assume **`messages.get` costs 5 quota units**. It does not.

| Gmail API method            | Real cost (units) | What the code assumes |
|-----------------------------|-------------------|-----------------------|
| `messages.get` (incl. `format=metadata` — format changes payload size, **not** cost) | **20** | 5 |
| `messages.list`             | 5                 | 5 (ok)                |
| `messages.batchModify`      | 50 (flat)         | "flat 5" (comment)    |
| `messages.batchDelete`      | 50 (flat)         | —                     |
| `history.list`              | 2                 | —                     |
| `labels.list`               | 1                 | 5 (over-reserved, safe)|
| `settings.filters.list`     | 1                 | —                     |
| `settings.filters.create/delete` | 5            | —                     |

**Per-user limit (new GCP projects, which `project-g-506701` is): 6,000 quota units per user
per minute.** Older projects were grandfathered at 15,000; ours is not. There is also a
**hard cap of ~50 concurrent requests per mailbox** (separate from quota — trips
`userRateLimitExceeded` even with units to spare).

Sources:
- <https://developers.google.com/gmail/api/reference/quota>
- <https://www.unipile.com/gmail-api-limits/>
- <https://developer.nylas.com/docs/cookbook/email/gmail-api-quotas/>

### Cost of one dashboard scan (as of `3ee215f`, default settings)

`scanAndRender()` runs two `buildSenderSummaries` passes sharing one in-memory metadata cache:

| Lane      | list | `messages.get` (20u each)        | Units |
|-----------|------|---------------------------------|-------|
| Cleanup   | 5    | `maxMessagesPerProvider` = **500** → 500 × 20 | **10,005** |
| Security  | 5    | `min(500, 250)` = 250, minus cache overlap ≈ 150 fresh → 150 × 20 | **~3,005** |
| **Total** |      |                                 | **~13,000** |

That is **~2.2× the 6,000/min ceiling in a single scan**, before any burst effects. On a
reasonably full mailbox the 403 is **deterministic, not transient**. The background triage adds
more on top: `listSentCorrespondents` (300 × 20 = 6,000u), the rule runner, and the screener.

The WIP defaults (cleanup 250, security 150) bring it to ~5,000 + ~2,000 ≈ **7,000 units** —
still over 6,000.

### Why the current retry doesn't save it

`fetchWithRetry`: `DEFAULT_MAX_RETRIES = 3`, `MAX_RETRY_WAIT_MS = 10_000`. Worst-case total
wait ≈ 30 s. A **fully exhausted per-minute window needs up to 60 s** to recover, and the scan
is 2× over budget so the window is exhausted hard. Three 10-s retries can't clear it; the whole
scan fails and the "Retry" button just re-triggers the same over-budget scan.

### Why the WIP `quotaLimiter.ts` doesn't save it either

Right idea (rolling-window limiter, injectable clock/sleep — good, testable). Wrong constants:

```
GMAIL_QUOTA_BUDGET_PER_MIN = 4000   // real ceiling is 6000
GMAIL_CALL_COST = 5                 // real messages.get cost is 20
```

Effective allowance: 4000 / 5 = **800 calls/min**. Safe allowance: 6000 / 20 = **300 calls/min**
(less, once list + batchModify + filter calls are also drawn from the same window). The limiter
as written is ~2.6× too permissive — it would still 403.

Also: a single flat `GMAIL_CALL_COST` can't be right when the same window pays 20 for a get, 5
for a list, 50 for a batchModify. The limiter needs a per-call cost argument.

---

## 2. The real lever: fewer `messages.get` calls

6,000 units/min ÷ 20 = **300 `messages.get` per minute** is the hard sustainable rate, and less
after list/modify overhead. Everything below is about getting under that or spreading across
more minutes.

### A. Correct the pacing limiter (keep the WIP, fix the numbers)

- Pass real per-method cost into `gmailQuota.take(cost)`: 20 for get, 5 for list, 50 for
  batchModify/batchDelete, 1 for labels/filters-list, 5 for filters-create/delete.
- Budget ≈ **5,200/min** (a ~13% safety margin under 6,000, room for the retry layer).
- Result: a 500-message first scan simply **takes ~2 minutes instead of 403ing**. Acceptable
  with the existing progress text ("Scanning… 142/500"). This is the minimum viable fix.
- Keep concurrency at 5–10 (well under the 50-concurrent cap; not the cause, but don't regress).

### B. Persist the metadata cache across scans/sessions  ← biggest recurring-use win

Today `scanCache` is a `Map` created fresh every `scanAndRender()`. Every dashboard open
re-fetches **every** message's metadata. Message metadata that matters here (From, Subject,
List-Unsubscribe, auth results, labels, internalDate, size) is **immutable** except `labelIds`
(read/star/inbox can change).

- Add a `chrome.storage.local` cache keyed by `gmail:<messageId>` → `NormalizedMessageMetadata`,
  with an LRU / size cap (e.g. 5,000 entries ≈ a few hundred KB).
- On scan: `listMessageIds` (cheap, 5u/page) to get the id set, then `messages.get` **only for
  ids not in the cache**.
- Re-fetch `labelIds` cheaply for cached ids that need freshness — or accept slightly stale
  star/read state between scans (a full rescan button forces it).
- Effect: first scan pays full freight (paced by A); every scan after pays ~20u × (new mail
  since last scan), typically a handful.

### C. Wire the incremental (`history.list`) path into the dashboard

`listIncrementalMessages` + `buildIncrementalSenderSummaries` already exist and are used by
`background.ts` — but the **dashboard** calls `buildSenderSummaries`, which always does a full
`listCandidateMessages`. After a baseline, `history.list` (2u) returns only changed message ids;
combined with B, a warm rescan costs almost nothing.
- Caveat: history is Inbox-scoped and expires (~1 week / bounded depth) → needs the existing
  `reset` fallback to a full scan. Already handled in `listIncrementalMessages`.
- Cleanup lane query is `category:promotions OR category:updates`, not Inbox-only, so history
  filtering needs care (a promo mail auto-skipping the inbox wouldn't show in `labelId:INBOX`
  history). Simplest: keep cleanup on full-list + persistent cache (B); use history only for the
  security/Inbox lane (already its design).

### D. Lower the default first-scan size

`maxMessagesPerProvider` default 500 is too big for a 6,000/min budget as a *synchronous* scan.
Options, not mutually exclusive:
- Default to **200**, expose "scan more" in Settings (already partly there).
- Or keep 500 but make the first scan explicitly multi-minute + resumable (A + a checkpoint).
- Security lane: 150 is fine; with the shared cache its marginal cost is small.

### E. HTTP batching (`/batch`) — helps concurrency, NOT quota

Gmail's `/batch` endpoint packs up to 100 sub-requests into one HTTP call. **Quota is still
billed per sub-request** (100 gets in a batch = 2,000 units). So batching:
- ✅ removes the 50-concurrent-request risk, cuts TLS/RTT overhead, fewer `fetch` calls
- ❌ does nothing for the 6,000-units/min ceiling — which is our actual wall
- ⚠️ adds multipart/mixed request + response parsing, a chunk of code
Verdict: **not a priority.** Revisit only if concurrency-reason `userRateLimitExceeded` shows
up after A–D.

### F. Graceful terminal handling

When paced retries still can't place a call within the window:
- checkpoint partial progress (render what scanned so far), show "Gmail quota reached — resuming
  in ~45 s", auto-resume via `chrome.alarms` or a timer. Don't throw away the whole scan.
- The `showScanError` "wait about a minute, then rescan" copy from `3ee215f` is the fallback if
  auto-resume isn't built.

---

## 3. Recommended sequence

1. **Fix `quotaLimiter.ts` constants + per-call cost arg**, wire real costs at each `gmailFetch`
   call site (or map path→cost inside `gmailFetch`). Add the unit test the WIP is missing
   (rolling window prunes, waits, resumes). → stops the 403, first scan just gets slower.
2. **Persist the metadata cache** to `chrome.storage.local` with a cap. → warm rescans become
   near-free; the recurring-use story stops being "re-scan the whole mailbox every open".
3. **Drop default `maxMessagesPerProvider` to ~200**, keep the Settings override. → first scan
   under ~1 window even before the cache warms.
4. Terminal-case auto-resume (F) if step 1's slower scan still feels bad on big mailboxes.
5. Dashboard incremental/`history.list` (C) only if 2 + 3 aren't enough. Batching (E) only if a
   concurrency-reason limit appears.

Steps 1–3 are the fix. 4–5 are polish / contingency.

### Implemented 2026-09-06 (branch `fix/gmail-rate-limit-retry`)

1. ✅ `quotaLimiter.ts` header + wiring corrected. `gmailApi.ts` now has `gmailQuotaCost(path,
   method)` returning the real per-method cost (get 20, list 5, batchModify/Delete 50, history 2,
   labels/filters-list 1, create/delete 5); `gmailFetch` reserves that much per call from one
   `QuotaLimiter(5000/min)`. `quotaLimiter.test.ts` (+6) and `gmailQuotaCost` tests (+3) added.
2. ✅ `metadataCache.ts` — `chrome.storage.local`-backed metadata cache, 4,000-entry cap, drops
   anything received in the last 14 days on load (so star/read drift can't reach a bulk action).
   Wired into the dashboard scan (load → scan → save; explicit "Rescan" clears it first) and the
   background triage. `metadataCache.test.ts` (+7).
3. ✅ Default `maxMessagesPerProvider` 500 → 250; background `SECURITY_SCAN_MAX_MESSAGES` 250 →
   150; `listSentCorrespondents` default 300 → 150. Misleading "5 units" comments corrected in
   `gmailApi.ts`, `senderModel.ts`, `settingsStore.ts`.

typecheck + lint + 386 tests + build green. **Not yet live-tested in-browser.**
Steps 4 (terminal auto-resume) and 5 (dashboard `history.list`) not done — contingency only.

## 4. Loose ends found while auditing

- `gmailApi.ts:9` comment ("~5 query cost units", "6,000 on this project" as the *unit* count) —
  rewrite: get = 20, list = 5, batchModify = 50; ceiling = 6,000 units/user/min.
- `gmailApi.ts:260` comment "batchModify's flat per-call quota cost (vs. per-message for /trash)"
  — true in direction (50 flat vs 5×N) but not "flat 5". Reword.
- `senderModel.ts:155` comment "Each messages.get costs 5 Gmail quota units" — wrong, 20.
- `listSentCorrespondents` (300 gets = 6,000u by itself) runs in background triage right after a
  full scan — it alone can exhaust a fresh window. Should draw from the same limiter and/or be
  cut hard (100?) / cached.
- Once the limiter is real, `fetchWithRetry`'s 403 branch becomes a rare backstop rather than
  the primary defense — keep it, but the limiter is what should carry the load.
