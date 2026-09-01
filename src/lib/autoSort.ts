// "Sort my inbox": turn a scan into a per-bucket plan of which message ids to
// label (and whether to also file them out of the inbox). Pure and
// metadata-only -- it reads each message's already-computed kind and the
// sender's domain, nothing else. Starred/flagged mail is never included.
import { domainOf } from "./domainGrouping";
import { resolveLabelName } from "./labelResolver";
import type { ProviderId } from "./providers/emailProvider";
import type { SenderSummary } from "./senderModel";
import {
  bucketLabelName,
  classifySortBucket,
  DEFAULT_FILE_OUT_OF_INBOX,
  type SortBucket,
} from "./sortTaxonomy";

export interface SortPlanEntry {
  bucket: SortBucket;
  /** The label to apply, e.g. "Shopping". */
  label: string;
  /** Also remove INBOX when applying (vs. label in place). */
  fileOut: boolean;
  count: number;
  idsByProvider: Map<ProviderId, string[]>;
}

/**
 * One entry per non-empty bucket, biggest first. `fileOutByBucket` overrides
 * the per-bucket default from the taxonomy; anything not listed uses the
 * default.
 */
export function buildSortPlan(
  senders: SenderSummary[],
  fileOutByBucket: Partial<Record<SortBucket, boolean>> = {},
): SortPlanEntry[] {
  const byBucket = new Map<SortBucket, SortPlanEntry>();

  for (const sender of senders) {
    const domain = domainOf(sender.address);
    for (const msg of sender.messages) {
      if (msg.isProtected) continue;
      const bucket = classifySortBucket(msg.kind, domain);
      if (!bucket) continue;

      let entry = byBucket.get(bucket);
      if (!entry) {
        entry = {
          bucket,
          label: bucketLabelName(bucket),
          fileOut: fileOutByBucket[bucket] ?? DEFAULT_FILE_OUT_OF_INBOX[bucket],
          count: 0,
          idsByProvider: new Map(),
        };
        byBucket.set(bucket, entry);
      }
      entry.count += 1;
      const list = entry.idsByProvider.get(sender.provider) ?? [];
      list.push(msg.id);
      entry.idsByProvider.set(sender.provider, list);
    }
  }

  return [...byBucket.values()].sort((a, b) => b.count - a.count);
}

export function totalPlanCount(plan: SortPlanEntry[]): number {
  return plan.reduce((sum, e) => sum + e.count, 0);
}

export interface PlanLabelConflict {
  bucket: SortBucket;
  /** The flat name Cluster wants (e.g. "Shopping"). */
  desired: string;
  /** The user's own label that already has that name. */
  existingUserLabel: string;
}

/**
 * Rewrite each entry's `label` to the name Cluster should actually use, given
 * the labels already in the mailbox and the user's past collision choices.
 * Entries whose name still clashes with a user-made label are left with the
 * desired name and reported in `conflicts` for the UI to resolve.
 */
export function resolvePlanLabels(
  plan: SortPlanEntry[],
  existingLabelNames: string[],
  ownedLabels: string[],
  labelChoices: Record<string, string>,
): { plan: SortPlanEntry[]; conflicts: PlanLabelConflict[] } {
  const conflicts: PlanLabelConflict[] = [];
  const resolved = plan.map((entry) => {
    const res = resolveLabelName(entry.label, existingLabelNames, ownedLabels, labelChoices);
    if ("conflict" in res) {
      conflicts.push({
        bucket: entry.bucket,
        desired: res.conflict.desired,
        existingUserLabel: res.conflict.existingUserLabel,
      });
      return entry;
    }
    return { ...entry, label: res.name };
  });
  return { plan: resolved, conflicts };
}
