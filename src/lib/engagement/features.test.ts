import { describe, expect, it } from "vitest";
import type { MessageRecord, SenderSummary } from "../senderModel";
import type { SenderEngagementRecord } from "../engagementModel";
import {
  DOMAIN_CATEGORIES,
  extractFeatures,
  FEATURE_COUNT,
  FEATURE_NAMES,
  MESSAGE_KINDS,
} from "./features";

function message(over: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: Math.random().toString(36).slice(2),
    receivedAt: 1_000,
    kind: "newsletter",
    isProtected: false,
    unread: true,
    sizeBytes: 0,
    ...over,
  };
}

function sender(over: Partial<SenderSummary> = {}): SenderSummary {
  const messages = over.messages ?? [message(), message(), message({ unread: false })];
  return {
    key: "gmail:news@substack.com",
    provider: "gmail",
    address: "news@substack.com",
    displayName: "A Newsletter",
    count: messages.length,
    messageIds: messages.map((m) => m.id),
    protectedMessageIds: messages.filter((m) => m.isProtected).map((m) => m.id),
    unsubscribe: {},
    messages,
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
    ...over,
  };
}

function record(over: Partial<SenderEngagementRecord> = {}): SenderEngagementRecord {
  return {
    samples: 4,
    unreadRatioEma: 0.8,
    lastObservedLatestMessageAt: 1_000,
    lastObservedCount: 3,
    lastObservedUnreadCount: 2,
    lastSeenAt: 1_000,
    acceptedActions: 0,
    dismissedSuggestions: 0,
    undoneActions: 0,
    ...over,
  };
}

const featureAt = (name: string) => FEATURE_NAMES.indexOf(name);

describe("extractFeatures", () => {
  it("returns a fixed-length vector of finite numbers", () => {
    const x = extractFeatures({ sender: sender(), record: record(), now: 5_000 });
    expect(x).toHaveLength(FEATURE_COUNT);
    expect(x.every((v) => Number.isFinite(v))).toBe(true);
    expect(x[featureAt("bias")]).toBe(1);
  });

  it("one-hot encodes exactly one domain category and one message kind", () => {
    const x = extractFeatures({ sender: sender(), record: record(), now: 5_000 });
    const domainSum = DOMAIN_CATEGORIES.reduce((s, c) => s + x[featureAt(`domain:${c}`)], 0);
    const kindSum = MESSAGE_KINDS.reduce((s, k) => s + x[featureAt(`kind:${k}`)], 0);
    expect(domainSum).toBe(1);
    expect(kindSum).toBe(1);
    // substack.com -> newsletter; every message kind is "newsletter" here.
    expect(x[featureAt("domain:newsletter")]).toBe(1);
    expect(x[featureAt("kind:newsletter")]).toBe(1);
  });

  it("computes the current unread ratio from non-protected messages only", () => {
    const messages = [
      message({ unread: true }),
      message({ unread: true }),
      message({ unread: false }),
      message({ unread: false, isProtected: true }), // excluded
    ];
    const x = extractFeatures({ sender: sender({ messages }), now: 5_000 });
    expect(x[featureAt("currentUnreadRatio")]).toBeCloseTo(2 / 3, 6);
    expect(x[featureAt("logMessageCount")]).toBeCloseTo(Math.log1p(3), 6);
  });

  it("clips daysSinceLatest to [0, 1] against the 90-day horizon", () => {
    const day = 24 * 60 * 60 * 1000;
    const recent = extractFeatures({
      sender: sender({ messages: [message({ receivedAt: 100 * day })] }),
      now: 145 * day, // 45 days later
    });
    expect(recent[featureAt("daysSinceLatest")]).toBeCloseTo(0.5, 6);

    const ancient = extractFeatures({
      sender: sender({ messages: [message({ receivedAt: 0 })] }),
      now: 400 * day,
    });
    expect(ancient[featureAt("daysSinceLatest")]).toBe(1);
  });

  it("falls back to neutral values when there is no record", () => {
    const x = extractFeatures({ sender: sender(), now: 5_000 });
    expect(x[featureAt("unreadRatioEma")]).toBe(0);
    expect(x[featureAt("priorAccepted")]).toBe(0);
    expect(x[featureAt("priorDismissed")]).toBe(0);
    expect(x[featureAt("priorUndone")]).toBe(0);
  });

  it("scales prior-action counts to [0, 1] and clips at 3", () => {
    const x = extractFeatures({
      sender: sender(),
      record: record({ acceptedActions: 2, dismissedSuggestions: 9, undoneActions: 0 }),
      now: 5_000,
    });
    expect(x[featureAt("priorAccepted")]).toBeCloseTo(2 / 3, 6);
    expect(x[featureAt("priorDismissed")]).toBe(1); // 9 -> clipped to 3 -> 1
  });

  it("flags first contact and a working unsubscribe", () => {
    const x = extractFeatures({
      sender: sender({ firstContact: true, unsubscribe: { postUrl: "https://x/u" } }),
      now: 5_000,
    });
    expect(x[featureAt("isFirstContact")]).toBe(1);
    expect(x[featureAt("hasWorkingUnsubscribe")]).toBe(1);
  });

  it("emits no message ids or subjects (all numeric)", () => {
    const messages = [message({ id: "SECRET_ID", subject: "SECRET SUBJECT" })];
    const x = extractFeatures({ sender: sender({ messages }), now: 5_000 });
    expect(JSON.stringify(x)).not.toMatch(/SECRET/);
    expect(x.every((v) => typeof v === "number")).toBe(true);
  });
});
