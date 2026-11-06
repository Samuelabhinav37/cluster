// Today: the few emails from the last day that matter, for the top of Home.
// Pure (no chrome.*, no DOM) so a future app can reuse it.
import { categorizeDomain } from "./domainCategories";
import { domainOf } from "./domainGrouping";
import { neverMove } from "./protectionPolicy";
import type { SenderSummary } from "./senderModel";
import { riskTier, senderRiskScore } from "./threatSignals";

export type TodayReason = "starred" | "reply" | "person" | "alert" | "delivery" | "recent";

export interface TodayItem {
  id: string;
  provider: SenderSummary["provider"];
  address: string;
  name: string;
  subject: string;
  receivedAt: number;
  reason: TodayReason;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const TODAY_MAX = 10;
const RANK: Record<TodayReason, number> = { starred: 0, reply: 1, person: 2, alert: 3, delivery: 4, recent: 5 };

/** Account and money notices worth seeing the same day. */
const ALERT_RE =
  /\b(security alert|new sign[- ]?in|sign[- ]?in attempt|password (was )?(changed|reset)|suspicious (activity|sign[- ]?in)|account (is )?(locked|suspended)|payment (is )?(due|failed|declined)|bill is due|statement is (ready|available))\b/i;
const DELIVERY_TODAY_RE = /\b(out for delivery|arriving today|delivered|delivery today)\b/i;

function reasonFor(m: SenderSummary["messages"][number], address: string, known: boolean, finance: boolean): TodayReason | null {
  const subject = m.subject ?? "";
  if (m.isProtected) return "starred";
  if (m.repliesToYou) return "reply";
  if (known || neverMove(m, address)) return "person";
  if (ALERT_RE.test(subject) || (finance && m.kind === "other" && !m.promotion)) return "alert";
  if (m.kind === "shipping" && DELIVERY_TODAY_RE.test(subject)) return "delivery";
  return null;
}

/** Up to `max` emails from the last day: starred, replies to you, people,
 * account and bank alerts, deliveries arriving today. Senders that look like
 * a scam are left to Protect. */
export function pickToday(senders: readonly SenderSummary[], known: Set<string>, now: number, max = TODAY_MAX): TodayItem[] {
  const items: TodayItem[] = [];
  for (const s of senders) {
    if (riskTier(senderRiskScore(s.threatSignals)) === "high") continue;
    const address = s.address.toLowerCase();
    const finance = categorizeDomain(domainOf(address)) === "finance";
    for (const m of s.messages) {
      if (now - m.receivedAt > DAY_MS) continue;
      const reason = reasonFor(m, address, known.has(address), finance);
      if (!reason) continue;
      items.push({
        id: m.id,
        provider: s.provider,
        address: s.address,
        name: s.displayName || s.address,
        subject: m.subject || "(no subject)",
        receivedAt: m.receivedAt,
        reason,
      });
    }
  }
  return items.sort((a, b) => RANK[a.reason] - RANK[b.reason] || b.receivedAt - a.receivedAt).slice(0, max);
}

/** Tops `items` up to `max` with the newest other mail from the last day,
 * leaving out promotions and senders that look like a scam. */
export function fillToday(items: TodayItem[], senders: readonly SenderSummary[], now: number, max: number): TodayItem[] {
  if (items.length >= max) return items.slice(0, max);
  const have = new Set(items.map((t) => t.id));
  const extra: TodayItem[] = [];
  for (const s of senders) {
    if (riskTier(senderRiskScore(s.threatSignals)) === "high") continue;
    for (const m of s.messages) {
      if (now - m.receivedAt > DAY_MS || m.promotion || have.has(m.id)) continue;
      extra.push({ id: m.id, provider: s.provider, address: s.address, name: s.displayName || s.address, subject: m.subject || "(no subject)", receivedAt: m.receivedAt, reason: "recent" });
    }
  }
  extra.sort((a, b) => b.receivedAt - a.receivedAt);
  return [...items, ...extra].slice(0, max);
}

const REASON_WORD: Record<TodayReason, string> = {
  starred: "Starred",
  reply: "Reply",
  person: "From a person",
  alert: "Account",
  delivery: "Delivery",
  recent: "New",
};

/** Once a day, from 7 in the morning local time. */
export function todayEmailDue(s: { todayEmail: boolean; lastTodayEmail: number }, now: number): boolean {
  if (!s.todayEmail || new Date(now).getHours() < 7) return false;
  return new Date(s.lastTodayEmail).toDateString() !== new Date(now).toDateString();
}

function encodeHeader(text: string): string {
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(text)))}?=`;
}

/** The morning email as an RFC 2822 message, put into the user's own inbox
 * (messages.insert): one line per email, each with its Gmail link. */
export function todayEmailMessage(items: readonly TodayItem[], to: string, now: number): string {
  const day = new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const lines = items.map(
    (t) => `${REASON_WORD[t.reason]}: ${t.name}\n${t.subject}\nhttps://mail.google.com/mail/u/0/#all/${t.id}\n`,
  );
  const body = [`${items.length} email${items.length === 1 ? "" : "s"} need you today.`, "", ...lines].join("\n").replace(/\n/g, "\r\n");
  return [
    `From: Cluster <${to}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(`Today: ${day}`)}`,
    `Date: ${new Date(now).toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
}
