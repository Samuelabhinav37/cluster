// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { MessageRecord, SenderSummary } from "../lib/senderModel";
import { inboxTabOf } from "../lib/senderModel";
import {
  mailByTab,
  readRate,
  renderHomeDashboard,
  topCompanies,
  verifiedShare,
  type DashboardFacts,
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

describe("mailByTab", () => {
  it("counts messages per tab", () => {
    const counts = mailByTab([
      sender("a@x.com", [msg({ tab: "primary" }), msg({ tab: "promotions" }), msg({ tab: "promotions" })]),
      sender("b@y.com", [msg({ tab: "updates" })]),
    ]);
    expect(counts).toEqual({ primary: 1, promotions: 2, social: 0, updates: 1, forums: 0 });
  });

  it("is null when no message has a tab", () => {
    expect(mailByTab([sender("a@outlook.com", [msg()])])).toBeNull();
  });
});

describe("readRate", () => {
  it("gives the overall share and one value per week, oldest first", () => {
    const { overall, byWeek } = readRate(
      [
        sender("a@x.com", [
          msg({ receivedAt: NOW - DAY, unread: false }),
          msg({ receivedAt: NOW - 2 * DAY, unread: true }),
          msg({ receivedAt: NOW - 10 * DAY, unread: true }),
        ]),
      ],
      NOW,
      4,
    );
    expect(overall).toBeCloseTo(1 / 3);
    expect(byWeek.map((w) => w.rate)).toEqual([null, null, 0, 0.5]);
  });

  it("is null with no mail", () => {
    expect(readRate([], NOW).overall).toBeNull();
  });
});

describe("verifiedShare", () => {
  it("counts mail from senders that passed DKIM or DMARC", () => {
    const share = verifiedShare([
      sender("a@x.com", [msg(), msg(), msg()], {
        authVerdicts: { spf: "pass", dkim: "pass", dmarc: "pass" },
      }),
      sender("b@y.com", [msg()]),
    ]);
    expect(share).toBe(0.75);
  });
});

describe("topCompanies", () => {
  it("takes the biggest companies first", () => {
    const groups = [
      { key: "a", senders: [], total: 3, unread: 0, openRate: null },
      { key: "b", senders: [], total: 9, unread: 0, openRate: null },
    ];
    expect(topCompanies(groups, (g) => g.key.toUpperCase(), 1)).toEqual([{ name: "B", total: 9 }]);
  });
});

const facts: DashboardFacts = {
  score: 62,
  scoreDelta: 4,
  tabs: { primary: 10, promotions: 30, social: 5, updates: 8, forums: 0 },
  companies: [
    { name: "LinkedIn", total: 40 },
    { name: "Amazon", total: 12 },
  ],
  companyCount: 2,
  read: readRate([], NOW),
  clear: { expired: 4, spam: 2, neverRead: 6 },
  suspicious: 0,
  waiting: 0,
  verified: 0.8,
  holdingOn: true,
};

describe("renderHomeDashboard", () => {
  it("shows one number, one chart and one action on each of six tiles", () => {
    const grid = renderHomeDashboard(facts, vi.fn());
    const tiles = Array.from(grid.querySelectorAll<HTMLElement>(".home-tile"));
    expect(tiles.map((t) => t.dataset.tile)).toEqual([
      "health",
      "clear",
      "safety",
      "tabs",
      "companies",
      "read",
    ]);
    for (const t of tiles) {
      expect(t.querySelectorAll(".home-tile-value")).toHaveLength(1);
      expect(t.querySelectorAll(".home-tile-chart")).toHaveLength(1);
      expect(t.querySelectorAll("button")).toHaveLength(1);
    }
    expect(grid.querySelector('[data-tile="clear"] .home-tile-value')!.textContent).toBe("12 emails");
    expect(grid.querySelector('[data-tile="health"] .home-tile-note')!.textContent).toBe(
      "Up 4 since last week",
    );
  });

  it("sends each action to its screen", () => {
    const go = vi.fn();
    const grid = renderHomeDashboard(facts, go);
    grid.querySelector<HTMLButtonElement>('[data-tile="companies"] button')!.click();
    grid.querySelector<HTMLButtonElement>('[data-tile="read"] button')!.click();
    expect(go).toHaveBeenNthCalledWith(1, "senders");
    expect(go).toHaveBeenNthCalledWith(2, "subscriptions", "senders-worth-decision");
  });

  it("leads Safety with suspicious senders and marks it as danger", () => {
    const grid = renderHomeDashboard({ ...facts, suspicious: 2, waiting: 5 }, vi.fn());
    const safety = grid.querySelector<HTMLElement>('[data-tile="safety"]')!;
    expect(safety.classList.contains("danger")).toBe(true);
    expect(safety.querySelector(".home-tile-value")!.textContent).toBe("2 suspicious senders");
  });

  it("offers scam holding when it is off and nothing is wrong", () => {
    const grid = renderHomeDashboard({ ...facts, holdingOn: false }, vi.fn());
    expect(grid.querySelector('[data-tile="safety"] button')!.textContent).toBe("Turn on scam holding");
  });

  it("leaves out the tab tile without Gmail tabs", () => {
    const grid = renderHomeDashboard({ ...facts, tabs: null }, vi.fn());
    expect(grid.querySelector('[data-tile="tabs"]')).toBeNull();
  });

  it("uses no dashes in its text", () => {
    const grid = renderHomeDashboard({ ...facts, scoreDelta: -3 }, vi.fn());
    expect(grid.textContent).not.toMatch(/[–—]/);
  });
});
