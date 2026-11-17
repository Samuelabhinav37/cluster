// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { MessageRecord, SenderSummary } from "../lib/senderModel";
import { csvField, emailRows, emailsCsv, emailsXlsx, periodFacts, reportHtml } from "./reportDownload";
import { crc32 } from "./xlsx";
import { createRangePicker, monthCells, orderRange, presetRanges } from "./rangePicker";

const msg = (id: string, receivedAt: number, subject: string): MessageRecord =>
  ({ id, receivedAt, subject, kind: "other", isProtected: false, unread: true, sizeBytes: 0, providerMarkedPersonal: false, looksAutomated: false }) as MessageRecord;
const sender = (address: string, messages: MessageRecord[]): SenderSummary => ({ key: `gmail:${address}`, provider: "gmail", address, displayName: "Shop", messages }) as unknown as SenderSummary;

describe("emailsCsv", () => {
  it("quotes only when needed and makes formula-looking subjects inert", () => {
    expect(csvField("Sale")).toBe("Sale");
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("-5, off")).toBe(`"'-5, off"`);
  });

  it("lists only the range's (and picked ids') emails, newest first, one line each, with a reason column when given", () => {
    const d = (day: number) => new Date(2026, 10, day, 9, 5).getTime();
    const s = sender("shop@example.com", [msg("a", d(3), "Old"), msg("b", d(10), "Big\r\nsale"), msg("c", d(12), "=1+1")]);
    const rows = emailRows([{ sender: s, ids: new Set(["b", "c"]), reason: "Unopened" }], d(1), d(20));
    const lines = emailsCsv(rows).replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("Date,Time,Sender,Address,Subject,Category,Status,Reason");
    expect(lines.slice(1)).toEqual(["2026-11-12,09:05,Shop,shop@example.com,'=1+1,People,Unread,Unopened", "2026-11-10,09:05,Shop,shop@example.com,Big sale,People,Unread,Unopened"]);
    expect(emailRows([{ sender: s }], d(9), d(11))).toHaveLength(1);
  });
});

describe("emailsXlsx", () => {
  it("is a zip of the workbook parts with a frozen, filtered header and real dates", () => {
    const bytes = emailsXlsx(emailRows([{ sender: sender("a@b.co", [msg("x", new Date(2026, 0, 2, 12).getTime(), "Hi <there> & you")]) }], 0, Infinity), "Emails");
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    const text = new TextDecoder().decode(bytes);
    for (const part of ["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]) expect(text).toContain(part);
    expect(text).toContain('state="frozen"');
    expect(text).toContain('<autoFilter ref="A1:F2"/>');
    expect(text).toContain("Hi &lt;there&gt; &amp; you");
    expect(text).toContain("<v>46024.5</v>");
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("report", () => {
  it("is its own document: logo, title, period, numbers, escaped tables, page numbers", () => {
    const html = reportHtml(
      {
        title: "Mail report",
        period: "Oct 18 to Nov 16",
        account: "sam@gmail.com",
        sections: [
          { kind: "kpis", items: [{ label: "Emails received", value: "1,260" }] },
          { kind: "table", title: "Top senders", columns: [{ label: "Sender" }, { label: "Emails", num: true }], rows: [["<b>Shop</b>", "40"]] },
        ],
        source: "From mail on this computer.",
      },
      '<svg class="brand-mark"></svg>',
    );
    expect(html).toContain("<title>Cluster Mail report Oct 18 to Nov 16</title>");
    expect(html).toContain('<div class="brand"><svg class="brand-mark"></svg>Cluster</div>');
    expect(html).toContain("&lt;b&gt;Shop&lt;/b&gt;");
    expect(html).toContain('counter(page) " of " counter(pages)');
    expect(html).not.toContain("<b>Shop</b>");
  });

  it("counts a period by day, category and sender", () => {
    const start = new Date(2026, 10, 1).getTime();
    const end = new Date(2026, 10, 4).getTime();
    const f = periodFacts([sender("a@b.co", [msg("1", new Date(2026, 10, 1, 8).getTime(), "x"), msg("2", new Date(2026, 10, 3, 23).getTime(), "y"), msg("3", end, "z")])], start, end);
    expect(f.daily).toEqual([1, 0, 1]);
    expect(f.total).toBe(2);
    expect(f.senders).toEqual([{ name: "Shop", address: "a@b.co", count: 2, unread: 2 }]);
  });
});

describe("range picker", () => {
  it("orders ends, pads months Sunday-first, and builds presets from today", () => {
    expect(orderRange(5, 2)).toEqual({ start: 2, end: 5 });
    const nov = monthCells(2026, 10); // Nov 1 2026 is a Sunday
    expect(nov[0]).toBe(new Date(2026, 10, 1).getTime());
    expect(monthCells(2026, 9).slice(0, 5)).toEqual([null, null, null, null, new Date(2026, 9, 1).getTime()]);
    const today = new Date(2026, 10, 16).getTime();
    const p = Object.fromEntries(presetRanges(today).map((x) => [x.label, x.range]));
    expect(p["Last 7 days"]).toEqual({ start: new Date(2026, 10, 10).getTime(), end: today });
    expect(p["Last month"]).toEqual({ start: new Date(2026, 9, 1).getTime(), end: new Date(2026, 9, 31).getTime() });
  });

  it("two clicks pick a range (either order), Apply hands it over; future days can't be picked", () => {
    const button = document.createElement("button");
    const pop = document.createElement("div");
    pop.hidden = true;
    document.body.append(button, pop);
    const picks: Array<{ start: number; end: number }> = [];
    const today = new Date().setHours(0, 0, 0, 0);
    const back = (n: number) => new Date(today).setDate(new Date(today).getDate() - n);
    createRangePicker({ button, pop, current: () => ({ start: back(6), end: today }), oldest: () => back(400), onPick: (r) => picks.push(r) });
    button.click();
    expect(pop.hidden).toBe(false);
    const day = (ms: number) => pop.querySelector<HTMLButtonElement>(`.rp-day[data-day="${ms}"]`)!;
    expect(pop.querySelector('.rp-preset[aria-selected="true"]')?.textContent).toBe("Last 7 days");
    day(back(2)).click();
    expect(pop.querySelector(".rp-summary")!.textContent).toBe("Pick the last day");
    day(back(9)).click();
    pop.querySelector<HTMLButtonElement>(".rp-apply")!.click();
    expect(picks).toEqual([{ start: back(9), end: back(2) }]);
    expect(pop.hidden).toBe(true);
    button.click();
    const tomorrow = pop.querySelector<HTMLButtonElement>(`.rp-day[data-day="${new Date(today).setDate(new Date(today).getDate() + 1)}"]`);
    expect(tomorrow === null || tomorrow.disabled).toBe(true);
  });
});
