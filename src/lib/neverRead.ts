import { emptyProtectionContext, protectionDecision, type ProtectionContext } from "./protectionPolicy";
import type { SenderSummary } from "./senderModel";
import { OPEN_GRACE_MS } from "./senderProfile";

// "You never open these" — senders whose mail you consistently leave unread.
// A metadata-only stand-in for SaneBox-style learning: no new scope, just the
// UNREAD flag already fetched. Deliberately strict (every protected message
// excluded, and enough of the rest to be a pattern) so it surfaces genuine
// dead weight, not a sender you simply haven't got to yet.
export function neverReadSenders(
  senders: SenderSummary[],
  ctx: ProtectionContext = emptyProtectionContext(),
  minMessages = 3,
  now = Date.now(),
): SenderSummary[] {
  return senders.filter((s) => {
    // Mail from the last few days hasn't had its chance to be opened yet.
    const considered = s.messages.filter(
      (m) => now - m.receivedAt >= OPEN_GRACE_MS && !protectionDecision(m, s.address, ctx).protected,
    );
    return considered.length >= minMessages && considered.every((m) => m.unread);
  });
}
