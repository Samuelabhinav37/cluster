// Home as a dashboard: six tiles that answer "what's in my inbox", "what
// can I get rid of", "how should new mail be sorted" and "is anything
// dangerous". Each tile has one number, one chart and one action (audit
// section 4, research/2026-10-16-brutal-audit.md). The facts are computed
// here from the scan; the dashboard only supplies totals it already has.

import type { InboxTab, SenderSummary } from "../lib/senderModel";
import { senderVolume } from "../lib/census";
import type { CompanyGroup } from "../lib/senderListView";

export const TAB_ORDER: InboxTab[] = ["primary", "promotions", "social", "updates", "forums"];
export const TAB_NAMES: Record<InboxTab, string> = {
  primary: "Primary",
  promotions: "Promotions",
  social: "Social",
  updates: "Updates",
  forums: "Forums",
};

/** Messages per Gmail tab. Null when no message carries a tab (Outlook). */
export function mailByTab(senders: readonly SenderSummary[]): Record<InboxTab, number> | null {
  const counts: Record<InboxTab, number> = { primary: 0, promotions: 0, social: 0, updates: 0, forums: 0 };
  let any = false;
  for (const s of senders) {
    for (const m of s.messages) {
      if (!m.tab) continue;
      counts[m.tab] += 1;
      any = true;
    }
  }
  return any ? counts : null;
}

export interface WeekRate {
  /** Start of the week, epoch ms. */
  start: number;
  /** Share of that week's mail that was opened, 0 to 1; null with no mail. */
  rate: number | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Share of read mail overall and for each of the last `weeks` weeks, oldest first. */
export function readRate(
  senders: readonly SenderSummary[],
  now: number,
  weeks = 8,
): { overall: number | null; byWeek: WeekRate[] } {
  const read = new Array<number>(weeks).fill(0);
  const total = new Array<number>(weeks).fill(0);
  let allRead = 0;
  let all = 0;
  for (const s of senders) {
    for (const m of s.messages) {
      all += 1;
      if (!m.unread) allRead += 1;
      const ago = Math.floor((now - m.receivedAt) / WEEK_MS);
      if (ago < 0 || ago >= weeks) continue;
      const i = weeks - 1 - ago;
      total[i] += 1;
      if (!m.unread) read[i] += 1;
    }
  }
  return {
    overall: all > 0 ? allRead / all : null,
    byWeek: total.map((n, i) => ({
      start: now - (weeks - i) * WEEK_MS,
      rate: n > 0 ? read[i] / n : null,
    })),
  };
}

/** Share of mail whose sender passed DKIM or DMARC. Null with no mail. */
export function verifiedShare(senders: readonly SenderSummary[]): number | null {
  let verified = 0;
  let all = 0;
  for (const s of senders) {
    const n = s.messages.length;
    all += n;
    if (s.authVerdicts.dkim === "pass" || s.authVerdicts.dmarc === "pass") verified += n;
  }
  return all > 0 ? verified / all : null;
}

export interface TopCompany {
  name: string;
  total: number;
}

export function topCompanies(
  groups: readonly CompanyGroup[],
  nameOf: (g: CompanyGroup) => string,
  limit = 5,
): TopCompany[] {
  return [...groups]
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((g) => ({ name: nameOf(g), total: g.total }));
}

/** Senders without a company (people, free mail) still count as mail volume. */
export function totalVolume(senders: readonly SenderSummary[]): number {
  return senders.reduce((n, s) => n + senderVolume(s), 0);
}

export interface DashboardFacts {
  score: number;
  /** Change since last week's score, if there is one. */
  scoreDelta?: number;
  tabs: Record<InboxTab, number> | null;
  companies: TopCompany[];
  companyCount: number;
  read: { overall: number | null; byWeek: WeekRate[] };
  clear: { expired: number; spam: number; neverRead: number };
  suspicious: number;
  waiting: number;
  verified: number | null;
  holdingOn: boolean;
}

export type Go = (screen: string, focus?: string) => void;

// ── Rendering ──────────────────────────────────────────────────────────

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

interface TileSpec {
  id: string;
  title: string;
  value: string;
  unit?: string;
  /** One short line under the number. */
  note?: string;
  chart: HTMLElement | SVGElement;
  action: string;
  go: () => void;
  danger?: boolean;
}

function tile(spec: TileSpec): HTMLElement {
  const el = document.createElement("section");
  el.className = `home-tile${spec.danger ? " danger" : ""}`;
  el.dataset.tile = spec.id;
  const titleId = `home-tile-${spec.id}`;
  el.setAttribute("aria-labelledby", titleId);

  const h = document.createElement("h2");
  h.className = "home-tile-title";
  h.id = titleId;
  h.textContent = spec.title;

  const figure = document.createElement("p");
  figure.className = "home-tile-value";
  figure.textContent = spec.value;
  if (spec.unit) {
    const unit = document.createElement("span");
    unit.className = "home-tile-unit";
    unit.textContent = spec.unit;
    figure.appendChild(unit);
  }

  const chart = document.createElement("div");
  chart.className = "home-tile-chart";
  chart.appendChild(spec.chart);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-sm home-tile-action";
  btn.textContent = spec.action;
  btn.onclick = spec.go;

  el.append(h, figure);
  if (spec.note) {
    const note = document.createElement("p");
    note.className = "home-tile-note";
    note.textContent = spec.note;
    el.appendChild(note);
  }
  el.append(chart, btn);
  return el;
}

/** A ring filled to `share` (0 to 1). */
function ring(share: number, label: string): SVGElement {
  const r = 26;
  const c = 2 * Math.PI * r;
  const root = svg("svg", { viewBox: "0 0 64 64", width: 64, height: 64, role: "img", "aria-label": label });
  root.append(
    svg("circle", { cx: 32, cy: 32, r, class: "chart-track", fill: "none", "stroke-width": 7 }),
    svg("circle", {
      cx: 32,
      cy: 32,
      r,
      class: "chart-fill",
      fill: "none",
      "stroke-width": 7,
      "stroke-linecap": "round",
      "stroke-dasharray": `${(c * Math.max(0, Math.min(1, share))).toFixed(1)} ${c.toFixed(1)}`,
      transform: "rotate(-90 32 32)",
    }),
  );
  return root;
}

/** One bar split into parts, with a legend underneath. */
function splitBar(parts: Array<{ name: string; n: number }>, label: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "split";
  const bar = document.createElement("div");
  bar.className = "split-bar";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", label);
  const total = parts.reduce((n, p) => n + p.n, 0) || 1;
  const legend = document.createElement("ul");
  legend.className = "split-legend";
  parts.forEach((p, i) => {
    if (p.n > 0) {
      const seg = document.createElement("span");
      seg.className = `split-seg s${i}`;
      seg.style.flexGrow = String(p.n / total);
      bar.appendChild(seg);
    }
    const item = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = `split-dot s${i}`;
    const name = document.createElement("span");
    name.textContent = p.name;
    const n = document.createElement("span");
    n.className = "split-n";
    n.textContent = p.n.toLocaleString();
    item.append(dot, name, n);
    legend.appendChild(item);
  });
  wrap.append(bar, legend);
  return wrap;
}

/** Horizontal bars, longest first. */
function barList(rows: TopCompany[]): HTMLElement {
  const list = document.createElement("ol");
  list.className = "bar-list";
  const max = Math.max(1, ...rows.map((r) => r.total));
  for (const row of rows) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "bar-name";
    name.textContent = row.name;
    const track = document.createElement("span");
    track.className = "bar-track";
    const fill = document.createElement("span");
    fill.className = "bar-fill";
    fill.style.width = `${Math.max(4, (row.total / max) * 100)}%`;
    track.appendChild(fill);
    const n = document.createElement("span");
    n.className = "bar-n";
    n.textContent = row.total.toLocaleString();
    li.append(name, track, n);
    list.appendChild(li);
  }
  return list;
}

/** Weekly columns of read share, oldest on the left. */
function weekColumns(weeks: WeekRate[]): SVGElement {
  const w = 160;
  const h = 56;
  const gap = 4;
  const bw = (w - gap * (weeks.length - 1)) / weeks.length;
  const label = weeks
    .map((wk, i) => `${weeks.length - i} weeks ago: ${wk.rate === null ? "no mail" : pct(wk.rate)}`)
    .join(", ");
  const root = svg("svg", {
    viewBox: `0 0 ${w} ${h}`,
    width: "100%",
    height: h,
    role: "img",
    "aria-label": label,
  });
  root.setAttribute("preserveAspectRatio", "none");
  weeks.forEach((wk, i) => {
    const x = i * (bw + gap);
    root.appendChild(svg("rect", { x, y: 0, width: bw, height: h, rx: 3, class: "chart-track" }));
    if (wk.rate !== null && wk.rate > 0) {
      const bh = Math.max(2, wk.rate * h);
      root.appendChild(
        svg("rect", { x, y: h - bh, width: bw, height: bh, rx: 3, class: "chart-fill-solid" }),
      );
    }
  });
  return root;
}

/** A thin meter filled to `share`. */
function meter(share: number, label: string): HTMLElement {
  const track = document.createElement("div");
  track.className = "meter";
  track.setAttribute("role", "img");
  track.setAttribute("aria-label", label);
  const fill = document.createElement("span");
  fill.className = "meter-fill";
  fill.style.width = pct(Math.max(0, Math.min(1, share)));
  track.appendChild(fill);
  return track;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** The six Home tiles in a grid. */
export function renderHomeDashboard(f: DashboardFacts, go: Go): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "home-grid";

  grid.appendChild(
    tile({
      id: "health",
      title: "Inbox health",
      value: String(f.score),
      unit: "/100",
      note:
        f.scoreDelta === undefined || f.scoreDelta === 0
          ? undefined
          : `${f.scoreDelta > 0 ? "Up" : "Down"} ${Math.abs(f.scoreDelta)} since last week`,
      chart: ring(f.score / 100, `Inbox health ${f.score} of 100`),
      action: "Improve it",
      go: () => go("delete"),
    }),
  );

  const clearTotal = f.clear.expired + f.clear.spam + f.clear.neverRead;
  grid.appendChild(
    tile({
      id: "clear",
      title: "Ready to clear",
      value: clearTotal.toLocaleString(),
      unit: ` ${plural(clearTotal, "email")}`,
      chart: splitBar(
        [
          { name: "Past their date", n: f.clear.expired },
          { name: "Looks like spam", n: f.clear.spam },
          { name: "Never opened", n: f.clear.neverRead },
        ],
        `${clearTotal} emails ready to clear`,
      ),
      action: "Clear out",
      go: () => go("delete"),
    }),
  );

  grid.appendChild(safetyTile(f, go));

  if (f.tabs) {
    const tabs = f.tabs;
    const total = TAB_ORDER.reduce((n, t) => n + tabs[t], 0);
    grid.appendChild(
      tile({
        id: "tabs",
        title: "Mail by tab",
        value: total.toLocaleString(),
        unit: ` ${plural(total, "email")}`,
        chart: splitBar(
          TAB_ORDER.filter((t) => tabs[t] > 0).map((t) => ({ name: TAB_NAMES[t], n: tabs[t] })),
          TAB_ORDER.map((t) => `${TAB_NAMES[t]} ${tabs[t]}`).join(", "),
        ),
        action: "Sort new mail",
        go: () => go("organize"),
      }),
    );
  }

  grid.appendChild(
    tile({
      id: "companies",
      title: "Top companies",
      value: f.companyCount.toLocaleString(),
      unit: ` ${plural(f.companyCount, "company", "companies")}`,
      chart: barList(f.companies),
      action: "See all senders",
      go: () => go("senders"),
    }),
  );

  grid.appendChild(
    tile({
      id: "read",
      title: "Read rate",
      value: f.read.overall === null ? "None" : pct(f.read.overall),
      note: "Last 8 weeks",
      chart: weekColumns(f.read.byWeek),
      action: "Mute what you skip",
      go: () => go("subscriptions", "senders-worth-decision"),
    }),
  );

  return grid;
}

function safetyTile(f: DashboardFacts, go: Go): HTMLElement {
  const verified = f.verified ?? 0;
  const chart = meter(verified, `${pct(verified)} of mail is from verified senders`);
  const note = f.verified === null ? undefined : `${pct(verified)} from verified senders`;
  if (f.suspicious > 0) {
    return tile({
      id: "safety",
      title: "Safety",
      value: f.suspicious.toLocaleString(),
      unit: ` suspicious ${plural(f.suspicious, "sender")}`,
      note,
      chart,
      action: "Review",
      go: () => go("impersonation"),
      danger: true,
    });
  }
  if (f.waiting > 0) {
    return tile({
      id: "safety",
      title: "Safety",
      value: f.waiting.toLocaleString(),
      unit: ` new ${plural(f.waiting, "sender")} waiting`,
      note,
      chart,
      action: "Let in or block",
      go: () => go("screener"),
    });
  }
  return tile({
    id: "safety",
    title: "Safety",
    value: "0",
    unit: " suspicious senders",
    note,
    chart,
    action: f.holdingOn ? "Open Safety" : "Turn on scam holding",
    go: () => go("impersonation"),
  });
}
