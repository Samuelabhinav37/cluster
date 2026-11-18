// The supervisor: every background job runs through `supervise`, which keeps
// one health row per job (last success, last error, failures in a row), waits
// longer after each failure (1, 2, 4 … 60 minutes) and says so once a job has
// failed WARN_AFTER times in a row (plan steps 2.1 to 2.3). Before this, a
// failing job logged to a console nobody reads and tried again every 5 minutes.

import { plainError } from "./runReport";
import { log } from "./log";
import { withStorageLock } from "./storageLock";

export interface JobHealth {
  failures: number;
  lastOk?: number;
  lastError?: string;
  lastErrorAt?: number;
  /** No new try before this time (the backoff). */
  nextTryAt: number;
}

export type HealthTable = Record<string, JobHealth>;

const KEY = "clusterJobHealth";
export const WARN_AFTER = 3;
const MAX_BACKOFF_MIN = 60;

export async function getJobHealth(): Promise<HealthTable> {
  return ((await chrome.storage.local.get(KEY))[KEY] as HealthTable | undefined) ?? {};
}

/** Jobs that failed WARN_AFTER times or more in a row. */
export function failingJobs(table: HealthTable): [string, JobHealth][] {
  return Object.entries(table).filter(([, h]) => h.failures >= WARN_AFTER);
}

export function backoffMs(failures: number): number {
  return Math.min(MAX_BACKOFF_MIN, 2 ** Math.max(0, failures - 1)) * 60_000;
}

async function record(job: string, next: (h: JobHealth | undefined) => JobHealth): Promise<HealthTable> {
  return withStorageLock(KEY, async () => {
    const table = await getJobHealth();
    table[job] = next(table[job]);
    await chrome.storage.local.set({ [KEY]: table });
    return table;
  });
}

/**
 * Runs `fn` unless the job is waiting out a backoff. Never throws: a failure
 * is recorded, and `onChange` hears the table whenever a job starts or stops
 * failing, so the caller can show it.
 */
export async function supervise<T>(
  job: string,
  fn: () => Promise<T>,
  onChange?: (table: HealthTable) => void | Promise<void>,
  now: () => number = Date.now,
): Promise<T | undefined> {
  const before = (await getJobHealth())[job];
  if (before && before.nextTryAt > now()) return undefined;
  try {
    const result = await fn();
    if (before?.failures) {
      const table = await record(job, () => ({ failures: 0, lastOk: now(), nextTryAt: 0 }));
      if (before.failures >= WARN_AFTER) await onChange?.(table);
    } else if (!before || now() - (before.lastOk ?? 0) > 60 * 60_000) {
      // Successes are written at most hourly: no storage write every 5 minutes.
      await record(job, () => ({ failures: 0, lastOk: now(), nextTryAt: 0 }));
    }
    return result;
  } catch (err) {
    log.error(`${job} failed`, err);
    const table = await record(job, (h) => {
      const failures = (h?.failures ?? 0) + 1;
      return { ...h, failures, lastError: plainError(err), lastErrorAt: now(), nextTryAt: now() + backoffMs(failures) };
    });
    if (table[job].failures === WARN_AFTER) await onChange?.(table);
    return undefined;
  }
}

/** Clears the icon's count, but never a failing job's "!" (that clears on recovery). */
export async function clearCountBadge(): Promise<void> {
  if (failingJobs(await getJobHealth()).length > 0) return;
  await chrome.action?.setBadgeText({ text: "" });
}
