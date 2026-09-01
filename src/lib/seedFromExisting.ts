// First-run helper: look at what the user has already set up in Gmail and offer
// to reuse it, so "Sort my inbox" doesn't fight their own organisation.
// - a label they already made that matches a bucket name → offer to reuse it
//   instead of creating "<name> (Cluster)";
// - a sender/domain they already filter themselves → offer to leave it alone
//   (a "never" sort override).
// Pure — the dashboard does the Gmail reads (listLabelNames, listFilters) and
// the settings writes.
import type { GmailFilterResource } from "./gmailApi";
import type { SortOverride } from "./sortTaxonomy";

export interface LabelReuseCandidate {
  /** The flat bucket label Cluster would otherwise create, e.g. "Shopping". */
  bucketLabel: string;
  /** The user's own label with that name (original casing). */
  existing: string;
}

const SYSTEM_LABELS = new Set([
  "inbox",
  "sent",
  "draft",
  "drafts",
  "spam",
  "trash",
  "starred",
  "important",
  "unread",
  "chats",
  "scheduled",
  "snoozed",
  "all mail",
  "categories",
]);

/**
 * Bucket labels that collide by name with a label already in the mailbox that
 * Cluster didn't create.
 */
export function findLabelReuseCandidates(
  bucketLabels: string[],
  userLabelNames: string[],
  clusterOwnedLabels: string[],
): LabelReuseCandidate[] {
  const owned = new Set(clusterOwnedLabels.map((n) => n.toLowerCase()));
  const byLower = new Map<string, string>();
  for (const name of userLabelNames) {
    const lower = name.toLowerCase();
    if (SYSTEM_LABELS.has(lower) || lower.startsWith("category_")) continue;
    if (!byLower.has(lower)) byLower.set(lower, name);
  }
  const out: LabelReuseCandidate[] = [];
  for (const bucketLabel of bucketLabels) {
    const lower = bucketLabel.toLowerCase();
    const existing = byLower.get(lower);
    if (existing && !owned.has(lower)) out.push({ bucketLabel, existing });
  }
  return out;
}

/**
 * Sender addresses / domains the user already routes with their own Gmail
 * filters — candidates to leave out of sorting. Only `from:` criteria that
 * look like a single address or bare domain are taken (a complex query is
 * skipped rather than guessed at).
 */
export function filteredFromTargets(filters: GmailFilterResource[]): string[] {
  const out = new Set<string>();
  for (const f of filters) {
    const from = f.criteria?.from?.trim().toLowerCase();
    if (!from) continue;
    if (/[()"]| or | -/i.test(from)) continue; // compound query — don't guess
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from) || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(from)) {
      out.add(from);
    }
  }
  return [...out];
}

/** Turn accepted "skip these" targets into sort-override entries. */
export function skipOverridesFor(targets: string[]): Record<string, SortOverride> {
  const next: Record<string, SortOverride> = {};
  for (const t of targets) next[t.toLowerCase()] = "never";
  return next;
}
