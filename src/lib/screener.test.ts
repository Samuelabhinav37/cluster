import { describe, expect, it } from "vitest";
import { knownSenderSet, pendingScreenerSenders, sentCorrespondentsStale } from "./screener";
import type { SenderSummary } from "./senderModel";
import { defaultSettings, type ClusterSettings } from "./settingsStore";

function settings(over: Partial<ClusterSettings> = {}): ClusterSettings {
  return { ...defaultSettings(), screenerEnabled: false, ...over };
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

  it("holds only lists and automated mail when people are let through", () => {
    const list = { ...sender({ address: "news@x.com" }), unsubscribe: { mailto: "u@x.com" } } as SenderSummary;
    const person = sender({ address: "new.friend@x.com" });
    expect(pendingScreenerSenders([list, person], known, new Set(), false).map((s) => s.address)).toEqual([
      "news@x.com",
    ]);
  });

  it("returns unknown senders (any provider) with no starred mail", () => {
    const senders = [
      sender({ address: "known@x.com" }),
      sender({ address: "stranger@x.com" }),
      sender({ address: "outlook-stranger@x.com", provider: "outlook" }),
      sender({ address: "starred-stranger@x.com", protectedMessageIds: ["m1"] }),
    ];
    expect(pendingScreenerSenders(senders, known).map((s) => s.address)).toEqual([
      "stranger@x.com",
      "outlook-stranger@x.com",
    ]);
  });

  it("leaves out senders the provider marked important or who reply to your mail", () => {
    const withMessage = (address: string, flag: Partial<SenderSummary["messages"][number]>) => ({
      ...sender({ address }),
      messages: [{ id: "m1", ...flag } as SenderSummary["messages"][number]],
    });
    const senders = [
      withMessage("important@x.com", { providerMarkedPersonal: true }),
      withMessage("reply@x.com", { repliesToYou: true }),
      withMessage("plain@x.com", { providerMarkedPersonal: false }),
    ];
    expect(pendingScreenerSenders(senders, known).map((s) => s.address)).toEqual(["plain@x.com"]);
  });

  it("excludes addresses in the excluded set (muted / already screened)", () => {
    const senders = [sender({ address: "a@x.com" }), sender({ address: "b@x.com" })];
    expect(pendingScreenerSenders(senders, known, new Set(["a@x.com"])).map((s) => s.address)).toEqual([
      "b@x.com",
    ]);
  });
});

describe("senderCases (research idea 1)", () => {
  it("puts one company's addresses in one case, biggest first, and leaves people alone", async () => {
    const { senderCases } = await import("./screener");
    const s = (key: string, n: number) => ({ key, address: key, messages: Array.from({ length: n }, (_, i) => ({ id: `${key}${i}` })), messageIds: [] }) as unknown as SenderSummary;
    const queue = [s("orders@amazon.com", 2), s("ship@amazon.com", 5), s("ana@gmail.com", 1)];
    const profiles = new Map([
      ["orders@amazon.com", { companyKey: "amazon.com" }],
      ["ship@amazon.com", { companyKey: "amazon.com" }],
      ["ana@gmail.com", { companyKey: null }],
    ]);
    expect(senderCases(queue, profiles).map((c) => c.map((m) => m.key))).toEqual([["ship@amazon.com", "orders@amazon.com"], ["ana@gmail.com"]]);
  });
});
