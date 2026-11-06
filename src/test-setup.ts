import { afterAll } from "vitest";

// Kai's timers (kaiGuide, kaiWatch) can fire after a DOM test file has torn
// down its window, which vitest reports as an unhandled error. Clear whatever
// a file left pending once its tests finish.
const pending = new Set<ReturnType<typeof setTimeout>>();
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
  const id = realSetTimeout(() => {
    pending.delete(id);
    fn(...args);
  }, ms);
  pending.add(id);
  return id;
}) as typeof setTimeout;

afterAll(() => {
  for (const id of pending) clearTimeout(id);
  pending.clear();
});
