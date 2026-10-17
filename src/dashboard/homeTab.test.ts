import { describe, expect, it } from "vitest";
import { homeHeadline, type HomeFacts } from "./homeTab";

const calm: HomeFacts = {
  suspicious: 0,
  waiting: 0,
  cleanupMessages: 0,
};

describe("homeHeadline", () => {
  it("leads with suspicious senders", () => {
    expect(homeHeadline({ ...calm, suspicious: 3, waiting: 2 })).toBe(
      "3 senders look suspicious. Check before you act.",
    );
    expect(homeHeadline({ ...calm, suspicious: 1 })).toBe("1 sender looks suspicious. Check before you act.");
  });

  it("then new senders, then clean-up, then all clear", () => {
    expect(homeHeadline({ ...calm, waiting: 1, cleanupMessages: 9 })).toBe(
      "Nothing looks like a scam. 1 new sender is waiting for you.",
    );
    expect(homeHeadline({ ...calm, cleanupMessages: 29 })).toBe(
      "Nothing looks like a scam. 29 emails can be cleared out.",
    );
    expect(homeHeadline(calm)).toBe("Nothing looks like a scam, and nothing needs you right now.");
  });

  it("uses no dashes", () => {
    for (const f of [
      calm,
      { ...calm, suspicious: 2 },
      { ...calm, waiting: 2 },
      { ...calm, cleanupMessages: 2 },
    ]) {
      expect(homeHeadline(f)).not.toMatch(/[–—-]/);
    }
  });
});
