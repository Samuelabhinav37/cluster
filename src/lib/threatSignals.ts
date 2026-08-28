// Deterministic, rule-based phishing-signal scoring -- the "Athena security
// connection" (athenaIntegration.ts) has been wired up since the last pass,
// but nothing has generated a real event yet: this is the first actual
// detection logic. Same constraint as messageKind.ts: only headers already
// fetched for the existing declutter feature (fromAddress, fromDisplayName,
// subject) -- never the message body, never a new OAuth scope, never a
// network call of its own.
//
// Deliberately narrow for this pass. Two real, well-established phishing
// heuristics that need zero external data and zero provider-layer changes:
// a sender's display name claiming to be a brand whose actual mail domain
// doesn't match, and a well-known brand name paired with a free-mail
// domain no real company sends from. What this does NOT do yet, and why:
//
// - SPF/DKIM/DMARC authentication-result checking -- real, high-value, but
//   needs the Authentication-Results header, which today's metadata fetch
//   (NormalizedMessageMetadata) doesn't request at all. A provider-layer
//   change (gmailProvider.ts + outlookProvider.ts), not a threatSignals.ts
//   one -- scoped out of this pass rather than guessed at.
// - Cross-referencing link domains against a real malicious/phishing
//   domain list (e.g. Moat's bundled AdGuard-sourced lists) -- the actual
//   plan for this, but it needs a real data-sourcing decision first: a
//   fetched-at-runtime list would contradict this project's own stated
//   "metadata-only, no server calls" stance (see domainCategories.ts's own
//   comment), so it has to be a build-time-vendored copy instead, which is
//   new tooling, not a threatSignals.ts change. Flagged, not guessed at.
import type { NormalizedMessageMetadata } from "./providers/emailProvider";

export type ThreatSignalKind = "brand-impersonation" | "freemail-brand-claim";

export interface ThreatSignal {
  kind: ThreatSignalKind;
  /** The brand name the sender's display name invoked. */
  brand: string;
  confidence: "high" | "medium";
}

// Deliberately small and hand-curated, same "no free/reliable API fits this
// project's privacy stance" reasoning as domainCategories.ts -- but a
// separate list from it on purpose: domainCategories.ts answers "which
// label does mail from this domain get filed under", a materially
// different question from "which domains is this brand actually allowed to
// send phishing-relevant mail from". Expand deliberately, one verified
// legitimate domain at a time, not by copying the shopping/finance/etc.
// category lists wholesale.
const BRAND_DOMAINS: Record<string, string[]> = {
  paypal: ["paypal.com"],
  amazon: ["amazon.com", "amazon.co.uk", "amazon.ca", "amazon.de"],
  "bank of america": ["bankofamerica.com"],
  chase: ["chase.com"],
  "wells fargo": ["wellsfargo.com"],
  microsoft: ["microsoft.com", "microsoftonline.com", "outlook.com"],
  apple: ["apple.com", "icloud.com"],
  netflix: ["netflix.com"],
  docusign: ["docusign.com", "docusign.net"],
  "irs": ["irs.gov"],
  ups: ["ups.com"],
  fedex: ["fedex.com"],
  usps: ["usps.com"],
  google: ["google.com", "gmail.com"],
};

// Real senders sometimes legitimately use these for bulk mail (e.g. a small
// business emailing from a Gmail account) -- flagging "freemail-brand-claim"
// only when the display name invokes a brand from BRAND_DOMAINS above keeps
// this from misfiring on every small business newsletter.
const FREEMAIL_DOMAINS = new Set(["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "aol.com", "icloud.com", "protonmail.com"]);

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).toLowerCase();
}

function matchedBrand(displayName: string): string | null {
  const lower = displayName.toLowerCase();
  for (const brand of Object.keys(BRAND_DOMAINS)) {
    // Word-boundary match, not substring -- "irs" shouldn't match "shirsley@example.com"-
    // shaped display names, and this only ever looks at the display name anyway (a
    // short, human-authored field), not free text.
    if (new RegExp(`\\b${brand}\\b`, "i").test(lower)) return brand;
  }
  return null;
}

/** Pure, synchronous, and already-fetched-data-only -- same shape as
 * classifyMessageKind. Returns every signal that fired, not just the first
 * one; callers decide what to do with an empty array (nothing suspicious
 * found) versus one or more signals. */
export function scoreMessageForThreats(message: NormalizedMessageMetadata): ThreatSignal[] {
  const brand = matchedBrand(message.fromDisplayName);
  if (!brand) return [];

  const senderDomain = domainOf(message.fromAddress);
  const legitimateDomains = BRAND_DOMAINS[brand];
  if (legitimateDomains.includes(senderDomain)) return [];

  const signals: ThreatSignal[] = [];
  if (FREEMAIL_DOMAINS.has(senderDomain)) {
    // Highest-confidence case: a real bank/brand never sends from a
    // consumer free-mail domain.
    signals.push({ kind: "freemail-brand-claim", brand, confidence: "high" });
  } else {
    signals.push({ kind: "brand-impersonation", brand, confidence: "medium" });
  }
  return signals;
}
