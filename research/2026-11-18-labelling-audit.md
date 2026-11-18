# Labelling audit: how it works, what's broken, how to improve (2026-11-18)

Scope: everything that decides where an email goes. Code on `feat/speed-domains-2026-11`.
Method: code read, 5 full test runs, scaling benchmarks, a new test that runs the Gmail filters themselves, a read-only look at the real mailbox, and competitor research.

## 1. How it works

Five stages touch every email. They run at different times with different information.

| # | Stage | Code | Runs | Sees |
|---|---|---|---|---|
| 1 | Gmail filters | `categoryQueries.ts`, `categoryFilters.ts` | On arrival, Chrome open or not | Subject words, sender address, Gmail tab |
| 2 | Client tagger, scam hold, Screener, Personal | `inboxTimeLimits.ts` (`tagUntaggedInbox`, `screenFirstTimeSenders`, `holdUnsortedInbox`), `verdict.ts` | Every 5 min with Chrome open | Full metadata: headers, auth results, sender history, who you write to |
| 3 | Daily search labelling | `labelBySearch` (all mail) | Daily | Same as stage 1, over the whole archive |
| 4 | Index relabel | `labelFromIndex`, `relabelInbox` | Daily, once the background read is done | Same as stage 2, over all read mail |
| 5 | Learning | `learnFromMoves.ts`, Details "Label as", setup board, Screener | When you correct something | Per-sender corrections (`sortOverrides`) |

The decision itself is a ladder of hand rules (`classifyMessageKind` → `classifySortBucket` → `effectiveBucket` → `senderBuckets`): subject regexes pick a kind, a curated domain list picks a category, and about 15 ordered rules decide between them. Stage 1 is a second, separate copy of those rules written as Gmail search syntax.

## 2. Test health: flaky

5 full runs: **4 failed**, 1 passed. Every failure is timing, not logic.

| Test | Failed | Cause |
|---|---|---|
| `performance.test.ts` "metadata → senders under 2 s" | 4/5 | Wall-clock budget, measured while 160 other files run in parallel (2.07–3.47 s). Alone: passes. |
| `performance.test.ts` "threat scoring under 1.5 s" | 2/5 | Same |
| `setup.dom.test.ts` (2 tests) | 2/5 | Kai's line types out letter by letter; `vi.waitFor` gives up after its 1 s default (`'Go'` vs the full line) |
| `screener.actions.dom.test.ts` | 1/5 | Same 1 s `waitFor` default |

Fix: run the performance file on its own (a separate Vitest project or `--sequence`), and give the DOM waits a 5 s timeout. A red suite that is "usually just timing" hides real failures.

## 3. Time and space

Measured (Node, this laptop):

| Mailbox | Build senders | Label decision (`bucketsFor`) |
|---|---|---|
| 2,500 emails / 500 senders | 342 ms | 20 ms |
| 5,000 / 1,000 | 605 ms | 32 ms |
| 10,000 / 2,000 | 1,250 ms | 61 ms |
| 20,000 / 4,000 | 2,887 ms | 120 ms |

- The label decision is linear and cheap. Building sender records is slightly worse than linear and dominates (threat scoring edit-distances every domain against every brand).
- **Memory:** about 76 MB of heap per 20,000 emails as sender records. The daily relabel loads *every* indexed row (cap `MAIL_INDEX_MAX` = 100,000), which projects to about 380 MB and about 15 s of CPU in one service-worker pass. That is a crash risk on a big mailbox.
- `categoryQueries` rebuilds each query while growing it, so it is quadratic in domains (5 ms total, fine). It is also linear in corrections per label, which causes bug B1 below.
- API cost per 5-minute run: the sweep lists every label twice (about 30 list calls). That's fine.

## 4. Accuracy

**Client pass (stage 2) on the test mailboxes:** 99.4–100% acceptable, 80–88% ideal. 0–0.8% of labels wrong, Screener holds 13–28% of mail.
These numbers are overfit. Each "held-out" mailbox became a tuning set once its misses were fixed (cycles 1–3), and the same person wrote the generator and the rules.

**Gmail filters (stage 1), measured for the first time** (new `src/lib/filterVsClient.test.ts` with a query evaluator in `src/test/gmailQuery.ts`):

| Mailbox | Filters label | Of those, wrong | Disagree with client | People labelled | Scams labelled |
|---|---|---|---|---|---|
| Tuned (real brands) | 72.8% | **16.7%** | 19.3% | 13 | 22 |
| Held-out A | 38.3% | 3.9% | 3.8% | 11 | 0 |
| Held-out B | 42.9% | 0% | 0% | 0 | 0 |
| Held-out C | 47.4% | 3.8% | 3.8% | 36 | 0 |
| Held-out D | 52.3% | 0% | 0% | 0 | 0 |

Top filter mistakes on the tuned mailbox: publisher newsletters filed as Promotions (95), sign-in links filed as Work (30), Amazon "shipped" as Shopping (22), GitHub/Jira comments as Social (14), calendar invites as Work (13), Facebook sign-in alerts as Social (12), DocuSign scams as Receipts (12).

**The real mailbox** (read-only, 2026-11-18): about half of the last 60 days of 🧾 Receipts was wrong or debatable (Discover payments ×8 should be Finance, ADPList mentor bookings ×8, a job application receipt, two Amazon order notices). One Amazon order was spread over three labels. 3 of 15 Screener threads were misses.

Conclusion: what the user sees is decided mostly by the filters, which are the least accurate stage. The 99% figure measures a different stage.

## 5. Bugs, worst first

| # | Severity | Bug | Where | Proof |
|---|---|---|---|---|
| B1 | High | Every correction is added to every *other* label's first filter query. At about 30–50 corrections that query passes Gmail's ~1,500-character limit (1,951 at 50, 4,401 at 200). Gmail refuses it. The sync has already deleted the old filter, then throws, so that label has **no filter**, every label after it in the loop is not updated, and nothing is saved, so it repeats every 5 minutes | `categoryQueries.ts` `overrideTerms`/`buildQuery`, `categoryFilters.ts` `syncCategoryFilters` | Benchmark above, code read |
| B2 | High | The filters are a second, looser copy of the rules (16.7% wrong vs under 1%). Cluster's own pass skips mail that already has a label, so the filter's answer wins | stage 1 vs stage 2 | Section 4 |
| B3 | High | The relabel only fixes mail it can give a label to. If the right answer is "no label" (a person, Screener mail), a wrong filter label stays forever. Example: a colleague's "Invoice for March" keeps 🧾 Receipts | `labelFromIndex` only walks `bucketsFor` groups | Code read; held-out A and C people-labelled counts |
| B4 | High | Letting a sender in from the Screener puts it on the same "known" list as people you write to. Known senders are skipped by the tagger and the relabel, but the filters still label them, so filter mistakes on let-in companies are never fixed. Likely cause of Discover stuck in Receipts | `knownSenderSet` (`screener.ts`) used by `skipSender` | Code read; needs the extension's data to confirm |
| B5 | Medium | Daily search labelling runs every filter query over the whole archive, so a filter mistake spreads to old mail, not just new | `searchLabelInbox` → `labelBySearch({allMail})` | Code read |
| B6 | Medium | Accuracy is printed but never asserted. A change that drops accuracy passes the suite | `realisticMailbox.test.ts` | Code read |
| B7 | Medium | The accuracy harness ignores the filters (stage 1) and the relabel (stage 4), so it measures a path users rarely see | `src/test/sortHarness.ts` | Code read |
| B8 | Medium | The relabel loads up to 100,000 rows in one service-worker pass (about 380 MB projected) | `relabelInbox` | Section 3 |
| B9 | Medium | 4 of 5 full test runs fail on timing | Section 2 | 5 runs |
| B10 | Low | Tagger lists the newest 100 unlabelled inbox emails from the last 2 days. Mail it deliberately leaves unlabelled (people, kept) fills those 100 slots, so in a busy 2 days older unlabelled mail in the window waits for the catch-up pass | `TAG_MAX` in `tagUntaggedInbox` | Code read |
| B11 | Low | Gmail-move learning still saves whole-sender corrections; only Details saves per-kind ones | `learnFromMoves.ts` | Code read |

## 6. Is it learning?

No. The rules don't learn. The only thing that adapts is a table of per-sender corrections.

- `kindModel.ts` (Naive Bayes over subject words) only feeds cleanup protection, never labels.
- In the last 30 days, 39 commits changed the rule files (`messageKind`, `sortTaxonomy`, `domainCategories`, `categoryQueries`) and `inboxTimeLimits.ts` changed 30 times. Most are "fix mislabels found in a real inbox".
- The same three mistakes keep coming back:
  1. A phrase or domain is missing from a hand list.
  2. Two rules conflict and the order is wrong (receipt vs jobs, shipping vs receipt, Promotions vs domain).
  3. The filters and the client say different things.
- Each round fixes the examples found, then the next look at the real mailbox finds new ones. That is whack-a-mole: the fixes don't generalise, because nothing learns from the user's own mail.

## 7. How others do it

| Product | How it decides | Learns from | What to take |
|---|---|---|---|
| SaneBox | Server-side, sender history + Sent folder | One move between folders; can train a sender **or a type of email** (a store's newsletters vs its shipping); lists trained as "services" | Learn from **one** move, not two, for moves into the inbox. Per-kind training (Cluster has half of it now) |
| Superhuman | AI reads content, subject, sender, recipients; built-in Marketing/Pitch/Social/News; custom labels from a prompt | Prompt, then it **shows matches for you to confirm** before applying | Preview-and-confirm when a rule or correction would move many emails |
| Tekst | Business shared inboxes; AI classifies type, intent and urgency, then routes | Historical data | Not a consumer competitor; the "intent + urgency" split fits Cluster's time-sensitive work |
| cloudHQ Auto Label | Plain rules by recipient domain, written as Gmail filters | Nothing | The same filter-only approach as Cluster's stage 1, which shows its limit |
| Gmail / Yahoo (papers) | Per-user ML on `<sender, subject template>` (Wendt et al., WSDM 2016; Grbovic et al., CIKM 2014) | Every user action | Templates, not phrases: learn per sender+template from the user's own mail |
| HEY, Inbox Zero, Shortwave, Apple, Clean Email | See `2026-11-18-labelling-algorithm-research.md` section 2 | | Screener, confidence cut ("Other when unsure"), sender+kind |

The difference: every product that stays accurate either learns per user (SaneBox, Gmail, Yahoo) or reads content with a model (Superhuman, Shortwave, Inbox Zero). Cluster does neither. It has hand rules and a correction table, and keeps a metadata-only promise.

Sources: [SaneBox: how do I train](https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox), [SaneBox: how it determines trainings](https://www.sanebox.com/help/186-how-does-sanebox-determine-trainings), [Superhuman: Split Inbox and Auto Labels](https://blog.superhuman.com/solving-customer-success-email-overload/), [TechCrunch: Superhuman AI categorization](https://techcrunch.com/2025/02/19/superhuman-introduces-ai-powered-categorization-to-reduce-spammy-emails-in-your-inbox), [Tekst: AI email labelling and routing](https://tekst.com/use-cases/ai-driven-email-labeling-routing), [cloudHQ Auto Label (Chrome Web Store)](https://chromewebstore.google.com/detail/gmail-auto-label-by-cloud/gdadckddcgbbopndmccfoibflnoeinca).

## 8. How to improve, in order

1. **Stop the bleeding (B1, B9).** Keep corrections out of other labels' queries; give them their own queries, chunked under the limit, as kind-scoped corrections already have. Make the filter sync create before it deletes, and catch per label so one refusal can't stop the rest. Fix the flaky tests.
2. **One source of truth (B2, B3, B5).** Filters should only label what is near-certain: curated domains and corrections, never subject phrases from unknown senders. The client decides the rest. The relabel must also *remove* a Cluster label when its answer is "no label". Daily search labelling should use the same narrow queries.
3. **Separate "let in" from "you write to them" (B4).** A let-in company still gets labelled; only people you write to skip labels.
4. **Measure the real thing (B6, B7).** The harness runs all stages (filters → client → relabel). Accuracy gets asserted floors per mailbox. Add a monthly real-mailbox scorecard from `clusterExportReplay()`, scored by hand, as the number we steer by. New held-out mailboxes are written by someone other than the rule author, or generated from real exports.
5. **Make it learn (the big one).** Reuse `kindModel.ts`'s Naive Bayes, made multi-label, on device and metadata only:
   - Features: sender key, subject template (`skeleton()` already exists), Gmail tab, Purchases/Reservations flags, list headers.
   - Training data: the user's corrections (strong), plus labels the user kept for 7+ days without moving (weak).
   - Use: only when the rules return no label or disagree, and only above a confidence cut (90%), else the Screener (Inbox Zero's "Other when unsure").
   - This turns "add a phrase" commits into data the user generates by using the app, and keeps the metadata-only promise.
6. **Learn faster from moves (B11, SaneBox).** One move into the inbox or Personal counts at once. Moves between labels save per-kind corrections.
7. **Bound memory (B8).** Relabel in pages of 5,000 with progress saved between pages.
