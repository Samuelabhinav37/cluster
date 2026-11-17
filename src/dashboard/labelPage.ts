// One label's own page (Labels › a row): its name, what belongs in it, a chart of
// its emails each day and a table of who sends them. After iCloud's CloudKit
// telemetry page: a title, a range, the chart, then the rows behind it.
import { CLUSTER_LABEL_COLORS, showLabel } from "../lib/clusterLabels";
import { categoryLabelName } from "../lib/categoryFilters";
import { domainOf } from "../lib/domainGrouping";
import { senderName } from "../lib/senderListView";
import type { SenderSummary } from "../lib/senderModel";
import { effectiveBucket, type SortBucket } from "../lib/sortTaxonomy";
import { chartStats, dayChart, gmailUrl, receivedStats } from "./homeDashboard";
import { senderTile } from "./senderTile";
import { ctx } from "./state";

const DAY = 86_400_000;
const RANGES = [7, 30, 90] as const;

let days: number = 30;
let openSender: (key: string) => void = () => {};

export function wireLabelPage(open: (senderKey: string) => void): void {
  openSender = open;
  // Leaving Labels closes the page, so coming back shows the list.
  document.addEventListener("cluster:screen", () => {
    if (document.getElementById("label-page")?.hidden === false) showLabelPage(null, [], "");
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Each sender's emails in this label, newest first, within `range` days of `now`. */
export function labelMail(senders: readonly SenderSummary[], bucket: SortBucket, now: number, range: number) {
  const out: { sender: SenderSummary; at: number[] }[] = [];
  for (const s of senders) {
    const at = s.messages
      .filter(
        (m) =>
          now - m.receivedAt < range * DAY &&
          effectiveBucket(m.kind, domainOf(s.address), s.address, ctx.settings.sortOverrides, m.promotion ?? m.tab === "promotions") === bucket,
      )
      .map((m) => m.receivedAt);
    if (at.length) out.push({ sender: s, at });
  }
  return out.sort((a, b) => b.at.length - a.at.length);
}

/** Emails per day, oldest first, ending today. */
export function perDay(rows: ReadonlyArray<{ at: readonly number[] }>, now: number, range: number): number[] {
  const today = new Date(now).setHours(0, 0, 0, 0);
  const counts = new Array<number>(range).fill(0);
  for (const r of rows)
    for (const t of r.at) {
      const i = range - 1 - Math.floor((today - new Date(t).setHours(0, 0, 0, 0)) / DAY);
      if (i >= 0 && i < range) counts[i] += 1;
    }
  return counts;
}

const labelSearch = (name: string, extra = "") => gmailUrl(undefined, `search/${encodeURIComponent(`label:"${name.replace(/"/g, "")}"${extra}`)}`);

/** Draws `bucket`'s page into the Labels screen, or closes it (null). */
export function showLabelPage(bucket: SortBucket | null, senders: readonly SenderSummary[], hint: string): void {
  const screen = document.querySelector<HTMLElement>('section.screen[data-screen="organize"]');
  const root = document.getElementById("label-page");
  if (!screen || !root) return;
  screen.classList.toggle("paged", bucket !== null);
  root.hidden = bucket === null;
  if (bucket === null) return root.replaceChildren();
  const now = Date.now();
  const gmailName = categoryLabelName(bucket, ctx.settings.labelChoices);
  const name = showLabel(gmailName);
  const color = CLUSTER_LABEL_COLORS[bucket]?.backgroundColor ?? "var(--accent)";
  const redraw = () => showLabelPage(bucket, senders, hint);

  const back = el("button", "cu-back", "‹ Labels");
  back.type = "button";
  back.onclick = () => showLabelPage(null, senders, hint);
  const head = el("div", "lp-head");
  const titles = el("div", "lp-titles");
  titles.append(el("h2", "lp-title", name), el("p", "lp-lead", `${hint}.`));
  const tools = el("div", "chart-tools");
  const range = el("select", "chart-tool");
  range.setAttribute("aria-label", "Days shown");
  for (const d of RANGES) range.add(new Option(`${d} days`, String(d), false, d === days));
  range.onchange = () => {
    days = Number(range.value);
    redraw();
  };
  const gmail = el("a", "chart-tool", "Open in Gmail");
  gmail.href = labelSearch(gmailName);
  gmail.target = "_blank";
  gmail.rel = "noopener";
  tools.append(range, gmail);
  head.append(titles, tools);

  const rows = labelMail(senders, bucket, now, days);
  const counts = perDay(rows, now, days);
  const stats = receivedStats(counts, now);
  const card = el("section", "ov-card lp-card");
  const body = el("div", "mr-body");
  body.append(
    chartStats([
      ["Total", stats.total.toLocaleString()],
      ["Per week", Math.round(stats.total / (days / 7)).toLocaleString()],
      ...(stats.busiest ? [["Busiest day", stats.busiest] as [string, string]] : []),
    ]),
    dayChart([{ key: bucket, label: name, color, counts }], now, {
      openDay: (start) => {
        const q = ` after:${Math.floor(start / 1000)} before:${Math.floor((start + DAY) / 1000)}`;
        window.open(labelSearch(gmailName, q), "_blank", "noopener");
      },
      openLabel: "Open in Gmail",
    }),
  );
  card.append(body);

  root.replaceChildren(back, head, card, senderTable(rows, stats.total, days));
}

/** Who sends this label's mail: per week, total, a share bar and the percent. */
function senderTable(rows: ReturnType<typeof labelMail>, total: number, range: number): HTMLElement {
  const wrap = el("section", "cu-table lp-table");
  if (rows.length === 0) {
    wrap.append(el("p", "empty-state", `No emails in the last ${range} days.`));
    return wrap;
  }
  const table = el("table", "ct-table");
  const head = table.createTHead().insertRow();
  for (const [text, cls] of [["Sender", ""], ["Per week", "num"], ["Emails", "num"], ["Share", "lp-share-h"]] as const) {
    const th = el("th", cls, text);
    th.scope = "col";
    head.append(th);
  }
  const tbody = table.createTBody();
  const top = rows[0].at.length;
  for (const { sender, at } of rows.slice(0, 50)) {
    const tr = tbody.insertRow();
    const who = el("button", "ct-name");
    who.type = "button";
    who.append(senderTile(sender.address, sender.displayName, "sz-30"), el("span", "", senderName(sender)));
    who.onclick = () => openSender(sender.key);
    tr.insertCell().append(who);
    const perWeek = at.length / (range / 7);
    const c2 = tr.insertCell();
    c2.className = "num ct-dim";
    c2.textContent = perWeek >= 10 ? Math.round(perWeek).toLocaleString() : perWeek.toFixed(1);
    const c3 = tr.insertCell();
    c3.className = "num";
    c3.textContent = at.length.toLocaleString();
    const share = tr.insertCell();
    share.className = "lp-share";
    const track = el("span", "lp-track");
    const bar = el("i", "lp-bar");
    bar.style.width = `${(at.length / top) * 100}%`;
    track.append(bar);
    share.append(track, el("span", "ct-dim", `${((at.length / total) * 100).toFixed(1)}%`));
  }
  wrap.append(table);
  return wrap;
}
