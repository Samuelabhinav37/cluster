import { afterAll, vi } from "vitest";

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

// vi.waitFor gives up after 1 s by default. With the full suite running files
// in parallel, Kai's typed lines and dashboard renders can take longer, so
// tests failed on timing alone (audit 2026-11-18). Calls that pass their own
// timeout keep it.
const realWaitFor = vi.waitFor;
vi.waitFor = ((callback, options) =>
  realWaitFor(callback, typeof options === "number" ? options : { timeout: 5000, ...options })) as typeof vi.waitFor;
