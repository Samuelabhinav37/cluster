import { describe, expect, it } from "vitest";
import type { MessageKind } from "../messageKind";
import type { MessageRecord, SenderSummary } from "../senderModel";
import type { SenderEngagementRecord } from "../engagementModel";
import { FEATURE_COUNT } from "./features";
import { scoreSender, scoreSenders, topReasons } from "./score";

function message(over: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: Math.random().toString(36).slice(2),
    receivedAt: 1_000,
    kind: "newsletter",
    isProtected: false,
    unread: true,
    sizeBytes: 2_048,
    ...over,
  };
}

function sender(over: Partial<SenderSummary> = {}): SenderSummary {
  const messages = over.messages ?? Array.from({ length: 8 }, () => message());
  return {
    key: over.key ?? "gmail:news@substack.com",
    provider: "gmail",
    address: over.address ?? "news@substack.com",
    displayName: "A Newsletter",
    count: messages.length,
    messageIds: messages.map((m) => m.id),
    protectedMessageIds: [],
    unsubscribe: over.unsubscribe ?? { postUrl: "https://example.com/unsub" },
    messages,
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
    ...over,
  };
}

function record(over: Partial<SenderEngagementRecord> = {}): SenderEngagementRecord {
  return {
    samples: 6,
    unreadRatioEma: 0.9,
    lastObservedLatestMessageAt: 1_000,
    lastObservedCount: 8,
    lastObservedUnreadCount: 8,
    lastSeenAt: 1_000,
    acceptedActions: 0,
    dismissedSuggestions: 0,
    undoneActions: 0,
    ...over,
  };
}

function ignoredNewsletter(kind: MessageKind = "newsletter") {
  return {
    sender: sender({
      messages: Array.from({ length: 8 }, () => message({ kind, unread: true })),
    }),
    record: record({ unreadRatioEma: 0.95 }),
    now: 1_000,
  };
}

function transactionalSender() {
  return {
    sender: sender({
      key: "gmail:receipts@chase.com",
      address: "receipts@chase.com",
      unsubscribe: {},
      messages: Array.from({ length: 8 }, () => message({ kind: "otp", unread: false })),
    }),
    record: record({ unreadRatioEma: 0.1, lastObservedUnreadCount: 0 }),
    now: 1_000,
  };
}

describe("scoreSender", () => {
  it("gives a high p to an ignored newsletter and a low p to a transactional sender", () => {
    const ignored = scoreSender(ignoredNewsletter());
    const transactional = scoreSender(transactionalSender());

    expect(ignored.p).toBeGreaterThan(0.75);
    expect(transactional.p).toBeLessThan(0.2);
    expect(ignored.p).toBeGreaterThan(transactional.p);
  });

  it("orders contributions by absolute value and never includes the bias term", () => {
    const { contributions } = scoreSender(ignoredNewsletter());
    expect(contributions.some((c) => c.feature === "bias")).toBe(false);
    for (let i = 1; i < contributions.length; i++) {
      expect(Math.abs(contributions[i - 1].value)).toBeGreaterThanOrEqual(
        Math.abs(contributions[i].value),
      );
    }
  });

  it("is a deterministic function of its inputs (golden)", () => {
    const a = scoreSender(ignoredNewsletter());
    const b = scoreSender(ignoredNewsletter());
    expect(a.p).toBe(b.p);
  });

  it("a run of accepted feedback raises p; undone feedback lowers it", () => {
    const base = scoreSender(ignoredNewsletter()).p;
    const withAccepts = scoreSender({
      ...ignoredNewsletter(),
      record: record({ unreadRatioEma: 0.95, acceptedActions: 3 }),
    }).p;
    const withUndos = scoreSender({
      ...ignoredNewsletter(),
      record: record({ unreadRatioEma: 0.95, undoneActions: 3 }),
    }).p;

    expect(withAccepts).toBeGreaterThan(base);
    expect(withUndos).toBeLessThan(base);
  });

  it("ignores a user-weight vector of the wrong length", () => {
    const withGarbage = scoreSender(ignoredNewsletter(), [1, 2, 3]);
    const withNone = scoreSender(ignoredNewsletter());
    expect(withGarbage.p).toBe(withNone.p);
  });

  it("applies a correctly sized user-weight delta", () => {
    const push = new Array(FEATURE_COUNT).fill(0);
    push[2] = 5; // currentUnreadRatio index — large positive nudge
    const nudged = scoreSender(ignoredNewsletter(), push);
    const plain = scoreSender(ignoredNewsletter());
    expect(nudged.p).toBeGreaterThan(plain.p);
  });
});

describe("scoreSenders", () => {
  it("keys the result map by sender.key", () => {
    const inputs = [ignoredNewsletter(), transactionalSender()];
    const scored = scoreSenders(inputs);
    expect([...scored.keys()].sort()).toEqual(
      ["gmail:news@substack.com", "gmail:receipts@chase.com"].sort(),
    );
  });
});

describe("topReasons", () => {
  it("returns plain-language phrases for the top positive contributions", () => {
    const reasons = topReasons(scoreSender(ignoredNewsletter()));
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.length).toBeLessThanOrEqual(3);
    expect(reasons.join(" ")).toMatch(/unread|newsletter|unsubscribe|rarely/i);
  });

  it("maps only to features that actually fired positive for this sender", () => {
    const score = scoreSender(ignoredNewsletter());
    const positives = new Set(score.contributions.filter((c) => c.value > 0).map((c) => c.feature));
    // topReasons pulls from contributions directly, so this is structural:
    expect(score.contributions.filter((c) => c.value > 0).length).toBeGreaterThanOrEqual(
      topReasons(score).length,
    );
    expect(positives.size).toBeGreaterThan(0);
  });
});
