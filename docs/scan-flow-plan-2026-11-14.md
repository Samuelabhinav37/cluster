# Scan, review and learning plan (2026-11-14)

Sources:
- `research/2026-11-14-scan-pipeline-audit.md` (audit, H = high, M = medium)
- `research/2026-11-14-classify-learn-onboard-research.md` (vendors, R = recommendation)
- `research/2026-11-14-open-source-code-research.md` (inbox-zero, Zero, Thunderbird, rspamd, OS = item)

Order: make the inbox actually clear first, then make the scan honest, then add the review step, then cleanup and learning. Each step is one branch-sized commit with tests. Nothing ships until the step before it is checked on the real inbox.

## Phase 0. The inbox clears (this week)

| # | Change | Why | Source |
|---|---|---|---|
| 0.1 | Build stamp. `version_name` = version + git sha + date (shows on chrome://extensions). Settings shows it. Dashboard says "Reload Cluster" when its build differs from the service worker's. | Today's fixes never loaded and nobody could tell. | audit L |
| 0.2 | Tagger and Screener page past the newest 100. Keep listing until the batch has work or the inbox is exhausted, with a per-run cap. | Over 100 skipped Primary mails freeze both forever. | audit H4 |
| 0.3 | Archive by thread. When every INBOX message in a thread is due, use `threads.modify`. Otherwise count it as "kept by a reply". | One unlabelled message keeps the whole thread visible. | audit H5, OS14 |
| 0.4 | Unlabelled Primary/Important mail goes to the Screener unless it's from a real person (decision a). When the user picks a label for a sender, the same sender and, for company domains, the same domain go there from then on, past and future mail. | It has nowhere to go and stays forever; the user shouldn't sort the same sender twice. | known K2, R26, user 2026-11-14 |
| 0.5 | One run at a time. A lock in `chrome.storage.session` with a stale timeout. The 5-minute alarm skips while a run holds it. | Overlapping runs eat the read's quota. | audit M |
| 0.6 | `lastSweep` is stamped only when the tag and sweep steps succeeded. | Failures hide behind a fresh timestamp. | audit M |

Check: reload, wait 10 minutes, then count `in:inbox has:userlabels` and the Screener holds on the real inbox.

## Phase 1. The scan is honest and survives anything

| # | Change | Source |
|---|---|---|
| 1.1 | 404 on history: save `getProfile`'s historyId first, re-list ids, read only what the index lacks, then mark it ready. Never report ready on a failed catch-up. | audit H2, OS1, OS2 |
| 1.2 | The scan card never sticks. The background writes "done" after any label pass it finishes, quiet or not. The card always has × and Rescan after 10 minutes with no progress. | audit H1 |
| 1.3 | "Done" only when the read is complete (same check `sortInbox` uses). No flip back from done to reading. | audit M |
| 1.4 | Count sent-mail reading in progress ("Reading sent mail, 1,200 of 5,000") so it never sits at 100%. | audit M |
| 1.5 | Fresh token per batch on long runs (refresh on 401, no double count in the quota ledger). | audit M |
| 1.6 | Quota waits are short slices (under 25 s) with an extension API call between, so Chrome doesn't stop the worker mid-wait. Budget by priority: clicks 100%, sync 90%, backfill 70% of 4,800 units a minute. | audit M, OS15 |
| 1.7 | Batches of 25 to 50, retry only failed items, drop to 10 after a 429, honour Retry-After. 401 or invalid_grant means sign in again. | OS16, R14 |
| 1.8 | Retry messages that failed to load once the read finishes. | audit M |
| 1.9 | ETA from measured reads a minute, capped by the quota (about 300 a minute). Rounded words: "about 1 hour". "Paused by Gmail, resuming" on a 429. | R13, R14 |
| 1.11 | **Run report and watchdog.** Every run (first read, label pass, background sweep) writes a report: started, each step with counts and time, quota used, errors with the step name, ended or failed and why. A watchdog alarm checks the last heartbeat; a run quiet for 10 minutes is marked "stalled" with its last step, then resumed. The dashboard shows the last report in plain words ("Sorted 84 emails in 2 min. Labelling stopped: Gmail said too many requests; resumed at 15:30.") and Settings has a Diagnostics list of the last 20 runs with Copy for bug reports. | User 2026-11-14: scans must not stop midway, and someone must watch and say what happened and why. | user, audit |
| 1.10 | Settings sync. Items over 8 KB stay local and are never pulled over newer local copies. Split `sortOverrides` into chunks or keep it local only. | audit H3 |

Check: close the tab mid-read, close Chrome for 8 days (or fake an old cursor), revoke the token mid-run. The card and the inbox must end right each time.

## Phase 2. Onboarding and the review step

| # | Change | Source |
|---|---|---|
| 2.1 | Install opens one sentence and one button. Optional "See it first" practice inbox before Google sign-in. | R1, R2 |
| 2.2 | Ask only the scopes the first scan needs. Ask for filter scopes when Tidy is chosen. Handle a partial grant with one line on what is off. | R3, R4 |
| 2.3 | Setup keeps its 4 steps. Both modes promise: never archive or trash mail from people you have written to. | R5, Superhuman |
| 2.4 | Quick scan labels by Gmail search first and shows counts per label in the first minute. | R7, R8 |
| 2.5 | **New review step: "Here's what I sorted. Is this right?"** One row per label, top 3 senders and a count. Right / Move to. A move asks "Just this email, or everything from this sender?" and applies to past and future mail. "With no label" is its own row: Keep in inbox, Screener, Pick a label. "Nothing was archived yet." | R9-R12, OS17, HEY, inbox-zero |
| 2.6 | Then the full scan starts with the ETA from 1.9, a notification when done, and resume after a closed tab. | R15 |
| 2.7 | Findings: three facts. Sorted per label, left with no label, senders to review. Each opens its list. Re-ask only about senders whose label changed during the full scan. | R17, R18 |

Check: a fresh Chrome profile with a test Gmail account, start to finish, timed.

## Phase 3. Cleanup: is it safe to trash?

| # | Change | Source |
|---|---|---|
| 3.1 | Per-sender score from data Gmail already gives: emails in 90 days, share opened, ever replied, one-click unsubscribe, newest opened date. | R19, R24 |
| 3.2 | "Safe to trash" only when all hold: never replied, never written to, opened under 10%, bulk sender, not starred, not Important. If a check can't run, the sender counts as known (keep). | R20, OS8 |
| 3.3 | Reason in plain words: "112 emails, opened 0, you never replied." | R20 |
| 3.4 | Unsubscribe suggestions: 3+ emails, read under 20%, has a link, no decision yet, sorted by count. No link: offer "archive future mail" as a filter. | OS11, OS12 |
| 3.5 | Confidence by kind: marketing and newsletters pre-selected; notifications and receipts shown, not ticked; everything else not suggested. | OS13 |
| 3.6 | Trash only, with Undo. "Keep newest" as the softer choice. Unsubscribe before trash when one-click is present. | R21, R22 |

## Phase 4. Learning that gets faster and more accurate

| # | Change | Source |
|---|---|---|
| 4.1 | One correction store for Gmail moves, review answers and Details "Label as". Every single correction is kept as a feedback row (sender, from, to, id, time). | R23, OS4 |
| 4.2 | Sweep guard: ignore a batch where 10+ messages gain or lose the same label. Two votes must be on different messages 15+ minutes apart. | OS3 |
| 4.3 | Never learn a sender from a thread with more than one sender. | OS5 |
| 4.4 | Pin a sender to a label after 3+ threads landed there with no correction; later mail skips the heavier checks (faster). | OS6 |
| 4.5 | Replying to a held, muted or screened sender turns into an allow entry. | OS10 |
| 4.6 | Header rule fixes: a known contact without List-Unsubscribe stays personal; info@/hello@ alone isn't marketing without an ESP marker; read X-Campaign. Marketing never includes account, transaction or service mail. | OS7, OS20 |
| 4.7 | Weekly digest of what Cluster moved, Right / Wrong per sender. | R25 |
| 4.8 | Local accuracy: share of auto labels later moved, per label. Stop asking for review on a label under 2%. | R28 |
| 4.9 | Global learning without user data: grow the shipped brand and domain registry with releases. No telemetry. | R27 |
| 4.10 | Later, optional: small on-device Bayesian scorer per label trained from corrections (Thunderbird recipe), in `storage.local`. Decayed sender reputation (TxRep 0.98). | OS18, OS19 |

## Decisions

1. 0.4: (a) Screener unless a real person, plus sender and domain learning from the user's pick (user, 2026-11-14).
2. 2.1 practice inbox before sign-in: default yes, optional link. Open.
3. 2.5 review step: after the quick scan, before the full scan (default).
4. Order 0 → 1 → 2 → 3 → 4 (user: work on all phases).

## Progress

Branch `feat/scan-flow-2026-11`. Steps are ticked here as they land.

- 0.1 build stamp f577cb2. 0.2 + 0.4 Screener pages and holds non-person Important/Primary mail b36a52e. 0.3 covered by c413f1a + 0.4 (a person's reply keeps a thread, by design). 0.5 one pass at a time c47e48f, refined adc3e53. 0.6 + 1.11 run reports, watchdog, Diagnostics 012214b.
- 1.1 expired cursor 67f1d91. 1.2 + 1.3 card never sticks, done only when read 012214b, adc3e53. 1.4 sent-mail line 736a5cb. 1.5 + 1.6 token reuse, quota slices c7d98f4. 1.7 + 1.9 already in place (4 concurrent reads, Retry-After, quota-based ETA in words). 1.8 retry failed reads a4474c1. 1.10 sync over 8 KB 603d243.
- Live check 2026-11-14 18:00: build d11e621 loaded, every run ok, no labelled mail left in the inbox. INBOX still 741 threads: no-reply senders counted as people and missed code/account/job phrases. Fixed b4c972c (rules v7, catch-up -6).
- Next: user reloads dist (b4c972c), recheck the inbox count, then Phase 2 (mockup of the review step first).
