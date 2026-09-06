# Cluster — how the code works, and its time / space complexity

**Date:** 2026-09-06
**Method:** static read of every `src/` module + a synthetic bench of the pure
pipeline (`scripts/bench-pipeline.mts`, run with `npx tsx`, `--expose-gc`).

**Bottom line:** Cluster is **network-bound, not CPU-bound.** Every in-memory
stage is linear in the number of scanned messages with small constants — the
whole pipeline processes a realistic scan (300–1,000 messages) in **under
100 ms**. The wall-clock cost of a scan is entirely Gmail's quota ceiling
(~30–45 s for a cold default scan; see the quota audit). Nothing in the
processing layer is superlinear in a way that matters at the scan sizes the
app actually runs at.

---

## 1. Architecture

### Two runtime contexts, one shared store

| Context | File | Role |
|---|---|---|
| **Service worker** | `src/background.ts` | 3 alarms: triage (6 h), Athena flush (5 min), durable-jobs resume (5 min). Runs the same scan pipeline headless, sets the toolbar badge, applies standing rules / screener / quarantine. |
| **Dashboard page** | `src/dashboard/*.ts` | The UI. `main()` → `scanAndRender()` → render 7 tabs. All user actions. |
| **Shared state** | `chrome.storage.local` | `clusterSettings` (schema-versioned, `migrateSettings`), `clusterMetadataCache`, `clusterGmailQuotaLedger`, Athena queue, rule-completion ledger. Web Locks (`storageLock.ts`) serialise cross-context RMW. |

### Layers (no framework — plain TS modules + DOM)

```
providers/         gmailProvider · outlookProvider · msalAuth   (all network I/O)
  └ gmailApi.ts    every Gmail REST call, funnelled through gmailFetch
       └ gmailQuotaLedger.ts   (persistent rolling-window rate limiter)
       └ httpRetry.ts          (429/5xx/rate-limit-403 backoff)
pure model/        senderModel · threatSignals · emailAuth · messageKind ·
                   domainCategories · domainGrouping · rules · autoSort ·
                   sortTaxonomy · smartViews · expiryTriage · neverRead ·
                   spamSuggestions · blocklist · spamList · inboxHealth ·
                   engagementModel · protectionPolicy
orchestration/     senderModel.buildSenderSummaries · incrementalSync ·
                   ruleRunner · bulkActions · durableJobs
dashboard/         dashboard.ts (cleanup tab + wiring) + one module per tab
                   (rulesTab, securityTab, screenerTab, subscriptionsTab,
                   recentTab, sortInbox) behind the state.ts seam
```

The "pure model" layer takes plain data (`SenderSummary[]`) and returns plain
data — no I/O, no DOM. That's why it's cheap to test and cheap to run.

### The one data structure everything hangs off: `SenderSummary`

```
SenderSummary {
  key, provider, address, displayName
  count
  messageIds: string[]            // all ids
  protectedMessageIds: string[]   // starred/flagged subset
  messages: MessageRecord[]       // {id, subject?, receivedAt, kind, isProtected, unread, sizeBytes}
  unsubscribe: UnsubscribeInfo
  threatSignals: ThreatSignal[]
  authVerdicts: {spf,dkim,dmarc}
  firstContact: boolean
}
```

Built once per scan; every tab is a pure fold over `SenderSummary[]`.

---

## 2. The scan pipeline, stage by stage

`buildSenderSummaries(providers, maxMsgs, windowDays, onProgress, purpose, cache)`:

1. **`listCandidateMessages`** per provider — Gmail `messages.list`
   (`(category:promotions OR category:updates) newer_than:Nd` for cleanup,
   `in:inbox newer_than:Nd` for security). `⌈maxResults/500⌉` pages, **5 quota
   units each**. Time: 1 round-trip for ≤500.
2. **`buildSenderSummariesFromStubs`** — `mapWithConcurrency(stubs, 5, …)`:
   - cache hit → reuse; miss → `provider.getMessageMetadata` (**20 quota units**,
     `format=metadata`), then `metadataCache.set`.
   - `addToSenders(meta)` — the CPU core: `classifyMessageKind` (3 regexes),
     `scoreSenderIdentity` (brand regex list + homoglyph skeleton, once per new
     display name), `scoreMessageAuthentication` (DMARC parse), `scoreMessageContext`
     (Reply-To / lure lexicon), `parseAuthenticationResults`, `mergeSignals`.
   - `onProgress(done, total)` → the "Scanning… 142/250" line.
3. Sort senders by `count` desc.

The dashboard runs this **twice** (cleanup, then security) with **one shared
`metadataCache`**, so overlap is fetched once. Then: `excludeSnoozedMessages`,
`updateEngagementObservations`, `markFirstContact`, then 11 render calls.

---

## 3. Measured complexity (synthetic bench, `scripts/bench-pipeline.mts`)

Node 24, gc exposed, mock providers (metadata served from a Map — isolates CPU
from network). Times are single-run wall-clock; heap is the delta across the call.

| messages | buildSenderSummaries­FromStubs | domainGroups | inboxHealth (agg.) | buildSortPlan | matchRule ×3 | findRuleConflicts ×3 | smartViews ×5 | suggestSpam |
|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 300 | 16 ms | 0.9 ms | 1.0 ms | 8.7 ms\* | 0.9 ms | 1.3 ms | 0.3 ms | 0.2 ms |
| 1 500 | 51 ms | 0.7 ms | 1.5 ms | 2.0 ms | 1.5 ms | 1.8 ms | 0.4 ms | 0.6 ms |
| 6 000 | 206 ms | 2.1 ms | 3.9 ms | 6.9 ms | 6.5 ms | 6.9 ms | 1.9 ms | 1.4 ms |
| 20 000 | 509 ms | 5.3 ms | 7.5 ms | 20 ms | 14 ms | 23 ms | 3.0 ms | 3.4 ms |
| 40 000 | 1 054 ms | 9.7 ms | 19 ms | 43 ms | 28 ms | 44 ms | 7.4 ms | 7.6 ms |

\* first-call JIT warm-up noise.

- **`buildSenderSummariesFromStubs`: linear, ~25 µs/message.** 6 k→40 k is 6.7×
  the messages and 5.1× the time. The constant is the per-message threat +
  kind scoring (regex work). It's the only stage that reaches into the hundreds
  of ms, and only past ~10 k messages.
- **Everything else: linear, <50 ms even at 40 k messages.**
- **`findRuleConflicts` / `matchRule`: O(rules × messages).** 3 rules over 40 k
  msgs = 44 ms; 20 rules would be ~5× that. Re-run on every rules-tab edit.
- **`buildSortPlan`: O(messages + Σ per-bucket sort)** — 43 ms at 40 k.
- **Pathological (1 sender × 20 000 messages):** no different — every inner loop
  is message-bound, not sender-bound. `findRuleConflicts` 44 ms, rest tiny.
- **Domain-list matcher** (`isSpamDomain` + `isBlockedDomain`, Set + parent-label
  walk): **3.3 M lookups/s**. A 10 k-sender scan spends ~6 ms here total.

### Heap

- `SenderSummary[]` retains **~4.7 KB per sender** (10 k senders ≈ 47 MB
  resident in the bench, which also holds the 40 k-entry mock metadata Map).
- The dominant retained bytes are `MessageRecord.subject` strings (kept
  deliberately, for explainable protection decisions) + per-message object
  overhead.
- `spamDomains.generated.json` → a **10 764-entry Set** built at module load
  (~1 MB heap, one-time), always paid even if the spam UI is never opened.
  `malwareDomains` adds 388.

### What this means at real scale

The scan is capped at `maxMessagesPerProvider` (**default 150**) × 2 providers ×
2 lanes, minus cache overlap → **~300–1 000 messages in memory**. At that size:

- `buildSenderSummaries` ×2 lanes: **~35–70 ms**
- all 11 render-feeding folds combined: **<10 ms**
- **total processing per scan: well under 100 ms.**

Even at the `maxMessagesPerProvider` ceiling of 5 000 (10 k messages, both
providers): ~1.5 s of processing, once, dwarfed by the ~60 s the paced network
fetch takes for that many messages.

---

## 4. Network / quota complexity — the actual bottleneck

Costs from `developers.google.com/gmail/api/reference/quota`; ceiling **6 000
units / user / minute**; ledger paces to **5 500 / min**.

| operation | quota units | count per scan |
|---|--:|---|
| `messages.list` | 5 | `⌈maxMsgs/500⌉` per lane |
| `messages.get` (metadata) | **20** | ≤ `maxMsgs` per lane, minus cache hits |
| `batchModify` (rules, sort, bulk) | 50 flat | 1 per ≤1 000 ids |
| `history.list` (incremental security) | 2 | per page |
| `labels.list` / `filters.list` | 1 | a handful |

- **Cold scan wall-time ≈ (messages × 20) / 5 500 minutes.**
  150 msgs → ~33 s. 500 → ~110 s. 5 000 → ~18 min (why the default is 150).
- **Warm rescan:** only messages absent from `clusterMetadataCache` (everything
  outside the last 7 days is served from cache) → typically a few `messages.get`.
  This is the difference between "slow once" and "slow every time" — and it's
  **still unverified in-browser**.
- Background triage adds `listSentCorrespondents` (≤150 × 20), rule `batchModify`s,
  screener reads — and now bails if ledger headroom < 1 500.
- **Quota cost is O(messages); the 5 500/min ceiling is the wall.** Batching
  HTTP requests wouldn't help — quota is billed per sub-request.

---

## 5. Findings

### No real problems at scan-cap scale
Processing is ~100 ms for a real scan. The pipeline is clean linear folds over
one array. Rendering builds DOM lazily per collapsed category. Nothing here
needs optimising.

### Watch items (only bite at large `maxMessagesPerProvider` or many rules)

1. **`buildSenderSummariesFromStubs` at ~25 µs/msg, run twice per scan.**
   At a 5 000-msg cap that's ~1 s ×2. The per-message threat scoring is the
   constant. If deep scans become common, memoise `scoreSenderIdentity` per
   address (already done for display-name stability) and consider skipping the
   security lane's re-score of messages already scored in the cleanup lane
   (shared cache gives the metadata, not the derived signals).
2. **`findRuleConflicts` / `matchRule` are O(rules × messages) and re-run on
   every rules-tab interaction.** Fine at 3 rules / 300 msgs (~1 ms); at 20
   rules / 5 000 msgs it's ~150 ms per keystroke-ish. Debounce or cache the
   match sets keyed by `(rulesHash, sendersHash)`.
3. **`subject` retained on every `MessageRecord`.** Bounded by the scan cap, but
   it's the bulk of heap. If a much larger cap is ever allowed, drop `subject`
   from the persisted `metadataCache` entries (keep it only in the live scan).
4. **`spamDomains.generated.json`** — 232 KB raw / ~80 KB gzip in the dashboard
   bundle, parsed to a 10.7 k Set at load whether or not the feature is used.
   Lazy-import it from the spam section, or shrink `PER_SOURCE_CAP`.
5. **`metadataCache` cap is 400 entries.** Deliberately small (it shares
   `chrome.storage.local` with the ledger, and a bloated cache that fails to
   write would take the ledger down too — the failure mode from the 403 saga).
   Fine for a 150-msg default; a user who raises the scan cap to thousands gets
   a cache that can't cover their scan, so warm rescans stay slow. If the cap
   is raised, do it alongside `unlimitedStorage` (now present) and a size check.

### Structural notes
- `dashboard.ts` is still 1 737 LOC (down from 3 400) — the cleanup tab plus
  wiring. Not a complexity problem, a navigability one.
- Everything pure is already contract-tested (`pipeline.contract.test.ts`
  runs the whole chain against a fixture mailbox). The bench script
  (`scripts/bench-pipeline.mts`) can guard against a complexity regression if
  wired into CI as a soft check.
