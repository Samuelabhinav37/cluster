import { beforeEach, describe, expect, it, vi } from "vitest";
import { GmailApiError } from "./gmailApi";
import { describeRun, getRunReports, markStalled, MAX_REPORTS, reportText, startRun, STALL_MS } from "./runReport";

let store: Record<string, unknown> = {};
beforeEach(() => {
  store = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (values: Record<string, unknown>) => void Object.assign(store, structuredClone(values)),
      },
    },
  });
});

describe("runReport", () => {
  it("records each step, keeps going after a failure, and says why in plain words", async () => {
    let t = 1_000_000;
    const run = await startRun("sweep", () => t);
    await run.step("tagging", 0, async () => ((t += 60_000), 12), (n) => ({ labelled: n }));
    const moved = await run.step("sweep", 0, async () => {
      throw new GmailApiError(429, "rate");
    });
    await run.step("hold", 0, async () => 3, (n) => ({ held: n }));
    expect(moved).toBe(0);
    expect(run.succeeded("tagging")).toBe(true);
    expect(run.succeeded("tagging", "sweep")).toBe(false);
    const report = await run.finish();
    expect(report.status).toBe("partial");
    expect(describeRun(report)).toBe(
      "Labelled 12, held 3 in the Screener in 1 min. Moving labelled mail out failed: Gmail said too many requests.",
    );
    const [saved] = await getRunReports();
    expect(saved.status).toBe("partial");
    expect(reportText([saved])).toContain("FAIL sweep");
  });

  it("marks a run that went quiet as stalled, with the step it stopped in", async () => {
    const t = 5_000_000;
    const run = await startRun("read", () => t);
    void run.step("index build", false, () => new Promise<boolean>(() => {}));
    await new Promise((r) => setTimeout(r, 0));
    expect(await markStalled(t + STALL_MS - 1)).toEqual([]);
    const [stalled] = await markStalled(t + STALL_MS);
    expect(stalled.status).toBe("stalled");
    expect(describeRun(stalled)).toContain("Paused while reading your mail");
  });

  it("a long step with no progress calls stays alive while the worker runs", async () => {
    vi.useFakeTimers();
    try {
      let t = 7_000_000;
      const run = await startRun("sweep", () => t);
      void run.step("filter sync", 0, () => new Promise<number>(() => {}));
      for (let i = 0; i < 40; i++) {
        t += 30_000;
        await vi.advanceTimersByTimeAsync(30_000);
      }
      expect(await markStalled(t + 1)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps one quiet run, so empty sweeps don't push real runs out", async () => {
    const busy = await startRun("sweep", () => 1);
    await busy.step("sweep", 0, async () => 5, (n) => ({ moved: n }));
    await busy.finish();
    for (let i = 2; i < 6; i++) await (await startRun("sweep", () => i)).finish();
    const all = await getRunReports();
    expect(all.map((r) => r.startedAt)).toEqual([1, 5]);
  });

  it("keeps only the newest reports", async () => {
    for (let i = 0; i < MAX_REPORTS + 3; i++) {
      const run = await startRun("sweep", () => i);
      await run.step("sweep", 0, async () => 1, (n) => ({ moved: n }));
      await run.finish();
    }
    const all = await getRunReports();
    expect(all).toHaveLength(MAX_REPORTS);
    expect(all.at(-1)!.startedAt).toBe(MAX_REPORTS + 2);
  });
});
