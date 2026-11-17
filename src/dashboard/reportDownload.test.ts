// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { MessageRecord, SenderSummary } from "../lib/senderModel";
import { csvField, emailsCsv } from "./reportDownload";
import { createRangePicker, monthCells, orderRange, presetRanges } from "./rangePicker";

const msg = (id: string, receivedAt: number, subject: string): MessageRecord =>
  ({ id, receivedAt, subject, kind: "other", isProtected: false, unread: true, sizeBytes: 0, providerMarkedPersonal: false, looksAutomated: false }) as MessageRecord;
const sender = (address: string, messages: MessageRecord[]): SenderSummary => ({ key: `gmail:${address}`, provider: "gmail", address, displayName: "Shop", messages }) as unknown as SenderSummary;

describe("emailsCsv", () => {
  it("quotes fields and makes formula-looking subjects inert", () => {
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvField("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvField("-5")).toBe(`"'-5"`);
  });

  it("lists only the range's (and picked ids') emails, newest first, with a reason column when given", () => {
    const d = (day: number) => new Date(2026, 10, day, 9, 5).getTime();
    const s = sender("shop@example.com", [msg("a", d(3), "Old"), msg("b", d(10), "Sale"), msg("c", d(12), "=1+1")]);
    const csv = emailsCsv([{ sender: s, ids: new Set(["b", "c"]), reason: "Unopened" }], d(1), d(20));
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe('"Date","Sender","Address","Subject","Category","Unread","Reason"');
    expect(lines.slice(1)).toEqual([
      `"2026-11-12 09:05","Shop","shop@example.com","'=1+1","People","Yes","Unopened"`,
      `"2026-11-10 09:05","Shop","shop@example.com","Sale","People","Yes","Unopened"`,
    ]);
    expect(emailsCsv([{ sender: s }], d(9), d(11)).trim().split("\r\n")).toHaveLength(2);
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
