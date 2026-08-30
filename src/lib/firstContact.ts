// "First email from this sender" — the consumer version of the enterprise
// "new sender" banner. A persisted ledger (settingsStore.knownSenders) maps
// every address ever seen to when it was first seen; a sender absent from it
// on this scan is flagged. Metadata only (the From address), no body, no
// network. Pairs with the Screener, which acts on the same "never seen this
// person" idea.
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
): FirstContactResult {
  const updated: Record<string, number> = { ...knownSenders };
  let firstContactCount = 0;
  for (const sender of senders) {
    const address = sender.address.toLowerCase();
    if (!address) continue;
    if (!(address in updated)) {
      updated[address] = now;
      sender.firstContact = true;
      firstContactCount += 1;
    }
  }
  return { updatedKnownSenders: updated, firstContactCount };
}
