# Cluster — reading the results, and a direction

**Date:** 2026-09-06
**Author's stance:** written as if I'm the researcher on this team. Opinionated
on purpose. Draws on this session's quota fix, the architecture/complexity
bench, and the competitor-mechanism survey.

---

## Part 1 — How to read where we are

### The one-line honest summary

Cluster is a **feature-complete prototype that, until this week, had never been
used for real by anyone — including its author.** ~8 feature phases + an audit-
remediation pass are compiled, typechecked and unit-tested green. The first
sustained live test (this session) immediately hit a **deterministic** bug that
made the core scan unusable, a build-process mistake, and a settings/label
reset from version drift. Two of three are fixed; none is re-verified end to end.

### What "tests green" has been standing in for — and shouldn't

The memory file says *"not yet live-tested"* dozens of times. That phrase
recurring is itself the finding: **the team keeps building past unverified
work.** "Contract tests pass" proved almost nothing about whether a real scan
completes — a 4×-wrong quota-cost constant sailed through every test and killed
the product on first contact with Gmail.

Research discipline this implies:
- Every capability claim carries a **verification method** and a **status**
  (`unit` / `contract` / `live-manual` / `live-scripted`). "Unverified live" is
  tracked as a debt with a number, and that number is not allowed to grow.
- A **scripted live test** (Puppeteer against a throwaway Gmail) so "works in a
  browser" stops being a manual ritual nobody performs.
- The bench (`scripts/bench-pipeline.mts`) + `pipeline.contract.test.ts` are the
  regression floor. They are necessary, not sufficient.

### What we actually know vs. assume

| Know | Assume (no evidence) |
|---|---|
| CPU is free — a real scan processes in <100 ms; the product is 100% Gmail-quota-bound | that warm rescans are fast (metadata-cache persistence is **unverified**) |
| The privacy architecture (no server, header-only, OSS) is genuinely differentiated — no competitor can say it | that anyone *wants* a browser-only cleaner, or will trust it more for being one |
| The deterministic classifier is fine for "Amazon → Shopping" | that deterministic-only classification is *good enough* to retain a user |
| ~0 users, unlisted, no landing page, OAuth app capped at 100 test users | anything about retention, activation, or which features matter — **we have no funnel and no instrumentation** |

### The measurement problem, stated plainly

**There is no server, so there is no analytics, so we cannot see what users
do.** "Understand the results" has a hard constraint. The only honest ways to
get signal:
1. A **beta cohort with interviews** — even n=15–25. Watch a first scan over a
   call. This beats n=0 telemetry infinitely and is available now.
2. **Opt-in, local-first, aggregate-only telemetry** — a "share anonymous
   counts" toggle that batches integers (scans run, senders actioned, features
   touched), never content, never per-message. Default off. This is the only
   scalable option and it must be built to the same no-content bar as the rest
   of the product or it poisons the story.

Without one of these, every roadmap decision from here is a guess dressed as a
plan.

---

## Part 2 — Direction

### Constraints that are load-bearing — don't fight them

- **Browser-only, no server, header-only, open source.** This *is* the product.
  Every competitor either runs a server on your mail (SaneBox, Clean Email,
  Unroll.me — the last one sells the data) or *is* the mail provider (Gmail,
  HEY). "Your inbox never leaves your machine, and you can read the code" is the
  one sentence none of them can say.
- The same constraint caps the product: **no cross-device, no cloud-learned
  model, no analytics, and the background sweep only runs while Chrome is open.**

### The strategic question: tool or habit?

- SaneBox's moat is that it's a **habit** — daily triage, a learned model that
  compounds. Retention is the business.
- Cluster today is a **one-shot cleanup tool** with one-shot economics: run it,
  maybe again in three months.
- Given no server / no cross-device / background-only-when-open, Cluster is
  **structurally a periodically-run power tool, not a daily ambient service.**
  Stop trying to be the latter. Win as: *"the thing you run every few weeks that
  is dramatically better than Gmail's native cleanup — and never phones home."*

### How to make it more powerful (within the constraints)

1. **Close the learning loop locally — highest leverage.** Gmail's own Priority
   Inbox paper shows the personal model is just *"how you differ from a global
   prior"* and can be tiny. Cluster can ship a small hand-tuned global prior plus
   a per-user delta (logistic regression over `unread` / read-rate / action-log
   / unsubscribe-outcome features) living entirely in `chrome.storage`. The
   complexity bench already proved the CPU cost is nil. This is simultaneously:
   the thing competitors' moats are built on, a real power increase, and **zero
   violation of no-server.** `engagementModel.ts` is the stub; make it real.
   First use: rank the cleanup/never-read lists by predicted "you won't miss
   this," not just volume.
2. **Semantic classification without a server.** Chrome's on-device
   `LanguageModel` (Prompt API) — already partly wired (`aiRuleDraft`,
   `aiDigest`). Use it only for the `null` cases of the deterministic classifier
   and for `messageKind`, as an **optional accuracy upgrade, never a
   dependency** (hardware-gated). This is the "LLM semantic triage" mechanism
   from the competitor survey, done locally.
3. **Make recurring value visible.** The Overview tab is the right instinct — a
   deterministic inbox-health front door. Make re-running genuinely cheap
   (verify the warm cache), and show the **delta**: "since your last scan: 40
   new promo senders, 3 new senders you never open, 1 possible-impersonation."
   A tool you re-run needs to reward re-running.
4. **Verifiable unsubscribe as a wedge.** Cluster already only reports
   "unsubscribed" when it can prove it (RFC 8058 one-click POST) — stricter than
   Unroll.me or Leave Me Alone. Lean in: *"we don't tell you it worked unless it
   did."* This is a trust claim and an SEO surface ("does unsubscribe actually
   work", "is Unroll.me safe").

### How to get it used by a lot of people

1. **Make the privacy story falsifiable.** Today the best feature is invisible:
   unlisted, no landing page, nothing to read. A prospective user cannot verify
   the claim, so it isn't a claim. Fix: a landing page that names exactly which
   headers are read and shows an empty network tab; a Chrome Web Store listing;
   the repo as the proof. (Prior competitive research already flagged this as
   the #1 distribution gap.)
2. **Channels that fit a no-server OSS privacy tool:** Chrome Web Store organic
   search ("clean gmail", "gmail unsubscribe", "inbox cleanup"); the
   privacy/OSS communities (HN "I built a Gmail cleaner with no server", r/privacy,
   r/degoogle, Lobsters); SEO content on the exact anxieties competitors create
   ("is Unroll.me selling my email", "clean up Gmail without giving a company
   access").
3. **Confront the OAuth verification wall — it's the real gate.** The app is in
   "Testing": 100-user cap, 7-day token expiry. Past ~100 users needs Google
   OAuth verification, and the restricted scopes (`gmail.modify`) likely trigger
   a **CASA security assessment** — weeks and real money. Options, pick one
   explicitly:
   - do the verification + CASA (the `docs/oauth-scope-justification.md` groundwork
     exists); treat it as a funded project, not a someday.
   - execute the incremental-auth plan (drop `gmail.settings.basic` from install
     scope) to shrink the review surface.
   - accept a 100-user ceiling and run as an invite-only power tool while the
     learning loop and retention are proven — *then* pay for verification.
   Distribution is capped at 100 users until this is decided.

### Traps

- **Building more features before the existing ones are verified live.** This is
  the documented pattern. Freeze new features until a scripted live test is
  green across the checklist.
- **Chasing a daily ambient-service shape.** The architecture won't support it.
- **Adding a server "just for sync/analytics."** That discards the entire
  differentiation. If sync is ever needed it must be user-held (export/import,
  or the user's own Drive).
- **Outlook parity before Gmail retention is proven.**

---

## Part 3 — Sequencing (next ~6 weeks of research/eng)

1. **Verify what exists.** Finish the live-test checklist; write the Puppeteer
   scripted version; confirm warm-cache persistence; re-run Sort/Clean on a
   clean account and confirm labels + `clusterOwnedLabels` + `actionLog`
   populate. Close the "unverified live" debt to ~zero. *No new features until
   this is done.*
2. **Get a funnel.** Recruit 15–25 beta users (privacy/OSS communities). Watch
   first scans. Define install → first-scan-completes → first-action →
   returns-in-30d and measure it by hand.
3. **Ship the local learning loop v1** (`engagementModel.ts`): global prior +
   per-user delta, used to rank the never-read / cleanup lists. Interview the
   cohort on whether the ranking feels right.
4. **Landing page + Web Store listing** built around the falsifiable privacy
   claim. Decide the OAuth-verification path.
5. Only then: on-device semantic classifier for the classifier's `null` cases,
   and the "since last scan" delta on Overview.

### What we'd learn, and the kill criteria

- If beta users don't complete a first scan → the quota-paced 30–45 s first run
  is fatal; the fix is aggressive default caps + a resumable background first
  scan, not more features.
- If they complete one scan and never return → Cluster is a one-shot utility;
  optimise top-of-funnel and SEO, drop the "habit" ambitions and the background
  alarm investment.
- If they return but ignore the learned ranking → the engagement model isn't
  the moat here; the moat is "no server + verifiable unsubscribe" and the
  roadmap should be trust-and-distribution, not intelligence.
- If they return *and* lean on the ranking → close the SaneBox gap hard; that's
  the product.
