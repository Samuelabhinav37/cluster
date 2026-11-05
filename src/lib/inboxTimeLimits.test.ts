import { describe, expect, it, vi } from "vitest";
import type { MessageKind } from "./messageKind";
import type { MessageRecord, SenderSummary } from "./senderModel";
import {
  dueForMove,
  holdUnsortedInbox,
  labelFromIndex,
  sweepExpiredInbox,
  TAG_BACK_DONE,
  tagOlderInbox,
  tagUntaggedInbox,
  withoutClusterLabels,
  type CategoryLimit,
  type InboxLimitsApi,
  type LimitContext,
} from "./inboxTimeLimits";
import type { ThreatSignal } from "./threatSignals";

const NOW = Date.UTC(2026, 9, 5, 12);

function msg(id: string, kind: MessageKind = "other", extra: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id,
    receivedAt: NOW,
    kind,
    isProtected: false,
    unread: true,
    sizeBytes: 0,
    subject: "",
    providerMarkedPersonal: false,
    looksAutomated: false,
    ...extra,
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
    protectedMessageIds: messages.filter((m) => m.isProtected).map((m) => m.id),
    unsubscribe: {},
    messages,
    threatSignals,
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
  };
}

const LIMITS: CategoryLimit[] = [
  { bucket: "otp", labelName: "🔑 One-time codes", hours: 24 },
  { bucket: "shopping", labelName: "🛍 Shopping", hours: 72 },
  { bucket: "promotions", labelName: "🏷 Promotions", hours: 24 },
  { bucket: "finance", labelName: "💳 Finance", hours: null },
];

function ctx(extra: Partial<LimitContext> = {}): LimitContext {
  return { limits: LIMITS, known: new Set(), overrides: {}, now: NOW, ...extra };
}

/** A fake mailbox: `lists` maps "labelId|query" to ids. */
function fakeApi(lists: Record<string, string[]>, senders: SenderSummary[] = []) {
  return {
    findLabelId: vi.fn(async (name: string) => `L:${name}`),
    ensureLabelId: vi.fn(async (name: string) => `L:${name}`),
    listIds: vi.fn(async (labelIds: string[], query: string) => lists[`${labelIds.join(",")}|${query}`] ?? []),
    readSenders: vi.fn(async (ids: string[]) =>
      senders
        .map((s) => ({ ...s, messages: s.messages.filter((m) => ids.includes(m.id)) }))
        .filter((s) => s.messages.length > 0),
    ),
    batchModify: vi.fn(async (_ids: string[], _add: string[], _remove: string[]) => {}),
  } satisfies InboxLimitsApi;
}

const DAY_S = 24 * 60 * 60;
const cutoff = (hours: number) => Math.floor(NOW / 1000) - hours * 3600;

describe("dueForMove", () => {
  it("moves mail only when every Cluster label it carries has run out", () => {
    const due = new Map([
      ["promotions" as const, ["a", "b"]],
      ["otp" as const, ["c"]],
    ]);
    // b is also Shopping (3 days, not yet up); c is also Finance (stays).
    const notYet = new Map([
      ["shopping" as const, ["b"]],
      ["finance" as const, ["c"]],
    ]);
    expect(dueForMove(due, notYet)).toEqual(["a"]);
  });
});

describe("sweepExpiredInbox", () => {
  it("lists each category's inbox mail before and after its cutoff, in epoch seconds", async () => {
    const api = fakeApi({});
    await sweepExpiredInbox(ctx(), api);
    expect(api.listIds).toHaveBeenCalledWith(
      ["INBOX", "L:🔑 One-time codes"],
      `before:${cutoff(24)} -is:starred`,
      5000,
    );
    expect(api.listIds).toHaveBeenCalledWith(["INBOX", "L:🛍 Shopping"], `after:${cutoff(72)}`, 5000);
    // A category that stays in the inbox only blocks.
    expect(api.listIds).toHaveBeenCalledWith(["INBOX", "L:💳 Finance"], "", 5000);
    expect(cutoff(24)).toBe(Math.floor(NOW / 1000) - DAY_S);
  });

  it("moves due mail out of the inbox but keeps starred, known people and risky senders", async () => {
    const phishy: ThreatSignal[] = [
      { kind: "brand-impersonation", brand: "paypal", confidence: "high" },
      { kind: "failed-authentication", brand: "paypal", confidence: "high" },
    ];
    const api = fakeApi(
      { [`INBOX,L:🔑 One-time codes|before:${cutoff(24)} -is:starred`]: ["o1", "o2", "o3", "o4"] },
      [
        sender("code@auth.example", [msg("o1", "otp"), msg("o2", "otp", { isProtected: true })]),
        sender("friend@mail.example", [msg("o3", "otp")]),
        sender("security@paypa1.com", [msg("o4", "otp")], phishy),
      ],
    );
    const res = await sweepExpiredInbox(ctx({ known: new Set(["friend@mail.example"]) }), api);
    expect(api.batchModify).toHaveBeenCalledWith(["o1"], [], ["INBOX"]);
    expect(res.movedIds).toEqual(["o1"]);
    expect(res.keptIds.sort()).toEqual(["o2", "o3", "o4"]);
  });

  it("skips messages an earlier sweep kept, and does nothing without a label", async () => {
    const api = fakeApi({ [`INBOX,L:🔑 One-time codes|before:${cutoff(24)} -is:starred`]: ["o1"] });
    const res = await sweepExpiredInbox(ctx({ keptIds: new Set(["o1"]) }), api);
    expect(res.movedIds).toEqual([]);
    expect(api.readSenders).not.toHaveBeenCalled();

    const noLabel = fakeApi({});
    noLabel.findLabelId.mockResolvedValue(null as unknown as string);
    await sweepExpiredInbox(ctx(), noLabel);
    expect(noLabel.listIds).not.toHaveBeenCalled();
  });
});

describe("tagUntaggedInbox", () => {
  it("labels recent unlabelled inbox mail by category, leaving it in the inbox", async () => {
    const api = fakeApi(
      { [`INBOX|newer_than:2d ${withoutClusterLabels(ctx().limits)}`]: ["n1", "s1", "p1", "x1"] },
      [
        sender("code@auth.example", [msg("n1", "otp")]),
        sender("deals@amazon.com", [msg("s1")]),
        sender("friend@mail.example", [msg("p1", "otp")]),
        sender("someone@unknown.example", [msg("x1")]),
      ],
    );
    const res = await tagUntaggedInbox(ctx({ known: new Set(["friend@mail.example"]) }), api);
    expect(api.batchModify).toHaveBeenCalledWith(["n1"], ["L:🔑 One-time codes"], []);
    expect(api.batchModify).toHaveBeenCalledWith(["s1"], ["L:🛍 Shopping"], []);
    expect(res).toEqual({ tagged: 2, byBucket: { otp: 1, shopping: 1 }, oldestAt: NOW, listed: 4 });
  });

  it("tags Gmail Promotions-tab mail with no other category as 🏷 Promotions", async () => {
    const api = fakeApi(
      { [`INBOX|newer_than:2d ${withoutClusterLabels(ctx().limits)}`]: ["a1"] },
      [sender("ads@brand.example", [msg("a1", "other", { promotion: true })])],
    );
    await tagUntaggedInbox(ctx(), api);
    expect(api.batchModify).toHaveBeenCalledWith(["a1"], ["L:🏷 Promotions"], []);
  });
});

describe("tagOlderInbox", () => {
  const twoDaysAgo = Math.floor((NOW - 48 * 3600_000) / 1000);
  it("starts two days back and walks back to the oldest mail it read", async () => {
    const old = NOW - 10 * 24 * 3600_000;
    const api = fakeApi(
      { [`INBOX|before:${twoDaysAgo} ${withoutClusterLabels(ctx().limits)}`]: ["o1", "o2"] },
      [sender("code@auth.example", [msg("o1", "otp", { receivedAt: old }), msg("o2", "otp", { receivedAt: old + 5000 })])],
    );
    const res = await tagOlderInbox(ctx(), api, 0);
    expect(api.batchModify).toHaveBeenCalledWith(["o1", "o2"], ["L:🔑 One-time codes"], []);
    expect(res).toEqual({ tagged: 2, nextBefore: old });
  });

  it("is done when nothing older is left", async () => {
    const api = fakeApi({}, []);
    expect(await tagOlderInbox(ctx(), api, NOW - 1000)).toEqual({ tagged: 0, nextBefore: TAG_BACK_DONE });
  });

  it("is not done when Gmail listed mail it couldn't read; it retries from the same place", async () => {
    const api = fakeApi({ [`INBOX|before:${twoDaysAgo} ${withoutClusterLabels(ctx().limits)}`]: ["gone"] }, []);
    expect(await tagOlderInbox(ctx(), api, 0)).toEqual({ tagged: 0, nextBefore: 0 });
  });
});

describe("labelFromIndex", () => {
  const senders = [
    sender("code@auth.example", [msg("a", "otp"), msg("b", "otp")]),
    sender("deals@shop.example", [msg("w", "otp")]),
    sender("friend@gmail.com", [msg("p")]),
    sender("risky@x.example", [msg("r", "otp")], [
      { kind: "brand-impersonation", brand: "paypal", confidence: "high" },
      { kind: "failed-authentication", brand: "paypal", confidence: "high" },
    ]),
  ];

  it("adds missing labels, swaps a wrong Cluster label, and leaves mail that fits no label", async () => {
    const api = fakeApi({}, senders);
    const res = await labelFromIndex(ctx(), api, [
      { id: "a", labelIds: ["INBOX"] },
      { id: "b", labelIds: ["INBOX", "L:🔑 One-time codes"] },
      { id: "w", labelIds: ["INBOX", "L:🛍 Shopping"] },
      { id: "p", labelIds: ["INBOX", "L:🛍 Shopping"] },
      { id: "r", labelIds: ["INBOX"] },
    ]);
    expect(api.batchModify).toHaveBeenCalledWith(["a", "w"], ["L:🔑 One-time codes"], []);
    expect(api.batchModify).toHaveBeenCalledWith(["w"], [], ["L:🛍 Shopping"]);
    expect(api.batchModify).toHaveBeenCalledTimes(2);
    expect(res).toMatchObject({ labelled: 2, fixed: 1, byBucket: { otp: 3 } });
    expect(res.changes.get("w")).toEqual({ add: ["L:🔑 One-time codes"], remove: ["L:🛍 Shopping"] });
  });

  it("lets a sender correction win over the classifier", async () => {
    const api = fakeApi({}, senders);
    await labelFromIndex(ctx({ overrides: { "deals@shop.example": "shopping" } }), api, [{ id: "w", labelIds: ["INBOX", "L:🔑 One-time codes"] }]);
    expect(api.batchModify).toHaveBeenCalledWith(["w"], ["L:🛍 Shopping"], []);
    expect(api.batchModify).toHaveBeenCalledWith(["w"], [], ["L:🔑 One-time codes"]);
  });

  it("does nothing on an empty inbox", async () => {
    const api = fakeApi({}, senders);
    expect((await labelFromIndex(ctx(), api, [])).labelled).toBe(0);
    expect(api.readSenders).not.toHaveBeenCalled();
  });
});

describe("holdUnsortedInbox", () => {
  it("holds mail that fits no label in the Screener, and leaves people, invites and sortable mail", async () => {
    const senders = [
      sender("hello@unknown-co.example", [msg("u1", "other", { looksAutomated: true })]),
      sender("deals@amazon.com", [msg("s1", "newsletter", { looksAutomated: true })]),
      sender("friend@gmail.com", [msg("p1")]),
      sender("boss@work.example", [msg("k1", "other", { looksAutomated: true })]),
      sender("cal@corp.example", [msg("c1", "other", { subject: "Invitation: Sync @ Wed", looksAutomated: true })]),
      sender("star@x.example", [msg("st", "other", { isProtected: true, looksAutomated: true })]),
      sender("imp@x.example", [msg("im", "other", { providerMarkedPersonal: true })]),
    ];
    const all = senders.flatMap((s) => s.messages.map((m) => m.id));
    const api = fakeApi({}, senders);
    api.listIds.mockResolvedValue(all);
    const res = await holdUnsortedInbox(ctx({ known: new Set(["boss@work.example"]) }), api, "✋ Screener");
    expect(res.heldIds).toEqual(["u1"]);
    expect(res.senders).toEqual(["hello@unknown-co.example"]);
    expect(api.batchModify).toHaveBeenCalledWith(["u1"], ["L:✋ Screener"], ["INBOX"]);
    const query = api.listIds.mock.calls[0][1];
    expect(query).toContain(`before:${cutoff(3)}`);
    expect(query).toContain('-label:"✋ Screener"');
    expect(query).toContain('-label:"🛍 Shopping"');
  });

  it("does nothing when nothing is unsorted", async () => {
    const api = fakeApi({});
    expect((await holdUnsortedInbox(ctx(), api, "✋ Screener")).heldIds).toEqual([]);
    expect(api.batchModify).not.toHaveBeenCalled();
  });
});
