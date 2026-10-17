import { describe, expect, it, vi } from "vitest";
import type { MessageKind } from "./messageKind";
import type { MessageRecord, SenderSummary } from "./senderModel";
import { planScreenerRelease, runScreenerRelease, type ScreenerReleaseApi } from "./screenerBacklog";
import type { ThreatSignal } from "./threatSignals";

function msg(id: string, kind: MessageKind = "other"): MessageRecord {
  return {
    id,
    receivedAt: Date.now(),
    kind,
    isProtected: false,
    unread: true,
    sizeBytes: 0,
    subject: "",
    providerMarkedPersonal: false,
    looksAutomated: false,
  };
}

function sender(address: string, messages: MessageRecord[], threatSignals: ThreatSignal[] = []): SenderSummary {
  return {
    key: `gmail:${address}`,
    provider: "gmail",
    address,
    displayName: address,
    count: messages.length,
    messageIds: messages.map((m) => m.id),
    protectedMessageIds: [],
    unsubscribe: {},
    messages,
    threatSignals,
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
  };
}

const PHISHY: ThreatSignal[] = [
  { kind: "brand-impersonation", brand: "paypal", confidence: "high" },
  { kind: "failed-authentication", brand: "paypal", confidence: "high" },
];

describe("planScreenerRelease", () => {
  it("sends each message to its category, known people and unclassified mail to the inbox", () => {
    const plan = planScreenerRelease(
      [
        sender("news@substack.com", [msg("n1", "newsletter"), msg("n2", "newsletter")]),
        sender("code@auth.example", [msg("o1", "otp")]),
        sender("friend@gmail.com", [msg("f1", "newsletter")]),
        sender("someone@unknown.example", [msg("u1")]),
      ],
      new Set(["friend@gmail.com"]),
    );
    const byDest = Object.fromEntries(plan.groups.map((g) => [g.destination, g.ids]));
    expect(byDest).toEqual({ newsletter: ["n1", "n2"], otp: ["o1"], inbox: ["f1", "u1"] });
    expect(plan.keptHeld).toEqual([]);
  });

  it("keeps a sender that looks like phishing held", () => {
    const plan = planScreenerRelease([sender("security@paypa1.com", [msg("p1")], PHISHY)], new Set());
    expect(plan.groups).toEqual([]);
    expect(plan.keptHeld).toEqual([{ address: "security@paypa1.com", count: 1 }]);
  });

  it("honours a 'never sort' override by sending that sender's mail to the inbox", () => {
    const plan = planScreenerRelease(
      [sender("news@substack.com", [msg("n1", "newsletter")])],
      new Set(),
      { "news@substack.com": "never" },
    );
    expect(plan.groups).toEqual([expect.objectContaining({ destination: "inbox", ids: ["n1"] })]);
  });
});

function fakeApi(filters: ScreenerReleaseApi extends { listFilters(): Promise<infer F> } ? F : never) {
  return {
    labelIdFor: vi.fn(async (bucket: string) => `L_${bucket}`),
    batchModify: vi.fn(async () => {}),
    listFilters: vi.fn(async () => filters),
    deleteFilter: vi.fn(async (_id: string) => {}),
  } satisfies ScreenerReleaseApi;
}

describe("runScreenerRelease", () => {
  const plan = planScreenerRelease(
    [
      sender("news@substack.com", [msg("n1", "newsletter")]),
      sender("mixed@brand.example", [msg("m1", "newsletter"), msg("m2")]),
    ],
    new Set(),
  );
  const filters = [
    { id: "f-news", criteria: { from: "news@substack.com" }, action: { addLabelIds: ["L_SCREEN"] } },
    { id: "f-mixed", criteria: { from: "mixed@brand.example" }, action: { addLabelIds: ["L_SCREEN"] } },
    { id: "f-mine", criteria: { from: "news@substack.com" }, action: { addLabelIds: ["L_MINE"] } },
  ];

  it("moves mail out of every Screener label and lifts the hold on fully-released senders", async () => {
    const api = fakeApi(filters);
    const res = await runScreenerRelease(plan, new Set(["newsletter", "inbox"]), ["L_SCREEN", "L_OLD"], api);
    expect(api.batchModify).toHaveBeenCalledWith(["n1", "m1"], ["L_newsletter"], ["L_SCREEN", "L_OLD"]);
    expect(api.batchModify).toHaveBeenCalledWith(["m2"], ["INBOX"], ["L_SCREEN", "L_OLD"]);
    expect(res.moved).toBe(3);
    expect(res.released.sort()).toEqual(["mixed@brand.example", "news@substack.com"]);
    // Only Screener filters go; the user's own filter for the same sender stays.
    expect(api.deleteFilter.mock.calls.map((c) => c[0]).sort()).toEqual(["f-mixed", "f-news"]);
  });

  it("keeps the hold on a sender whose mail is split across an unticked group", async () => {
    const api = fakeApi(filters);
    const res = await runScreenerRelease(plan, new Set(["newsletter"]), ["L_SCREEN"], api);
    expect(res.released).toEqual(["news@substack.com"]);
    expect(api.deleteFilter.mock.calls.map((c) => c[0])).toEqual(["f-news"]);
  });
});
