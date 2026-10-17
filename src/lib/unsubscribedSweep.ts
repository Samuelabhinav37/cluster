// The backstop for senders a Gmail filter can't cover. A sender with a
// List-Id gets a filter at unsubscribe time (unsubscribeBackstop.ts); one
// without gets this instead: every few minutes, list mail that arrived from
// them after the request moves from the inbox to "Unsubscribed". Only mail
// carrying an unsubscribe header or a List-Id moves, so their receipts and
// password resets stay. Starred mail always stays. Each run is logged with
// Undo, so it shows in Recently done.
import { appendActionLog, makeLogId } from "./actionLog";
import { clusterLabelName } from "./clusterLabels";
import { batchModify, getOrCreateLabel } from "./gmailApi";
import { refreshIndexForBackground } from "./indexTriage";
import { log } from "./log";
import { openMailIndex, type MailIndexStore } from "./mailIndex";
import { gmailProvider } from "./providers/gmailProvider";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import { getSettings, type UnsubscribeRequestRecord } from "./settingsStore";

export const SWEEP_MAX = 300;

function isListMail(m: NormalizedMessageMetadata): boolean {
  return Boolean(m.listId || m.unsubscribe.postUrl || m.unsubscribe.httpUrl || m.unsubscribe.mailto);
}

/** Inbox ids to move, newest first, capped at SWEEP_MAX. */
export function unsubscribedToFile(
  rows: readonly NormalizedMessageMetadata[],
  requests: Record<string, UnsubscribeRequestRecord>,
): string[] {
  const after = new Map<string, number>();
  for (const [key, request] of Object.entries(requests)) {
    // A filter already files their list mail on arrival, or trashes it.
    if (request.provider !== "gmail" || request.filterId || request.trashFilterId) continue;
    after.set(key.slice(key.indexOf(":") + 1), request.requestedAt);
  }
  if (after.size === 0) return [];
  return rows
    .filter((m) => {
      const requestedAt = after.get(m.fromAddress);
      return (
        requestedAt !== undefined &&
        m.receivedAt > requestedAt &&
        m.labelIds?.includes("INBOX") &&
        !m.isProtected &&
        isListMail(m)
      );
    })
    .sort((a, b) => b.receivedAt - a.receivedAt)
    .slice(0, SWEEP_MAX)
    .map((m) => m.id);
}

/** Runs one sweep from the background alarm. Returns how many moved. */
export async function runUnsubscribedSweep(store?: MailIndexStore): Promise<number> {
  const settings = await getSettings();
  if (!Object.values(settings.unsubscribeRequests).some((r) => r.provider === "gmail" && !r.filterId)) return 0;
  if (!(await gmailProvider.isConnected())) return 0;
  const index = store ?? (await openMailIndex());
  // The change feed costs a couple of units when nothing arrived.
  const ready = await refreshIndexForBackground([gmailProvider], settings.scanWindowDays, index);
  if (ready.length === 0) return 0;
  const ids = unsubscribedToFile(await index.all("gmail"), settings.unsubscribeRequests);
  if (ids.length === 0) return 0;
  try {
    const token = await gmailProvider.getAuthToken(false);
    const labelName = clusterLabelName("unsubscribed");
    await batchModify(token, ids, [await getOrCreateLabel(token, labelName)], ["INBOX"]);
    await appendActionLog([
      {
        id: makeLogId("sort"),
        at: Date.now(),
        kind: "sort",
        summary: `Filed ${ids.length} message${ids.length === 1 ? "" : "s"} from senders you unsubscribed from`,
        undo: { provider: "gmail", ids, via: "unsort", labelName, wasFiledOut: true },
      },
    ]);
    return ids.length;
  } catch (err) {
    log.error("Filing mail from unsubscribed senders failed", err);
    return 0;
  }
}
