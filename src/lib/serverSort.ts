// Server-side "keep sorting": for the domain-category buckets, Cluster can push
// a real Gmail filter so new mail is filed at delivery, with the browser shut,
// instead of only on the 6-hourly client sweep. Pure — the dashboard turns
// these specs into Users.settings.filters calls (gmailApi.createFilter).
//
// Only the seven domain-category buckets qualify: a Gmail filter matches on
// `from:` (and other headers), which can't express the subject-regex "kind"
// buckets (otp / receipt / shipping / newsletter / social). Those stay on the
// client rule sweep.
import { domainsForCategory, type DomainCategory } from "./domainCategories";
import type { GmailFilterAction, GmailFilterCriteria } from "./gmailApi";
import type { SortBucket, SortOverride } from "./sortTaxonomy";

export const SERVER_SORT_BUCKETS: SortBucket[] = [
  "shopping",
  "travel",
  "finance",
  "social",
  "newsletter",
  "productivity",
  "education",
];

export function isServerSortBucket(bucket: SortBucket): boolean {
  return SERVER_SORT_BUCKETS.includes(bucket);
}

export interface BucketMatchTerms {
  /** Curated domains for the category + addresses the user redirected INTO it. */
  include: string[];
  /** Addresses the user set to "never" or redirected to a different bucket —
   * negated so this bucket's filter skips them. Whole-domain "never" isn't
   * expressible here (the preview + client sweep still honour it). */
  exclude: string[];
}

export function bucketMatchTerms(
  bucket: SortBucket,
  overrides: Record<string, SortOverride>,
): BucketMatchTerms {
  const include = new Set(domainsForCategory(bucket as DomainCategory));
  const exclude = new Set<string>();
  for (const [rawAddr, target] of Object.entries(overrides)) {
    const addr = rawAddr.toLowerCase().trim();
    if (!addr) continue;
    if (target === bucket) include.add(addr);
    else exclude.add(addr); // "never", or another bucket
  }
  // An address explicitly redirected in wins over a same-address exclude.
  for (const a of include) exclude.delete(a);
  return { include: [...include], exclude: [...exclude] };
}

export interface BucketFilterSpec {
  criteria: GmailFilterCriteria;
  action: GmailFilterAction;
}

/**
 * The Gmail filter for one domain-category bucket, or null when there's
 * nothing to match. `fileOut` also strips INBOX at delivery.
 */
export function buildBucketFilter(
  labelId: string,
  fileOut: boolean,
  terms: BucketMatchTerms,
): BucketFilterSpec | null {
  if (terms.include.length === 0) return null;
  const ors = terms.include.join(" OR ");
  const from =
    terms.exclude.length > 0
      ? `(${ors}) ${terms.exclude.map((a) => `-${a}`).join(" ")}`
      : ors;
  return {
    criteria: { from },
    action: {
      addLabelIds: [labelId],
      removeLabelIds: fileOut ? ["INBOX"] : [],
    },
  };
}
