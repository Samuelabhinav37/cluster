// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { SenderSummary } from "../lib/senderModel";
import { changeChip, dailyCounts, formatBytes, pageList } from "./cleanupPage";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 5, 15).getTime();

describe("dailyCounts", () => {
  it("counts only the listed ids into their day, today last, dropping older mail", () => {
    const at = (daysAgo: number) => NOW - daysAgo * DAY;
    const sender = {
      messages: [
        { id: "a", receivedAt: at(0) },
        { id: "b", receivedAt: at(0) },
        { id: "c", receivedAt: at(3) },
        { id: "d", receivedAt: at(40) },
        { id: "skip", receivedAt: at(1) },
      ],
    } as unknown as SenderSummary;
    const out = dailyCounts([{ sender, ids: ["a", "b", "c", "d"] }], NOW, 28);
    expect(out).toHaveLength(28);
    expect(out[27]).toBe(2);
    expect(out[24]).toBe(1);
    expect(out[26]).toBe(0);
    expect(out.reduce((s, n) => s + n, 0)).toBe(3);
  });
});

describe("changeChip", () => {
  it("more clutter is worse (up, red), less is better, no base means no chip", () => {
    expect(changeChip(15, 10)!.className).toContain("worse");
    expect(changeChip(15, 10)!.textContent).toBe("50%");
    expect(changeChip(5, 10)!.className).toContain("better");
    expect(changeChip(5, 0)).toBeNull();
  });
});

describe("pageList", () => {
  it("shows every page up to 7, then ends and neighbours with gaps", () => {
    expect(pageList(0, 3)).toEqual([0, 1, 2]);
    expect(pageList(0, 10)).toEqual([0, 1, "…", 8, 9]);
    expect(pageList(5, 10)).toEqual([0, 1, "…", 4, 5, 6, "…", 8, 9]);
    expect(pageList(9, 10)).toEqual([0, 1, "…", 8, 9]);
  });
});

describe("formatBytes", () => {
  it("picks KB, MB or GB", () => {
    expect(formatBytes(43_000)).toBe("43 KB");
    expect(formatBytes(1_300_000)).toBe("1.3 MB");
    expect(formatBytes(2_500_000_000)).toBe("2.5 GB");
  });
});
