import { describe, expect, it } from "vitest";
import { SUGGESTION_DISMISS_MS, normalizeEngagementRecord, recordEngagementFeedback } from "./engagementModel";

describe("recordEngagementFeedback", () => {
  it("counts each kind of feedback once per sender", () => {
    const once = recordEngagementFeedback({}, ["a", "a", "b"], "accept", 100);
    expect(once.a).toEqual({ lastSeenAt: 100, acceptedActions: 1, dismissedSuggestions: 0, undoneActions: 0 });
    const undone = recordEngagementFeedback(once, ["a"], "undo", 200);
    expect(undone.a).toMatchObject({ acceptedActions: 1, undoneActions: 1, lastSeenAt: 200 });
    expect(undone.b.acceptedActions).toBe(1);
  });

  it("a dismissal hides the sender for 30 days", () => {
    const next = recordEngagementFeedback({}, ["a"], "dismiss", 100);
    expect(next.a.snoozedUntil).toBe(100 + SUGGESTION_DISMISS_MS);
  });

  it("drops records not touched for a year", () => {
    const old = recordEngagementFeedback({}, ["a"], "accept", 0);
    const next = recordEngagementFeedback(old, ["b"], "accept", 366 * 86_400_000);
    expect(Object.keys(next)).toEqual(["b"]);
  });
});

describe("normalizeEngagementRecord", () => {
  it("keeps only the feedback fields of an older record", () => {
    const record = normalizeEngagementRecord({
      samples: 4,
      unreadRatioEma: 0.9,
      lastObservedCount: 12,
      lastSeenAt: 5,
      acceptedActions: 2,
      dismissedSuggestions: 1,
      undoneActions: 0,
      snoozedUntil: 9,
    });
    expect(record).toEqual({ lastSeenAt: 5, acceptedActions: 2, dismissedSuggestions: 1, undoneActions: 0, snoozedUntil: 9 });
    expect(normalizeEngagementRecord(null)).toBeUndefined();
  });
});
