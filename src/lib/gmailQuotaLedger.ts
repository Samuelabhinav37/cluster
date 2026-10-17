import { withStorageLock } from "./storageLock";
import { log } from "./log";

// Gmail's "Total Query Cost" ceiling is 6,000 units per minute per user, and
// it is enforced *by Google*, across every client that user has authorised —
// including a reloaded dashboard tab and the background service worker, which
// are separate JS contexts with no shared memory.
//
// An in-memory limiter therefore can't work on its own: each page load starts
// believing it has a full budget and immediately fires a scan's worth of
// calls, and the service worker double-spends alongside it. This ledger
// records every spend in chrome.storage.local (shared by all contexts) behind
// a Web Lock (shared too), so the trailing-60s total is real across reloads
// and contexts. If storage is unavailable it degrades to a per-context
// in-memory ledger at half budget rather than failing open (unpaced).

const STORAGE_KEY = "clusterGmailQuotaLedger";
const LOCK_KEY = "gmail-quota";
const WINDOW_MS = 60_000;
// Sit under Gmail's 6,000: the lock closes the cross-context race, so the gap
// only needs to cover retry double-spend (fetchWithRetry re-hits Gmail without
// re-reserving, a few ×20 units) and Google's window not aligning with ours.
// 500 units is plenty for that; going lower just slows every scan down.
const BUDGET = 5500;
/** The per-minute ceiling Cluster holds itself to across all contexts. */
export const GMAIL_QUOTA_BUDGET = BUDGET;

/** [epoch ms, cost in quota units] */
type Spend = [number, number];
interface Ledger {
  spends: Spend[];
}

export interface LedgerDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

// Fallback used when chrome.storage.local can't be read or written. Kept as a
// live mirror of the last-written ledger so a mid-session storage failure
// doesn't lose the running total.
let memSpends: Spend[] = [];
let storageOk = true;

function currentBudget(): number {
  // Storage down → contexts can't coordinate; be twice as cautious so two
  // uncoordinated contexts still sum to under the real ceiling.
  return storageOk ? BUDGET : BUDGET / 2;
}

async function readLedger(): Promise<Ledger> {
  if (!storageOk) return { spends: [...memSpends] };
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const raw = stored[STORAGE_KEY] as Ledger | undefined;
    return raw && Array.isArray(raw.spends) ? raw : { spends: [] };
  } catch (error) {
    log.error("gmailQuotaLedger: read failed — degrading to in-memory pacing", error);
    storageOk = false;
    return { spends: [...memSpends] };
  }
}

async function writeLedger(ledger: Ledger): Promise<void> {
  memSpends = [...ledger.spends]; // always keep the mirror current
  if (!storageOk) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: ledger });
  } catch (error) {
    log.error("gmailQuotaLedger: write failed — degrading to in-memory pacing", error);
    storageOk = false;
  }
}

function prune(ledger: Ledger, now: number): void {
  ledger.spends = ledger.spends.filter(([t]) => now - t < WINDOW_MS);
}

function usedUnits(ledger: Ledger): number {
  return ledger.spends.reduce((sum, [, cost]) => sum + cost, 0);
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Blocks until `cost` units fit inside the trailing-60s window across every
 * Cluster context, records the spend, and resolves with the total time waited
 * (0 when it was immediate). A single call larger than the whole budget is
 * allowed through rather than deadlocking.
 */
export async function reserveGmailQuota(cost: number, deps: LedgerDeps = {}): Promise<number> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? realSleep;
  let waited = 0;

  for (;;) {
    const decision = await withStorageLock(LOCK_KEY, async () => {
      const t = now();
      const ledger = await readLedger();
      prune(ledger, t);
      if (usedUnits(ledger) + cost <= currentBudget() || ledger.spends.length === 0) {
        ledger.spends.push([t, cost]);
        await writeLedger(ledger);
        return { ok: true as const };
      }
      await writeLedger(ledger); // persist the prune even when we can't proceed
      const oldest = ledger.spends[0][0];
      return { ok: false as const, wait: Math.max(WINDOW_MS - (t - oldest) + 50, 100) };
    });
    if (decision.ok) return waited;
    await sleep(decision.wait);
    waited += decision.wait;
  }
}

/**
 * Called after a rate-limit 403 survived the retry layer: Gmail's own window
 * is blown and our ledger under-counted. Front-load a full window of spend so
 * every context holds off for ~60s instead of a fresh page reload hammering
 * straight back into the limit.
 */
export async function penalizeGmailQuota(deps: LedgerDeps = {}): Promise<void> {
  const now = deps.now ?? Date.now;
  await withStorageLock(LOCK_KEY, async () => {
    await writeLedger({ spends: [[now(), BUDGET]] });
  });
}

/**
 * How many units are still free in the current window (>= 0). Lets the
 * background triage skip a cycle instead of adding to a scan that's already
 * pushing the limit.
 */
export async function gmailQuotaHeadroom(deps: LedgerDeps = {}): Promise<number> {
  const now = deps.now ?? Date.now;
  return withStorageLock(LOCK_KEY, async () => {
    const ledger = await readLedger();
    prune(ledger, now());
    return Math.max(0, currentBudget() - usedUnits(ledger));
  });
}

/**
 * Units spent in the last `windowMs` (at most the 60s window). Lets a long
 * build spread its share over the minute instead of spending it in one burst
 * and then sitting still.
 */
export async function gmailQuotaUsedWithin(windowMs: number, deps: LedgerDeps = {}): Promise<number> {
  const now = deps.now ?? Date.now;
  return withStorageLock(LOCK_KEY, async () => {
    const ledger = await readLedger();
    const t = now();
    return ledger.spends
      .filter(([at]) => t - at < Math.min(windowMs, WINDOW_MS))
      .reduce((sum, [, cost]) => sum + cost, 0);
  });
}

export interface BuildPace {
  /** Units per minute the build may spend; the rest is left for clicks. */
  share: number;
  /** Units one build batch costs. */
  batchUnits: number;
  /** Shortest gap between batches. */
  minGapMs: number;
}

/**
 * How long a long build should wait before its next batch (0 = go now).
 * Whatever share is left in the window is spread evenly until the oldest
 * spend ages out, so a burst (the first screen) slows the next batches down
 * instead of letting two through and then stalling for most of a minute.
 */
export function buildPaceDelay(spends: Spend[], now: number, pace: BuildPace): number {
  const recent = spends.filter(([at]) => now - at < WINDOW_MS).sort((a, b) => a[0] - b[0]);
  if (recent.length === 0) return 0;
  const used = recent.reduce((sum, [, cost]) => sum + cost, 0);
  if (used + pace.batchUnits > pace.share) {
    // Full: wait until enough old spends age out to fit one batch.
    let freed = 0;
    for (const [at, cost] of recent) {
      freed += cost;
      if (used - freed + pace.batchUnits <= pace.share) return WINDOW_MS - (now - at) + 50;
    }
    return WINDOW_MS;
  }
  // The b batches that fit go at even gaps until the oldest spend expires
  // (at E): send at x where x - lastAt = (E - x) / b.
  const batches = Math.floor((pace.share - used) / pace.batchUnits);
  const expiresAt = recent[0][0] + WINDOW_MS;
  const lastAt = recent[recent.length - 1][0];
  const sendAt = Math.max(lastAt + pace.minGapMs, (batches * lastAt + expiresAt) / (batches + 1));
  return Math.max(0, sendAt - now);
}

/** {@link buildPaceDelay} against the shared ledger. */
export async function gmailBuildPaceDelay(pace: BuildPace, deps: LedgerDeps = {}): Promise<number> {
  const now = deps.now ?? Date.now;
  return withStorageLock(LOCK_KEY, async () => {
    const ledger = await readLedger();
    const scaled = storageOk ? pace : { ...pace, share: pace.share / 2 };
    return buildPaceDelay(ledger.spends, now(), scaled);
  });
}

/** Wipe the ledger. Test seam, and the manual recovery path. */
export async function clearGmailQuotaLedger(): Promise<void> {
  memSpends = [];
  storageOk = true;
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch (error) {
    log.error("gmailQuotaLedger: clear failed", error);
  }
}

export const _internals = { BUDGET, WINDOW_MS };
