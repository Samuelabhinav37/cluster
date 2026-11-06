// Security's "Scan now": the checks it walks, in order, and how many senders
// each one caught. A sender counts only when its verdict warns or holds, so
// the numbers match what Suspicious lists; people you write to are judged
// the way the hold judges them (verdict.ts drops brand lookalikes for them).
import type { SenderSummary } from "./senderModel";
import type { ThreatSignalKind } from "./threatSignals";
import { senderVerdict } from "./verdict";

export const SCAN_CHECKS: readonly { label: string; kinds: readonly ThreatSignalKind[] }[] = [
  { label: "Sender authentication", kinds: ["failed-authentication"] },
  { label: "Lookalike addresses", kinds: ["lookalike-domain", "punycode-domain"] },
  { label: "Pretending to be a company", kinds: ["brand-impersonation", "freemail-brand-claim"] },
  {
    label: "Pretending to be someone you know",
    kinds: ["name-match", "identity-change", "reply-to-mismatch"],
  },
  { label: "Links", kinds: ["link-mismatch", "blocklisted-link", "blocklisted-domain"] },
  { label: "Attachments", kinds: ["risky-attachment"] },
  { label: "Other warning signs", kinds: ["lure-language", "provider-flagged"] },
];

/** Senders each check caught, in SCAN_CHECKS order. */
export function scanCheckCounts(senders: readonly SenderSummary[], known: ReadonlySet<string>): number[] {
  const flagged = senders
    .map((s) => senderVerdict(s, { knownCorrespondent: known.has(s.address.toLowerCase()) }))
    .filter((v) => v.tier !== "none")
    .map((v) => new Set(v.signals.map((s) => s.kind)));
  return SCAN_CHECKS.map(({ kinds }) => flagged.filter((set) => kinds.some((k) => set.has(k))).length);
}

/** Senders any check caught. */
export function scanFound(senders: readonly SenderSummary[], known: ReadonlySet<string>): number {
  return senders.filter(
    (s) => senderVerdict(s, { knownCorrespondent: known.has(s.address.toLowerCase()) }).tier !== "none",
  ).length;
}
