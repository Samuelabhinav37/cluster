import type { ProviderId } from "./providers/emailProvider";
import { getSettings, updateSettings } from "./settingsStore";
import { withStorageLock } from "./storageLock";

// A rolling record of everything Cluster did to your mail — the "here's what
// I moved, catch my mistakes" loop (SaneBox's Daily Digest, done locally).
// Written by every action path (bulk + single-row + rule runs + background
// triage); read by the "Recently done" tab. Capped at MAX_LOG_ENTRIES in
// settingsStore. Full logic (appendActionLog, undo wiring) lands in Phase 3.

export type ActionLogKind =
  | "trash"
  | "archive"
  | "markRead"
  | "mute"
  | "unsubscribe"
  | "snooze"
  | "labelSuspicious"
  | "keepSorted"
  | "screener"
  | "rule";

export interface ActionLogUndo {
  provider: ProviderId;
  ids: string[];
  via: "untrash" | "unarchive" | "unmute";
  /** Only for via: "unmute" — the address whose standing filter to remove. */
  fromAddress?: string;
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

// Append under the settings storage lock so a dashboard action and the
// background triage writing entries at the same time don't clobber each other
// (chrome.storage has no atomic update). Keeps only the newest MAX_LOG_ENTRIES.
export async function appendActionLog(entries: ActionLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await withStorageLock("clusterSettings", async () => {
    const { actionLog } = await getSettings();
    await updateSettings({ actionLog: [...actionLog, ...entries].slice(-MAX_LOG_ENTRIES) });
  });
}

export function makeLogId(kind: ActionLogKind): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
