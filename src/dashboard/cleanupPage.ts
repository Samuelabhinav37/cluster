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
  /** Switches that belong to this card ("Do this automatically"). */
  auto?: HTMLElement | null;
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
export function lineChart(counts: readonly number[], now: number, noun = "emails"): HTMLElement {
  const wrap = el("div", "pl-chart");
  const last = counts.length - 1;
  const step = Math.max(1, Math.ceil(Math.max(...counts, 1) / 4));
  const top = step * 4;
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", `Emails each day, last ${counts.length} days: ${counts.join(", ")}`);
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${Math.max(1, last)} 100`);
  svg.setAttribute("preserveAspectRatio", "none");
  const y = (n: number) => 100 - (n / top) * 100;
  const node = (tag: string, attrs: Record<string, string | number>) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const defs = node("defs", {});
  const grad = node("linearGradient", { id: "pl-fade", x1: 0, x2: 0, y1: 0, y2: 1 });
  grad.append(node("stop", { offset: "0%", class: "pl-fade-top" }), node("stop", { offset: "100%", class: "pl-fade-end" }));
  defs.append(grad);
  svg.append(defs);
  for (let i = 1; i <= 4; i++) svg.append(node("line", { x1: 0, x2: last, y1: y(step * i), y2: y(step * i), class: "pl-grid" }));
  svg.append(node("line", { x1: 0, x2: last, y1: 100, y2: 100, class: "pl-base" }));
  for (let i = 0; i <= 4; i++) {
    const label = el("span", "pl-y", (step * i).toLocaleString());
    label.setAttribute("aria-hidden", "true");
    label.style.top = `${y(step * i)}%`;
    wrap.append(label);
  }
  const pts = counts.map((n, i) => `${i},${y(n)}`).join(" L");
  svg.append(node("path", { d: `M0,100 L${pts} L${last},100 Z`, class: "pl-area" }), node("path", { d: `M${pts}`, class: "pl-line" }));
  wrap.append(svg);
  const dayOf = (i: number) => new Date(now - (last - i) * DAY);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  // A date every five days from the first, like Plausible's 28-day view.
  for (let i = 0; i <= last; i += 5) {
    const x = `${(i / Math.max(1, last)) * 100}%`;
    const label = el("span", "pl-x", fmt(dayOf(i)));
    label.style.left = x;
    label.setAttribute("aria-hidden", "true");
    const tick = el("i", "pl-tick");
    tick.style.left = x;
    wrap.append(tick, label);
  }
  const guide = el("i", "pl-guide");
  const dot = el("i", "pl-dot");
  const tip = el("div", "pl-tip");
  guide.hidden = dot.hidden = tip.hidden = true;
  wrap.append(guide, dot, tip);
  wrap.onmousemove = (e) => {
    const r = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(last, Math.round(((e.clientX - r.left) / Math.max(1, r.width)) * last)));
    const x = `${(i / Math.max(1, last)) * 100}%`;
    guide.style.left = dot.style.left = tip.style.left = x;
    dot.style.top = `${y(counts[i])}%`;
    tip.classList.toggle("flip", i > last / 2);
    tip.replaceChildren(el("span", "", fmt(dayOf(i))), el("b", "", `${counts[i].toLocaleString()} ${noun}`));
    guide.hidden = dot.hidden = tip.hidden = false;
  };
  wrap.onmouseleave = () => {
    guide.hidden = dot.hidden = tip.hidden = true;
  };
  return wrap;
}

/** Plausible's change chip: a small arrow and the % against the period before.
 * For clutter, more is worse, so up is red and down is green. */
export function changeChip(now: number, before: number): HTMLElement | null {
  if (before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  const chip = el("span", `pl-change ${pct > 0 ? "worse" : pct < 0 ? "better" : ""}`);
  chip.title = "Against the 28 days before";
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
  if (spec.auto) {
    const auto = el("section", "ios-section cu-auto");
    auto.append(el("h2", "ios-head", "Do this automatically"), spec.auto);
    auto.hidden = spec.auto.childElementCount === 0;
    parts.push(auto);
  }
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

/** Plausible's two-part number: the count, then its share of the whole in gray. */
export function emailsCell(count: number, total: number, tag: "td" | "span" = "td"): HTMLElement {
  const cell = el(tag, "num ct-emails");
  const pct = total > 0 ? (count / total) * 100 : 0;
  cell.append(el("b", "", count.toLocaleString()), el("span", "", `${pct >= 1 || pct === 0 ? Math.round(pct) : pct.toFixed(1)}%`));
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
  const top = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((n, r) => n + r.count, 0);
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
      // Plausible's bar behind the name: the row's share of the biggest sender.
      name.style.setProperty("--share", `${(r.count / top) * 100}%`);
      name.append(senderTile(r.lead.address, r.lead.displayName, "sz-26"), el("b", "", senderName(r.lead)));
      who.append(name);
      const reason = el("td", "ct-dim ct-reason", reasons.get(r.key) ?? "");
      const latest = Math.max(0, ...r.senders.flatMap((s) => s.messages.map((m) => m.receivedAt)));
      const pct = Math.round(r.opened * 100);
      tr.append(
        td0,
        who,
        reason,
        emailsCell(r.count, total),
        el("td", "ct-dim", latest ? lastReceived(latest, now) : ""),
        el("td", "num ct-dim", pct === 0 ? "Never" : `${pct}%`),
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
