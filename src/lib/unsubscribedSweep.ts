// The backstop for senders a Gmail filter can't cover. A sender with a
// List-Id gets a filter at unsubscribe time (unsubscribeBackstop.ts); one
// without gets this instead: every few minutes, list mail that arrived from
// them after the request moves from the inbox to "Unsubscribed". Only mail
// carrying an unsubscribe header or a List-Id moves, so their receipts and
// password resets stay. Starred mail always stays. Each run is logged with
// Undo, so it shows in Recently done.
import { appendActionLog, makeLogId } from "./actionLog";
import { clusterLabelName } from "./clusterLabels";
import { batchModify, getOrCreateLabel, muteSender } from "./gmailApi";
import { refreshIndexForBackground } from "./indexTriage";
import { log } from "./log";
import { openMailIndex, type MailIndexStore } from "./mailIndex";
import { gmailProvider } from "./providers/gmailProvider";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import { getSettings, mutateSettings, type UnsubscribeRequestRecord } from "./settingsStore";
import { UNSUBSCRIBE_GRACE_MS, UNSUBSCRIBE_OBSERVATION_MS } from "./unsubscribeOutcome";

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

/** Gmail senders asked to stop 14+ days ago whose list mail still arrived
 * after the 3-day grace, and who aren't muted or trash-filtered yet. */
export function stillSendingToMute(
  rows: readonly NormalizedMessageMetadata[],
  requests: Record<string, UnsubscribeRequestRecord>,
  muted: readonly string[],
  now = Date.now(),
): { key: string; address: string; inboxIds: string[] }[] {
  const mutedSet = new Set(muted.map((a) => a.toLowerCase()));
  const due = new Map<string, { key: string; requestedAt: number }>();
  for (const [key, request] of Object.entries(requests)) {
    if (request.provider !== "gmail" || request.trashFilterId) continue;
    if (now - request.requestedAt < UNSUBSCRIBE_OBSERVATION_MS) continue;
    const address = key.slice(key.indexOf(":") + 1).toLowerCase();
    if (!mutedSet.has(address)) due.set(address, { key, requestedAt: request.requestedAt });
  }
  const out = new Map<string, { key: string; address: string; inboxIds: string[]; late: boolean }>();
  for (const m of rows) {
    const d = due.get(m.fromAddress.toLowerCase());
    if (!d || !isListMail(m)) continue;
    const entry = out.get(d.key) ?? { key: d.key, address: m.fromAddress, inboxIds: [], late: false };
    if (m.receivedAt > d.requestedAt + UNSUBSCRIBE_GRACE_MS) entry.late = true;
    if (m.labelIds?.includes("INBOX") && !m.isProtected) entry.inboxIds.push(m.id);
    out.set(d.key, entry);
  }
  return [...out.values()].filter((e) => e.late).map(({ key, address, inboxIds }) => ({ key, address, inboxIds }));
}

/** Mutes senders still sending 14 days after Unsubscribe (the confirm says so
 * up front). Same filter and log entry as a manual Mute, so Undo works. */
export async function runAutoMute(store?: MailIndexStore, now = Date.now()): Promise<number> {
  const settings = await getSettings();
  const anyDue = Object.values(settings.unsubscribeRequests).some(
    (r) => r.provider === "gmail" && !r.trashFilterId && now - r.requestedAt >= UNSUBSCRIBE_OBSERVATION_MS,
  );
  if (!anyDue || !(await gmailProvider.isConnected())) return 0;
  const index = store ?? (await openMailIndex());
  const ready = await refreshIndexForBackground([gmailProvider], settings.scanWindowDays, index);
  if (ready.length === 0) return 0;
  const toMute = stillSendingToMute(await index.all("gmail"), settings.unsubscribeRequests, settings.mutedSenders, now);
  if (toMute.length === 0) return 0;
  const token = await gmailProvider.getAuthToken(false);
  const done: typeof toMute = [];
  for (const s of toMute) {
    try {
      await muteSender(token, s.address, s.inboxIds);
      done.push(s);
    } catch (err) {
      log.error("Auto-mute failed", err);
    }
  }
  if (done.length === 0) return 0;
  await mutateSettings((current) => ({
    ...current,
    mutedSenders: [...new Set([...current.mutedSenders, ...done.map((s) => s.address)])],
  }));
  await appendActionLog(
    done.map((s) => ({
      id: makeLogId("mute"),
      at: now,
      kind: "mute" as const,
      summary: `Muted ${s.address}, still sending 14 days after Unsubscribe`,
      undo: { provider: "gmail" as const, ids: s.inboxIds, via: "unmute" as const, fromAddress: s.address, senderKeys: [s.key] },
    })),
  );
  return done.length;
}
