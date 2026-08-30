import { describe, expect, it } from "vitest";
import { buildSenderCleanupPlan, protectionDecision } from "./protectionPolicy";
import type { MessageRecord, SenderSummary } from "./senderModel";

function message(over: Partial<MessageRecord> & { id: string }): MessageRecord {
  return {
    subject: "Weekly newsletter",
    receivedAt: 0,
    kind: "newsletter",
    isProtected: false,
    unread: true,
    sizeBytes: 0,
    ...over,
  };
}

function sender(messages: MessageRecord[]): SenderSummary {
  return {
    key: "gmail:news@example.com",
    provider: "gmail",
    address: "news@example.com",
    displayName: "News",
    count: messages.length,
    messageIds: messages.map((item) => item.id),
    protectedMessageIds: messages.filter((item) => item.isProtected).map((item) => item.id),
    unsubscribe: { postUrl: "https://example.com/unsubscribe" },
    messages,
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
  };
}

describe("protectionDecision", () => {
  it("protects starred, transactional, and sensitive-subject messages", () => {
    expect(protectionDecision(message({ id: "star", isProtected: true })).reason).toBe("starred-or-flagged");
    expect(protectionDecision(message({ id: "receipt", kind: "receipt" })).reason).toBe("transactional");
    expect(protectionDecision(message({ id: "security", subject: "Security alert" })).reason).toBe(
      "sensitive-subject",
    );
  });
});

describe("buildSenderCleanupPlan", () => {
  it("trashes only safe newsletters and explains every exclusion", () => {
    const plan = buildSenderCleanupPlan(
      sender([
        message({ id: "newsletter" }),
        message({ id: "receipt", kind: "receipt", subject: "Your receipt" }),
        message({ id: "star", isProtected: true }),
        message({ id: "other", kind: "other", subject: "Hello" }),
      ]),
    );
    expect(plan.safeNewsletterIds).toEqual(["newsletter"]);
    expect(plan.protectedIds).toEqual(["receipt", "star"]);
    expect(plan.retainedOtherIds).toEqual(["other"]);
    expect(plan.protectionReasons.transactional).toBe(1);
    expect(plan.protectionReasons["starred-or-flagged"]).toBe(1);
  });
});
