// One place that turns a sender's threat signals into a decision and plain
// reasons a person can read. Before this, the rules were spread out: the
// score in threatSignals.ts, "don't hold people you write to" inside
// background.ts's runQuarantine, and technical wording in securityTab.ts.
//
// The rules, in order:
//
// 1. People you write to: a display name or address that merely resembles a
//    brand is dropped (a friend named "Chase" on gmail.com isn't a bank
//    scam), unless their mail failed authentication. Failed authentication,
//    list hits, identity changes and the rest still count. This follows
//    Microsoft's mailbox intelligence, which skips impersonation checks for
//    people you've corresponded with.
// 2. Score: the signal weights from threatSignals.ts plus one point for each
//    high-confidence signal, plus the review adjustment (released -1,
//    confirmed +1). Weights stay hand-set until there's a public evaluation
//    set to fit them on.
// 3. Hold needs the hold score AND either two different kinds of signal or
//    one "floor" signal that is decisive alone: a domain on a known-bad list,
//    or a brand claim sent from a free email account.
// 4. Warn at the warn score. Below that, nothing.
//
// Reasons are fixed, plain sentences, strongest first. Callers show the top
// three (MAX_REASONS).
import type { QuarantineRecord } from "./quarantineReview";
import { quarantineScoreAdjustment } from "./quarantineReview";
import type { SenderSummary } from "./senderModel";
import { senderRiskScore, type ThreatSignal, type ThreatSignalKind } from "./threatSignals";

export type VerdictTier = "hold" | "warn" | "none";

export interface Reason {
  kind: ThreatSignalKind | "known-correspondent" | "released-before";
  text: string;
  /** Positive: evidence of a scam. Negative or zero: evidence of trust. */
  points: number;
}

export interface Verdict {
  tier: VerdictTier;
  score: number;
  /** Evidence of a scam, strongest first. */
  reasons: Reason[];
  /** Why some evidence was set aside or weighed down. */
  trustReasons: Reason[];
  /** The signals that counted, after rule 1. */
  signals: ThreatSignal[];
}

export interface VerdictContext {
  /** The user has written to this address (screener.ts knownSenderSet). */
  knownCorrespondent: boolean;
  review?: QuarantineRecord;
}

export const HOLD_SCORE = 6;
export const WARN_SCORE = 3;
export const MAX_REASONS = 3;

const FLOOR_KINDS = new Set<ThreatSignalKind>(["blocklisted-domain", "freemail-brand-claim"]);
const LOOKS_LIKE_A_BRAND = new Set<ThreatSignalKind>([
  "brand-impersonation",
  "freemail-brand-claim",
  "lookalike-domain",
  "punycode-domain",
]);

const SMALL_WORDS = new Set(["of", "and", "the"]);
const BRAND_SPELLING: Record<string, string> = {
  paypal: "PayPal",
  fedex: "FedEx",
  usps: "USPS",
  ups: "UPS",
  dhl: "DHL",
  irs: "IRS",
  hmrc: "HMRC",
  linkedin: "LinkedIn",
  doordash: "DoorDash",
  icloud: "iCloud",
};
/** "bank of america" -> "Bank of America". Brand keys are lowercase. */
export function brandName(key: string): string {
  if (BRAND_SPELLING[key]) return BRAND_SPELLING[key];
  return key
    .split(" ")
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** The plain sentence for one signal. Exhaustive over ThreatSignalKind. */
export function reasonText(signal: ThreatSignal): string {
  const brand = brandName(signal.brand);
  switch (signal.kind) {
    case "blocklisted-domain":
      return `The sending address (${signal.brand}) is on a public list of scam and malware sites.`;
    case "freemail-brand-claim":
      return `It says it's from ${brand}, but it was sent from a free email account.`;
    case "brand-impersonation":
      return `It says it's from ${brand}, but the address isn't one ${brand} uses.`;
    case "lookalike-domain":
      return `The address looks like ${brand}'s, but it isn't the same.`;
    case "failed-authentication":
      return `It failed the check that proves it really came from ${signal.brand}.`;
    case "reply-to-mismatch":
      return `If you press Reply, your answer goes to a different address (${signal.brand}).`;
    case "punycode-domain":
      return `The address (${signal.brand}) uses special characters that can make it look like another site.`;
    case "lure-language":
      return "The subject pushes you to act fast or to sign in.";
    case "link-mismatch":
      return "A link says it goes to one website but really goes to another.";
    case "risky-attachment":
      return "It has an attachment of a type often used to spread malware.";
    case "identity-change":
      return `This sender's mail usually comes from the same place. This one is signed by, or asks for replies at, ${signal.brand}.`;
    default: {
      const unreachable: never = signal.kind;
      return unreachable;
    }
  }
}

function signalPoints(signal: ThreatSignal): number {
  return senderRiskScore([signal]);
}

/** The mail isn't provably from the address it shows: a failed-authentication
 * signal, DMARC failing, or SPF and DKIM both failing. */
export function senderFailedAuthentication(sender: SenderSummary): boolean {
  const v = sender.authVerdicts;
  return (
    sender.threatSignals.some((s) => s.kind === "failed-authentication") ||
    v.dmarc === "fail" ||
    (v.spf === "fail" && v.dkim === "fail")
  );
}

export function senderVerdict(sender: SenderSummary, context: VerdictContext): Verdict {
  const authFailed = senderFailedAuthentication(sender);
  const trustReasons: Reason[] = [];

  let signals = sender.threatSignals;
  if (context.knownCorrespondent && !authFailed) {
    const kept = signals.filter((s) => !LOOKS_LIKE_A_BRAND.has(s.kind));
    if (kept.length !== signals.length || signals.length === 0) {
      trustReasons.push({
        kind: "known-correspondent",
        text: "You've written to this address before, so a name that looks like a brand isn't counted.",
        points: 0,
      });
    }
    signals = kept;
  }

  const adjustment = quarantineScoreAdjustment(context.review);
  if (context.review?.verdict === "released") {
    trustReasons.push({
      kind: "released-before",
      text: "You marked mail from this sender as safe before.",
      points: adjustment,
    });
  }

  const score = signals.length > 0 ? senderRiskScore(signals) + adjustment : 0;
  const kinds = new Set(signals.map((s) => s.kind));
  const decisive = signals.some((s) => FLOOR_KINDS.has(s.kind)) || kinds.size >= 2;
  const tier: VerdictTier = score >= HOLD_SCORE && decisive ? "hold" : score >= WARN_SCORE ? "warn" : "none";

  const reasons = signals
    .map((signal) => ({ kind: signal.kind, text: reasonText(signal), points: signalPoints(signal) }))
    .sort((a, b) => b.points - a.points);

  return { tier, score, reasons, trustReasons, signals };
}
