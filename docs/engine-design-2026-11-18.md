# One decision per email: engine design (2026-11-18)

Status: approved 2026-11-18 with all three recommendations (compute on demand; let-in only skips the Screener; .edu person unless a role address). Implements "One engine under all six" in `docs/product-plan-2026-11-18.md`.

## Problem

Each screen answers "what is this email and what should happen to it" on its own. The survey found real disagreements, not just duplicated code:

| Question | Where it's answered today | Disagreement found |
|---|---|---|
| Which label? | `effectiveBucket` called directly by 5 places (`labelPage`, `today`, `screenerBacklog`, `timeLimitsTab`, `autoSort`); `senderBuckets` only in the labeller | The 5 screens skip the sender's-usual-label step the labeller uses, and two read the Promotions tab differently (`m.promotion` vs `m.promotion ?? m.tab === "promotions"`). A screen can count a label Gmail doesn't show |
| Is it a person? | `isPerson` (senderListView), `writtenByPerson` + the Personal rules (holdUnsortedInbox), `neverMove` (protectionPolicy), `peopleMailIds` (relabel), free-mail checks in 12 files | Four definitions. A school address is a person in the sender list but not in labelling |
| Do I know them? | `knownSenderSet` (wrote-to ∪ let-in) in 43 places; `wroteToSet` only in labelling (B4 fix) | Cleanup protection still treats a company let in from the Screener as "known correspondent" |
| Is it risky? | `senderVerdict`, 9 callers | One function, but each caller passes its own `knownCorrespondent` set |
| Must it be protected? | `protectionDecision`, 12 callers; `neverMove` separately | Two rules for "don't touch this" |
| Do they care? | `senderProfile` (openRate, tier), `suggestionModel`, `engagementModel` | Not used by labelling at all |

## Design

One pure module, `src/lib/mailEngine.ts`:

```ts
interface EmailDecision {
  kind: MessageKind;                 // messageKindOf: what it is
  label: SortBucket | "personal" | "screener" | null;  // where it goes
  labelWhy: "correction" | "rule" | "sender-usual" | "model" | "person" | "first-time" | "none";
  risk: VerdictTier;                 // hold | warn | none
  person: boolean;                   // one definition
  protected: ProtectionReason | null; // one "don't touch" answer
}

interface EngineContext {
  wrote: Set<string>;    // people you've written to
  letIn: Set<string>;    // let in from the Screener: not screened, still labelled
  overrides: Record<string, SortOverride>;
  moveVotes: MoveVotes;
  holdPeople: boolean;
  profiles?: Map<string, SenderProfile>; // care: open rate, tier
}

function decide(sender: SenderSummary, ctx: EngineContext): Map<string, EmailDecision>;
```

- **Pure and synchronous.** It takes the sender records every screen already builds and returns one decision per email. No storage, no Gmail calls. Measured cost of the parts today: about 120 ms per 20,000 emails.
- **Computed, not stored.** Every screen calls `decide` on the senders it already has. Storing decisions in the mail index would save little time and add a cache to keep in sync, and a correction would need to invalidate it. Revisit only if profiling shows `decide` in a hot path.
- **One order of precedence**, written once:
  1. Risk "hold" → scam hold (nothing else applies).
  2. The user's correction (kind-scoped first, then sender, then domain).
  3. Person → Personal (or the Screener for strangers on free mail, if "hold people" is on).
  4. Rules: kind, Gmail's tabs and categories, sender domain.
  5. The sender's usual label.
  6. Learning model (later, step 1 of the plan): only when 2–5 abstain, at 90% or more.
  7. First-time sender → the Screener. Otherwise no label.
- **"Care" stays a separate answer.** It feeds cleanup and suggestions, never the label. A label says what an email is, not whether you read it.
- **Gmail filters stay a compiled subset.** They can't run code, so `categoryQueries` stays. `filterVsClient.test.ts` keeps them honest against `decide` (0 people, 0 scams, floors).

## Migration, one step at a time

Each step ships alone with the full suite green and the five test mailboxes no worse.

| Step | Change | Proof |
|---|---|---|
| 0 | `mailEngine.ts` wraps today's functions unchanged. A characterization test records what `decide` says for every email in the five test mailboxes | Snapshot matches the current labeller exactly |
| 1 | One `person` definition; `isPerson`, `neverMove`, `writtenByPerson` and `peopleMailIds` call it | Diff each mailbox: only intended changes, each listed in the commit |
| 2 | The labeller, relabel and Personal/Screener pass read `decide` | Mailbox scores unchanged or better |
| 3 | The five screens read `decide`, so the label page, Today and Screener counts match Gmail | New test: for every email, every screen's label equals `decide`'s |
| 4 | Protection reads `decide`: `wrote` vs `letIn` split in cleanup too | Cleanup tests; nothing a person wrote becomes deletable |
| 5 | Risk callers pass the same context | Security tests |
| 6 | Cleanup cards and analytics count from `decide` | Overview, Cleanup and labels agree to the email |
| 7 | Learning model plugs in at precedence 6 | Corrections per 100 emails, on beta mailboxes |

Steps 0–3 are the core of plan step 1; 4–6 are plan steps 2–5 as they come.

## Decisions for review

1. **Compute on demand, don't store** (recommended above).
2. **Let-in companies in cleanup.** Today they're protected like people you write to. Proposal: let-in means "not screened" only. Their mail can be suggested for cleanup like any company's, but nothing moves without you confirming. Alternative: keep them protected.
3. **A school address (.edu) is a person** everywhere, as the sender list already says, unless it's a role address (advising@, registrar@). Labelling currently treats school mail as Education.

## Risks

- Step 1 changes who counts as a person, which moves mail between Personal, the Screener and labels. The characterization diff makes every move visible before it ships.
- Five screens change source in step 3; their DOM tests cover counts, not every label. The new "every screen agrees" test closes that.

## Progress

| Step | State | Commit |
|---|---|---|
| 0 | Done: `decide`/`decideAll` match today's passes on all 12,000 test emails; `inboxFates` lifted out of `holdUnsortedInbox` | 57e5f0e |
| 1 | Done: `isPersonalAccount` backs `neverMove`, `isPerson` and the relabel's people check; a professor goes to Personal, school role mailboxes stay Education. `writtenByPerson` stays the separate "reads like a person" check | 1402905 |
| 2 | Not needed as a separate change: the labeller, relabel and Personal/Screener pass already run the exact functions `decide` composes (`bucketsFor`, `inboxFates`), checked by the step 0 test | |
| 3 | Done: the label page, weekly counts, Today, the Screener release plan and Sort my inbox read the engine (18–30 of 2,000 emails used to differ on the label page) | a0146e8, 00b88a7 |
| 4 | Done: protection has two modes; standing rules keep let-in senders protected, cleanup you click through doesn't | 0dc9131 |
| 5 | Done: `riskOf` is the one verdict, with the user's "not a scam" answers and Strict in every caller (hold, Security, report, trend, scan, Today, inbox health, sidebar dot, labeller) | 177c648 |
| 6 | Done: Overview's four kinds, Details and the downloads count labelled mail under its label's kind. 285 of 1,619 labelled tuned emails used to sit in a different Overview group than their label | 236da56, 3c4bfe5 |
| 7 | Measured, not shipped. See below | |

## Step 7 result (2026-11-18)

Prototype: Naive Bayes over metadata (kind, tab, promotion, bulk, sending path, purchase, local-part class, subject words), trained on the mail the rules labelled in the same mailbox, applied only to mail headed for the Screener, at 90% or more, with at least 3 senders behind a label.

| Mailbox | Screener | Model filed | Better | Worse | People or scams moved |
|---|---|---|---|---|---|
| Tuned | 255 | 28 | 0 | 28 | 15 |
| Held-out A | 493 | 313 | 0 | 295 | 65 |
| Held-out B | 395 | 181 | 0 | 181 | 50 |
| Held-out C | 560 | 22 | 0 | 22 | 0 |
| Held-out D | 475 | 213 | 0 | 213 | 115 |

It breaks the guardrails (people's mail labelled), so it stays out. The Screener holds exactly the mail the rules can't place, and a model trained on the rules' own labels only repeats them with false confidence ("Fwd: photos from the trip" from a new friend → Shopping). The signal that can work is the user's own answers: Screener let-ins and label moves (`learnFromMoves`). Those exist only on real mailboxes, so step 7 waits for the friends beta, measured as corrections per 100 emails as planned. Before it ships it must move 0 people or scams on all five test mailboxes.
