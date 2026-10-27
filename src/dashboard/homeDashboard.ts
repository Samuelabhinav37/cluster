// Home, the iPhone Storage way: one number, one bar of your inbox by Apple
// Mail's four kinds, and up to three next steps, most urgent first
// (docs/dashboard-plan.md Track 2; approved mockup
// research/2026-10-27-home-cleanup-mockup.html). Facts are computed here from
// the scan; the dashboard supplies the counts it already has.

import type { MessageRecord, SenderSummary } from "../lib/senderModel";

export type HomeKind = "primary" | "trans" | "updates" | "promo";

export const HOME_KINDS: ReadonlyArray<{ key: HomeKind; label: string }> = [
  { key: "primary", label: "Primary" },
  { key: "trans", label: "Transactions" },
  { key: "updates", label: "Updates" },
  { key: "promo", label: "Promotions" },
];

/** Apple Mail's four kinds: receipts and shipping are Transactions, Gmail's
 * Promotions tab is Promotions, codes, lists, social and Gmail's other tabs
 * are Updates, and the rest is Primary. */
export function kindOf(m: MessageRecord): HomeKind {
  if (m.kind === "receipt" || m.kind === "shipping" || m.learnedTransactional) return "trans";
  if (m.tab === "promotions" || m.promotion) return "promo";
  if (m.kind === "otp" || m.kind === "newsletter" || m.kind === "social") return "updates";
  if (m.tab && m.tab !== "primary") return "updates";
  return "primary";
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Messages per kind, the total, and how many arrived in the last 7 days. */
export function mailByKind(
  senders: readonly SenderSummary[],
  now: number,
): { kinds: Record<HomeKind, number>; total: number; thisWeek: number } {
  const kinds: Record<HomeKind, number> = { primary: 0, trans: 0, updates: 0, promo: 0 };
  let total = 0;
  let thisWeek = 0;
  for (const s of senders) {
    for (const m of s.messages) {
      kinds[kindOf(m)] += 1;
      total += 1;
      if (now - m.receivedAt < WEEK_MS) thisWeek += 1;
    }
  }
  return { kinds, total, thisWeek };
}

export interface HomeFacts {
  kinds: Record<HomeKind, number>;
  total: number;
  thisWeek: number;
  /** Senders with scam warnings. */
  suspicious: number;
  /** New senders waiting in the screener. */
  waiting: number;
  /** Bulk senders you have never opened, and their mail. */
  neverOpened: { senders: number; emails: number };
  /** Mail past its date (old codes, delivered parcels, expired offers). */
  pastDate: number;
}

/** Open a place; `act` also starts that place's own confirm step for the card. */
export type HomeAct = "mute-never-opened" | "trash-past-date";
export type Go = (screen: string, act?: HomeAct) => void;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

// Lucide 0.460 (ISC), drawn at 24 with a 1.75 stroke. Built with DOM calls,
// not innerHTML, so nothing here is parsed as markup.
type Shape = [tag: string, attrs: Record<string, string>];
const ICONS: Record<string, Shape[]> = {
  "shield-alert": [
    ["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }],
    ["path", { d: "M12 8v4" }],
    ["path", { d: "M12 16h.01" }],
  ],
  "mail-x": [
    ["path", { d: "M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9" }],
    ["path", { d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" }],
    ["path", { d: "m17 17 4 4" }],
    ["path", { d: "m21 17-4 4" }],
  ],
  clock: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["polyline", { points: "12 6 12 12 16 14" }],
  ],
  "user-plus": [
    ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
    ["circle", { cx: "9", cy: "7", r: "4" }],
    ["line", { x1: "19", x2: "19", y1: "8", y2: "14" }],
    ["line", { x1: "22", x2: "16", y1: "11", y2: "11" }],
  ],
  check: [
    ["path", { d: "M20 6 9 17l-5-5" }],
  ],
};

interface Rec {
  icon: string;
  name: string;
  fact?: string;
  verb: string;
  go: () => void;
  danger?: boolean;
}

/** Up to three next steps, most urgent first. A scam warning always leads. */
export function homeRecommendations(f: HomeFacts, go: Go): Rec[] {
  const recs: Rec[] = [];
  if (f.suspicious > 0)
    recs.push({
      icon: "shield-alert",
      name: `${plural(f.suspicious, "sender")} ${f.suspicious === 1 ? "looks" : "look"} like a scam`,
      verb: "Review",
      go: () => go("impersonation"),
      danger: true,
    });
  if (f.neverOpened.senders > 0)
    recs.push({
      icon: "mail-x",
      name: `Mute ${plural(f.neverOpened.senders, "sender")} you never open`,
      fact: plural(f.neverOpened.emails, "email"),
      verb: "Mute",
      go: () => go("delete", "mute-never-opened"),
    });
  if (f.pastDate > 0)
    recs.push({
      icon: "clock",
      name: "Trash mail past its date",
      fact: plural(f.pastDate, "email"),
      verb: "Trash",
      go: () => go("delete", "trash-past-date"),
    });
  if (f.waiting > 0)
    recs.push({
      icon: "user-plus",
      name: `${plural(f.waiting, "new sender")} waiting`,
      verb: "Review",
      go: () => go("screener"),
    });
  return recs.slice(0, 3);
}

const SVG_NS = "http://www.w3.org/2000/svg";

function icon(name: string): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "i");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attrs] of ICONS[name]) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}

/** The total, the kind bar with its legend, and the recommendations.
 * `openKind` opens those emails in Details. */
export function renderHomeDashboard(f: HomeFacts, go: Go, openKind?: (kind: HomeKind) => void): HTMLElement {
  const root = document.createElement("div");
  root.className = "home";

  const big = document.createElement("p");
  big.className = "home-big";
  const n = document.createElement("b");
  n.textContent = f.total.toLocaleString();
  big.append(n, ` ${f.total === 1 ? "email" : "emails"} in your inbox`);
  if (f.thisWeek > 0) {
    const delta = document.createElement("span");
    delta.className = "home-delta";
    delta.textContent = `+${f.thisWeek.toLocaleString()} this week`;
    big.append(delta);
  }

  const bar = document.createElement("div");
  bar.className = "kind-bar";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", HOME_KINDS.map((k) => `${k.label} ${f.kinds[k.key]}`).join(", "));
  const legend = document.createElement("ul");
  legend.className = "kind-legend";
  for (const k of HOME_KINDS) {
    const count = f.kinds[k.key];
    if (count > 0) {
      const seg = document.createElement("span");
      seg.className = `kind-${k.key}`;
      seg.style.flexGrow = String(count);
      seg.title = `${k.label}: ${count.toLocaleString()}`;
      if (openKind) seg.onclick = () => openKind(k.key);
      bar.append(seg);
    }
    const li = document.createElement("li");
    const item = openKind ? document.createElement("button") : document.createElement("span");
    if (item instanceof HTMLButtonElement) {
      item.type = "button";
      item.onclick = () => openKind!(k.key);
    }
    const swatch = document.createElement("i");
    swatch.className = `kind-${k.key}`;
    const em = document.createElement("em");
    em.textContent = count.toLocaleString();
    item.append(swatch, k.label, em);
    li.append(item);
    legend.append(li);
  }

  const head = document.createElement("h2");
  head.className = "section-label";
  head.textContent = "Recommended";
  const grid = document.createElement("div");
  grid.className = "rec-grid";
  const recs = homeRecommendations(f, go);
  if (recs.length === 0)
    recs.push({ icon: "check", name: "Nothing needs you right now", verb: "", go: () => undefined });
  for (const r of recs) {
    const card = document.createElement("div");
    card.className = "rec-card";
    const ic = document.createElement("span");
    ic.className = `rec-ic${r.danger ? " danger" : r.verb ? "" : " ok"}`;
    ic.append(icon(r.icon));
    card.append(ic);
    const name = document.createElement("div");
    name.className = "rec-name";
    name.textContent = r.name;
    card.append(name);
    if (r.fact) {
      const fact = document.createElement("div");
      fact.className = "rec-fact";
      fact.textContent = r.fact;
      card.append(fact);
    }
    if (r.verb) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-sm";
      btn.textContent = r.verb;
      btn.onclick = r.go;
      card.append(btn);
    }
    grid.append(card);
  }

  root.append(big, bar, legend, head, grid);
  return root;
}
