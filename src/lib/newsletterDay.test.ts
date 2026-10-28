import { describe, expect, it } from "vitest";
import { lastDeliveryMoment } from "./newsletterDay";

const at = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h).getTime();

describe("lastDeliveryMoment", () => {
  it("is Saturday 8 am of this week once it has passed, else last week's", () => {
    // Sat 31 Oct 2026
    expect(lastDeliveryMoment(at(2026, 9, 31, 9))).toBe(at(2026, 9, 31, 8));
    expect(lastDeliveryMoment(at(2026, 9, 31, 7))).toBe(at(2026, 9, 24, 8));
    expect(lastDeliveryMoment(at(2026, 9, 27, 12))).toBe(at(2026, 9, 24, 8)); // Tuesday
    expect(lastDeliveryMoment(at(2026, 10, 1, 12))).toBe(at(2026, 9, 31, 8)); // Sunday
  });

  it("is today's 8 am once passed when daily, else yesterday's", () => {
    expect(lastDeliveryMoment(at(2026, 9, 27, 12), true)).toBe(at(2026, 9, 27, 8));
    expect(lastDeliveryMoment(at(2026, 9, 27, 7), true)).toBe(at(2026, 9, 26, 8));
  });
});
