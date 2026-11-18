import { describe, expect, it } from "vitest";
import { listAge } from "./listDates";

describe("listAge", () => {
  const now = Date.parse("2026-11-18T00:00:00Z");
  it("goes by the oldest list, and is stale past 30 days", () => {
    expect(listAge({ spam: "2026-11-16T00:00:00Z", malware: "2026-11-10T00:00:00Z" }, now)).toEqual({ oldest: Date.parse("2026-11-10T00:00:00Z"), stale: false });
    expect(listAge({ spam: "2026-11-16T00:00:00Z", malware: "2026-11-16T00:00:00Z", brands: "2026-10-01T00:00:00Z" }, now).stale).toBe(true);
  });
});
