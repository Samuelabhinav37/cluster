// Test-only: runs a mailbox through Cluster's real sorting code, in the order
// the background runs it: sender records, replies to you, the scam checks,
// the labeller, then the Personal / Screener pass. Returns where each email
// ended up.
import { AddressSet } from "../lib/addressIdentity";
import { markRepliesToYou } from "../lib/correspondents";
import { bucketsFor, holdUnsortedInbox, type CategoryLimit, type InboxLimitsApi } from "../lib/inboxTimeLimits";
import { markNameMatches } from "../lib/nameMatch";
import type { NormalizedMessageMetadata, SentRecord } from "../lib/providers/emailProvider";
import { buildSenderSummariesFromStubs, type SenderSummary } from "../lib/senderModel";
import { ALL_SORT_BUCKETS, classifySortBucket, type SortBucket, type SortOverride } from "../lib/sortTaxonomy";
import { domainOf } from "../lib/domainGrouping";
import { senderVerdict } from "../lib/verdict";

export type Where = SortBucket | "personal" | "screener" | "spam" | "inbox";

export interface MailboxSetup {
  /** Addresses you've written to or let in. */
  contacts: string[];
  overrides?: Record<string, SortOverride>;
  sent?: SentRecord[];
  now: number;
}

/** Sender records as the background builds them, with replies and name checks marked. */
async function sendersOf(metas: NormalizedMessageMetadata[], setup: MailboxSetup) {
  const cache = new Map(metas.map((m) => [`gmail:${m.id}`, m]));
  const provider = { id: "gmail", getMessageMetadata: () => Promise.reject(new Error("not cached")) };
  const stubs = metas.map((m) => ({ id: m.id, provider: "gmail" as const }));
  const senders = await buildSenderSummariesFromStubs([{ provider: provider as never, token: "", stubs }], undefined, cache);
  markRepliesToYou(senders, metas, setup.sent ?? []);
  const known = new AddressSet(setup.contacts);
  markNameMatches(senders, known);
  return { senders, known };
}

export async function sortMailbox(metas: NormalizedMessageMetadata[], setup: MailboxSetup): Promise<Map<string, Where>> {
  const { senders, known } = await sendersOf(metas, setup);

  const where = new Map<string, Where>();
  // 1. Scam hold, as runQuarantine does (starred mail never moves).
  for (const s of senders) {
    const v = senderVerdict(s, { knownCorrespondent: known.has(s.address) });
    for (const id of v.heldMessageIds) if (!s.protectedMessageIds.includes(id)) where.set(id, "spam");
  }
  const rest = (list: SenderSummary[]) =>
    list.map((s) => ({ ...s, messages: s.messages.filter((m) => !where.has(m.id)) })).filter((s) => s.messages.length > 0);

  // 2. Labels.
  const limits: CategoryLimit[] = ALL_SORT_BUCKETS.map((bucket) => ({ bucket, labelName: bucket, hours: 0 }));
  const ctx = { limits, known, overrides: setup.overrides ?? {}, now: setup.now };
  for (const [bucket, ids] of bucketsFor(rest(senders), ctx)) for (const id of ids) where.set(id, bucket);

  // 3. Personal and Screener, over what's left in the inbox (one page holds all of it).
  const left = rest(senders);
  const api: InboxLimitsApi = {
    findLabelId: async (n) => n,
    ensureLabelId: async (n) => n,
    listIds: async () => left.flatMap((s) => s.messages.map((m) => m.id)),
    readSenders: async () => left,
    batchModify: async () => {},
  };
  const res = await holdUnsortedInbox(ctx, api, "screener", 0, "personal");
  for (const id of res.personalIds) where.set(id, "personal");
  for (const id of res.heldIds) where.set(id, "screener");
  for (const m of metas) if (!where.has(m.id)) where.set(m.id, "inbox");
  return where;
}

/** Writes past vitest's console silencer (the runner is Node). */
export const out = (text: string) =>
  (globalThis as unknown as { process: { stdout: { write(t: string): void } } }).process.stdout.write(text);

/** One signal's say about an email: a label, "person" or "machine". */
export type Vote = SortBucket | "person" | "machine";

/** What each independent signal says about each email, like Snorkel's label
 * matrix (Ratner et al., VLDB 2017): the subject, the sender's domain (or the
 * domain that signed it), the Gmail tab, the sending path, the bulk headers,
 * and whether you know the sender. Mail where no signal speaks, or where
 * signals disagree, is where mistakes hide. */
export async function signalVotes(metas: NormalizedMessageMetadata[], setup: MailboxSetup): Promise<Map<string, Record<string, Vote>>> {
  const { senders, known } = await sendersOf(metas, setup);
  const votes = new Map<string, Record<string, Vote>>();
  for (const s of senders) {
    const domain = domainOf(s.address);
    for (const m of s.messages) {
      const v: Record<string, Vote> = {};
      const bySubject = classifySortBucket(m.kind, "unlisted.invalid");
      if (bySubject) v.subject = bySubject;
      const byDomain = classifySortBucket("other", domain, false, s.address, { dkimDomains: m.dkimDomains });
      if (byDomain) v.domain = byDomain;
      if (m.tab === "promotions" || m.tab === "social") v.tab = m.tab;
      else if (m.tab === "updates" || m.tab === "forums") v.tab = "machine";
      if (m.sentBy) v.headers = m.sentBy === "service" ? "machine" : "person";
      if (m.looksAutomated) v.bulk = "machine";
      if (known.has(s.address) || m.repliesToYou) v.you = "person";
      votes.set(m.id, v);
    }
  }
  return votes;
}

/** "none": no signal spoke. "conflict": a person vote against a machine or
 * label vote, the disagreement that decides Personal vs the rest. "mixed":
 * only labels differ (Amazon shipping mail is shipping by subject and
 * shopping by domain), which the label order settles. "agree": the rest. */
export function agreement(v: Record<string, Vote>): "none" | "agree" | "mixed" | "conflict" {
  const all = Object.values(v);
  if (all.length === 0) return "none";
  if (all.includes("person") && all.some((x) => x !== "person")) return "conflict";
  return new Set(all.filter((x) => x !== "person" && x !== "machine")).size > 1 ? "mixed" : "agree";
}
