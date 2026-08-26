import type { SenderSummary } from "./senderModel";

// The dashboard's own scan query isn't inbox-scoped (it matches Gmail
// category labels, which persist after archiving), so a snoozed message
// would otherwise still show up here even though it's been pulled out of
// the inbox. Filter it back out until its resurface time actually passes.
export function excludeSnoozedMessages(senders: SenderSummary[], activeSnoozedIds: Set<string>): SenderSummary[] {
  if (activeSnoozedIds.size === 0) return senders;

  const result: SenderSummary[] = [];
  for (const sender of senders) {
    const messages = sender.messages.filter((m) => !activeSnoozedIds.has(m.id));
    if (messages.length === sender.messages.length) {
      result.push(sender);
      continue;
    }
    if (messages.length === 0) continue;
    result.push({
      ...sender,
      messages,
      count: messages.length,
      messageIds: messages.map((m) => m.id),
      protectedMessageIds: messages.filter((m) => m.isProtected).map((m) => m.id),
    });
  }
  return result;
}
