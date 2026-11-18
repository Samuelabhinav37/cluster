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
import { domainsForCategory, serviceExceptions, type DomainCategory } from "./domainCategories";
import type { SortBucket, SortOverride } from "./sortTaxonomy";

type SubjectKind = "otp" | "accounts" | "shipping" | "receipt" | "social" | "jobs";

export const KIND_PHRASES: Record<SubjectKind, string[]> = {
  otp: [
    "verification code",
    "security code",
    "one-time",
    "login code",
    "sign-in code",
    // No "is your code" / "your code is": the client needs a code beside them.
    "passcode",
    "2FA",
    "two-factor",
    "sign-in link",
    "confirmation code",
  ],
  accounts: [
    "security alert",
    "new sign-in",
    "sign-in attempt",
    "password reset",
    "reset your password",
    "password changed",
    "suspicious activity",
    "account recovery",
    "2-Step Verification",
    "new login",
    "password was changed",
    "confirm your email",
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
    "arriving today",
    "arriving tomorrow",
  ],
  receipt: [
    "receipt",
    "invoice",
    "payment received",
    "payment confirmation",
    "received your payment",
    "purchase confirmation",
    "refund confirmation",
    "booking confirmation",
    "your bill",
  ],
  social: ["mentioned you", "tagged you", "new follower", "friend request", "liked your", "commented on"],
  jobs: ["thank you for applying", "thanks for applying", "your application", "job application", "application update", "application status", "job alert", "jobs for you", "job opening", "thank you for your interest in", "job recommendations"],
};

/** Security notices that mention codes or 2FA but must never be filed away
 * as a disposable code ("Two-factor authentication was disabled"). Mirrored
 * by OTP_EXCLUDE_RE in messageKind.ts. */
export const OTP_EXCLUDED_PHRASES = ["alert", "disabled", "changed", "new sign-in", "suspicious"];

/** The biggest free-mail domains. A "receipt" or "security alert" from one is
 * a person or a scam, never a company, so a subject filter skips them, as
 * classifySortBucket does with the whole FREE_MAIL_DOMAINS list.
 * shortcut: 12 of ~80 to keep each filter under MAX_FILTER_QUERY; the client pass catches the rest. */
export const FILTER_FREE_MAIL = [
  "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com",
  "icloud.com", "aol.com", "protonmail.com", "proton.me", "yahoo.co.in", "rediffmail.com",
];

export const JOB_RECEIPT_PHRASES = ["resume receipt", "application receipt", "receipt of your application", "receipt of your resume"];

const KIND_ORDER: SubjectKind[] = ["otp", "accounts", "shipping", "receipt", "social", "jobs"];

function term(phrase: string): string {
  return /[\s-]/.test(phrase) ? `"${phrase}"` : phrase;
}

function subjectAny(phrases: string[]): string {
  return `subject:(${phrases.map(term).join(" OR ")})`;
}

function fromAny(addresses: string[]): string {
  return `from:(${addresses.join(" OR ")})`;
}

/** Mail you need right now: a hold (Screener) must never catch it. */
export const TIME_SENSITIVE_QUERY = subjectAny([
  ...KIND_PHRASES.otp,
  "security alert",
  "new sign-in",
  "out for delivery",
  "arriving today",
]);

const ALL_KIND_PHRASES = KIND_ORDER.flatMap((k) => KIND_PHRASES[k]);

function isSubjectKind(bucket: SortBucket): bucket is SubjectKind {
  return (KIND_ORDER as string[]).includes(bucket);
}

const DOMAIN_BUCKETS: SortBucket[] = ["shopping", "travel", "finance", "productivity", "education", "newsletter"];

/** Addresses the user redirected into `bucket`, and ones they sent elsewhere
 * or set to "never" sort (from Sort my inbox's per-sender corrections),
 * newest correction first so it wins the room in a full filter.
 * A kind-scoped key ("a@x.com|receipt") becomes a from+subject term:
 * `scoped` are this bucket's own; `notScoped` keeps one kind of a sender
 * filed here whole out of this bucket. */
function overrideTerms(bucket: SortBucket, overrides: Record<string, SortOverride>) {
  const include: string[] = [];
  const exclude: string[] = [];
  const scoped: string[] = [];
  const notScoped = new Map<string, string[]>();
  const entries = Object.entries(overrides).reverse();
  for (const [raw, target] of entries) {
    const addr = raw.toLowerCase().trim();
    // Gmail search has no wildcards: a pattern (bounce-*@host) is applied by
    // Cluster's own 5-minute pass instead.
    if (!addr || addr.includes("*") || addr.includes("|")) continue;
    (target === bucket ? include : exclude).push(addr);
  }
  for (const [raw, target] of entries) {
    const [addr, kind] = raw.toLowerCase().trim().split("|");
    if (kind === undefined || !addr || addr.includes("*") || !(kind in KIND_PHRASES)) continue;
    const term = `(from:${addr} ${subjectAny(KIND_PHRASES[kind as SubjectKind])})`;
    if (target === bucket) scoped.push(term);
    // In its own kind's filter, only that kind's mail can match, so the
    // address alone is enough, unless the user also filed the whole sender here.
    else if (bucket === kind && !include.includes(addr)) exclude.push(addr);
    else if (include.includes(addr)) notScoped.set(addr, [...(notScoped.get(addr) ?? []), term]);
  }
  return { include, exclude: [...new Set(exclude)].filter((a) => !include.includes(a)), scoped, notScoped };
}

/** Gmail refuses a filter whose criteria run much past 1,500 characters. */
export const MAX_FILTER_QUERY = 1400;
/** Room each curated-domain query keeps for leaving out corrected senders. */
const EXCLUDE_RESERVE = 300;

/** `query` with as many of `addrs` left out as fit under MAX_FILTER_QUERY.
 * shortcut: senders that don't fit can still get this label on arrival; the
 * relabel puts them right (a correction beats every rule there). Upgrade to a
 * client-side corrections pass if that lag shows up in the correction rate. */
function withExcludes(query: string, addrs: readonly string[]): string {
  let len = query.length + " -from:()".length;
  let n = 0;
  for (; n < addrs.length; n++) {
    len += addrs[n].length + (n > 0 ? " OR ".length : 0);
    if (len > MAX_FILTER_QUERY) break;
  }
  return n === 0 ? query : `${query} -${fromAny(addrs.slice(0, n))}`;
}

/** Packs terms into as few queries as fit, each `wrap(chunk)`. */
function packed<T>(items: readonly T[], wrap: (chunk: readonly T[]) => string): string[] {
  const out: string[] = [];
  for (let i = 0; i < items.length; ) {
    let j = i + 1;
    while (j < items.length && wrap(items.slice(i, j + 1)).length <= MAX_FILTER_QUERY) j++;
    out.push(wrap(items.slice(i, j)));
    i = j;
  }
  return out;
}

/**
 * The Gmail filter queries for one category, empty when there's nothing to
 * match. Gmail runs each on every new message, and none is ever longer than
 * MAX_FILTER_QUERY, however many corrections the user makes. The subject
 * phrases ride in the first; a long curated domain list is split across
 * several; the user's own redirects get queries of their own, as their
 * correction beats every rule (effectiveBucket).
 */
export function categoryQueries(bucket: SortBucket, overrides: Record<string, SortOverride> = {}): string[] {
  const { include, exclude, scoped, notScoped } = overrideTerms(bucket, overrides);
  const all = domainsForCategory(bucket as DomainCategory);
  const reserve = exclude.length === 0 ? 0 : Math.min(EXCLUDE_RESERVE, fromAny(exclude).length + 2);
  const out: string[] = [];
  let start = 0;
  let first = true;
  do {
    let end = start;
    while (end < all.length && (buildQuery(bucket, all.slice(start, end + 1), first)?.length ?? 0) <= MAX_FILTER_QUERY - reserve) end++;
    // No domain fits beside the subject phrases: they get a query of their own.
    if (end === start && first && all.length > 0) {
      const q = buildQuery(bucket, [], true);
      if (q) out.push(withExcludes(q, exclude));
      first = false;
      continue;
    }
    // A single domain never overflows on its own; this only guards the loop.
    if (end === start && end < all.length) end++;
    const q = buildQuery(bucket, all.slice(start, end), first);
    if (q) out.push(withExcludes(q, exclude));
    start = end;
    first = false;
  } while (start < all.length);
  out.push(
    ...packed(include, (chunk) => {
      const not = chunk.flatMap((a) => notScoped.get(a) ?? []);
      return [fromAny([...chunk]), ...not.map((n) => `-${n}`)].join(" ");
    }),
  );
  // Corrections for one kind of a sender's mail: the bucket's usual "no kind
  // phrases" rule would cancel them.
  out.push(...packed(scoped, (chunk) => (chunk.length === 1 ? chunk[0] : `{${chunk.join(" ")}}`)));
  return out;
}

/** The first of categoryQueries: the subject phrases and the first domains. */
export function categoryQuery(bucket: SortBucket, overrides: Record<string, SortOverride> = {}): string | null {
  return categoryQueries(bucket, overrides)[0] ?? null;
}

function buildQuery(bucket: SortBucket, domains: string[], first: boolean): string | null {
  const matchAny: string[] = [];
  const not: string[] = [];

  if (isSubjectKind(bucket)) {
    // Mirrors classifySortBucket: a social phrase from an unknown sender is
    // social only in Gmail's Social tab ("Jane commented on" from a work tool).
    if (first) matchAny.push(bucket === "social" ? `(${subjectAny(KIND_PHRASES.social)} category:social)` : subjectAny(KIND_PHRASES[bucket]));
    if ((bucket === "social" || bucket === "jobs") && domains.length > 0) matchAny.push(fromAny(domains));
    const earlier = KIND_ORDER.slice(0, KIND_ORDER.indexOf(bucket)).flatMap((k) => KIND_PHRASES[k]);
    if (earlier.length > 0) not.push(subjectAny(earlier));
    if (bucket === "otp") not.push(subjectAny(OTP_EXCLUDED_PHRASES));
    if (bucket === "accounts") not.push("subject:CVE");
    // Mirrors JOB_RECEIPT_RE: a job application's "receipt" is Jobs, the client's call.
    if (bucket === "receipt") not.push(subjectAny(JOB_RECEIPT_PHRASES));
    not.push(fromAny(FILTER_FREE_MAIL));
    // Primary is where people and lures land ("Question about the invoice",
    // "Please DocuSign: Payment_Invoice"): a phrase alone isn't near-certain
    // there, so Cluster's own pass decides (audit B2).
    not.push("category:personal");
  } else if (bucket === "promotions") {
    if (first) matchAny.push("category:promotions");
    not.push(subjectAny(ALL_KIND_PHRASES));
  } else if (DOMAIN_BUCKETS.includes(bucket)) {
    // Newsletters are mostly found by their List-Unsubscribe header, which a
    // filter can't see; the background tagger covers the rest.
    if (domains.length > 0) matchAny.push(fromAny(domains));
    not.push(subjectAny(ALL_KIND_PHRASES));
    // Mirrors classifySortBucket: the Promotions tab wins over the domain.
    // shortcut: a newsletter there gets Promotions (its list header, which
    // makes it a newsletter, is invisible to a filter, and the 59 newsletter
    // domains don't fit in the Promotions query); the relabel swaps it.
    not.push("category:promotions");
    // Calendar invites are people arranging something (CALENDAR_RE).
    if (bucket === "productivity") not.push("subject:(invitation OR accepted OR declined)");
  }
  // AWS under amazon.com, LinkedIn Learning under linkedin.com: their own label, not this one.
  const services = serviceExceptions(bucket as DomainCategory);
  if (domains.length > 0 && services.length > 0) not.push(fromAny(services));
  if (matchAny.length === 0) return null;

  const match = matchAny.length === 1 ? matchAny[0] : `{${matchAny.join(" ")}}`;
  return [match, ...not.map((n) => `-${n}`)].join(" ");
}
