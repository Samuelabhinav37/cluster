// Where the inbox scan stands, shared by the dashboard (reading) and the
// background runner (labelling) through chrome.storage.local, so the
// Overview scan card shows the same scan whichever side is doing the work.
import type { SortBucket } from "./sortTaxonomy";

export type ScanPhase = "reading" | "checking" | "labelling" | "done";
export const SCAN_PHASES: readonly ScanPhase[] = ["reading", "checking", "labelling", "done"];

export interface ScanState {
  phase: ScanPhase;
  done: number;
  total: number;
  byBucket: Partial<Record<SortBucket, number>>;
  labelled: number;
  fixed: number;
  /** Inbox mail that fits no label. */
  unsorted: number;
  startedAt: number;
  finishedAt: number;
  /** Closed on Overview; a new scan opens it again. */
  dismissed: boolean;
}

const KEY = "scanState";

export function newScan(now = Date.now()): ScanState {
  return { phase: "reading", done: 0, total: 0, byBucket: {}, labelled: 0, fixed: 0, unsorted: 0, startedAt: now, finishedAt: 0, dismissed: false };
}

export async function getScan(): Promise<ScanState | null> {
  const got = await chrome.storage.local.get(KEY);
  return (got[KEY] as ScanState | undefined) ?? null;
}

export async function setScan(patch: Partial<ScanState>): Promise<ScanState> {
  const next = { ...((await getScan()) ?? newScan()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function onScanChange(fn: (scan: ScanState) => void): void {
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes[KEY]?.newValue) fn(changes[KEY].newValue as ScanState);
  });
}
