// Deterministic, rule-based phishing-signal scoring -- the "Athena security
// connection" (athenaIntegration.ts) has been wired up since the last pass,
// but nothing generated a real event until this module existed. Same
// constraint as messageKind.ts: only headers already fetched for the
// existing declutter feature (fromAddress, fromDisplayName, subject,
// authenticationResults) -- never the message body, never a new OAuth
// scope, never a network call of its own.
//
// Four signal kinds, in order of how much they need to already know about
// a brand:
// - "failed-authentication": DMARC fail on the header the provider already
//   fetched (see emailAuth.ts) -- fires for ANY sender, not just the
//   BRAND_DOMAINS list below, since a forged sender doesn't have to
//   impersonate a name on this list to be a forged sender.
// - "brand-impersonation" / "freemail-brand-claim": a display name invokes
//   a known brand whose real domain doesn't match -- exact-or-subdomain
//   match against BRAND_DOMAINS, freemail-claim distinguished as the
//   highest-confidence case.
// - "lookalike-domain": the sender domain is a small edit distance from a
//   brand's real domain (paypa1.com, arnazon.com) without being an exact or
//   subdomain match -- classic typosquatting, independent of whether the
//   display name mentions the brand by name at all.
//
// What this still does NOT do, and why: cross-referencing link domains
// against a real malicious/phishing domain list needs a real
// data-sourcing decision first -- a live fetch would contradict this
// project's own metadata-only, no-server-calls stance (see
// domainCategories.ts's own comment), so it would have to be a
// build-time-vendored copy instead, new tooling, not a threatSignals.ts
// change. Flagged, not guessed at.
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import { parseAuthenticationResults } from "./emailAuth";

export type ThreatSignalKind = "brand-impersonation" | "freemail-brand-claim" | "lookalike-domain" | "failed-authentication";

export interface ThreatSignal {
  kind: ThreatSignalKind;
  /** The brand name involved -- for "failed-authentication" with no brand
   * match, this is the sender's own domain instead, since there's no brand
   * to name. */
  brand: string;
  confidence: "high" | "medium";
}

// Deliberately hand-curated, same "no free/reliable API fits this project's
// privacy stance" reasoning as domainCategories.ts -- but a separate list
// from it on purpose: domainCategories.ts answers "which label does mail
// from this domain get filed under," a materially different question from
// "which domains is this brand actually allowed to send phishing-relevant
// mail from." Grouped by category so it's obvious what's covered and what
// isn't -- expand deliberately, one verified legitimate domain at a time.
const BRAND_DOMAINS: Record<string, string[]> = {
  // Payments / finance
  paypal: ["paypal.com"],
  venmo: ["venmo.com"],
  "cash app": ["cash.app", "square.com"],
  zelle: ["zellepay.com"],
  "bank of america": ["bankofamerica.com"],
  chase: ["chase.com"],
  "wells fargo": ["wellsfargo.com"],
  citibank: ["citi.com", "citibank.com"],
  "capital one": ["capitalone.com"],
  "american express": ["americanexpress.com", "aexp.com"],
  amex: ["americanexpress.com", "aexp.com"],
  coinbase: ["coinbase.com"],
  robinhood: ["robinhood.com"],
  fidelity: ["fidelity.com"],
  discover: ["discover.com"],
  usbank: ["usbank.com"],
  // Shipping / delivery
  ups: ["ups.com"],
  fedex: ["fedex.com"],
  usps: ["usps.com"],
  dhl: ["dhl.com"],
  amazon: ["amazon.com", "amazon.co.uk", "amazon.ca", "amazon.de"],
  // Tech / cloud
  microsoft: ["microsoft.com", "microsoftonline.com", "outlook.com", "office.com", "office365.com"],
  apple: ["apple.com", "icloud.com"],
  google: ["google.com", "gmail.com"],
  adobe: ["adobe.com"],
  dropbox: ["dropbox.com"],
  docusign: ["docusign.com", "docusign.net"],
  zoom: ["zoom.us"],
  linkedin: ["linkedin.com"],
  facebook: ["facebook.com", "fb.com", "meta.com"],
  netflix: ["netflix.com"],
  // Telecom
  verizon: ["verizon.com"],
  "at&t": ["att.com"],
  "t-mobile": ["t-mobile.com"],
  // Government
  irs: ["irs.gov"],
  "social security": ["ssa.gov"],
  uscis: ["uscis.gov"],
};

// Real senders sometimes legitimately use these for bulk mail (e.g. a small
// business emailing from a Gmail account) -- flagging "freemail-brand-claim"
// only when the display name invokes a brand from BRAND_DOMAINS above keeps
// this from misfiring on every small business newsletter.
const FREEMAIL_DOMAINS = new Set(["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "aol.com", "icloud.com", "protonmail.com"]);

// A lookalike this far off in edit distance from a brand's real domain is
// close enough to be deliberate confusion, not coincidence -- 2 covers a
// single character substitution/insertion/deletion plus a little slack
// (paypa1.com is distance 1 from paypal.com; arnazon.com is distance 2 from
// amazon.com), without also matching domains that just happen to share a
// short common substring with an unrelated brand name.
const LOOKALIKE_MAX_DISTANCE = 2;
// Below this length, small edit distances stop being meaningful signal --
// short domains are close to lots of unrelated short domains by chance.
const LOOKALIKE_MIN_DOMAIN_LENGTH = 6;

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).toLowerCase();
}

function isSameOrSubdomain(domain: string, legitimateDomain: string): boolean {
  return domain === legitimateDomain || domain.endsWith(`.${legitimateDomain}`);
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

// Standard Levenshtein edit distance, iterative single-row form -- no
// dependency needed for this. Only ever called on short domain strings, so
// the O(n*m) cost is negligible.
function editDistance(a: string, b: string): number {
  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const currentRow = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      currentRow.push(Math.min(currentRow[j] + 1, previousRow[j + 1] + 1, previousRow[j] + cost));
    }
    previousRow = currentRow;
  }
  return previousRow[b.length];
}

function findLookalikeBrand(senderDomain: string): string | null {
  if (senderDomain.length < LOOKALIKE_MIN_DOMAIN_LENGTH) return null;
  for (const [brand, domains] of Object.entries(BRAND_DOMAINS)) {
    for (const legitDomain of domains) {
      if (isSameOrSubdomain(senderDomain, legitDomain)) return null; // The real thing -- stop checking this sender entirely, not just this brand.
      const distance = editDistance(senderDomain, legitDomain);
      if (distance > 0 && distance <= LOOKALIKE_MAX_DISTANCE) return brand;
    }
  }
  return null;
}

function brandSignal(message: NormalizedMessageMetadata): ThreatSignal | null {
  const brand = matchedBrand(message.fromDisplayName);
  if (!brand) return null;

  const senderDomain = domainOf(message.fromAddress);
  const legitimateDomains = BRAND_DOMAINS[brand];
  if (legitimateDomains.some((d) => isSameOrSubdomain(senderDomain, d))) return null;

  if (FREEMAIL_DOMAINS.has(senderDomain)) {
    // Highest-confidence case: a real bank/brand never sends from a
    // consumer free-mail domain.
    return { kind: "freemail-brand-claim", brand, confidence: "high" };
  }
  return { kind: "brand-impersonation", brand, confidence: "medium" };
}

function lookalikeSignal(message: NormalizedMessageMetadata): ThreatSignal | null {
  const senderDomain = domainOf(message.fromAddress);
  const brand = findLookalikeBrand(senderDomain);
  return brand ? { kind: "lookalike-domain", brand, confidence: "high" } : null;
}

function authenticationSignal(message: NormalizedMessageMetadata): ThreatSignal | null {
  const { dmarc } = parseAuthenticationResults(message.authenticationResults);
  // DMARC specifically, not SPF/DKIM alone: SPF and DKIM can legitimately
  // fail on their own (mailing-list relays, forwarding) without the message
  // being forged, which is exactly the false-positive DMARC's own
  // alignment check exists to avoid -- a DMARC "fail" means the domain the
  // recipient actually sees in From: specifically failed its own published
  // policy, a much stronger signal than either mechanism alone.
  if (dmarc !== "fail") return null;
  const senderDomain = domainOf(message.fromAddress) || "unknown sender";
  return { kind: "failed-authentication", brand: senderDomain, confidence: "high" };
}

/** Pure, synchronous, and already-fetched-data-only -- same shape as
 * classifyMessageKind. Returns every signal that fired, not just the first
 * one; callers decide what to do with an empty array (nothing suspicious
 * found) versus one or more signals. */
export function scoreMessageForThreats(message: NormalizedMessageMetadata): ThreatSignal[] {
  const signals: ThreatSignal[] = [];
  const brand = brandSignal(message);
  if (brand) signals.push(brand);
  // Only check for a lookalike if the exact-brand check didn't already fire
  // -- a message from paypa1.com claiming to be "PayPal" would otherwise
  // report as both brand-impersonation AND lookalike-domain for the same
  // underlying fact.
  if (!brand) {
    const lookalike = lookalikeSignal(message);
    if (lookalike) signals.push(lookalike);
  }
  const auth = authenticationSignal(message);
  if (auth) signals.push(auth);
  return signals;
}
