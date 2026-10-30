// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { MessageRecord, SenderSummary } from "../lib/senderModel";
import { inboxTabOf } from "../lib/senderModel";
import type { ActionLogEntry } from "../lib/actionLog";
import {
  clearedByDay,
  kindOf,
  mailByKind,
  paintHomeRead,
  renderHomeDashboard,
  type HomeFacts,
} from "./homeDashboard";

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
      peopleWeek: 1,
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
const sections = (el: HTMLElement) => Array.from(el.querySelectorAll("h2.section-label")).map((h) => h.firstChild?.textContent ?? "");

describe("renderHomeDashboard", () => {
  it("says nothing needs you in one sentence, and hides Next up", () => {
    const el = renderHomeDashboard(
      { ...calm, cleared: { byDay: [0, 0, 0, 0, 0, 0, 0], total: 1240 } },
      vi.fn(),
    );
    expect(text(el.querySelector(".home-verdict"))).toBe("Nothing needs you today.");
    expect(el.querySelector(".home-sub")).toBeNull();
    expect(el.querySelector(".home-hero .btn")).toBeNull();
    expect(sections(el)).toEqual(["This week", "Your inbox"]);
  });

  it("leads with the scams and opens Protect from the one button", () => {
    const go = vi.fn();
    const el = renderHomeDashboard({ ...calm, suspicious: 3, fakedBrands: ["paypal", "netflix"] }, go);
    expect(text(el.querySelector(".home-verdict"))).toBe("3 emails pretend to be PayPal and Netflix.");
    const review = el.querySelector<HTMLButtonElement>(".home-hero .btn")!;
    expect(text(review)).toBe("Review");
    review.click();
    expect(go).toHaveBeenCalledWith("impersonation");
  });

  it("shows this week's results with gray days, today last, and a comparison chip", () => {
    const openKind = vi.fn();
    const el = renderHomeDashboard(
      {
        ...calm,
        thisWeek: 82,
        lastWeek: 100,
        cleared: { byDay: [1, 2, 3, 4, 5, 6, 10], total: 500 },
        peopleWeek: 8,
      },
      vi.fn(),
      openKind,
    );
    const cards = Array.from(el.querySelectorAll(".week-card"));
    expect(cards.map((c) => text(c.querySelector("b")))).toEqual(["31", "82", "8"]);
    expect(el.querySelectorAll(".spark i")).toHaveLength(7);
    expect(el.querySelector(".spark i:last-child")!.className).toBe("now");
    expect(cards[0].querySelector(".chip-delta")).toBeNull();
    const arrived = cards[1].querySelector(".chip-delta")!;
    expect(text(arrived)).toBe("18% fewer");
    expect(arrived.classList.contains("good")).toBe(true);
    expect(text(cards[2].querySelector("span"))).toBe("from people");
    expect(text(cards[2].querySelector(".chip-delta"))).toBe("10%");
    (cards[2] as HTMLButtonElement).click();
    expect(openKind).toHaveBeenCalledWith("primary");
  });

  it("lists at most three next steps, each with one button that starts its place's own step", () => {
    const go = vi.fn();
    const el = renderHomeDashboard(
      { ...calm, neverOpened: { senders: 2, emails: 30 }, pastDate: 4, waiting: 2, couldLeaveWeekly: 50 },
      go,
    );
    const rows = Array.from(el.querySelectorAll(".next-row"));
    expect(rows.map((r) => text(r.querySelector("b")))).toEqual(["Never opened", "Past its date", "New senders"]);
    expect(rows.map((r) => text(r.querySelector(".next-num")))).toEqual(["30", "4", "2"]);
    expect(rows.every((r) => r.querySelectorAll("button").length === 1)).toBe(true);
    rows[0].querySelector("button")!.click();
    expect(go).toHaveBeenCalledWith("delete", "trash-never-opened");
  });

  it("gives each kind its count", () => {
    const openKind = vi.fn();
    const el = renderHomeDashboard(
      { ...calm, kinds: { ...calm.kinds, trans: 0 }, total: 60 },
      vi.fn(),
      openKind,
    );
    expect(el.querySelectorAll(".kind-bar span")).toHaveLength(3);
    expect(Array.from(el.querySelectorAll(".kind-legend li")).map(text)).toEqual([
      "People10",
      "Receipts0",
      "Updates20",
      "Promotions30",
    ]);
    el.querySelector<HTMLButtonElement>(".kind-legend button")!.click();
    expect(openKind).toHaveBeenCalledWith("primary");
  });

  it("names how far back it has read while mail is still being read", () => {
    const el = renderHomeDashboard({ ...calm, since: NOW - 3 * DAY }, vi.fn());
    expect(text(el.querySelector(".info-pop"))).toMatch(/Read back to \w+ \d+ so far\.$/);
  });

  it("during the first read shows Kai's counter and Found so far instead of the verdict and this week", () => {
    const el = renderHomeDashboard(
      {
        ...calm,
        suspicious: 1,
        neverOpened: { senders: 3, emails: 14 },
        people: 5,
        reading: { done: 40, total: 184 },
      },
      vi.fn(),
    );
    expect(el.querySelector(".home-read .home-kai")).not.toBeNull();
    expect(text(el.querySelector(".home-verdict"))).toBe("Reading your mail.");
    expect(text(el.querySelector(".read-nums"))).toBe("40of 184 emails");
    // Next up stays: you can act while the rest is read.
    expect(sections(el)).toEqual(["Found so far", "Next up", "Your inbox"]);
    expect(Array.from(el.querySelectorAll(".found-tile")).map(text)).toEqual([
      "1look like scams",
      "14you never open",
      "5people you write to",
    ]);
    // A scam during the first read is still found, not hidden behind the verdict.
    expect(el.querySelector(".home-hero .btn")).toBeNull();
  });

  it("moves the counter, the bar and the time left as reading goes on", () => {
    const el = renderHomeDashboard({ ...calm, reading: { done: 0, total: 200 } }, vi.fn());
    const card = el.querySelector(".home-read")!;
    paintHomeRead(card, 50, 200, "about 2 min left");
    expect(text(card.querySelector(".read-nums"))).toBe("50of 200 emailsabout 2 min left");
    expect(card.querySelector<HTMLElement>(".read-track i")!.style.width).toBe("25%");
    expect(card.querySelector(".read-track")!.getAttribute("aria-valuenow")).toBe("50");
    // Between phases "200 of 200" would look finished: say what is read, hide the count.
    paintHomeRead(card, 200, 200, "", "Reading your sent mail");
    expect(text(card.querySelector(".home-verdict"))).toBe("Reading your sent mail.");
    expect(text(card.querySelector(".read-nums"))).toBe("");
    expect(card.querySelector<HTMLElement>(".read-track")!.hidden).toBe(true);
  });
});
