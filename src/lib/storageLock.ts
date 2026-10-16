// chrome.storage has no atomic read-modify-write. Web Locks coordinates the
// dashboard and service worker (separate JS contexts); the promise chain is a
// fallback for tests/older runtimes where navigator.locks is unavailable.

const chains = new Map<string, Promise<unknown>>();

// Keys with a holder or a queued caller, for tryWithStorageLock's fallback.
const pending = new Map<string, number>();

function withProcessLocalLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = chains.get(key) ?? Promise.resolve();
  pending.set(key, (pending.get(key) ?? 0) + 1);
  const release = () => {
    const left = (pending.get(key) ?? 1) - 1;
    if (left > 0) pending.set(key, left);
    else pending.delete(key);
  };
  const guarded = () => fn().finally(release);
  const run = prior.then(guarded, guarded);
  // Swallow rejection for the *chain* so one failed holder doesn't reject every
  // queued caller; the real result/rejection still goes back to `run`'s caller.
  chains.set(
    key,
    run.then(
      () => {},
      () => {},
    ),
  );
  return run;
}

export async function withStorageLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (locks) {
    return await locks.request<Promise<T>>(`cluster-storage:${key}`, { mode: "exclusive" }, () => fn());
  }
  return await withProcessLocalLock(key, fn);
}

/**
 * Runs `fn` only if the lock is free right now; otherwise resolves to
 * `undefined` without waiting. For background work that must not queue
 * behind a long holder (the dashboard's first mail-index build can hold its
 * lock for many minutes, past a service worker's lifetime).
 */
export async function tryWithStorageLock<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
  const locks = globalThis.navigator?.locks;
  if (locks) {
    return await locks.request<Promise<T | undefined>>(
      `cluster-storage:${key}`,
      { mode: "exclusive", ifAvailable: true },
      (lock) => (lock ? fn() : Promise.resolve(undefined)),
    );
  }
  if (pending.has(key)) return undefined;
  return await withProcessLocalLock(key, fn);
}
