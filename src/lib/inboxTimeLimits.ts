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
import { neverMove } from "./protectionPolicy";
import type { SenderSummary } from "./senderModel";
import { effectiveBucket, type SortBucket, type SortOverride } from "./sortTaxonomy";
import { riskTier, senderRiskScore } from "./threatSignals";

const HOUR_MS = 60 * 60 * 1000;
/** How far back the tagger looks for unlabelled inbox mail. */
const TAG_WINDOW = "newer_than:2d";
const TAG_MAX = 100;

/** Mail carrying none of Cluster's labels. Gmail's has:nouserlabels matched
 * nothing on a real account (Nov 2026), so the tagger silently stopped. */
export function withoutClusterLabels(limits: CategoryLimit[]): string {
  return limits.map((l) => `-label:"${l.labelName.replace(/"/g, "")}"`).join(" ");
}
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
  /** Oldest message read, or null when there was nothing to read. */
  oldestAt: number | null;
  /** Ids Gmail listed, read or not. */
  listed: number;
}

/** Which label each message belongs under. Mail that must stay put (known or
 * risky senders, starred, never-move) and mail that fits no label is left out. */
export function bucketsFor(senders: SenderSummary[], ctx: LimitContext): Map<SortBucket, string[]> {
  const wanted = new Set(ctx.limits.map((l) => l.bucket));
  const groups = new Map<SortBucket, string[]>();
  for (const sender of senders) {
    if (skipSender(sender, ctx.known)) continue;
    const domain = domainOf(sender.address);
    for (const msg of sender.messages) {
      if (msg.isProtected || neverMove(msg, sender.address)) continue;
      const bucket = effectiveBucket(msg.kind, domain, sender.address, ctx.overrides, msg.promotion);
      if (!bucket || !wanted.has(bucket)) continue;
      const list = groups.get(bucket) ?? [];
      list.push(msg.id);
      groups.set(bucket, list);
    }
  }
  return groups;
}

export async function tagUntaggedInbox(
  ctx: LimitContext,
  api: InboxLimitsApi,
  query = `${TAG_WINDOW} ${withoutClusterLabels(ctx.limits)}`,
): Promise<TagResult> {
  const ids = await api.listIds(["INBOX"], query, TAG_MAX);
  if (ids.length === 0) return { tagged: 0, byBucket: {}, oldestAt: null, listed: 0 };
  const wanted = new Map(ctx.limits.map((l) => [l.bucket, l]));
  const senders = await api.readSenders(ids);
  let oldestAt: number | null = null;
  for (const sender of senders) {
    for (const msg of sender.messages) oldestAt = Math.min(oldestAt ?? msg.receivedAt, msg.receivedAt);
  }
  const groups = bucketsFor(senders, ctx);
  const byBucket: TagResult["byBucket"] = {};
  let tagged = 0;
  for (const [bucket, msgIds] of groups) {
    const labelId = await api.ensureLabelId(wanted.get(bucket)!.labelName);
    await api.batchModify(msgIds, [labelId], []);
    byBucket[bucket] = msgIds.length;
    tagged += msgIds.length;
  }
  return { tagged, byBucket, oldestAt, listed: ids.length };
}

export interface IndexedInboxRow {
  id: string;
  labelIds: readonly string[];
}

export interface RelabelResult {
  /** Messages that gained their label. */
  labelled: number;
  /** Messages that lost a wrong Cluster label. */
  fixed: number;
  /** Every message that belongs under each label, already right or not. */
  byBucket: Partial<Record<SortBucket, number>>;
  /** Label ids added and removed, per message, so the index can be patched. */
  changes: Map<string, { add: string[]; remove: string[] }>;
}

/**
 * Labels inbox mail the mail index already read, and swaps a wrong Cluster
 * label for the right one. `api.readSenders` is index-seeded in the runner,
 * so no message is fetched again. Mail that fits no label keeps what it has.
 */
export async function labelFromIndex(
  ctx: LimitContext,
  api: InboxLimitsApi,
  inbox: readonly IndexedInboxRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<RelabelResult> {
  const result: RelabelResult = { labelled: 0, fixed: 0, byBucket: {}, changes: new Map() };
  if (inbox.length === 0) return result;
  const groups = bucketsFor(await api.readSenders(inbox.map((r) => r.id)), ctx);
  const labelsOf = new Map(inbox.map((r) => [r.id, r.labelIds]));
  const existing = new Map<SortBucket, string>();
  for (const limit of ctx.limits) {
    const id = await api.findLabelId(limit.labelName);
    if (id) existing.set(limit.bucket, id);
  }
  const note = (id: string, field: "add" | "remove", labelId: string) => {
    const change = result.changes.get(id) ?? { add: [], remove: [] };
    change[field].push(labelId);
    result.changes.set(id, change);
  };
  const total = [...groups.values()].reduce((n, ids) => n + ids.length, 0);
  let done = 0;
  for (const [bucket, ids] of groups) {
    result.byBucket[bucket] = ids.length;
    const labelId = existing.get(bucket) ?? (await api.ensureLabelId(ctx.limits.find((l) => l.bucket === bucket)!.labelName));
    const missing = ids.filter((id) => !labelsOf.get(id)?.includes(labelId));
    if (missing.length > 0) await api.batchModify(missing, [labelId], []);
    for (const id of missing) note(id, "add", labelId);
    result.labelled += missing.length;
    // Other Cluster labels on this mail are wrong now.
    for (const [other, otherId] of existing) {
      if (other === bucket) continue;
      const wrong = ids.filter((id) => labelsOf.get(id)?.includes(otherId));
      if (wrong.length === 0) continue;
      await api.batchModify(wrong, [], [otherId]);
      for (const id of wrong) note(id, "remove", otherId);
      result.fixed += wrong.length;
    }
    done += ids.length;
    onProgress?.(done, total);
  }
  return result;
}

/** Where the catch-up pass stands: -3 = done, else it reads inbox mail
 * received before this time (ms) next. -1 and -2 were older "done" values
 * (the has:nouserlabels bug, then before Accounts and Jobs), so those
 * accounts start over. */
export const TAG_BACK_DONE = -3;

/**
 * Labels older inbox mail no filter or tagger saw, one page per run, newest
 * first, walking back by date. Returns where the next run starts.
 * shortcut: mail sharing the page's oldest second is skipped; fine for a
 * one-time catch-up.
 */
export async function tagOlderInbox(
  ctx: LimitContext,
  api: InboxLimitsApi,
  before: number,
): Promise<{ tagged: number; nextBefore: number }> {
  const from = before > 0 ? before : ctx.now - 2 * 24 * HOUR_MS;
  const res = await tagUntaggedInbox(ctx, api, `before:${epochSeconds(from)} ${withoutClusterLabels(ctx.limits)}`);
  // Done only when Gmail listed nothing older; a failed read retries next run.
  if (res.listed === 0) return { tagged: res.tagged, nextBefore: TAG_BACK_DONE };
  if (res.oldestAt === null) return { tagged: res.tagged, nextBefore: before };
  return { tagged: res.tagged, nextBefore: res.oldestAt >= from ? TAG_BACK_DONE : res.oldestAt };
}

/** Hours unsorted mail stays in the inbox before it's held for review. */
export const HOLD_UNSORTED_HOURS = 3;
const HOLD_MAX = 100;
// Calendar invites and replies to them are people arranging something.
const CALENDAR_RE = /^(updated )?invitation:|^(accepted|declined|tentatively accepted|new event|canceled event|cancelled event):/i;

/**
 * Moves inbox mail that fits no label into `holdLabelName` (the Screener) for
 * the user to review: nothing is deleted, and Gmail's spam filter learns
 * nothing. Starred, important or Primary-tab mail, mail from anyone known,
 * replies, personal addresses, calendar invites and risky senders (the scam
 * hold's job) all stay.
 * shortcut: only the last 14 days are looked at, so an older unsorted
 * backlog stays put; widen once the catch-up tagger has finished.
 */
export async function holdUnsortedInbox(
  ctx: LimitContext,
  api: InboxLimitsApi,
  holdLabelName: string,
): Promise<{ heldIds: string[]; senders: string[] }> {
  const cutoff = epochSeconds(ctx.now - HOLD_UNSORTED_HOURS * HOUR_MS);
  const query = `before:${cutoff} newer_than:14d -is:starred -is:important -category:primary -label:"${holdLabelName}" ${withoutClusterLabels(ctx.limits)}`;
  const ids = await api.listIds(["INBOX"], query, HOLD_MAX);
  if (ids.length === 0) return { heldIds: [], senders: [] };
  const heldIds: string[] = [];
  const senders = new Set<string>();
  for (const sender of await api.readSenders(ids)) {
    if (skipSender(sender, ctx.known)) continue;
    const domain = domainOf(sender.address);
    for (const msg of sender.messages) {
      if (msg.isProtected || msg.providerMarkedPersonal || msg.repliesToYou || neverMove(msg, sender.address)) continue;
      if (CALENDAR_RE.test(msg.subject ?? "")) continue;
      // The tagger will label it; it just hasn't yet.
      if (effectiveBucket(msg.kind, domain, sender.address, ctx.overrides, msg.promotion)) continue;
      heldIds.push(msg.id);
      senders.add(sender.address.toLowerCase());
    }
  }
  if (heldIds.length > 0) await api.batchModify(heldIds, [await api.ensureLabelId(holdLabelName)], ["INBOX"]);
  return { heldIds, senders: [...senders] };
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
    for (const msg of sender.messages) (skip || msg.isProtected || neverMove(msg, sender.address) ? keptIds : movedIds).push(msg.id);
  }
  if (movedIds.length > 0) await api.batchModify(movedIds, [], ["INBOX"]);
  return { movedIds, keptIds, more: candidates.length > batch.length };
}
