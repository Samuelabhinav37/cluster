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

  const back = el("button", "cu-back", "‹ Clean up");
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
