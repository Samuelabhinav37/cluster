import { describe, expect, it } from "vitest";
import { weeklySummary } from "./notices";
import type { ClusterSettings } from "./settingsStore";

const MONDAY = new Date(2026, 9, 26, 9).getTime();
const DAY = 24 * 60 * 60 * 1000;
const base = { notifyWeekly: true, lastWeeklyNotice: 0, actionLog: [{ at: MONDAY - DAY }], scamHistory: [] };
const settings = (o: object = {}) => ({ ...base, ...o }) as unknown as ClusterSettings;

describe("weeklySummary", () => {
  it("goes out on Monday, once a week, only when turned on", () => {
    expect(weeklySummary(settings(), MONDAY)).toBe("Last week Cluster did 1 thing for you and held 0 scams.");
    expect(weeklySummary(settings(), MONDAY + DAY)).toBeNull();
    expect(weeklySummary(settings({ lastWeeklyNotice: MONDAY - DAY }), MONDAY)).toBeNull();
    expect(weeklySummary(settings({ notifyWeekly: false }), MONDAY)).toBeNull();
  });
});
