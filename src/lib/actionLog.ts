import type { ProviderId } from "./providers/emailProvider";
import { mutateSettings } from "./settingsStore";

// A rolling record of everything Cluster did to your mail — the "here's what
// I moved, catch my mistakes" loop (SaneBox's Daily Digest, done locally).
// Written by every action path (bulk + single-row + rule runs + background
// triage); read by the "Recently done" tab. Capped at MAX_LOG_ENTRIES in
// settingsStore. Full logic (appendActionLog, undo wiring) lands in Phase 3.

export type ActionLogKind =
  | "trash"
  | "archive"
  | "pin"
  | "markRead"
  | "mute"
  | "unsubscribe"
  | "snooze"
  | "labelSuspicious"
  | "keepSorted"
  | "sort"
  | "screener"
  | "rule"
  | "labels";

export interface ActionLogUndo {
  provider: ProviderId;
  ids: string[];
  via: "untrash" | "unarchive" | "unmute" | "unlabel-suspicious" | "unsort";
  /** For via: "unmute", and "unsort" from Keep sorted: the address whose
   * standing filter to remove. */
  fromAddress?: string;
  /** Only for via: "unsort" — the label to strip, and whether the messages
   * were also filed out of the inbox (so undo can put them back). */
  labelName?: string;
  wasFiledOut?: boolean;
  /** Sender keys whose accepted suggestion should be corrected if undone. */
  senderKeys?: string[];
}

export interface ActionLogEntry {
  id: string;
  at: number;
  kind: ActionLogKind;
  summary: string;
  /** Present only when the action can be reversed from the dashboard. */
  undo?: ActionLogUndo;
  /** Set once the user has undone this entry. */
  undone?: boolean;
}

export const MAX_LOG_ENTRIES = 200;

/** Emails an entry took out of the inbox (trashed, archived or filed out), for Home's "cleared". */
export function clearedCount(e: ActionLogEntry): number {
  const u = e.undo;
  if (e.undone || !u) return 0;
  return u.via === "untrash" || u.via === "unarchive" || (u.via === "unsort" && u.wasFiledOut)
    ? u.ids.length
    : 0;
}

// Append under the settings storage lock so a dashboard action and the
// background triage writing entries at the same time don't clobber each other
// (chrome.storage has no atomic update). Keeps only the newest MAX_LOG_ENTRIES.
export async function appendActionLog(entries: ActionLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await mutateSettings((settings) => ({
    ...settings,
    actionLog: [...settings.actionLog, ...entries].slice(-MAX_LOG_ENTRIES),
    // The log drops old entries, so "since you started" keeps its own count.
    clearedTotal: (settings.clearedTotal ?? 0) + entries.reduce((n, e) => n + clearedCount(e), 0),
  }));
}

export function makeLogId(kind: ActionLogKind): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
