import { describe, expect, it } from "vitest";
import { knownSenderSet, pendingScreenerSenders, sentCorrespondentsStale } from "./screener";
import type { SenderSummary } from "./senderModel";
import type { ClusterSettings } from "./settingsStore";

function settings(over: Partial<ClusterSettings> = {}): ClusterSettings {
  return {
    schemaVersion: 4,
    scanWindowDays: 180,
    maxMessagesPerProvider: 500,
    collapsedSenderCategories: [],
    collapsedDomainCategories: [],
    unsubscribeRequests: {},
    fastPermanentDeleteEnabled: false,
    onboardingDismissed: false,
    snoozedMessages: {},
    rules: [],
    actionLog: [],
    mutedSenders: [],
    screenerEnabled: false,
    screenerAllowlist: [],
    screenedSenders: [],
    sentCorrespondents: { addresses: [], fetchedAt: 0 },
    lastTriageSummary: "",
    activeTab: "cleanup",
    knownSenders: {},
    knownSendersInitialized: false,
    incrementalSyncCursors: {},
    lastIncrementalSyncAt: 0,
    senderEngagement: {},
    autoQuarantineHighRisk: false,
    autoSort: { enabledBuckets: [], fileOutByBucket: {}, keepSorting: false, expireOtp: false },
    clusterOwnedLabels: [],
    labelChoices: {},
    ...over,
  };
}

function sender(over: {
  address: string;
  provider?: "gmail" | "outlook";
  protectedMessageIds?: string[];
}): SenderSummary {
  const provider = over.provider ?? "gmail";
  return {
    key: `${provider}:${over.address}`,
    provider,
    address: over.address,
    displayName: over.address,
    count: 1,
    messageIds: ["m1"],
    protectedMessageIds: over.protectedMessageIds ?? [],
    unsubscribe: {},
    messages: [],
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
  };
}

describe("knownSenderSet", () => {
  it("unions the allowlist and sent correspondents, lowercased", () => {
    const known = knownSenderSet(
      settings({
        screenerAllowlist: ["Friend@Example.com"],
        sentCorrespondents: { addresses: ["colleague@work.com"], fetchedAt: Date.now() },
      }),
    );
    expect(known.has("friend@example.com")).toBe(true);
    expect(known.has("colleague@work.com")).toBe(true);
  });
});

describe("sentCorrespondentsStale", () => {
  it("is true when never fetched and false when fetched just now", () => {
    expect(sentCorrespondentsStale(settings())).toBe(true);
    expect(
      sentCorrespondentsStale(settings({ sentCorrespondents: { addresses: [], fetchedAt: Date.now() } })),
    ).toBe(false);
  });
});

describe("pendingScreenerSenders", () => {
  const known = new Set(["known@x.com"]);

  it("returns unknown Gmail senders with no starred mail", () => {
    const senders = [
      sender({ address: "known@x.com" }),
      sender({ address: "stranger@x.com" }),
      sender({ address: "outlook-stranger@x.com", provider: "outlook" }),
      sender({ address: "starred-stranger@x.com", protectedMessageIds: ["m1"] }),
    ];
    expect(pendingScreenerSenders(senders, known).map((s) => s.address)).toEqual(["stranger@x.com"]);
  });

  it("excludes addresses in the excluded set (muted / already screened)", () => {
    const senders = [sender({ address: "a@x.com" }), sender({ address: "b@x.com" })];
    expect(pendingScreenerSenders(senders, known, new Set(["a@x.com"])).map((s) => s.address)).toEqual([
      "b@x.com",
    ]);
  });
});
