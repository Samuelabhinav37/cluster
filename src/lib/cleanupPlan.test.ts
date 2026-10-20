import { describe, expect, it } from "vitest";
import { confidenceOf, describeCleanup, planRecommendedCleanup, runnable } from "./cleanupPlan";
import type { SenderProfile } from "./senderProfile";
import type { SenderSummary } from "./senderModel";
import type { Suggestion, SuggestionAction } from "./suggestions";

function suggestion(
  address: string,
  action: SuggestionAction,
  profile: Partial<SenderProfile> = {},
  over: { ids?: string[]; unsubscribe?: SenderSummary["unsubscribe"] } = {},
): Suggestion {
  return {
    sender: {
      key: `gmail:${address}`,
      provider: "gmail",
      address,
      unsubscribe: over.unsubscribe ?? {},
    } as SenderSummary,
    profile: { openRate: 0, judged: 20, stillSending: true, ...profile } as SenderProfile,
    action,
    reasons: [`because ${address}`],
    safeMessageIds: over.ids ?? [`${address}-1`],
  };
}

describe("confidenceOf", () => {
  it("is high only on plain evidence", () => {
    expect(confidenceOf(suggestion("a@x.example", "clearOld", { stillSending: false }))).toBe("high");
    expect(confidenceOf(suggestion("b@x.example", "mute", { openRate: 0, judged: 12 }))).toBe("high");
    expect(confidenceOf(suggestion("c@x.example", "mute", { openRate: 0, judged: 6 }))).toBe("medium");
    expect(confidenceOf(suggestion("d@x.example", "mute", { openRate: 0.05, judged: 40 }))).toBe("medium");
    expect(confidenceOf(suggestion("e@x.example", "keepSorted"))).toBe("medium");
  });
});

describe("planRecommendedCleanup", () => {
  it("pre-checks high-confidence rows, never unsubscribe, ticked rows first", () => {
    const rows = planRecommendedCleanup([
      suggestion("weak@x.example", "mute", { judged: 3 }, { ids: ["1", "2", "3"] }),
      suggestion("sure@x.example", "mute"),
      suggestion("unsub@x.example", "unsubscribe"),
    ]);
    expect(rows.map((r) => [r.key, r.preChecked])).toEqual([
      ["gmail:sure@x.example", true],
      ["gmail:weak@x.example", false],
      ["gmail:unsub@x.example", false],
    ]);
    expect(runnable(rows).map((r) => r.action)).toEqual(["mute", "mute"]);
  });

  it("merges senders behind one unsubscribe link into one row", () => {
    const link = (q: string) => ({ httpUrl: `https://brand.example/u?id=${q}` });
    const rows = planRecommendedCleanup([
      suggestion("news@brand.example", "mute", {}, { ids: ["n1"], unsubscribe: link("1") }),
      suggestion("deals@brand.example", "mute", { judged: 2 }, { ids: ["d1", "d2"], unsubscribe: link("2") }),
      suggestion("other@else.example", "mute", {}, { unsubscribe: { httpUrl: "https://else.example/u" } }),
    ]);
    expect(rows).toHaveLength(2);
    const merged = rows.find((r) => r.suggestions.length === 2)!;
    expect(merged.messageIds).toEqual(["n1", "d1", "d2"]);
    // As sure as its least sure sender.
    expect(merged.confidence).toBe("medium");
    expect(merged.preChecked).toBe(false);
  });
});

describe("describeCleanup", () => {
  it("names each verb with its counts and what stays", () => {
    const rows = planRecommendedCleanup([
      suggestion("a@x.example", "mute"),
      suggestion("b@x.example", "mute"),
      suggestion(
        "c@x.example",
        "clearOld",
        { stillSending: false },
        { ids: Array.from({ length: 1240 }, (_, i) => `c${i}`) },
      ),
      suggestion("d@x.example", "keepSorted"),
    ]);
    expect(describeCleanup(rows)).toBe(
      "Mute 2 senders, archive 1,240 old emails from 1 sender and keep 1 sender sorted · starred and protected mail stays",
    );
    expect(describeCleanup([])).toBe("");
  });
});
