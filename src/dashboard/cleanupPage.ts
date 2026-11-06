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
    for (const [t, c] of [["Sender", ""], ["Reason", ""], ["Emails", "num"], ["Last received", ""], ["Opened", "num"]])
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
      who.append(senderTile(r.lead.address, r.lead.displayName, "sz-26"), el("b", "", senderName(r.lead)));
      const reason = el("td");
      reason.append(el("span", "ct-pill", reasons.get(r.key) ?? ""));
      const latest = Math.max(0, ...r.senders.flatMap((s) => s.messages.map((m) => m.receivedAt)));
      const pct = Math.round(r.opened * 100);
      tr.append(
        td0,
        who,
        reason,
        el("td", "num", r.count.toLocaleString()),
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
