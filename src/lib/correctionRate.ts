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
