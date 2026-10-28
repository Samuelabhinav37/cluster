import { describe, expect, it } from "vitest";
import { applyCensus, cadenceLabel, senderUnread, senderVolume } from "./census";
import type { SenderSummary } from "./senderModel";

function sender(address: string, count: number, unread: number): SenderSummary {
  return {
    key: `gmail:${address}`,
    provider: "gmail",
    address,
    count,
    messages: Array.from({ length: count }, (_, i) => ({ unread: i < unread })),
  } as unknown as SenderSummary;
}

describe("applyCensus", () => {
  it("adds totals only where the census counted more than was read", () => {
    const shop = sender("deals@shop.com", 3, 1);
    const pal = sender("pal@x.com", 2, 0);
    applyCensus(
      [shop, pal],
      [
        {
          provider: "gmail",
          address: "deals@shop.com",
          ids: ["1", "2", "3", "4", "5"],
          unread: 4,
          starred: 0,
          countedAt: 0,
        },
        { provider: "gmail", address: "pal@x.com", ids: ["a"], unread: 0, starred: 0, countedAt: 0 },
      ],
    );
    expect([senderVolume(shop), senderUnread(shop)]).toEqual([5, 4]);
    expect([senderVolume(pal), senderUnread(pal)]).toEqual([2, 0]);
    // Actions still see only what was read.
    expect(shop.count).toBe(3);
  });
});

describe("cadenceLabel", () => {
  it("names the real rate", () => {
    expect(cadenceLabel(60, 30)).toBe("Daily");
    expect(cadenceLabel(13, 30)).toBe("3 a week");
    expect(cadenceLabel(2, 30)).toBe("2 a month");
    expect(cadenceLabel(1, 90)).toBe("Now and then");
  });
});
