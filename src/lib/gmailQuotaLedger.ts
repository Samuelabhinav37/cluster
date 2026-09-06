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
// Sit well under Gmail's 6,000: the lock closes the cross-context race, but a
// rate-limit 403 can still slip through on a retry (fetchWithRetry re-hits
// Gmail without re-reserving), and Google's own window need not align with
// ours. The ~1,500-unit gap absorbs both.
const BUDGET = 4500;

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
