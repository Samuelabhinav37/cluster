import { describe, expect, it } from "vitest";
import { buildExpiryBuckets, mergeExpiryBuckets, totalExpiryCount } from "./expiryTriage";
import type { MessageRecord, SenderSummary } from "./senderModel";
import type { ProviderId } from "./providers/emailProvider";

const DAY_MS = 24 * 60 * 60 * 1000;

function makeMessage(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: "msg-1",
    receivedAt: Date.now(),
    kind: "otp",
    isProtected: false,
    ...overrides,
  };
}

function makeSender(provider: ProviderId, messages: MessageRecord[]): SenderSummary {
  return {
    key: `${provider}:sender@example.com`,
    provider,
    address: "sender@example.com",
    displayName: "Sender",
    count: messages.length,
    messageIds: messages.map((m) => m.id),
    protectedMessageIds: messages.filter((m) => m.isProtected).map((m) => m.id),
    unsubscribe: {},
    messages,
  };
}

describe("buildExpiryBuckets", () => {
  it("skips protected messages even when kind and age would otherwise qualify", () => {
    const sender = makeSender("gmail", [
      makeMessage({ kind: "otp", isProtected: true, receivedAt: Date.now() - 10 * DAY_MS }),
    ]);
    expect(buildExpiryBuckets([sender])).toEqual([]);
  });

  it("skips kinds with no retention policy (receipt, other) regardless of age", () => {
    const sender = makeSender("gmail", [
      makeMessage({ id: "r1", kind: "receipt", receivedAt: Date.now() - 9999 * DAY_MS }),
      makeMessage({ id: "o1", kind: "other", receivedAt: Date.now() - 9999 * DAY_MS }),
    ]);
    expect(buildExpiryBuckets([sender])).toEqual([]);
  });

  it("excludes messages younger than the retention window and includes ones at/past it", () => {
    const sender = makeSender("gmail", [
      makeMessage({ id: "young", kind: "otp", receivedAt: Date.now() - 1 * DAY_MS }), // otp retention = 2d
      makeMessage({ id: "old", kind: "otp", receivedAt: Date.now() - 3 * DAY_MS }),
    ]);
    const buckets = buildExpiryBuckets([sender]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].kind).toBe("otp");
    expect(buckets[0].count).toBe(1);
    expect(buckets[0].messageIdsByProvider.get("gmail")).toEqual(["old"]);
  });

  it("aggregates the same kind across providers into one bucket", () => {
    const gmailSender = makeSender("gmail", [
      makeMessage({ id: "g1", kind: "newsletter", receivedAt: Date.now() - 40 * DAY_MS }),
    ]);
    const outlookSender = makeSender("outlook", [
      makeMessage({ id: "o1", kind: "newsletter", receivedAt: Date.now() - 40 * DAY_MS }),
    ]);
    const buckets = buildExpiryBuckets([gmailSender, outlookSender]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].count).toBe(2);
    expect(buckets[0].messageIdsByProvider.get("gmail")).toEqual(["g1"]);
    expect(buckets[0].messageIdsByProvider.get("outlook")).toEqual(["o1"]);
  });

  it("sorts buckets by descending count", () => {
    const sender = makeSender("gmail", [
      makeMessage({ id: "s1", kind: "social", receivedAt: Date.now() - 40 * DAY_MS }),
      makeMessage({ id: "n1", kind: "newsletter", receivedAt: Date.now() - 40 * DAY_MS }),
      makeMessage({ id: "n2", kind: "newsletter", receivedAt: Date.now() - 40 * DAY_MS }),
    ]);
    const buckets = buildExpiryBuckets([sender]);
    expect(buckets.map((b) => b.kind)).toEqual(["newsletter", "social"]);
  });
});

describe("totalExpiryCount / mergeExpiryBuckets", () => {
  it("sums counts and merges provider id maps across buckets", () => {
    const sender = makeSender("gmail", [
      makeMessage({ id: "g1", kind: "otp", receivedAt: Date.now() - 3 * DAY_MS }),
      makeMessage({ id: "g2", kind: "newsletter", receivedAt: Date.now() - 40 * DAY_MS }),
    ]);
    const buckets = buildExpiryBuckets([sender]);
    expect(totalExpiryCount(buckets)).toBe(2);
    const merged = mergeExpiryBuckets(buckets);
    expect(new Set(merged.get("gmail"))).toEqual(new Set(["g1", "g2"]));
  });
});
