import { describe, expect, it, vi } from "vitest";
import type { MessageKind } from "./messageKind";
import type { MessageRecord, SenderSummary } from "./senderModel";
import {
  dueForMove,
  sweepExpiredInbox,
  tagUntaggedInbox,
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
      { "INBOX|newer_than:2d has:nouserlabels": ["n1", "s1", "p1", "x1"] },
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
    expect(res).toEqual({ tagged: 2, byBucket: { otp: 1, shopping: 1 } });
  });

  it("tags Gmail Promotions-tab mail with no other category as 🏷 Promotions", async () => {
    const api = fakeApi(
      { "INBOX|newer_than:2d has:nouserlabels": ["a1"] },
      [sender("ads@brand.example", [msg("a1", "other", { promotion: true })])],
    );
    await tagUntaggedInbox(ctx(), api);
    expect(api.batchModify).toHaveBeenCalledWith(["a1"], ["L:🏷 Promotions"], []);
  });
});
