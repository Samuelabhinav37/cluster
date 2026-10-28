import type { SenderSummary } from "../senderModel";
import type { SenderEngagementRecord } from "../engagementModel";
import { categorizeDomain, type DomainCategory } from "../domainCategories";
import type { MessageKind } from "../messageKind";

// The engagement model v1 feature vector.
//
// Everything here is aggregate and content-free: counts, ratios, timestamps,
// size estimates, the sender's domain, and message-kind *labels* the scan
// already produced. No subjects, no bodies, no ids. This is the same privacy
// stance `engagementModel.ts` already holds — the learned model does not relax
// it.
//
// FEATURE_NAMES is the contract between this extractor and the weight vectors
// (globalWeights.ts + the per-user delta in storage). It is APPEND-ONLY: never
// reorder or delete an entry without regenerating the global weights and
// bumping the weights schema version, or a stored per-user vector silently
// realigns to the wrong features.

export const DOMAIN_CATEGORIES: readonly DomainCategory[] = [
  "shopping",
  "travel",
  "finance",
  "social",
  "productivity",
  "newsletter",
  "education",
  "other",
];

export const MESSAGE_KINDS: readonly MessageKind[] = [
  "otp",
  "receipt",
  "shipping",
  "newsletter",
  "social",
  "other",
];

export const FEATURE_NAMES: readonly string[] = [
  "bias",
  "unreadRatioEma",
  "currentUnreadRatio",
  "logMessageCount",
  "daysSinceLatest",
  "logMedianSizeKb",
  "hasWorkingUnsubscribe",
  "isFirstContact",
  ...DOMAIN_CATEGORIES.map((c) => `domain:${c}`),
  ...MESSAGE_KINDS.map((k) => `kind:${k}`),
  "priorAccepted",
  "priorDismissed",
  "priorUndone",
];

export const FEATURE_COUNT = FEATURE_NAMES.length;

export interface FeatureInput {
  sender: SenderSummary;
  /** The aggregate behavioural record for this sender, if one exists yet. */
  record?: SenderEngagementRecord;
  now?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// daysSinceLatest is normalised against this horizon and clipped to [0, 1], so
// "months since last contact" saturates rather than dominating the vector.
const RECENCY_HORIZON_DAYS = 90;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at >= 0 ? address.slice(at + 1) : address;
}

function dominantKind(kinds: MessageKind[]): MessageKind {
  const counts = new Map<MessageKind, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  let best: MessageKind = "other";
  let bestCount = -1;
  for (const [kind, count] of counts) {
    if (count > bestCount) {
      best = kind;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Fixed-length feature vector for one sender, in {@link FEATURE_NAMES} order.
 * Pure. Starred / flagged messages are excluded (same "safe messages" rule the
 * rest of the engagement code uses), so the vector never reflects mail the
 * user has explicitly protected.
 */
export function extractFeatures({ sender, record, now = Date.now() }: FeatureInput): number[] {
  const safe = sender.messages.filter((m) => !m.isProtected);
  const total = safe.length;
  const unread = safe.filter((m) => m.unread).length;

  const currentUnreadRatio = total > 0 ? unread / total : 0;
  const latestAt = total > 0 ? Math.max(...safe.map((m) => m.receivedAt)) : now;
  const daysSinceLatest = Math.min(
    1,
    Math.max(0, (now - latestAt) / DAY_MS / RECENCY_HORIZON_DAYS),
  );
  const medianSizeKb = median(safe.map((m) => m.sizeBytes)) / 1024;

  const category = categorizeDomain(domainOf(sender.address));
  const kind = dominantKind(safe.map((m) => m.kind));

  const hasUnsub = Boolean(
    sender.unsubscribe.postUrl || sender.unsubscribe.httpUrl || sender.unsubscribe.mailto,
  );
  // Clip prior-action counts to [0, 3] and scale to [0, 1] — a sender the user
  // has undone on 12 times should not swamp the vector.
  const clip3 = (n: number) => Math.min(3, Math.max(0, n)) / 3;

  const values: Record<string, number> = {
    bias: 1,
    unreadRatioEma: record?.unreadRatioEma ?? 0,
    currentUnreadRatio,
    logMessageCount: Math.log1p(total),
    daysSinceLatest,
    logMedianSizeKb: Math.log1p(Math.max(0, medianSizeKb)),
    hasWorkingUnsubscribe: hasUnsub ? 1 : 0,
    isFirstContact: sender.firstContact ? 1 : 0,
    priorAccepted: clip3(record?.acceptedActions ?? 0),
    priorDismissed: clip3(record?.dismissedSuggestions ?? 0),
    priorUndone: clip3(record?.undoneActions ?? 0),
  };
  for (const c of DOMAIN_CATEGORIES) values[`domain:${c}`] = c === category ? 1 : 0;
  for (const k of MESSAGE_KINDS) values[`kind:${k}`] = k === kind ? 1 : 0;

  return FEATURE_NAMES.map((name) => values[name] ?? 0);
}
