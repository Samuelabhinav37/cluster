import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("mapWithConcurrency", () => {
  it("never runs more than `limit` tasks at once", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight--;
    });
    expect(peak).toBe(3);
  });

  it("returns results in input order regardless of completion order", async () => {
    const out = await mapWithConcurrency([50, 10, 30, 0], 4, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(out).toEqual([50, 10, 30, 0]);
  });

  it("processes every item exactly once", async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles a limit larger than the item count", async () => {
    const out = await mapWithConcurrency([1, 2], 10, async (n) => n * 2);
    expect(out).toEqual([2, 4]);
  });

  it("returns [] for empty input without invoking the mapper", async () => {
    let called = false;
    const out = await mapWithConcurrency([], 3, async () => {
      called = true;
    });
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it("rejects if any task rejects", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
