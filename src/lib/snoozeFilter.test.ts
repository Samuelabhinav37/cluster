import { describe, expect, it } from "vitest";
import { excludeSnoozedMessages } from "./snoozeFilter";
import type { MessageRecord, SenderSummary } from "./senderModel";

function makeMessage(overrides: Partial<MessageRecord> & { id: string }): MessageRecord {
  return { receivedAt: Date.now(), kind: "other", isProtected: false, ...overrides };
}

function makeSender(overrides: Partial<SenderSummary> & { address: string; messages: MessageRecord[] }): SenderSummary {
  return {
    key: `gmail:${overrides.address}`,
    provider: "gmail",
    displayName: "",
    unsubscribe: {},
    threatSignals: [],
    ...overrides,
    count: overrides.messages.length,
    messageIds: overrides.messages.map((m) => m.id),
    protectedMessageIds: overrides.messages.filter((m) => m.isProtected).map((m) => m.id),
  };
}

describe("excludeSnoozedMessages", () => {
  it("returns senders unchanged when nothing is snoozed", () => {
    const senders = [makeSender({ address: "a@x.com", messages: [makeMessage({ id: "m1" })] })];
    expect(excludeSnoozedMessages(senders, new Set())).toBe(senders);
  });

  it("drops just the snoozed messages, keeping the sender if others remain", () => {
    const senders = [
      makeSender({
        address: "a@x.com",
        messages: [makeMessage({ id: "m1" }), makeMessage({ id: "m2" })],
      }),
    ];
    const result = excludeSnoozedMessages(senders, new Set(["m1"]));
    expect(result).toHaveLength(1);
    expect(result[0].messageIds).toEqual(["m2"]);
    expect(result[0].count).toBe(1);
  });

  it("drops the sender entirely when all its messages are snoozed", () => {
    const senders = [
      makeSender({ address: "a@x.com", messages: [makeMessage({ id: "m1" })] }),
      makeSender({ address: "b@x.com", messages: [makeMessage({ id: "m2" })] }),
    ];
    const result = excludeSnoozedMessages(senders, new Set(["m1"]));
    expect(result.map((s) => s.address)).toEqual(["b@x.com"]);
  });
});
