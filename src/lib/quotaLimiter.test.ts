import { describe, expect, it } from "vitest";
import { QuotaLimiter } from "./quotaLimiter";

// A deterministic clock. `sleep` is the only thing that advances time from the
// limiter's side; `advance` lets a test move time forward between calls.
function makeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: (ms: number) => {
      t += ms;
      return Promise.resolve();
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("QuotaLimiter", () => {
  it("lets calls through immediately while the window has room", async () => {
    const clock = makeClock();
    const lim = new QuotaLimiter(100, 1000, clock);

    for (let i = 0; i < 5; i++) {
      expect(await lim.take(20)).toBe(0);
    }
    expect(clock.now()).toBe(0); // never slept
  });

  it("waits for the oldest spend to age out once the window is full", async () => {
    const clock = makeClock();
    const lim = new QuotaLimiter(100, 1000, clock);

    expect(await lim.take(60)).toBe(0); // used 60
    // 60 + 60 > 100 → must wait for the t=0 spend to leave the 1000ms window.
    const waited = await lim.take(60);
    expect(waited).toBe(1010); // windowMs - 0 + 10
    expect(clock.now()).toBe(1010);

    // Window now holds only the second spend; a third small call fits.
    expect(await lim.take(30)).toBe(0);
  });

  it("prunes spends outside the window so budget frees up over time", async () => {
    const clock = makeClock();
    const lim = new QuotaLimiter(100, 1000, clock);

    await lim.take(100); // fills the window at t=0
    clock.advance(1001); // whole window has elapsed
    expect(await lim.take(100)).toBe(0); // t=0 spend pruned, no wait
  });

  it("waits across multiple spends when clearing just the oldest isn't enough", async () => {
    const clock = makeClock();
    const lim = new QuotaLimiter(100, 1000, clock);

    await lim.take(50); // A @ t=0
    clock.advance(900);
    await lim.take(50); // B @ t=900 (used 100, still within budget)
    clock.advance(100); // t=1000

    // Needs both A and B out of the window: one sleep clears A, a second clears B.
    const waited = await lim.take(60);
    expect(waited).toBe(10 + 900);
    expect(clock.now()).toBe(1910);
  });

  it("lets a single call larger than the whole budget through rather than deadlock", async () => {
    const clock = makeClock();
    const lim = new QuotaLimiter(100, 1000, clock);

    expect(await lim.take(500)).toBe(0);
    expect(clock.now()).toBe(0);
  });

  it("defaults to a 60s window and the real clock when no deps are given", async () => {
    const lim = new QuotaLimiter(1000);
    // Real Date.now / setTimeout — just assert the immediate path doesn't block.
    expect(await lim.take(10)).toBe(0);
  });
});
