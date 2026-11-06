// Learns from labels changed in Gmail itself (SaneBox's core idea): when you
// swap one of a sender's Cluster labels for another twice, Cluster saves that
// as a correction, so its filters and relabelling follow you from then on.
import type { SortBucket, SortOverride } from "./sortTaxonomy";

/** A message whose labels changed in Gmail, from the change feed. */
export interface LabelMove {
  address: string;
  added: string[];
  removed: string[];
}

/** Swaps to the same label before Cluster learns it. */
export const MOVES_TO_LEARN = 2;

export type MoveVotes = Record<string, { bucket: SortBucket; n: number }>;

/** The label each swap put a sender under. A swap is one Cluster label taken
 * off and exactly one other put on; adding alone (Cluster's own labelling) or
 * removing alone (tidying up) teaches nothing. */
export function movedTo(moves: readonly LabelMove[], bucketOf: ReadonlyMap<string, SortBucket>): Array<[string, SortBucket]> {
  const out: Array<[string, SortBucket]> = [];
  for (const m of moves) {
    const to = m.added.flatMap((id) => bucketOf.get(id) ?? []);
    const from = m.removed.flatMap((id) => bucketOf.get(id) ?? []);
    if (to.length === 1 && from.length > 0 && m.address) out.push([m.address.toLowerCase(), to[0]]);
  }
  return out;
}

/** Adds the swaps to the running votes; a sender reaching MOVES_TO_LEARN for
 * one label is learned and its votes cleared. A swap to another label starts
 * that sender's count again. */
export function tallyMoves(
  votes: MoveVotes,
  moved: ReadonlyArray<[string, SortBucket]>,
  overrides: Record<string, SortOverride>,
): { votes: MoveVotes; learned: Array<[string, SortBucket]> } {
  const next = { ...votes };
  const learned: Array<[string, SortBucket]> = [];
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
