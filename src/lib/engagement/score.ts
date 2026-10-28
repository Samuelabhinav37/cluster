import { extractFeatures, FEATURE_COUNT, FEATURE_NAMES, type FeatureInput } from "./features";
import { GLOBAL_WEIGHTS } from "./globalWeights";
import { dot, sigmoid } from "./logistic";

export interface FeatureContribution {
  feature: string;
  /** Signed (w_global + w_user) · x for this feature. */
  value: number;
}

export interface SenderScore {
  /** p(won't-miss) in (0, 1). */
  p: number;
  /** Per-feature signed contributions, `bias` excluded, largest |value| first —
   * the raw material for an explainable "why". */
  contributions: FeatureContribution[];
}

function zeros(): number[] {
  return new Array(FEATURE_COUNT).fill(0);
}

/** Score one sender. `userWeights` defaults to all-zeros (global prior only);
 * a vector of the wrong length is ignored rather than misaligned. */
export function scoreSender(
  input: FeatureInput,
  userWeights: readonly number[] = [],
): SenderScore {
  const x = extractFeatures(input);
  const uw = userWeights.length === FEATURE_COUNT ? userWeights : zeros();
  const z = dot(GLOBAL_WEIGHTS, x) + dot(uw, x);

  const contributions = FEATURE_NAMES.map((feature, i) => ({
    feature,
    value: (GLOBAL_WEIGHTS[i] + (uw[i] ?? 0)) * (x[i] ?? 0),
  }))
    .filter((c) => c.feature !== "bias" && c.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  return { p: sigmoid(z), contributions };
}

/** Score many senders, keyed by `sender.key`. */
export function scoreSenders(
  inputs: FeatureInput[],
  userWeights?: readonly number[],
): Map<string, SenderScore> {
  const out = new Map<string, SenderScore>();
  for (const input of inputs) out.set(input.sender.key, scoreSender(input, userWeights));
  return out;
}

const REASON_PHRASES: Record<string, string> = {
  unreadRatioEma: "you rarely open mail from this sender",
  currentUnreadRatio: "most of their recent mail is unread",
  daysSinceLatest: "it has been a while since their last message",
  logMessageCount: "they send a lot",
  hasWorkingUnsubscribe: "they support one-click unsubscribe",
  "domain:newsletter": "it's a newsletter / media sender",
  "domain:social": "it's social-network mail",
  "kind:newsletter": "these read as newsletters",
  "kind:social": "these read as social notifications",
  priorAccepted: "you have acted on similar suggestions before",
};

/**
 * The plain-language "why" for a suggestion: the top positive contributions,
 * mapped to phrases. Every returned reason corresponds to a real
 * positive-weighted feature that fired for this sender.
 */
export function topReasons(score: SenderScore, limit = 3): string[] {
  return score.contributions
    .filter((c) => c.value > 0)
    .slice(0, limit)
    .map((c) => REASON_PHRASES[c.feature] ?? c.feature);
}
