// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { homeHeadline, homeRecommendations, renderHomeTop, type HomeFacts } from "./homeTab";

const calm: HomeFacts = {
  suspicious: 0,
  waiting: 0,
  cleanupMessages: 0,
  decisionSenders: 0,
  unsubscribable: 0,
  holdingOn: true,
  sortingOn: true,
};

describe("homeHeadline", () => {
  it("leads with suspicious senders", () => {
    expect(homeHeadline({ ...calm, suspicious: 3, waiting: 2 })).toBe("3 senders look suspicious. Check before you act.");
    expect(homeHeadline({ ...calm, suspicious: 1 })).toBe("1 sender looks suspicious. Check before you act.");
  });

  it("then new senders, then clean-up, then all clear", () => {
    expect(homeHeadline({ ...calm, waiting: 1, cleanupMessages: 9 })).toBe(
      "Nothing looks like a scam. 1 new sender is waiting for you.",
    );
    expect(homeHeadline({ ...calm, cleanupMessages: 29 })).toBe("Nothing looks like a scam. 29 emails can be cleared out.");
    expect(homeHeadline(calm)).toBe("Nothing looks like a scam, and nothing needs you right now.");
  });

  it("uses no dashes", () => {
    for (const f of [calm, { ...calm, suspicious: 2 }, { ...calm, waiting: 2 }, { ...calm, cleanupMessages: 2 }]) {
      expect(homeHeadline(f)).not.toMatch(/[–—-]/);
    }
  });
});

describe("homeRecommendations", () => {
  it("lists only what applies, most urgent first", () => {
    const recs = homeRecommendations({ ...calm, suspicious: 2, cleanupMessages: 5, unsubscribable: 4 });
    expect(recs.map((r) => r.id)).toEqual(["suspicious", "cleanup", "unsubscribe"]);
    expect(recs[0].danger).toBe(true);
  });

  it("is empty when nothing needs the person", () => {
    expect(homeRecommendations(calm)).toEqual([]);
    expect(homeRecommendations({ ...calm, holdingOn: false })).toEqual([]);
  });

  it("sends the decision row to Clear out's sender list", () => {
    const [rec] = homeRecommendations({ ...calm, decisionSenders: 8 });
    expect(rec).toMatchObject({ screen: "delete", focus: "senders-worth-decision", title: "Decide about 8 senders" });
  });
});

describe("renderHomeTop", () => {
  it("renders pills and one button per recommendation that navigates", () => {
    const stack = document.createElement("div");
    const go = vi.fn();
    renderHomeTop(stack, { ...calm, holdingOn: false, waiting: 2 }, go);
    expect(stack.querySelector(".home-pill")!.textContent).toContain("Scam holding is off");
    const btn = stack.querySelector<HTMLButtonElement>('[data-rec="waiting"] button')!;
    expect(btn.getAttribute("aria-label")).toBe("Review: Let in or block 2 new senders");
    btn.click();
    expect(go).toHaveBeenCalledWith("screener", undefined);
  });

  it("says so when there is nothing to do", () => {
    const stack = document.createElement("div");
    renderHomeTop(stack, calm, () => {});
    expect(stack.querySelector(".home-rec-empty")!.textContent).toContain("Nothing to do");
  });
});
