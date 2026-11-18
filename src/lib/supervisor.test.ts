import { beforeEach, describe, expect, it, vi } from "vitest";
import { backoffMs, failingJobs, getJobHealth, supervise, WARN_AFTER } from "./supervisor";

let items: Record<string, unknown> = {};
beforeEach(() => {
  items = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async (k: string) => (k in items ? { [k]: items[k] } : {}),
        set: async (next: Record<string, unknown>) => void Object.assign(items, next),
      },
    },
  };
});

const boom = () => Promise.reject(new Error("Gmail sign-in failed: 502"));

describe("supervise", () => {
  it("never throws, backs off 1, 2, 4 … 60 minutes, and warns once at 3 failures", async () => {
    let t = 0;
    const onChange = vi.fn();
    expect(await supervise("sort", boom, onChange, () => t)).toBeUndefined();
    expect((await getJobHealth()).sort).toMatchObject({ failures: 1, nextTryAt: 60_000, lastError: "Gmail sign-in failed: 502" });
    // Inside the backoff the job doesn't run at all.
    const fn = vi.fn(boom);
    t = 30_000;
    await supervise("sort", fn, onChange, () => t);
    expect(fn).not.toHaveBeenCalled();
    for (let i = 2; i <= WARN_AFTER; i++) {
      t = (await getJobHealth()).sort.nextTryAt;
      await supervise("sort", boom, onChange, () => t);
    }
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(failingJobs(await getJobHealth()).map(([name]) => name)).toEqual(["sort"]);
    expect([1, 2, 3, 7, 20].map((f) => backoffMs(f) / 60_000)).toEqual([1, 2, 4, 60, 60]);
  });

  it("a success clears the failures and says the job recovered", async () => {
    let t = 0;
    const onChange = vi.fn();
    for (let i = 0; i < WARN_AFTER; i++) {
      await supervise("sort", boom, onChange, () => t);
      t = (await getJobHealth()).sort.nextTryAt;
    }
    expect(await supervise("sort", async () => 7, onChange, () => t)).toBe(7);
    expect((await getJobHealth()).sort).toMatchObject({ failures: 0, nextTryAt: 0, lastOk: t });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(failingJobs(onChange.mock.calls[1][0])).toEqual([]);
  });
});
