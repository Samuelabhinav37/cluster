# Cluster goal and plan (2026-11-18)

Built from the system review (claude.ai/artifact/73jXmZ9uKkwF9jk6dWokPb) and the
seven-role audit (claude.ai/artifact/2Lc7BL5WsMZ9gMXcUx8drB). This replaces the
build order in `product-plan-2026-11-18.md`; its measures and release path still stand.

## The goal

Cluster does five things. Everything else waits until these are solid.

1. **Sort.** File every email into a label, so the inbox holds only what needs you.
2. **Stop.** Keep phishing, spam and unwanted marketing out of your way.
3. **Show.** The state of your mailbox: how many emails, how many per label, how many per company.
4. **Suggest and act.** Tell you what to clear and let you do it in bulk: trash, archive, unsubscribe.
5. **Report.** A download that shows the same picture as the screens.

### Rule 1: "Stop" means a different thing for each kind of mail

| Kind | What Cluster does on its own | What needs you |
|---|---|---|
| Phishing | Holds it in Spam, on by default. Starred mail never moves | "Not a scam" to let it back |
| Spam | Gmail catches most. Cluster sends what slips through to Spam | Nothing |
| Marketing | Labels it out of the inbox. **Never trashed or unsubscribed on its own** | Unsubscribe or trash, from a suggestion |

### Rule 2: one set of numbers

Every number on every screen and in the report:
- comes from the engine (`decide` / `riskOf`), never a separate count;
- uses the date range in the picker, or says its own range in the card;
- counts emails. Senders, companies and lists appear only as a second line;
- matches what Gmail really has. If a switch is off, mail isn't counted as moved.

## Measures

- **Fixes per 100** emails filed (north star, already built).
- **Screener share**: the share of new mail that lands in the Screener. A high share means Cluster isn't sorting.
- **Guardrails, must stay 0:** people's mail labelled, scams in the inbox, marketing trashed without you.
- **Numbers agree:** a test that every screen and the report give the same totals, to the email.

## Phases

Each phase ends with a test that proves it, then a commit. No phase starts while the suite is red.

### Phase 1. Honest numbers (goals 3 and 5)

| Step | Work | Where |
|---|---|---|
| 1.1 | The engine reads the hold switches (`autoQuarantineHighRisk`, `holdUnsorted`, `timeLimitsEnabled`). Off means `place: null` | `mailEngine.ts` `engineContext`, `decideWith` |
| 1.2 | Every card follows the date picker or names its own range. Unread counts within the range | `homeDashboard.ts`, `cleanupPage.ts`, `securityTab.ts` |
| 1.3 | One unit per card row: emails. Senders and lists move to the second line | same |
| 1.4 | One category set: Overview's groups are the labels (decision A below) | `overviewCharts.ts`, `homeDashboard.ts` |
| 1.5 | Numbers say "so far" until the first read finishes. Reproduce and fix the first-run stall on "Reading your sent mail" | `dashboard.ts` scan, `backgroundRead.ts` |
| 1.6 | The report is built from the same engine result the screens use | `reportDownload.ts`, `csv.ts`, `xlsx.ts` |

**Exit:** each switch-off case has an engine test; one test asserts Overview, Cleanup, Security, Labels and the report agree on all five test mailboxes.

### Phase 2. A background you can trust (goal 2's foundation)

| Step | Work | Where |
|---|---|---|
| 2.1 | Supervisor: one job table (interval, needs lease, lock, `lastOk`, `lastError`, failures, next try). Replaces the alarm handler | new `supervisor.ts`, `background.ts:126-167` |
| 2.2 | Backoff on failure (1, 2, 4 … 60 min) and a circuit per dependency (sign-in helper, Gmail, quota) | `supervisor.ts` |
| 2.3 | Health shown: badge plus a Diagnostics row for any job failing 3 times. Helper errors included | `supervisor.ts`, `settingsMore.ts` |
| 2.4 | The lease is let go when this computer can't work (signed out, no quota, offline) | `workerLease.ts` |
| 2.5 | One index read per tick, shared by every job. The 1-minute read alarm stops once the first read is done | `background.ts`, `indexTriage.ts`, `unsubscribedSweep.ts` |
| 2.6 | Self-heal: re-create missing alarms, reset an expired cursor, resume durable jobs | `supervisor.ts` |
| 2.7 | Small fixes: Today email saves its date after sending; remove the empty `runBackgroundTriage` | `background.ts` |

**Exit:** a failure-injection suite: helper down shows the badge within 3 ticks; a killed run resumes; two overlapping ticks do one index read each and write no duplicate log entries.

### Phase 3. Stop (goal 2)

| Step | Work | Where |
|---|---|---|
| 3.1 | Phishing hold on by default for the hold tier (decision B) | `settingsStore.ts`, `setupTab.ts` |
| 3.2 | The scam hold reads all mail new since its last run, not the newest 100 | `background.ts` `holdScamsFromIndex` |
| 3.3 | Marketing: labelled out of the inbox only. A test fails if any background path can trash or unsubscribe | `inboxTimeLimitsRunner.ts`, new guard test |
| 3.4 | "Did it work": emails from a sender 14 days after unsubscribing, shown per sender; still sending leads to mute | `unsubscribeOutcome.ts` |
| 3.5 | **Lists refresh themselves.** The weekly workflow runs `refresh:spam`, `refresh:blocklist` and `refresh:brands` instead of re-publishing the committed files. It publishes only if the tests pass and the change is within limits: no list shrinks by more than 20%, and no hand-listed brand domain is ever removed. Otherwise it opens an issue for review | `.github/workflows/publish-datasets.yml`, `scripts/refresh-*.mjs` |
| 3.6 | Each list carries its date. Diagnostics shows it, and a list older than 30 days counts as a failing job in the supervisor | `remoteDataset.ts`, `supervisor.ts` |
| 3.7 | Verified sender: the From domain passes DMARC **and** is that brand's domain in the registry. Shown as "Verified" (BIMI-certified companies get their logo). This turns trust from "no warning fired" into a positive check | `emailAuth.ts`, `brandRegistry.ts`, `verdict.ts` |
| 3.8 | A phishing-link feed added to the weekly build (phishunt.io is CC0; PhishTank and OpenPhish community feeds if their terms allow). Matched on device against link domains Cluster already reads. Google Safe Browsing is non-commercial only, so it waits | `scripts/refresh-blocklist.mjs`, `linkMismatch.ts` |
| 3.9 | Grow the hand brand list from 35 to the 100 most impersonated brands (banks, delivery, tax, telecoms, India and EU included), each checked against the registry | `brandDomains.json` |

**Exit:** after a simulated day with Chrome closed, 0 scams left in the inbox on every test mailbox; the no-auto-trash guard test passes; the weekly workflow publishes fresh, signed lists, or opens an issue and keeps the old ones.

### Phase 4. Sorting proven on real mail (goal 1)

| Step | Work | Where |
|---|---|---|
| 4.1 | Live test on your Gmail with `docs/live-test-checklist.md`; record fixes per 100 and Screener share for a week | your Chrome |
| 4.2 | Newsletter exceptions split across Promotions filters, under the 1,400-character cap | `categoryQueries.ts` |
| 4.3 | Learn from one move when you move all of a sender's mail; two moves only when you move one email of many | `learnFromMoves.ts` |
| 4.4 | Opens, replies, archive-unread and trash-unread feed a per-sender "care" score | `senderProfile.ts`, `mailEngine.ts` |
| 4.5 | Corrections written as Gmail filters, so they sync with no 8 KB cap and work with Chrome closed | `categoryFilters.ts`, `settingsStore.ts` |
| 4.6 | Kind signals that work in any language (List-Id, ESP, noreply plus code, currency plus order number) before the English phrases | `messageKind.ts` |
| 4.7 | Fix the known bug: a comment after `<addr>` breaks the sender address | `gmailProvider.ts` |
| 4.8 | Daily drift check: 200 recent emails, Gmail's labels against `decide()`. The mismatch count is a supervisor health number | `supervisor.ts` |
| 4.9 | Every label carries its reason ("You moved LinkedIn here", "Receipt from a shop", "Gmail says Promotions"). Details shows it, and a wrong reason is one click to correct | `mailEngine.ts`, `detailsPanel.ts` |
| 4.10 | For mail the rules can't place, test two on-device options against the same replay: a small per-user Naive Bayes over header words (Rspamd style), and Chrome's built-in Gemini Nano (Prompt API, stable for extensions since Chrome 138) on sender and subject only. Ship the better one only if it lowers fixes per 100 and labels 0 people | new `unsureModel.ts` |

**Exit:** your inbox under 5 fixes per 100 for 7 days, Screener share agreed with you as reasonable, and the drift check under 2%.

### Phase 5. Safe bulk actions (goal 4)

| Step | Work | Where |
|---|---|---|
| 5.1 | Every trash, archive and bulk unsubscribe runs as a durable job, with Undo written per chunk | `dashboard.ts` `executeSmartDelete`, `durableJobs.ts` |
| 5.2 | Suggestions ranked by never-opened first (0 opens in 60 days, 10+ emails), then volume | `cleanupCards.ts`, `suggestions.ts` |
| 5.3 | Each suggestion shows what happens and offers one bulk action | `cleanupPage.ts` |
| 5.4 | Beat Gmail's free "Manage subscriptions" page, which ranks senders by volume only. Cluster adds never-opened ranking, "did it work", auto-mute for senders who keep sending, and bulk trash of a sender's old mail in the same step | `subscriptionsTab.ts` |
| 5.5 | Saved cleanups: turn any suggestion into a standing rule ("keep the newest 3 from this shop, archive the rest"), the way Clean Email's Auto Clean works, always as archive or label, never trash, unless you choose trash | `rulesTab.ts`, `keepNewest.ts` |

**Exit:** a test closes the tab halfway through a 1,000-email trash; the job resumes, the index matches Gmail and Undo covers every email.

### Phase 6. Report (goal 5)

| Step | Work | Where |
|---|---|---|
| 6.1 | One-page summary: mailbox state, by label, by company, what Cluster did this period, open suggestions | `reportDownload.ts` |
| 6.2 | Detail as CSV/XLSX with the same totals | `csv.ts`, `xlsx.ts` |

**Exit:** the "numbers agree" test includes the report.

### Phase 7. Trim and get ready to ship

| Step | Work |
|---|---|
| 7.1 | Privacy page covers the sign-in helper and the Athena admin events |
| 7.2 | One onboarding flow, with Kai explaining each step; retire the other three |
| 7.3 | Split `dashboard.ts` along scan, actions and pages; lazy-load the spam-domain list; remove the legacy CSS block; fold the 83 loose colours into tokens |
| 7.4 | Start Google verification for `gmail.modify` |
| 7.5 | Friends beta: 5 people first, replay export on, exit at under 5 fixes per 100 for 4 weeks |
| 7.6 | Store listing says plainly what Unroll.me didn't: no server reads your mail, nothing is sold, the code that sorts runs in your browser |

## How trust works today (and what this plan changes)

**Is a company like LinkedIn trustworthy?** Cluster doesn't keep a list of trusted companies. Every sender starts trusted, and a warning or hold needs signals:

| Signal | Source | Freshness today |
|---|---|---|
| Failed DMARC, or both SPF and DKIM failed | Gmail's own `Authentication-Results` header | Live, per email |
| Name claims a brand, domain isn't that brand's | Hand list (35 brands) widened by the registry: 288 BIMI-certified companies (certificate chain checked against pinned CAs) and 36 from Wikidata (never outranks the hand list) | Registry built 30 Oct 2026, by hand |
| Lookalike or punycode domain | Unicode confusables table, Public Suffix List | Refreshed by hand |
| Known-bad domain | URLhaus malware hosts (29 Aug), disposable and StopForumSpam domains (30 Aug) | About 80 days old |
| Lure words, reply-to mismatch, risky attachment, Gmail flagged | Rules in `threatSignals.ts` | In the code |

Scores add up: 3 points warns; 6 points holds, and only if two kinds of signal agree or one decisive signal fires. People you write to can't trip the brand checks unless authentication also fails.

**How the lists update:** the `refresh:*` scripts are run by hand and committed. The weekly workflow signs those committed files (Ed25519) and publishes them; the extension fetches daily and refuses an unsigned brand list. Signing stops tampering, but nothing makes the lists fresh: the workflow re-publishes the same files. Steps 3.5 to 3.9 fix that.

**How labelling is checked:** about 1,500 tests on five mailboxes we wrote (99 to 100% acceptable), filters tested against our own copy of Gmail search, and fixes per 100 on real mail. Nothing compares Gmail's real labels with the engine at runtime, and no real inbox has been measured. Steps 4.1, 4.8 and 4.9 fix that.

## Research: tools and competitors

**Free and open data or tools to use** (licence checked before each is added):

| Tool | Use in Cluster | Status |
|---|---|---|
| disposable-email-domains, StopForumSpam, URLhaus, Tranco, Public Suffix List, BIMI | Already used | Needs the automatic refresh (3.5) |
| phishunt.io (CC0), PhishTank, OpenPhish community | Phishing links | New (3.8) |
| Chrome Prompt API (Gemini Nano) | On-device fallback for unsure mail | Test in 4.10 |
| Google Safe Browsing | Link checks | Non-commercial only; Web Risk for commercial. Later |

**Open-source apps to learn from, not copy:** Inbox Zero (AGPL with extra terms: its code can't go into Cluster) categorises senders and bulk-unsubscribes from never-read mail. MailScrub tries one-click POST, then GET, then mailto, which matches Cluster's order. QuiteInbox and MailMop (MIT) run fully in the browser like Cluster. Unroll.me is closed source and the warning: in 2019 the FTC found it shared users' e-receipts with its parent company.

**Competitors and what each teaches:**

| Product | How it solves sorting and cleanup | Lesson for Cluster |
|---|---|---|
| Gmail Manage subscriptions | Free, built in, senders ranked by volume, one-click unsubscribe | Bulk unsubscribe alone is no longer a reason to install. Cluster must add ranking by reading, follow-up and cleanup (5.4) |
| Clean Email | 33 smart folders, Auto Clean rules, a Screener; server-based | Closest competitor. Saved cleanups (5.5); Cluster's edge is no server |
| SaneBox | Headers and subject only; learns a sender from one move | One-move learning (4.3) |
| HEY | Screener for first-time senders; route a sender vs move one email | Already followed; keep the sender/email split (4.3) |
| Superhuman, Shortwave | Rules first, AI prompts per label | Optional AI only for unsure mail, on device (4.10) |
| Apple Mail | Four categories, on device, metadata only | Validates the privacy model; informs decision A |

## Frozen until the five goals pass

Kept in the code, no new work: Outlook, Athena events, the Today email, newsletter day, AI rule drafts, Kai chat beyond setup.

## Decisions for you

- **A. Categories on Overview:** show the labels themselves, or four groups (People, Receipts and orders, Updates, Marketing) that each list their labels?
- **B. Phishing hold default:** on for every new user (recommended), or asked in setup?
- **C. Screener:** keep holding first-time senders (HEY style), or label them by rule and only screen strangers on free mail?
