// One computer does the background work. With Cluster on two computers,
// both used to label, move and hold mail on the same Gmail every 5 minutes:
// double the quota, and two sets of settings could disagree. The computer
// that last renewed a lease in Chrome sync does the work; another takes
// over once it has been quiet for STALE_MS (closed, asleep, uninstalled).
// Without Chrome sync, storage.sync stays on this computer, so it always works.
// shortcut: two computers claiming in the same minute both run once until
// sync settles (last write wins); a Gmail-side lock would close that gap.

const LEASE_KEY = "workerLease";
const DEVICE_KEY = "deviceId";
/** Three missed 5-minute runs. */
export const STALE_MS = 15 * 60 * 1000;

interface Lease {
  id: string;
  at: number;
}

async function deviceId(): Promise<string> {
  const got = await chrome.storage.local.get(DEVICE_KEY);
  const known = got[DEVICE_KEY];
  if (typeof known === "string" && known) return known;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [DEVICE_KEY]: id });
  return id;
}

/** True when this computer should do the background work now; renews its lease.
 * `canWork` false (signed out): never claims, and lets go of a lease it holds,
 * so another computer takes over on its next run instead of never. */
export async function holdWorkerLease(now = Date.now(), canWork = true): Promise<boolean> {
  const sync = globalThis.chrome?.storage?.sync;
  if (!sync) return canWork;
  const id = await deviceId();
  const lease = (await sync.get(LEASE_KEY))[LEASE_KEY] as Lease | undefined;
  if (!canWork) {
    if (lease?.id === id && lease.at > 0) await sync.set({ [LEASE_KEY]: { id, at: 0 } satisfies Lease }).catch(() => {});
    return false;
  }
  if (lease && lease.id !== id && now - lease.at < STALE_MS) return false;
  try {
    await sync.set({ [LEASE_KEY]: { id, at: now } satisfies Lease });
  } catch {
    // Sync quota or offline: work anyway rather than leave mail unsorted.
  }
  return true;
}
