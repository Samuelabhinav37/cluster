import { describe, expect, it } from "vitest";
import { buildSenderCleanupPlan, protectionDecision, type ProtectionContext } from "./protectionPolicy";
import type { MessageRecord, SenderSummary } from "./senderModel";

function message(over: Partial<MessageRecord> & { id: string }): MessageRecord {
  return {
    subject: "Weekly newsletter",
    receivedAt: 0,
    kind: "newsletter",
    isProtected: false,
    unread: true,
    sizeBytes: 0,
    providerMarkedPersonal: false,
    // Most fixtures represent a real bulk newsletter unless a test says
    // otherwise -- looksAutomated defaults true so the newsletter/other-kind
    // "stays retained, not protected" cases aren't swept up by the new
    // no-bulk-signal check.
    looksAutomated: true,
    ...over,
  };
}

function ctxWithKnown(...addresses: string[]): ProtectionContext {
  return { knownSenders: new Set(addresses.map((a) => a.toLowerCase())) };
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

  it("protects a message Gmail/Outlook's own model marked personal", () => {
    expect(
      protectionDecision(message({ id: "important", providerMarkedPersonal: true })).reason,
    ).toBe("provider-marked-personal");
  });

  it("protects a sender the user has actually emailed before", () => {
    const ctx = ctxWithKnown("friend@example.com");
    const msg = message({ id: "m1" });
    expect(protectionDecision(msg, "friend@example.com", ctx).reason).toBe("known-correspondent");
    // Same otherwise-unremarkable bulk newsletter, different (unknown) sender
    // -- not protected by this ctx.
    expect(protectionDecision(msg, "stranger@example.com", ctx).protected).toBe(false);
  });

  it("protects a message with an active discount/return-window subject regardless of kind", () => {
    expect(
      protectionDecision(message({ id: "discount", subject: "20% off — offer ends tonight" })).reason,
    ).toBe("active-offer-or-window");
    expect(
      protectionDecision(message({ id: "return", subject: "Reminder: your return window closes soon" }))
        .reason,
    ).toBe("active-offer-or-window");
  });

  it("protects a message with no bulk-mail signal at all (looks human-authored)", () => {
    expect(
      protectionDecision(message({ id: "human", kind: "other", subject: "Here's that file", looksAutomated: false }))
        .reason,
    ).toBe("no-bulk-signal");
  });

  it("does not protect a clearly bulk newsletter with no other signal", () => {
    expect(protectionDecision(message({ id: "bulk", looksAutomated: true })).protected).toBe(false);
  });

  it("contentHeuristics: false skips transactional/sensitive/no-bulk-signal (spamSuggestions use)", () => {
    // A phishing message impersonating a receipt, from a sender already
    // confirmed malicious by an independent blocklist check -- the caller
    // passes contentHeuristics: false precisely so this isn't protected.
    const phishy = message({
      id: "phish",
      kind: "receipt",
      subject: "Your receipt is ready",
      looksAutomated: false,
    });
    expect(protectionDecision(phishy, undefined, undefined, { contentHeuristics: false }).protected).toBe(
      false,
    );
    // starred/personal/known-correspondent/active-offer still apply even with
    // contentHeuristics off.
    expect(
      protectionDecision({ ...phishy, isProtected: true }, undefined, undefined, {
        contentHeuristics: false,
      }).reason,
    ).toBe("starred-or-flagged");
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
