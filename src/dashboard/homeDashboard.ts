// Home v2 (docs/ui-plan-2026-10-29b.md Step 1): Kai's verdict, this week's
// results, up to three next steps, and the inbox by Apple Mail's four kinds.
// Facts are computed here from the scan; the dashboard supplies the counts it
// already has.

import type { MessageRecord, SenderSummary } from "../lib/senderModel";
import { clearedCount, type ActionLogEntry } from "../lib/actionLog";

export type HomeKind = "primary" | "trans" | "updates" | "promo";

export const HOME_KINDS: ReadonlyArray<{ key: HomeKind; label: string }> = [
  { key: "primary", label: "People" },
  { key: "trans", label: "Receipts" },
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

/** Messages per kind, the total, and how many arrived in the last 7 days and the 7 before. */
export function mailByKind(
  senders: readonly SenderSummary[],
  now: number,
): { kinds: Record<HomeKind, number>; total: number; thisWeek: number; lastWeek: number } {
  const kinds: Record<HomeKind, number> = { primary: 0, trans: 0, updates: 0, promo: 0 };
  let total = 0;
  let thisWeek = 0;
  let lastWeek = 0;
  for (const s of senders) {
    for (const m of s.messages) {
      kinds[kindOf(m)] += 1;
      total += 1;
      if (now - m.receivedAt < WEEK_MS) thisWeek += 1;
      else if (now - m.receivedAt < 2 * WEEK_MS) lastWeek += 1;
    }
  }
  return { kinds, total, thisWeek, lastWeek };
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
  /** Mail from the last week in kinds that could leave on their own. */
  couldLeaveWeekly?: number;
  /** Brands the flagged senders pretend to be (keys, e.g. "paypal"), most first. */
  fakedBrands?: string[];
  /** While mail is still being read: the oldest message read so far. */
  since?: number;
  /** Arrivals in the seven days before this week. */
  lastWeek?: number;
  /** Emails cleared per day (oldest first, today last) and since install. */
  cleared?: { byDay: number[]; total: number };
  /** During the first read: messages read so far and how many there are. */
  reading?: { done: number; total: number };
  /** People you write to, from your sent mail. */
  people?: number;
}

/** Open a place; `act` also starts that place's own confirm step. */
export type HomeAct = "trash-never-opened" | "trash-past-date";
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
  package: [
    ["path", { d: "m12 3 8 4.5v9L12 21l-8-4.5v-9z" }],
    ["path", { d: "m4 7.5 8 4.5 8-4.5" }],
    ["path", { d: "M12 12v9" }],
  ],
  card: [
    ["rect", { x: "2", y: "5", width: "20", height: "14", rx: "2" }],
    ["path", { d: "M2 10h20" }],
  ],
  briefcase: [
    ["rect", { x: "2", y: "7", width: "20", height: "14", rx: "2" }],
    ["path", { d: "M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" }],
  ],
  plane: [
    [
      "path",
      {
        d: "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
      },
    ],
  ],
  cap: [
    ["path", { d: "M22 10 12 5 2 10l10 5z" }],
    ["path", { d: "M6 12v5c3 3 9 3 12 0v-5" }],
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
  user: [
    ["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }],
    ["circle", { cx: "12", cy: "7", r: "4" }],
  ],
  eye: [
    [
      "path",
      { d: "M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" },
    ],
    ["circle", { cx: "12", cy: "12", r: "3" }],
  ],
  sparkles: [
    [
      "path",
      {
        d: "M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z",
      },
    ],
    ["path", { d: "M20 3v4M22 5h-4" }],
  ],
  landmark: [["path", { d: "M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4z" }]],
  message: [["path", { d: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z" }]],
  volume: [
    [
      "path",
      {
        d: "M11 4.7a.7.7 0 0 0-1.2-.5L6.41 7.59A1.4 1.4 0 0 1 5.42 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.42a1.4 1.4 0 0 1 1 .41l3.38 3.39a.7.7 0 0 0 1.2-.5z",
      },
    ],
    ["path", { d: "M16 9a5 5 0 0 1 0 6M19.36 18.36a9 9 0 0 0 0-12.72" }],
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Emails cleared on each of the last seven days, oldest first, today last. */
export function clearedByDay(log: readonly ActionLogEntry[], now: number): number[] {
  const days = [0, 0, 0, 0, 0, 0, 0];
  const today = new Date(now).setHours(0, 0, 0, 0);
  for (const e of log) {
    // Round, not floor: a day across a clock change is 23 or 25 hours.
    const ago = Math.round((today - new Date(e.at).setHours(0, 0, 0, 0)) / DAY_MS);
    if (ago >= 0 && ago < 7) days[6 - ago] += clearedCount(e);
  }
  return days;
}

const n = (x: number) => x.toLocaleString();
const plural = (x: number, one: string, many: string) => `${n(x)} ${x === 1 ? one : many}`;

/** "↓ 18% vs last week"; green only when the change is the good way. */
function deltaChip(now: number, before: number, fewerIsGood: boolean): HTMLElement | null {
  if (before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return el("small", "chip-delta", "Same as last week");
  const good = pct < 0 === fewerIsGood;
  return el(
    "small",
    `chip-delta${good ? " good" : ""}`,
    `${pct < 0 ? "↓" : "↑"} ${Math.abs(pct)}% vs last week`,
  );
}

/** A row with its place's app icon, two lines and one button. */
function nextRow(o: { app: string; ic: string; title: string; sub: string; act: string; run: () => void }) {
  const row = el("div", "next-row");
  const ic = el("span", `app-ic app-${o.app}`);
  ic.append(icon(o.ic));
  const words = el("span", "next-words");
  words.append(el("b", "", o.title), el("span", "", o.sub));
  const btn = el("button", "btn btn-sm", o.act);
  btn.type = "button";
  btn.onclick = o.run;
  row.append(ic, words, btn);
  return row;
}

/** The first read: Kai beside a live counter. The dashboard moves the numbers
 * with `paintHomeRead` as reading goes on. */
function readHero(r: { done: number; total: number }): HTMLElement {
  const hero = el("section", "home-hero home-read");
  const words = el("div", "home-words");
  const nums = el("div", "read-nums");
  nums.append(
    el("b", "read-done", n(r.done)),
    el("span", "read-of", `of ${n(r.total)} emails`),
    el("em", "read-eta"),
  );
  const track = el("div", "read-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "Emails read");
  track.append(el("i", ""));
  words.append(
    el("p", "home-verdict", "Reading your mail."),
    el("p", "home-sub", "Nothing changes in Gmail until you choose."),
    nums,
    track,
  );
  hero.append(el("div", "home-kai"), words);
  paintHomeRead(hero, r.done, r.total, "");
  return hero;
}

/** Moves the first-read counter and bar. `label` says which mail is being
 * read; `eta` is the status line's time left. Between phases the count reads
 * "150 of 150", which looks finished, so it hides like the status line's. */
export function paintHomeRead(
  card: Element,
  done: number,
  total: number,
  eta: string,
  label = "Reading your mail",
): void {
  card.querySelector(".home-verdict")!.textContent = `${label}.`;
  card.querySelector(".read-done")!.textContent = done < total ? n(done) : "";
  card.querySelector(".read-of")!.textContent = done < total ? `of ${n(total)} emails` : "";
  card.querySelector(".read-eta")!.textContent = eta;
  const track = card.querySelector<HTMLElement>(".read-track")!;
  track.hidden = done >= total;
  track.setAttribute("aria-valuenow", String(done));
  track.setAttribute("aria-valuemax", String(Math.max(done, total)));
  track.querySelector<HTMLElement>("i")!.style.width =
    `${total > 0 ? Math.min(100, (done / total) * 100) : 0}%`;
}

/** Found so far: one row of three, each a place's icon, a number and a label. */
function foundSoFar(f: HomeFacts): HTMLElement {
  const strip = el("div", "found-strip");
  const tiles: Array<[app: string, ic: string, count: number, label: string]> = [
    ["protect", "shield-alert", f.suspicious, "look like scams"],
    ["clean", "mail-x", f.neverOpened.emails, "you never open"],
    ["inbox", "users", f.people ?? 0, "people you write to"],
  ];
  for (const [app, ic, count, label] of tiles) {
    const tile = el("div", "found-tile");
    const mark = el("span", `app-ic app-${app}`);
    mark.append(icon(ic));
    const words = el("span", "");
    words.append(el("b", "", n(count)), el("span", "found-label", label));
    tile.append(mark, words);
    strip.append(tile);
  }
  return strip;
}

/** Home: Kai's verdict, what Cluster did this week, up to three next steps,
 * and the inbox by kind (approved mockup research/2026-10-29-home-mockup.html).
 * `openKind` opens those emails in Details. The `.home-kai` slot is left
 * empty; the dashboard seats the live Kai there. */
export function renderHomeDashboard(f: HomeFacts, go: Go, openKind?: (kind: HomeKind) => void): HTMLElement {
  const root = el("div", "home");

  // 1. The verdict: one sentence in large type, said by Kai.
  const hero = el("section", "home-hero");
  const words = el("div", "home-words");
  const verdict = el("p", "home-verdict");
  const sub = el("p", "home-sub");
  if (f.suspicious > 0) {
    verdict.append(
      el("span", "warn", `${plural(f.suspicious, "email needs", "emails need")} you.`),
      el("br", ""),
      "The rest is handled.",
    );
    const brands = (f.fakedBrands ?? []).slice(0, 3).map(brandName);
    sub.textContent = brands.length
      ? `Don't click anything that says it's from ${brands.join(", ")}.`
      : "Don't click anything in them.";
    const review = el("button", "btn btn-accent-solid", `Review ${n(f.suspicious)}`);
    review.type = "button";
    review.onclick = () => go("impersonation");
    words.append(verdict, sub, review);
  } else {
    verdict.append("All clear.", el("br", ""), "Nothing needs you today.");
    sub.textContent = f.cleared?.total
      ? `${plural(f.cleared.total, "email", "emails")} cleared since you started.`
      : "Cluster checks new mail as it arrives.";
    words.append(verdict, sub);
  }
  hero.append(el("div", "home-kai"), words);
  root.append(f.reading ? readHero(f.reading) : hero);

  // 2. This week: results, each with a comparison.
  const byDay = f.cleared?.byDay ?? [0, 0, 0, 0, 0, 0, 0];
  const cleared = el("div", "week-card");
  cleared.append(el("b", "", n(byDay.reduce((a, b) => a + b, 0))), el("span", "", "cleared for you"));
  const spark = el("div", "spark");
  spark.setAttribute("role", "img");
  const top = Math.max(1, ...byDay);
  const dayName = (ago: number) =>
    ago === 0
      ? "Today"
      : new Date(Date.now() - ago * DAY_MS).toLocaleDateString(undefined, { weekday: "short" });
  spark.setAttribute(
    "aria-label",
    `Cleared per day: ${byDay.map((v, i) => `${dayName(6 - i)} ${v}`).join(", ")}`,
  );
  byDay.forEach((v, i) => {
    const bar = el("i", i === 6 ? "now" : "");
    bar.style.height = `${Math.max(6, (v / top) * 100)}%`;
    bar.title = `${dayName(6 - i)}: ${n(v)}`;
    spark.append(bar);
  });
  cleared.append(spark);
  if (f.cleared?.total) cleared.append(el("small", "chip-delta", `${n(f.cleared.total)} since you started`));

  const arrived = el("div", "week-card");
  arrived.append(el("b", "", n(f.thisWeek)), el("span", "", "arrived this week"));
  const arrivedChip = deltaChip(f.thisWeek, f.lastWeek ?? 0, true);
  if (arrivedChip) arrived.append(arrivedChip);

  // The same scams the verdict counts, so Home never shows two numbers for one thing.
  const scams = el("button", "week-card");
  scams.type = "button";
  scams.onclick = () => go("impersonation");
  scams.append(
    el("b", "", n(f.suspicious)),
    el("span", "", f.suspicious === 1 ? "scam caught" : "scams caught"),
  );
  const week = el("div", "home-week");
  week.append(cleared, arrived, scams);
  // During the first read nothing is cleared yet; show what turns up instead.
  if (f.reading) root.append(el("h2", "section-label", "Found so far"), foundSoFar(f));
  else root.append(el("h2", "section-label", "This week"), week);

  // 3. Next up: at most three, each says what happens and has one button.
  const rows: HTMLElement[] = [];
  if (f.neverOpened.emails > 0)
    rows.push(
      nextRow({
        app: "clean",
        ic: "mail-x",
        title: `${plural(f.neverOpened.emails, "email", "emails")} you never open`,
        sub: "You can undo this.",
        act: `Trash ${n(f.neverOpened.emails)}`,
        run: () => go("delete", "trash-never-opened"),
      }),
    );
  if (f.pastDate > 0)
    rows.push(
      nextRow({
        app: "clean",
        ic: "clock",
        title: `${plural(f.pastDate, "email", "emails")} past their date`,
        sub: "Old codes and expired offers.",
        act: `Trash ${n(f.pastDate)}`,
        run: () => go("delete", "trash-past-date"),
      }),
    );
  if (f.waiting > 0)
    rows.push(
      nextRow({
        app: "protect",
        ic: "user-plus",
        title: plural(f.waiting, "new sender", "new senders"),
        sub: "Let them in or hold them.",
        act: "Look",
        run: () => go("screener"),
      }),
    );
  if (f.limitsOn === 0 && f.couldLeaveWeekly)
    rows.push(
      nextRow({
        app: "organize",
        ic: "layers",
        title: "Let old mail leave on its own",
        sub: `About ${n(f.couldLeaveWeekly)} a week would leave.`,
        act: "Turn on",
        run: () => go("organize"),
      }),
    );
  if (rows.length > 0) {
    const list = el("div", "next-list");
    list.append(...rows.slice(0, 3));
    root.append(el("h2", "section-label", "Next up"), list);
  }

  // 4. Your inbox: the bar, with one sentence that says what it means.
  const inbox = el("section", "home-inbox");
  const most = HOME_KINDS.reduce((a, b) => (f.kinds[b.key] > f.kinds[a.key] ? b : a));
  const line = el("p", "inbox-line");
  if (f.total > 0) {
    line.append(el("b", "", `Most of your mail is ${most.label.toLowerCase()}.`));
    if (most.key !== "primary") line.append(` Only ${n(f.kinds.primary)} of ${n(f.total)} are from people.`);
  } else line.textContent = "No mail read yet.";
  if (f.since)
    line.append(
      ` Read back to ${new Date(f.since).toLocaleDateString(undefined, { month: "short", day: "numeric" })} so far.`,
    );
  const bar = el("div", "kind-bar");
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", HOME_KINDS.map((k) => `${k.label} ${f.kinds[k.key]}`).join(", "));
  const legend = el("ul", "kind-legend");
  for (const k of HOME_KINDS) {
    const count = f.kinds[k.key];
    if (count > 0) {
      const seg = el("span", `kind-${k.key}`);
      seg.style.flexGrow = String(count);
      seg.title = `${k.label}: ${n(count)}`;
      if (openKind) seg.onclick = () => openKind(k.key);
      bar.append(seg);
    }
    const item = openKind ? el("button", "") : el("span", "");
    if (item instanceof HTMLButtonElement) {
      item.type = "button";
      item.onclick = () => openKind!(k.key);
    }
    const pct = f.total ? Math.round((count / f.total) * 100) : 0;
    item.append(el("i", `kind-${k.key}`), k.label, el("em", "", `${n(count)} · ${pct}%`));
    const li = el("li", "");
    li.append(item);
    legend.append(li);
  }
  inbox.append(line, bar, legend);
  root.append(el("h2", "section-label", "Your inbox"), inbox);
  return root;
}
