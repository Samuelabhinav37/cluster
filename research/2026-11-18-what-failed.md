# What failed on 2026-11-18, and why

Scope: the audit fixes (B1 to B11), the engine steps 0 to 7, and how the work was done. Every number here was measured on the five test mailboxes (Tuned, held-out A to D, 11,000 emails) unless it says otherwise.

## Summary

| # | What failed | Kind | Root cause | State |
|---|---|---|---|---|
| 1 | Step 7 learning model | Design | The Screener holds almost nothing a model could label, and what it holds is unlike anything the model trained on | Held back |
| 2 | Plan exit "filter error under 2%" | Goal missed | Gmail filters can't see the list header that makes an email a newsletter | Open, Tuned 9.5% |
| 3 | Step 6 commit with 9 failing tests | Process | The commit command didn't stop on a red suite | Fixed next commit |
| 4 | Details panel read global state | Code design | A pure UI module reached into dashboard state | Fixed |
| 5 | A default parameter hid a missing wire | Code design | `decide = () => new Map()` meant a forgotten argument fell back silently | Caught by reading, not by a test |
| 6 | 21 tests broke in step 5 | Tests | Test fixtures hand-build partial settings | Fixed fixture by fixture |
| 7 | Wrong guess about Strict | My assumption | Assumed Strict changes the tier; it changes which emails are held | Test rewritten |
| 8 | Filter queries over the length limit | Platform limit | One Gmail filter can't carry 59 domains plus the phrases | Worked around |
| 9 | Flaky suite | Tests | `vi.waitFor` default of 1 s too short on a loaded machine | Fixed, 10/10 green |
| 10 | B3 first attempt skipped people's mail | My bug | Reused `neverMove`, which protects people's mail, in a pass meant to fix it | Fixed before commit |

## 1. Step 7: the learning model

**What happened.** A Naive Bayes model over metadata, trained on what the rules labelled, applied only to mail headed for the Screener at 90% or more. It made every mailbox worse: 757 emails filed across the five mailboxes, 18 of them (2%) to an acceptable label, and 245 of them people's or scam mail.

**Why.** Four separate causes, each measured.

1. **There is almost nothing to learn.** Of 2,178 emails the rules sent to the Screener, 1,496 belong there, 495 are scams on the warning tier, 15 are people, and only 172 (8%) could take a label at all. The Screener is doing its job. A model can at best fix 8% of it and can harm the other 92%.

2. **The model isn't the problem; the data shift is.** On mail the rules did label, the same model at 90% is right 96% of the time (6,568 of 6,875). On Screener mail it's right 2% of the time. Screener mail is, by construction, mail no rule recognised, so it doesn't look like the training mail. This is covariate shift (Shimodaira, 2000): a model is only trustworthy on data like what it trained on.

3. **Naive Bayes is overconfident.** It treats every feature as independent, so a few matching words multiply into "99.9% sure". Raising the cut from 0.9 to 0.999 cut filings from 757 to 124 but still left 30 people or scams labelled. Niculescu-Mizil and Caruana (ICML 2005) show Naive Bayes pushes its probabilities toward 0 and 1; Zadrozny and Elkan (KDD 2002) show its raw scores need calibration before they can be read as chances. A "90%" from it is not 90%.

4. **Training on its own rules' labels teaches nothing new.** This is the confirmation bias of self-training (Arazo et al., IJCNN 2020): the model learns the rules' mistakes and repeats them with more confidence. "Fwd: photos from the trip" from a new friend went to Shopping because "photos" and "trip" appear in shop and travel mail.

**Would real corrections fix it?** Simulated by answering 30% of Screener senders with the right label, then predicting the other 70%:

| Variant | Filed | Acceptable | People or scams |
|---|---|---|---|
| Rules + corrections, 0.9 | 551 | 11% | 157 |
| Corrections only, 0.9 | 156 | 19% | 51 |
| Corrections only, 0.99 | 122 | 25% | 51 |
| Any variant with a "company, automated mail only" guard | 0 to 133 | 0% | 0 |

Corrections help (2% to 25%) but stay far from the 90% the design asks for. The guard that makes it safe also removes every email it could have fixed. Subject words alone at 0.999 were right 11 of 11 times, but 11 emails in 11,000 isn't worth a model.

**What this means for the plan.** The design put the model at precedence 6, between "the sender's usual label" and "first-time sender to the Screener". That slot is the wrong place: the mail there is mostly unknown companies and scams, which belong in the Screener. A per-user model is more likely to pay off where the user actually corrects Cluster, which is moves between labels on mail the rules already filed (the Tuned newsletters in Promotions, item 2). That's measurable only on real mailboxes, as corrections per 100 emails.

**A gap in the tests.** The test mailboxes count the Screener as an acceptable answer for unknown companies, so they can't show the cost of a full Screener (the user's time). If Screener size matters, the scorecard needs a second number: emails the user has to look at.

## 2. Filter error above the plan's 2%

The plan's step 1 exit asked for filter error under 2%. Held-out mailboxes are at 0.0%. Tuned is at 9.5% (130 of 1,369). 95 of those 130 are newsletters labelled Promotions:

- 49 media newsletters, 46 Substack and beehiiv newsletters.
- The client knows an email is a newsletter from its list header. A Gmail filter can't read that header.
- The fix would be to list the 59 newsletter domains in the Promotions filter as exceptions. That doesn't fit: the Promotions query plus those domains is about 2,180 characters, and the code caps a filter at 1,400 (`MAX_FILTER_QUERY`; Gmail refuses one much past 1,500, per the code comment, not re-checked against Google's docs).
- The daily relabel puts them right, so the user sees the wrong label for up to a day.

The other 35 are small groups: app codes taking the domain's label (14), Apple, Netflix and Spotify receipts as Shopping (7), sign-in alerts from social sites as Social (5), and bookings as Receipts (5). Each is a phrase or domain rule a filter applies without the client's ordering.

Options: split the exceptions across several Promotions filters (Gmail allows many filters, so this is length, not count); or accept the one-day lag and say so in the plan.

## 3. A commit landed with failing tests

Step 6's commit (`236da56`) ran `npm test` and then `git commit` in one command. The suite reported 9 failures, but the command didn't check the result, so the commit went in. Fixed in `3c4bfe5`, and later commits only ran after a green run (`if grep -q FAIL ...; then echo NOT COMMITTING`). A pre-commit hook that runs the suite would make this impossible rather than a habit.

## 4 and 5. The Details panel and its silent default

The first version of step 6 made `detailsPanel.ts` call `decisions()` from dashboard state. Its tests build the panel without dashboard settings, so 9 tests crashed. The fix passed `decide` in as a parameter, like the panel's other inputs.

That fix added a second risk. The parameter defaults to `() => new Map()` so tests stay short. When my edit to pass it from `dashboard.ts` didn't apply, everything still compiled and passed, and the real panel would quietly have used the old grouping. I caught it by reading the edit's output. No test covers "the dashboard passes the engine to the panel". A required parameter would have made the type checker catch it.

## 6. 21 tests broke when step 5 added inputs

Step 5 made the engine read `quarantineReview`, `securityRules.strict` and `sentCorrespondents` from settings. Five test files build settings by hand with only the fields they need, so each crashed on a missing field. The cause is that tests skip the real defaults. Building fixtures from `DEFAULT_SETTINGS` with overrides would make the next new setting free.

## 7. My assumption about Strict

I wrote the step 5 test expecting Strict to turn a "warn" verdict into "hold". It doesn't: the tier stays "warn", and Strict adds the warned emails to `heldMessageIds` (`verdict.ts`, line 207). The test now checks what matters: with Strict on those emails go to Spam, with it off they don't. Lesson: read the function before writing its test.

## 8. Filter length limit

Two filters hit the 1,400 limit during B2/B5. The jobs query reached 1,405 characters, so its phrases got a query of their own. The newsletter exceptions (item 2) didn't fit at all. Phrases that the client doesn't classify, like "unusual sign-in", were removed rather than let filters and client disagree.

## 9. Flaky tests

`vi.waitFor` defaults to 1 second. Under the full suite's load, DOM tests that wait for async renders sometimes ran past it. `src/test-setup.ts` now sets 5 seconds, and the one test that boots two dashboards has 30 seconds. 10 of 10 full runs were green after that.

## 10. B3's first attempt

The relabel was meant to take labels off people's mail. My first version filtered with `neverMove`, which protects people's mail from being moved, so it skipped exactly the mail it was meant to fix. Removed before commit. The two checks mean opposite things ("don't touch" against "this is a person"), which is the four-definitions problem the engine design set out to remove.

## What's still open

1. Step 7 needs real corrections, and probably a different slot (moves between labels, not the Screener). Needs the friends beta.
2. Newsletter filters in Promotions (item 2): split exceptions across filters, or accept the lag.
3. A pre-commit hook running the suite (item 3).
4. Settings fixtures built from the defaults (item 6).
5. A Screener-size number in the scorecard (item 1).
6. Nothing here was checked on a real Gmail mailbox.

## Sources

- H. Shimodaira, "Improving predictive inference under covariate shift by weighting the log-likelihood function", Journal of Statistical Planning and Inference, 2000.
- A. Niculescu-Mizil and R. Caruana, "Predicting good probabilities with supervised learning", ICML 2005.
- B. Zadrozny and C. Elkan, "Transforming classifier scores into accurate multiclass probability estimates", KDD 2002.
- E. Arazo et al., "Pseudo-labeling and confirmation bias in deep semi-supervised learning", IJCNN 2020.

Cited from knowledge, not re-fetched today. The measurements come from a throwaway test (deleted after the run); the method is described in item 1 so it can be rebuilt.
