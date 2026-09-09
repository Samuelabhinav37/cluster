import { describe, expect, it } from "vitest";
import { buildSubscriptionCandidates, detectSubscriptionSignal } from "./subscriptionSignals";
import type { SenderSummary } from "./senderModel";

describe("detectSubscriptionSignal", () => {
  it("flags trial-ending language even from an unrecognized domain", () => {
    expect(detectSubscriptionSignal("Your trial ends tomorrow", "unknown-app.example")).toBe(
      "trial-ending",
    );
    expect(detectSubscriptionSignal("Your free trial is ending soon", "unknown-app.example")).toBe(
      "trial-ending",
    );
  });

  it("flags renewal language even from an unrecognized domain", () => {
    expect(detectSubscriptionSignal("Your subscription renews on June 1", "unknown-app.example")).toBe(
      "renewal",
    );
    expect(detectSubscriptionSignal("Auto-renewal notice", "unknown-app.example")).toBe("renewal");
  });

  it("flags a plain message from a known subscription domain as domain-match", () => {
    expect(detectSubscriptionSignal("Here's what's new this month", "netflix.com")).toBe(
      "domain-match",
    );
    expect(detectSubscriptionSignal("", "spotify.com")).toBe("domain-match");
  });

  it("matches a sending subdomain to its registrable subscription domain", () => {
    expect(detectSubscriptionSignal("Your receipt", "billing.netflix.com")).toBe("domain-match");
  });

  it("prioritizes trial-ending/renewal language over a plain domain match", () => {
    expect(detectSubscriptionSignal("Your trial ends tomorrow", "netflix.com")).toBe("trial-ending");
  });

  it("does not flag generic 'you're subscribed' language from an unrecognized domain", () => {
    expect(
      detectSubscriptionSignal("Welcome to your subscription", "unknown-newsletter.example"),
    ).toBeNull();
    expect(detectSubscriptionSignal("Subscription confirmed", "unknown-newsletter.example")).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(detectSubscriptionSignal("Let's catch up sometime", "a-friend.example")).toBeNull();
    expect(detectSubscriptionSignal("", "")).toBeNull();
  });
});

function sender(address: string, subjects: string[], receivedAtStart = 1000): SenderSummary {
  return {
    key: `gmail:${address}`,
    provider: "gmail",
    address,
    displayName: address,
    count: subjects.length,
    messageIds: subjects.map((_, i) => `m${i}`),
    protectedMessageIds: [],
    unsubscribe: {},
    messages: subjects.map((subject, i) => ({
      id: `m${i}`,
      subject,
      receivedAt: receivedAtStart + i,
      kind: "other",
      isProtected: false,
      unread: false,
      sizeBytes: 0,
    })),
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
  };
}

describe("buildSubscriptionCandidates", () => {
  it("skips senders with no subscription signal", () => {
    const senders = [sender("friend@example.com", ["Let's catch up"])];
    expect(buildSubscriptionCandidates(senders)).toEqual([]);
  });

  it("picks the strongest signal seen across a sender's messages", () => {
    const senders = [
      sender("no-reply@netflix.com", ["Here's what's new", "Your trial ends tomorrow"]),
    ];
    const [candidate] = buildSubscriptionCandidates(senders);
    expect(candidate.signal).toBe("trial-ending");
  });

  it("sorts trial-ending before renewal before a plain domain-match", () => {
    const senders = [
      sender("no-reply@spotify.com", ["Just checking in"]), // domain-match
      sender("billing@netflix.com", ["Your subscription renews on June 1"]), // renewal
      sender("billing@hulu.com", ["Your trial ends tomorrow"]), // trial-ending
    ];
    const candidates = buildSubscriptionCandidates(senders);
    expect(candidates.map((c) => c.signal)).toEqual(["trial-ending", "renewal", "domain-match"]);
  });

  it("records the most recent matching message's receivedAt as lastSeenAt", () => {
    const senders = [sender("no-reply@netflix.com", ["Here's what's new", "More news"], 1000)];
    const [candidate] = buildSubscriptionCandidates(senders);
    expect(candidate.lastSeenAt).toBe(1001);
  });
});
