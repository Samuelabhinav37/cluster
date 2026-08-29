// chrome.storage has no atomic read-modify-write. Two async paths that each do
// get -> mutate -> set on the same key (the dashboard and the background alarm,
// say) will interleave and the second set clobbers the first's change. This
// serialises those sequences per storage key: callers wrap their whole
// get/mutate/set in withStorageLock(key, ...) and each runs only after the
// previous holder of that key resolves.
//
// Same primitive the Athena event queue uses; extracted here so the settings
// action-log (Phase 3) shares one implementation.

const chains = new Map<string, Promise<unknown>>();

export function withStorageLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
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
