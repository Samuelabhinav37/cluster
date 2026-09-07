import { FEATURE_NAMES } from "./features";

// w_global — the shipped prior. Hand-fit once; meant to already beat the
// previous fixed linear scorer in `engagementModel.buildEngagementSuggestions`
// before any per-user learning happens. Keyed by feature name (not a bare
// array) so it stays aligned with FEATURE_NAMES if that list grows.
//
// Sign intuition (positive => more likely "won't miss it if this sender's mail
// is muted / unsubscribed / trashed"):
//   - high rolling + current unread ratio: strong positive
//   - long time since last contact: mild positive
//   - working one-click unsubscribe: mild positive (it's a real subscription)
//   - newsletter / social domain or kind: positive
//   - finance domain, OTP / receipt / shipping kind, first contact: negative
//     (transactional or unestablished — don't suggest bulk action)
//   - prior accepted: positive; prior dismissed / undone: strong negative
//
// Regenerate against a labelled holdout before this ships; until then it is a
// documented starting point, not a fitted result.
const WEIGHTS_BY_NAME: Record<string, number> = {
  bias: -2.6,
  unreadRatioEma: 2.4,
  currentUnreadRatio: 1.6,
  logMessageCount: 0.35,
  daysSinceLatest: 0.8,
  logMedianSizeKb: 0.15,
  hasWorkingUnsubscribe: 0.9,
  isFirstContact: -0.6,
  "domain:shopping": 0.1,
  "domain:travel": -0.2,
  "domain:finance": -1.2,
  "domain:social": 0.5,
  "domain:productivity": -0.5,
  "domain:newsletter": 0.8,
  "domain:education": 0.0,
  "domain:other": 0.0,
  "kind:otp": -1.6,
  "kind:receipt": -1.0,
  "kind:shipping": -0.8,
  "kind:newsletter": 0.7,
  "kind:social": 0.4,
  "kind:other": 0.0,
  priorAccepted: 1.2,
  priorDismissed: -1.6,
  priorUndone: -2.6,
};

export const GLOBAL_WEIGHTS: readonly number[] = FEATURE_NAMES.map(
  (name) => WEIGHTS_BY_NAME[name] ?? 0,
);

// Bump when FEATURE_NAMES changes or these values are refit — a stored per-user
// vector tagged with an older version must be discarded, not reused.
export const ENGAGEMENT_WEIGHTS_VERSION = 1;
