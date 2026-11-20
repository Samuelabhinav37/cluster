// Learns from labels changed in Gmail itself (SaneBox's core idea): when you
// swap one of a sender's Cluster labels for another twice (or move all of a
// sender's mail at once), Cluster saves that as a correction, so its filters and relabelling follow you from then on.
import { correctionKey } from "./addressIdentity";
import type { MessageKind } from "./messageKind";
import { kindKey, SCOPED_KINDS, type SortBucket, type SortOverride } from "./sortTaxonomy";

/** Where a move can teach a sender to go. */
export type MoveTarget = SortBucket | "personal";

/** A message whose labels changed in Gmail, from the change feed. */
export interface LabelMove {
  address: string;
  /** The email's kind: a move of a code, receipt or other scoped kind
   * teaches that kind of the sender's mail only, as Details does (audit B11). */
  kind?: MessageKind;
  added: string[];
  removed: string[];
}

/** Swaps to the same label before Cluster learns it. */
export const MOVES_TO_LEARN = 2;

/** The second vote must come this long after the first: moving a whole
 * thread or a page of one sender's mail at once is one decision, not two
 * (Inbox Zero waits the same way). */
export const VOTE_GAP_MS = 15 * 60 * 1000;
/** A pass that takes one label off this many senders is a sweep (clearing a
 * label, a bulk re-file) and teaches nothing about any one of them. */
export const SWEEP_SENDERS = 10;

/** `at`: when the last vote counted. Older saved votes have none. */
export type MoveVotes = Record<string, { bucket: MoveTarget; n: number; at?: number }>;

/** Emails re-filed by these moves: one of Cluster's labels off, exactly one
 * of its targets on. Unlike movedTo, sweeps count: every email you re-file is
 * one Cluster got wrong (the correction rate's numerator). */
export function fixedEmails(moves: readonly LabelMove[], bucketOf: ReadonlyMap<string, MoveTarget>, fromIds: ReadonlySet<string>): number {
  return moves.filter((m) => m.added.filter((id) => bucketOf.has(id)).length === 1 && m.removed.some((id) => fromIds.has(id))).length;
}

/** fixedEmails per label: which of Cluster's labels each re-filed email left. */
export function fixesPerLabel(moves: readonly LabelMove[], bucketOf: ReadonlyMap<string, MoveTarget>): Partial<Record<MoveTarget, number>> {
  const out: Partial<Record<MoveTarget, number>> = {};
  for (const m of moves) {
    if (m.added.filter((id) => bucketOf.has(id)).length !== 1) continue;
    const from = m.removed.map((id) => bucketOf.get(id)).find((b) => b !== undefined);
    if (from) out[from] = (out[from] ?? 0) + 1;
  }
  return out;
}

/** The label each swap put a sender under. A swap is one of Cluster's labels
 * taken off (a sorting label, Personal or the Screener: `fromIds`) and
 * exactly one target put on; adding alone (Cluster's own labelling) or
 * removing alone (tidying up, or back to the inbox) teaches nothing. */
export function movedTo(
  moves: readonly LabelMove[],
  bucketOf: ReadonlyMap<string, MoveTarget>,
  fromIds: ReadonlySet<string> = new Set(bucketOf.keys()),
): Array<[string, MoveTarget]> {
  const swaps: Array<{ key: string; sender: string; to: MoveTarget; from: string[] }> = [];
  for (const m of moves) {
    const to = m.added.flatMap((id) => bucketOf.get(id) ?? []);
    const from = m.removed.filter((id) => fromIds.has(id));
    if (to.length === 1 && from.length > 0 && m.address) {
      const key = correctionKey(m.address);
      swaps.push({ key: m.kind && SCOPED_KINDS.includes(m.kind) ? kindKey(key, m.kind) : key, sender: key, to: to[0], from });
    }
  }
  const sendersOff = new Map<string, Set<string>>();
  for (const sw of swaps) for (const id of sw.from) sendersOff.set(id, (sendersOff.get(id) ?? new Set()).add(sw.sender));
  const swept = (sw: (typeof swaps)[number]) => sw.from.some((id) => sendersOff.get(id)!.size >= SWEEP_SENDERS);
  // One vote per sender per pass, however many of its emails moved.
  const out = new Map<string, MoveTarget>();
  for (const sw of swaps) if (!swept(sw)) out.set(sw.key, sw.to);
  return [...out];
}

/** Senders (unscoped keys) with at least `min` emails re-filed this pass, with
 * the addresses and Cluster labels they came off: candidates for learning in
 * one move if none of their mail is left under those labels (plan 4.3). */
export function bulkMoved(
  moves: readonly LabelMove[],
  bucketOf: ReadonlyMap<string, MoveTarget>,
  fromIds: ReadonlySet<string>,
  min = 2,
): Map<string, { addresses: Set<string>; from: Set<string>; n: number }> {
  const out = new Map<string, { addresses: Set<string>; from: Set<string>; n: number }>();
  for (const m of moves) {
    const from = m.removed.filter((id) => fromIds.has(id));
    if (!m.address || from.length === 0 || m.added.filter((id) => bucketOf.has(id)).length !== 1) continue;
    if (m.kind && SCOPED_KINDS.includes(m.kind)) continue;
    const key = correctionKey(m.address);
    const e = out.get(key) ?? { addresses: new Set<string>(), from: new Set<string>(), n: 0 };
    e.addresses.add(m.address);
    for (const id of from) e.from.add(id);
    e.n += 1;
    out.set(key, e);
  }
  for (const [k, e] of out) if (e.n < min) out.delete(k);
  return out;
}

/** Adds the swaps to the running votes; a sender reaching MOVES_TO_LEARN for
 * one label is learned and its votes cleared. A swap to another label starts
 * that sender's count again. */
export function tallyMoves(
  votes: MoveVotes,
  moved: ReadonlyArray<[string, MoveTarget]>,
  overrides: Record<string, SortOverride>,
  now = Date.now(),
  /** Senders whose whole mail you moved at once: learned on this one move. */
  whole: ReadonlySet<string> = new Set(),
): { votes: MoveVotes; learned: Array<[string, MoveTarget]> } {
  const next = { ...votes };
  const learned: Array<[string, MoveTarget]> = [];
  for (const [address, bucket] of moved) {
    if (overrides[address] === bucket) continue;
    const prev = next[address]?.bucket === bucket ? next[address] : undefined;
    // Too soon after the last vote: the same decision seen twice.
    if (!whole.has(address) && prev && now - (prev.at ?? 0) < VOTE_GAP_MS) continue;
    const n = whole.has(address) ? MOVES_TO_LEARN : (prev?.n ?? 0) + 1;
    if (n >= MOVES_TO_LEARN) {
      delete next[address];
      learned.push([address, bucket]);
    } else next[address] = { bucket, n, at: now };
  }
  return { votes: next, learned };
}
