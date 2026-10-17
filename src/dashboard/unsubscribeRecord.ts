// Remembers that the user asked a sender to stop, so "already requested"
// survives a reload and the outcome can be checked later. Senders can take
// up to 10 business days, so asking again isn't blocked, just labelled.
import { recordEngagementFeedback } from "../lib/engagementModel";
import { log } from "../lib/log";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { addGmailBackstop, addGmailTrashFilter, removeGmailBackstop } from "../lib/unsubscribeBackstop";
import type { SenderSummary } from "../lib/senderModel";
import { mutateSettings, type UnsubscribeMethod } from "../lib/settingsStore";
import type { NormalizedMessageMetadata } from "../lib/providers/emailProvider";
import { evaluateUnsubscribeOutcome, type UnsubscribeOutcome } from "../lib/unsubscribeOutcome";
import { markUnsubscribeBounced, queueKey } from "../lib/unsubscribeQueue";
import { repliesTo } from "../lib/unsubscribeReplies";
import { ctx } from "./state";

export async function recordUnsubscribeRequests(
  senders: SenderSummary[],
  method: UnsubscribeMethod = "one-click",
  details: Record<string, { from?: string; to?: string; sentMessageId?: string; sentThreadId?: string }> = {},
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

/** Reads replies to every request from the index rows; a bounce also stops
 * the send queue from mailing more lists in the same run. */
export function readUnsubscribeReplies(rows: readonly NormalizedMessageMetadata[]): void {
  const replies = new Map<string, ReturnType<typeof repliesTo>>();
  for (const [key, request] of Object.entries(ctx.settings.unsubscribeRequests)) {
    if (request.method !== "mailto") continue;
    const address = key.slice(key.indexOf(":") + 1);
    const found = repliesTo(request, address, rows);
    if (found.length === 0) continue;
    replies.set(key, found);
    if (found.includes("bounce") && request.to) {
      void markUnsubscribeBounced(queueKey(request.provider, request.to, request.requestedAt)).catch((err) =>
        log.error("Could not mark a bounced unsubscribe", err),
      );
    }
  }
  ctx.unsubscribeReplies = replies;
}

/** The outcome of the request for this sender key, with its replies. */
export function unsubscribeOutcomeFor(key: string, sender: SenderSummary | undefined): UnsubscribeOutcome {
  return evaluateUnsubscribeOutcome(
    sender,
    ctx.settings.unsubscribeRequests[key],
    Date.now(),
    ctx.unsubscribeReplies.get(key),
  );
}

export const UNDO_UNSUBSCRIBE_COPY =
  "Cluster stopped filtering. To get their emails again, re-subscribe on their site.";

/** Forgets the request and removes Cluster's filters for it. The request
 * the sender received can't be recalled. */
export async function undoUnsubscribe(key: string): Promise<void> {
  const request = ctx.settings.unsubscribeRequests[key];
  if (!request) return;
  const filters = [request.filterId, request.trashFilterId].filter((id): id is string => Boolean(id));
  if (request.provider === "gmail" && filters.length > 0) {
    const token = await gmailProvider.getAuthToken(false);
    for (const id of filters) {
      // A filter the user already deleted in Gmail is fine to skip.
      await removeGmailBackstop(token, id).catch((err) => log.error("Could not remove an unsubscribe filter", err));
    }
  }
  ctx.settings = await mutateSettings((current) => {
    const requests = { ...current.unsubscribeRequests };
    delete requests[key];
    return { ...current, unsubscribeRequests: requests };
  });
}

/** Sends a sender's later mail to Trash after they kept sending. */
export async function trashStillSending(key: string): Promise<void> {
  const request = ctx.settings.unsubscribeRequests[key];
  if (!request || request.provider !== "gmail" || request.trashFilterId) return;
  const token = await gmailProvider.getAuthToken(false);
  const trashFilterId = await addGmailTrashFilter(token, key.slice(key.indexOf(":") + 1));
  ctx.settings = await mutateSettings((current) => ({
    ...current,
    unsubscribeRequests: {
      ...current.unsubscribeRequests,
      [key]: { ...current.unsubscribeRequests[key], trashFilterId },
    },
  }));
}
