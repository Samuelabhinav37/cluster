// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { MessageRecord, SenderSummary } from "../lib/senderModel";
import { inboxTabOf } from "../lib/senderModel";
import type { ActionLogEntry } from "../lib/actionLog";
import { clearedByDay, kindOf, mailByKind, renderHomeDashboard, type HomeFacts } from "./homeDashboard";

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
  it("counts each kind, the total, this week and the week before", () => {
    const got = mailByKind(
      [
        sender("shop@example.com", [
          msg({ tab: "promotions" }),
          msg({ tab: "promotions", receivedAt: NOW - 9 * DAY }),
          msg({ tab: "promotions", receivedAt: NOW - 20 * DAY }),
        ]),
        sender("friend@example.com", [msg()]),
      ],
      NOW,
    );
    expect(got).toEqual({
      kinds: { primary: 1, trans: 0, updates: 0, promo: 3 },
      total: 4,
      thisWeek: 2,
      lastWeek: 1,
    });
  });
});

describe("clearedByDay", () => {
  const entry = (
    at: number,
    ids: number,
    via: "untrash" | "unarchive" | "unmute",
    undone = false,
  ): ActionLogEntry => ({
    id: String(at),
    at,
    kind: "trash",
    summary: "",
    undone,
    undo: { provider: "gmail", ids: Array.from({ length: ids }, String), via },
  });

  it("counts emails trashed or filed out per day, today last, and skips undone and older entries", () => {
    const got = clearedByDay(
      [
        entry(NOW, 3, "untrash"),
        entry(NOW - DAY, 2, "unarchive"),
        entry(NOW - DAY, 5, "unarchive", true),
        entry(NOW - 2 * DAY, 4, "unmute"),
        entry(NOW - 8 * DAY, 9, "untrash"),
      ],
      NOW,
    );
    expect(got).toEqual([0, 0, 0, 0, 0, 2, 3]);
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
  clearable: 0,
  limitsOn: 0,
};
const text = (el: Element | null) => el?.textContent ?? "";
const sections = (el: HTMLElement) => Array.from(el.querySelectorAll("h2.section-label")).map(text);

describe("renderHomeDashboard", () => {
  it("says all clear with the since-you-started total when nothing needs you, and hides Next up", () => {
    const el = renderHomeDashboard(
      { ...calm, cleared: { byDay: [0, 0, 0, 0, 0, 0, 0], total: 1240 } },
      vi.fn(),
    );
    expect(text(el.querySelector(".home-verdict"))).toBe("All clear.Nothing needs you today.");
    expect(text(el.querySelector(".home-sub"))).toBe("1,240 emails cleared since you started.");
    expect(el.querySelector(".home-hero .btn")).toBeNull();
    expect(sections(el)).toEqual(["This week", "Your inbox"]);
  });

  it("leads with the scams and opens Protect from the one button", () => {
    const go = vi.fn();
    const el = renderHomeDashboard({ ...calm, suspicious: 3, fakedBrands: ["paypal", "netflix"] }, go);
    expect(text(el.querySelector(".home-verdict .warn"))).toBe("3 emails need you.");
    expect(text(el.querySelector(".home-sub"))).toBe(
      "Don't click anything that says it's from PayPal, Netflix.",
    );
    el.querySelector<HTMLButtonElement>(".home-hero .btn")!.click();
    expect(go).toHaveBeenCalledWith("impersonation");
  });

  it("shows this week's results with gray days, today last, and a comparison chip", () => {
    const el = renderHomeDashboard(
      {
        ...calm,
        thisWeek: 82,
        lastWeek: 100,
        cleared: { byDay: [1, 2, 3, 4, 5, 6, 10], total: 500 },
        suspicious: 2,
      },
      vi.fn(),
    );
    const cards = Array.from(el.querySelectorAll(".week-card"));
    expect(cards.map((c) => text(c.querySelector("b")))).toEqual(["31", "82", "2"]);
    expect(el.querySelectorAll(".spark i")).toHaveLength(7);
    expect(el.querySelector(".spark i:last-child")!.className).toBe("now");
    expect(text(cards[0].querySelector(".chip-delta"))).toBe("500 since you started");
    const arrived = cards[1].querySelector(".chip-delta")!;
    expect(text(arrived)).toBe("↓ 18% vs last week");
    expect(arrived.classList.contains("good")).toBe(true);
    expect(text(cards[2].querySelector("span"))).toBe("scams caught");
  });

  it("lists at most three next steps, each with one button that starts its place's own step", () => {
    const go = vi.fn();
    const el = renderHomeDashboard(
      { ...calm, neverOpened: { senders: 2, emails: 30 }, pastDate: 4, waiting: 2, couldLeaveWeekly: 50 },
      go,
    );
    const rows = Array.from(el.querySelectorAll(".next-row"));
    expect(rows.map((r) => text(r.querySelector("b")))).toEqual([
      "30 emails you never open",
      "4 emails past their date",
      "2 new senders",
    ]);
    expect(rows.every((r) => r.querySelectorAll("button").length === 1)).toBe(true);
    rows[0].querySelector("button")!.click();
    expect(go).toHaveBeenCalledWith("delete", "trash-never-opened");
  });

  it("says what the bar means and gives each kind its count and share", () => {
    const openKind = vi.fn();
    const el = renderHomeDashboard(
      { ...calm, kinds: { ...calm.kinds, trans: 0 }, total: 60 },
      vi.fn(),
      openKind,
    );
    expect(text(el.querySelector(".inbox-line"))).toBe(
      "Most of your mail is promotions. Only 10 of 60 are from people.",
    );
    expect(el.querySelectorAll(".kind-bar span")).toHaveLength(3);
    expect(Array.from(el.querySelectorAll(".kind-legend li")).map(text)).toEqual([
      "People10 · 17%",
      "Receipts0 · 0%",
      "Updates20 · 33%",
      "Promotions30 · 50%",
    ]);
    el.querySelector<HTMLButtonElement>(".kind-legend button")!.click();
    expect(openKind).toHaveBeenCalledWith("primary");
  });

  it("names how far back it has read while mail is still being read", () => {
    const el = renderHomeDashboard({ ...calm, since: NOW - 3 * DAY }, vi.fn());
    expect(text(el.querySelector(".inbox-line"))).toMatch(/Read back to \w+ \d+ so far\.$/);
  });
});
