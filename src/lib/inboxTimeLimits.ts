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
// them has run out ("stays in inbox" wins). A person's own note and senders
// that look like phishing always stay; starred mail leaves and keeps its star.
import { domainOf } from "./domainGrouping";
import { isFreeMailDomain, isRoleAddress } from "./freeMail";
import { neverMove } from "./protectionPolicy";
import type { MessageRecord, SenderSummary } from "./senderModel";
import { isMailboxName } from "./nameMatch";
import { effectiveBucket, overrideFor, senderCategory, type SortBucket, type SortOverride } from "./sortTaxonomy";
import { senderVerdict, type VerdictTier } from "./verdict";

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
  /** "Hold people too": strangers on free mail wait in the Screener. Default on. */
  holdPeople?: boolean;
}

function epochSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

/** Senders whose mail must never be moved or auto-labelled. */
function skipSender(sender: SenderSummary, known: Set<string>): boolean {
  return known.has(sender.address.toLowerCase()) || scamTier(sender, known) !== "none";
}

/** The scam hold's own verdict, so every pass agrees on what's risky. "hold"
 * is the hold's to move (to Spam); "warn" is never labelled or filed as
 * Personal, it goes to the Screener for a look. A raw score used to say
 * "high" where the verdict didn't hold, and that mail sat in the inbox. */
function scamTier(sender: SenderSummary, known: Set<string>): VerdictTier {
  return senderVerdict(sender, { knownCorrespondent: known.has(sender.address) }).tier;
}

function isBucket(o: SortOverride | undefined): o is SortBucket {
  return o !== undefined && o !== "never" && o !== "personal";
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
 * risky senders, starred, never-move) and mail that fits no label is left out,
 * unless the user filed the sender under a label themselves: their
 * correction beats "you've written to them" (a recruiter you replied to). */
export function bucketsFor(senders: SenderSummary[], ctx: LimitContext): Map<SortBucket, string[]> {
  const wanted = new Set(ctx.limits.map((l) => l.bucket));
  const groups = new Map<SortBucket, string[]>();
  for (const sender of senders) {
    const domain = domainOf(sender.address);
    const corrected = isBucket(overrideFor(sender.address, domain, ctx.overrides));
    if (corrected ? scamTier(sender, ctx.known) === "hold" : skipSender(sender, ctx.known)) continue;
    const buckets = senderBuckets(sender, domain, ctx.overrides);
    for (const msg of sender.messages) {
      if (!corrected && (msg.isProtected || neverMove(msg, sender.address) || withYourContacts(msg, ctx.known))) continue;
      const bucket = buckets.get(msg.id);
      if (!bucket || !wanted.has(bucket)) continue;
      const list = groups.get(bucket) ?? [];
      list.push(msg.id);
      groups.set(bucket, list);
    }
  }
  return groups;
}

// Codes and account notices are about one message; they never speak for the
// rest of a sender's mail.
const PER_MESSAGE = new Set<SortBucket>(["otp", "accounts"]);

/** Each message's label. A message nothing labels takes its sender's usual
 * label when at least three of the sender's messages, and two in three
 * overall, share it (Yahoo sorts per sender, not per message: Grbovic et al.,
 * CIKM 2014). "Your stay is coming up" from a hotel goes with its bookings. */
export function senderBuckets(sender: SenderSummary, domain: string, overrides: Record<string, SortOverride>): Map<string, SortBucket | null> {
  const own = new Map(sender.messages.map((m) => [m.id, effectiveBucket(m.kind, domain, sender.address, overrides, m.promotion, m)] as const));
  const counts = new Map<SortBucket, number>();
  for (const b of own.values()) if (b && !PER_MESSAGE.has(b)) counts.set(b, (counts.get(b) ?? 0) + 1);
  const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  const usual = top && n >= 3 && n * 3 >= own.size * 2 ? top : null;
  for (const [id, b] of own) if (!b) own.set(id, usual);
  return own;
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
  /** Every message that fits a label. */
  sortedIds: Set<string>;
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
  const result: RelabelResult = { labelled: 0, fixed: 0, byBucket: {}, changes: new Map(), sortedIds: new Set() };
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
    for (const id of ids) result.sortedIds.add(id);
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

/** Where the catch-up pass stands: -7 = done, else it reads inbox mail
 * received before this time (ms) next. -1 to -6 were older "done" values
 * (the has:nouserlabels bug, before Accounts and Jobs, the week the
 * background run stalled, rules that missed old job and account mail, then
 * missed codes and no-reply mail kept as a person's, then list mail with
 * no unsubscribe link),
 * so those accounts start over. */
export const TAG_BACK_DONE = -7;

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
export const HOLD_UNSORTED_HOURS = 0;
const HOLD_MAX = 100;
// Calendar invites and replies to them are people arranging something.
// A forwarded or answered invite ("Fwd: Invitation: Sync") is still one.
const CALENDAR_RE = /^((re|fwd?|fw):\s*)*((updated )?invitation|accepted|declined|tentatively accepted|new event|canceled event|cancelled event):/i;

/**
 * Cleans what the labels left in the inbox. Anything that looks personal
 * (mail a person wrote, replies to you, anyone you've written to, calendar
 * invites) goes under `personalLabelName`. When `hold` is on, everything else
 * that fits no label goes to `holdLabelName` (the Screener), starred mail too
 * (it keeps its star). Nothing is deleted, and Gmail's spam filter learns
 * nothing. Only risky senders stay (the scam hold's job).
 *
 * Pages through the inbox: `before` (epoch seconds, 0 = newest) is where this
 * page ends, and `nextBefore` where the next one should. A full page of kept
 * mail used to be listed again every run, so older bulk mail was never seen.
 */
export async function holdUnsortedInbox(
  ctx: LimitContext,
  api: InboxLimitsApi,
  holdLabelName: string,
  before = 0,
  personalLabelName?: string,
  hold = true,
): Promise<{ heldIds: string[]; personalIds: string[]; senders: string[]; nextBefore: number }> {
  const cutoff = epochSeconds(ctx.now - HOLD_UNSORTED_HOURS * HOUR_MS);
  const until = before > 0 ? Math.min(before, cutoff) : cutoff;
  const skipPersonal = personalLabelName ? ` -label:"${personalLabelName}"` : " -is:starred";
  const query = `before:${until}${skipPersonal} -label:"${holdLabelName}" ${withoutClusterLabels(ctx.limits)}`;
  const ids = await api.listIds(["INBOX"], query, HOLD_MAX);
  if (ids.length === 0) return { heldIds: [], personalIds: [], senders: [], nextBefore: 0 };
  const heldIds: string[] = [];
  const personalIds: string[] = [];
  const senders = new Set<string>();
  let oldest = Infinity;
  for (const sender of await api.readSenders(ids)) {
    for (const msg of sender.messages) oldest = Math.min(oldest, msg.receivedAt);
    const tier = scamTier(sender, ctx.known);
    // The hold takes the messages that earn it; the rest of a risky sender's
    // mail goes to the Screener, never back to the inbox.
    if (tier !== "none") {
      if (hold) for (const msg of sender.messages) heldIds.push(msg.id);
      if (hold) senders.add(sender.address.toLowerCase());
      continue;
    }
    const known = ctx.known.has(sender.address.toLowerCase());
    const domain = domainOf(sender.address);
    const override = overrideFor(sender.address, domain, ctx.overrides);
    // Filed under a label by the user: the tagger labels it.
    if (isBucket(override)) continue;
    const buckets = senderBuckets(sender, domain, ctx.overrides);
    for (const msg of sender.messages) {
      const personal =
        override === "personal" ||
        (override !== "never" &&
          (known ||
            msg.fromYou ||
            msg.repliesToYou ||
            withYourContacts(msg, ctx.known) ||
            // A stranger on free mail waits in the Screener until you say yes (HEY's Screener).
            ((ctx.holdPeople === false || !isFreeMailDomain(domain)) &&
              ((writtenByPerson(msg, sender.address, sender.displayName) && !sender.threatSignals.some((t) => t.kind === "lure-language")) ||
                (CALENDAR_RE.test(msg.subject ?? "") && !msg.fakeReply)))));
      if (personal) {
        if (personalLabelName) personalIds.push(msg.id);
        continue;
      }
      // Without a Personal label (old callers) starred and protected mail stays.
      if (!hold || (!personalLabelName && msg.isProtected)) continue;
      // The tagger will label it; it just hasn't yet.
      if (buckets.get(msg.id)) continue;
      heldIds.push(msg.id);
      senders.add(sender.address.toLowerCase());
    }
  }
  if (personalIds.length > 0) await api.batchModify(personalIds, [await api.ensureLabelId(personalLabelName!)], ["INBOX"]);
  if (heldIds.length > 0) await api.batchModify(heldIds, [await api.ensureLabelId(holdLabelName)], ["INBOX"]);
  // A full page means older mail is waiting below it; a short one, start over.
  const nextBefore = ids.length < HOLD_MAX || !Number.isFinite(oldest) ? 0 : epochSeconds(oldest);
  return { heldIds, personalIds, senders: [...senders], nextBefore };
}

/** A person wrote it to you and someone you write to: a thread in your
 * circle (Priority Inbox's social features: Aberdeen et al., 2010). Bulk
 * mail and fake replies don't count. */
function withYourContacts(msg: MessageRecord, known: ReadonlySet<string>): boolean {
  if (msg.looksAutomated || msg.sentBy === "service" || msg.fakeReply) return false;
  return (msg.coRecipients ?? []).some((a) => known.has(a));
}

/** A person typed it: not a mailing, not automated, not a no-reply or shared
 * mailbox. Such mail stays in the inbox. */
function writtenByPerson(msg: MessageRecord, address: string, name = ""): boolean {
  if (isRoleAddress(address) || msg.looksAutomated || msg.sentBy === "service" || msg.fakeReply) return false;
  // Updates, Social and Forums are Gmail's own call that it's machine mail.
  if (msg.tab && msg.tab !== "primary") return false;
  if (looksLikeCompany(address, msg.dkimDomains) || isMailboxName(name)) return false;
  // Sent from a person's mail app, "Invoice for the cabin split" is a friend's.
  return msg.kind === "other" || msg.sentBy === "person-app";
}

// A store's or carrier's mail with no bulk headers is still a company:
// mcinfo@ups.com, store+12345@t.shopifyemail.com. Words in the address
// (Grbovic et al., CIKM 2014) and sending subdomains say so. Schools are left
// out: a professor writes from the same .edu as the registrar.
const COMPANY_TOKEN = /(^|[._+-])(\w*info|store|shop|orders?|accounts?|dept|office|payable|support|security|service|helpdesk|admin|tracking|shipping|delivery|invoices?|payments?|billing|receipts?|bookings?|reservations?|tickets?|promo|deals|offers|rewards|surveys?|feedback|digest|updates?|newsletters?|community|events|members?|customer|care|concierge|contact|automated|system|bot)([._+-]|$)/i;
const SENDING_SUBDOMAIN = /^(t|e|em|email|mail|mailer|mailing|news|newsletter|info|go|link|links|reply|bounce|notify|notifications?|marketing|comms|alerts?)\./i;
function looksLikeCompany(address: string, dkimDomains: readonly string[] = []): boolean {
  const domain = domainOf(address);
  const category = senderCategory(domain, dkimDomains);
  return (category !== "other" && category !== "education") || SENDING_SUBDOMAIN.test(domain) || COMPANY_TOKEN.test(address.slice(0, address.indexOf("@")));
}

export interface SweepResult {
  movedIds: string[];
  /** Past their limit but kept: a risky sender (the scam hold's job) or a
   * person's own note. The caller remembers these so later sweeps don't
   * re-read them. */
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
    // Starred mail leaves too: it stays under Starred and its label.
    due.set(limit.bucket, await api.listIds(both, `before:${cutoff}`, LIST_MAX));
    notYet.set(limit.bucket, await api.listIds(both, `after:${cutoff}`, LIST_MAX));
  }

  const candidates = dueForMove(due, notYet).filter((id) => !ctx.keptIds?.has(id));
  const batch = candidates.slice(0, SWEEP_MAX);
  if (batch.length === 0) return { movedIds: [], keptIds: [], more: false };

  const movedIds: string[] = [];
  const keptIds: string[] = [];
  // A label means it has a place: mail from senders you've written to goes
  // there as well (a store's support desk kept its whole thread in the inbox).
  for (const sender of await api.readSenders(batch)) {
    const risky = scamTier(sender, ctx.known) === "hold";
    for (const msg of sender.messages) (risky || neverMove(msg, sender.address) ? keptIds : movedIds).push(msg.id);
  }
  if (movedIds.length > 0) await api.batchModify(movedIds, [], ["INBOX"]);
  return { movedIds, keptIds, more: candidates.length > batch.length };
}

/** A code or account notice from a brand-new sender is usually one you just
 * asked for (a sign-up), so it can't wait in the Screener for a decision. */
const SCREEN_SKIP: ReadonlySet<SortBucket> = new Set(["otp", "accounts"]);

/**
 * HEY's Screener for labelled mail: inbox mail with a label, from a sender
 * who never wrote before `since`, goes to the Screener until you decide.
 * Senders you know, a sender filed by you, scams (the scam hold's job),
 * starred mail and replies to you are left alone. A sender with mail from
 * before `since` is returned in `vetted` so it isn't searched again. Senders
 * already held (`held`) skip the search: their mail keeps joining them.
 */
export async function screenFirstTimeSenders(
  ctx: LimitContext,
  api: InboxLimitsApi,
  screenerLabelName: string,
  since: number,
  vetted: ReadonlySet<string>,
  held: ReadonlySet<string>,
): Promise<{ heldIds: string[]; senders: string[]; vetted: string[] }> {
  const none = { heldIds: [], senders: [], vetted: [] };
  const limits = ctx.limits.filter((l) => !SCREEN_SKIP.has(l.bucket));
  if (since <= 0 || limits.length === 0) return none;
  const sinceSec = epochSeconds(since);
  const anyLabel = `{${limits.map((l) => `label:"${l.labelName.replace(/"/g, "")}"`).join(" ")}}`;
  const ids = await api.listIds(["INBOX"], `after:${sinceSec} ${anyLabel} -label:"${screenerLabelName}" -is:starred`, SWEEP_MAX);
  if (ids.length === 0) return none;
  const heldIds: string[] = [];
  const senders: string[] = [];
  const newlyVetted: string[] = [];
  for (const sender of await api.readSenders(ids)) {
    const address = sender.address.toLowerCase();
    if (ctx.known.has(address) || vetted.has(address) || scamTier(sender, ctx.known) !== "none") continue;
    if (overrideFor(sender.address, domainOf(sender.address), ctx.overrides)) continue;
    const msgs = sender.messages.filter(
      (m) => !m.fromYou && !m.repliesToYou && !m.providerMarkedPersonal && !m.isProtected && !neverMove(m, sender.address),
    );
    if (msgs.length === 0) continue;
    if (!held.has(address) && (await api.listIds([], `from:${address} before:${sinceSec}`, 1)).length > 0) {
      newlyVetted.push(address);
      continue;
    }
    for (const m of msgs) heldIds.push(m.id);
    senders.push(address);
  }
  if (heldIds.length > 0) await api.batchModify(heldIds, [await api.ensureLabelId(screenerLabelName)], ["INBOX"]);
  return { heldIds, senders, vetted: newlyVetted };
}

export interface SearchSpec {
  bucket: SortBucket;
  labelName: string;
  /** The category's Gmail filter queries. */
  queries: string[];
}

/** Labels inbox mail each category's filter query matches, with no message
 * reads: a search lists 500 ids for 5 quota units and one batchModify labels
 * 1,000 for 50, so a 4,000-email inbox is labelled in seconds. Counts are
 * matches in the inbox (adding a label it already has is a no-op). Starred
 * mail is left alone; the index relabel fixes the rest later. */
export async function labelBySearch(
  api: InboxLimitsApi,
  specs: readonly SearchSpec[],
  /** Default: the inbox. allMail: every email outside Spam and Trash that has
   * no Cluster label yet (`skip`), up to `max` per search. */
  scope: { allMail: true; skip: string; max: number } | { allMail?: false } = {},
): Promise<{ labelled: number; byBucket: Partial<Record<SortBucket, number>> }> {
  const byBucket: Partial<Record<SortBucket, number>> = {};
  let labelled = 0;
  const [labelIds, suffix, max] = scope.allMail
    ? [[], ` -in:spam -in:trash ${scope.skip}`, scope.max]
    : [["INBOX"], "", LIST_MAX];
  for (const spec of specs) {
    const ids = new Set<string>();
    for (const q of spec.queries) for (const id of await api.listIds(labelIds, `${q} -is:starred${suffix}`, max)) ids.add(id);
    if (ids.size === 0) continue;
    await api.batchModify([...ids], [await api.ensureLabelId(spec.labelName)], []);
    byBucket[spec.bucket] = ids.size;
    labelled += ids.size;
  }
  return { labelled, byBucket };
}
