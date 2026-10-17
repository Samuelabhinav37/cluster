// Inbox time limits. Gmail filters (categoryFilters.ts) label each
// category's mail on arrival and leave it in the inbox; this module does the
// two things a filter can't:
//
// - tagUntaggedInbox: label recent inbox mail no filter caught (most
//   newsletters, found by their List-Unsubscribe header, and anything the
//   client classifier knows that a subject phrase didn't);
// - sweepExpiredInbox: once a category's time limit has passed, move its
//   mail out of the inbox into the label. Nothing is deleted.
//
// Mail that carries several Cluster labels leaves only when every one of
// them has run out ("stays in inbox" wins). Starred mail, mail from people
// the user writes to, and senders that look like phishing always stay.
import { domainOf } from "./domainGrouping";
import type { SenderSummary } from "./senderModel";
import { effectiveBucket, type SortBucket, type SortOverride } from "./sortTaxonomy";
import { riskTier, senderRiskScore } from "./threatSignals";

const HOUR_MS = 60 * 60 * 1000;
/** How far back the tagger looks for unlabelled inbox mail. */
const TAG_WINDOW = "newer_than:2d";
const TAG_MAX = 100;
/** Messages moved per sweep; the rest wait for the next run (each needs a
 * metadata read, 20 quota units). */
export const SWEEP_MAX = 300;
const LIST_MAX = 5000;

export interface CategoryLimit {
  bucket: SortBucket;
  labelName: string;
  /** null = stays in the inbox. */
  hours: number | null;
}

export interface InboxLimitsApi {
  /** An existing label's id, or null when the label doesn't exist yet. */
  findLabelId(name: string): Promise<string | null>;
  ensureLabelId(name: string): Promise<string>;
  /** Ids of messages carrying every one of `labelIds` and matching `query`. */
  listIds(labelIds: string[], query: string, max: number): Promise<string[]>;
  /** Sender summaries (with metadata) for these message ids. */
  readSenders(ids: string[]): Promise<SenderSummary[]>;
  batchModify(ids: string[], add: string[], remove: string[]): Promise<void>;
}

export interface LimitContext {
  limits: CategoryLimit[];
  known: Set<string>;
  overrides: Record<string, SortOverride>;
  now: number;
  /** Messages an earlier sweep already decided to keep (see SweepResult). */
  keptIds?: Set<string>;
}

function epochSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

/** Senders whose mail must never be moved or auto-labelled. */
function skipSender(sender: SenderSummary, known: Set<string>): boolean {
  return known.has(sender.address.toLowerCase()) || riskTier(senderRiskScore(sender.threatSignals)) === "high";
}

/** Ids the sweep must leave in the inbox, newest last and capped: mail it
 * already decided to keep, plus anything the user put back with Undo (which
 * would otherwise be past its limit and moved out again on the next run). */
export const KEPT_IDS_CAP = 2000;

export function pinInInbox(keptIds: string[], ids: string[]): string[] {
  const added = new Set(ids);
  return [...keptIds.filter((id) => !added.has(id)), ...ids].slice(-KEPT_IDS_CAP);
}

export interface TagResult {
  tagged: number;
  byBucket: Partial<Record<SortBucket, number>>;
}

export async function tagUntaggedInbox(ctx: LimitContext, api: InboxLimitsApi): Promise<TagResult> {
  const ids = await api.listIds(["INBOX"], `${TAG_WINDOW} has:nouserlabels`, TAG_MAX);
  if (ids.length === 0) return { tagged: 0, byBucket: {} };
  const wanted = new Map(ctx.limits.map((l) => [l.bucket, l]));
  const groups = new Map<SortBucket, string[]>();
  for (const sender of await api.readSenders(ids)) {
    if (skipSender(sender, ctx.known)) continue;
    const domain = domainOf(sender.address);
    for (const msg of sender.messages) {
      if (msg.isProtected) continue;
      const bucket = effectiveBucket(msg.kind, domain, sender.address, ctx.overrides, msg.promotion);
      if (!bucket || !wanted.has(bucket)) continue;
      const list = groups.get(bucket) ?? [];
      list.push(msg.id);
      groups.set(bucket, list);
    }
  }
  const byBucket: TagResult["byBucket"] = {};
  let tagged = 0;
  for (const [bucket, msgIds] of groups) {
    const labelId = await api.ensureLabelId(wanted.get(bucket)!.labelName);
    await api.batchModify(msgIds, [labelId], []);
    byBucket[bucket] = msgIds.length;
    tagged += msgIds.length;
  }
  return { tagged, byBucket };
}

export interface SweepResult {
  movedIds: string[];
  /** Past their limit but kept: starred since, a known person, or risky.
   * The caller remembers these so later sweeps don't re-read them. */
  keptIds: string[];
  /** More were due than one run moves; the next run continues. */
  more: boolean;
}

/**
 * Which inbox messages are past every Cluster label's limit. `due[b]` holds
 * inbox mail in category b received before b's cutoff; `notYet[b]` holds the
 * rest of b's inbox mail (all of it for a category that stays in the inbox).
 * A message leaves only if it's due somewhere and not-yet nowhere.
 */
export function dueForMove(due: Map<SortBucket, string[]>, notYet: Map<SortBucket, string[]>): string[] {
  const blocked = new Set([...notYet.values()].flat());
  const out = new Set<string>();
  for (const ids of due.values()) for (const id of ids) if (!blocked.has(id)) out.add(id);
  return [...out];
}

export async function sweepExpiredInbox(ctx: LimitContext, api: InboxLimitsApi): Promise<SweepResult> {
  const due = new Map<SortBucket, string[]>();
  const notYet = new Map<SortBucket, string[]>();
  for (const limit of ctx.limits) {
    const labelId = await api.findLabelId(limit.labelName);
    if (!labelId) continue;
    const both = ["INBOX", labelId];
    if (limit.hours === null) {
      notYet.set(limit.bucket, await api.listIds(both, "", LIST_MAX));
      continue;
    }
    const cutoff = epochSeconds(ctx.now - limit.hours * HOUR_MS);
    due.set(limit.bucket, await api.listIds(both, `before:${cutoff} -is:starred`, LIST_MAX));
    notYet.set(limit.bucket, await api.listIds(both, `after:${cutoff}`, LIST_MAX));
  }

  const candidates = dueForMove(due, notYet).filter((id) => !ctx.keptIds?.has(id));
  const batch = candidates.slice(0, SWEEP_MAX);
  if (batch.length === 0) return { movedIds: [], keptIds: [], more: false };

  const movedIds: string[] = [];
  const keptIds: string[] = [];
  for (const sender of await api.readSenders(batch)) {
    const skip = skipSender(sender, ctx.known);
    for (const msg of sender.messages) (skip || msg.isProtected ? keptIds : movedIds).push(msg.id);
  }
  if (movedIds.length > 0) await api.batchModify(movedIds, [], ["INBOX"]);
  return { movedIds, keptIds, more: candidates.length > batch.length };
}
