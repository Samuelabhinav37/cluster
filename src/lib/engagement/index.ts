// Engagement model v1 — the learned global-prior + per-user-delta logistic
// scorer from research/2026-09-07-engagement-model-v1-design.md.
//
// STATUS: built, NOT wired in. `engagementModel.ts` still uses its hand-tuned
// linear scorer. Per the design doc this must not replace it until the
// live-test checklist passes and there is a beta cohort to say whether the
// ranking feels right. These modules exist so that when the gate opens the
// swap is a known quantity: extractFeatures -> scoreSenders -> topReasons for
// the "why", sgdStep on w_user per logged feedback.

export {
  extractFeatures,
  FEATURE_NAMES,
  FEATURE_COUNT,
  DOMAIN_CATEGORIES,
  MESSAGE_KINDS,
  type FeatureInput,
} from "./features";
export { GLOBAL_WEIGHTS, ENGAGEMENT_WEIGHTS_VERSION } from "./globalWeights";
export { sigmoid, dot, sgdStep, logLoss, DEFAULT_SGD, type SgdOptions } from "./logistic";
export {
  scoreSender,
  scoreSenders,
  topReasons,
  type SenderScore,
  type FeatureContribution,
} from "./score";
