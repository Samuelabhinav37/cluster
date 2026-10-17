// What the user told Cluster about its suggestions, per sender: accepted,
// dismissed, undone, and when a dismissal stops hiding the sender. Counts
// only, never message ids, subjects or bodies. The engagement itself (how
// much of a sender's mail you open) now comes from the mail index through
// senderProfile.ts, so it no longer needs to be sampled across visits.

export interface SenderEngagementRecord {
  lastSeenAt: number;
  acceptedActions: number;
  dismissedSuggestions: number;
  undoneActions: number;
  snoozedUntil?: number;
}

export type SenderEngagementMap = Record<string, SenderEngagementRecord>;
export type EngagementFeedback = "accept" | "dismiss" | "undo";

const MAX_RECORDS = 1_000;
const RECORD_TTL_MS = 365 * 24 * 60 * 60 * 1_000;
export const SUGGESTION_DISMISS_MS = 30 * 24 * 60 * 60 * 1_000;

/** Keeps only the feedback fields of a stored record (older builds also
 * stored an unread-ratio sample). Undefined for anything unusable. */
export function normalizeEngagementRecord(value: unknown): SenderEngagementRecord | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const r = value as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const record: SenderEngagementRecord = {
    lastSeenAt: num(r.lastSeenAt),
    acceptedActions: num(r.acceptedActions),
    dismissedSuggestions: num(r.dismissedSuggestions),
    undoneActions: num(r.undoneActions),
  };
  if (typeof r.snoozedUntil === "number") record.snoozedUntil = r.snoozedUntil;
  return record;
}

export function recordEngagementFeedback(
  existing: SenderEngagementMap,
  senderKeys: string[],
  feedback: EngagementFeedback,
  now = Date.now(),
): SenderEngagementMap {
  const cutoff = now - RECORD_TTL_MS;
  const next: SenderEngagementMap = {};
  for (const [key, record] of Object.entries(existing)) {
    if (record.lastSeenAt >= cutoff) next[key] = record;
  }
  for (const key of new Set(senderKeys)) {
    const current = next[key] ?? { lastSeenAt: now, acceptedActions: 0, dismissedSuggestions: 0, undoneActions: 0 };
    next[key] = {
      ...current,
      lastSeenAt: now,
      acceptedActions: current.acceptedActions + (feedback === "accept" ? 1 : 0),
      dismissedSuggestions: current.dismissedSuggestions + (feedback === "dismiss" ? 1 : 0),
      undoneActions: current.undoneActions + (feedback === "undo" ? 1 : 0),
      snoozedUntil: feedback === "dismiss" ? now + SUGGESTION_DISMISS_MS : current.snoozedUntil,
    };
  }
  return Object.fromEntries(
    Object.entries(next)
      .sort(([, a], [, b]) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, MAX_RECORDS),
  );
}
