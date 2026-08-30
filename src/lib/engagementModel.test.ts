import { describe, expect, it } from "vitest";
import type { MessageRecord, SenderSummary } from "./senderModel";
import {
  SUGGESTION_DISMISS_MS,
  buildEngagementSuggestions,
  recordEngagementFeedback,
  updateEngagementObservations,
  type SenderEngagementMap,
} from "./engagementModel";

function message(id: string, unread = true, receivedAt = 1, isProtected = false): MessageRecord {
  return { id, receivedAt, kind: "newsletter", isProtected, unread, sizeBytes: 0 };
}

function sender(messages: MessageRecord[], over: Partial<SenderSummary> = {}): SenderSummary {
  return {
    key: "gmail:news@example.com",
    provider: "gmail",
    address: "news@example.com",
    displayName: "News",
    count: messages.length,
    messageIds: messages.map((item) => item.id),
    protectedMessageIds: messages.filter((item) => item.isProtected).map((item) => item.id),
    unsubscribe: {},
    messages,
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
    ...over,
  };
}

describe("engagement observations", () => {
  it("stores only aggregate behavior and does not count an unchanged scan twice", () => {
    const current = sender([message("a"), message("b"), message("c", false)]);
    const first = updateEngagementObservations({}, [current], 100);
    const second = updateEngagementObservations(first, [current], 200);

    expect(first[current.key]).toMatchObject({
      samples: 1,
      lastObservedCount: 3,
      lastObservedUnreadCount: 2,
    });
    expect(second[current.key].samples).toBe(1);
    expect(second[current.key].lastSeenAt).toBe(200);
    expect(JSON.stringify(second)).not.toContain('"a"');
  });

  it("learns when read state or recent-mail aggregates change", () => {
    const firstSender = sender([message("a"), message("b"), message("c")]);
    const first = updateEngagementObservations({}, [firstSender], 100);
    const changed = sender([message("a", false), message("b"), message("c")]);
    const second = updateEngagementObservations(first, [changed], 200);

    expect(second[changed.key].samples).toBe(2);
    expect(second[changed.key].unreadRatioEma).toBeCloseTo(0.8833, 3);
  });

  it("bounds persisted history to the 1,000 most recently seen senders", () => {
    const existing: SenderEngagementMap = Object.fromEntries(
      Array.from({ length: 1_002 }, (_, index) => [
        `gmail:${index}@example.com`,
        {
          samples: 1,
          unreadRatioEma: 1,
          lastObservedLatestMessageAt: index,
          lastObservedCount: 3,
          lastObservedUnreadCount: 3,
          lastSeenAt: index,
          acceptedActions: 0,
          dismissedSuggestions: 0,
          undoneActions: 0,
        },
      ]),
    );

    const bounded = updateEngagementObservations(existing, [], 1_002);
    expect(Object.keys(bounded)).toHaveLength(1_000);
    expect(bounded["gmail:0@example.com"]).toBeUndefined();
    expect(bounded["gmail:1001@example.com"]).toBeDefined();
  });
});

describe("engagement suggestions", () => {
  it("explains a repeated unread pattern and recommends unsubscribe when available", () => {
    const current = sender([message("a"), message("b"), message("c")], {
      unsubscribe: { postUrl: "https://example.com/unsubscribe" },
    });
    const once = updateEngagementObservations({}, [current], 100);
    const changed = sender([message("a"), message("b"), message("c"), message("d", true, 2)], {
      unsubscribe: current.unsubscribe,
    });
    const twice = updateEngagementObservations(once, [changed], 200);
    const [suggestion] = buildEngagementSuggestions([changed], twice, 200);

    expect(suggestion.suggestedAction).toBe("unsubscribe");
    expect(suggestion.confidence).toBe("medium");
    expect(suggestion.score).toBeGreaterThanOrEqual(70);
    expect(suggestion.reasons.join(" ")).toContain("2 changed snapshots");
  });

  it("abstains for protected mail and after a dismissal", () => {
    const protectedSender = sender([
      message("a"),
      message("b"),
      message("c"),
      message("star", false, 2, true),
    ]);
    const observed = updateEngagementObservations({}, [protectedSender], 100);
    expect(buildEngagementSuggestions([protectedSender], observed, 100)).toEqual([]);

    const safe = sender([message("a"), message("b"), message("c"), message("d"), message("e")]);
    const safeObserved = updateEngagementObservations({}, [safe], 100);
    expect(buildEngagementSuggestions([safe], safeObserved, 100)).toHaveLength(1);
    const dismissed = recordEngagementFeedback(safeObserved, [safe.key], "dismiss", 200);
    expect(buildEngagementSuggestions([safe], dismissed, 200)).toEqual([]);
    expect(buildEngagementSuggestions([safe], dismissed, 200 + SUGGESTION_DISMISS_MS + 1)).toHaveLength(1);
  });

  it("uses undo feedback as a strong correction", () => {
    const current = sender([message("a"), message("b"), message("c"), message("d"), message("e")]);
    const observed = updateEngagementObservations({}, [current], 100);
    const corrected = recordEngagementFeedback(observed, [current.key], "undo", 200);
    expect(buildEngagementSuggestions([current], corrected, 200)).toEqual([]);
  });
});
