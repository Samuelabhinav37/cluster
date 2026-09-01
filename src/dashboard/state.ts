// Shared dashboard state — the seam that lets per-feature modules (sortInbox.ts
// and, later, the other tabs) read the current scan/settings and trigger a
// rescan without importing the dashboard shell (which would be circular).
//
// dashboard.ts is the sole writer of `ctx.senders`. Both dashboard.ts and
// feature modules write `ctx.settings`, always via
// `ctx.settings = await updateSettings(...)`, so the one object stays the single
// source of truth.
import type { ActionLogKind, ActionLogUndo } from "../lib/actionLog";
import type { EmailProvider, ProviderId } from "../lib/providers/emailProvider";
import { gmailProvider } from "../lib/providers/gmailProvider";
import { outlookProvider } from "../lib/providers/outlookProvider";
import type { SenderSummary } from "../lib/senderModel";
import type { ClusterSettings } from "../lib/settingsStore";

export const providerById = new Map<ProviderId, EmailProvider>([
  [gmailProvider.id, gmailProvider],
  [outlookProvider.id, outlookProvider],
]);

// Gmail is always active; Outlook is pushed in once connected (main()).
export const activeProviders: EmailProvider[] = [gmailProvider];

export const ctx: { settings: ClusterSettings; senders: SenderSummary[] } = {
  settings: undefined as never,
  senders: [],
};

export type LogActionFn = (
  kind: ActionLogKind,
  summary: string,
  undo?: ActionLogUndo,
) => Promise<void>;

let rescanImpl: () => Promise<void> = async () => {};
let logActionImpl: LogActionFn = async () => {};

/** dashboard.ts registers its scanAndRender / logAction here after defining them. */
export function setBridge(bridge: { rescan: () => Promise<void>; logAction: LogActionFn }): void {
  rescanImpl = bridge.rescan;
  logActionImpl = bridge.logAction;
}

export const rescan = (): Promise<void> => rescanImpl();
export const logAction: LogActionFn = (kind, summary, undo) => logActionImpl(kind, summary, undo);
