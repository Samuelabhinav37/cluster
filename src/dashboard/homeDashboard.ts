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
  /** Kinds of mail with a time limit on. */
  limitsOn: number;
}

/** Open a place; `act` also starts that place's own confirm step. */
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
  mail: [
    ["rect", { width: "20", height: "16", x: "2", y: "4", rx: "2" }],
    ["path", { d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" }],
  ],
  trash: [
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }],
    ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }],
  ],
  layers: [
    ["path", { d: "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" }],
    ["path", { d: "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" }],
    ["path", { d: "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" }],
  ],
  "shield-check": [
    ["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }],
    ["path", { d: "m9 12 2 2 4-4" }],
  ],
};

const SVG_NS = "http://www.w3.org/2000/svg";

export function icon(name: string): SVGElement {
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

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", "btn btn-sm", text);
  b.type = "button";
  b.onclick = onClick;
  return b;
}

/** One bento tile, iCloud style: a header strip with the place's app icon,
 * its name and a short line, then the body. The header opens the place. */
function tile(o: { app: string; ic: string; name: string; sub: string; open: () => void; wide?: boolean }) {
  const root = el("section", `tile${o.wide ? " wide" : ""}`);
  const head = el("button", "tile-head");
  head.type = "button";
  head.onclick = o.open;
  const ic = el("span", `app-ic app-${o.app}`);
  ic.append(icon(o.ic));
  const words = el("span", "tile-words");
  words.append(el("b", "tile-name", o.name), el("span", "tile-sub", o.sub));
  head.append(ic, words);
  const body = el("div", "tile-body");
  root.append(head, body);
  return { root, body };
}

/** A calm tile body: one big glyph and one line. */
function quiet(ic: string, text: string, tone = ""): HTMLElement {
  const box = el("div", `tile-empty${tone ? ` ${tone}` : ""}`);
  box.append(icon(ic), el("span", "", text));
  return box;
}

/** Home as a bento grid: Inbox and Protect, then Clean up and Organize.
 * `openKind` opens those emails in Details. */
export function renderHomeDashboard(f: HomeFacts, go: Go, openKind?: (kind: HomeKind) => void): HTMLElement {
  const root = el("div", "home bento");

  // Inbox: the number, the bar and the legend, like iCloud's storage.
  const inbox = tile({
    app: "inbox",
    ic: "mail",
    name: "Inbox",
    wide: true,
    sub: f.thisWeek > 0 ? `+${f.thisWeek.toLocaleString()} this week` : "Nothing new this week",
    open: () => openKind?.("primary"),
  });
  const big = el("p", "home-big");
  big.append(el("b", "", f.total.toLocaleString()), ` ${f.total === 1 ? "email" : "emails"}`);
  const bar = el("div", "kind-bar");
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", HOME_KINDS.map((k) => `${k.label} ${f.kinds[k.key]}`).join(", "));
  const legend = el("ul", "kind-legend");
  for (const k of HOME_KINDS) {
    const count = f.kinds[k.key];
    if (count > 0) {
      const seg = el("span", `kind-${k.key}`);
      seg.style.flexGrow = String(count);
      seg.title = `${k.label}: ${count.toLocaleString()}`;
      if (openKind) seg.onclick = () => openKind(k.key);
      bar.append(seg);
    }
    const item = openKind ? el("button", "") : el("span", "");
    if (item instanceof HTMLButtonElement) {
      item.type = "button";
      item.onclick = () => openKind!(k.key);
    }
    item.append(el("i", `kind-${k.key}`), k.label, el("em", "", count.toLocaleString()));
    const li = el("li", "");
    li.append(item);
    legend.append(li);
  }
  inbox.body.append(big, bar, legend);

  // Protect: scams first, then new senders, else all clear.
  const scams = f.suspicious > 0;
  const protect = tile({
    app: "protect",
    ic: "shield-check",
    name: "Protect",
    sub: scams ? "Needs a look" : f.waiting > 0 ? "New senders" : "All clear",
    open: () => go(scams || f.waiting === 0 ? "impersonation" : "screener"),
  });
  if (scams || f.waiting > 0) {
    const n = scams ? f.suspicious : f.waiting;
    const stat = el("p", `tile-stat${scams ? " danger" : ""}`);
    stat.append(
      el("b", "", n.toLocaleString()),
      scams ? (n === 1 ? "looks like a scam" : "look like scams") : `new ${n === 1 ? "sender" : "senders"}`,
    );
    protect.body.append(stat, button("Review", () => go(scams ? "impersonation" : "screener")));
  } else protect.body.append(quiet("shield-check", "Nothing looks off", "ok"));

  // Clean up: one row per quick win, each starting that place's own confirm.
  const clearable = f.neverOpened.emails + f.pastDate;
  const clean = tile({
    app: "clean",
    ic: "trash",
    name: "Clean up",
    wide: true,
    sub: clearable > 0 ? `${plural(clearable, "email")} to clear` : "All tidy",
    open: () => go("delete"),
  });
  const rows: Array<[ic: string, name: string, fact: string, verb: string, act: HomeAct]> = [];
  if (f.neverOpened.senders > 0)
    rows.push([
      "mail-x",
      `${plural(f.neverOpened.senders, "sender")} you never open`,
      plural(f.neverOpened.emails, "email"),
      "Mute",
      "mute-never-opened",
    ]);
  if (f.pastDate > 0) rows.push(["clock", "Past its date", plural(f.pastDate, "email"), "Trash", "trash-past-date"]);
  if (rows.length === 0) clean.body.append(quiet("check", "Nothing to clear", "ok"));
  for (const [ic, name, fact, verb, act] of rows) {
    const row = el("div", "tile-row");
    const mark = el("span", "rec-ic");
    mark.append(icon(ic));
    const words = el("span", "tile-words");
    words.append(el("b", "", name), el("span", "tile-sub", fact));
    row.append(mark, words, button(verb, () => go("delete", act)));
    clean.body.append(row);
  }

  // Organize: how many kinds leave the inbox on their own.
  const organize = tile({
    app: "organize",
    ic: "layers",
    name: "Organize",
    sub: f.limitsOn > 0 ? `${plural(f.limitsOn, "time limit")} on` : "Time limits off",
    open: () => go("organize"),
  });
  if (f.limitsOn > 0) organize.body.append(quiet("check", "Your inbox tidies itself", "ok"));
  else organize.body.append(quiet("clock", "Let old mail leave on its own"), button("Pick one", () => go("organize")));

  root.append(inbox.root, protect.root, clean.root, organize.root);
  return root;
}
