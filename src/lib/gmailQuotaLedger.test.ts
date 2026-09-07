import { beforeEach, describe, expect, it } from "vitest";
import {
  _internals,
  clearGmailQuotaLedger,
  gmailQuotaHeadroom,
  penalizeGmailQuota,
  reserveGmailQuota,
} from "./gmailQuotaLedger";

function fakeChromeStorage() {
  let store: Record<string, unknown> = {};
  return {
    local: {
      async get(key: string) {
        return key in store ? { [key]: store[key] } : {};
      },
      async set(items: Record<string, unknown>) {
        store = { ...store, ...items };
      },
      async remove(key: string) {
        delete store[key];
      },
    },
  };
}

/** Time only moves when the code under test sleeps. */
function makeClock() {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: (ms: number) => {
      t += ms;
      return Promise.resolve();
    },
  };
}

const { BUDGET } = _internals;

beforeEach(async () => {
  (globalThis as any).chrome = { storage: fakeChromeStorage() };
  await clearGmailQuotaLedger(); // reset module state (storageOk, mem mirror)
});

describe("gmailQuotaLedger", () => {
  it("lets calls through with no wait while the window has room", async () => {
    const clock = makeClock();
    for (let i = 0; i < 10; i++) {
      expect(await reserveGmailQuota(20, clock)).toBe(0);
    }
    expect(clock.now()).toBe(1_000_000); // never slept
  });

  it("blocks once the trailing-60s spend would exceed the budget", async () => {
    const clock = makeClock();
    await reserveGmailQuota(BUDGET, clock);
    const waited = await reserveGmailQuota(20, clock);
    expect(waited).toBeGreaterThanOrEqual(60_000);
    expect(await reserveGmailQuota(20, clock)).toBe(0);
  });

  it("remembers spend across separate calls — a reload can't reset it", async () => {
    const clock = makeClock();
    await reserveGmailQuota(BUDGET - 10, clock);
    const waited = await reserveGmailQuota(100, clock);
    expect(waited).toBeGreaterThanOrEqual(60_000);
  });

  it("penalizeGmailQuota parks every context for a full window", async () => {
    const clock = makeClock();
    await penalizeGmailQuota(clock);
    const waited = await reserveGmailQuota(5, clock);
    expect(waited).toBeGreaterThanOrEqual(60_000);
  });

  it("lets a single call larger than the whole budget through rather than deadlock", async () => {
    const clock = makeClock();
    expect(await reserveGmailQuota(BUDGET * 3, clock)).toBe(0);
  });

  it("clearGmailQuotaLedger frees the budget again", async () => {
    const clock = makeClock();
    await reserveGmailQuota(BUDGET, clock);
    await clearGmailQuotaLedger();
    expect(await reserveGmailQuota(20, clock)).toBe(0);
  });

  it("reports remaining headroom in the current window", async () => {
    const clock = makeClock();
    expect(await gmailQuotaHeadroom(clock)).toBe(BUDGET);
    await reserveGmailQuota(1000, clock);
    expect(await gmailQuotaHeadroom(clock)).toBe(BUDGET - 1000);
  });

  it("keeps pacing (at half budget) when storage is unavailable instead of failing open", async () => {
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: () => Promise.reject(new Error("unavailable")),
          set: () => Promise.reject(new Error("unavailable")),
          remove: () => Promise.resolve(),
        },
      },
    };
    const clock = makeClock();
    // First call trips the storage failure and still records in memory.
    expect(await reserveGmailQuota(BUDGET / 2, clock)).toBe(0);
    // Budget is halved now, so this must wait.
    const waited = await reserveGmailQuota(20, clock);
    expect(waited).toBeGreaterThanOrEqual(60_000);
  });
});
