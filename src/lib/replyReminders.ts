// "Remind me if no reply": a thread whose last message is one you sent, and
// that has sat unanswered for `days`, comes back to the inbox unread under
// "⏰ No reply yet". Like Gmail nudges, HEY and Superhuman reminders
// (research/2026-10-27-organizing-rules.md). Gmail only; nothing leaves the
// inbox. Run from the background triage alarm and when turned on.
import { clusterLabelName } from "./clusterLabels";
import { batchModify, getOrCreateLabel, getThreadMinimal, listMessageIds } from "./gmailApi";
import { log } from "./log";
import { getSettings, mutateSettings } from "./settingsStore";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Look this far past the wait for sent mail still worth a nudge. */
const LOOKBACK_DAYS = 14;
const MAX_THREADS = 50;

export interface ThreadView {
  id: string;
  messages: { id: string; at: number; labelIds: string[] }[];
}

/** Threads to bring back: your message is the newest one (drafts ignored),
 * it is at least `days` old, it isn't already in the inbox, and it hasn't
 * been brought back before. */
export function dueReplyReminders(
  threads: readonly ThreadView[],
  now: number,
  days: number,
  reminded: Record<string, string>,
): { threadId: string; messageId: string }[] {
  const out: { threadId: string; messageId: string }[] = [];
  for (const t of threads) {
    const last = t.messages.filter((m) => !m.labelIds.includes("DRAFT")).sort((a, b) => a.at - b.at).at(-1);
    if (!last || !last.labelIds.includes("SENT") || last.labelIds.includes("INBOX")) continue;
    if (now - last.at < days * DAY_MS) continue;
    if (reminded[t.id] === last.id) continue;
    out.push({ threadId: t.id, messageId: last.id });
  }
  return out;
}

/** Brings due threads back; returns how many. */
export async function runReplyReminders(token: string, now = Date.now()): Promise<number> {
  const { replyReminders: cfg } = await getSettings();
  if (!cfg.enabled) return 0;
  const sent = await listMessageIds(token, `in:sent newer_than:${cfg.days + LOOKBACK_DAYS}d older_than:${cfg.days}d`, 200);
  const threadIds = [...new Set(sent.map((m) => m.threadId))].slice(0, MAX_THREADS);
  const threads: ThreadView[] = [];
  for (const id of threadIds) {
    try {
      threads.push(await getThreadMinimal(token, id));
    } catch (err) {
      log.error("Reply reminders: could not read a thread", err);
    }
  }
  const due = dueReplyReminders(threads, now, cfg.days, cfg.reminded);
  if (due.length > 0) {
    const labelId = await getOrCreateLabel(token, clusterLabelName("noReply"));
    await batchModify(token, due.map((d) => d.messageId), ["INBOX", "UNREAD", labelId], []);
  }
  // Remember what came back; forget threads that fell out of the window.
  const live = new Set(threadIds);
  await mutateSettings((current) => {
    const reminded = Object.fromEntries(Object.entries(current.replyReminders.reminded).filter(([id]) => live.has(id)));
    for (const d of due) reminded[d.threadId] = d.messageId;
    return { ...current, replyReminders: { ...current.replyReminders, reminded } };
  });
  return due.length;
}
