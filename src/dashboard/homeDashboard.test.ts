// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { MessageRecord, SenderSummary } from "../lib/senderModel";
import { inboxTabOf } from "../lib/senderModel";
import { kindOf, mailByKind, renderHomeDashboard, type HomeFacts } from "./homeDashboard";

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
        sender("shop@example.com", [
          msg({ tab: "promotions" }),
          msg({ tab: "promotions", receivedAt: NOW - 9 * DAY }),
        ]),
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
  clearable: 0,
  limitsOn: 0,
};
const tiles = (el: HTMLElement) => Array.from(el.querySelectorAll(".tile-name")).map((t) => t.textContent);
const tileOf = (el: HTMLElement, name: string) =>
  Array.from(el.querySelectorAll<HTMLElement>(".tile")).find(
    (t) => t.querySelector(".tile-name")!.textContent === name,
  )!;

describe("renderHomeDashboard", () => {
  it("lays out four tiles: Inbox and Protect, then Clean up and Organize", () => {
    expect(tiles(renderHomeDashboard(calm, vi.fn()))).toEqual(["All mail", "Protect", "Clean up", "Organize"]);
  });

  it("Inbox shows the total, one bar segment per kind with mail, and a labelled legend", () => {
    const el = renderHomeDashboard({ ...calm, kinds: { ...calm.kinds, trans: 0 } }, vi.fn());
    expect(el.querySelector(".home-big")!.textContent).toBe("65 emails");
    expect(el.querySelector(".tile-sub")).toBeNull();
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

  it("says each number once, has no buttons in tiles, and opens the place from anywhere on the tile", () => {
    const go = vi.fn();
    const el = renderHomeDashboard(
      {
        ...calm,
        suspicious: 2,
        waiting: 4,
        neverOpened: { senders: 1, emails: 3 },
        pastDate: 2,
        // One email is both never opened and past its date.
        clearable: 4,
        fakedBrands: ["paypal", "netflix"],
      },
      go,
    );
    expect(tileOf(el, "Protect").querySelector(".tile-stat")!.textContent).toBe("2to review");
    expect(tileOf(el, "Protect").querySelectorAll(".tile-faces .logo-tile")).toHaveLength(2);
    expect(tileOf(el, "Protect").querySelector(".tile-note")!.textContent).toBe(
      "Pretending to be PayPal, Netflix",
    );
    expect(tileOf(el, "Clean up").querySelector(".tile-stat")!.textContent).toBe("4of 65 ready to go");
    expect(tileOf(el, "Clean up").textContent).not.toMatch(/\b3\b/);
    expect(el.querySelectorAll(".tile-body button")).toHaveLength(0);
    for (const name of ["Protect", "Clean up", "Organize"])
      tileOf(el, name).querySelector<HTMLElement>(".tile-body")!.click();
    expect(go.mock.calls).toEqual([["impersonation"], ["delete"], ["organize"]]);
  });

  it("shows calm tiles with no buttons when nothing needs you", () => {
    const el = renderHomeDashboard({ ...calm, limitsOn: 3 }, vi.fn());
    expect(Array.from(el.querySelectorAll(".tile-empty")).map((e) => e.textContent)).toEqual([
      "Nothing looks off",
      "Nothing to clear",
    ]);
    expect(tileOf(el, "Organize").querySelector(".tile-stat")!.textContent).toBe("3kinds tidy themselves");
    expect(el.querySelectorAll(".tile-body button")).toHaveLength(0);
  });

  it("keeps Home under its word budget with every tile busy", () => {
    const el = renderHomeDashboard(
      { ...calm, suspicious: 1, neverOpened: { senders: 12, emails: 150 }, pastDate: 29, clearable: 179 },
      vi.fn(),
    );
    const words = (el.textContent ?? "")
      .replace(/(\d)([A-Z])/g, "$1 $2")
      .split(/\s+/)
      .filter(Boolean);
    expect(words.length).toBeLessThanOrEqual(45);
    expect(el.textContent).not.toMatch(/[–—]/);
  });
});
