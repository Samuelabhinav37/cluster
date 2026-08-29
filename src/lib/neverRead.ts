import type { SenderSummary } from "./senderModel";

// "You never open these" — senders whose mail you consistently leave unread.
// A metadata-only stand-in for SaneBox-style learning: no new scope, just the
// UNREAD flag already fetched. Deliberately strict (every non-starred message
// still unread, and enough of them to be a pattern) so it surfaces genuine
// dead weight, not a sender you simply haven't got to yet.
export function neverReadSenders(senders: SenderSummary[], minMessages = 3): SenderSummary[] {
  return senders.filter((s) => {
    const considered = s.messages.filter((m) => !m.isProtected);
    return considered.length >= minMessages && considered.every((m) => m.unread);
  });
}
