// Home, the iPhone Storage way: one number, one bar of your inbox by Apple
// Mail's four kinds, and up to three next steps, most urgent first
// (docs/dashboard-plan.md Track 2; approved mockup
// research/2026-10-27-home-cleanup-mockup.html). Facts are computed here from
// the scan; the dashboard supplies the counts it already has.

import type { MessageRecord, SenderSummary } from "../lib/senderModel";
import { brandHomeDomain } from "../lib/threatSignals";
import { senderTile } from "./senderTile";

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
  /** Clean up's total: the parts above plus spam, each email counted once. */
  clearable: number;
  /** Kinds of mail with a time limit on. */
  limitsOn: number;
  /** Brands the flagged senders pretend to be (keys, e.g. "paypal"), most first. */
  fakedBrands?: string[];
}

/** Open a place; `act` also starts that place's own confirm step. */
export type HomeAct = "mute-never-opened" | "trash-past-date";
export type Go = (screen: string, act?: HomeAct) => void;

// Lucide 0.460 (ISC), drawn at 24 with a 1.75 stroke. Built with DOM calls,
// not innerHTML, so nothing here is parsed as markup.
type Shape = [tag: string, attrs: Record<string, string>];
const ICONS: Record<string, Shape[]> = {
  "shield-alert": [
    [
      "path",
      {
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      },
    ],
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
  check: [["path", { d: "M20 6 9 17l-5-5" }]],
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
    [
      "path",
      {
        d: "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z",
      },
    ],
    ["path", { d: "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" }],
    ["path", { d: "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" }],
  ],
  key: [
    ["circle", { cx: "8", cy: "15", r: "4" }],
    ["path", { d: "m10.85 12.15 8.65-8.65" }],
    ["path", { d: "m18 5 2 2" }],
    ["path", { d: "m15 8 2 2" }],
  ],
  tag: [
    [
      "path",
      {
        d: "M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z",
      },
    ],
    ["circle", { cx: "7.5", cy: "7.5", r: "1" }],
  ],
  news: [
    ["rect", { width: "18", height: "16", x: "3", y: "4", rx: "2" }],
    ["path", { d: "M7 8h10M7 12h10M7 16h6" }],
  ],
  receipt: [
    ["path", { d: "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" }],
    ["path", { d: "M8 8h8M8 12h8M8 16h5" }],
  ],
  users: [
    ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
    ["circle", { cx: "9", cy: "7", r: "4" }],
    ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }],
    ["path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }],
  ],
  bag: [
    ["path", { d: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" }],
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M16 10a4 4 0 0 1-8 0" }],
  ],
  bell: [
    ["path", { d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" }],
    ["path", { d: "M10.3 21a1.94 1.94 0 0 0 3.4 0" }],
  ],
  calendar: [
    ["rect", { width: "18", height: "18", x: "3", y: "4", rx: "2" }],
    ["path", { d: "M16 2v4M8 2v4M3 10h18" }],
  ],
  reply: [
    ["path", { d: "M9 17 4 12l5-5" }],
    ["path", { d: "M20 18v-2a4 4 0 0 0-4-4H4" }],
  ],
  inbox: [
    ["path", { d: "M22 12h-6l-2 3h-4l-2-3H2" }],
    [
      "path",
      {
        d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
      },
    ],
  ],
  link: [
    ["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }],
    ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }],
  ],
  "shield-check": [
    [
      "path",
      {
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      },
    ],
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

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** One bento tile: the place's app icon and name, then the body. The whole
 * tile opens the place; the header is the button screen readers reach. */
function tile(o: { app: string; ic: string; name: string; open: () => void; wide?: boolean }) {
  const root = el("section", `tile${o.wide ? " wide" : ""}`);
  const head = el("button", "tile-head");
  head.type = "button";
  head.onclick = o.open;
  root.onclick = (event) => {
    if (!(event.target as HTMLElement).closest("button")) o.open();
  };
  const ic = el("span", `app-ic app-${o.app}`);
  ic.append(icon(o.ic));
  head.append(ic, el("b", "tile-name", o.name), el("span", "tile-chev", "›"));
  const body = el("div", "tile-body");
  root.append(head, body);
  return { root, body };
}

/** The tile's one number, said once, with a short unit after it. */
function stat(n: number, unit: string, tone = ""): HTMLElement {
  const p = el("p", `tile-stat${tone ? ` ${tone}` : ""}`);
  p.append(el("b", "", n.toLocaleString()), el("span", "", unit));
  return p;
}

/** A calm tile body: one big glyph and one line. */
function quiet(ic: string, text: string, tone = ""): HTMLElement {
  const box = el("div", `tile-empty${tone ? ` ${tone}` : ""}`);
  box.append(icon(ic), el("span", "", text));
  return box;
}

// Brand keys are lower case; these don't title-case cleanly.
const BRAND_NAMES: Record<string, string> = {
  paypal: "PayPal",
  "at&t": "AT&T",
  amex: "Amex",
  dhl: "DHL",
  docusign: "DocuSign",
  fedex: "FedEx",
  irs: "IRS",
  linkedin: "LinkedIn",
  "t-mobile": "T-Mobile",
  ups: "UPS",
  usbank: "U.S. Bank",
  uscis: "USCIS",
  usps: "USPS",
};
const brandName = (key: string) => BRAND_NAMES[key] ?? key.replace(/\b\w/g, (c) => c.toUpperCase());

/** Home as a bento grid: All mail and Protect, then Clean up and Organize.
 * `openKind` opens those emails in Details. */
export function renderHomeDashboard(f: HomeFacts, go: Go, openKind?: (kind: HomeKind) => void): HTMLElement {
  const root = el("div", "home bento");

  // All mail read: the number, the bar and the legend, like iCloud's storage.
  const inbox = tile({
    app: "inbox",
    ic: "mail",
    name: "All mail",
    wide: true,
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

  // Protect: scams first, with the brands they fake; then new senders.
  const scams = f.suspicious > 0;
  const protect = tile({
    app: "protect",
    ic: "shield-check",
    name: "Protect",
    open: () => go(scams || f.waiting === 0 ? "impersonation" : "screener"),
  });
  if (scams) {
    protect.body.append(stat(f.suspicious, "to review", "danger"));
    const brands = (f.fakedBrands ?? []).slice(0, 3);
    if (brands.length > 0) {
      const faces = el("div", "tile-faces");
      for (const b of brands) {
        const domain = brandHomeDomain(b);
        faces.append(
          senderTile(domain ? `no-reply@${domain}` : `${b}@example.invalid`, brandName(b), "sz-26"),
        );
      }
      protect.body.append(
        faces,
        el("p", "tile-note", `Pretending to be ${brands.map(brandName).join(", ")}`),
      );
    }
  } else if (f.waiting > 0)
    protect.body.append(stat(f.waiting, f.waiting === 1 ? "new sender" : "new senders"));
  else protect.body.append(quiet("shield-check", "Nothing looks off", "ok"));

  // Clean up: the total once, then what it's made of, without repeating counts.
  const clearable = f.clearable;
  const clean = tile({ app: "clean", ic: "trash", name: "Clean up", wide: true, open: () => go("delete") });
  if (clearable === 0) clean.body.append(quiet("check", "Nothing to clear", "ok"));
  else {
    // "of N" names the total it is part of, the All mail number above.
    clean.body.append(stat(clearable, `of ${f.total.toLocaleString()} ready to go`));
    const parts: Array<[ic: string, name: string]> = [];
    if (f.neverOpened.senders > 0) parts.push(["mail-x", "Never opened"]);
    if (f.pastDate > 0) parts.push(["clock", "Past its date"]);
    for (const [ic, name] of parts) {
      const row = el("div", "tile-row");
      const mark = el("span", "rec-ic");
      mark.append(icon(ic));
      row.append(mark, el("span", "", name));
      clean.body.append(row);
    }
  }

  // Organize: how many kinds leave the inbox on their own.
  const organize = tile({ app: "organize", ic: "layers", name: "Organize", open: () => go("organize") });
  if (f.limitsOn > 0)
    organize.body.append(stat(f.limitsOn, f.limitsOn === 1 ? "kind tidies itself" : "kinds tidy themselves"));
  else organize.body.append(quiet("clock", "Let old mail leave on its own"));

  root.append(inbox.root, protect.root, clean.root, organize.root);
  return root;
}
