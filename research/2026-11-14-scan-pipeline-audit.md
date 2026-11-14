# Scan pipeline audit (2026-11-14)

Read-only audit of the scan lifecycle: sign-in read, background 5-minute run, labelling, sweep, hold, change feed, settings sync. Audited at commit 235e2a3. No code was changed.

Already known, not repeated here:

- K1. Chrome was running an old build, so c413f1a (schema 18 clears `keptInInboxIds`) never loaded.
- K2. `holdUnsortedInbox` skips Primary, important, starred and known-sender mail, so that mail stays in the inbox for good.

Quota figures were checked against Google's quota page today: 6,000 units per user per minute, messages.get 20, messages.list 5, batchModify 50, history.list 2, threads.modify 10. `gmailQuotaCost` (src/lib/gmailApi.ts:33) matches them.

Findings are ranked by severity.

---

## High

### H1. The scan card can stick at "Labelling your inbox" for good, with no button

- Where: src/dashboard/dashboard.ts:818-832 (`startLabelScan`), src/dashboard/sortInbox.ts:554, src/lib/inboxTimeLimitsRunner.ts:177-181, src/dashboard/homeDashboard.ts:525-534.
- What happens: `startLabelScan` writes `phase: "labelling"` and then runs `runInboxTimeLimits({relabel: true})` inside the dashboard page. Before the relabel it does a lot: filter sync, search labelling, tag, sweep, hold, `continueIndexBuild`, then up to three paced pages of older inbox mail. If the tab closes in that window, the stored phase stays "labelling". The background run only calls `relabelInbox` non-quietly when `shown || builtNow`. `shown` is false because the version already matches and there is no relabel option. The daily relabel is quiet (`!shown && !builtNow`), so it never writes "done" either. The card renders Rescan and × only when the phase is done, so the user can't clear it.
- Scenario: the user clicks Rescan, or the first read ends with the tab open. They close the tab while "older inbox" is waiting on headroom. Every later visit shows "Labelling your inbox" with a frozen bar.
- Fix (smallest): in the background run, finish a stale "labelling" state. Read `getScan()` at the start, and if the phase is "labelling" and `startedAt` is more than ~10 minutes old, treat the run as `shown`. Also render × on every phase.

### H2. An expired history cursor freezes the background index with no recovery

- Where: src/lib/mailSync.ts:144-164, src/lib/indexTriage.ts:41-53.
- What happens: with `changesOnly`, an expired cursor (history.list 404) sets `state.cursor = undefined` in memory only. Nothing is written, because `applied` is false. `refreshIndexForBackground` still sees `complete` and reports the index as ready. Every 5-minute run hits the same 404 and reads nothing new. Only a dashboard sync without `changesOnly` re-lists.
- Scenario: Chrome is closed for 1-2 weeks, past Gmail's history retention. A long first read whose `pendingCursor` (mailSync.ts:176-178) ages out hits the same path: the build completes with an already-expired cursor. From then on, `relabelInbox`, `holdScamsFromIndex`, the Today email and the triage all read a frozen index. Scam holds quietly stop for new mail, and the daily relabel never sees it.
- Fix: in the expired branch with `changesOnly`, write `{...state, cursor: undefined, complete: false}`. `continueIndexBuild` then re-lists in the background, which reads only mail the index lacks (about 200 units of list calls).

### H3. Learned corrections and other synced lists over 8 KB are rolled back on every service-worker start

- Where: src/lib/settingsStore.ts:646-663 (`pushSynced` skips items over `SYNC_ITEM_MAX`), 628-635 and 667-684 (`pullSyncedSettings` writes the synced copy over local), src/background.ts:90 (pull on every SW start).
- What happens: once `sortOverrides` (about 200 entries), `mutedSenders`, `rules`, `personOverrides`, `screenerAllowlist` or `brandVerdicts` passes 8,000 characters, its synced copy stops updating. That copy is frozen at the last version under 8 KB. `pullSyncedSettings` runs at every SW start, which can be several times an hour, and on every sync change from any device. It lays the frozen copy over the newer local value.
- Scenario: "Label as" corrections and `learnFromLabelMoves` learnings past entry ~200 are lost within minutes. The relabel then puts mail back under the wrong label, which looks to the user like "it ignores what I taught it".
- Fix: in `applySyncedItems`, skip a key whose local JSON is over `SYNC_ITEM_MAX` (local wins). Better, at the same size: write a `settings:<key>:tooBig` marker on push and skip that key on pull. Long term, split large maps into chunks.

### H4. The tagger and the hold starve on their first 100 results

- Where: src/lib/inboxTimeLimits.ts:110-116 (`tagUntaggedInbox`, `TAG_MAX = 100`), 244-251 (`holdUnsortedInbox`, `HOLD_MAX = 100`).
- What happens: both list the newest 100 matching ids and never page past them. Mail they skip keeps coming back as the same 100 every run. For the tagger that is mail fitting no label, known senders and protected mail. For the hold it is Primary/personal mail, replies, calendar invites and known senders. This is not K2. K2 is about which mail gets skipped. This is about holdable mail behind the skipped mail never being looked at.
- Scenario: any established inbox has more than 100 unimportant Primary or personal messages older than 3 h. `holdUnsortedInbox` then holds nothing ever again, even plain unknown bulk mail. The tagger has the same problem with more than 100 unfittable messages in 2 days. Those wait up to 24 h for the daily search or relabel.
- Fix: page by date the way `tagOlderInbox` does (pass `before:` the oldest `receivedAt` seen, a few pages per run). Or, when the index is ready, pick candidates from index rows (INBOX, no Cluster label), which costs no list calls.

### H5. Threads stay in the inbox when only some of their messages move

- Where: src/lib/inboxTimeLimits.ts:294-325 (`sweepExpiredInbox`), 267 (`holdUnsortedInbox`). Nothing in src/lib uses `threadId` for moves.
- What happens: Gmail shows a thread in the inbox while any one of its messages has INBOX. The sweep and the hold remove INBOX from the labelled or held messages only. Filters label only the message that matched. Another message in the same thread keeps the thread visible: an unlabelled reply, a known sender's reply (`skipSender`), a protected message, or a newer one not yet due.
- Scenario: a store's support thread, or a newsletter with a reply-to-all. The user sees it in the inbox under its label and reads that as "Cluster didn't sort it". Cluster's counts say moved.
- Fix: the index rows have `threadId`. After the sweep, find threads where some messages were moved but other INBOX messages remain. Either (a) also move the rest when every remaining INBOX message in the thread is due under some label, or (b) at minimum, count these as "kept in inbox by a reply" so the card doesn't claim they left. Use `threads.modify` (10 units) to file a whole thread only when every message in it is due.

---

## Medium

### M1. No guard stops two runs overlapping

- Where: src/background.ts:139-146, src/lib/inboxTimeLimitsRunner.ts:53. Dashboard callers: dashboard.ts:826, 1519, 2013; sortInbox.ts:555; timeLimitsTab.ts:359.
- What happens: the 5-minute alarm starts a new chain whether or not the last one finished. A run with a background index build lasts hours: the SW stays alive because `waitForGmailHeadroom` reads storage every second. So a second run starts every 5 minutes and does filter sync, search, tag, sweep, hold and three "older inbox" pages again. Only the build itself is locked (`tryWithStorageLock`). While the index isn't built, `readSenders` uses the legacy cache, so each overlapping older-inbox page can fetch up to 100 messages (about 2,000 units). That spending comes out of the build's quota, and the dashboard's runs join in too.
- Scenario: the first read in the background slows well past its ETA. Duplicate `batchModify` calls and log entries pile up, and the sweep stamps race.
- Fix: wrap `runInboxTimeLimits` in `tryWithStorageLock("inbox-run", ...)` and skip the run when the lock is taken. A Web Lock is shared across SW and pages and is released when either dies.

### M2. A long quota wait can let Chrome kill the SW mid-run

- Where: src/lib/gmailQuotaLedger.ts:172-189 (`reserveGmailQuota` sleeps the whole `decision.wait`, up to about 60 s), :198-203 (`penalizeGmailQuota` books a full window).
- What happens: an MV3 SW is stopped after about 30 s with no events or extension API calls, and a bare `setTimeout` doesn't count. After a rate-limit 403, or while the dashboard is spending, a background `gmailFetch` can sit in one 60 s sleep, and Chrome stops the worker. Progress is saved in batches of 25, so the build resumes. But the run's later steps never happen, and the first `mutateSettings` has already stamped `lastRelabelAt` (runner.ts:123). That skips the daily relabel for 24 h (see L2).
- Fix: sleep in steps of 1 s or less, re-reading the ledger each time, as `waitForGmailHeadroom` already does (gmailQuotaLedger.ts:321-327).

### M3. Long runs reuse an expired token: every call 401s, and the build runs at half pace after an hour

- Where: src/lib/gmailApi.ts:120-152, src/lib/inboxTimeLimitsRunner.ts:57, src/dashboard/dashboard.ts:754.
- What happens: the run and the dashboard build take one token string at the start and pass it to every call. Access tokens last about 1 h (gmailWebAuth.ts:180). After that, each call gets a 401, refreshes, and retries, and the fresh token is thrown away when the call returns. Each attempt reserves its cost in the ledger again, so the ledger counts double and the build paces at half speed.
- Scenario: a 20,000-message read (about 100 min at the planned pace) runs its second half at about 100 reads/min. The card's "about N min left" is wrong by 2x for a 100k read.
- Fix: in gmailFetch, keep a module-level `Map<staleToken, freshToken>` and start with `bearer = replaced.get(token) ?? token`. Also, don't reserve quota again on the 401 retry.

### M4. The card sits at "100% read" for up to about 25 minutes while Sent is read

- Where: src/lib/mailSync.ts:369 (`backfillSent` with `SENT_CAP` 5,000 at the end of the build), 246-272 (`readSentInto` never calls `onRead`), runner.ts:304-322.
- What happens: the plan and the "read" count include received mail only. After the last received batch the card shows "20,000 of 20,000 read" with no time left. It stays in "reading" while up to 4,800 sent messages are read (about 24 min at 200/min), then search flags. The user sees a finished bar that doesn't finish. Setup's estimate leaves this out as well (setupTab.ts:404).
- Fix: add the sent reads still to come to `onPlanned`'s total, or have `readSentInto` report through `onRead` with a count of tried messages. Add them to `readTimeText` in setup.

### M5. With labels off, the background never continues a read the dashboard started

- Where: src/lib/inboxTimeLimitsRunner.ts:55 (returns early when `!timeLimitsEnabled`), :169 (`continueIndexBuild` is only reached past that line). No other background path builds the index (indexTriage.ts:42 needs `complete`).
- What happens: if the user chose "Ask me first", or closes the tab before setup turns labels on, the first read stops until the dashboard reopens. The card stays at "Reading your inbox · You can close this tab", which is untrue in this case.
- Fix: run `continueIndexBuild` before the `timeLimitsEnabled` return. `readLabeller.flush` already skips labelling while labels are off. Once the build completes with labels off, set the card to done.

### M6. A dashboard labeller waiting on the lock flips "done" back to "reading"

- Where: src/dashboard/dashboard.ts:755-781, runner.ts:316-322.
- What happens: the dashboard builds the labeller first (the index still needs a build), then waits for the lock while the background holds it. The background finishes the build, relabels and writes "done". The dashboard then gets the lock and runs a changes-only pass. `applyChanges → readInto → readRows` calls `labeller.onRead`, which writes `phase: "reading"`. `run.built` is false, so `startLabelScan` never runs, and nothing sets "done" again (see H1).
- Scenario: the dashboard is opened while a background read is running. The card shows "Reading" for good after the read is over.
- Fix: build the labeller inside the lock callback, or have `onRead` write the phase only when `getScan().phase === "reading"`.

### M7. "Done" can show early after Rescan or a build that ends early

- Where: src/dashboard/dashboard.ts:831.
- What happens: after `runInboxTimeLimits` returns, `startLabelScan` forces "done" without checking that the index is complete. If the background holds the build lock, `continueIndexBuild` returns false, the relabel is skipped, and the card says done. Then the background's `onRead` flips it back to "reading". `sortInbox.resortEverything` (sortInbox.ts:559-568) already checks `index.getState("gmail").complete` first. This copy doesn't.
- Fix: copy that `complete` check into `startLabelScan`, and if the index isn't complete, leave the phase as "reading".

### M8. The worker lease can hand all background work to a computer on an old build, with no sign of it

- Where: src/lib/workerLease.ts:30-42, src/background.ts:118-119.
- What happens: whichever computer renewed last does all the sorting. A second computer running an older unpacked build (the K1 situation) can hold the lease. The computer the user is looking at then quietly does nothing. The lease records no build and nothing shows it.
- Fix: add `build` (see L1) and `at` to the lease. Show "Sorting runs on your other computer (build X, 3 min ago)" in Settings. Let a newer build take the lease from an older one.

### M9. Messages that fail to load during a build are never retried

- Where: src/lib/mailSync.ts:488-503 (failed reads are logged and skipped), :188-197 (the build still marks the index `complete`).
- What happens: the comment says a failed message is "retried on a later run", but after `complete`, later runs only apply the change feed, which never brings old mail back. Messages that 403'd or 5xx'd past three retries are missing from the index for good. The relabel never labels them. Inbox ones may still be caught by `tagOlderInbox`'s walk. Archived ones never are.
- Fix: count failures in `readRows`. If any failed, leave `complete: false` (the next run re-lists and reads only what's missing), or keep a small `retryIds` list in the state.

### M10. `lastSweep` is stamped even when tag and sweep failed

- Where: src/lib/inboxTimeLimitsRunner.ts:108-115.
- What happens: `step()` swallows errors and returns an empty result, then `lastSweep: {at: now}` is written anyway. The Overview "late run" check (dashboard.ts:1516) and any "last sorted" text think everything is fine while every run fails, for example on a missing filter scope or repeated 403s.
- Fix: stamp `lastSweep.at` only when the sweep step really ran. Add a `lastError` field that the Overview can show.

---

## Low

### L1. Nothing shows which build is running

- Where: manifest.json:4 has said `0.1.0` forever. vite.config.ts has no `define`, and the code never reads `getManifest`.
- What happens: running `vite build` updates dist/, but Chrome keeps the old SW and any open dashboard tab until the user clicks reload in chrome://extensions. Nothing tells them apart, which is how K1 went unnoticed. An open tab left on an old build next to a migrated SW can also hit "schema newer than this build" (settingsStore.ts:348-351).
- Fix (smallest): in vite.config.ts, set `manifest.version_name = \`0.1.0 (${sha} ${date})\`` from `git rev-parse --short HEAD`. chrome://extensions shows it. Also `define: { __BUILD__: ... }`. Show it in the Settings footer, have the SW write `buildId` to storage.local at startup, and have the dashboard show "Reload Cluster" when its `__BUILD__` differs from the SW's.

### L2. A crash between the two writes skips the daily relabel for 24 hours

- Where: src/lib/inboxTimeLimitsRunner.ts:123, 177-188.
- What happens: `lastRelabelAt` is stamped in the first write, before the relabel runs. That is on purpose, so the daily search doesn't repeat every 5 minutes. But if the SW dies (M2) or the relabel step fails, the daily relabel waits another day. `labelledVersion` is safe, because it is stamped only after the relabel.
- Fix: keep separate stamps: `lastSearchAt` in the first write and `lastRelabelAt` only in the second.

### L3. Each 5-minute tick loads the whole index into memory several times

- Where: `enforceLimits` (mailSync.ts:652), `readMailIndex` from `holdScamsFromIndex` (background.ts:393) and `sendTodayEmail`. Daily: `relabelInbox`.
- What happens: with "All" (cap 100k), each tick loads up to 100k rows into the SW two or three times. That is slow, uses a lot of memory, and makes an SW restart more likely.
- Fix: `enforceLimits` only after a build or once a day. Read only the security window from an index on `receivedAt`.

### L4. One bad filter blocks every bucket after it

- Where: src/lib/categoryFilters.ts:129-150.
- What happens: any create error other than "exists" throws out of the loop. One bad query, for example one over Gmail's criteria length or a rejected operator, stops filter sync for every later bucket on every run. The runner's `step` hides it in the log.
- Fix: catch errors per spec, record which bucket failed, and carry on.

### L5. Sweep lists are capped at 5,000 per label

- Where: src/lib/inboxTimeLimits.ts:33, 302-308.
- What happens: a "stays in inbox" label with more than 5,000 inbox messages is cut off. Messages past the cut aren't blocked, so mail with two labels can leave while one of them says stay. This is rare.
- Fix: none needed now. Note it next to `LIST_MAX`.

### L6. Smaller items

- The `"checking"` phase is never set anywhere (scanState.ts:5). Remove it.
- The scan card's ETA uses `readTimeText` (a fixed 200/min), while the status bar measures real pace (dashboard.ts:916-920), so the same read shows two different times.
- `screenedSenders` and `quarantinedSenders` only grow. Every `mutateSettings` rewrites the whole settings object, so each write gets slower over months. `keptInInboxIds` is capped and not synced, which is fine.

---

## Not a problem (checked)

- Gmail rate-limit 403/429: `fetchWithRetry` backs off three times (waits capped at 10 s) and honours Retry-After. A 403 that survives that books a full ledger window. That is fine, apart from M2.
- Deleted labels and filters: the sweep skips a missing label, the tagger re-creates it, and `syncCategoryFilters` checks live filters against the current label id (categoryFilters.ts:110-123).
- A `LABEL_RULES_VERSION` bump runs one search (stamped by `searchedVersion`) and one relabel from the index (no message reads). That is cheap. It does fire a "Scan done" notification nobody asked for, on every bump.
- chrome.storage.sync write rate: only changed items are written, plus one lease write every 5 minutes. That is far under 120 writes a minute.
- A resumed build re-lists (about 200 units) and skips rows the index already has. Interrupted reads keep what they paid for.
