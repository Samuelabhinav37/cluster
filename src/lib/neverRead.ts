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
  /** settings.autoSort.skipInboxSince (0 = labels don't skip the inbox). */
  skipInboxSince = 0,
): SenderSummary[] {
  return senders.filter((s) => {
    // Mail from the last few days hasn't had its chance to be opened yet.
    // shortcut: all unread mail since labels began skipping the inbox is left
    // out, even the little still in the inbox; use labelIds if MessageRecord gains them.
    const considered = s.messages.filter(
      (m) =>
        now - m.receivedAt >= OPEN_GRACE_MS &&
        !(skipInboxSince > 0 && m.unread && m.receivedAt >= skipInboxSince) &&
        !protectionDecision(m, s.address, ctx).protected,
    );
    return considered.length >= minMessages && considered.every((m) => m.unread);
  });
}
