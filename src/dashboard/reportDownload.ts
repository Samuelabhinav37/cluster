// Downloads: a CSV of the emails behind a page, and a printable report (Save as PDF).
// Everything comes from what Cluster already read; nothing new is fetched or sent.
import type { SenderSummary } from "../lib/senderModel";
import { senderName } from "../lib/senderListView";
import { HOME_KINDS, kindOf } from "./homeDashboard";

export interface CsvEmail {
  sender: SenderSummary;
  /** Only these messages; all of the sender's when unset. */
  ids?: ReadonlySet<string>;
  /** An extra column, e.g. why Cleanup lists it. */
  reason?: string;
}

const KIND_NAME = new Map(HOME_KINDS.map((k) => [k.key, k.label]));

/** One field: quoted, and a leading = + - @ made inert, since subjects come from
 * strangers and a spreadsheet would otherwise run them as formulas. */
export function csvField(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Emails received from `start` (inclusive) to `end` (exclusive), newest first. */
export function emailsCsv(items: readonly CsvEmail[], start: number, end: number): string {
  const withReason = items.some((it) => it.reason);
  const head = ["Date", "Sender", "Address", "Subject", "Category", "Unread", ...(withReason ? ["Reason"] : [])];
  const rows: Array<[number, string[]]> = [];
  for (const { sender, ids, reason } of items) {
    for (const m of sender.messages) {
      if (ids && !ids.has(m.id)) continue;
      if (m.receivedAt < start || m.receivedAt >= end) continue;
      const d = new Date(m.receivedAt);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      rows.push([
        m.receivedAt,
        [date, senderName(sender), sender.address, m.subject ?? "", KIND_NAME.get(kindOf(m)) ?? "", m.unread ? "Yes" : "No", ...(withReason ? [reason ?? ""] : [])],
      ]);
    }
  }
  rows.sort((a, b) => b[0] - a[0]);
  // BOM so Excel reads names and subjects as UTF-8.
  return "﻿" + [head, ...rows.map((r) => r[1])].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

export function downloadText(name: string, text: string, type: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

/** Opens Chrome's print dialog on the open page laid out as a report (print CSS in
 * dashboard.css); "Save as PDF" there gives the file. */
export function printReport(title: string, subtitle: string): void {
  const head = document.getElementById("print-head");
  if (head) {
    head.querySelector("h1")!.textContent = title;
    head.querySelector("p")!.textContent = `${subtitle} · Made ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  // Paper is light whatever the app's theme; print() returns once the dialog closes.
  const root = document.documentElement;
  const theme = root.getAttribute("data-theme");
  root.setAttribute("data-theme", "light");
  try {
    window.print();
  } finally {
    if (theme === null) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }
}

/** A Download button with its two choices. */
export function wireDownloadMenu(btn: HTMLButtonElement, menu: HTMLElement, actions: { pdf: () => void; csv: () => void }): void {
  const close = () => {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  };
  btn.onclick = () => {
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
    if (!menu.hidden) menu.querySelector<HTMLButtonElement>("button")?.focus();
  };
  menu.querySelector<HTMLButtonElement>("[data-dl=pdf]")!.onclick = () => {
    close();
    actions.pdf();
  };
  menu.querySelector<HTMLButtonElement>("[data-dl=csv]")!.onclick = () => {
    close();
    actions.csv();
  };
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
