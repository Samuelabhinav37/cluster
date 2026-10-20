import { describe, expect, it } from "vitest";
import { describeCategoryCounts } from "./categoryCounts";

describe("describeCategoryCounts", () => {
  it("lists non-empty categories, largest first, summed across accounts", () => {
    expect(
      describeCategoryCounts([
        { category: "updates", total: 3210, unread: 10 },
        { category: "promotions", total: 12431, unread: 9000 },
        { category: "forums", total: 0, unread: 0 },
        { category: "social", total: 1000, unread: 5 },
        { category: "social", total: 120, unread: 5 },
      ]),
    ).toBe("12,431 promotions, 3,210 updates and 1,120 social messages");
  });

  it("handles one category, singulars and nothing at all", () => {
    expect(describeCategoryCounts([{ category: "promotions", total: 1, unread: 1 }])).toBe("1 promotion");
    expect(describeCategoryCounts([])).toBe("");
  });
});
