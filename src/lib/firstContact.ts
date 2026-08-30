// "New since Cluster started tracking" banner. The first scan seeds a baseline
// without claiming that every existing correspondent is new.
import type { SenderSummary } from "./senderModel";

export interface FirstContactResult {
  /** knownSenders with every newly-seen address added at `now`. Persist this
   * only when `firstContactCount > 0`. */
  updatedKnownSenders: Record<string, number>;
  firstContactCount: number;
}

/**
 * Sets `firstContact` on every sender whose address isn't in `knownSenders`
 * yet, and returns the ledger with those addresses added. Mutates the passed
 * `SenderSummary` objects in place (they're freshly built each scan).
 */
export function markFirstContact(
  senders: SenderSummary[],
  knownSenders: Record<string, number>,
  now: number = Date.now(),
  flagUnknown = true,
): FirstContactResult {
  const updated: Record<string, number> = { ...knownSenders };
  let firstContactCount = 0;
  for (const sender of senders) {
    const address = sender.address.toLowerCase();
    if (!address) continue;
    const key = `${sender.provider}:${address}`;
    // Bare-address entries are accepted as a migration path from schema 0.
    if (!(key in updated) && !(address in updated)) {
      updated[key] = now;
      sender.firstContact = flagUnknown;
      if (flagUnknown) firstContactCount += 1;
    }
  }
  return { updatedKnownSenders: updated, firstContactCount };
}
