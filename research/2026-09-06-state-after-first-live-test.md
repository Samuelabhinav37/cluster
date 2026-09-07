# Cluster — where things stand after the first real live test

**Date:** 2026-09-06
**Context:** Up to now the project was "lots built, almost nothing reload-unpacked."
This session was the first sustained live test against a real inbox. It got past
almost nothing feature-wise, because the opening scan kept failing — but it
flushed out three real problems and fixed two of them.

---

## Branch / PR state

| | |
|---|---|
| `master` | PR #1 (`hardening/audit-remediation`) merged — the audited baseline. ~368 tests, CI green. |
| PR #2 `fix/gmail-rate-limit-retry` | **OPEN, mergeable, CI green.** 5 commits, +908 / −39, 15 files. `3ee215f` (prior session) + 4 from this session. 388 tests. |
| Working copies | `~/gmail-declutter` **and** `~/cluster-inspect` are both clones of the same repo. Chrome loads `~/cluster-inspect/dist`. Both are now on `fix/gmail-rate-limit-retry`. |

PR #2's description only covers the first commit — it needs a rewrite before merge
to describe the quota ledger / metadata cache / `unlimitedStorage` work.

---

## What the live test surfaced

### 1. Wrong directory (process, not code)
~2 hours of "your fix didn't work" was **the fix not being loaded**: edits + builds
were in `~/gmail-declutter`, Chrome loads `~/cluster-inspect`. Fixed by putting both
clones on the same branch and building in `cluster-inspect`.
The extension ID is path-derived (no `key` in `manifest.json`), so you can't just
point Chrome at the other folder without breaking the OAuth client binding — that's
why we build into `cluster-inspect`. **Adding a fixed `key` to the manifest would
remove this footgun** and let either folder load with the same ID.

### 2. Gmail 403 `rateLimitExceeded` — FIXED
Root cause: the code assumed `messages.get` costs **5** quota units. It costs **20**,
against a **6,000 units/min per-user** ceiling. A default scan was ~13,000 units —
2.2× over — so the 403 was deterministic, not a transient burst. The in-memory
limiter added mid-session didn't help because it reset on every page reload and the
service worker kept a separate copy.

Fix (all on PR #2):
- `gmailQuotaCost(path, method)` — real per-method costs (get 20, list 5,
  batchModify/Delete 50, history 2, …).
- `gmailQuotaLedger.ts` — the trailing-60s spend record lives in
  `chrome.storage.local` behind a Web Lock, so the dashboard tab and the service
  worker share **one** budget across reloads. Paces to **5,500/min**. Degrades to
  half-budget in-memory if storage is unavailable rather than failing open.
- `penalizeGmailQuota()` — a 403 that outlives the retry layer parks every context
  for ~60s.
- `metadataCache.ts` — message metadata persisted across scans (`chrome.storage`,
  400-entry cap, re-fetches only the last 7 days). A warm rescan should fetch only
  new mail instead of the whole mailbox.
- `unlimitedStorage` permission so a big cache can't blow the 10 MB area and take
  the ledger's own storage down with it.
- Background triage skips its cycle when quota headroom < 1,500; its install/startup
  alarm delay went 1 → 5 min.

**Status: working, paced.** The first cold scan takes ~30–45s (Gmail's ceiling —
unavoidable). Whether warm rescans are actually fast is **not yet confirmed** — that
depends on the metadata cache persisting, which hasn't been checked.

### 3. Orphaned labels + blank bookkeeping — EXPECTED FALLOUT, not a regression
The old `cluster-inspect` build (`3ec5ed1`, ~Sept 1) predates the nested→flat label
rework and several settings-schema bumps. Result now:
- Gmail still has the old **nested** `Cluster/…` labels, orphaned.
- Stored settings came up blank at schema 9: `clusterOwnedLabels: []`,
  `actionLog: []`, `autoSort` all empty, `seededFromExisting: true`.
- The current build uses flat labels and has no record of the nested ones, so it
  offers to sort again as if nothing happened.

The migration code (`migrateSettings`) is additive and non-destructive; the most
likely explanation is that the old build simply never populated those fields.
Recovery is manual: delete the orphaned nested labels/filters in Gmail, re-run
Sort/Clean — the current build then creates flat labels and records them properly.
The project's own memory already flagged this as the accepted cost of the rename at
v0/testing scale.

---

## Open questions / risks, ranked

1. **Is the warm metadata cache persisting?** If repeat dashboard opens are still
   slow, `metadataCache` isn't sticking. Check: dashboard console →
   `chrome.storage.local.get('clusterMetadataCache').then(r => console.log(Object.keys(r.clusterMetadataCache||{}).length))`
   after two scans — should be > 0 and roughly the scanned-message count.
2. **`BUDGET = 5500` vs the real 6,000.** One clean end-to-end scan with no 403,
   ideally with the dashboard open while a background alarm fires, confirms it. If
   it still 403s under that overlap, drop to 5,000.
3. **First-scan UX.** During a mid-scan quota wait the status line sits at
   "Scanning… 0/100" for up to 60s with no explanation — looks hung. A "pausing for
   Gmail's rate limit" state was noted as a contingency and not built.
4. **The rest of `docs/live-test-checklist.md` is still unrun** — Overview tiles,
   Sort preview tree, keep-sorting filters, Rules dry-run, Security tab, Screener,
   Outlook parity, theme toggle, every undo flow. The 403 blocked getting to any of
   it.
5. **Two-clone workflow.** Either delete `cluster-inspect` and add a manifest `key`
   so `~/gmail-declutter/dist` loads with the same ID, or document plainly which
   folder Chrome loads and keep it on the tested branch.
6. **PR #2 description is stale.**

---

## Suggested next steps

1. Confirm warm-rescan speed (the console check above). If broken, fix cache
   persistence — that's the difference between "30s once" and "30s every time."
2. One clean scan, no 403 → then actually work down `live-test-checklist.md`
   section by section. This is the first chance to validate the whole
   power-features + audit-remediation body of work in a browser.
3. Clean up the orphaned nested labels; re-run Sort and confirm flat labels +
   `clusterOwnedLabels` + `actionLog` all populate this time.
4. Rewrite PR #2's description; merge once the checklist's **Load** and **Clean up**
   sections pass.
5. Decide the clone situation (manifest `key` is the clean fix).
6. Optional: a one-shot "adopt or remove orphaned `Cluster/*` labels" helper for
   anyone else crossing the nested→flat boundary — or just document it as a known
   one-time v0 reset.
