# Engagement model v1 — design (global prior + per-user delta)

**Date:** 2026-09-07
**Status:** the pure core is **built but NOT wired in** — `src/lib/engagement/`
(`features.ts`, `logistic.ts`, `globalWeights.ts`, `score.ts`, + tests),
branch `feature/engagement-model-v1` / draft PR. `engagementModel.ts` and the
dashboard are untouched, so nothing ships or regresses. **Do not wire it in
ahead of live signal** — the research-lead memo
(`2026-09-06-research-lead-read-and-direction.md`) sequences the swap as step 3,
*after* the live-test checklist passes and a 15–25 person beta cohort exists to
say whether the ranking feels right. Building it blind, with zero users and no
verification, is the first item on that memo's "Traps" list. The modules exist
so that when the gate opens the swap is a known quantity.

### What is built vs. still to do at wire-in time

- **Built:** `extractFeatures` (content-free vector, FEATURE_NAMES contract),
  `sigmoid` / `dot` / `sgdStep` (L2) / `logLoss`, `GLOBAL_WEIGHTS` (hand-seeded
  prior, `ENGAGEMENT_WEIGHTS_VERSION`), `scoreSender` / `scoreSenders` /
  `topReasons`. 22 tests: feature-shape + privacy, sigmoid bounds, SGD
  convergence + L2, golden scores + contribution ordering + explainability.
- **Still to do (the wire-in commit):** refit `GLOBAL_WEIGHTS` on a real
  labelled holdout; `settingsStore` schema bump for `senderEngagementWeights` +
  `engagementTrainingBuffer` (+ migration seeding zeros / empty); append a
  training example and one `sgdStep` on each `recordEngagementFeedback`;
  `buildEngagementSuggestions` consumes `p` behind a threshold, keeping the
  "3+ messages, not snoozed, no starred" guards; order the "never open" /
  "ready to clean up" lists by `p`.

---

## What's there today

`src/lib/engagementModel.ts` is **not** a stub — it's a hand-tuned deterministic
linear scorer (`buildEngagementSuggestions`). It already:

- keeps an aggregate-only per-sender record (`SenderEngagementRecord`): sample
  count, `unreadRatioEma`, last-observed counts, accepted/dismissed/undone
  action tallies, a dismiss snooze;
- only counts a snapshot when the aggregate changed, so reopening the dashboard
  can't inflate confidence;
- gates hard (`samples >= 2` or 5+ all-unread, `currentRatio >= 2/3`,
  `unreadRatioEma >= 0.7`, `score >= 70`) and emits explainable reasons.

Its weights (`currentRatio*50 + ema*25 + …`) are guesses. v1 replaces the fixed
weights with a learned logistic model while keeping the record shape, the
aggregate-only guarantee, and the explainability.

## The model

Per Gmail's Priority Inbox paper: the personal model is mostly *how you differ
from a global prior*, and it can be tiny.

```
p(won't-miss | sender) = sigmoid( w_global · x  +  w_user · x )
```

- **`x`** — a small feature vector, all derivable from existing aggregate state,
  no message content:

  | feature | source |
  |---|---|
  | `unreadRatioEma` | `SenderEngagementRecord` |
  | `currentUnreadRatio` | current scan |
  | `log1p(messageCount)` | current scan |
  | `daysSinceLatest / 90` (clipped) | current scan |
  | `log1p(medianSizeKB)` | current scan metadata |
  | `hasWorkingUnsubscribe` | `sender.unsubscribe` |
  | `isFirstContact` | `knownSenders` ledger |
  | `domainCategoryOneHot` (Shopping/Newsletters/Finance/…) | sortTaxonomy |
  | `messageKindOneHot` (promo/receipt/otp/shipping/personal) | classifier |
  | `priorAcceptedActions`, `priorDismissed`, `priorUndone` (clipped) | record |

- **`w_global`** — shipped constant, hand-fit once on the author's own labelled
  history + a few synthetic cases. Checked into the repo as JSON. This alone
  should beat the current fixed scorer.

- **`w_user`** — a per-user delta vector in `chrome.storage`, initialised to
  zero, updated by **online logistic SGD** (one gradient step per label) with L2
  regularisation pulling it back toward zero. Small learning rate; the global
  prior dominates until the user has given real signal.

## Labels (the learning loop)

A `(sender, label)` example is written whenever the user acts, from data already
logged:

| user action | label |
|---|---|
| accepted a mute/unsubscribe/trash suggestion, not undone within 7 days | `1` (won't miss) |
| dismissed a suggestion ("Not useful") | `0` |
| undid an accepted action | `0`, higher weight |
| starred / replied to mail from a sender we'd scored high | `0`, higher weight |
| manually muted/unsubscribed a sender we hadn't suggested | `1` |

Store only `{featureVectorHash?, x, y, weight, ts}` — **no sender id needed for
training**; keep the last ~500, FIFO. (Keeping the id would be fine privacy-wise
since it never leaves the machine, but it isn't needed and omitting it is a
cleaner story.)

## Wiring

- `updateEngagementObservations` unchanged.
- New `scoreSenders(senders, records, weights): Map<key, {p, contributions[]}>`
  — pure, unit-testable, returns per-feature contributions for the "why".
- `buildEngagementSuggestions` consumes `p` instead of the hand-weighted score;
  keep a `p >= threshold` gate and the "3+ messages, not snoozed, no starred"
  guards. Threshold tuned against the author's holdout, exposed as a constant.
- On each accepted/dismissed/undone feedback (`recordEngagementFeedback`), also
  append a training example and run one SGD step on `w_user`.
- **First use of the ranking:** order the "senders you never open" and "ready to
  clean up" lists by `p`, not by volume. That's the visible payoff.

## Persistence / size

- `w_global`: repo JSON, ~40 floats.
- `w_user`: `chrome.storage.local`, ~40 floats + a version tag.
- training buffer: ≤500 × ~40 floats ≈ 80 KB. Fine under `unlimitedStorage`.
- Schema bump for `senderEngagementWeights` + `engagementTrainingBuffer`;
  migration seeds zeros / empty.

## Testing

- `scoreSenders` golden tests: fixed weights + fixed feature vectors → expected
  `p` and contribution ordering.
- SGD convergence test: feed 200 synthetic examples from a known separable
  weight vector, assert `w_user` moves toward it and loss drops.
- Guard test: reopening an unchanged scan writes no new training examples and
  doesn't move `w_user`.
- Explainability test: every emitted suggestion's `reasons` map to its top
  positive contributions.
- Regression: the existing `engagementModel` gate tests keep passing with the
  global prior standing in for the old weights.

## Non-goals for v1

- No cross-device sync of `w_user` (would need a server or user-held export).
- No content features, no embeddings. The on-device `LanguageModel` semantic
  pass is a *later*, hardware-gated accuracy upgrade for the classifier's `null`
  cases — not part of this model.
- No auto-actions from `p`. It ranks and suggests; the user still confirms.

## Kill criteria (from the research memo)

- Beta users return but ignore the learned ranking → the moat here is "no server
  + verifiable unsubscribe", not intelligence; shelve `w_user`, keep `w_global`
  as a static better-than-volume sort.
- They lean on the ranking → close the SaneBox gap: more features, faster
  feedback incorporation, per-bucket models.
