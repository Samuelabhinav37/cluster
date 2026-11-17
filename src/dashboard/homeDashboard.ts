// Home v2 (docs/ui-plan-2026-10-29b.md Step 1): Kai's verdict, this week's
// results, up to three next steps, and the inbox by Apple Mail's four kinds.
// Facts are computed here from the scan; the dashboard supplies the counts it
// already has.

import { senderTile } from "./senderTile";
import type { MessageRecord, SenderSummary } from "../lib/senderModel";
import { clearedCount, type ActionLogEntry } from "../lib/actionLog";
import type { SortBucket } from "../lib/sortTaxonomy";
import { infoButton } from "./ui";
import { niceStep } from "./cleanupPage";

export type HomeKind = "primary" | "trans" | "updates" | "promo";

export const HOME_KINDS: ReadonlyArray<{ key: HomeKind; label: string }> = [
  { key: "primary", label: "People" },
  // Not "Receipts"/"Promotions": each group holds a label of that name.
  { key: "trans", label: "Transactions" },
  { key: "updates", label: "Updates" },
  { key: "promo", label: "Offers" },
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
  if (m.kind === "receipt" || m.kind === "statement" || m.kind === "shipping" || m.learnedTransactional) return "trans";
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
  return { kinds, total, thisWeek, lastWeek, peopleWeek, receivedByDay, receivedPrevByDay,  };
}

/** Arrivals on each of the `n` days ending on `end`'s day (oldest first), and the
 * total in the `n` days before them, for the change. */
export function receivedInRange(senders: readonly SenderSummary[], end: number, n: number): { days: number[]; prev: number } {
  const days = new Array<number>(n).fill(0);
  let prev = 0;
  for (const s of senders) {
    for (const m of s.messages) {
      const ago = daysAgo(m.receivedAt, end);
      if (ago >= 0 && ago < n) days[n - 1 - ago] += 1;
      else if (ago >= n && ago < 2 * n) prev += 1;
    }
  }
  return { days, prev };
}

/** Whole calendar days between `at` and `now` (0 = today). Round, not floor:
 * a day across a clock change is 23 or 25 hours. */
function daysAgo(at: number, now: number): number {
  return Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000));
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

/** How long without a run before the Overview says the inbox isn't being checked. */
export const STALE_SWEEP_MS = 30 * 60 * 1000;

/** A warning when the background run has stalled: a week of labelled mail once
 * sat in the inbox (Nov 2026) and nothing on screen said so. A healthy run says nothing. */
export function sweepLine(sweptAt: number, now: number): HTMLElement | null {
  const age = now - sweptAt;
  if (age <= STALE_SWEEP_MS) return null;
  const day = age > 24 * 60 * 60 * 1000;
  const when = new Date(sweptAt).toLocaleString(undefined, day ? { month: "short", day: "numeric" } : { hour: "numeric", minute: "2-digit" });
  const line = el("p", "text-meta ov-stale", `Inbox not checked since ${when}.`);
  line.setAttribute("role", "status");
  return line;
}

/** A Gmail page in this account: `authuser` picks the signed-in account by address,
 * so a second Google account in Chrome doesn't get the link. */
export function gmailUrl(account: string | undefined, hash: string): string {
  return account
    ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#${hash}`
    : `https://mail.google.com/mail/u/0/#${hash}`;
}

/** Gmail search for one local day's received mail. Epoch seconds, not dates:
 * Gmail reads after:/before: dates in Pacific time, which shifts the day elsewhere. */
export function gmailDayUrl(account: string | undefined, dayStart: number): string {
  const end = new Date(dayStart);
  end.setDate(end.getDate() + 1);
  const q = `after:${Math.floor(dayStart / 1000)} before:${Math.floor(end.getTime() / 1000)} -from:me`;
  return gmailUrl(account, `search/${encodeURIComponent(q)}`);
}

export interface HomeFacts {
  /** The Gmail address, so links open the right account. */
  account?: string;
  /** When the background run last looked at the inbox; unset when labels are off. */
  sweptAt?: number;
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
  /** Arrivals on each day of the chosen range, oldest first. */
  receivedDays?: number[];
  /** Arrivals in the same number of days before the range. */
  receivedPrev?: number;
  /** The range's last day, and how the card names the range ("Last 30 days"). */
  rangeEnd?: number;
  rangeLabel?: string;
  /** Emails cleared in the last 30 days. */
  cleared30?: number;
  /** Emails Cluster filed out of the inbox per day. */
  filed?: { cur: number[]; prev: number[] };
  /** Companies with the most mail this week, grouped like Cleanup's rows. */
  topSenders?: Array<{ key?: string; address: string; name: string; count: number }>;
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
  "arrow-up-right": [["path", { d: "M7 7h10v10" }], ["path", { d: "M7 17 17 7" }]],
  "trend-up": [["polyline", { points: "22 7 13.5 15.5 8.5 10.5 2 17" }], ["polyline", { points: "16 7 22 7 22 13" }]],
  "trend-down": [["polyline", { points: "22 17 13.5 8.5 8.5 13.5 2 7" }], ["polyline", { points: "16 17 22 17 22 11" }]],
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
export function clearedByDay(log: readonly ActionLogEntry[], now: number, span = 7): number[] {
  const days = new Array<number>(span).fill(0);
  const today = new Date(now).setHours(0, 0, 0, 0);
  for (const e of log) {
    // Round, not floor: a day across a clock change is 23 or 25 hours.
    const ago = Math.round((today - new Date(e.at).setHours(0, 0, 0, 0)) / DAY_MS);
    if (ago >= 0 && ago < span) days[span - 1 - ago] += clearedCount(e);
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
  words.append(el("p", "home-verdict", "Reading your mail"), nums, track);
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
  card.querySelector(".home-verdict")!.textContent = label;
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

/** Gmail's own label mark: the Material "label" tag (Apache-2.0), filled in
 * the label's Gmail color, as in Gmail's sidebar. */
export function gmailLabelIcon(color?: string): HTMLElement {
  const mark = el("span", "gl-tag");
  if (color) mark.style.color = color;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 -960 960 960");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M200-200q-33 0-56.5-23.5T120-280v-400q0-33 23.5-56.5T200-760h400q19 0 36 8.5t28 23.5l174 248-174 248q-11 15-28 23.5t-36 8.5H200Z");
  svg.append(path);
  mark.append(svg);
  return mark;
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

/** Apple's analytics card (App Store Connect): title and range, the total,
 * then a bar a day with the scale on the right. */
// Four colored tiles, after Apple's CloudKit console: icon, the number, what it counts.
type Tile = {
  title: string;
  value: number | undefined;
  open: () => void;
  /** Last week's value, for the badge; `upIsGood` colors its arrow. */
  prev?: number;
  upIsGood?: boolean;
  /** Shown instead of a badge when there is no last week to compare with. */
  note?: string;
};

/** The change since last week as a small badge, or the tile's note. */
function tileFoot(t: Tile): HTMLElement {
  const foot = el("div", "mt-foot");
  if (t.value === undefined || !t.prev) {
    if (t.note) foot.append(el("span", "", t.note));
    return foot;
  }
  const pct = Math.round(((t.value - t.prev) / t.prev) * 100);
  const up = pct >= 0;
  const badge = el("span", `mt-badge ${up === (t.upIsGood ?? true) ? "is-good" : "is-bad"}`);
  badge.append(icon(up ? "trend-up" : "trend-down"), `${Math.abs(pct)}%`);
  foot.append(badge, el("span", "", "from last week"));
  return foot;
}

// Four tiles after the user's sales dashboard: the first a blue hero with a faint
// mark behind it, the rest plain cards. Each opens its place, arrow included.
function metricTiles(f: HomeFacts, go: Go, openThisWeek?: () => void): HTMLElement {
  const tiles: Tile[] = [
    { title: "Received this week", value: f.thisWeek, prev: f.lastWeek, open: () => (openThisWeek ? openThisWeek() : go("organize")) },
    {
      title: "Unread in inbox",
      value: f.inboxUnread,
      prev: f.unreadWeekAgo,
      upIsGood: false,
      open: () => window.open(gmailUrl(f.account, "inbox"), "_blank", "noopener"),
    },
    { title: "In the Screener", value: f.waiting, note: "new senders waiting", open: () => go("screener") },
    { title: "Ready to clean up", value: f.clearable, note: "emails you can clear", open: () => go("delete") },
  ];
  const row = el("div", "mt-row");
  tiles.forEach((t, i) => {
    const tile = el("button", i === 0 ? "mt-tile is-hero" : "mt-tile");
    tile.type = "button";
    tile.onclick = t.open;
    if (i === 0) {
      const mark = icon("sparkles");
      mark.classList.add("mt-mark");
      tile.append(mark);
    }
    const arrow = el("span", "mt-go");
    arrow.append(icon("arrow-up-right"));
    tile.append(el("span", "mt-title", t.title), arrow, el("b", "mt-num", t.value === undefined ? "–" : n(t.value)), tileFoot(t));
    row.append(tile);
  });
  return row;
}

/** Top 10 senders this week, beside Received Mails. */
function topSendersCard(f: HomeFacts, openSender?: (key: string) => void): HTMLElement {
  const card = el("section", "ov-card ov-top10");
  const head = el("div", "mr-head");
  head.append(el("h2", "mr-title", "Top senders"), el("span", "mr-range", "Last 7 days"));
  const list = el("ol", "t10-list");
  const top = Math.max(1, ...(f.topSenders ?? []).map((t) => t.count));
  for (const t of f.topSenders ?? []) {
    const li = el("li", "");
    const row = el(t.key && openSender ? "button" : "div", "t10-row");
    if (t.key && openSender) {
      (row as HTMLButtonElement).type = "button";
      row.setAttribute("aria-label", `${t.name}: open their emails`);
      row.onclick = () => openSender(t.key!);
    }
    const who = el("span", "t10-who");
    const bar = el("i", "t10-bar");
    bar.style.width = `${Math.max(4, (t.count / top) * 100)}%`;
    who.append(el("span", "t10-name", t.name), bar);
    row.append(senderTile(t.address, t.name, "sz-30"), who, el("span", "t10-n", n(t.count)));
    li.append(row);
    list.append(li);
  }
  card.append(head, f.topSenders?.length ? list : el("p", "ov-empty", "No mail this week."));
  return card;
}

/** Received Mails' numbers: the total, the average a day, and the weekday with the
 * most mail on average (undefined until a weekday has any). `days` ends today. */
export function receivedStats(days: readonly number[], now: number): { total: number; perDay: number; busiest?: string } {
  const total = days.reduce((a, b) => a + b, 0);
  const sum = new Array<number>(7).fill(0);
  const seen = new Array<number>(7).fill(0);
  days.forEach((c, i) => {
    const wd = new Date(now - (days.length - 1 - i) * 86_400_000).getDay();
    sum[wd] += c;
    seen[wd] += 1;
  });
  const avg = sum.map((v, i) => (seen[i] ? v / seen[i] : 0));
  const top = avg.indexOf(Math.max(...avg));
  const busiest = total ? new Date(2024, 0, 7 + top).toLocaleDateString(undefined, { weekday: "long" }) + "s" : undefined;
  return { total, perDay: Math.round(total / Math.max(days.length, 1)), busiest };
}

function inboxCard(f: HomeFacts): HTMLElement {
  const card = el("section", "ov-card ov-inbox");
  const days = f.receivedDays ?? [];
  const end = f.rangeEnd ?? Date.now();
  const head = el("div", "mr-head");
  head.append(el("h2", "mr-title", "Received Mails"), el("span", "mr-range", f.rangeLabel ?? "Last 30 days"));
  // What mail-analytics tools put beside volume (Email Meter, EmailAnalytics): the
  // total with its change, the daily average and the busiest day of the week.
  const s = receivedStats(days, end);
  const stats = el("dl", "mr-stats");
  const stat = (k: string, v: string, extra?: HTMLElement) => {
    const dd = el("dd", "", v);
    if (extra) dd.append(extra);
    stats.append(el("dt", "", k), dd);
  };
  // The change only once the 30 days before are read too, or it would be made up.
  let change: HTMLElement | undefined;
  if (f.receivedPrev && !f.since) {
    const pct = Math.round(((s.total - f.receivedPrev) / f.receivedPrev) * 100);
    change = el("span", "mr-change", `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`);
    change.title = `Compared with the ${days.length} days before`;
  }
  stat("Total", n(s.total), change);
  stat("Per day", n(s.perDay));
  if (s.busiest) stat("Busiest day", s.busiest);
  const body = el("div", "mr-body");
  body.append(stats, barChart(days, end, (start) => window.open(gmailDayUrl(f.account, start), "_blank", "noopener")));
  card.append(head, body);
  return card;
}

const compact = new Intl.NumberFormat(undefined, { notation: "compact" });

/** One kind of mail in a stacked chart. */
export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  counts: readonly number[];
}

export interface ChartOptions {
  /** Clicking a day: its start. The tip then says what the click does. */
  openDay?: (dayStart: number) => void;
  /** Words under the tip's numbers for a click, e.g. "Open in Gmail". */
  openLabel?: string;
  /** Only this kind is lit; the others fade. */
  active?: string | null;
}

function barChart(counts: readonly number[], now: number, openDay?: (dayStart: number) => void): HTMLElement {
  return dayChart([{ key: "all", label: "Emails", color: "", counts }], now, { openDay, openLabel: "Open in Gmail" });
}

/** Emails each day as bars, stacked by kind when there is more than one, with
 * the Dashboard's axes, dates and hover tip. Shared by Dashboard, Cleanup,
 * Labels and Security so every chart reads the same way. */
export function dayChart(series: readonly ChartSeries[], now: number, o: ChartOptions = {}): HTMLElement {
  const days = series[0]?.counts.length ?? 0;
  const totals = Array.from({ length: days }, (_, i) => series.reduce((sum, s) => sum + (s.counts[i] ?? 0), 0));
  const stacked = series.length > 1 || series.some((s) => s.color);
  const wrap = el("div", "mr-chart");
  wrap.setAttribute("role", "img");
  wrap.setAttribute(
    "aria-label",
    stacked
      ? `Emails each day, last ${days} days: ${series.map((s) => `${s.label} ${s.counts.reduce((x, y) => x + y, 0)}`).join(", ")}`
      : `Emails each day, last ${days} days: ${totals.join(", ")}`,
  );
  const step = niceStep(Math.max(...totals, 0));
  const top = step * Math.max(1, Math.ceil(Math.max(...totals, 1) / step));
  const last = days - 1;
  const plot = el("div", "mr-plot");
  plot.style.setProperty("--n", String(days));
  for (let v = 0; v <= top; v += step) {
    const line = el("i", "mr-grid");
    line.style.bottom = `${(v / top) * 100}%`;
    const label = el("span", "mr-y", compact.format(v));
    label.style.bottom = `${(v / top) * 100}%`;
    plot.append(line, label);
  }
  const dayAt = (i: number) => new Date(now - (last - i) * 86_400_000);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const xs = el("div", "mr-xs");
  const bars: HTMLElement[] = [];
  const tickEvery = Math.max(1, Math.round(days / 7.5));
  for (let i = 0; i < days; i++) {
    const day = dayAt(i);
    const bar = el("i", stacked ? "mr-bar is-stack" : "mr-bar");
    bar.style.gridColumn = String(i + 1);
    bar.style.height = `${(totals[i] / top) * 100}%`;
    bar.style.setProperty("--i", String(i));
    if (stacked)
      for (const s of series) {
        if (!s.counts[i]) continue;
        const seg = el("i", "mr-seg");
        seg.dataset.key = s.key;
        seg.style.background = s.color;
        seg.style.flexGrow = String(s.counts[i]);
        if (o.active && o.active !== s.key) seg.classList.add("is-off");
        bar.append(seg);
      }
    bars.push(bar);
    plot.append(bar);
    // About eight dates across the range, counted back from its last day, with a dashed line up.
    if ((last - i) % tickEvery !== tickEvery >> 1) continue;
    const x = `${((i + 0.5) / days) * 100}%`;
    const tick = el("i", "mr-tick");
    tick.style.left = x;
    plot.append(tick);
    const label = el("span", day.getDate() === 1 ? "mr-x is-first" : "mr-x", fmt(day));
    label.style.left = x;
    xs.append(label);
  }
  // Each day owns its whole column, so moving across the gaps doesn't flicker.
  const tip = el("div", "mr-tip");
  tip.hidden = true;
  plot.append(tip);
  const dayFrom = (e: MouseEvent) => {
    const r = plot.getBoundingClientRect();
    return r.width ? Math.min(last, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * days))) : -1;
  };
  plot.addEventListener("mousemove", (e) => {
    const i = dayFrom(e);
    if (i < 0) return;
    plot.classList.add("is-picking");
    bars.forEach((b, j) => b.classList.toggle("on", j === i));
    const c = totals[i];
    tip.textContent = "";
    tip.append(el("b", "", n(c)), ` email${c === 1 ? "" : "s"} · ${fmt(dayAt(i))}`);
    // Several kinds: one line per kind that had mail that day, with its color.
    if (series.length > 1 && c > 0) {
      const list = el("span", "mr-tip-rows");
      for (const s of series) {
        if (!s.counts[i]) continue;
        const row = el("span", "mr-tip-row");
        const dot = el("i", "");
        dot.style.background = s.color;
        row.append(dot, el("span", "", s.label), el("b", "", n(s.counts[i])));
        list.append(row);
      }
      tip.append(list);
    }
    if (o.openDay && c > 0) tip.append(el("span", "mr-tip-go", o.openLabel ?? "Open"));
    tip.style.left = `${((i + 0.5) / days) * 100}%`;
    tip.style.bottom = `calc(${(c / top) * 100}% + 8px)`;
    tip.hidden = false;
  });
  if (o.openDay) {
    plot.classList.add("is-link");
    plot.addEventListener("click", (e) => {
      const i = dayFrom(e);
      if (i >= 0 && totals[i] > 0) o.openDay!(dayAt(i).setHours(0, 0, 0, 0));
    });
  }
  plot.addEventListener("mouseleave", () => {
    plot.classList.remove("is-picking");
    bars.forEach((b) => b.classList.remove("on"));
    tip.hidden = true;
  });
  wrap.append(plot, xs);
  return wrap;
}

/** Dots under a chart, one per kind with its total. Hover lights that kind; click picks it. */
export function chartLegend(series: readonly ChartSeries[], chart: HTMLElement, o: { active?: string | null; onPick?: (key: string) => void } = {}): HTMLElement {
  const legend = el("div", "ov-legend mr-legend");
  const focus = (key: string | null) => {
    for (const seg of Array.from(chart.querySelectorAll<HTMLElement>(".mr-seg"))) seg.classList.toggle("is-dim", key !== null && seg.dataset.key !== key);
  };
  for (const s of series) {
    const item = el(o.onPick ? "button" : "span", "mr-key", s.label);
    if (item instanceof HTMLButtonElement) {
      item.type = "button";
      item.setAttribute("aria-pressed", String(o.active === s.key));
      item.onclick = () => o.onPick!(s.key);
    }
    item.dataset.key = s.key;
    item.classList.toggle("is-off", !!o.active && o.active !== s.key);
    const dot = el("i", "");
    dot.style.background = s.color;
    item.prepend(dot);
    item.append(el("b", "", n(s.counts.reduce((x, y) => x + y, 0))));
    item.onmouseenter = item.onfocus = () => focus(s.key);
    item.onmouseleave = item.onblur = () => focus(null);
    legend.append(item);
  }
  return legend;
}

/** A chart card's left column: label above a big number, as on Received Mails. */
export function chartStats(rows: ReadonlyArray<[label: string, value: string, extra?: HTMLElement]>): HTMLElement {
  const stats = el("dl", "mr-stats");
  for (const [k, v, extra] of rows) {
    const dd = el("dd", "", v);
    if (extra) dd.append(extra);
    stats.append(el("dt", "", k), dd);
  }
  return stats;
}

// Shades of one blue, darkest to lightest, so the kinds differ without new colors.
const KIND_COLORS: Record<HomeKind, string> = {
  // Four hues, not four blues: shades alone were hard to tell apart.
  primary: "#0a84ff",
  trans: "#5e5ce6",
  updates: "#40c8e0",
  promo: "#ff9f0a",
};

/** A half ring of rounded bars, shared out between the kinds by count (largest remainder). */
type GaugeEl = HTMLElement & { show: (k: number) => void };

/** A half ring of rounded bars shared out between the parts by count (largest
 * remainder). Hover lights a part's bars and puts its count in the middle; click picks it. */
function gaugeChart(parts: Array<{ label: string; count: number; color: string; pick: () => void }>): GaugeEl {
  const N = 21;
  const total = parts.reduce((a, p) => a + p.count, 0);
  const shares = parts.map((p) => (total ? (p.count / total) * N : 0));
  const bars = shares.map(Math.floor);
  const order = shares.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  const left = total ? N - bars.reduce((a, b) => a + b, 0) : 0;
  for (let k = 0; k < left; k++) bars[order[k][1]] += 1;
  const owner = parts.flatMap((_, i) => Array<number>(bars[i]).fill(i));
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 240 132");
  svg.setAttribute("aria-hidden", "true");
  const lines: SVGLineElement[] = [];
  for (let i = 0; i < N; i++) {
    const a = Math.PI - (i * Math.PI) / (N - 1);
    const line = document.createElementNS(SVG_NS, "line");
    const at = (r: number) => [(120 + r * Math.cos(a)).toFixed(1), (120 - r * Math.sin(a)).toFixed(1)];
    const [x1, y1] = at(72);
    const [x2, y2] = at(108);
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", owner[i] === undefined ? "var(--neutral-fill)" : parts[owner[i]].color);
    line.style.setProperty("--i", String(i));
    lines.push(line);
    svg.append(line);
  }
  const label = (cls: string, y: string, text: string) => {
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("class", cls);
    t.setAttribute("x", "120");
    t.setAttribute("y", y);
    t.setAttribute("text-anchor", "middle");
    t.textContent = text;
    svg.append(t);
    return t;
  };
  const num = label("ov-gauge-num", "106", n(total));
  const what = label("ov-gauge-label", "124", "emails");
  const wrap = Object.assign(el("div", "ov-gauge"), { show: (_k: number) => {} });
  wrap.append(svg);
  wrap.show = (k: number) => {
    wrap.classList.toggle("is-picking", k >= 0);
    lines.forEach((l, i) => l.classList.toggle("on", owner[i] === k));
    num.textContent = n(k >= 0 ? parts[k].count : total);
    what.textContent = k >= 0 ? parts[k].label : "emails";
  };
  // The bar under the pointer, read from its angle, so the gaps between bars don't flicker.
  const kindAt = (e: MouseEvent): number => {
    const r = svg.getBoundingClientRect();
    if (!r.width) return -1;
    const x = ((e.clientX - r.left) / r.width) * 240 - 120;
    const y = 120 - ((e.clientY - r.top) / r.height) * 132;
    const d = Math.hypot(x, y);
    if (d < 60 || d > 122 || y < -8) return -1;
    const i = Math.round(((Math.PI - Math.atan2(Math.max(y, 0), x)) / Math.PI) * (N - 1));
    return owner[Math.min(N - 1, Math.max(0, i))] ?? -1;
  };
  svg.addEventListener("mousemove", (e) => {
    const k = kindAt(e);
    wrap.show(k);
    svg.style.cursor = k >= 0 ? "pointer" : "";
  });
  svg.addEventListener("mouseleave", () => wrap.show(-1));
  svg.addEventListener("click", (e) => {
    const k = kindAt(e);
    if (k < 0) return;
    e.stopPropagation();
    parts[k].pick();
  });
  return wrap;
}

/** Overview: today's emails, then three widgets that each open their page
 * (research/2026-11-05-redesign-mockup.html). The greeting is the page title. */
// The charts animate in once per page load, not on every repaint.
let introShown = false;

export function renderHomeDashboard(
  f: HomeFacts,
  go: Go,
  openKind?: (kind: HomeKind) => void,
  /** Opens one sender's emails in Details, as Cleanup's rows do. */
  openSender?: (key: string) => void,
  /** Opens this week's emails in Details, for the Received this week tile. */
  openThisWeek?: () => void,
): HTMLElement {
  const root = el("div", "home");
  if (f.reading) {
    root.append(readHero(f.reading));
    return root;
  }
  const since = f.since
    ? ` Read back to ${new Date(f.since).toLocaleDateString(undefined, { month: "short", day: "numeric" })} so far.`
    : "";
  if (!introShown) root.classList.add("ov-intro");
  introShown = true;
  const top = el("div", "ov-row ov-row-top");
  top.append(metricTiles(f, go, openThisWeek), inboxCard(f));
  const gaugeBox = el("div", "ov-gauge-box");
  const gauge = gaugeChart(
    HOME_KINDS.map((k) => ({ label: k.label, count: f.kinds[k.key], color: KIND_COLORS[k.key], pick: () => openKind?.(k.key) })),
  );
  gaugeBox.append(gauge);
  const legend = el("div", "ov-legend");
  for (const k of HOME_KINDS) {
    const item = el("button", "", k.label);
    item.type = "button";
    const dot = el("i", "");
    dot.style.background = KIND_COLORS[k.key];
    item.prepend(dot);
    item.append(el("b", "", n(f.kinds[k.key])));
    item.onclick = () => openKind?.(k.key);
    const at = HOME_KINDS.indexOf(k);
    item.onmouseenter = item.onfocus = () => gauge.show(at);
    item.onmouseleave = item.onblur = () => gauge.show(-1);
    legend.append(item);
  }
  gaugeBox.append(legend);
  const bottom = el("div", "ov-row ov-row-bottom");
  bottom.append(
    widget("Mail by category", `Every email Cluster has read, by kind. Pick a kind to see its emails.${since}`, null, gaugeBox, () => go("organize"), "Labels"),
    topSendersCard(f, openSender),
  );
  root.append(top, bottom);
  const stale = f.sweptAt ? sweepLine(f.sweptAt, Date.now()) : null;
  if (stale) root.prepend(stale);
  return root;
}
