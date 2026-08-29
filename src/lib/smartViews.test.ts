import { describe, expect, it } from "vitest";
import { SMART_VIEWS, evaluateSmartView, smartViewMessageCount, smartViewSenderCount } from "./smartViews";
import type { MessageRecord, SenderSummary } from "./senderModel";

const DAY_MS = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

function msg(over: Partial<MessageRecord> & { id: string }): MessageRecord {
  return { receivedAt: Date.now(), kind: "other", isProtected: false, unread: false, sizeBytes: 0, ...over };
}

function sender(provider: "gmail" | "outlook", address: string, messages: MessageRecord[]): SenderSummary {
  return {
    key: `${provider}:${address}`,
    provider,
    address,
    displayName: address,
    count: messages.length,
    messageIds: messages.map((m) => m.id),
    protectedMessageIds: messages.filter((m) => m.isProtected).map((m) => m.id),
    unsubscribe: {},
    messages,
    threatSignals: [],
  };
}

const view = (id: string) => SMART_VIEWS.find((v) => v.id === id)!;

describe("evaluateSmartView", () => {
  it("older-than-1y matches only messages over 365 days old, grouped by provider", () => {
    const g = sender("gmail", "a@x.com", [
      msg({ id: "old", receivedAt: Date.now() - 400 * DAY_MS }),
      msg({ id: "new", receivedAt: Date.now() - 10 * DAY_MS }),
    ]);
    const o = sender("outlook", "b@y.com", [msg({ id: "o-old", receivedAt: Date.now() - 500 * DAY_MS })]);
    const result = evaluateSmartView(view("older-1y"), [g, o]);
    expect(result.get("gmail")).toEqual(["old"]);
    expect(result.get("outlook")).toEqual(["o-old"]);
  });

  it("large matches messages over 2 MB", () => {
    const g = sender("gmail", "a@x.com", [
      msg({ id: "big", sizeBytes: 3 * MB }),
      msg({ id: "small", sizeBytes: 100 * 1024 }),
    ]);
    expect(evaluateSmartView(view("large"), [g]).get("gmail")).toEqual(["big"]);
  });

  it("never includes starred messages", () => {
    const g = sender("gmail", "a@x.com", [
      msg({ id: "n", kind: "newsletter" }),
      msg({ id: "s", kind: "newsletter", isProtected: true }),
    ]);
    expect(evaluateSmartView(view("promos-unsub"), [g]).get("gmail")).toEqual(["n"]);
  });
});

describe("smartView counts", () => {
  it("message and sender counts agree with the evaluator", () => {
    const senders = [
      sender("gmail", "a@x.com", [msg({ id: "1", kind: "otp" }), msg({ id: "2", kind: "otp" })]),
      sender("gmail", "b@x.com", [msg({ id: "3", kind: "other" })]),
    ];
    expect(smartViewMessageCount(view("otp"), senders)).toBe(2);
    expect(smartViewSenderCount(view("otp"), senders)).toBe(1);
  });
});
