// One label's own page (Labels › a row): its name, what belongs in it, where it
// goes, a chart of its emails each day and the Cleanup table of who sends them,
// with Trash and Archive. After iCloud's CloudKit telemetry page: a title, a
// range, the chart, then the rows behind it.
import { CLUSTER_LABEL_COLORS, showLabel } from "../lib/clusterLabels";
import { categoryLabelName } from "../lib/categoryFilters";
import { domainOf } from "../lib/domainGrouping";
import type { SenderSummary } from "../lib/senderModel";
import { effectiveBucket, type SortBucket } from "../lib/sortTaxonomy";
import { renderSenderTable, type SenderTableSpec } from "./cleanupPage";
import { chartStats, dayChart, gmailUrl, receivedStats } from "./homeDashboard";
import { ctx } from "./state";

const DAY = 86_400_000;
const RANGES = [7, 30, 90, 365] as const;

let days = 90;
/** Every sender Cluster has read (not only the newest mail), set on each refresh. */
let allSenders: readonly SenderSummary[] = [];
let actions: {
  open: (senderKey: string) => void;
  rowKeyOf: (s: SenderSummary) => string;
  trash: SenderTableSpec["act"];
  archive?: SenderTableSpec["act"];
} | null = null;
let shown: { bucket: SortBucket; hint: string } | null = null;

export function wireLabelPage(a: NonNullable<typeof actions>): void {
  actions = a;
  // Leaving Labels closes the page, so coming back shows the list.
  document.addEventListener("cluster:screen", () => {
    if (document.getElementById("label-page")?.hidden === false) showLabelPage(null, "");
  });
}

/** New mail read: keep the page's numbers current. */
export function setLabelSenders(senders: readonly SenderSummary[]): void {
  allSenders = senders;
  if (shown) showLabelPage(shown.bucket, shown.hint);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Each sender's emails in this label within `range` days of `now`, most first. */
export function labelMail(senders: readonly SenderSummary[], bucket: SortBucket, now: number, range: number) {
  const out: { sender: SenderSummary; ids: string[]; at: number[] }[] = [];
  for (const s of senders) {
    const mail = s.messages.filter(
      (m) =>
        now - m.receivedAt < range * DAY &&
        effectiveBucket(m.kind, domainOf(s.address), s.address, ctx.settings.sortOverrides, m.promotion ?? m.tab === "promotions") === bucket,
    );
    if (mail.length) out.push({ sender: s, ids: mail.map((m) => m.id), at: mail.map((m) => m.receivedAt) });
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

/** The label's menu from the list, mirrored here: a change goes through the list's menu so it saves the same way. */
function whereItGoes(bucket: SortBucket, name: string): HTMLSelectElement | null {
  const source = document.getElementById(`time-limit-${bucket}`) as HTMLSelectElement | null;
  if (!source) return null;
  const pick = el("select", "chart-tool lp-where");
  pick.setAttribute("aria-label", `${name}: where it goes`);
  // On its own, "Off" says nothing; here it names what is off.
  for (const o of Array.from(source.options)) if (!o.hidden) pick.add(new Option(o.text === "Off" ? "Sorting off" : o.text, o.value, false, o.selected));
  pick.onchange = () => {
    source.value = pick.value;
    source.dispatchEvent(new Event("change"));
  };
  return pick;
}

/** Draws `bucket`'s page into the Labels screen, or closes it (null). */
export function showLabelPage(bucket: SortBucket | null, hint: string): void {
  const screen = document.querySelector<HTMLElement>('section.screen[data-screen="organize"]');
  const root = document.getElementById("label-page");
  if (!screen || !root) return;
  shown = bucket ? { bucket, hint } : null;
  screen.classList.toggle("paged", bucket !== null);
  root.hidden = bucket === null;
  if (bucket === null) return root.replaceChildren();
  const now = Date.now();
  const gmailName = categoryLabelName(bucket, ctx.settings.labelChoices);
  const name = showLabel(gmailName);
  const color = CLUSTER_LABEL_COLORS[bucket]?.backgroundColor ?? "var(--accent)";
  const senders = allSenders.length ? allSenders : ctx.senders;

  const back = el("button", "cu-back", "‹ Labels");
  back.type = "button";
  back.onclick = () => showLabelPage(null, "");
  const head = el("div", "lp-head");
  // The emoji large beside the name and its line, both on one edge.
  const [, emoji = "", rest = name] = /^(\p{Extended_Pictographic}️?)\s*(.*)$/u.exec(name) ?? [];
  const ident = el("div", "lp-ident");
  if (emoji) {
    const tile = el("span", "lp-icon", emoji);
    tile.setAttribute("aria-hidden", "true");
    ident.append(tile);
  }
  const titles = el("div", "lp-titles");
  titles.append(el("h2", "lp-title", rest), el("p", "lp-lead", `${hint}.`));
  ident.append(titles);
  const tools = el("div", "chart-tools");
  const where = whereItGoes(bucket, name);
  const range = el("select", "chart-tool");
  range.setAttribute("aria-label", "Days shown");
  for (const d of RANGES) range.add(new Option(d === 365 ? "1 year" : `${d} days`, String(d), false, d === days));
  range.onchange = () => {
    days = Number(range.value);
    showLabelPage(bucket, hint);
  };
  const gmail = el("a", "chart-tool", "Open in Gmail");
  gmail.href = labelSearch(gmailName);
  gmail.target = "_blank";
  gmail.rel = "noopener";
  tools.append(...(where ? [where] : []), range, gmail);
  head.append(ident, tools);

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

  // Who sends it, as Cleanup's table: tick rows, or Trash all, then confirm. A row opens its emails in Details.
  const table = el("section", "cu-table lp-table");
  const tableTools = el("div", "ct-tools lp-tools");
  const tableBody = el("div");
  table.append(tableTools, tableBody);
  if (rows.length === 0) {
    tableBody.append(el("p", "empty-state", `Nothing Cluster has read in the last ${range.selectedOptions[0].text.toLowerCase()} belongs here. Older mail with this label is in Gmail.`));
  } else if (actions) {
    renderSenderTable(tableBody, {
      id: "label",
      columns: ["read", "emails", "last"],
      tools: tableTools,
      items: rows.map((r) => ({ sender: r.sender, ids: r.ids, reason: name })),
      rowKeyOf: actions.rowKeyOf,
      openRow: (key) => actions!.open(key),
      act: actions.trash,
      allVerb: "Trash all",
      more: actions.archive ? [{ verb: "Archive", act: actions.archive }] : [],
    });
  }
  root.replaceChildren(back, head, card, table);
}
