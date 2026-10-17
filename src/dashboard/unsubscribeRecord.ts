// Remembers that the user asked a sender to stop, so "already requested"
// survives a reload and the outcome can be checked later. Senders can take
// up to 10 business days, so asking again isn't blocked, just labelled.
import { recordEngagementFeedback } from "../lib/engagementModel";
import type { SenderSummary } from "../lib/senderModel";
import { mutateSettings, type UnsubscribeMethod } from "../lib/settingsStore";
import { ctx } from "./state";

export async function recordUnsubscribeRequests(
  senders: SenderSummary[],
  method: UnsubscribeMethod = "one-click",
  details: Record<string, { from?: string; sentMessageId?: string }> = {},
): Promise<void> {
  if (senders.length === 0) return;
  const now = Date.now();
  ctx.settings = await mutateSettings((current) => {
    const requests = { ...current.unsubscribeRequests };
    for (const sender of senders) {
      requests[sender.key] = { requestedAt: now, provider: sender.provider, method, ...details[sender.key] };
    }
    return {
      ...current,
      unsubscribeRequests: requests,
      senderEngagement: recordEngagementFeedback(
        current.senderEngagement,
        senders.map((sender) => sender.key),
        "accept",
        now,
      ),
    };
  });
}
