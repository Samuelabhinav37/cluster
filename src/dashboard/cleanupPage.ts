// A Clean up card's own page: the number, an 8-week bar, every company with a
// tick, and a Trash bar for what's ticked. A row opens its emails in Details.
import type { ProviderId } from "../lib/providers/emailProvider";
import type { SenderSummary } from "../lib/senderModel";
import { senderName } from "../lib/senderListView";
import { listGroup, listRow } from "./listRow";
import { rowMenu, type MenuEntry } from "./rowMenu";
import { csvField, downloadBytes } from "./csv";
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
  /** The note column: why it's here ("Unopened") or where it stands ("Stopped"). */
  reason: string;
}

/** The columns a table can show after the name. */
export type ColumnId = "note" | "read" | "perMonth" | "emails" | "size" | "last";

export interface SenderTableSpec {
  /** Names this table's saved view (sort, rows per page, hidden columns). */
  id: string;
  items: SenderTableItem[];
  rowKeyOf: (s: SenderSummary) => string;
  openRow: (key: string, lead: SenderSummary) => void;
  /** What the selection bar's button does to the ticked rows; renders its confirm into `slot`. */
  act: (ids: Map<ProviderId, string[]>, senders: SenderSummary[], slot: HTMLElement, reset: () => void) => void;
  /** The columns after the name, in order. */
  columns: ColumnId[];
  /** Where Search, Customize, Filter and Export go (the tabs row). */
  tools?: HTMLElement | null;
  /** The name column's header. Default "Sender". */
  nameHead?: string;
  /** The note column's header. Default "Reason". */
  noteHead?: string;
  /** Emails a month, for the Per month column. */
  perMonth?: (senders: SenderSummary[]) => number;
  /** The selection bar's button. Default "Trash". */
  verb?: string;
  /** Rows that can't take the bar's action get no tick. */
  canTick?: (senders: SenderSummary[]) => boolean;
  /** Gray text after the name, e.g. "5 lists". */
  badge?: (senders: SenderSummary[]) => string;
  /** Ticked row keys, owned by the caller so a re-render or preselect keeps them. */
  selected?: Set<string>;
  /** Ids for the bar's slot and button, for callers that drive them. */
  barIds?: { slot: string; button: string };
}

type SortKey = ColumnId | "name";

interface View {
  sort: SortKey;
  desc: boolean;
  page: number;
  per: number;
  query: string;
  filter: string | null;
  hidden: ColumnId[];
}

const PER_PAGE = [10, 25, 50];
const HEADS: Record<ColumnId, string> = {
  note: "Reason",
  read: "Read rate",
  perMonth: "Per month",
  emails: "Emails",
  size: "Size",
  last: "Last received",
};
const NUMERIC = new Set<ColumnId>(["perMonth", "emails", "size"]);

// Per table for the session; rows per page and hidden columns also survive a reload.
const views = new Map<string, View>();
function viewFor(id: string): View {
  let v = views.get(id);
  if (v) return v;
  let saved: Partial<View> = {};
  try {
    saved = JSON.parse(localStorage.getItem(`cluster.table.${id}`) ?? "{}") as Partial<View>;
  } catch {
    // No storage (private window): the defaults are fine.
  }
  v = {
    sort: "emails",
    desc: true,
    page: 0,
    per: PER_PAGE.includes(saved.per ?? 0) ? saved.per! : PER_PAGE[0],
    query: "",
    filter: null,
    hidden: Array.isArray(saved.hidden) ? saved.hidden : [],
  };
  views.set(id, v);
  return v;
}
function saveView(id: string, v: View) {
  try {
    localStorage.setItem(`cluster.table.${id}`, JSON.stringify({ per: v.per, hidden: v.hidden }));
  } catch {
    // Not saved; the table still works.
  }
}

function lastReceived(ms: number, now: number): string {
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const d = new Date(ms);
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

const perMonthText = (n: number) => (n >= 1 ? Math.round(n).toLocaleString() : "<1");

/** Page numbers to show, with "…" for gaps: 1 2 … 8 9 10. Exported for tests. */
export function pageList(current: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const keep = new Set([0, 1, current - 1, current, current + 1, pages - 2, pages - 1].filter((p) => p >= 0 && p < pages));
  const out: (number | "…")[] = [];
  let prev = -1;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

/** The Emails cell: the count alone. */
export function emailsCell(count: number, tag: "td" | "span" = "td"): HTMLElement {
  const cell = el(tag, "num ct-emails");
  cell.append(el("b", "", count.toLocaleString()));
  return cell;
}

// Toolbar icons as path data, drawn with DOM calls (no innerHTML).
const ICONS = {
  search: ["M18 11a7 7 0 1 1-14 0a7 7 0 1 1 14 0", "m20 20-4-4"],
  customize: ["M4 7h10M18 7h2M4 17h4M12 17h8", "M18 7a2 2 0 1 1-4 0a2 2 0 1 1 4 0", "M12 17a2 2 0 1 1-4 0a2 2 0 1 1 4 0"],
  filter: ["M4 5h16l-6 8v6l-4-2v-4z"],
  export: ["M12 4v11M7 10l5 5 5-5M5 20h14"],
};
function toolIcon(icon: keyof typeof ICONS): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "i");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICONS[icon]) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
function toolButton(icon: keyof typeof ICONS, label: string, iconOnly = false): HTMLButtonElement {
  const b = el("button", "btn ct-tool");
  b.type = "button";
  b.append(toolIcon(icon));
  if (iconOnly) b.setAttribute("aria-label", label);
  else b.append(label);
  return b;
}
/** A toolbar button that opens a menu (the row menu's, so keys and Escape match). */
function toolMenu(icon: keyof typeof ICONS, label: string, entries: MenuEntry[]): HTMLElement {
  const menu = rowMenu(entries, label);
  menu.classList.add("ct-tool-menu");
  const b = menu.querySelector("button")!;
  b.className = "btn ct-tool";
  b.removeAttribute("aria-label");
  b.replaceChildren(toolIcon(icon), label);
  return menu;
}

/** Cleanup's Senders and Mailing lists tabs: a toolbar (Search, Customize,
 * Filter, Export), sortable columns, a tick per row with a selection bar whose
 * one button acts on what's ticked, and pages. Returns the number of rows. */
export function renderSenderTable(root: HTMLElement, spec: SenderTableSpec, now = Date.now()): number {
  const view = viewFor(spec.id);
  const notes = new Map<string, string>();
  for (const it of spec.items) {
    const k = spec.rowKeyOf(it.sender);
    if (!notes.has(k)) notes.set(k, it.reason);
  }
  const rows = pageRows(spec.items, spec.rowKeyOf).map((r) => {
    const ids = new Set([...r.ids.values()].flat());
    const mail = r.senders.flatMap((s) => s.messages);
    return {
      ...r,
      note: notes.get(r.key) ?? "",
      latest: Math.max(0, ...mail.map((m) => m.receivedAt)),
      bytes: mail.filter((m) => ids.has(m.id)).reduce((n, m) => n + (m.sizeBytes || 0), 0),
      perMonth: spec.perMonth?.(r.senders) ?? 0,
    };
  });
  type Row = (typeof rows)[number];
  const tickable = new Set(rows.filter((r) => spec.canTick?.(r.senders) ?? true));
  const selected = spec.selected ?? new Set<string>();
  const tickKeys = new Set([...tickable].map((r) => r.key));
  for (const k of Array.from(selected)) if (!tickKeys.has(k)) selected.delete(k);
  if (view.filter && !rows.some((r) => r.note === view.filter)) view.filter = null;
  const headOf = (c: ColumnId) => (c === "note" ? (spec.noteHead ?? HEADS.note) : HEADS[c]);
  const sortValue = (r: Row, k: SortKey): number | string =>
    k === "name" ? senderName(r.lead).toLowerCase()
    : k === "note" ? r.note
    : k === "read" ? r.opened
    : k === "perMonth" ? r.perMonth
    : k === "emails" ? r.count
    : k === "size" ? r.bytes
    : r.latest;
  let focusSearch = false;

  const render = () => {
    const columns = spec.columns.filter((c) => !view.hidden.includes(c));
    const q = view.query.trim().toLowerCase();
    const shownRows = rows
      .filter((r) => !view.filter || r.note === view.filter)
      .filter((r) => !q || r.senders.some((s) => `${s.displayName ?? ""} ${s.address}`.toLowerCase().includes(q)))
      .sort((a, b) => {
        const x = sortValue(a, view.sort);
        const y = sortValue(b, view.sort);
        const c = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
        return (view.desc ? -c : c) || b.count - a.count;
      });
    const pages = Math.max(1, Math.ceil(shownRows.length / view.per));
    view.page = Math.min(view.page, pages - 1);
    const pageRowsNow = shownRows.slice(view.page * view.per, (view.page + 1) * view.per);
    const ticked = rows.filter((r) => selected.has(r.key));
    const n = ticked.reduce((sum, r) => sum + r.count, 0);

    // ── Toolbar ──
    if (spec.tools) {
      const search = el("input", "ct-search");
      search.type = "search";
      search.placeholder = "Search";
      search.setAttribute("aria-label", `Search ${(spec.nameHead ?? "Sender").toLowerCase()}s`);
      search.value = view.query;
      search.hidden = !view.query && !focusSearch;
      search.oninput = () => {
        view.query = search.value;
        view.page = 0;
        focusSearch = true;
        render();
      };
      search.onblur = () => {
        focusSearch = false;
        if (!view.query) search.hidden = true;
      };
      const searchBtn = toolButton("search", "Search", true);
      searchBtn.onclick = () => {
        search.hidden = false;
        search.focus();
      };
      const customize = toolMenu(
        "customize",
        "Customize",
        spec.columns.map((c) => ({
          label: `${view.hidden.includes(c) ? "   " : "✓ "}${headOf(c)}`,
          run: () => {
            view.hidden = view.hidden.includes(c) ? view.hidden.filter((h) => h !== c) : [...view.hidden, c];
            saveView(spec.id, view);
            render();
          },
        })),
      );
      const counts = new Map<string, number>();
      for (const r of rows) if (r.note) counts.set(r.note, (counts.get(r.note) ?? 0) + 1);
      const filter = toolMenu("filter", view.filter ? `Filter: ${view.filter}` : "Filter", [
        { label: `${view.filter ? "   " : "✓ "}All`, run: () => ((view.filter = null), (view.page = 0), render()) },
        ...[...counts].map(([note, count]) => ({
          label: `${view.filter === note ? "✓ " : "   "}${note} (${count})`,
          run: () => ((view.filter = note), (view.page = 0), render()),
        })),
      ]);
      if (view.filter) filter.classList.add("on");
      const exportBtn = toolButton("export", "Export");
      exportBtn.onclick = () => {
        const head = [spec.nameHead ?? "Sender", "Addresses", ...columns.map(headOf)];
        const cellText = (r: Row, c: ColumnId) =>
          c === "note" ? r.note
          : c === "read" ? `${Math.round(r.opened * 100)}%`
          : c === "perMonth" ? perMonthText(r.perMonth)
          : c === "emails" ? String(r.count)
          : c === "size" ? formatBytes(r.bytes)
          : r.latest ? new Date(r.latest).toISOString().slice(0, 10) : "";
        const body = shownRows.map((r) => [senderName(r.lead), r.senders.map((s) => s.address).join(" "), ...columns.map((c) => cellText(r, c))]);
        // The BOM tells Excel the file is UTF-8.
        const csv = "﻿" + [head, ...body].map((line) => line.map(csvField).join(",")).join("\r\n") + "\r\n";
        downloadBytes(`cluster-${spec.id}.csv`, csv, "text/csv;charset=utf-8");
      };
      spec.tools.replaceChildren(search, searchBtn, customize, filter, exportBtn);
      if (focusSearch) {
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      }
    }

    // ── Selection bar ──
    const bar = el("div", "ct-selbar");
    bar.hidden = ticked.length === 0;
    bar.append(el("b", "", `${ticked.length} selected`), el("span", "", `${n.toLocaleString()} emails`));
    const clear = el("button", "ct-clear", "Clear");
    clear.type = "button";
    clear.onclick = () => {
      selected.clear();
      render();
    };
    const slot = el("span", "ct-sel-slot");
    const go = el("button", "btn", spec.verb ?? "Trash");
    go.type = "button";
    if (spec.barIds) {
      slot.id = spec.barIds.slot;
      go.id = spec.barIds.button;
    }
    go.onclick = () => {
      const merged = new Map<ProviderId, string[]>();
      for (const r of ticked) for (const [p, ids] of r.ids) merged.set(p, [...(merged.get(p) ?? []), ...ids]);
      spec.act(merged, ticked.flatMap((r) => r.senders), slot, render);
    };
    slot.append(go);
    bar.append(clear, slot);

    // ── Header ──
    const table = el("table", "ct-table");
    const head = el("tr");
    const all = el("input", "check");
    all.type = "checkbox";
    all.setAttribute("aria-label", "Select all");
    const visibleTickable = shownRows.filter((r) => tickable.has(r));
    const tickedVisible = visibleTickable.filter((r) => selected.has(r.key)).length;
    all.checked = visibleTickable.length > 0 && tickedVisible === visibleTickable.length;
    all.indeterminate = tickedVisible > 0 && tickedVisible < visibleTickable.length;
    all.disabled = visibleTickable.length === 0;
    all.onchange = () => {
      for (const r of visibleTickable) {
        if (all.checked) selected.add(r.key);
        else selected.delete(r.key);
      }
      render();
    };
    const th0 = el("th", "ct-tick");
    th0.append(all);
    head.append(th0);
    const sortHead = (key: SortKey, text: string, cls: string) => {
      const th = el("th", cls);
      const b = el("button", "ct-sort", text);
      b.type = "button";
      const on = view.sort === key;
      th.setAttribute("aria-sort", on ? (view.desc ? "descending" : "ascending") : "none");
      if (on) {
        b.classList.add("on");
        b.append(el("span", "ct-arrow", view.desc ? "⌄" : "⌃"));
      }
      b.onclick = () => {
        // Numbers start biggest first, names A to Z.
        view.desc = on ? !view.desc : key !== "name" && key !== "note";
        view.sort = key;
        view.page = 0;
        render();
      };
      th.append(b);
      return th;
    };
    head.append(sortHead("name", spec.nameHead ?? "Sender", "ct-c-who"));
    for (const c of columns) head.append(sortHead(c, headOf(c), `ct-c-${c} col-${c}${NUMERIC.has(c) ? " num" : ""}`));
    const thead = el("thead");
    thead.append(head);

    // ── Rows ──
    const body = el("tbody");
    for (const r of pageRowsNow) {
      const tr = el("tr", "row-link");
      const td0 = el("td", "ct-tick");
      if (tickable.has(r)) {
        const box = el("input", "check");
        box.type = "checkbox";
        box.checked = selected.has(r.key);
        box.setAttribute("aria-label", `Select ${senderName(r.lead)}`);
        box.onchange = () => {
          if (box.checked) selected.add(r.key);
          else selected.delete(r.key);
          render();
        };
        td0.append(box);
      }
      const who = el("td", "ct-who");
      // A button, so Tab reaches the row and Enter opens Details.
      const name = el("button", "ct-name");
      name.type = "button";
      name.onclick = () => spec.openRow(r.key, r.lead);
      name.append(senderTile(r.lead.address, r.lead.displayName, "sz-34"), el("b", "", senderName(r.lead)));
      const badge = spec.badge?.(r.senders);
      if (badge) name.append(el("span", "ct-dim ct-badge", badge));
      who.append(name);
      tr.append(td0, who);
      for (const c of columns) {
        let cell: HTMLElement;
        if (c === "note") cell = el("td", "ct-dim ct-reason", r.note);
        else if (c === "read") {
          const pct = Math.round(r.opened * 100);
          cell = el("td", "ct-read");
          const track = el("span", "ct-bar");
          const fill = el("i");
          fill.style.width = `${pct}%`;
          track.append(fill);
          cell.append(track, el("b", "", `${pct}%`));
        } else if (c === "perMonth") cell = el("td", "num ct-dim", perMonthText(r.perMonth));
        else if (c === "emails") cell = emailsCell(r.count);
        else if (c === "size") cell = el("td", "num ct-dim", r.bytes ? formatBytes(r.bytes) : "");
        else cell = el("td", "ct-dim", r.latest ? lastReceived(r.latest, now) : "");
        // col-* lets the table drop a column when it gets narrow (CSS).
        cell.classList.add(`col-${c}`);
        tr.append(cell);
      }
      tr.onclick = (e) => {
        if (!(e.target instanceof Element && e.target.closest("input, label, button"))) spec.openRow(r.key, r.lead);
      };
      body.append(tr);
    }
    table.append(thead, body);
    const wrap = el("div", "scroll-x");
    wrap.append(table);

    // ── Footer: how many, pages, rows per page ──
    const foot = el("div", "ct-foot");
    const showing = el("span", "ct-showing", "Showing ");
    showing.append(el("b", "", pageRowsNow.length.toLocaleString()), ` of ${shownRows.length.toLocaleString()}`);
    const pager = el("nav", "ct-pager");
    pager.setAttribute("aria-label", "Pages");
    const go2 = (p: number) => () => {
      view.page = p;
      render();
    };
    const prev = el("button", "ct-page", "‹");
    prev.type = "button";
    prev.setAttribute("aria-label", "Previous page");
    prev.disabled = view.page === 0;
    prev.onclick = go2(view.page - 1);
    pager.append(prev);
    for (const p of pageList(view.page, pages)) {
      if (p === "…") {
        pager.append(el("span", "ct-gap", "…"));
        continue;
      }
      const b = el("button", "ct-page", String(p + 1));
      b.type = "button";
      if (p === view.page) b.setAttribute("aria-current", "page");
      b.onclick = go2(p);
      pager.append(b);
    }
    const next = el("button", "ct-page", "›");
    next.type = "button";
    next.setAttribute("aria-label", "Next page");
    next.disabled = view.page >= pages - 1;
    next.onclick = go2(view.page + 1);
    pager.append(next);
    const perWrap = el("label", "ct-per", "Rows per page");
    const per = el("select");
    for (const v of PER_PAGE) per.append(Object.assign(el("option", "", String(v)), { value: String(v), selected: v === view.per }));
    per.onchange = () => {
      view.per = Number(per.value);
      view.page = 0;
      saveView(spec.id, view);
      render();
    };
    perWrap.append(per);
    foot.append(showing, pager, perWrap);

    const parts: HTMLElement[] = [bar, wrap];
    if (shownRows.length === 0) parts.push(el("p", "hint ct-empty", rows.length === 0 ? "Nothing to clear." : "Nothing matches."));
    if (rows.length > 0) parts.push(foot);
    root.replaceChildren(...parts);
  };
  render();
  return rows.length;
}
