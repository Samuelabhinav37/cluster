import { describe, expect, it } from "vitest";
import {
  SMART_VIEWS,
  evaluateSmartView,
  evaluateSmartViewForTrash,
  smartViewMessageCount,
  smartViewSenderCount,
} from "./smartViews";
import type { MessageRecord, SenderSummary } from "./senderModel";

const DAY_MS = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

function msg(over: Partial<MessageRecord> & { id: string }): MessageRecord {
  return {
    receivedAt: Date.now(),
    kind: "other",
    isProtected: false,
    unread: false,
    sizeBytes: 0,
    providerMarkedPersonal: false,
    looksAutomated: false,
    ...over,
  };
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
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
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

describe("evaluateSmartViewForTrash", () => {
  it("never returns anything for the shipping view -- order mail is never auto-trashed", () => {
    const g = sender("gmail", "a@x.com", [
      msg({ id: "old-order", kind: "shipping", receivedAt: Date.now() - 400 * DAY_MS, looksAutomated: true }),
    ]);
    expect(evaluateSmartViewForTrash(view("shipping"), [g]).size).toBe(0);
    // The lighter evaluator (used for Archive/counts) still matches it.
    expect(evaluateSmartView(view("shipping"), [g]).get("gmail")).toEqual(["old-order"]);
  });

  it("applies the full protection gate (known-correspondent, provider-marked-personal), not just starred", () => {
    const g = sender("gmail", "a@x.com", [
      msg({ id: "old1", receivedAt: Date.now() - 400 * DAY_MS, looksAutomated: true }),
      msg({
        id: "old2",
        receivedAt: Date.now() - 400 * DAY_MS,
        looksAutomated: true,
        providerMarkedPersonal: true,
      }),
    ]);
    expect(evaluateSmartViewForTrash(view("older-1y"), [g]).get("gmail")).toEqual(["old1"]);

    const known = sender("gmail", "friend@x.com", [
      msg({ id: "old3", receivedAt: Date.now() - 400 * DAY_MS, looksAutomated: true }),
    ]);
    const ctx = { knownSenders: new Set(["friend@x.com"]) };
    expect(evaluateSmartViewForTrash(view("older-1y"), [known], ctx).size).toBe(0);
  });

  it("still matches an otp-kind message (short-lived by design, unaffected by the shipping/receipt exemption)", () => {
    const g = sender("gmail", "a@x.com", [msg({ id: "code", kind: "otp", looksAutomated: true })]);
    expect(evaluateSmartViewForTrash(view("otp"), [g]).get("gmail")).toEqual(["code"]);
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
