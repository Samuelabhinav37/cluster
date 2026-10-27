// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { MessageRecord, SenderSummary } from "../lib/senderModel";
import { inboxTabOf } from "../lib/senderModel";
import { homeRecommendations, kindOf, mailByKind, renderHomeDashboard, type HomeFacts } from "./homeDashboard";

const NOW = Date.UTC(2026, 9, 17);
const DAY = 24 * 60 * 60 * 1000;

function msg(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: Math.random().toString(36).slice(2),
    receivedAt: NOW - DAY,
    kind: "other",
    isProtected: false,
    unread: false,
    sizeBytes: 0,
    providerMarkedPersonal: false,
    looksAutomated: false,
    ...overrides,
  };
}

function sender(
  address: string,
  messages: MessageRecord[],
  overrides: Partial<SenderSummary> = {},
): SenderSummary {
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
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
    ...overrides,
  };
}

describe("inboxTabOf", () => {
  it("reads the Gmail category, and mail without one is Primary", () => {
    expect(inboxTabOf(["INBOX", "CATEGORY_PROMOTIONS"])).toBe("promotions");
    expect(inboxTabOf(["INBOX", "CATEGORY_SOCIAL"])).toBe("social");
    expect(inboxTabOf(["INBOX", "IMPORTANT"])).toBe("primary");
    expect(inboxTabOf(undefined)).toBeUndefined();
  });
});

describe("kindOf", () => {
  it("sorts mail into Apple Mail's four kinds", () => {
    expect(kindOf(msg({ kind: "receipt", tab: "promotions" }))).toBe("trans");
    expect(kindOf(msg({ kind: "shipping" }))).toBe("trans");
    expect(kindOf(msg({ learnedTransactional: "you" }))).toBe("trans");
    expect(kindOf(msg({ tab: "promotions" }))).toBe("promo");
    expect(kindOf(msg({ kind: "otp" }))).toBe("updates");
    expect(kindOf(msg({ kind: "newsletter", tab: "primary" }))).toBe("updates");
    expect(kindOf(msg({ tab: "forums" }))).toBe("updates");
    expect(kindOf(msg({ tab: "primary" }))).toBe("primary");
    expect(kindOf(msg())).toBe("primary");
  });
});

describe("mailByKind", () => {
  it("counts each kind, the total and the last seven days", () => {
    const got = mailByKind(
      [
        sender("shop@example.com", [msg({ tab: "promotions" }), msg({ tab: "promotions", receivedAt: NOW - 9 * DAY })]),
        sender("friend@example.com", [msg()]),
      ],
      NOW,
    );
    expect(got).toEqual({ kinds: { primary: 1, trans: 0, updates: 0, promo: 2 }, total: 3, thisWeek: 2 });
  });
});

const calm: HomeFacts = {
  kinds: { primary: 10, trans: 5, updates: 20, promo: 30 },
  total: 65,
  thisWeek: 12,
  suspicious: 0,
  waiting: 0,
  neverOpened: { senders: 0, emails: 0 },
  pastDate: 0,
};

describe("homeRecommendations", () => {
  it("puts a scam warning first and stops at three", () => {
    const recs = homeRecommendations(
      { ...calm, suspicious: 2, waiting: 4, neverOpened: { senders: 12, emails: 150 }, pastDate: 29 },
      vi.fn(),
    );
    expect(recs.map((r) => r.name)).toEqual([
      "2 senders look like a scam",
      "Mute 12 senders you never open",
      "Trash mail past its date",
    ]);
  });

  it("each button opens its place and starts that place's own confirm", () => {
    const go = vi.fn();
    for (const r of homeRecommendations({ ...calm, neverOpened: { senders: 1, emails: 3 }, pastDate: 2, waiting: 1 }, go)) r.go();
    expect(go.mock.calls).toEqual([["delete", "mute-never-opened"], ["delete", "trash-past-date"], ["screener"]]);
  });
});

describe("renderHomeDashboard", () => {
  it("shows the total, one bar segment per kind with mail, and a labelled legend", () => {
    const el = renderHomeDashboard({ ...calm, kinds: { ...calm.kinds, trans: 0 } }, vi.fn());
    expect(el.querySelector(".home-big")!.textContent).toBe("65 emails in your inbox+12 this week");
    expect(el.querySelectorAll(".kind-bar span")).toHaveLength(3);
    expect(el.querySelector(".kind-bar")!.getAttribute("aria-label")).toBe(
      "Primary 10, Transactions 0, Updates 20, Promotions 30",
    );
    expect(Array.from(el.querySelectorAll(".kind-legend li")).map((li) => li.textContent)).toEqual([
      "Primary10",
      "Transactions0",
      "Updates20",
      "Promotions30",
    ]);
  });

  it("says nothing needs you when there is nothing to recommend", () => {
    const el = renderHomeDashboard(calm, vi.fn());
    expect(el.querySelector(".rec-grid")!.textContent).toBe("Nothing needs you right now");
    expect(el.querySelectorAll(".rec-grid button")).toHaveLength(0);
  });

  it("keeps Home under its word budget with every card showing", () => {
    const el = renderHomeDashboard(
      { ...calm, suspicious: 1, neverOpened: { senders: 12, emails: 150 }, pastDate: 29 },
      vi.fn(),
    );
    const words = (el.textContent ?? "").replace(/(\d)([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean);
    expect(words.length).toBeLessThanOrEqual(40);
    expect(el.textContent).not.toMatch(/[–—]/);
  });
});
