// The product's north star (docs/product-plan-2026-11-18.md): corrections per
// 100 emails filed. A correction is an email Cluster filed (a sorting label,
// Personal or the Screener) that you moved to another of its labels, in Gmail
// or from Details. Cluster's own relabels are written to the mail index before
// Gmail reports them, so they never count. Kept on this device only.
import type { EmailDecision } from "./mailEngine";
import type { SenderSummary } from "./senderModel";

/** Local day ("2026-11-18") → emails you re-filed that day. */
export type FixLog = Record<string, number>;

/** Days of history kept. */
export const FIX_DAYS = 56;
const DAY_MS = 86_400_000;
/** Below this many filed emails a rate says more about luck than about Cluster. */
export const MIN_FILED = 20;

const dayKey = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** `log` with `n` more fixes today and days older than FIX_DAYS dropped. */
export function addFixes(log: FixLog, n: number, now: number): FixLog {
  const oldest = dayKey(now - (FIX_DAYS - 1) * DAY_MS);
  const today = dayKey(now);
  const out: FixLog = {};
  for (const [day, count] of Object.entries(log)) if (day >= oldest && Number.isFinite(count) && count > 0) out[day] = count;
  if (n > 0) out[today] = (out[today] ?? 0) + n;
  return out;
}

/** Fixes in the last `days` days, today included. */
export function fixesIn(log: FixLog, now: number, days = 7): number {
  const oldest = dayKey(now - (days - 1) * DAY_MS);
  return Object.entries(log).reduce((sum, [day, count]) => (day >= oldest ? sum + count : sum), 0);
}

/** Emails received in the last `days` days that the engine files somewhere (not Spam, not left in the inbox). */
export function filedIn(senders: readonly SenderSummary[], decided: ReadonlyMap<string, EmailDecision>, now: number, days = 7): number {
  const since = now - days * DAY_MS;
  let n = 0;
  for (const s of senders)
    for (const m of s.messages) {
      const place = decided.get(m.id)?.place;
      if (m.receivedAt >= since && place && place !== "spam") n++;
    }
  return n;
}

/** Fixes per 100 filed emails, rounded to one decimal, or null when too little was filed to say. */
export function fixesPer100(fixed: number, filed: number): number | null {
  return filed < MIN_FILED ? null : Math.round((1000 * fixed) / filed) / 10;
}

export interface AccuracyNumbers {
  /** Fixes per 100 filed in the last 7 days, or null with too little filed. */
  fixesPer100: number | null;
  /** "Not a scam" per 100 holds you reviewed, or null with none reviewed. */
  releasedPer100: number | null;
  /** Share of the week's filed mail left in the Screener, 0 to 100, or null. */
  screenerShare: number | null;
}

/** The three accuracy numbers Diagnostics shows: agreement, false holds, coverage. */
export function accuracyNumbers(
  senders: readonly SenderSummary[],
  decided: ReadonlyMap<string, EmailDecision>,
  fixLog: FixLog,
  holds: { reviewed: number; confirmed: number },
  now: number,
): AccuracyNumbers {
  const filed = filedIn(senders, decided, now);
  const since = now - 7 * DAY_MS;
  let screener = 0;
  for (const s of senders)
    for (const m of s.messages) if (m.receivedAt >= since && decided.get(m.id)?.place === "screener") screener++;
  const pct = (part: number, whole: number) => Math.round((1000 * part) / whole) / 10;
  return {
    fixesPer100: fixesPer100(fixesIn(fixLog, now), filed),
    releasedPer100: holds.reviewed > 0 ? pct(holds.reviewed - holds.confirmed, holds.reviewed) : null,
    screenerShare: filed < MIN_FILED ? null : pct(screener, filed),
  };
}

/** Each label's log with `counts` more today (addFixes per label). */
export function addByLabel(logs: Record<string, FixLog>, counts: Partial<Record<string, number>>, now: number): Record<string, FixLog> {
  const out: Record<string, FixLog> = {};
  for (const label of new Set([...Object.keys(logs), ...Object.keys(counts)])) {
    const log = addFixes(logs[label] ?? {}, counts[label] ?? 0, now);
    if (Object.keys(log).length > 0) out[label] = log;
  }
  return out;
}

/** Research idea 4, abstain by target: a label you fixed more than
 * UNSURE_PER_100 times per 100 over the last 4 weeks stops guessing. Its mail
 * goes to the Screener as "Not sure" unless you filed that sender there.
 * It tries again on its own: with nothing labelled, the 4-week count falls
 * under UNSURE_MIN and the label is back on. */
export const UNSURE_PER_100 = 5;
export const UNSURE_MIN = 50;
const UNSURE_DAYS = 28;
export function unsureLabels(fixes: Record<string, FixLog> = {}, labelled: Record<string, FixLog> = {}, now: number): Set<string> {
  const out = new Set<string>();
  for (const [label, log] of Object.entries(labelled)) {
    const filed = fixesIn(log, now, UNSURE_DAYS);
    const fixed = fixesIn(fixes[label] ?? {}, now, UNSURE_DAYS);
    if (filed >= UNSURE_MIN && fixed >= 3 && (100 * fixed) / filed > UNSURE_PER_100) out.add(label);
  }
  return out;
}
