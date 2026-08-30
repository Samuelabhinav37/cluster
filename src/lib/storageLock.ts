// chrome.storage has no atomic read-modify-write. Web Locks coordinates the
// dashboard and service worker (separate JS contexts); the promise chain is a
// fallback for tests/older runtimes where navigator.locks is unavailable.

const chains = new Map<string, Promise<unknown>>();

function withProcessLocalLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = chains.get(key) ?? Promise.resolve();
  const run = prior.then(fn, fn);
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
