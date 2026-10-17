// Which of the user's addresses an unsubscribe email should come from. Many
// list servers (Mailman, Google Groups and others) remove the address that
// sent the request and ignore any other without an error, so sending from
// the main address for mail that arrived at an alias quietly fails
// (RFC 2369 appendix B.1: send from the subscribed address).
import type { SendAsIdentity } from "./gmailApi";

export type IdentityPick =
  /** Mail arrived at an address the account can send as. */
  | { from: string; sure: true }
  /** No exact match. `from` is the best guess; the sheet asks the user. */
  | { from: string; sure: false; why: "plus-address" | "forwarded" };

function stripPlus(address: string): string {
  return address.replace(/\+[^@]*@/, "@");
}

/**
 * `deliveredTo` comes from UnsubscribeDetails, most specific first.
 * `identities` are the account's send-as addresses; the primary is the
 * fallback.
 */
export function pickUnsubscribeIdentity(
  deliveredTo: readonly string[],
  identities: readonly SendAsIdentity[],
): IdentityPick | undefined {
  const primary = identities.find((i) => i.isPrimary) ?? identities[0];
  if (!primary) return undefined;
  const sendable = new Set(identities.map((i) => i.address));
  for (const address of deliveredTo) {
    if (sendable.has(address)) return { from: address, sure: true };
  }
  for (const address of deliveredTo) {
    const base = stripPlus(address);
    if (base !== address && sendable.has(base)) return { from: base, sure: false, why: "plus-address" };
  }
  return { from: primary.address, sure: false, why: "forwarded" };
}

export const IDENTITY_QUESTION: Record<"plus-address" | "forwarded", string> = {
  "plus-address":
    "This list has your address with a +tag. Cluster can only send from your plain address, which the list may not recognise.",
  forwarded: "This mail was forwarded to you. The list may only accept a request from the address it was sent to.",
};
