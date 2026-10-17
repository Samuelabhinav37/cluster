// Remembers that the user asked a sender to stop, so "already requested"
// survives a reload and the outcome can be checked later. Senders can take
// up to 10 business days, so asking again isn't blocked, just labelled.
import { recordEngagementFeedback } from "../lib/engagementModel";
import { log } from "../lib/log";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { addGmailBackstop } from "../lib/unsubscribeBackstop";
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
  const filterIds = await addBackstops(senders);
  ctx.settings = await mutateSettings((current) => {
    const requests = { ...current.unsubscribeRequests };
    for (const sender of senders) {
      const filterId = filterIds.get(sender.key) ?? current.unsubscribeRequests[sender.key]?.filterId;
      requests[sender.key] = {
        requestedAt: now,
        provider: sender.provider,
        method,
        ...details[sender.key],
        ...(filterId ? { filterId } : {}),
      };
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

/** Files each Gmail sender's later list mail out of the inbox. A failure
 * never undoes the unsubscribe; the sweep still catches their list mail. */
async function addBackstops(senders: SenderSummary[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const gmail = senders.filter(
    (s) => s.provider === "gmail" && !ctx.settings.unsubscribeRequests[s.key]?.filterId && ctx.profiles.get(s.key)?.listId,
  );
  if (gmail.length === 0) return out;
  try {
    const token = await gmailProvider.getAuthToken(false);
    for (const sender of gmail) {
      const id = await addGmailBackstop(token, sender.address, ctx.profiles.get(sender.key)?.listId);
      if (id) out.set(sender.key, id);
    }
  } catch (err) {
    log.error("Could not add the unsubscribe filter", err);
  }
  return out;
}
