# Cluster — setup, working agreements, and what's left for you

This is the single place to start: how to get the project running locally,
and a clear list of the things only you can do (GitHub/Google/Microsoft
account actions, decisions, and live testing) versus what's already done in
code. For what the extension actually does, see [`README.md`](README.md); for
the full data/privacy story, see [`SECURITY.md`](SECURITY.md) and
[`docs/privacy.md`](docs/privacy.md).

## 1. Dev environment

**Canonical clone: `~/cluster-inspect`.** There's a second, abandoned clone at
`~/gmail-declutter` from earlier in the project's history — don't edit or
build there (see [`docs/dev-setup.md`](docs/dev-setup.md) for why: it silently
wastes time, not just disk space).

```bash
cd ~/cluster-inspect
npm ci                # install — use ci, not install, to match the lockfile exactly
npm run typecheck     # tsc --noEmit
npm run lint           # eslint
npm test               # vitest, ~570 tests, a few seconds
npm run build          # writes dist/
```

All four should be green before you trust anything. CI (`.github/workflows/ci.yml`)
runs the same four on every push/PR.

### Loading the extension in Chrome

1. `npm run build` (writes `dist/`).
2. Chrome → `chrome://extensions` → enable **Developer mode** (top right) →
   **Load unpacked** → select `~/cluster-inspect/dist`.
3. Click the toolbar icon to open the dashboard.

Google and Microsoft OAuth are **already configured** for this project (Google
Cloud project `project-g-506701`, Azure app registration) — you don't need to
set those up again. If `chrome.identity.getAuthToken` ever fails with a
bad-client-id error, it almost certainly means Chrome loaded a *different*
folder than `~/cluster-inspect/dist` (the extension ID is derived from the
absolute install path — see `docs/dev-setup.md`), not a real auth problem.

### Where things stand on GitHub

- Repo: [github.com/Samuelabhinav37/cluster](https://github.com/Samuelabhinav37/cluster)
  (public).
- Working branch: **`redesign/apple-glass-v3`**, open as
  [**PR #8**](https://github.com/Samuelabhinav37/cluster/pull/8) — not merged
  to `master` yet. Everything described below is on this branch.
- The full plan for everything in flight (this session and the redesign
  before it) lives at `C:\Users\samue\.claude\plans\quiet-sparking-gray.md` on
  this machine — worth opening if you want the full reasoning behind any
  decision below, not just the summary.

## 2. What's done (this session)

**Workstream A — safety fixes.** Bulk-delete/suggestion surfaces (expiry
cleanup, suggested-spam, never-opened, domain-delete, keep-newest, smart
views) now share one protection gate instead of each having its own narrow,
inconsistent check — starred/flagged, Gmail/Outlook's own personalized
importance signal, anyone you've actually emailed, an active discount/
return-window phrase in the subject, order/shipping mail (never auto-expires
by age at all now), and sensitive subjects. Fixed the actual bug that
prompted this: the Subscriptions tab's "Unsubscribe + clean…" button never
re-checked Gmail live before deleting, unlike every other delete path.
Outlook's live protection re-check, previously missing entirely, is in.
There's a static regression test (`src/dashboard/bulkDeleteGuard.test.ts`)
that will fail the build if a future new delete button skips this check —
verified it actually catches the original bug, not just passes trivially.

**Workstream F1 + I — brand-domain accuracy, and a way to fix it without
shipping a new release every time.** Audited all ~30 brands in the
impersonation-detection list against primary sources (each brand's own
security/support pages) rather than guessing — found and fixed real gaps for
Amazon, Microsoft, DHL, Dropbox, Verizon, and AT&T (see the plan file for the
sourcing on each). Also found and fixed a real algorithm bug the audit
exposed: a brand's own legitimate domains could get flagged as lookalikes of
*each other* (`amazon.in` vs `amazon.ca`) because the check compared them in
array order instead of checking full-list membership first.

Beyond the one-time fix: built a small, generic mechanism
(`src/lib/remoteDataset.ts`) so this class of fix can reach installed users
within a day instead of waiting for a new Chrome Web Store release. A
scheduled GitHub Actions job publishes the brand-domain list and the existing
malware/spam blocklists to GitHub Pages; the extension checks once a day and
merges in anything new. **No user data is ever in these requests** — it's a
plain `GET` for a public file, identical for every install, and every
dataset keeps working on its bundled fallback if the fetch is ever
unreachable. `docs/privacy.md`/`SECURITY.md` are updated to describe this
honestly.

**Not started yet**: B (finish two dashboard sections still using the old
table-style design), C (a real first-run/onboarding flow), D (remember when
you've dismissed a suggestion so it stops reappearing), E (make the
dashboard show your last scan instantly instead of a blank 30-45s wait), F2
(a false-positive fix for mail forwarded through mailing lists), F3
(catch phishing domains like `amazon-security-verify.com` that today's
edit-distance check misses), F4 (BIMI — researched, deliberately not
recommended, see the plan), G (stop a real person's LinkedIn
connection/Google Drive share from showing up as a "subscription"), H
(optional "Amazon is the parent, these are the children" sender grouping).

## 3. Tasks for you

These need a human — an account, a judgment call, or eyes on the real
product. Roughly in the order that unblocks the most:

### 3.1 Enable GitHub Pages (5 minutes, blocks everything below)

1. Go to `https://github.com/Samuelabhinav37/cluster/settings/pages`.
2. Under **Build and deployment → Source**, choose **GitHub Actions** (not
   "Deploy from a branch").
3. That's it — no branch to pick, no files to add. The workflow
   (`.github/workflows/publish-datasets.yml`) handles the rest once it runs.

### 3.2 Decide how to get the publish workflow running

GitHub Actions **scheduled** (`cron`) triggers only fire from a repository's
**default branch** (`master` here) — a workflow file sitting on
`redesign/apple-glass-v3` won't run on its own schedule until that branch (or
at least that workflow file) reaches `master`. Two ways to proceed, your
call:

- **Merge PR #8 now.** This is the actual gating decision for the whole
  redesign, not just this workflow — see §3.4. If you're ready, this is the
  cleanest path: everything (redesign + safety fixes + this workflow) goes
  live together and the weekly publish just starts working.
- **Test it without merging first.** From the
  [Actions tab](https://github.com/Samuelabhinav37/cluster/actions/workflows/publish-datasets.yml),
  click **Run workflow**, pick the `redesign/apple-glass-v3` branch, and run
  it manually (`workflow_dispatch` works from any branch). Good for
  confirming the mechanics work before committing to the merge decision.

### 3.3 Verify the pipeline actually works end-to-end

After either running the workflow manually or merging (and the scheduled run
firing):

1. Check the [Actions run](https://github.com/Samuelabhinav37/cluster/actions/workflows/publish-datasets.yml)
   went green.
2. Visit `https://samuelabhinav37.github.io/cluster/brandDomains.json`
   directly in a browser — you should see the JSON from
   `src/lib/data/brandDomains.json`. Same for `malwareDomains.json` and
   `spamDomains.json`.
3. In the loaded extension: open the dashboard, wait a day (or see the next
   bullet to force it sooner), then open the service worker console
   (`chrome://extensions` → Cluster → "service worker" link → Console tab)
   and confirm no `Dataset refresh failed` errors logged.
4. To force a refresh sooner for testing rather than waiting for the daily
   alarm: in that same service worker console, you can inspect
   `chrome.storage.local` for keys starting with `remoteDataset:` once a
   refresh has run, to confirm the cache populated.

### 3.4 The real decision: when does `redesign/apple-glass-v3` merge to `master`?

This has been the standing gate since before this session — PR #8 is now 35+
commits (the full Liquid-Glass redesign, the fix-plan phases, and everything
from this session). Nothing in it, including this session's safety fixes,
has ever been live-tested in a real browser against a real mailbox. Worth
doing a real pass through `docs/live-test-checklist.md` before merging,
given the stakes (this is the branch that fixes real data-loss-adjacent
bugs — worth confirming the fixes actually work before they reach `master`).

### 3.5 Live-test, focusing on what changed this session

Beyond the general checklist, specifically re-verify the behaviors this
session's commits were about:

- Star a message from a sender mid-session, then use "Unsubscribe + clean…"
  on that sender from the Subscriptions tab — the now-starred message should
  survive.
- Check that order-confirmation/shipping mail no longer appears in any
  auto-expiry suggestion, no matter how old.
- Confirm the "Order & shipping" Smart View's Trash button is visibly
  disabled with an explanatory tooltip, while Archive still works.
- Send yourself (or find) a real email from an Amazon regional domain
  (`amazon.in` if you have access, or any other confirmed-added domain) and
  confirm it's not flagged as possible impersonation.

## 4. Picking this back up later

If you're starting a new Claude Code session on this: point it at this file
first, and at `C:\Users\samue\.claude\plans\quiet-sparking-gray.md` for the
full reasoning and the remaining B–H workstreams. The canonical clone is
`~/cluster-inspect`; `git log --oneline -20` there will show exactly what's
landed since this doc was written.
