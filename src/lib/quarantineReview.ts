// Auto-quarantine (background.ts's runQuarantine, opt-in) used to be
// file-and-forget: a HIGH-tier sender got labeled "Possible Phishing" and
// nothing tracked whether that call was right. This module is the review
// loop on top of it -- a durable per-sender verdict ledger (same shape as
// engagementModel.ts's SenderEngagementMap, but deliberately a separate
// structure: conflating "did the user like this unsubscribe suggestion" with
// "was this quarantine call correct" would pollute both signals) plus a
// deterministic score adjustment so a released (false-positive) sender isn't
// immediately re-quarantined next alarm cycle, and a confirmed sender stays
// visibly flagged.

export type QuarantineVerdict = "confirmed" | "released";

export interface QuarantineRecord {
  verdict: QuarantineVerdict;
  at: number;
}

export type QuarantineReviewMap = Record<string, QuarantineRecord>;

/** A released sender's risk score is nudged down just enough to drop a
 * borderline "high" combination (e.g. two medium signals summing to exactly
 * 6) back to "elevated" -- but deliberately NOT enough to move
 * blocklisted-domain alone (weight 6 + 1 high-confidence = 7, a confirmed
 * fact from the vendored blocklist, not a heuristic) out of "high": a
 * release verdict says "this specific call was wrong", not "this domain is
 * no longer on a known-malware list". A confirmed sender gets a matching
 * small reinforcing bump so it keeps sorting above an unreviewed sender with
 * the same raw score. */
const RELEASED_ADJUSTMENT = -1;
const CONFIRMED_ADJUSTMENT = 1;

export function quarantineScoreAdjustment(record: QuarantineRecord | undefined): number {
  if (!record) return 0;
  return record.verdict === "released" ? RELEASED_ADJUSTMENT : CONFIRMED_ADJUSTMENT;
}

export function recordQuarantineVerdict(
  existing: QuarantineReviewMap,
  senderKey: string,
  verdict: QuarantineVerdict,
  now = Date.now(),
): QuarantineReviewMap {
  return { ...existing, [senderKey]: { verdict, at: now } };
}
