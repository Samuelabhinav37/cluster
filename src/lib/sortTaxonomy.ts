// The bucket set for "Sort my inbox": the transactional message kinds
// (messageKind.ts, judged from the subject) unioned with the domain
// categories (domainCategories.ts, judged from the sender domain). When both
// apply, the kind wins -- "your order shipped" from amazon.com is an
// order-update, not just "Shopping".
import { canonicalAddress, senderPattern } from "./addressIdentity";
import { isFreeMailDomain } from "./freeMail";
import { categorizeDomain, serviceCategory, type DomainCategory } from "./domainCategories";
import type { MessageKind } from "./messageKind";
import type { SendingEvidence } from "./sendingEvidence";
import { clusterLabelName } from "./clusterLabels";

export type SortBucket =
  | "otp"
  | "receipt"
  | "shipping"
  | "newsletter"
  | "social"
  | "promotions"
  | "shopping"
  | "travel"
  | "finance"
  | "productivity"
  | "education"
  | "accounts"
  | "jobs";

export const SORT_BUCKET_LABELS: Record<SortBucket, string> = {
  otp: clusterLabelName("otp"),
  receipt: clusterLabelName("receipt"),
  shipping: clusterLabelName("shipping"),
  newsletter: clusterLabelName("newsletter"),
  social: clusterLabelName("social"),
  promotions: clusterLabelName("promotions"),
  shopping: clusterLabelName("shopping"),
  travel: clusterLabelName("travel"),
  finance: clusterLabelName("finance"),
  productivity: clusterLabelName("productivity"),
  education: clusterLabelName("education"),
  accounts: clusterLabelName("accounts"),
  jobs: clusterLabelName("jobs"),
};

/**
 * The Gmail / Outlook label a bucket's mail is filed under. Flat, no prefix --
 * the label a user sees is just "🛍 Shopping", "📰 Newsletters", etc., sitting
 * alongside their own labels (see clusterLabels.ts for the full table).
 */
export function bucketLabelName(bucket: SortBucket): string {
  return SORT_BUCKET_LABELS[bucket];
}

// Buckets that are noise in the inbox once filed (default: filed out of the
// inbox) vs. ones people usually want to keep seeing (default: labelled in
// place). The user can flip any of these per bucket.
export const DEFAULT_FILE_OUT_OF_INBOX: Record<SortBucket, boolean> = {
  otp: true,
  receipt: true,
  shipping: true,
  newsletter: true,
  social: true,
  promotions: true,
  shopping: false,
  travel: false,
  finance: false,
  productivity: false,
  education: false,
  accounts: false,
  jobs: false,
};

// Every label's mail stays in the inbox an hour, then goes to its label.
const HOUR = 1;

/** How long each category's new mail stays in the inbox before the time
 * sweep moves it into its label. 0 = straight to the label on arrival;
 * null = stays in the inbox (labelled only). */
export const DEFAULT_INBOX_HOURS: Record<SortBucket, number | null> = {
  otp: HOUR,
  receipt: HOUR,
  shipping: HOUR,
  newsletter: HOUR,
  social: HOUR,
  promotions: HOUR,
  shopping: HOUR,
  travel: HOUR,
  finance: HOUR,
  productivity: HOUR,
  education: HOUR,
  accounts: HOUR,
  jobs: HOUR,
};

export const ALL_SORT_BUCKETS: SortBucket[] = Object.keys(SORT_BUCKET_LABELS) as SortBucket[];

const KIND_BUCKET: Partial<Record<MessageKind, SortBucket>> = {
  otp: "otp",
  accounts: "accounts",
  receipt: "receipt",
  statement: "finance",
  shipping: "shipping",
  newsletter: "newsletter",
  social: "social",
  jobs: "jobs",
};

const CATEGORY_BUCKET: Partial<Record<DomainCategory, SortBucket>> = {
  shopping: "shopping",
  travel: "travel",
  finance: "finance",
  social: "social",
  newsletter: "newsletter",
  productivity: "productivity",
  education: "education",
  jobs: "jobs",
};

/**
 * The bucket a message belongs in, or null if neither its kind nor its
 * sender's domain category is specific enough (both fell through to "other").
 * Kind takes priority, then Gmail's Promotions tab (an ad is an ad whoever
 * sends it), then the sender's category.
 */
/** What else a message says about itself, beyond its subject and sender. */
export interface SortHints {
  /** The Gmail tab: Google's own call on what the mail is. */
  tab?: string;
  /** Domains whose DKIM signature passed: the company that really sent it. */
  dkimDomains?: string[];
  sentBy?: SendingEvidence;
}

export function classifySortBucket(
  kind: MessageKind,
  senderDomain: string,
  promotion = false,
  senderAddress = "",
  hints: SortHints = {},
): SortBucket | null {
  // A free-mail address is a person or someone posing as a company: an
  // "invoice" or "order" from one goes to the Screener, never a label.
  if (isFreeMailDomain(senderDomain)) return null;
  const byCategory = CATEGORY_BUCKET[serviceCategory(senderAddress) ?? senderCategory(senderDomain, hints.dkimDomains)];
  // Any list mail has an unsubscribe link, so "newsletter" alone can't tell
  // an ad from news; Gmail's Promotions tab can.
  // The tab also beats the sender's domain: Microsoft 365's Copilot ad is an
  // ad, not Work, and Amazon's deals are not an order. A publisher's
  // newsletter stays a newsletter.
  if (promotion && (kind === "newsletter" || kind === "other")) return byCategory === "newsletter" ? "newsletter" : "promotions";
  // An unsubscribe link only says "list mail"; a sender we know (a bank, a
  // school, an airline) says more. LIC's premium reminder is Finance, not news.
  if (kind === "newsletter" && byCategory) return byCategory;
  // Gmail's Social tab is a social network's mail; a subject that only sounds
  // social ("Jane commented") from an unknown sender outside it is not.
  if (hints.tab === "social" && (kind === "newsletter" || kind === "other")) return byCategory ?? "social";
  if (kind === "social" && !byCategory && hints.tab !== undefined && hints.tab !== "social") return null;
  // Typed in a person's mail app at a company we don't know: "Question about
  // the invoice" from a colleague is a conversation, not a receipt.
  if (hints.sentBy === "person-app" && !byCategory) return null;
  // A bank's statement or a hotel's booking belongs with the company, not in
  // Receipts: the sender's own category is the stronger signal (Grbovic et
  // al., CIKM 2014). Codes, account notices and shipping keep their label.
  if ((kind === "receipt" || kind === "statement") && (byCategory === "finance" || byCategory === "travel")) return byCategory;
  // "Jane commented on Q4 plan" from GitHub or Google Docs is work, not social.
  if (kind === "social" && byCategory === "productivity") return byCategory;
  return KIND_BUCKET[kind] ?? byCategory ?? null;
}

/** A user's correction for one sender: force a bucket, file them under
 * Personal, or never sort them. */
export type SortOverride = "never" | "personal" | SortBucket;

/** Kinds a correction can be scoped to: each has subject phrases a Gmail
 * filter can match (KIND_PHRASES in categoryQueries.ts). */
export const SCOPED_KINDS: readonly MessageKind[] = ["otp", "accounts", "shipping", "receipt", "social", "jobs"];

/** The override key for one kind of a sender's mail ("ship@amazon.com|receipt"),
 * so fixing a store's receipts leaves its ads alone (Wendt et al., WSDM 2016). */
export function kindKey(key: string, kind: MessageKind): string {
  return `${key}|${kind}`;
}

/** The user's correction for this sender, if any: for this mailbox (any
 * spelling, or as older builds saved it), then its address pattern
 * (bounce-*@host), then the domain ("@host"). With a kind, a correction for
 * that kind of the sender's mail comes first. */
export function overrideFor(
  senderAddress: string,
  senderDomain: string,
  overrides: Record<string, SortOverride>,
  kind?: MessageKind,
): SortOverride | undefined {
  const pattern = senderPattern(senderAddress);
  const keys = [canonicalAddress(senderAddress), senderAddress.toLowerCase(), pattern, `@${senderDomain.toLowerCase()}`];
  for (const scoped of kind ? [true, false] : [false]) {
    for (const k of keys) {
      const o = k ? overrides[scoped ? kindKey(k, kind!) : k] : undefined;
      if (o) return o;
    }
  }
  return undefined;
}

/**
 * classifySortBucket, but a per-sender override (from a "wrong bucket?"
 * correction in the preview) wins first: `"never"` drops the sender from
 * sorting entirely, a bucket name forces that bucket. Keyed by lowercased
 * from-address.
 */
export function effectiveBucket(
  kind: MessageKind,
  senderDomain: string,
  senderAddress: string,
  overrides: Record<string, SortOverride>,
  promotion = false,
  hints: SortHints = {},
): SortBucket | null {
  const override = overrideFor(senderAddress, senderDomain, overrides, kind);
  // Personal isn't a label bucket: the unsorted pass files it.
  if (override === "never" || override === "personal") return null;
  if (override) return override;
  return classifySortBucket(kind, senderDomain, promotion, senderAddress, hints);
}

/** The sender's category, or, when its From domain is on no list, the
 * category of a domain that signed the mail (Gmail checked the signature). */
export function senderCategory(senderDomain: string, dkimDomains: readonly string[] = []): DomainCategory {
  const own = categorizeDomain(senderDomain);
  if (own !== "other") return own;
  for (const d of dkimDomains) {
    const signed = categorizeDomain(d);
    if (signed !== "other") return signed;
  }
  return own;
}
