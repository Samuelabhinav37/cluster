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
import { ALL_SORT_BUCKETS, type SortBucket, type SortOverride } from "../lib/sortTaxonomy";
import { senderVerdict } from "../lib/verdict";

export type Where = SortBucket | "personal" | "screener" | "spam" | "inbox";

export interface MailboxSetup {
  /** Addresses you've written to or let in. */
  contacts: string[];
  overrides?: Record<string, SortOverride>;
  sent?: SentRecord[];
  now: number;
}

export async function sortMailbox(metas: NormalizedMessageMetadata[], setup: MailboxSetup): Promise<Map<string, Where>> {
  const cache = new Map(metas.map((m) => [`gmail:${m.id}`, m]));
  const provider = { id: "gmail", getMessageMetadata: () => Promise.reject(new Error("not cached")) };
  const stubs = metas.map((m) => ({ id: m.id, provider: "gmail" as const }));
  const senders = await buildSenderSummariesFromStubs([{ provider: provider as never, token: "", stubs }], undefined, cache);
  markRepliesToYou(senders, metas, setup.sent ?? []);
  const known = new AddressSet(setup.contacts);
  markNameMatches(senders, known);

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
