// Downloads: the emails behind a page as Excel or CSV, and a report document to save
// as PDF. Everything comes from what Cluster already read; nothing is fetched or sent.
import type { SenderSummary } from "../lib/senderModel";
import { senderName } from "../lib/senderListView";
import { HOME_KINDS, kindOf, type HomeKind } from "./homeDashboard";
import { xlsxBytes, type XlsxColumn } from "./xlsx";
import interTight from "@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2?url";

// Absolute: the report is a blob: document, which can't resolve a root-relative path.
const fontUrl = () => new URL(interTight, location.href).href;

export interface CsvEmail {
  sender: SenderSummary;
  /** Only these messages; all of the sender's when unset. */
  ids?: ReadonlySet<string>;
  /** An extra column, e.g. why Cleanup lists it. */
  reason?: string;
}

const KIND_NAME = new Map(HOME_KINDS.map((k) => [k.key, k.label]));

export interface EmailRow {
  at: number;
  sender: string;
  address: string;
  subject: string;
  category: string;
  unread: boolean;
  reason?: string;
}

/** One line of text: control characters and runs of spaces become one space. */
const oneLine = (v: string) => v.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").replace(/\s{2,}/g, " ").trim();

/** Emails received from `start` (inclusive) to `end` (exclusive), newest first. */
export function emailRows(items: readonly CsvEmail[], start: number, end: number): EmailRow[] {
  const rows: EmailRow[] = [];
  for (const { sender, ids, reason } of items) {
    for (const m of sender.messages) {
      if (ids && !ids.has(m.id)) continue;
      if (m.receivedAt < start || m.receivedAt >= end) continue;
      rows.push({
        at: m.receivedAt,
        sender: oneLine(senderName(sender)),
        address: sender.address,
        subject: oneLine(m.subject ?? ""),
        category: KIND_NAME.get(kindOf(m)) ?? "",
        unread: m.unread,
        reason,
      });
    }
  }
  return rows.sort((a, b) => b.at - a.at);
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const isoTime = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** RFC 4180: quoted only when it holds a comma, quote or line break. A leading
 * = + - @ gets a ' so a spreadsheet shows a stranger's subject instead of running it. */
export function csvField(v: string): string {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const withReason = (rows: readonly EmailRow[]) => rows.some((r) => r.reason);

export function emailsCsv(rows: readonly EmailRow[]): string {
  const reason = withReason(rows);
  const head = ["Date", "Time", "Sender", "Address", "Subject", "Category", "Status", ...(reason ? ["Reason"] : [])];
  const body = rows.map((r) => [isoDate(r.at), isoTime(r.at), r.sender, r.address, r.subject, r.category, r.unread ? "Unread" : "Read", ...(reason ? [r.reason ?? ""] : [])]);
  // The BOM tells Excel the file is UTF-8; without it names and subjects come out garbled.
  return "﻿" + [head, ...body].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

export function emailsXlsx(rows: readonly EmailRow[], sheet: string): Uint8Array<ArrayBuffer> {
  const reason = withReason(rows);
  const cols: XlsxColumn[] = [
    { header: "Received", width: 18, type: "date" },
    { header: "Sender", width: 28 },
    { header: "Address", width: 34 },
    { header: "Subject", width: 70 },
    { header: "Category", width: 14 },
    { header: "Status", width: 10 },
    ...(reason ? [{ header: "Reason", width: 22 }] : []),
  ];
  return xlsxBytes(
    sheet,
    cols,
    rows.map((r) => [r.at, r.sender, r.address, r.subject, r.category, r.unread ? "Unread" : "Read", ...(reason ? [r.reason ?? ""] : [])]),
  );
}

export function downloadBytes(name: string, data: BlobPart, type: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

// ── The report document ─────────────────────────────────────────────────

export type ReportSection =
  | { kind: "kpis"; items: Array<{ label: string; value: string; note?: string }> }
  | { kind: "chart"; title: string; note?: string; svg: string; legend?: Array<{ label: string; color: string }> }
  | { kind: "table"; title: string; note?: string; columns: Array<{ label: string; num?: boolean }>; rows: string[][]; empty?: string };

export interface ReportSpec {
  /** "Mail report"; also the PDF's suggested file name with the period. */
  title: string;
  period: string;
  account?: string;
  sections: ReportSection[];
  /** One plain line at the end on where the numbers come from. */
  source: string;
}

export const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A whole HTML document for the report: header with the logo, details, sections,
 * and a running footer with page numbers (CSS page margin boxes). */
export function reportHtml(spec: ReportSpec, logoSvg: string, made = new Date()): string {
  const when = made.toLocaleString(undefined, { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  const section = (s: ReportSection) => {
    if (s.kind === "kpis")
      return `<section class="kpis">${s.items
        .map((k) => `<div class="kpi"><span class="kpi-label">${esc(k.label)}</span><b>${esc(k.value)}</b>${k.note ? `<span class="kpi-note">${esc(k.note)}</span>` : ""}</div>`)
        .join("")}</section>`;
    const head = `<h2>${esc(s.title)}</h2>${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}`;
    if (s.kind === "chart") {
      const legend = s.legend ? `<p class="legend">${s.legend.map((l) => `<span><i style="background:${esc(l.color)}"></i>${esc(l.label)}</span>`).join("")}</p>` : "";
      return `<section class="block">${head}${legend}<div class="chart">${s.svg}</div></section>`;
    }
    const body = s.rows.length
      ? s.rows.map((r) => `<tr>${r.map((v, i) => `<td${s.columns[i]?.num ? ' class="num"' : ""}>${esc(v)}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${s.columns.length}" class="empty">${esc(s.empty ?? "Nothing in this period.")}</td></tr>`;
    return `<section class="block">${head}<table><thead><tr>${s.columns.map((c) => `<th${c.num ? ' class="num"' : ""}>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></section>`;
  };
  const footer = esc(`Cluster · ${spec.title} · ${spec.period}`).replace(/"/g, "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(`Cluster ${spec.title} ${spec.period}`)}</title><style>
@font-face { font-family: "Inter Tight"; font-weight: 100 900; src: url("${fontUrl()}") format("woff2"); }
@page { size: A4; margin: 16mm 16mm 18mm;
  @bottom-left { content: "${footer}"; font: 8pt "Inter Tight", system-ui, sans-serif; color: #86868b; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt "Inter Tight", system-ui, sans-serif; color: #86868b; } }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html { color-scheme: light; }
body { margin: 0; font: 10pt/1.45 "Inter Tight", system-ui, "Segoe UI", sans-serif; color: #1d1d1f; background: #fff; }
.top { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12pt; border-bottom: 2pt solid #1f5fd6; }
.brand { display: flex; align-items: center; gap: 8pt; font-size: 15pt; font-weight: 700; letter-spacing: -.01em; }
.brand svg { width: 26pt; height: 26pt; }
.doc { text-align: right; color: #6e6e73; font-size: 9pt; }
h1 { margin: 18pt 0 4pt; font-size: 22pt; font-weight: 650; letter-spacing: -.02em; }
.meta { display: grid; grid-template-columns: repeat(3, auto); justify-content: start; gap: 2pt 28pt; margin: 0 0 18pt; color: #6e6e73; font-size: 9pt; }
.meta b { display: block; color: #1d1d1f; font-weight: 600; font-size: 10pt; }
h2 { margin: 0 0 2pt; font-size: 12.5pt; font-weight: 650; }
.note { margin: 0 0 8pt; color: #6e6e73; font-size: 9pt; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt; margin: 0 0 18pt; break-inside: avoid; }
.kpi { padding: 10pt 12pt; border: .75pt solid #e5e5ea; border-radius: 6pt; background: #f9f9fb; }
.kpi-label { display: block; color: #6e6e73; font-size: 8.5pt; }
.kpi b { display: block; margin: 2pt 0 1pt; font-size: 18pt; font-weight: 650; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
.kpi-note { color: #6e6e73; font-size: 8.5pt; }
.block { margin: 0 0 18pt; }
.chart { break-inside: avoid; } .chart svg { display: block; width: 100%; height: auto; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
thead { display: table-header-group; }
th { padding: 5pt 6pt; border-bottom: 1pt solid #1d1d1f; text-align: left; font-weight: 600; }
td { padding: 4.5pt 6pt; border-bottom: .5pt solid #e5e5ea; vertical-align: top; }
tr { break-inside: avoid; }
tbody tr:nth-child(even) td { background: #f9f9fb; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.empty { color: #6e6e73; text-align: center; }
.legend { display: flex; gap: 14pt; margin: 0 0 6pt; font-size: 9pt; color: #3a3a3c; }
.legend span { display: inline-flex; align-items: center; gap: 5pt; }
.legend i { width: 7pt; height: 7pt; border-radius: 50%; }
.source { margin-top: 20pt; padding-top: 8pt; border-top: .75pt solid #e5e5ea; color: #86868b; font-size: 8pt; }
</style></head><body>
<header class="top"><div class="brand">${logoSvg}Cluster</div><div class="doc">${esc(spec.title)}<br>${esc(spec.period)}</div></header>
<h1>${esc(spec.title)}</h1>
<div class="meta">${spec.account ? `<span>Account<b>${esc(spec.account)}</b></span>` : ""}<span>Period<b>${esc(spec.period)}</b></span><span>Made<b>${esc(when)}</b></span></div>
${spec.sections.map(section).join("\n")}
<p class="source">${esc(spec.source)}</p>
</body></html>`;
}

/** Opens the report in its own tab and asks Chrome to print it there, so "Save as PDF"
 * saves the report document, never the dashboard. A hidden frame proved unreliable
 * (Chrome can print the page behind it). The tab stays open to save again later. */
export function printReport(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const win = window.open(url, "_blank");
  if (!win) return;
  win.addEventListener("load", () => {
    // Wait for the bundled font so the PDF isn't set in a fallback face.
    void win.document.fonts.ready.then(() => win.print());
  });
}

/** Daily bars for the report: one per day, the scale on the left, a few dates under. */
export function barsSvg(series: ReadonlyArray<{ color: string; counts: readonly number[] }>, firstDay: number): string {
  const days = series[0]?.counts.length ?? 0;
  const totals = Array.from({ length: days }, (_, i) => series.reduce((n, s) => n + s.counts[i], 0));
  const W = 680, H = 190, L = 34, B = 22, T = 6;
  const max = Math.max(1, ...totals);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  // 16 spare units on the right so the last date label isn't cut off.
  const bw = (W - L - 16) / Math.max(1, days);
  const out: string[] = [];
  for (let v = 0; v <= top; v += step) {
    out.push(`<line x1="${L}" x2="${W - 16}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e5ea" stroke-width="0.75"/>`);
    out.push(`<text x="${L - 6}" y="${y(v) + 3}" text-anchor="end" font-size="8" fill="#86868b">${v.toLocaleString()}</text>`);
  }
  for (let i = 0; i < days; i++) {
    let base = 0;
    for (const s of series) {
      const c = s.counts[i];
      if (!c) continue;
      const x = L + i * bw + bw * 0.15;
      out.push(`<rect x="${x.toFixed(2)}" y="${y(base + c).toFixed(2)}" width="${(bw * 0.7).toFixed(2)}" height="${(y(base) - y(base + c)).toFixed(2)}" fill="${s.color}"/>`);
      base += c;
    }
  }
  const every = Math.max(1, Math.round(days / 8));
  for (let i = days - 1; i >= 0; i -= every) {
    const d = new Date(firstDay);
    d.setDate(d.getDate() + i);
    out.push(`<text x="${(L + (i + 0.5) * bw).toFixed(2)}" y="${H - 6}" text-anchor="middle" font-size="8" fill="#86868b">${esc(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</text>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Inter Tight, system-ui, sans-serif">${out.join("")}</svg>`;
}

function niceStep(max: number): number {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  return Math.max(1, ([1, 2, 2.5, 5, 10].find((k) => k * pow >= raw && Number.isInteger(k * pow)) ?? 10) * pow);
}

/** What the mail report counts for a period: totals, categories, busiest weekday, top senders. */
export function periodFacts(senders: readonly SenderSummary[], start: number, end: number) {
  const days = Math.max(1, Math.round((end - start) / 86_400_000));
  const daily = new Array<number>(days).fill(0);
  const kinds: Record<HomeKind, number> = { primary: 0, trans: 0, updates: 0, promo: 0 };
  const bySender: Array<{ name: string; address: string; count: number; unread: number }> = [];
  let total = 0;
  let unread = 0;
  for (const s of senders) {
    let count = 0;
    let un = 0;
    for (const m of s.messages) {
      if (m.receivedAt < start || m.receivedAt >= end) continue;
      const i = Math.floor((new Date(m.receivedAt).setHours(0, 0, 0, 0) - start) / 86_400_000 + 0.5);
      if (i >= 0 && i < days) daily[i] += 1;
      kinds[kindOf(m)] += 1;
      count += 1;
      if (m.unread) un += 1;
    }
    if (count) bySender.push({ name: oneLine(senderName(s)), address: s.address, count, unread: un });
    total += count;
    unread += un;
  }
  const weekday = new Array<number>(7).fill(0);
  const seen = new Array<number>(7).fill(0);
  daily.forEach((c, i) => {
    const wd = new Date(start + i * 86_400_000 + 43_200_000).getDay();
    weekday[wd] += c;
    seen[wd] += 1;
  });
  const avg = weekday.map((v, i) => (seen[i] ? v / seen[i] : 0));
  const busiest = total ? new Date(2024, 0, 7 + avg.indexOf(Math.max(...avg))).toLocaleDateString(undefined, { weekday: "long" }) : "None";
  bySender.sort((a, b) => b.count - a.count);
  return { days, daily, kinds, total, unread, perDay: total / days, busiest, senders: bySender };
}

/** A Download button with its menu; each item runs the action named by its data-dl. */
export function wireDownloadMenu(btn: HTMLButtonElement, menu: HTMLElement, actions: Record<string, () => void>): void {
  const close = () => {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  };
  btn.onclick = () => {
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
    if (!menu.hidden) menu.querySelector<HTMLButtonElement>("button")?.focus();
  };
  for (const item of Array.from(menu.querySelectorAll<HTMLButtonElement>("[data-dl]"))) {
    item.onclick = () => {
      close();
      actions[item.dataset.dl!]?.();
    };
  }
  document.addEventListener("click", (e) => {
    if (!menu.hidden && e.target instanceof Node && !menu.contains(e.target) && !btn.contains(e.target)) close();
  });
  menu.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      close();
      btn.focus();
    }
  });
}
