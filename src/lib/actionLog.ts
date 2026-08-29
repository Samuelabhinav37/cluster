import type { ProviderId } from "./providers/emailProvider";

// A rolling record of everything Declutter did to your mail — the "here's what
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
  | "rule";

export interface ActionLogUndo {
  provider: ProviderId;
  ids: string[];
  via: "untrash" | "unarchive" | "unmute";
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
