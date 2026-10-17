// The bucket set for "Sort my inbox": the transactional message kinds
// (messageKind.ts, judged from the subject) unioned with the domain
// categories (domainCategories.ts, judged from the sender domain). When both
// apply, the kind wins -- "your order shipped" from amazon.com is an
// order-update, not just "Shopping".
import { categorizeDomain, type DomainCategory } from "./domainCategories";
import type { MessageKind } from "./messageKind";
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
  | "education";

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
};

const HOUR = 1;
const DAY = 24 * HOUR;

/** How long each category's new mail stays in the inbox before the time
 * sweep moves it into its label. 0 = straight to the label on arrival;
 * null = stays in the inbox (labelled only). */
export const DEFAULT_INBOX_HOURS: Record<SortBucket, number | null> = {
  otp: 1 * DAY,
  receipt: 7 * DAY,
  shipping: 7 * DAY,
  newsletter: 3 * DAY,
  social: 2 * DAY,
  promotions: 1 * DAY,
  shopping: 3 * DAY,
  travel: null,
  finance: null,
  productivity: null,
  education: null,
};

export const ALL_SORT_BUCKETS: SortBucket[] = Object.keys(SORT_BUCKET_LABELS) as SortBucket[];

const KIND_BUCKET: Partial<Record<MessageKind, SortBucket>> = {
  otp: "otp",
  receipt: "receipt",
  shipping: "shipping",
  newsletter: "newsletter",
  social: "social",
};

const CATEGORY_BUCKET: Partial<Record<DomainCategory, SortBucket>> = {
  shopping: "shopping",
  travel: "travel",
  finance: "finance",
  social: "social",
  newsletter: "newsletter",
  productivity: "productivity",
  education: "education",
};

/**
 * The bucket a message belongs in, or null if neither its kind nor its
 * sender's domain category is specific enough (both fell through to "other").
 * Kind takes priority, then the sender's category, then Gmail's own
 * Promotions tab as the catch-all for ads.
 */
export function classifySortBucket(kind: MessageKind, senderDomain: string, promotion = false): SortBucket | null {
  const byKind = KIND_BUCKET[kind];
  if (byKind) return byKind;
  const byCategory = CATEGORY_BUCKET[categorizeDomain(senderDomain)];
  if (byCategory) return byCategory;
  return promotion ? "promotions" : null;
}

/** A user's correction for one sender: force a bucket, or never sort them. */
export type SortOverride = "never" | SortBucket;

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
): SortBucket | null {
  const override = overrides[senderAddress.toLowerCase()];
  if (override === "never") return null;
  if (override) return override;
  return classifySortBucket(kind, senderDomain, promotion);
}
