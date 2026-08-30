// The bucket set for "Sort my inbox": the transactional message kinds
// (messageKind.ts, judged from the subject) unioned with the domain
// categories (domainCategories.ts, judged from the sender domain). When both
// apply, the kind wins -- "your order shipped" from amazon.com is an
// order-update, not just "Shopping".
import { categorizeDomain, type DomainCategory } from "./domainCategories";
import type { MessageKind } from "./messageKind";

export type SortBucket =
  | "otp"
  | "receipt"
  | "shipping"
  | "newsletter"
  | "social"
  | "shopping"
  | "travel"
  | "finance"
  | "productivity"
  | "education";

export const SORT_BUCKET_LABELS: Record<SortBucket, string> = {
  otp: "One-time codes",
  receipt: "Receipts & invoices",
  shipping: "Order & shipping updates",
  newsletter: "Newsletters",
  social: "Social",
  shopping: "Shopping",
  travel: "Travel",
  finance: "Finance",
  productivity: "Productivity",
  education: "Education",
};

/** The Gmail / Outlook label a bucket's mail is filed under. */
export function bucketLabelName(bucket: SortBucket): string {
  return `Cluster/${SORT_BUCKET_LABELS[bucket]}`;
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
  shopping: false,
  travel: false,
  finance: false,
  productivity: false,
  education: false,
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
 * Kind takes priority.
 */
export function classifySortBucket(kind: MessageKind, senderDomain: string): SortBucket | null {
  const byKind = KIND_BUCKET[kind];
  if (byKind) return byKind;
  return CATEGORY_BUCKET[categorizeDomain(senderDomain)] ?? null;
}
