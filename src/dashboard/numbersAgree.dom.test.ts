// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Plan step 1.6 (Rule 2): one set of numbers. Overview's tiles, its category
// legend and top senders, Details opened from them, and the downloaded report
// must say the same thing for the same range.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootDashboard, type BootedDashboard } from "./testHarness";

const printed: string[] = [];
vi.doMock("./reportDownload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./reportDownload")>()),
  printReport: (html: string) => void printed.push(html),
}));

let dash: BootedDashboard;
let report: Document;
const num = (t: string | null | undefined) => Number((t ?? "").replace(/[^\d]/g, ""));
const overview = () => document.querySelector('section.screen[data-screen="overview"]')!;

beforeAll(async () => {
  dash = await bootDashboard();
  dash.showScreen("overview");
  (document.querySelector('#overview-dl-menu [data-dl="pdf"]') as HTMLButtonElement).click();
  report = new DOMParser().parseFromString(printed.at(-1)!, "text/html");
});

function reportTable(title: string): string[][] {
  const block = Array.from(report.querySelectorAll("section.block")).find((b) => b.textContent!.includes(title))!;
  return Array.from(block.querySelectorAll("tbody tr")).map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent!));
}

describe("every screen and the report agree (plan step 1.6)", () => {
  it("Received on Overview is the report's Emails received", () => {
    const tile = Array.from(overview().querySelectorAll(".mt-title")).find((t) => t.textContent === "Received")!;
    const kpi = Array.from(report.querySelectorAll(".kpi")).find((k) => k.querySelector(".kpi-label")!.textContent === "Emails received")!;
    expect(num(tile.parentElement!.querySelector(".mt-num")!.textContent)).toBeGreaterThan(0);
    expect(num(kpi.querySelector("b")!.textContent)).toBe(num(tile.parentElement!.querySelector(".mt-num")!.textContent));
  });

  it("each category matches the report and the Details it opens", () => {
    const legend = Array.from(overview().querySelectorAll<HTMLButtonElement>(".ov-legend button"));
    const byCategory = new Map(reportTable("By category").map(([label, emails]) => [label, num(emails)]));
    expect(legend.length).toBe(4);
    for (const item of legend) {
      const label = item.textContent!.replace(/[\d,]+$/, "");
      const count = num(item.querySelector("b")!.textContent);
      expect(byCategory.get(label), label).toBe(count);
      item.click();
      expect(num(document.querySelector("#details .details-title")!.textContent!.replace(label, "")), `Details for ${label}`).toBe(count);
    }
  });

  it("top senders match the report's, company by company, and the Details each opens", () => {
    const rows = Array.from(overview().querySelectorAll<HTMLElement>(".t10-row"));
    const reported = reportTable("Top senders");
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row, i) => {
      const count = num(row.querySelector(".t10-n")!.textContent);
      expect([reported[i][1], num(reported[i][3])]).toEqual([row.querySelector(".t10-name")!.textContent, count]);
      row.click();
      expect(num(document.querySelector("#details .details-title")!.textContent!.match(/[\d,]+ emails?$/)![0])).toBe(count);
    });
  });

  it("the inbox tiles are the report's Inbox today", () => {
    const tile = (title: string) =>
      num(Array.from(overview().querySelectorAll(".mt-title")).find((t) => t.textContent === title)!.parentElement!.querySelector(".mt-num")!.textContent);
    const today = new Map(reportTable("Inbox today").map(([label, emails]) => [label, num(emails)]));
    expect(today.get("Waiting in the Screener")).toBe(tile("In the Screener"));
    expect(today.get("Ready to clean up")).toBe(tile("Ready to clean up"));
  });
});
