// Details: a sheet in the right quarter of the window where you work on the
// mail behind any number (docs/dashboard-plan.md; approved mockup
// research/2026-10-27-home-cleanup-mockup.html). Every count you click opens
// it already filtered. A chart narrows by week, then by day; filters show as
// chips you remove; tick rows and act from the bar at the bottom. Actions are
// supplied by the dashboard, which owns the protection checks, confirm,
// Undo and the activity log. Built with DOM calls only, no markup strings.

import type { ProviderId } from "../lib/providers/emailProvider";
import type { SenderSummary } from "../lib/senderModel";
import { SMART_VIEWS } from "../lib/smartViews";
import { companyName, senderName } from "../lib/senderListView";
import { HOME_KINDS, kindOf, type HomeKind } from "./homeDashboard";
import { senderTile } from "./senderTile";

const DAY = 24 * 60 * 60 * 1000;
const WEEKS = 8;
const PAGE = 60;

export interface DetailMessage {
  id: string;
  provider: ProviderId;
  /** The row this message files under: its company's key, or its sender's own key. */
  senderKey: string;
  name: string;
  address: string;
  subject: string;
  at: number;
  unread: boolean;
  kind: HomeKind;
  isProtected: boolean;
  /** Ids of the smart views (smartViews.ts) this message is in. */
  views: string[];
}

export interface DetailSender {
  /** Company key when the addresses fold into one, else the sender key. */
  key: string;
  provider: ProviderId;
  name: string;
  /** The address carrying the most mail (its logo stands for the row). */
  address: string;
  /** How many addresses fold into this row. */
  addresses: number;
  kind: HomeKind;
  emails: number;
  opened: number;
  last: number;
  members: SenderSummary[];
}

/** Which row a sender files under. Default: its own row. */
export type RowKeyOf = (sender: SenderSummary) => string;
const ownRow: RowKeyOf = (s) => s.key;

export interface DetailsFilter {
  view?: "emails" | "senders";
  kind?: HomeKind | null;
  senderKey?: string | null;
  week?: number | null;
  day?: number | null;
  never?: boolean;
  /** A smart view id, e.g. "large". */
  smart?: string | null;
  q?: string;
}

/** Tell the panel what an action did, so it can show it before the next scan does. */
export interface Settle {
  /** These left the inbox. */
  gone(ids: string[]): void;
  /** Undo brought them back. */
  back(ids: string[]): void;
}

export interface DetailsActions {
  /** Ask, then move these to Trash. Renders its confirm (and Undo) into `slot`. */
  trash(messages: DetailMessage[], slot: HTMLElement, reset: () => void, settle: Settle): void;
  /** Ask, then archive these. Missing when no connected provider can. */
  archive?(messages: DetailMessage[], slot: HTMLElement, reset: () => void, settle: Settle): void;
  /** Pin these so no rule touches them. Missing when no connected provider can. */
  pin?(messages: DetailMessage[], slot: HTMLElement): void;
  /** Ask, then mute these senders. Missing when no connected provider can. */
  mute?(senders: SenderSummary[], slot: HTMLElement, reset: () => void, settle: Settle): void;
}

type State = Required<Omit<DetailsFilter, "senderKey" | "kind" | "week" | "day" | "smart">> & {
  smart: string | null;
  kind: HomeKind | null;
  senderKey: string | null;
  week: number | null;
  day: number | null;
};

const BLANK: State = {
  view: "emails",
  kind: null,
  senderKey: null,
  week: null,
  day: null,
  never: false,
  smart: null,
  q: "",
};

/** Messages, newest first, from the whole inbox. */
export function detailMessages(senders: readonly SenderSummary[], rowKeyOf: RowKeyOf = ownRow): DetailMessage[] {
  const out: DetailMessage[] = [];
  for (const s of senders)
    for (const m of s.messages)
      out.push({
        id: m.id,
        provider: s.provider,
        senderKey: rowKeyOf(s),
        name: senderName(s),
        address: s.address,
        subject: m.subject ?? "",
        at: m.receivedAt,
        unread: m.unread,
        kind: kindOf(m),
        isProtected: m.isProtected,
        views: SMART_VIEWS.filter((v) => v.match(m)).map((v) => v.id),
      });
  return out.sort((a, b) => b.at - a.at);
}

/** One row per company (or per sender outside one): volume, how much was opened, its main kind. */
export function detailSenders(senders: readonly SenderSummary[], rowKeyOf: RowKeyOf = ownRow): DetailSender[] {
  const rows = new Map<string, SenderSummary[]>();
  for (const s of senders) {
    if (s.messages.length === 0) continue;
    const key = rowKeyOf(s);
    rows.set(key, [...(rows.get(key) ?? []), s]);
  }
  return [...rows]
    .map(([key, members]) => {
      const all = members.flatMap((s) => s.messages);
      const tally = new Map<HomeKind, number>();
      for (const m of all) tally.set(kindOf(m), (tally.get(kindOf(m)) ?? 0) + 1);
      const kind = [...tally].sort((a, b) => b[1] - a[1])[0][0];
      const top = [...members].sort((a, b) => b.messages.length - a.messages.length)[0];
      return {
        key,
        provider: top.provider,
        name: companyName({ key, senders: members }),
        address: top.address,
        addresses: members.length,
        kind,
        emails: all.length,
        opened: all.filter((m) => !m.unread).length,
        last: Math.max(...all.map((m) => m.receivedAt)),
        members,
      };
    })
    .sort((a, b) => b.emails - a.emails);
}

/** Week `w` (0 oldest, 7 the last seven days) and day-in-week of a time. */
export function weekOf(at: number, now: number): { week: number; day: number } {
  const start = startOfDay(now) - (WEEKS * 7 - 1) * DAY;
  const days = Math.floor((startOfDay(at) - start) / DAY);
  return { week: Math.floor(days / 7), day: days % 7 };
}

/** Arrivals per weekday (rows, Monday first) and local hour (columns). */
export function arrivalGrid(messages: readonly DetailMessage[]): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const m of messages) {
    const d = new Date(m.at);
    grid[(d.getDay() + 6) % 7][d.getHours()] += 1;
  }
  return grid;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const kindLabel = (k: HomeKind) => HOME_KINDS.find((x) => x.key === k)!.label;
const fmtDay = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const fmtShort = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = h("button", cls, text);
  b.type = "button";
  b.onclick = onClick;
  return b;
}

export interface DetailsPanel {
  open(filter?: DetailsFilter): void;
  close(): void;
  isOpen(): boolean;
  /** Minimize or bring back for one screen, keeping the filters and the saved choice. */
  rest(minimized: boolean): void;
  /** New scan results: redraw with the same filters. */
  update(senders: readonly SenderSummary[]): void;
}

export const DETAILS_PREF = "cluster.details";
const remember = (v: "open" | "min") => {
  try {
    localStorage.setItem(DETAILS_PREF, v);
  } catch {
    // Storage blocked: the panel just forgets between visits.
  }
};

export function initDetailsPanel(
  root: HTMLElement,
  actions: DetailsActions,
  now = () => Date.now(),
  rowKeyOf: RowKeyOf = ownRow,
): DetailsPanel {
  let raw: readonly SenderSummary[] = [];
  let messages: DetailMessage[] = [];
  let senders: DetailSender[] = [];
  // Acted on here but still in the index until the next sync picks it up.
  const gone = new Set<string>();
  const rebuild = () => {
    const live = raw.map((s) => ({ ...s, messages: s.messages.filter((m) => !gone.has(m.id)) }));
    messages = detailMessages(live, rowKeyOf);
    senders = detailSenders(live, rowKeyOf);
  };
  const settle: Settle = {
    gone(ids) {
      for (const id of ids) gone.add(id);
      selected = new Set();
      rebuild();
      render(true);
    },
    back(ids) {
      for (const id of ids) gone.delete(id);
      rebuild();
      render(true);
    },
  };
  let st: State = { ...BLANK };
  let selected = new Set<string>();
  let expanded: string | null = null;
  let sortBy: "emails" | "opened" | "last" | "name" = "emails";
  let sortDir = -1;
  let limit = PAGE;
  let wide = false;

  root.replaceChildren();
  const head = h("header", "details-head");
  const tabs = h("div", "seg");
  tabs.setAttribute("role", "group");
  tabs.setAttribute("aria-label", "Show");
  const spacer = h("span", "spacer");
  const wideBtn = button("icon-btn", "⇤", () => {
    wide = !wide;
    root.classList.toggle("wide", wide);
    wideBtn.textContent = wide ? "⇥" : "⇤";
    wideBtn.setAttribute("aria-label", wide ? "Narrower" : "Wider");
    render();
  });
  wideBtn.setAttribute("aria-label", "Wider");
  const closeBtn = button("icon-btn", "⇥", () => panel.close());
  closeBtn.setAttribute("aria-label", "Minimize details");
  // Minimized, the panel stays as a strip at the edge; clicking it opens it again.
  const tab = button("details-tab", "Details", () => panel.open());
  head.append(tabs, spacer, wideBtn, closeBtn);

  const search = h("input", "details-search");
  search.type = "search";
  search.placeholder = "Search";
  search.setAttribute("aria-label", "Search details");
  search.oninput = () => {
    st.q = search.value;
    limit = PAGE;
    render();
  };
  const chips = h("div", "chips");
  const chart = h("div", "details-chart");
  const wrap = h("div", "sheet-wrap");
  const table = h("table", "sheet");
  wrap.append(table);
  const bar = h("div", "selbar");
  bar.hidden = true;
  root.append(tab, head, search, chips, chart, wrap, bar);
  root.hidden = false;
  root.classList.add("min");

  const set = (patch: Partial<State>) => {
    st = { ...st, ...patch };
    selected = new Set();
    expanded = null;
    limit = PAGE;
    render();
  };

  const inWeek = (m: DetailMessage) => {
    if (st.week === null) return true;
    const w = weekOf(m.at, now());
    return w.week === st.week && (st.day === null || w.day === st.day);
  };
  const neverKeys = () => new Set(senders.filter((s) => s.opened === 0).map((s) => s.key));

  /** Messages matching every filter except time, which the chart splits. */
  function baseMessages(): DetailMessage[] {
    const q = st.q.toLowerCase();
    const never = st.never ? neverKeys() : null;
    return messages.filter(
      (m) =>
        (!st.kind || m.kind === st.kind) &&
        (!st.senderKey || m.senderKey === st.senderKey) &&
        (!never || never.has(m.senderKey)) &&
        (!st.smart || m.views.includes(st.smart)) &&
        (!q || `${m.name} ${m.address} ${m.subject}`.toLowerCase().includes(q)),
    );
  }

  function senderRows(): DetailSender[] {
    const q = st.q.toLowerCase();
    const keys =
      st.week === null
        ? null
        : new Set(
            baseMessages()
              .filter(inWeek)
              .map((m) => m.senderKey),
          );
    const rows = senders.filter(
      (s) =>
        (!st.kind || s.kind === st.kind) &&
        (!st.never || s.opened === 0) &&
        (!keys || keys.has(s.key)) &&
        (!q || `${s.name} ${s.address}`.toLowerCase().includes(q)),
    );
    const val = (s: DetailSender) =>
      sortBy === "opened" ? s.opened / s.emails : sortBy === "name" ? s.name.toLowerCase() : s[sortBy];
    return rows.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sortDir);
  }

  function renderTabs() {
    tabs.replaceChildren(
      ...(["emails", "senders"] as const).map((v) => {
        const b = button("", v === "emails" ? "Emails" : "Senders", () => set({ view: v }));
        b.setAttribute("aria-pressed", String(st.view === v));
        return b;
      }),
    );
  }

  function renderChips() {
    const on: Array<[string, Partial<State>]> = [];
    if (st.kind) on.push([kindLabel(st.kind), { kind: null }]);
    if (st.senderKey)
      on.push([senders.find((s) => s.key === st.senderKey)?.name ?? "Sender", { senderKey: null }]);
    if (st.never) on.push(["Never opened", { never: false }]);
    const smart = SMART_VIEWS.find((v) => v.id === st.smart);
    if (smart) on.push([smart.label, { smart: null }]);
    if (st.week !== null)
      on.push([
        st.week === WEEKS - 1 ? "This week" : `Week of ${fmtShort(weekStart(st.week))}`,
        { week: null, day: null },
      ]);
    if (st.day !== null && st.week !== null)
      on.push([
        fmtDay(weekStart(st.week) + st.day * DAY)
          .split(" ")[0]
          .replace(",", ""),
        { day: null },
      ]);
    const quick: Array<[string, Partial<State>]> = [];
    if (!st.never) quick.push(["Never opened", { never: true }]);
    if (!st.kind) quick.push(["Promotions", { kind: "promo" }]);
    if (st.week === null) quick.push(["This week", { week: WEEKS - 1 }]);
    // The views the four kinds don't already cover.
    if (!st.smart)
      for (const v of SMART_VIEWS.filter((v) => v.id === "older-1y" || v.id === "large"))
        quick.push([v.label, { smart: v.id, view: "emails" }]);
    chips.replaceChildren(
      ...on.map(([label, patch]) => {
        const b = button("chip on", `${label} ✕`, () => set(patch));
        b.setAttribute("aria-label", `Remove filter ${label}`);
        return b;
      }),
      ...quick.map(([label, patch]) => button("chip", `+ ${label}`, () => set(patch))),
    );
  }

  const weekStart = (w: number) => startOfDay(now()) - (WEEKS * 7 - 1) * DAY + w * 7 * DAY;

  /** Columns as buttons: weeks, or the chosen week's seven days. */
  function renderChart() {
    const base = baseMessages();
    const bars: Array<{ n: number; label: string; name: string; on: boolean; patch: Partial<State> }> = [];
    if (st.week === null) {
      const counts = new Array<number>(WEEKS).fill(0);
      for (const m of base) {
        const w = weekOf(m.at, now()).week;
        if (w >= 0 && w < WEEKS) counts[w] += 1;
      }
      counts.forEach((n, w) =>
        bars.push({
          n,
          label: fmtShort(weekStart(w)),
          name: `Week of ${fmtShort(weekStart(w))}`,
          on: false,
          patch: { week: w },
        }),
      );
    } else {
      const counts = new Array<number>(7).fill(0);
      for (const m of base) {
        const w = weekOf(m.at, now());
        if (w.week === st.week) counts[w.day] += 1;
      }
      counts.forEach((n, d) => {
        const t = weekStart(st.week!) + d * DAY;
        bars.push({
          n,
          label: new Date(t).toLocaleDateString(undefined, { weekday: "short" }),
          name: fmtDay(t),
          on: st.day === d,
          patch: { day: st.day === d ? null : d },
        });
      });
    }
    const max = Math.max(1, ...bars.map((b) => b.n));
    const caption = h(
      "div",
      "chart-head",
      st.week === null ? "Per week" : `Week of ${fmtShort(weekStart(st.week))}`,
    );
    const cols = h("div", "cols");
    for (const b of bars) {
      const col = button(`col${b.on ? " on" : ""}${st.day !== null && !b.on ? " dim" : ""}`, "", () =>
        set(b.patch),
      );
      col.setAttribute("aria-label", `${b.name}: ${b.n} ${b.n === 1 ? "email" : "emails"}`);
      col.title = `${b.name}: ${b.n}`;
      const track = h("span", "track");
      const fill = h("span", "fill");
      fill.style.height = `${Math.max(3, (b.n / max) * 100)}%`;
      track.append(fill);
      col.append(track, h("span", "lbl", b.label));
      cols.append(col);
    }
    chart.replaceChildren(caption, cols);
    if (st.view === "emails") chart.append(...heatmap(base.filter(inWeek)));
  }

  /** When mail lands: a day by hour grid, darker where more arrives. */
  function heatmap(messages: DetailMessage[]): HTMLElement[] {
    if (messages.length === 0) return [];
    const grid = arrivalGrid(messages);
    const max = Math.max(...grid.flat());
    const peak = grid.flat().indexOf(max);
    const monday = new Date(2024, 0, 1); // a Monday, only for weekday names
    const dayName = (r: number) =>
      new Date(monday.getTime() + r * DAY).toLocaleDateString(undefined, { weekday: "short" });
    const hourName = (c: number) => new Date(2024, 0, 1, c).toLocaleTimeString(undefined, { hour: "numeric" });
    const busiest = `${dayName(Math.floor(peak / 24))} around ${hourName(peak % 24)}`;
    const cells = h("div", "heat");
    cells.setAttribute("role", "img");
    cells.setAttribute("aria-label", `Most mail arrives ${busiest}`);
    grid.forEach((row, r) => {
      cells.append(h("span", "heat-day", dayName(r).slice(0, 1)));
      row.forEach((n, c) => {
        const cell = h("i");
        if (n > 0) cell.style.opacity = String(0.15 + (0.85 * n) / max);
        cell.title = `${dayName(r)} ${hourName(c)}: ${n}`;
        cells.append(cell);
      });
    });
    return [h("div", "chart-head", `Most arrives ${busiest}`), cells];
  }

  function tick(id: string, label: string, disabled = false): HTMLInputElement {
    const box = h("input", "tick");
    box.type = "checkbox";
    box.checked = selected.has(id);
    box.disabled = disabled;
    box.setAttribute("aria-label", label);
    box.onclick = (e) => e.stopPropagation();
    box.onchange = () => {
      if (box.checked) selected.add(id);
      else selected.delete(id);
      box.closest("tr")?.classList.toggle("sel", box.checked);
      renderBar();
    };
    return box;
  }

  function headRow(cells: Array<HTMLElement | string>): HTMLTableSectionElement {
    const thead = h("thead");
    const tr = h("tr");
    for (const c of cells) {
      const th = h("th");
      if (typeof c === "string") th.textContent = c;
      else th.append(c);
      tr.append(th);
    }
    thead.append(tr);
    return thead;
  }

  function selectAll(ids: string[]): HTMLInputElement {
    const all = h("input", "tick");
    all.type = "checkbox";
    all.setAttribute("aria-label", "Select all shown");
    all.checked = ids.length > 0 && ids.every((id) => selected.has(id));
    all.onchange = () => {
      for (const id of ids) {
        if (all.checked) selected.add(id);
        else selected.delete(id);
      }
      render();
    };
    return all;
  }

  const cols = () => (wide ? 5 : 3);

  function renderEmails() {
    const rows = baseMessages().filter(inWeek);
    const shown = rows.slice(0, limit);
    const pickable = shown.filter((m) => !m.isProtected).map((m) => m.id);
    table.className = "sheet emails";
    table.replaceChildren(
      headRow([selectAll(pickable), "From", "Subject", ...(wide ? ["Kind", "When"] : [])]),
    );
    const body = h("tbody");
    let lastDay = "";
    const perDay = new Map<string, number>();
    for (const m of rows) perDay.set(fmtDay(m.at), (perDay.get(fmtDay(m.at)) ?? 0) + 1);
    for (const m of shown) {
      const day = fmtDay(m.at);
      if (day !== lastDay) {
        const tr = h("tr", "group");
        const td = h("td", "", day);
        td.colSpan = cols();
        td.append(h("span", "", String(perDay.get(day))));
        tr.append(td);
        body.append(tr);
        lastDay = day;
      }
      const tr = h("tr", `${selected.has(m.id) ? "sel " : ""}${m.unread ? "unread" : ""}`);
      const c = h("td", "c");
      c.append(tick(m.id, `Select ${m.subject || "email"} from ${m.name}`, m.isProtected));
      if (m.isProtected) c.title = "Protected: starred, important or from someone you know";
      const from = h("td", "from");
      const who = button("who", m.name, () => set({ senderKey: m.senderKey }));
      who.title = `Only ${m.address}`;
      from.append(senderTile(m.address, m.name, "sz-26"), who);
      const subj = h("td", "subj", m.subject || "(no subject)");
      subj.title = m.subject;
      tr.append(c, from, subj);
      if (wide)
        tr.append(
          h("td", "", kindLabel(m.kind)),
          h("td", "", new Date(m.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })),
        );
      tr.onclick = () => {
        const box = c.querySelector("input")!;
        if (box.disabled) return;
        box.checked = !box.checked;
        box.dispatchEvent(new Event("change"));
      };
      body.append(tr);
    }
    if (shown.length === 0) body.append(emptyRow());
    table.append(body);
    if (rows.length > limit) {
      const foot = h("tfoot");
      const tr = h("tr");
      const td = h("td");
      td.colSpan = cols();
      td.append(
        button(
          "link",
          `Show ${Math.min(PAGE, rows.length - limit)} more of ${rows.length.toLocaleString()}`,
          () => {
            limit += PAGE;
            render();
          },
        ),
      );
      tr.append(td);
      foot.append(tr);
      table.append(foot);
    }
  }

  function emptyRow(): HTMLTableRowElement {
    const tr = h("tr");
    const td = h("td", "empty", "Nothing here.");
    td.colSpan = cols() + 1;
    tr.append(td);
    return tr;
  }

  function renderSenders() {
    const rows = senderRows();
    const top = Math.max(1, ...rows.map((s) => s.emails));
    table.className = "sheet senders";
    const sortHead = (label: string, key: typeof sortBy) => {
      const b = button("sort", `${label}${sortBy === key ? (sortDir > 0 ? " ↑" : " ↓") : ""}`, () => {
        sortDir = sortBy === key ? -sortDir : -1;
        sortBy = key;
        render();
      });
      return b;
    };
    table.replaceChildren(
      headRow([
        selectAll(rows.map((s) => s.key)),
        sortHead("Sender", "name"),
        sortHead("Emails", "emails"),
        sortHead("Opened", "opened"),
        ...(wide ? ["Kind", sortHead("Last", "last")] : []),
      ]),
    );
    const body = h("tbody");
    for (const s of rows) {
      const open = expanded === s.key;
      const tr = h("tr", `${selected.has(s.key) ? "sel " : ""}expandable`);
      tr.setAttribute("aria-expanded", String(open));
      const c = h("td", "c");
      c.append(tick(s.key, `Select ${s.name}`));
      const from = h("td", "from");
      from.append(
        h("span", "caret", open ? "▾" : "▸"),
        senderTile(s.address, s.name, "sz-26"),
        h("span", "who", s.name),
      );
      from.title = s.members.map((m) => m.address).join(", ");
      const n = h("td", "num");
      const cell = h("span", "cellbar");
      const fill = h("i");
      fill.style.width = `${(s.emails / top) * 100}%`;
      cell.append(fill);
      n.append(cell, String(s.emails));
      const o = h("td", "num", s.opened === 0 ? "None" : `${Math.round((s.opened / s.emails) * 100)}%`);
      tr.append(c, from, n, o);
      if (wide) tr.append(h("td", "", kindLabel(s.kind)), h("td", "", fmtShort(s.last)));
      tr.onclick = () => {
        expanded = open ? null : s.key;
        render();
      };
      body.append(tr);
      if (open) {
        const latest = messages.filter((m) => m.senderKey === s.key).slice(0, 5);
        for (const m of latest) {
          const sub = h("tr", "sub");
          const td = h("td");
          td.colSpan = cols() + 1;
          td.append(h("span", "when", fmtShort(m.at)), m.subject || "(no subject)");
          sub.append(td);
          body.append(sub);
        }
        const more = h("tr", "sub");
        const td = h("td");
        td.colSpan = cols() + 1;
        td.append(
          button("link", `All ${s.emails} from ${s.name}`, () => set({ view: "emails", senderKey: s.key })),
        );
        more.append(td);
        body.append(more);
      }
    }
    if (rows.length === 0) body.append(emptyRow());
    table.append(body);
  }

  /** `keepResult`: a rescan leaves a confirm step or its result (and Undo) in place. */
  function renderBar(keepResult = false) {
    if (keepResult && bar.classList.contains("confirm-slot")) return;
    bar.classList.remove("confirm-slot");
    const n = selected.size;
    bar.hidden = n === 0;
    if (n === 0) return;
    const reset = () => renderBar();
    const label = h("b", "", `${n} selected`);
    const clear = button("link", "Clear", () => {
      selected.clear();
      render();
    });
    const acts: HTMLButtonElement[] = [];
    if (st.view === "emails") {
      const picked = messages.filter((m) => selected.has(m.id));
      if (actions.archive) {
        const archive = actions.archive;
        acts.push(button("btn btn-sm", "Archive", () => archive(picked, bar, reset, settle)));
      }
      if (actions.pin) {
        const pin = actions.pin;
        acts.push(button("btn btn-sm", "Pin", () => pin(picked, bar)));
      }
      acts.push(
        button("btn btn-accent-solid btn-sm", "Move to Trash", () =>
          actions.trash(picked, bar, reset, settle),
        ),
      );
    } else {
      const picked = senders.filter((s) => selected.has(s.key));
      const mail = messages.filter((m) => selected.has(m.senderKey) && !m.isProtected);
      if (actions.mute) {
        const mute = actions.mute;
        acts.push(
          button("btn btn-sm", "Mute", () =>
            mute(
              picked.flatMap((s) => s.members),
              bar,
              reset,
              settle,
            ),
          ),
        );
      }
      acts.push(
        button("btn btn-accent-solid btn-sm", "Trash their mail", () =>
          actions.trash(mail, bar, reset, settle),
        ),
      );
    }
    bar.replaceChildren(label, clear, h("span", "spacer"), ...acts);
  }

  function render(fromScan = false) {
    root.dataset.view = st.view;
    renderTabs();
    renderChips();
    if (st.view === "emails") {
      chart.hidden = false;
      renderChart();
      renderEmails();
    } else {
      chart.hidden = st.week === null;
      if (!chart.hidden) renderChart();
      renderSenders();
    }
    renderBar(fromScan);
  }

  const panel: DetailsPanel = {
    open(filter = {}) {
      st = { ...BLANK, ...filter } as State;
      // Callers pass one address's key; the panel lists that address's whole company.
      const member = st.senderKey ? raw.find((s) => s.key === st.senderKey) : undefined;
      if (member) st.senderKey = rowKeyOf(member);
      selected = new Set();
      expanded = null;
      limit = PAGE;
      search.value = st.q;
      root.classList.remove("min");
      document.body.classList.add("details-open");
      remember("open");
      render();
    },
    close() {
      root.classList.add("min");
      document.body.classList.remove("details-open");
      remember("min");
    },
    isOpen: () => !root.classList.contains("min"),
    rest(minimized) {
      root.classList.toggle("min", minimized);
      document.body.classList.toggle("details-open", !minimized);
      if (!minimized) render();
    },
    update(next) {
      raw = next;
      const present = new Set(next.flatMap((s) => s.messages.map((m) => m.id)));
      for (const id of gone) if (!present.has(id)) gone.delete(id);
      rebuild();
      const keep = new Set([...messages.map((m) => m.id), ...senders.map((s) => s.key)]);
      for (const id of selected) if (!keep.has(id)) selected.delete(id);
      if (panel.isOpen()) render(true);
    },
  };

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.isOpen() && !(e.target as HTMLElement).closest?.(".confirm-slot"))
      panel.close();
  });

  return panel;
}

/** Which providers' mail is in a selection, for the confirm text. */
export function idsByProvider(messages: readonly DetailMessage[]): Map<ProviderId, string[]> {
  const out = new Map<ProviderId, string[]>();
  for (const m of messages) {
    if (m.isProtected) continue;
    out.set(m.provider, [...(out.get(m.provider) ?? []), m.id]);
  }
  return out;
}
