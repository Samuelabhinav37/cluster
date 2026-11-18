// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { MessageRecord, SenderSummary } from "../lib/senderModel";
import { niceStep } from "./cleanupPage";
import { inboxTabOf } from "../lib/senderModel";
import type { ActionLogEntry } from "../lib/actionLog";
import {
  clearedByDay,
  kindOf,
  mailByKind,
  paintHomeRead,
  renderHomeDashboard,
  sweepLine,
  receivedInRange,
  gmailDayUrl,
  gmailUrl,
  receivedStats,
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
  it("a label the engine gives decides the kind; Personal is People", () => {
    expect(kindOf(msg({ tab: "promotions" }), "receipt")).toBe("trans");
    expect(kindOf(msg({ kind: "receipt" }), "promotions")).toBe("promo");
    expect(kindOf(msg({ tab: "updates" }), "personal")).toBe("primary");
    expect(kindOf(msg({ tab: "promotions" }), "screener")).toBe("promo");
  });

  it("sorts unlabelled mail into Apple Mail's four kinds by its own signals", () => {
    expect(kindOf(msg({ kind: "receipt", tab: "promotions" }), undefined)).toBe("trans");
    expect(kindOf(msg({ kind: "shipping" }), undefined)).toBe("trans");
    expect(kindOf(msg({ learnedTransactional: "you" }), undefined)).toBe("trans");
    expect(kindOf(msg({ tab: "promotions" }), undefined)).toBe("promo");
    expect(kindOf(msg({ kind: "otp" }), undefined)).toBe("updates");
    expect(kindOf(msg({ kind: "newsletter", tab: "primary" }), undefined)).toBe("updates");
    expect(kindOf(msg({ tab: "forums" }), undefined)).toBe("updates");
    expect(kindOf(msg({ tab: "primary" }), undefined)).toBe("primary");
    expect(kindOf(msg(), undefined)).toBe("primary");
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
          msg({ tab: "promotions", receivedAt: NOW - 40 * DAY }),
        ]),
        sender("friend@example.com", [msg()]),
      ],
      NOW,
      new Map(),
    );
    expect(got).toEqual({
      kinds: { primary: 1, trans: 0, updates: 0, promo: 4 },
      total: 5,
      thisWeek: 2,
      lastWeek: 1,
      peopleWeek: 1,
      receivedByDay: [0, 0, 0, 0, 0, 2, 0],
      receivedPrevByDay: [0, 0, 0, 0, 1, 0, 0],
    });
    const range = receivedInRange(
      [sender("shop@example.com", [msg({ receivedAt: NOW - 40 * DAY }), msg({ receivedAt: NOW - 9 * DAY }), msg({ receivedAt: NOW - 20 * DAY })]), sender("friend@example.com", [msg()])],
      NOW,
      30,
    );
    expect(range.days).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0]);
    expect(range.prev).toBe(1);
    expect(receivedInRange([sender("friend@example.com", [msg()])], NOW, 7).days).toEqual([0, 0, 0, 0, 0, 1, 0]);
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
  it("the first tile follows the picked range against the same number of days before it", () => {
    const el = renderHomeDashboard({ ...calm, receivedDays: [3, 4, 5], receivedPrev: 6, rangeLabel: "Last 3 days" }, vi.fn());
    expect(text(el.querySelector(".mt-tile"))).toBe("Received12100%from the 3 days before");
  });

  it("shows four metric tiles, then Mail by category", () => {
    const go = vi.fn();
    const el = renderHomeDashboard({ ...calm, lastWeek: 10, waiting: 2, clearable: 7, inboxUnread: 5, unreadWeekAgo: 4 }, go);
    expect(el.querySelector(".home-hero")).toBeNull();
    const tiles = Array.from(el.querySelectorAll<HTMLElement>(".mt-tile"));
    expect(tiles.map(text)).toEqual([
      "Received this week1220%from last week",
      "Unread in inbox now525%from last week",
      "In the Screener2emails from new senders",
      "Ready to clean up7emails you can clear",
    ]);
    expect(tiles[0].classList.contains("is-hero")).toBe(true);
    // More mail is fine; more unread is not.
    expect(tiles[0].querySelector(".mt-badge.is-good")).not.toBeNull();
    expect(tiles[1].querySelector(".mt-badge.is-bad")).not.toBeNull();
    tiles[0].click();
    expect(go).toHaveBeenLastCalledWith("organize");
    tiles[2].click();
    expect(go).toHaveBeenLastCalledWith("screener");
    tiles[3].click();
    expect(go).toHaveBeenLastCalledWith("delete");
    const widgets = Array.from(el.querySelectorAll<HTMLElement>(".ov-w"));
    expect(widgets.map((w) => w.querySelector(".ov-w-title")?.firstChild?.textContent)).toEqual(["Mail by category"]);
    widgets[0].click();
    expect(go).toHaveBeenLastCalledWith("organize");
  });

  it("gives each kind its count, and a kind opens its emails", () => {
    const openKind = vi.fn();
    const el = renderHomeDashboard({ ...calm, kinds: { ...calm.kinds, trans: 0 }, total: 60 }, vi.fn(), openKind);
    expect(Array.from(el.querySelectorAll(".ov-legend button")).map(text)).toEqual([
      "People10",
      "Transactions0",
      "Updates20",
      "Offers30",
    ]);
    expect(text(el.querySelector(".ov-gauge-num"))).toBe("60");
    el.querySelector<HTMLButtonElement>(".ov-legend button")!.click();
    expect(openKind).toHaveBeenCalledWith("primary");
  });

  it("shares the gauge's 21 bars between the kinds, and shows Received Mails' growth", () => {
    const el = renderHomeDashboard(
      { ...calm, kinds: { primary: 10, trans: 0, updates: 10, promo: 0 }, receivedDays: Array(30).fill(4), receivedPrev: 100 },
      vi.fn(),
    );
    const strokes = Array.from(el.querySelectorAll(".ov-gauge line")).map((l) => l.getAttribute("stroke"));
    expect(strokes).toHaveLength(21);
    expect(new Set(strokes).size).toBe(2);
    expect(text(el.querySelector(".mr-stats"))).toMatch(/^Total120\+20%Per day4Busiest day\w+days$/);
  });

  it("gives out all 21 gauge bars when the shares round unevenly", () => {
    const el = renderHomeDashboard({ ...calm, kinds: { primary: 640, trans: 1220, updates: 1480, promo: 1526 } }, vi.fn());
    const strokes = Array.from(el.querySelectorAll(".ov-gauge line")).map((l) => l.getAttribute("stroke"));
    expect(strokes.filter((c) => c === "var(--neutral-fill)")).toEqual([]);
  });

  it("hovering Received Mails lights that day's bar and names its count and date", () => {
    const el = renderHomeDashboard({ ...calm, receivedDays: Array.from({ length: 30 }, (_, i) => i) }, vi.fn());
    const plot = el.querySelector<HTMLElement>(".mr-plot")!;
    plot.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 100 }) as DOMRect;
    plot.dispatchEvent(new MouseEvent("mousemove", { clientX: 295 }));
    const lit = Array.from(plot.querySelectorAll(".mr-bar")).findIndex((b) => b.classList.contains("on"));
    expect(lit).toBe(29);
    expect(text(plot.querySelector(".mr-tip"))).toMatch(/^29 emails · \w+ \d+Open in Gmail$/);
    plot.dispatchEvent(new MouseEvent("mouseleave"));
    expect(plot.querySelector<HTMLElement>(".mr-tip")!.hidden).toBe(true);
  });

  it("links a day to Gmail in this account, midnight to midnight, mail sent to you", () => {
    const start = new Date(2026, 10, 12).getTime();
    const url = gmailDayUrl("sam@gmail.com", start);
    expect(url.startsWith("https://mail.google.com/mail/?authuser=sam%40gmail.com#search/")).toBe(true);
    const q = decodeURIComponent(url.split("#search/")[1]);
    const end = new Date(2026, 10, 13).getTime();
    expect(q).toBe(`after:${start / 1000} before:${end / 1000} -from:me`);
    expect(gmailUrl(undefined, "inbox")).toBe("https://mail.google.com/mail/u/0/#inbox");
  });

  it("clicking a day's bar opens that day in Gmail", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const el = renderHomeDashboard({ ...calm, account: "sam@gmail.com", receivedDays: Array.from({ length: 30 }, () => 3) }, vi.fn());
    const plot = el.querySelector<HTMLElement>(".mr-plot")!;
    plot.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 100 }) as DOMRect;
    plot.dispatchEvent(new MouseEvent("click", { clientX: 295 }));
    expect(open).toHaveBeenCalledWith(expect.stringContaining("authuser=sam%40gmail.com#search/after%3A"), "_blank", "noopener");
    open.mockRestore();
  });

  it("hovering a kind lights only its bars and shows its count", () => {
    const el = renderHomeDashboard({ ...calm, kinds: { primary: 10, trans: 0, updates: 10, promo: 0 } }, vi.fn());
    const updates = Array.from(el.querySelectorAll<HTMLButtonElement>(".ov-legend button"))[2];
    updates.onmouseenter!(new MouseEvent("mouseenter"));
    const lines = Array.from(el.querySelectorAll(".ov-gauge line"));
    expect(lines.filter((l) => l.classList.contains("on")).length).toBeGreaterThan(0);
    expect(new Set(lines.filter((l) => l.classList.contains("on")).map((l) => l.getAttribute("stroke"))).size).toBe(1);
    expect(text(el.querySelector(".ov-gauge-num")) + text(el.querySelector(".ov-gauge-label"))).toBe("10Updates");
    updates.onmouseleave!(new MouseEvent("mouseleave"));
    expect(text(el.querySelector(".ov-gauge-num")) + text(el.querySelector(".ov-gauge-label"))).toBe("20emails");
  });

  it("lists top senders beside Received Mails", () => {
    const el = renderHomeDashboard({ ...calm, topSenders: [{ address: "a@shop.test", name: "Shop", count: 4 }] }, vi.fn());
    expect(text(el.querySelector(".ov-top10 .t10-row"))).toContain("Shop4");
  });

  it("a top sender opens that sender's emails, as in Cleanup", () => {
    const openSender = vi.fn();
    const el = renderHomeDashboard(
      { ...calm, topSenders: [{ key: "co:shop", address: "a@shop.test", name: "Shop", count: 4 }] },
      vi.fn(),
      undefined,
      openSender,
    );
    el.querySelector<HTMLButtonElement>("button.t10-row")!.click();
    expect(openSender).toHaveBeenCalledWith("co:shop");
  });

  it("names how far back it has read while mail is still being read", () => {
    const el = renderHomeDashboard({ ...calm, since: NOW - 3 * DAY }, vi.fn());
    expect(text(el.querySelector(".info-pop"))).toMatch(/Read back to \w+ \d+ so far\.$/);
  });

  it("during the first read shows the counter and nothing else", () => {
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
    expect(text(el.querySelector(".scn-title"))).toBe("Reading your mail");
    expect(text(el.querySelector(".scn-line"))).toBe("40 of 184 emails");
    expect(text(el.querySelector(".scn-pct"))).toBe("21%");
    expect(sections(el)).toEqual([]);
    expect(el.children).toHaveLength(1);
    // A scam during the first read is still found, not hidden behind the verdict.
    expect(el.querySelector(".home-hero .btn")).toBeNull();
  });

  it("moves the counter, the bar and the time left as reading goes on", () => {
    const el = renderHomeDashboard({ ...calm, reading: { done: 0, total: 200 } }, vi.fn());
    const card = el.querySelector(".home-read")!;
    paintHomeRead(card, 50, 200, "about 2 min left", "Reading your mail", {
      latest: { name: "Amazon", address: "news@amazon.com", receivedAt: Date.UTC(2024, 2, 9, 12) },
      senders: 12,
    });
    expect(text(card.querySelector(".scn-line"))).toBe("50 of 200 emails · about 2 min left");
    expect(card.querySelector<HTMLElement>(".read-track i")!.style.width).toBe("25%");
    expect(card.querySelector(".read-track")!.getAttribute("aria-valuenow")).toBe("50");
    // What a copy window shows: who is being read now, and how many senders so far.
    expect(text(card.querySelector(".scn-who"))).toContain("Amazon · Mar 2024");
    expect(text(card.querySelector(".scn-facts"))).toContain("12");
    // Between phases "200 of 200" would look finished: say what is read, hide the count.
    paintHomeRead(card, 200, 200, "", "Reading your sent mail");
    expect(text(card.querySelector(".scn-title"))).toBe("Reading your sent mail");
    expect(text(card.querySelector(".scn-line"))).toBe("");
    // No count, but still working: the bar slides instead of vanishing.
    expect(card.querySelector<HTMLElement>(".read-track")!.hidden).toBe(false);
    expect(card.querySelector(".read-track")!.classList.contains("is-busy")).toBe(true);
    paintHomeRead(card, 200, 200, "");
    expect(card.querySelector<HTMLElement>(".read-track")!.hidden).toBe(true);
  });
});

describe("receivedStats", () => {
  it("averages a day and names the weekday with the most mail on average", () => {
    // 14 days ending on a Wednesday (2024-01-17); Mondays get 10, other days 1.
    const now = new Date(2024, 0, 17, 12).getTime();
    const days = Array.from({ length: 14 }, (_, i) => (new Date(now - (13 - i) * 86_400_000).getDay() === 1 ? 10 : 1));
    const got = receivedStats(days, now);
    expect(got.total).toBe(32);
    expect(got.perDay).toBe(2);
    expect(got.busiest).toBe(new Date(2024, 0, 8).toLocaleDateString(undefined, { weekday: "long" }) + "s");
    expect(receivedStats([0, 0, 0], now).busiest).toBeUndefined();
  });
});

describe("sweepLine", () => {
  it("says nothing while the run is healthy, and warns after 30 minutes without one", () => {
    expect(sweepLine(NOW - 4 * 60000, NOW)).toBeNull();
    const stale = sweepLine(NOW - 31 * 60000, NOW)!;
    expect(stale.className).toContain("ov-stale");
    expect(stale.textContent).toMatch(/^Inbox not checked since /);
  });
});

describe("niceStep", () => {
  it("splits the busiest day into about three round steps", () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(7)).toBe(5);
    expect(niceStep(40)).toBe(20);
    expect(niceStep(74)).toBe(25);
    expect(niceStep(5_800_000)).toBe(2_000_000);
  });
});
