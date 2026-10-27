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
import { domainToUnicode } from "./punycode";
import { cleanText, skeleton } from "./normalize";
import { isSameOrSubdomain, registrableDomain } from "./registrableDomain";
import { getDataset, refreshDataset } from "./remoteDataset";
import brandDomainsFallback from "./data/brandDomains.json";

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
  | "link-mismatch"
  | "risky-attachment"
  | "identity-change"
  | "provider-flagged";

export interface ThreatSignal {
  kind: ThreatSignalKind;
  /** The brand name involved -- for "failed-authentication" with no brand
   * match, this is the sender's own domain instead, since there's no brand
   * to name. */
  brand: string;
  confidence: "high" | "medium";
  /** The messages this signal came from, when it's about individual
   * messages (failed authentication, a lure subject, a redirected Reply-To,
   * a risky attachment, an identity change). Absent when it's about the
   * sender's address itself (lookalike, brand claim, list hit), so it covers
   * every message from them. Set by senderModel.ts and senderLedger.ts. */
  messageIds?: string[];
}

// Deliberately hand-curated, same "no free/reliable API fits this project's
// privacy stance" reasoning as domainCategories.ts -- but a separate list
// from it on purpose: domainCategories.ts answers "which label does mail
// from this domain get filed under," a materially different question from
// "which domains is this brand actually allowed to send phishing-relevant
// mail from." Grouped by category in data/brandDomains.json so it's obvious
// what's covered and what isn't -- expand deliberately, one verified
// legitimate domain at a time (see the audit trail in the project plan for
// how each entry was verified).
//
// BRAND_DOMAINS_BASE is the bundled snapshot, always complete enough on its
// own -- everything works exactly as before if the fetch below never
// succeeds. BRAND_DOMAINS is a mutable binding: refreshBrandDomains (called
// by the background alarm, see background.ts) can widen a KNOWN brand's
// domain list from a live-published copy of this same file, but can never
// introduce a brand that wasn't already here -- see isValidBrandDomainsPatch.
// This keeps a bad publish from being able to add a new "trusted" identity,
// only ever additional domains for brands this file already vouches for.
const BRAND_DOMAINS_BASE: Record<string, string[]> = brandDomainsFallback;
let BRAND_DOMAINS: Record<string, string[]> = BRAND_DOMAINS_BASE;

function isValidBrandDomainsPatch(data: unknown): data is Record<string, string[]> {
  if (typeof data !== "object" || data === null) return false;
  return Object.entries(data).every(
    ([brand, domains]) =>
      brand in BRAND_DOMAINS_BASE && Array.isArray(domains) && domains.every((d) => typeof d === "string"),
  );
}

function mergeBrandDomains(patch: Record<string, string[]>): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  for (const [brand, domains] of Object.entries(BRAND_DOMAINS_BASE)) {
    merged[brand] = [...new Set([...domains, ...(patch[brand] ?? [])])];
  }
  return merged;
}

// Hydrate from any existing cache at module load -- local storage only,
// never blocks on network, so this can't slow anything down. If nothing is
// cached yet (fresh install, or the alarm hasn't fired), this is a no-op and
// BRAND_DOMAINS just stays BRAND_DOMAINS_BASE.
void getDataset<Record<string, string[]>>("brandDomains", {}).then((patch) => {
  if (isValidBrandDomainsPatch(patch)) BRAND_DOMAINS = mergeBrandDomains(patch);
});

/** Called by the background alarm on a schedule (see background.ts) -- never
 * from the interactive scan path. Returns whether the cache changed. */
export async function refreshBrandDomains(publicKeyB64?: string): Promise<boolean> {
  // An allow-list: only a signed copy is taken (see datasetSignature.ts).
  const updated = await refreshDataset("brandDomains", "brandDomains.json", isValidBrandDomainsPatch, "allow", publicKeyB64);
  if (updated) {
    const patch = await getDataset<Record<string, string[]>>("brandDomains", {});
    if (isValidBrandDomainsPatch(patch)) BRAND_DOMAINS = mergeBrandDomains(patch);
  }
  return updated;
}

// Real senders sometimes legitimately use these for bulk mail (e.g. a small
// business emailing from a Gmail account) -- flagging "freemail-brand-claim"
// only when the display name invokes a brand from BRAND_DOMAINS above keeps
// this from misfiring on every small business newsletter.
const FREEMAIL_DOMAINS = new Set(["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "aol.com", "icloud.com", "protonmail.com"]);

// A lookalike this far off in edit distance from a brand's real domain is
// close enough to be deliberate confusion, not coincidence. One edit for a
// brand label under 8 letters (paypa1.com), two from 8 up (coinbsae.com is
// one swap; coinbasse.com one insertion). Two edits on a short name hit
// real neighbours: chess.com is two from chase.com. Homoglyph swaps
// (arnazon.com) are caught by the skeleton at distance 0, not here.
function lookalikeMaxDistance(brandDomain: string): number {
  return brandDomain.split(".")[0].length >= 8 ? 2 : 1;
}
// Below this length, small edit distances stop being meaningful signal --
// short domains are close to lots of unrelated short domains by chance.
const LOOKALIKE_MIN_DOMAIN_LENGTH = 6;
// The same coincidence problem, from the brand's side: edit-distance
// lookalike matching is only trustworthy when the brand's own label (the
// bit before the first dot) is long enough that a legitimate unrelated
// domain is unlikely to land within lookalikeMaxDistance of it by chance.
// ups.com is one substitution from ubs.com (UBS, a real bank); att.com is
// two edits from att.net (AT&T's own other domain) -- neither is a
// typosquat. Senders impersonating a short-label brand still get caught by
// the display-name brand-impersonation check, which doesn't rely on this.
const LOOKALIKE_MIN_BRAND_LABEL_LENGTH = 5;

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).toLowerCase();
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Precompiled once rather than per sender. A brand key can carry a space
// ("capital one") or punctuation ("at&t", "t-mobile"): escape any regex
// metacharacters, and let a run of whitespace in the key match any
// whitespace in the display name so "Capital  One" or a non-breaking space
// still matches. Word-boundary anchored, with a hyphen counted as part of
// the word -- "irs" must not match inside "shirsley", nor "ups" inside
// "Start-Ups" -- and only ever tested against the display name, a short,
// human-authored field, not free text. Both sides are skeletons
// (normalize.ts), so "PаyPal" with a Cyrillic а or "PayPal" with a hidden
// zero-width space inside still reads as PayPal.
const BRAND_MATCHERS: Array<{ brand: string; skel: string; re: RegExp }> = Object.keys(BRAND_DOMAINS).map(
  (brand) => {
    const skel = skeleton(brand);
    const words = escapeRegExp(skel).replace(/\s+/g, "\\s+");
    return { brand, skel, re: new RegExp(`(?<![a-z0-9-])${words}(?![a-z0-9-])`) };
  },
);

// "PayPalSupport", "GoogleSecurity": a long brand name run together with a
// scam word. Only brands of five letters or more, and only next to one of
// COMBOSQUAT_LURE_WORDS, so "Upstart" or "Chaseland" never count.
const RUN_ON_MIN_BRAND_LENGTH = 5;

function matchedBrand(displayName: string): string | null {
  const name = skeleton(displayName);
  for (const { brand, re } of BRAND_MATCHERS) {
    if (re.test(name)) return brand;
  }
  const lureWords = new Set([...COMBOSQUAT_LURE_WORDS].map(skeleton));
  for (const token of name.split(/[^a-z0-9]+/)) {
    for (const { brand, skel } of BRAND_MATCHERS) {
      if (skel.length >= RUN_ON_MIN_BRAND_LENGTH && token.startsWith(skel) && lureWords.has(token.slice(skel.length))) {
        return brand;
      }
    }
  }
  return null;
}

// Standard Levenshtein edit distance, iterative single-row form -- no
// dependency needed for this. Only ever called on short domain strings, so
// the O(n*m) cost is negligible.
// Two swapped neighbours count as one edit (coinbsae.com), the classic typo.
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// Words that turn "brand name inside a domain" from coincidence into a
// scam pattern ("combosquatting"): paypal-secure-login.com, amazon-account-
// verify.co.uk. A brand token alone isn't enough (paper-chase.com is not
// Chase), so a combosquat needs the brand as a whole hyphen-separated word
// plus at least one of these.
const COMBOSQUAT_LURE_WORDS = new Set([
  "secure", "security", "login", "logon", "signin", "verify", "verification", "account", "accounts",
  "support", "billing", "update", "alert", "alerts", "service", "services", "help", "auth", "wallet",
  "confirm", "unlock", "recovery", "refund", "payment", "invoice", "customer", "care", "id",
]);

type LookalikeMatch = { brand: string; confidence: "high" | "medium" };

function findLookalikeBrand(senderDomain: string): LookalikeMatch | null {
  // One of any brand's own domains is never a lookalike of another brand's,
  // or of a sibling domain on the same brand's list (amazon.in / amazon.ca).
  for (const domains of Object.values(BRAND_DOMAINS)) {
    if (domains.some((d) => isSameOrSubdomain(senderDomain, d))) return null;
  }
  // Compare the part someone registered, so a subdomain can't hide the
  // lookalike: mail.paypa1.com is checked as paypa1.com.
  const registrable = registrableDomain(senderDomain);
  if (registrable.length < LOOKALIKE_MIN_DOMAIN_LENGTH) return null;
  // Headers carry internationalised domains as punycode (xn--pypl-53dc.com),
  // so decode before the confusables map can see the Cyrillic letters.
  const skel = skeleton(domainToUnicode(registrable));
  for (const [brand, domains] of Object.entries(BRAND_DOMAINS)) {
    for (const legitDomain of domains) {
      if (legitDomain.split(".")[0].length < LOOKALIKE_MIN_BRAND_LABEL_LENGTH) continue;
      const legitSkel = skeleton(legitDomain);
      // Confusable-normalised exact match: the domain renders identically to
      // the brand's real one but isn't it -- a Cyrillic 'а' in pаypаl.com, a
      // digit 1 in paypa1.com, rn for m in arnazon.com. The strongest
      // lookalike case, and one raw edit distance misses for homoglyphs.
      if (skel === legitSkel && registrable !== legitDomain) return { brand, confidence: "high" };
      if (editDistanceWithin(registrable, legitDomain, lookalikeMaxDistance(legitDomain))) return { brand, confidence: "high" };
      // A homoglyph swap plus an ordinary typo can push the raw string past
      // the threshold while the skeleton stays close -- check that too.
      if (editDistanceWithin(skel, legitSkel, lookalikeMaxDistance(legitDomain))) return { brand, confidence: "high" };
    }
  }
  const combosquat = findCombosquatBrand(registrable);
  return combosquat ? { brand: combosquat, confidence: "medium" } : null;
}

/** paypal-secure-login.com -> "paypal": the brand's own label as one
 * hyphen-separated word of the registered name, next to a scam word. */
function findCombosquatBrand(registrable: string): string | null {
  const name = registrable.split(".")[0];
  const words = name.split("-").filter(Boolean);
  if (words.length < 2 || !words.some((word) => COMBOSQUAT_LURE_WORDS.has(word))) return null;
  for (const [brand, domains] of Object.entries(BRAND_DOMAINS)) {
    for (const legitDomain of domains) {
      const brandLabel = registrableDomain(legitDomain).split(".")[0];
      if (brandLabel.length >= 3 && !COMBOSQUAT_LURE_WORDS.has(brandLabel) && words.includes(brandLabel)) return brand;
    }
  }
  return null;
}

function editDistanceWithin(a: string, b: string, max: number): boolean {
  // Edit distance is at least the length difference, so most brand domains
  // are ruled out without building the full matrix.
  if (Math.abs(a.length - b.length) > max) return false;
  const distance = editDistance(a, b);
  return distance > 0 && distance <= max;
}

const SYSTEM_LOCAL_PART_RE = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply)$/;

// Words a brand puts next to its name; anything else (a first or last name)
// means a person who happens to share it.
const ROLE_WORDS = new Set(
  [
    ...COMBOSQUAT_LURE_WORDS,
    "team", "teams", "dept", "department", "center", "centre", "desk", "official", "online", "notice",
    "notification", "notifications", "info", "fraud", "bank", "banking", "mail", "inc", "ltd", "llc", "corp",
    "the", "of", "your", "from", "com", "noreply", "no", "reply", "admin", "updates", "express", "prime",
  ].map(skeleton),
);

function soundsOfficial(displayName: string, brand: string): boolean {
  const rest = skeleton(displayName).replace(skeleton(brand), " ");
  return rest.split(/[^a-z0-9]+/).every((word) => word === "" || ROLE_WORDS.has(word));
}

function brandSignal(message: NormalizedMessageMetadata): ThreatSignal | null {
  const brand = matchedBrand(message.fromDisplayName);
  if (!brand) return null;

  const senderDomain = domainOf(message.fromAddress);
  const freemail = FREEMAIL_DOMAINS.has(senderDomain);
  const ownDomain = BRAND_DOMAINS[brand].some((d) => isSameOrSubdomain(senderDomain, d));
  // gmail.com is Google's and icloud.com Apple's, but anyone can open a
  // mailbox there: only the brand's own no-reply address counts as the brand.
  const localPart = message.fromAddress.slice(0, message.fromAddress.lastIndexOf("@")).toLowerCase();
  if (ownDomain && (!freemail || SYSTEM_LOCAL_PART_RE.test(localPart))) return null;

  if (freemail) {
    // Highest-confidence case: a real bank/brand never sends from a
    // consumer free-mail domain. But people share names with brands
    // ("Chase Miller", "Jordan Apple"), so on free-mail the name must be
    // the brand and role words only ("Chase Fraud Team", "Apple Support").
    if (!soundsOfficial(message.fromDisplayName, brand)) return null;
    return { kind: "freemail-brand-claim", brand, confidence: "high" };
  }
  return { kind: "brand-impersonation", brand, confidence: "medium" };
}

function lookalikeSignal(message: NormalizedMessageMetadata): ThreatSignal | null {
  const senderDomain = domainOf(message.fromAddress);
  const match = findLookalikeBrand(senderDomain);
  return match ? { kind: "lookalike-domain", brand: match.brand, confidence: match.confidence } : null;
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
  if (!LURE_RE.test(cleanText(message.subject || ""))) return null;
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

// Only a corroborating signal, same reasoning as lure-language: a risky-
// shaped attachment from a sender whose mail otherwise authenticates cleanly
// (DMARC pass) is far more likely a legitimate vendor sending a macro-enabled
// spreadsheet than an attack -- so this only fires when authentication did
// NOT pass, same "unauthenticated" bar authenticationSignal itself uses for
// its medium case (spf+dkim fail, dmarc not pass).
function attachmentSignal(message: NormalizedMessageMetadata): ThreatSignal | null {
  if (!message.hasRiskyAttachment) return null;
  const { dmarc } = parseAuthenticationResults(message.authenticationResults);
  if (dmarc === "pass") return null;
  return { kind: "risky-attachment", brand: domainOf(message.fromAddress) || "unknown sender", confidence: "medium" };
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
  const attachment = attachmentSignal(message);
  if (attachment) signals.push(attachment);
  if (message.providerFlagged) {
    const brand = domainOf(message.fromAddress) || "unknown sender";
    signals.push({ kind: "provider-flagged", brand, confidence: "medium" });
  }
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
  "risky-attachment": 3, // risky-shaped attachment, only when unauthenticated
  // A familiar sender now signed by, or asking for replies at, a new domain
  // (senderLedger.ts). A warning on its own. With a second kind of evidence
  // on the same message it holds that message only (verdict.ts).
  "identity-change": 3,
  // Outlook's own phishing/spam verdict. Warns alone; holds only with a
  // second kind of evidence, since a forged copy can't be ruled out yet.
  "provider-flagged": 3,
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
