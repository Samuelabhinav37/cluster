// "Sort my inbox": turn a scan into a per-bucket plan of which message ids to
// label (and whether to also file them out of the inbox). Pure and
// metadata-only -- it reads each message's already-computed kind and the
// sender's domain, nothing else. Starred/flagged mail is never included.
import { resolveLabelName } from "./labelResolver";
import { decideAll, sortLabelOf, type EngineContext } from "./mailEngine";
import { protectionDecision } from "./protectionPolicy";
import type { ProviderId } from "./providers/emailProvider";
import type { SenderSummary } from "./senderModel";
import { senderFailedAuthentication } from "./verdict";
import {
  bucketLabelName,
  DEFAULT_FILE_OUT_OF_INBOX,
  type SortBucket,
} from "./sortTaxonomy";

/** One message in a sort plan — enough for the preview to show a row and for
 * the user to opt it out without a reverse lookup into the scan. */
export interface SortPlanMessage {
  id: string;
  provider: ProviderId;
  address: string;
  displayName: string;
  subject: string;
  receivedAt: number;
  /** True when filing this message out of the inbox would hide a
   * sensitive-looking subject (boarding pass, password reset, …). Advisory —
   * the preview surfaces it, it isn't auto-excluded. */
  sensitiveWhenFiled: boolean;
}

export interface SortPlanEntry {
  bucket: SortBucket;
  /** The label to apply, e.g. "Shopping". */
  label: string;
  /** Also remove INBOX when applying (vs. label in place). */
  fileOut: boolean;
  count: number;
  idsByProvider: Map<ProviderId, string[]>;
  /** Every message in this bucket, biggest-sender-first then newest-first. */
  messages: SortPlanMessage[];
}

/**
 * One entry per non-empty bucket, biggest first. `fileOutByBucket` overrides
 * the per-bucket default from the taxonomy; anything not listed uses the
 * default. Each message goes where the engine places it (mailEngine.decide:
 * corrections, rules, the sender's usual label), the same label the
 * background gives it, so the daily relabel never undoes a sort.
 */
export function buildSortPlan(
  senders: SenderSummary[],
  fileOutByBucket: Partial<Record<SortBucket, boolean>> = {},
  ctx: EngineContext = { wrote: new Set(), letIn: new Set(), overrides: {} },
): SortPlanEntry[] {
  const byBucket = new Map<SortBucket, SortPlanEntry>();
  const decided = decideAll(senders, ctx);

  for (const sender of senders) {
    // Trust first: mail that may not be from who it says never gets a normal
    // label, so a fake "Amazon" order can't land in Shopping. It stays in the
    // inbox for Protect to warn about or hold. (The engine already skips
    // senders its scam verdict flags.)
    if (senderFailedAuthentication(sender)) continue;
    for (const msg of sender.messages) {
      const bucket = sortLabelOf(decided.get(msg.id));
      if (!bucket) continue;

      let entry = byBucket.get(bucket);
      if (!entry) {
        entry = {
          bucket,
          label: bucketLabelName(bucket),
          fileOut: fileOutByBucket[bucket] ?? DEFAULT_FILE_OUT_OF_INBOX[bucket],
          count: 0,
          idsByProvider: new Map(),
          messages: [],
        };
        byBucket.set(bucket, entry);
      }
      entry.count += 1;
      const list = entry.idsByProvider.get(sender.provider) ?? [];
      list.push(msg.id);
      entry.idsByProvider.set(sender.provider, list);
      const sensitive = protectionDecision(msg);
      entry.messages.push({
        id: msg.id,
        provider: sender.provider,
        address: sender.address,
        displayName: sender.displayName,
        subject: msg.subject ?? "",
        receivedAt: msg.receivedAt,
        sensitiveWhenFiled: sensitive.protected && sensitive.reason === "sensitive-subject",
      });
    }
  }

  for (const entry of byBucket.values()) {
    const perSender = new Map<string, number>();
    for (const m of entry.messages) perSender.set(m.address, (perSender.get(m.address) ?? 0) + 1);
    entry.messages.sort(
      (a, b) =>
        (perSender.get(b.address) ?? 0) - (perSender.get(a.address) ?? 0) ||
        a.address.localeCompare(b.address) ||
        b.receivedAt - a.receivedAt,
    );
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
