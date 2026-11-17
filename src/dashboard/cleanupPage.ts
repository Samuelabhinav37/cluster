// A Clean up card's own page: the number, an 8-week bar, every company with a
// tick, and a Trash bar for what's ticked. A row opens its emails in Details.
import type { ProviderId } from "../lib/providers/emailProvider";
import type { SenderSummary } from "../lib/senderModel";
import { senderName } from "../lib/senderListView";
import { listGroup, listRow } from "./listRow";
import { senderTile } from "./senderTile";

export interface PageItem {
  sender: SenderSummary;
  ids: string[];
}

export interface CleanupPageSpec {
  title: string;
  items: PageItem[];
  rowKeyOf: (s: SenderSummary) => string;
  /** Show one row's emails in Details. */
  openRow: (key: string) => void;
  /** Ask, then trash these. Renders its confirm into `slot`. */
  trash: (ids: Map<ProviderId, string[]>, senders: SenderSummary[], slot: HTMLElement, reset: () => void) => void;
  back: () => void;
}

interface PageRow {
  key: string;
  lead: SenderSummary;
  senders: SenderSummary[];
  ids: Map<ProviderId, string[]>;
  count: number;
  opened: number;
}

const WEEKS = 8;
const DAY = 86_400_000;

/** One row per company, biggest first. Exported for tests. */
export function pageRows(items: readonly PageItem[], rowKeyOf: (s: SenderSummary) => string): PageRow[] {
  const rows = new Map<string, PageRow>();
  const leadCount = new Map<string, number>();
  for (const { sender, ids } of items) {
    if (ids.length === 0) continue;
    const key = rowKeyOf(sender);
    let row = rows.get(key);
    if (!row) {
      row = { key, lead: sender, senders: [], ids: new Map(), count: 0, opened: 0 };
      rows.set(key, row);
    }
    row.senders.push(sender);
    row.ids.set(sender.provider, [...(row.ids.get(sender.provider) ?? []), ...ids]);
    row.count += ids.length;
    // The address with the most mail stands for the row (its logo and name).
    if (ids.length > (leadCount.get(key) ?? 0)) {
      row.lead = sender;
      leadCount.set(key, ids.length);
    }
  }
  for (const row of rows.values()) {
    const all = row.senders.flatMap((s) => s.messages);
    row.opened = all.length === 0 ? 0 : all.filter((m) => !m.unread).length / all.length;
  }
  return [...rows.values()].sort((a, b) => b.count - a.count);
}

/** Emails per week, oldest first, ending this week. */
export function weeklyCounts(items: readonly PageItem[], now: number): number[] {
  const weeks = new Array<number>(WEEKS).fill(0);
  for (const { sender, ids } of items) {
    const wanted = new Set(ids);
    for (const m of sender.messages) {
      if (!wanted.has(m.id)) continue;
      const back = Math.floor((now - m.receivedAt) / (7 * DAY));
      if (back >= 0 && back < WEEKS) weeks[WEEKS - 1 - back]++;
    }
  }
  return weeks;
}

/** Emails per day, oldest first, the last `days` days ending today. */
export function dailyCounts(items: readonly PageItem[], now: number, days = 28): number[] {
  const out = new Array<number>(days).fill(0);
  const today = new Date(now).setHours(0, 0, 0, 0);
  for (const { sender, ids } of items) {
    const wanted = new Set(ids);
    for (const m of sender.messages) {
      if (!wanted.has(m.id)) continue;
      const back = Math.round((today - new Date(m.receivedAt).setHours(0, 0, 0, 0)) / DAY);
      if (back >= 0 && back < days) out[days - 1 - back]++;
    }
  }
  return out;
}

const SVG = "http://www.w3.org/2000/svg";

/** Plausible-style area line: gridlines with counts on the left, a baseline with
 * ticks under the dates, and a hover guide with the day's count. */
/** A round step (1, 2, 2.5 or 5 times a power of ten) that splits `max` into about three. */
export function niceStep(max: number): number {
  const raw = Math.max(1, max) / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  // Whole emails only: 2.5 needs a power of ten from 10 up, and a quiet month still steps by 1.
  const m = [1, 2, 2.5, 5, 10].find((k) => k * pow >= raw && Number.isInteger(k * pow)) ?? 10;
  return Math.max(1, m * pow);
}

export interface StackSeries {
  key: string;
  label: string;
  color: string;
  counts: readonly number[];
}

/** Cleanup's breakdown: a stacked bar per day, one warm hue per kind, a bracketed
 * legend, and a column readout on hover (the "Resource overview" reference, 2026-11-16).
 * `active` dims the other kinds; `tools` sits at the right of the header. */
export function stackChart(
  series: readonly StackSeries[],
  now: number,
  o: { active?: string | null; onPick?: (key: string) => void; tools?: HTMLElement[] } = {},
): HTMLElement {
  const days = series[0]?.counts.length ?? 0;
  const totals = Array.from({ length: days }, (_, i) => series.reduce((n, s) => n + s.counts[i], 0));
  const wrap = el("div", "sc-chart");
  const head = el("div", "sc-head");
  const tools = el("div", "sc-tools");
  tools.append(...(o.tools ?? []));
  head.append(el("h2", "sc-title", "Breakdown"), tools);
  // Dots like Mail by category: hover lights one kind's bars, click picks it.
  const legend = el("div", "ov-legend sc-legend");
  const focus = (key: string | null) => {
    for (const seg of Array.from(wrap.querySelectorAll<HTMLElement>(".sc-seg"))) seg.classList.toggle("is-dim", key !== null && seg.dataset.key !== key);
  };
  for (const s of series) {
    const item = el("button", "sc-key", s.label);
    item.type = "button";
    item.dataset.key = s.key;
    item.classList.toggle("is-off", !!o.active && o.active !== s.key);
    item.setAttribute("aria-pressed", String(o.active === s.key));
    const dot = el("i", "");
    dot.style.background = s.color;
    item.prepend(dot);
    item.append(el("b", "", s.counts.reduce((a, b) => a + b, 0).toLocaleString()));
    if (o.onPick) item.onclick = () => o.onPick!(s.key);
    item.onmouseenter = item.onfocus = () => focus(s.key);
    item.onmouseleave = item.onblur = () => focus(null);
    legend.append(item);
  }
  const plot = el("div", "sc-plot");
  plot.setAttribute("role", "img");
  plot.setAttribute("aria-label", `Emails each day, last ${days} days: ${series.map((s) => `${s.label} ${s.counts.reduce((a, b) => a + b, 0)}`).join(", ")}`);
  const step = niceStep(Math.max(...totals, 0));
  const top = step * Math.max(1, Math.ceil(Math.max(...totals, 1) / step));
  for (let v = 0; v <= top; v += step) {
    const line = el("i", "sc-grid");
    line.style.bottom = `${(v / top) * 100}%`;
    plot.append(line);
  }
  const dayOf = (i: number) => new Date(now - (days - 1 - i) * DAY);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const cols: HTMLElement[] = [];
  const bars = el("div", "sc-bars");
  bars.style.setProperty("--n", String(days));
  for (let i = 0; i < days; i++) {
    const col = el("div", "sc-col");
    col.style.setProperty("--i", String(i));
    col.style.height = `${(totals[i] / top) * 100}%`;
    for (const s of series) {
      if (!s.counts[i]) continue;
      const seg = el("i", "sc-seg");
      seg.dataset.key = s.key;
      seg.style.background = s.color;
      seg.style.flexGrow = String(s.counts[i]);
      seg.classList.toggle("is-off", !!o.active && o.active !== s.key);
      col.append(seg);
    }
    cols.push(col);
    bars.append(col);
  }
  plot.append(bars);
  const xs = el("div", "sc-xs");
  xs.setAttribute("aria-hidden", "true");
  const every = Math.max(1, Math.round(days / 10));
  for (let i = days - 1; i >= 0; i -= every) {
    const x = el("span", "sc-x", String(dayOf(i).getDate()));
    x.style.left = `${((i + 0.5) / days) * 100}%`;
    xs.append(x);
  }
  const tip = el("div", "sc-tip");
  tip.hidden = true;
  plot.append(tip);
  plot.addEventListener("mousemove", (e) => {
    const r = plot.getBoundingClientRect();
    if (!r.width) return;
    const i = Math.min(days - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * days)));
    plot.classList.add("is-picking");
    cols.forEach((c, j) => c.classList.toggle("on", j === i));
    tip.replaceChildren(el("span", "sc-tip-day", fmt(dayOf(i))));
    for (const s of series) {
      const row = el("span", "sc-tip-row");
      const dot = el("i", "sc-dot");
      dot.style.background = s.color;
      row.append(dot, s.label, el("b", "", s.counts[i].toLocaleString()));
      tip.append(row);
    }
    tip.style.left = `${((i + 0.5) / days) * 100}%`;
    tip.classList.toggle("flip", i > days / 2);
    tip.hidden = false;
  });
  plot.addEventListener("mouseleave", () => {
    plot.classList.remove("is-picking");
    cols.forEach((c) => c.classList.remove("on"));
    tip.hidden = true;
  });
  wrap.append(head, legend, plot, xs);
  return wrap;
}

/** Plausible's change chip: a small arrow and the % against the period before.
 * For clutter, more is worse, so up is red and down is green. */
export function changeChip(now: number, before: number): HTMLElement | null {
  if (before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  const chip = el("span", `pl-change ${pct > 0 ? "worse" : pct < 0 ? "better" : ""}`);
  chip.title = "Against the 4 weeks before";
  if (pct !== 0) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG, "path");
    // Heroicons arrow-up-right (MIT); flipped vertically for down.
    path.setAttribute("d", "M8.25 3.75H19.5a.75.75 0 0 1 .75.75v11.25a.75.75 0 0 1-1.5 0V6.31L5.03 20.03a.75.75 0 0 1-1.06-1.06L17.69 5.25H8.25a.75.75 0 0 1 0-1.5Z");
    svg.append(path);
    chip.append(svg);
  }
  chip.append(`${Math.abs(pct)}%`);
  return chip;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderCleanupPage(root: HTMLElement, spec: CleanupPageSpec, now = Date.now()): void {
  const rows = pageRows(spec.items, spec.rowKeyOf);
  const selected = new Set(rows.map((r) => r.key));
  const total = rows.reduce((n, r) => n + r.count, 0);

  const back = el("button", "cu-back", "‹ Cleanup");
  back.type = "button";
  back.onclick = spec.back;
  const title = el("h2", "cu-page-title", spec.title);
  const num = el("p", "cu-num");
  num.append(el("b", "", total.toLocaleString()), " emails");

  const weeks = weeklyCounts(spec.items, now);
  const max = Math.max(1, ...weeks);
  const bars = el("div", "vbars cu-weeks");
  bars.setAttribute("role", "img");
  bars.setAttribute("aria-label", `Emails each week, last ${WEEKS} weeks: ${weeks.join(", ")}`);
  bars.append(
    ...weeks.map((n) => {
      const bar = el("div", "vbar");
      const fill = el("i");
      fill.style.height = `${n === 0 ? 0 : Math.max((n / max) * 100, 4)}%`;
      bar.append(fill);
      return bar;
    }),
  );

  const slot = el("span", "cu-sel-slot");
  const selAll = el("input", "check");
  selAll.type = "checkbox";
  selAll.setAttribute("aria-label", "Select all");
  const selLabel = el("label", "check-label");
  selLabel.append(selAll);
  const bar = el("div", "toolbar cu-selbar");
  bar.append(selLabel, slot);

  const list = el("div");
  const renderList = () => {
    const ticked = rows.filter((r) => selected.has(r.key));
    const n = ticked.reduce((sum, r) => sum + r.count, 0);
    selAll.checked = ticked.length === rows.length && rows.length > 0;
    selAll.indeterminate = ticked.length > 0 && ticked.length < rows.length;
    const trashBtn = el("button", "btn btn-accent-solid", `Trash ${n.toLocaleString()}`);
    trashBtn.type = "button";
    trashBtn.disabled = n === 0;
    trashBtn.onclick = () => {
      const merged = new Map<ProviderId, string[]>();
      for (const r of ticked)
        for (const [p, ids] of r.ids) merged.set(p, [...(merged.get(p) ?? []), ...ids]);
      spec.trash(merged, ticked.flatMap((r) => r.senders), slot, renderList);
    };
    slot.replaceChildren(trashBtn);
    list.replaceChildren(
      listGroup(
        rows.map((r) => {
          const meta = el("span", "ios-value", r.count.toLocaleString());
          return listRow({
            selectable: {
              checked: selected.has(r.key),
              label: `Select ${senderName(r.lead)}`,
              onChange: (on) => {
                if (on) selected.add(r.key);
                else selected.delete(r.key);
                renderList();
              },
            },
            lead: senderTile(r.lead.address, r.lead.displayName, "sz-30"),
            title: senderName(r.lead),
            sub: `Opened ${Math.round(r.opened * 100)}%`,
            meta,
            href: () => spec.openRow(r.key),
          });
        }),
        { inset: true },
      ),
    );
  };
  selAll.onchange = () => {
    if (selAll.checked) for (const r of rows) selected.add(r.key);
    else selected.clear();
    renderList();
  };
  renderList();

  const parts: HTMLElement[] = [back, title, num, bars, bar, list];
  root.replaceChildren(...parts);
}

export interface SenderTableItem extends PageItem {
  /** Why this sender is here: "Unopened", "Expired". */
  reason: string;
}

export interface SenderTableSpec {
  items: SenderTableItem[];
  rowKeyOf: (s: SenderSummary) => string;
  openRow: (key: string) => void;
  trash: (ids: Map<ProviderId, string[]>, senders: SenderSummary[], slot: HTMLElement, reset: () => void) => void;
}

const PAGE = 10;

function lastReceived(ms: number, now: number): string {
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const d = new Date(ms);
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The Emails cell: the count alone. */
export function emailsCell(count: number, tag: "td" | "span" = "td"): HTMLElement {
  const cell = el(tag, "num ct-emails");
  cell.append(el("b", "", count.toLocaleString()));
  return cell;
}

/** Cleanup's Senders tab: one table of every sender worth clearing, with
 * the reason, a tick per row, and a selection bar that trashes what's ticked. */
export function renderSenderTable(root: HTMLElement, spec: SenderTableSpec, now = Date.now()): void {
  const rows = pageRows(spec.items, spec.rowKeyOf);
  const reasons = new Map<string, string>();
  for (const it of spec.items) {
    const k = spec.rowKeyOf(it.sender);
    if (!reasons.has(k)) reasons.set(k, it.reason);
  }
  const selected = new Set<string>();
  let shown = PAGE;

  const render = () => {
    const ticked = rows.filter((r) => selected.has(r.key));
    const n = ticked.reduce((sum, r) => sum + r.count, 0);

    const bar = el("div", "ct-selbar");
    bar.hidden = ticked.length === 0;
    const what = el("b", "", `${ticked.length} selected`);
    bar.append(what, el("span", "", `${n.toLocaleString()} emails`));
    const slot = el("span", "ct-sel-slot");
    const clear = el("button", "ct-clear", "Clear");
    clear.type = "button";
    clear.onclick = () => {
      selected.clear();
      render();
    };
    const trashBtn = el("button", "btn", "Trash");
    trashBtn.type = "button";
    trashBtn.onclick = () => {
      const merged = new Map<ProviderId, string[]>();
      for (const r of ticked) for (const [p, ids] of r.ids) merged.set(p, [...(merged.get(p) ?? []), ...ids]);
      spec.trash(merged, ticked.flatMap((r) => r.senders), slot, render);
    };
    slot.append(clear, trashBtn);
    bar.append(slot);

    const table = el("table", "ct-table");
    const head = el("tr");
    const all = el("input", "check");
    all.type = "checkbox";
    all.setAttribute("aria-label", "Select all");
    all.checked = rows.length > 0 && ticked.length === rows.length;
    all.indeterminate = ticked.length > 0 && ticked.length < rows.length;
    all.onchange = () => {
      if (all.checked) for (const r of rows) selected.add(r.key);
      else selected.clear();
      render();
    };
    const th0 = el("th", "ct-tick");
    th0.append(all);
    head.append(th0);
    for (const [t, c] of [["Sender", "ct-c-who"], ["Reason", "ct-c-reason"], ["Emails", "num ct-c-emails"], ["Last received", "ct-c-last"], ["Opened", "num ct-c-opened"]])
      head.append(el("th", c, t));
    const thead = el("thead");
    thead.append(head);
    const body = el("tbody");
    for (const r of rows.slice(0, shown)) {
      const tr = el("tr", "row-link");
      const box = el("input", "check");
      box.type = "checkbox";
      box.checked = selected.has(r.key);
      box.setAttribute("aria-label", `Select ${senderName(r.lead)}`);
      box.onchange = () => {
        if (box.checked) selected.add(r.key);
        else selected.delete(r.key);
        render();
      };
      const td0 = el("td", "ct-tick");
      td0.append(box);
      const who = el("td", "ct-who");
      const name = el("span", "ct-name");
      name.append(senderTile(r.lead.address, r.lead.displayName, "sz-26"), el("b", "", senderName(r.lead)));
      who.append(name);
      const reason = el("td", "ct-dim ct-reason", reasons.get(r.key) ?? "");
      const latest = Math.max(0, ...r.senders.flatMap((s) => s.messages.map((m) => m.receivedAt)));
      const pct = Math.round(r.opened * 100);
      tr.append(
        td0,
        who,
        reason,
        emailsCell(r.count),
        el("td", "ct-dim", latest ? lastReceived(latest, now) : ""),
        el("td", "num ct-dim", `${pct}%`),
      );
      tr.onclick = (e) => {
        if (!(e.target instanceof Element && e.target.closest("input, label, button"))) spec.openRow(r.key);
      };
      body.append(tr);
    }
    table.append(thead, body);
    const wrap = el("div", "scroll-x");
    wrap.append(table);

    const parts: HTMLElement[] = [bar, wrap];
    if (rows.length > shown) {
      const more = el("button", "btn ct-more", `Show ${Math.min(PAGE, rows.length - shown)} more`);
      more.type = "button";
      more.onclick = () => {
        shown += PAGE;
        render();
      };
      parts.push(more);
    }
    if (rows.length === 0) parts.push(el("p", "hint", "Nothing to clear."));
    root.replaceChildren(...parts);
  };
  render();
}
