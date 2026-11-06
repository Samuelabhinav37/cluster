import { describe, expect, it } from "vitest";
import type { SenderSummary } from "../lib/senderModel";
import { dailyCounts } from "./cleanupPage";

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
