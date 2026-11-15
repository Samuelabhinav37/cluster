// Learns from labels changed in Gmail itself (SaneBox's core idea): when you
// swap one of a sender's Cluster labels for another twice, Cluster saves that
// as a correction, so its filters and relabelling follow you from then on.
import { correctionKey } from "./addressIdentity";
import type { SortBucket, SortOverride } from "./sortTaxonomy";

/** Where a move can teach a sender to go. */
export type MoveTarget = SortBucket | "personal";

/** A message whose labels changed in Gmail, from the change feed. */
export interface LabelMove {
  address: string;
  added: string[];
  removed: string[];
}

/** Swaps to the same label before Cluster learns it. */
export const MOVES_TO_LEARN = 2;

export type MoveVotes = Record<string, { bucket: MoveTarget; n: number }>;

/** The label each swap put a sender under. A swap is one of Cluster's labels
 * taken off (a sorting label, Personal or the Screener: `fromIds`) and
 * exactly one target put on; adding alone (Cluster's own labelling) or
 * removing alone (tidying up, or back to the inbox) teaches nothing. */
export function movedTo(
  moves: readonly LabelMove[],
  bucketOf: ReadonlyMap<string, MoveTarget>,
  fromIds: ReadonlySet<string> = new Set(bucketOf.keys()),
): Array<[string, MoveTarget]> {
  const out: Array<[string, MoveTarget]> = [];
  for (const m of moves) {
    const to = m.added.flatMap((id) => bucketOf.get(id) ?? []);
    const from = m.removed.filter((id) => fromIds.has(id));
    if (to.length === 1 && from.length > 0 && m.address) out.push([correctionKey(m.address), to[0]]);
  }
  return out;
}

/** Adds the swaps to the running votes; a sender reaching MOVES_TO_LEARN for
 * one label is learned and its votes cleared. A swap to another label starts
 * that sender's count again. */
export function tallyMoves(
  votes: MoveVotes,
  moved: ReadonlyArray<[string, MoveTarget]>,
  overrides: Record<string, SortOverride>,
): { votes: MoveVotes; learned: Array<[string, MoveTarget]> } {
  const next = { ...votes };
  const learned: Array<[string, MoveTarget]> = [];
  for (const [address, bucket] of moved) {
    if (overrides[address] === bucket) continue;
    const n = next[address]?.bucket === bucket ? next[address].n + 1 : 1;
    if (n >= MOVES_TO_LEARN) {
      delete next[address];
      learned.push([address, bucket]);
    } else next[address] = { bucket, n };
  }
  return { votes: next, learned };
}
