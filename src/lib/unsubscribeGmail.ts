// Gmail's side of the unsubscribe queue: how an approved email is sent and
// how an interrupted send is checked. Used by the dashboard right after the
// user confirms, and by the background alarm to finish a run the service
// worker was stopped in the middle of.
import { getAuthToken, hasRecentSentTo, sendRawMessage } from "./gmailApi";
import { toGmailRaw, unsubscribeMime } from "./unsubscribeMail";
import {
  classifyGmailSendError,
  listUnsubscribeQueue,
  runUnsubscribeQueue,
  type QueueDeps,
  type QueueRunResult,
} from "./unsubscribeQueue";

export function gmailQueueDeps(token: () => Promise<string> = () => getAuthToken(false)): QueueDeps {
  return {
    async send(item) {
      if (item.provider !== "gmail") throw new Error(`No send path for ${item.provider}`);
      return sendRawMessage(await token(), toGmailRaw(unsubscribeMime(item)));
    },
    async alreadySent(item) {
      return hasRecentSentTo(await token(), item.to);
    },
    classify: classifyGmailSendError,
  };
}

/** Runs the queue only when something is waiting, so the alarm costs nothing
 * on the usual tick. */
export async function resumeUnsubscribeQueue(deps: QueueDeps = gmailQueueDeps()): Promise<QueueRunResult | undefined> {
  const waiting = (await listUnsubscribeQueue()).some(
    (i) => i.provider === "gmail" && (i.status === "queued" || i.status === "sending"),
  );
  if (!waiting) return undefined;
  return runUnsubscribeQueue(deps);
}
