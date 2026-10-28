// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageRecord, SenderSummary } from "../lib/senderModel";
import { detailSenders, initDetailsPanel, weekOf, type DetailsActions } from "./detailsPanel";

const NOW = new Date(2026, 9, 27, 12).getTime(); // Tue 27 Oct, noon local
const DAY = 24 * 60 * 60 * 1000;

let n = 0;
function msg(overrides: Partial<MessageRecord> = {}): MessageRecord {
  n += 1;
  return {
    id: `m${n}`,
    subject: `Subject ${n}`,
    receivedAt: NOW - DAY,
    kind: "other",
    isProtected: false,
    unread: true,
    sizeBytes: 0,
    providerMarkedPersonal: false,
    looksAutomated: false,
    ...overrides,
  };
}

function sender(address: string, messages: MessageRecord[], displayName = address): SenderSummary {
  return {
    key: `gmail:${address}`,
    provider: "gmail",
    address,
    displayName,
    count: messages.length,
    messageIds: messages.map((m) => m.id),
    protectedMessageIds: [],
    unsubscribe: {},
    messages,
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
  };
}

const mailbox = () => [
  sender("deals@shop.example", [
    msg({ tab: "promotions", subject: "Sale today", receivedAt: NOW - 2 * DAY }),
    msg({ tab: "promotions", subject: "Old sale", receivedAt: NOW - 20 * DAY }),
  ], "Shop"),
  sender("mom@family.example", [msg({ subject: "Dinner?", unread: false, isProtected: true })], "Mom"),
];

/** "Sender Subject" per email row (the logo's monogram left out). */
const rows = (root: HTMLElement) =>
  Array.from(root.querySelectorAll("tbody tr:not(.group)"))
    .filter((tr) => tr.querySelector(".subj"))
    .map((tr) => `${tr.querySelector(".who")!.textContent} ${tr.querySelector(".subj")!.textContent}`);
const click = (root: HTMLElement, selector: string, text: string) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>(selector)).find((b) => b.textContent!.includes(text))!.click();

let root: HTMLElement;
let trash: ReturnType<typeof vi.fn<DetailsActions["trash"]>>;

function boot() {
  const panel = initDetailsPanel(root, { trash }, () => NOW);
  panel.update(mailbox());
  return panel;
}

beforeEach(() => {
  document.body.innerHTML = '<aside id="details" hidden></aside>';
  root = document.getElementById("details")!;
  trash = vi.fn<DetailsActions["trash"]>();
});

describe("weekOf", () => {
  it("counts eight weeks back with the last seven days as week 7", () => {
    expect(weekOf(NOW, NOW)).toEqual({ week: 7, day: 6 });
    expect(weekOf(NOW - 6 * DAY, NOW)).toEqual({ week: 7, day: 0 });
    expect(weekOf(NOW - 7 * DAY, NOW)).toEqual({ week: 6, day: 6 });
  });
});

describe("detailSenders", () => {
  it("gives each sender its volume, opens and main kind, most mail first", () => {
    const got = detailSenders(mailbox()).map((s) => [s.name, s.emails, s.opened, s.kind]);
    expect(got).toEqual([["Shop", 2, 0, "promo"], ["Mom", 1, 1, "primary"]]);
  });
});

describe("Details panel", () => {
  it("opens filtered by kind, with the filter as a removable chip", () => {
    const panel = boot();
    panel.open({ kind: "promo" });
    expect(root.hidden).toBe(false);
    expect(rows(root)).toEqual(["Shop Sale today", "Shop Old sale"]);
    click(root, ".chip.on", "Promotions");
    expect(rows(root)).toHaveLength(3);
  });

  it("narrows by week, then by day, from the chart", () => {
    const panel = boot();
    panel.open({ kind: "promo" });
    const weeks = root.querySelectorAll<HTMLButtonElement>(".col");
    expect(weeks).toHaveLength(8);
    weeks[7].click();
    expect(rows(root)).toEqual(["Shop Sale today"]);
    const days = root.querySelectorAll<HTMLButtonElement>(".col");
    expect(days).toHaveLength(7);
    expect(days[4].getAttribute("aria-label")).toMatch(/1 email$/);
    days[3].click();
    expect(rows(root)).toEqual([]);
    expect(root.querySelector(".empty")?.textContent).toBe("Nothing here.");
  });

  it("protected mail can't be ticked, and Trash gets only what was ticked", () => {
    const panel = boot();
    panel.open();
    const ticks = Array.from(root.querySelectorAll<HTMLInputElement>("tbody .tick"));
    expect(ticks.filter((t) => t.disabled)).toHaveLength(1);
    ticks.find((t) => !t.disabled)!.click();
    expect(root.querySelector(".selbar")!.textContent).toContain("1 selected");
    click(root, ".selbar button", "Move to Trash");
    expect(trash).toHaveBeenCalledTimes(1);
    expect(trash.mock.calls[0][0].map((m) => m.subject)).toEqual(["Sale today"]);
  });

  it("hides what an action moved at once, and brings it back on Undo", () => {
    const panel = boot();
    panel.open();
    root.querySelector<HTMLInputElement>("tbody .tick:not(:disabled)")!.click();
    click(root, ".selbar button", "Move to Trash");
    const [picked, , , settle] = trash.mock.calls[0];
    settle.gone(picked.map((m) => m.id));
    expect(rows(root)).not.toContain("Shop Sale today");
    settle.back(picked.map((m) => m.id));
    expect(rows(root)).toContain("Shop Sale today");
  });

  it("a sender row opens to its latest subjects and links to all its mail", () => {
    const panel = boot();
    panel.open({ view: "senders" });
    root.querySelector<HTMLTableRowElement>("tr.expandable")!.click();
    expect(Array.from(root.querySelectorAll("tr.sub")).map((tr) => tr.textContent)).toEqual([
      expect.stringContaining("Sale today"),
      expect.stringContaining("Old sale"),
      "All 2 from Shop",
    ]);
    click(root, "tr.sub button", "All 2 from Shop");
    expect(root.querySelector(".seg [aria-pressed='true']")!.textContent).toBe("Emails");
    expect(rows(root)).toEqual(["Shop Sale today", "Shop Old sale"]);
  });

  it("Escape minimizes it to a strip that opens it again", () => {
    const panel = boot();
    panel.open();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(panel.isOpen()).toBe(false);
    const root = document.getElementById("details")!;
    expect(root.hidden).toBe(false);
    root.querySelector<HTMLButtonElement>(".details-tab")!.click();
    expect(panel.isOpen()).toBe(true);
  });
});
