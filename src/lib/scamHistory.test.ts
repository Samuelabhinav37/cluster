import { describe, expect, it } from "vitest";
import { heldByWeek, MAX_WEEKS, recordHeld, weekStartOf, type ScamWeek } from "./scamHistory";

const DAY = 24 * 60 * 60 * 1000;
// Wednesday 7 Oct 2026, 15:00 UTC
const WED = Date.UTC(2026, 9, 7, 15);
const MONDAY = Date.UTC(2026, 9, 5);

describe("weekStartOf", () => {
  it("is Monday 00:00 UTC of the same week", () => {
    expect(weekStartOf(WED)).toBe(MONDAY);
    expect(weekStartOf(MONDAY)).toBe(MONDAY);
    expect(weekStartOf(MONDAY - 1)).toBe(MONDAY - 7 * DAY);
  });
});

describe("recordHeld", () => {
  it("adds a run to its week and counts brands and warning signs", () => {
    let h: ScamWeek[] = [];
    h = recordHeld(h, { count: 2, brands: ["paypal"], kinds: ["lookalike-domain", "lure-language"] }, WED);
    h = recordHeld(h, { count: 1, brands: ["paypal", "netflix"], kinds: ["lookalike-domain"] }, WED + DAY);
    expect(h).toEqual([
      { weekStart: MONDAY, held: 3, brands: { paypal: 2, netflix: 1 }, kinds: { "lookalike-domain": 2, "lure-language": 1 } },
    ]);
  });

  it("ignores a run that held nothing", () => {
    expect(recordHeld([], { count: 0, brands: ["paypal"], kinds: [] }, WED)).toEqual([]);
  });

  it("keeps only the newest weeks", () => {
    let h: ScamWeek[] = [];
    for (let i = 0; i < MAX_WEEKS + 3; i++) h = recordHeld(h, { count: 1, brands: [], kinds: [] }, WED - i * 7 * DAY);
    expect(h).toHaveLength(MAX_WEEKS);
    expect(h.at(-1)!.weekStart).toBe(MONDAY);
  });
});

describe("heldByWeek", () => {
  it("returns the last N weeks oldest first, with empty weeks as zero", () => {
    const h = recordHeld(recordHeld([], { count: 4, brands: [], kinds: [] }, WED), { count: 2, brands: [], kinds: [] }, WED - 14 * DAY);
    expect(heldByWeek(h, 4, WED).map((w) => w.held)).toEqual([0, 2, 0, 4]);
  });
});
