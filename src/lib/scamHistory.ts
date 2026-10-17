// A small weekly history of what auto-quarantine held, for the Scam report.
// Counts and brand/kind names only, on this device, the newest MAX_WEEKS
// weeks. The action log can't serve here: it keeps 200 entries of every kind.
import type { ThreatSignalKind } from "./threatSignals";

export interface ScamWeek {
  /** Monday 00:00 UTC of the week, epoch ms. */
  weekStart: number;
  held: number;
  /** Brand key → held emails that pretended to be it. */
  brands: Record<string, number>;
  /** Warning sign → held emails that showed it. */
  kinds: Partial<Record<ThreatSignalKind, number>>;
}

export const MAX_WEEKS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

export function weekStartOf(at: number): number {
  const d = new Date(at);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY_MS;
}

export interface HeldBatch {
  count: number;
  brands: string[];
  kinds: ThreatSignalKind[];
}

/** The history with one auto-quarantine run added to its week. */
export function recordHeld(history: ScamWeek[], batch: HeldBatch, at: number = Date.now()): ScamWeek[] {
  if (batch.count <= 0) return history;
  const weekStart = weekStartOf(at);
  const existing = history.find((w) => w.weekStart === weekStart);
  const week: ScamWeek = existing
    ? { ...existing, brands: { ...existing.brands }, kinds: { ...existing.kinds } }
    : { weekStart, held: 0, brands: {}, kinds: {} };
  week.held += batch.count;
  for (const brand of batch.brands) week.brands[brand] = (week.brands[brand] ?? 0) + 1;
  for (const kind of batch.kinds) week.kinds[kind] = (week.kinds[kind] ?? 0) + 1;
  return [...history.filter((w) => w.weekStart !== weekStart), week]
    .sort((a, b) => a.weekStart - b.weekStart)
    .slice(-MAX_WEEKS);
}

/** Held counts for the last `weeks` weeks ending this week, oldest first,
 * zero-filled for weeks with nothing held. */
export function heldByWeek(history: ScamWeek[], weeks: number, now: number = Date.now()): { weekStart: number; held: number }[] {
  const thisWeek = weekStartOf(now);
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = thisWeek - (weeks - 1 - i) * 7 * DAY_MS;
    return { weekStart, held: history.find((w) => w.weekStart === weekStart)?.held ?? 0 };
  });
}
