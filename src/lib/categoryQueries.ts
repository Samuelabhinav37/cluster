// Gmail search criteria for each sort category, so a Gmail filter can label
// new mail the moment it arrives (browser open or not), and the same query can
// find matching mail already in the inbox.
//
// Kind categories match subject phrases. Each phrase here must also match the
// client classifier (messageKind.ts) — a test enforces it — so the server side
// is only ever narrower than what Cluster itself would decide. Kinds keep the
// client's precedence (codes, then shipping, then receipts, then social) by
// excluding the earlier kinds' phrases, and sender-based categories exclude
// every kind phrase, mirroring classifySortBucket's "kind wins" rule.
import { domainsForCategory, type DomainCategory } from "./domainCategories";
import type { SortBucket, SortOverride } from "./sortTaxonomy";

type SubjectKind = "otp" | "shipping" | "receipt" | "social";

export const KIND_PHRASES: Record<SubjectKind, string[]> = {
  otp: [
    "verification code",
    "security code",
    "one-time",
    "login code",
    "sign-in code",
    "is your code",
    "your code is",
    "passcode",
    "2FA",
    "two-factor",
  ],
  // No bare "delivery" or "tracking": promo copy ("Free delivery") uses them.
  shipping: [
    "shipped",
    "out for delivery",
    "delivered",
    "on its way",
    "order confirmation",
    "order confirmed",
    "tracking number",
  ],
  receipt: ["receipt", "invoice", "payment received", "payment confirmation", "your bill"],
  social: ["mentioned you", "tagged you", "new follower", "friend request", "liked your", "commented on"],
};

/** Security notices that mention codes or 2FA but must never be filed away
 * as a disposable code ("Two-factor authentication was disabled"). Mirrored
 * by OTP_EXCLUDE_RE in messageKind.ts. */
export const OTP_EXCLUDED_PHRASES = ["alert", "disabled", "changed", "new sign-in", "suspicious"];

const KIND_ORDER: SubjectKind[] = ["otp", "shipping", "receipt", "social"];

function term(phrase: string): string {
  return /[\s-]/.test(phrase) ? `"${phrase}"` : phrase;
}

function subjectAny(phrases: string[]): string {
  return `subject:(${phrases.map(term).join(" OR ")})`;
}

function fromAny(addresses: string[]): string {
  return `from:(${addresses.join(" OR ")})`;
}

const ALL_KIND_PHRASES = KIND_ORDER.flatMap((k) => KIND_PHRASES[k]);

function isSubjectKind(bucket: SortBucket): bucket is SubjectKind {
  return (KIND_ORDER as string[]).includes(bucket);
}

const DOMAIN_BUCKETS: SortBucket[] = ["shopping", "travel", "finance", "productivity", "education", "newsletter"];

/** Addresses the user redirected into `bucket`, and ones they sent elsewhere
 * or set to "never" sort (from Sort my inbox's per-sender corrections). */
function overrideTerms(bucket: SortBucket, overrides: Record<string, SortOverride>) {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const [raw, target] of Object.entries(overrides)) {
    const addr = raw.toLowerCase().trim();
    if (!addr) continue;
    (target === bucket ? include : exclude).push(addr);
  }
  return { include, exclude };
}

/**
 * The Gmail search query for one category, or null when there's nothing to
 * match. Used both as a filter's criteria (Gmail runs it on every new
 * message) and as a search over mail already in the mailbox.
 */
export function categoryQuery(bucket: SortBucket, overrides: Record<string, SortOverride> = {}): string | null {
  const { include, exclude } = overrideTerms(bucket, overrides);
  const matchAny: string[] = [];
  const not: string[] = [];

  if (isSubjectKind(bucket)) {
    matchAny.push(subjectAny(KIND_PHRASES[bucket]));
    if (bucket === "social") matchAny.push(fromAny(domainsForCategory("social")));
    const earlier = KIND_ORDER.slice(0, KIND_ORDER.indexOf(bucket)).flatMap((k) => KIND_PHRASES[k]);
    if (earlier.length > 0) not.push(subjectAny(earlier));
    if (bucket === "otp") not.push(subjectAny(OTP_EXCLUDED_PHRASES));
  } else if (bucket === "promotions") {
    matchAny.push("category:promotions");
    not.push(subjectAny(ALL_KIND_PHRASES));
  } else if (DOMAIN_BUCKETS.includes(bucket)) {
    // Newsletters are mostly found by their List-Unsubscribe header, which a
    // filter can't see; the background tagger covers the rest.
    const domains = domainsForCategory(bucket as DomainCategory);
    if (domains.length > 0) matchAny.push(fromAny(domains));
    not.push(subjectAny(ALL_KIND_PHRASES));
  }
  if (include.length > 0) matchAny.push(fromAny(include));
  if (matchAny.length === 0) return null;
  if (exclude.length > 0) not.push(fromAny(exclude));

  const match = matchAny.length === 1 ? matchAny[0] : `{${matchAny.join(" ")}}`;
  return [match, ...not.map((n) => `-${n}`)].join(" ");
}
