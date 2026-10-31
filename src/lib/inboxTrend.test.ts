import { describe, expect, it } from "vitest";
import { recordUnread, unreadDays, unreadWeekAgo } from "./inboxTrend";

const DAY = 86_400_000;
const now = new Date(2026, 9, 31, 12).getTime();

describe("inboxTrend", () => {
  it("keeps one count a day for two weeks", () => {
    let snaps: Record<string, number> = {};
    for (let d = 20; d >= 0; d--) snaps = recordUnread(snaps, 100 - d, now - d * DAY);
    expect(Object.keys(snaps)).toHaveLength(14);
    expect(unreadDays(snaps, now)).toEqual([94, 95, 96, 97, 98, 99, 100]);
    expect(unreadWeekAgo(snaps, now)).toBe(93);
  });

  it("leaves gaps empty", () => {
    const snaps = recordUnread({}, 12, now);
    expect(unreadDays(snaps, now)).toEqual([null, null, null, null, null, null, 12]);
    expect(unreadWeekAgo(snaps, now)).toBeUndefined();
  });
});
