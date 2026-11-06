// Home v2 (docs/ui-plan-2026-10-29b.md Step 1): Kai's verdict, this week's
// results, up to three next steps, and the inbox by Apple Mail's four kinds.
// Facts are computed here from the scan; the dashboard supplies the counts it
// already has.

import { senderTile } from "./senderTile";
import type { MessageRecord, SenderSummary } from "../lib/senderModel";
import { clearedCount, type ActionLogEntry } from "../lib/actionLog";
import type { TodayItem } from "../lib/today";
import type { ScanState } from "../lib/scanState";
import type { SortBucket } from "../lib/sortTaxonomy";
import { gmailMessageUrl } from "./detailsPanel";
import { infoButton } from "./ui";
import { donutChart, ticks } from "./overviewCharts";

export type HomeKind = "primary" | "trans" | "updates" | "promo";

export const HOME_KINDS: ReadonlyArray<{ key: HomeKind; label: string }> = [
  { key: "primary", label: "People" },
  { key: "trans", label: "Receipts" },
  { key: "updates", label: "Updates" },
  { key: "promo", label: "Promotions" },
];

/** Which of the four kinds each label belongs to, so the Labels page groups
 * its labels under the same names as Overview's chart. People get no label. */
export const BUCKET_KIND: Record<SortBucket, Exclude<HomeKind, "primary">> = {
  receipt: "trans",
  shipping: "trans",
  finance: "trans",
  travel: "trans",
  otp: "updates",
  accounts: "updates",
  newsletter: "updates",
  social: "updates",
  productivity: "updates",
  education: "updates",
  jobs: "updates",
  promotions: "promo",
  shopping: "promo",
};

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
): {
  kinds: Record<HomeKind, number>;
  total: number;
  thisWeek: number;
  lastWeek: number;
  peopleWeek: number;
  receivedByDay: number[];
  receivedPrevByDay: number[];
} {
  const kinds: Record<HomeKind, number> = { primary: 0, trans: 0, updates: 0, promo: 0 };
  let total = 0;
  let thisWeek = 0;
  let lastWeek = 0;
  let peopleWeek = 0;
  const receivedByDay = [0, 0, 0, 0, 0, 0, 0];
  const receivedPrevByDay = [0, 0, 0, 0, 0, 0, 0];
  for (const s of senders) {
    for (const m of s.messages) {
      const ago = daysAgo(m.receivedAt, now);
      if (ago >= 0 && ago < 7) receivedByDay[6 - ago] += 1;
      else if (ago >= 7 && ago < 14) receivedPrevByDay[13 - ago] += 1;
      const kind = kindOf(m);
      kinds[kind] += 1;
      total += 1;
      if (now - m.receivedAt < WEEK_MS) {
        thisWeek += 1;
        if (kind === "primary") peopleWeek += 1;
      }
      else if (now - m.receivedAt < 2 * WEEK_MS) lastWeek += 1;
    }
  }
  return { kinds, total, thisWeek, lastWeek, peopleWeek, receivedByDay, receivedPrevByDay };
}

/** Whole calendar days between `at` and `now` (0 = today). Round, not floor:
 * a day across a clock change is 23 or 25 hours. */
function daysAgo(at: number, now: number): number {
  return Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000));
}

/** Senders with the most mail in the last seven days, most first. */
export function topSendersThisWeek(
  senders: readonly SenderSummary[],
  now: number,
  count = 4,
): Array<{ address: string; name: string; count: number }> {
  return senders
    .map((s) => ({
      address: s.address,
      name: s.displayName || s.address,
      count: s.messages.filter((m) => daysAgo(m.receivedAt, now) < 7).length,
    }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, count);
}

/** Emails Cluster filed out of the inbox each day: this week and the week before, oldest first. */
export function filedByDay(log: readonly ActionLogEntry[], now: number): { cur: number[]; prev: number[] } {
  const cur = [0, 0, 0, 0, 0, 0, 0];
  const prev = [0, 0, 0, 0, 0, 0, 0];
  for (const e of log) {
    if (e.kind !== "sort" || e.undone || e.undo?.via !== "unarchive") continue;
    const ago = daysAgo(e.at, now);
    const n = e.undo.ids.length;
    if (ago >= 0 && ago < 7) cur[6 - ago] += n;
    else if (ago >= 7 && ago < 14) prev[13 - ago] += n;
  }
  return { cur, prev };
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
  /** This week's arrivals from people, the mail worth reading. */
  peopleWeek?: number;
  /** Emails cleared per day (oldest first, today last) and since install. */
  cleared?: { byDay: number[]; total: number };
  /** During the first read: messages read so far and how many there are. */
  reading?: { done: number; total: number };
  /** People you write to, from your sent mail. */
  people?: number;
  /** Gmail's inbox unread count, once it has answered. */
  inboxUnread?: number;
  /** Today's few emails that matter (lib/today.ts pickToday). */
  today?: TodayItem[];
  /** Unread on each of the last seven days, oldest first; null where not recorded. */
  unreadByDay?: (number | null)[];
  /** Unread a week ago, when recorded. */
  unreadWeekAgo?: number;
  /** Emails held as scams this week. */
  heldThisWeek?: number;
  /** Emails Cluster moved out of the inbox today. */
  movedToday?: number;
  /** Never-opened lists Unsubscribe can stop in one click. */
  stopLists?: number;
  /** Arrivals per day, this week and the week before, oldest first. */
  receivedByDay?: number[];
  receivedPrevByDay?: number[];
  /** Emails Cluster filed out of the inbox per day. */
  filed?: { cur: number[]; prev: number[] };
  /** Up to three flagged senders: their latest subject and the brand they fake. */
  suspects?: Array<{ address: string; name?: string; subject: string; brand?: string }>;
  /** Senders with the most mail this week. */
  topSenders?: Array<{ address: string; name: string; count: number }>;
}

/** Open a place; `act` also starts that place's own confirm step. */
export type HomeAct = "trash-never-opened" | "trash-past-date" | "stop-never-opened";
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
    scanSteps(0),
    el("p", "home-verdict", "Reading your mail."),
    el("p", "home-sub", "Nothing changes in Gmail until you choose."),
    nums,
    track,
  );
  hero.append(words);
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

/** The scan's two steps, ticked off as they finish (Malwarebytes-style milestones). */
export function scanSteps(active: number): HTMLElement {
  const steps = el("ol", "scan-steps");
  ["Read mail", "Label"].forEach((label, i) => {
    const step = el("li", i < active ? "is-done" : i === active ? "is-on" : "", label);
    step.prepend(el("i", ""));
    steps.append(step);
  });
  return steps;
}

export interface ScanRow {
  name: string;
  icon: string;
  color?: { backgroundColor: string; textColor: string };
  count: number;
  /** The label's inbox mail in Gmail, to check what landed there. */
  href: string;
}

/** Labelling after a read: live counts per label, then what landed where. */
export function renderScanCard(
  scan: ScanState,
  rows: readonly ScanRow[],
  on: { rescan(): void; dismiss(): void; unsortedHref: string; reading?: boolean },
): HTMLElement {
  const card = el("section", "scan-card");
  card.id = "scan-card";
  const done = scan.phase === "done";
  const sorted = rows.reduce((sum, r) => sum + r.count, 0);
  const head = el("div", "scan-head");
  head.append(el("b", "", done ? `${n(sorted)} labelled` : "Labelling your inbox"));
  if (done) {
    const again = el("button", "btn", "Rescan");
    again.type = "button";
    again.onclick = on.rescan;
    const close = el("button", "scan-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.onclick = on.dismiss;
    head.append(again, close);
  }
  card.append(head);
  // Labelled by search while the read goes on: the steps would claim it finished.
  if (!on.reading) card.append(scanSteps(done ? 2 : 1));
  if (!done) {
    const track = el("div", "read-track");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "Emails labelled");
    track.setAttribute("aria-valuenow", String(scan.done));
    track.setAttribute("aria-valuemax", String(Math.max(scan.done, scan.total)));
    const fill = el("i", "");
    fill.style.width = `${scan.total > 0 ? Math.min(100, (scan.done / scan.total) * 100) : 0}%`;
    track.append(fill);
    card.append(track);
    // Rows popping in and reordering mid-run looked messy: show them once, at the end.
    return card;
  }
  const list = el("div", "ios-group scan-rows");
  for (const r of [...rows].filter((x) => x.count > 0).sort((a, b) => b.count - a.count)) {
    const row = el("a", "ios-row");
    row.href = r.href;
    row.target = "_blank";
    row.rel = "noopener";
    const mark = el("span", "app-ic label-ic");
    if (r.color) Object.assign(mark.style, { background: r.color.backgroundColor, color: r.color.textColor });
    mark.append(icon(r.icon));
    row.append(mark, el("span", "grow", r.name), el("span", "ios-value", n(r.count)));
    list.append(row);
  }
  if (done && scan.unsorted > 0) {
    const row = el("a", "ios-row");
    row.href = on.unsortedHref;
    row.target = "_blank";
    row.rel = "noopener";
    const mark = el("span", "app-ic");
    mark.append(icon("inbox"));
    row.append(mark, el("span", "grow", "No label"), el("span", "ios-value", n(scan.unsorted)));
    list.append(row);
  }
  if (list.childElementCount > 0) card.append(list);
  return card;
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

/** Today: one row per email that matters, linking to it in Gmail. The
 * preview line is filled in later by fillTodaySnippets. */
function todayList(items: readonly TodayItem[]): HTMLElement {
  const wrap = el("section", "home-today");
  if (items.length === 0) {
    wrap.append(el("p", "hint", "Nothing needs you today."));
    return wrap;
  }
  const group = el("div", "ios-group");
  for (const t of items) {
    const row = t.provider === "gmail" ? el("a", "ios-row today-row") : el("div", "ios-row today-row");
    if (row instanceof HTMLAnchorElement) {
      row.href = gmailMessageUrl(t.id);
      row.target = "_blank";
      row.rel = "noopener";
    }
    const words = el("span", "today-words");
    const snippet = el("small", "today-snippet");
    snippet.dataset.snippetId = t.id;
    // Two lines, like Security's rows: who, then the subject with Gmail's preview after it.
    const line = el("span", "today-sub", t.subject);
    line.append(snippet);
    words.append(el("b", "", t.name), line);
    const when = el("span", "ios-value", new Date(t.receivedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
    row.append(senderTile(t.address, t.name, "sz-44"), words, when);
    group.append(row);
  }
  wrap.append(group);
  return wrap;
}

/** Puts Gmail's preview line under each Today row. Snippets arrive with
 * HTML entities ("&#39;"); DOMParser decodes them without running anything. */
export function fillTodaySnippets(root: ParentNode, snippets: ReadonlyMap<string, string>): void {
  for (const node of Array.from(root.querySelectorAll<HTMLElement>("[data-snippet-id]"))) {
    const raw = snippets.get(node.dataset.snippetId ?? "");
    if (raw) node.textContent = new DOMParser().parseFromString(raw, "text/html").documentElement.textContent ?? "";
  }
}

/** One widget: title, (i), optional badge, then its chart; the whole widget opens its page. */
function widget(
  title: string,
  about: string,
  badge: HTMLElement | null,
  body: HTMLElement,
  open: () => void,
  place: string,
): HTMLElement {
  const w = el("section", "ov-w");
  w.tabIndex = 0;
  w.setAttribute("role", "link");
  w.setAttribute("aria-label", `${title}. Open ${place}`);
  const head = el("h2", "ov-w-title", title);
  const [info, pop] = infoButton(about, `About ${title}`);
  head.append(info);
  if (badge) head.append(badge);
  head.append(el("span", "ov-go", "›"));
  w.append(head, pop, body);
  w.onclick = (e) => {
    if (!(e.target instanceof Element && e.target.closest("button, a, [role=tooltip], .info-pop"))) open();
  };
  w.onkeydown = (e) => {
    if (e.target === w && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      open();
    }
  };
  return w;
}

const KIND_COLORS: Record<HomeKind, string> = {
  primary: "var(--k1)",
  trans: "var(--k2)",
  updates: "var(--k3)",
  promo: "var(--k4)",
};

/** Overview: today's emails, then three widgets that each open their page
 * (research/2026-11-05-redesign-mockup.html). The greeting is the page title. */
export function renderHomeDashboard(
  f: HomeFacts,
  go: Go,
  openKind?: (kind: HomeKind) => void,
): HTMLElement {
  const root = el("div", "home");
  if (f.reading) root.append(readHero(f.reading));
  if (f.today) root.append(todayList(f.today));
  if (f.reading) {
    root.append(el("h2", "section-label", "Found so far"), foundSoFar(f));
    return root;
  }
  const since = f.since
    ? ` Read back to ${new Date(f.since).toLocaleDateString(undefined, { month: "short", day: "numeric" })} so far.`
    : "";
  const grid = el("div", "ov-grid");

  const donutBox = el("div", "ov-donut-box");
  donutBox.append(donutChart(HOME_KINDS.map((k) => [k.label, f.kinds[k.key], KIND_COLORS[k.key]]), "in inbox"));
  const legend = el("div", "ov-legend");
  for (const k of HOME_KINDS) {
    const item = el("button", "", k.label);
    item.type = "button";
    item.prepend(el("i", `kind-${k.key}`));
    item.append(el("b", "", n(f.kinds[k.key])));
    item.onclick = () => openKind?.(k.key);
    legend.append(item);
  }
  donutBox.append(legend);
  grid.append(
    widget("Inbox by category", `Every email Cluster has read, by kind. Pick a kind to see its emails.${since}`, null, donutBox, () => go("organize"), "Labels"),
  );

  const sus = el("div", "ov-list");
  for (const x of f.suspects ?? []) {
    const row = el("div", "ov-li");
    const words = el("div", "ov-who");
    words.append(el("b", "", x.subject || x.name || x.address), el("span", "", x.brand ? `Impersonating ${x.brand}` : x.address));
    row.append(senderTile(x.address, x.name, "sz-30"), words, el("span", "ov-pill-bad", "High"));
    sus.append(row);
  }
  if (!f.suspects?.length) sus.append(el("p", "ov-empty", "Nothing suspicious."));
  grid.append(widget("Suspicious emails", "Emails that pretend to be a company you know.", null, sus, () => go("impersonation"), "Security"));

  const top = el("div", "ov-list");
  const most = f.topSenders?.[0]?.count ?? 1;
  for (const t of f.topSenders ?? []) {
    const row = el("div", "ov-tr");
    const head = el("div", "ov-th");
    head.append(senderTile(t.address, t.name, "sz-26"), el("b", "", t.name), el("span", "ov-v", n(t.count)));
    row.append(head, ticks(t.count, most));
    top.append(row);
  }
  if (!f.topSenders?.length) top.append(el("p", "ov-empty", "No mail this week."));
  grid.append(widget("Top senders", "Senders with the most email in the last seven days.", null, top, () => go("subscriptions"), "Mailing lists"));

  root.append(grid);
  return root;
}
