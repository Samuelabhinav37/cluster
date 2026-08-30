// Deterministic, rule-based phishing-signal scoring -- the "Athena security
// connection" (athenaIntegration.ts) has been wired up since the last pass,
// but nothing generated a real event until this module existed. Same
// constraint as messageKind.ts: only headers already fetched for the
// existing cleanup feature (fromAddress, fromDisplayName, replyToAddress,
// subject, authenticationResults) -- never the message body, never a new
// OAuth scope, never a network call of its own.
//
// Signal kinds, in order of how much they need to already know about a
// brand:
// - "failed-authentication": DMARC fail on the header the provider already
//   fetched (see emailAuth.ts) -- fires for ANY sender, not just the
//   BRAND_DOMAINS list below, since a forged sender doesn't have to
//   impersonate a name on this list to be a forged sender.
// - "brand-impersonation" / "freemail-brand-claim": a display name invokes
//   a known brand whose real domain doesn't match -- exact-or-subdomain
//   match against BRAND_DOMAINS, freemail-claim distinguished as the
//   highest-confidence case.
// - "lookalike-domain": the sender domain is a small edit distance from a
//   brand's real domain (paypa1.com, arnazon.com), or renders identically
//   to one after homoglyph normalisation (Cyrillic 'a'), without being an
//   exact or subdomain match -- classic typosquatting, independent of
//   whether the display name mentions the brand by name at all.
// - "blocklisted-domain": the sender domain (or a parent of it) is on the
//   static blocklist -- the hand-maintained seed plus the build-time
//   vendored URLhaus slice (see blocklist.ts). Still a committed copy, no
//   live fetch, so it stays within the project's no-network stance.
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import { parseAuthenticationResults } from "./emailAuth";
import { isBlockedDomain } from "./blocklist";

// "link-mismatch" is never produced by scoreMessageForThreats below -- it's
// only ever reported by the dashboard's manual "Deep scan" action (see
// linkMismatch.ts), which needs the message body this module deliberately
// never fetches. Listed here anyway so it shares one type with the others,
// rather than a second, parallel signal-kind type for one caller.
export type ThreatSignalKind =
  | "brand-impersonation"
  | "freemail-brand-claim"
  | "lookalike-domain"
  | "failed-authentication"
  | "blocklisted-domain"
  | "reply-to-mismatch"
  | "punycode-domain"
  | "lure-language"
  | "link-mismatch";

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
// The same coincidence problem, from the brand's side: edit-distance
// lookalike matching is only trustworthy when the brand's own label (the
// bit before the first dot) is long enough that a legitimate unrelated
// domain is unlikely to land within LOOKALIKE_MAX_DISTANCE of it by chance.
// ups.com is one substitution from ubs.com (UBS, a real bank); att.com is
// two edits from att.net (AT&T's own other domain) -- neither is a
// typosquat. Senders impersonating a short-label brand still get caught by
// the display-name brand-impersonation check, which doesn't rely on this.
const LOOKALIKE_MIN_BRAND_LABEL_LENGTH = 5;

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).toLowerCase();
}

function isSameOrSubdomain(domain: string, legitimateDomain: string): boolean {
  return domain === legitimateDomain || domain.endsWith(`.${legitimateDomain}`);
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Precompiled once rather than per sender. A brand key can carry a space
// ("capital one") or punctuation ("at&t", "t-mobile"): escape any regex
// metacharacters, and let a run of whitespace in the key match any
// whitespace in the display name so "Capital  One" or a non-breaking space
// still matches. Word-boundary anchored -- "irs" must not match inside
// "shirsley" -- and only ever tested against the display name, a short,
// human-authored field, not free text.
const BRAND_MATCHERS: Array<{ brand: string; re: RegExp }> = Object.keys(BRAND_DOMAINS).map((brand) => ({
  brand,
  re: new RegExp(`\\b${escapeRegExp(brand).replace(/\s+/g, "\\s+")}\\b`, "i"),
}));

function matchedBrand(displayName: string): string | null {
  for (const { brand, re } of BRAND_MATCHERS) {
    if (re.test(displayName)) return brand;
  }
  return null;
}

// Unicode/ASCII confusables actually used in domain phishing, each mapped
// to the ASCII character it imitates. Deliberately not the full ~6000-entry
// Unicode confusables table -- just the Cyrillic/Greek letters that render
// identically to a Latin letter in a domain, plus the classic digit/letter
// swaps (paypa1.com, g00gle.com). Applied to build an "ASCII skeleton" of a
// domain so a homoglyph swap that would otherwise be a large raw edit
// distance (Cyrillic 'а' is a different code point, not one substitution)
// still resolves to the brand it's imitating.
const CONFUSABLES: Record<string, string> = {
  // Cyrillic letters that render identically to a lowercase Latin letter
  а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y", ѕ: "s", і: "i", ј: "j", ԁ: "d",
  // Greek, same test
  ο: "o", α: "a", ρ: "p", ν: "v", ι: "i", ϲ: "c",
  // classic digit-for-letter swaps
  "0": "o", "1": "l", "5": "s",
};

function asciiSkeleton(domain: string): string {
  return [...domain.toLowerCase()].map((ch) => CONFUSABLES[ch] ?? ch).join("");
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
  const skeleton = asciiSkeleton(senderDomain);
  for (const [brand, domains] of Object.entries(BRAND_DOMAINS)) {
    for (const legitDomain of domains) {
      if (isSameOrSubdomain(senderDomain, legitDomain)) return null; // The real thing -- stop checking this sender entirely, not just this brand.
      if (legitDomain.split(".")[0].length < LOOKALIKE_MIN_BRAND_LABEL_LENGTH) continue;
      // Confusable-normalised exact match: the domain renders identically to
      // the brand's real one but isn't it -- a Cyrillic 'а' in pаypаl.com, a
      // digit 1 in paypa1.com. The strongest lookalike case, and one raw
      // edit distance misses entirely for the homoglyph variant.
      if (skeleton === legitDomain && senderDomain !== legitDomain) return brand;
      if (editDistanceWithin(senderDomain, legitDomain, LOOKALIKE_MAX_DISTANCE)) return brand;
      // A homoglyph swap plus an ordinary typo can push the raw string past
      // the threshold while the skeleton stays close -- check that too.
      if (skeleton !== senderDomain && editDistanceWithin(skeleton, legitDomain, LOOKALIKE_MAX_DISTANCE)) {
        return brand;
      }
    }
  }
  return null;
}

function editDistanceWithin(a: string, b: string, max: number): boolean {
  const distance = editDistance(a, b);
  return distance > 0 && distance <= max;
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
  const { spf, dkim, dmarc } = parseAuthenticationResults(message.authenticationResults);
  const senderDomain = domainOf(message.fromAddress) || "unknown sender";
  // DMARC "fail" is the strongest single verdict: the domain the recipient
  // actually sees in From: failed its own published policy. But providers
  // usually spam-folder those before they reach the Promotions/Updates mail
  // this tool scans, so it rarely fires in practice -- hence the second case.
  if (dmarc === "fail") {
    return { kind: "failed-authentication", brand: senderDomain, confidence: "high" };
  }
  // SPF and DKIM each fail benignly on their own (list relays, forwarding),
  // which is why DMARC alignment exists -- but BOTH explicitly failing, with
  // no DMARC pass to vouch for the message, is close to the same signal and
  // survives to the inbox more often. Medium, not high.
  if (spf === "fail" && dkim === "fail" && dmarc !== "pass") {
    return { kind: "failed-authentication", brand: senderDomain, confidence: "medium" };
  }
  return null;
}

// Classic credential-harvesting / urgency lures. Subject line only -- a
// header this tool already fetches, never the body. Word-boundary anchored,
// deliberately small: this is a low-weight corroborating signal (it can't
// reach "elevated" on its own), not a spam classifier.
const LURE_RE =
  /\b(account (has been )?(suspended|locked|disabled|compromised|on hold)|verify (your )?(account|identity|payment|information)( within| in the next)? \d+ ?(hours?|days?)|unusual (sign[- ]?in|login|activity)|password (will )?expir|confirm your (identity|account) (now|immediately)|payment (was )?(declined|failed)|update your (billing|payment) (details|information) (to avoid|or)|final (notice|warning)|your (account|access) will be (closed|terminated|deleted))\b/i;

function lureLanguageSignal(message: NormalizedMessageMetadata): ThreatSignal | null {
  if (!LURE_RE.test(message.subject || "")) return null;
  return { kind: "lure-language", brand: domainOf(message.fromAddress) || "unknown sender", confidence: "medium" };
}

function replyToMismatchSignal(message: NormalizedMessageMetadata): ThreatSignal | null {
  const replyTo = domainOf(message.replyToAddress ?? "");
  if (!replyTo) return null;
  const from = domainOf(message.fromAddress);
  if (!from || replyTo === from || isSameOrSubdomain(replyTo, from) || isSameOrSubdomain(from, replyTo)) {
    return null;
  }
  // Only the high-signal shape: replies redirected to a consumer free-mail
  // account. A vendor whose From and Reply-To are two of its own corporate
  // domains is common and benign, so a bare domain difference isn't enough.
  if (!FREEMAIL_DOMAINS.has(replyTo)) return null;
  return { kind: "reply-to-mismatch", brand: replyTo, confidence: "medium" };
}

function punycodeSignal(message: NormalizedMessageMetadata): ThreatSignal | null {
  const domain = domainOf(message.fromAddress);
  if (!domain.split(".").some((label) => label.startsWith("xn--"))) return null;
  return { kind: "punycode-domain", brand: domain, confidence: "medium" };
}

/** Signals that come purely from sender identity -- the from-address and
 * display name -- and are therefore identical for every message from one
 * sender key. senderModel computes these once per sender, not per message.
 * Pure, synchronous, already-fetched-data-only. */
export function scoreSenderIdentity(message: NormalizedMessageMetadata): ThreatSignal[] {
  const signals: ThreatSignal[] = [];

  // Independent of any brand match -- a domain on the blocklist is a fact on
  // its own, and can co-exist with a brand/lookalike signal on the same
  // sender.
  const senderDomain = domainOf(message.fromAddress);
  if (senderDomain && isBlockedDomain(senderDomain)) {
    signals.push({ kind: "blocklisted-domain", brand: senderDomain, confidence: "high" });
  }

  const punycode = punycodeSignal(message);
  if (punycode) signals.push(punycode);

  const brand = brandSignal(message);
  if (brand) {
    signals.push(brand);
  } else {
    // Only check for a lookalike if the exact-brand check didn't already
    // fire -- a message from paypa1.com claiming to be "PayPal" would
    // otherwise report as both brand-impersonation AND lookalike-domain for
    // the same underlying fact.
    const lookalike = lookalikeSignal(message);
    if (lookalike) signals.push(lookalike);
  }
  return signals;
}

/** The one signal that varies message-to-message for a single sender: DMARC
 * alignment is a property of each delivered message, not of the sender's
 * identity -- a forwarded copy can fail where a direct one passes, and an
 * attacker may spoof the From on only some messages. senderModel re-checks
 * this across all of a sender's messages, not just the first one seen. */
export function scoreMessageAuthentication(message: NormalizedMessageMetadata): ThreatSignal | null {
  return authenticationSignal(message);
}

/** Per-message signals that aren't authentication: they vary message to
 * message (a lure subject, a redirected Reply-To) rather than being fixed by
 * the sender's identity. senderModel merges these across a sender's messages,
 * same as the authentication signal. Pure, already-fetched-headers only. */
export function scoreMessageContext(message: NormalizedMessageMetadata): ThreatSignal[] {
  const signals: ThreatSignal[] = [];
  const replyTo = replyToMismatchSignal(message);
  if (replyTo) signals.push(replyTo);
  const lure = lureLanguageSignal(message);
  if (lure) signals.push(lure);
  return signals;
}

/** Full per-message score: the sender-identity signals plus this one
 * message's own authentication result and context signals. Returns every
 * signal that fired, not just the first; callers decide what an empty array
 * (nothing suspicious) versus one or more signals means. */
export function scoreMessageForThreats(message: NormalizedMessageMetadata): ThreatSignal[] {
  const auth = scoreMessageAuthentication(message);
  const identity = scoreSenderIdentity(message);
  const context = scoreMessageContext(message);
  return [...identity, ...(auth ? [auth] : []), ...context];
}

// Relative weights for turning a sender's set of signals into one number the
// dashboard can rank by. These are ordinal, not calibrated probabilities --
// the point is only that "claims a brand from a Gmail address" outranks a
// lone medium signal, and that two signals on the same sender outrank one.
const SIGNAL_WEIGHTS: Record<ThreatSignalKind, number> = {
  "blocklisted-domain": 6, // a confirmed-bad domain, not a heuristic
  "freemail-brand-claim": 5, // no legitimate reason a bank emails from gmail.com
  "lookalike-domain": 4,
  "link-mismatch": 4,
  "failed-authentication": 3,
  "brand-impersonation": 3,
  "reply-to-mismatch": 3, // replies redirected to a personal free-mail account
  "punycode-domain": 2, // xn-- sender domain; rare for legitimate bulk mail
  "lure-language": 2, // corroborating only -- can't reach "elevated" alone
};

export type RiskTier = "high" | "elevated" | "low";

/** Sum of every signal's weight plus a point for each high-confidence one,
 * so a sender that trips several signals sorts above one that trips a single
 * medium signal. Zero for a sender with no signals. */
export function senderRiskScore(signals: ThreatSignal[]): number {
  return signals.reduce(
    (total, s) => total + SIGNAL_WEIGHTS[s.kind] + (s.confidence === "high" ? 1 : 0),
    0,
  );
}

export function riskTier(score: number): RiskTier {
  if (score >= 6) return "high";
  if (score >= 3) return "elevated";
  return "low";
}
