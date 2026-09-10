// The Overview tab's data: a deterministic, metadata-only read of the current
// scan plus persisted state. Every number here already comes from an existing
// module — this just collects them so the dashboard can open on one triaged
// summary instead of a wall of sections. No AI, no new scanning.
import { buildExpiryBuckets, totalExpiryCount } from "./expiryTriage";
import { neverReadSenders } from "./neverRead";
import type { SenderSummary } from "./senderModel";
import type { ClusterSettings, HealthSnapshot } from "./settingsStore";
import { SMART_VIEWS, smartViewMessageCount } from "./smartViews";
import { suggestSpamSenders } from "./spamSuggestions";
import { riskTier, senderRiskScore } from "./threatSignals";

export interface InboxHealthMetric {
  /** Stable id; also used as the scroll target hint. */
  id: string;
  label: string;
  value: number;
  hint: string;
  /** Which dashboard tab this metric's detail lives on. */
  tab: string;
  tone: "neutral" | "attention";
}

export interface InboxHealth {
  scannedSenders: number;
  scannedMessages: number;
  metrics: InboxHealthMetric[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function hasUnsubscribe(u: SenderSummary["unsubscribe"]): boolean {
  return Boolean(u.postUrl || u.httpUrl || u.mailto);
}

export function buildInboxHealth(input: {
  senders: SenderSummary[];
  securitySenders: SenderSummary[];
  settings: ClusterSettings;
  now?: number;
}): InboxHealth {
  const { senders, securitySenders, settings } = input;
  const now = input.now ?? Date.now();

  const readyToCleanUp = totalExpiryCount(buildExpiryBuckets(senders));
  const neverOpened = neverReadSenders(senders).length;
  const suspectedSpam = suggestSpamSenders(senders).length;

  const oldView = SMART_VIEWS.find((v) => v.id === "older-1y");
  const largeView = SMART_VIEWS.find((v) => v.id === "large");
  const oldAndLarge =
    (oldView ? smartViewMessageCount(oldView, senders) : 0) +
    (largeView ? smartViewMessageCount(largeView, senders) : 0);

  const flaggedSenders = securitySenders.filter(
    (s) => riskTier(senderRiskScore(s.threatSignals)) !== "low",
  ).length;

  const snoozedDue = Object.values(settings.snoozedMessages).filter(
    (s) => s.resurfaceAt <= now,
  ).length;

  const unsubscribeCapable = senders.filter((s) => hasUnsubscribe(s.unsubscribe)).length;

  const screenerQueue = settings.screenerEnabled ? settings.screenedSenders.length : 0;

  const doneLast7Days = settings.actionLog.filter(
    (e) => !e.undone && e.at >= now - 7 * DAY_MS,
  ).length;

  const raw: Array<Omit<InboxHealthMetric, "tone"> & { attentionWhenPositive: boolean }> = [
    {
      id: "ready-to-clean-up",
      label: "Ready to clean up",
      value: readyToCleanUp,
      hint: "Old one-time codes, stale shipping and newsletters, by age alone.",
      tab: "cleanup",
      attentionWhenPositive: true,
    },
    {
      id: "never-opened",
      label: "Senders you never open",
      value: neverOpened,
      hint: "Every message from them is still unread.",
      tab: "cleanup",
      attentionWhenPositive: true,
    },
    {
      id: "suspected-spam",
      label: "Suspected spam",
      value: suspectedSpam,
      hint: "Sender domain is on a public spam / throwaway list.",
      tab: "cleanup",
      attentionWhenPositive: true,
    },
    {
      id: "old-and-large",
      label: "Old & large mail",
      value: oldAndLarge,
      hint: "Older than a year, or over 2 MB.",
      tab: "cleanup",
      attentionWhenPositive: true,
    },
    {
      id: "flagged-senders",
      label: "Flagged senders",
      value: flaggedSenders,
      hint: "Possible impersonation — header checks only.",
      tab: "security",
      attentionWhenPositive: true,
    },
    {
      id: "snoozed-due",
      label: "Snoozed, due now",
      value: snoozedDue,
      hint: "Waiting to come back to the inbox.",
      tab: "cleanup",
      attentionWhenPositive: true,
    },
    {
      id: "unsubscribe-capable",
      label: "Unsubscribe-capable senders",
      value: unsubscribeCapable,
      hint: "Have a verified one-click unsubscribe.",
      tab: "subscriptions",
      attentionWhenPositive: false,
    },
    {
      id: "screener-queue",
      label: "Held by the Screener",
      value: screenerQueue,
      hint: "First-time senders waiting for a decision.",
      tab: "screener",
      attentionWhenPositive: true,
    },
    {
      id: "done-last-7-days",
      label: "Done in the last 7 days",
      value: doneLast7Days,
      hint: "Actions Cluster took, from Recently done.",
      tab: "recent",
      attentionWhenPositive: false,
    },
  ];

  const metrics: InboxHealthMetric[] = raw.map(({ attentionWhenPositive, ...m }) => ({
    ...m,
    tone: attentionWhenPositive && m.value > 0 ? "attention" : "neutral",
  }));

  return {
    scannedSenders: senders.length,
    scannedMessages: senders.reduce((sum, s) => sum + s.count, 0),
    metrics,
  };
}

function hasUnsub(u: SenderSummary["unsubscribe"]): boolean {
  return Boolean(u.postUrl || u.httpUrl || u.mailto);
}

/**
 * A single deterministic 0–100 "how healthy is this inbox" number, from the
 * three inputs the Overview screen names: unread ratio, sender count (via the
 * never-opened senders), and subscription load (unsubscribe-capable senders),
 * plus a smaller penalty for mail already past its useful life. Pure — no AI,
 * no scanning. 100 is a tidy inbox; the penalties are capped so one bad
 * dimension can't zero the score on its own.
 */
export function inboxHealthScore(senders: SenderSummary[]): number {
  const messages = senders.flatMap((s) => s.messages);
  const total = messages.length || 1;
  const unreadRatio = messages.filter((m) => m.unread).length / total;
  const neverOpened = neverReadSenders(senders).length;
  const unsubCapable = senders.filter((s) => hasUnsub(s.unsubscribe)).length;
  const ready = totalExpiryCount(buildExpiryBuckets(senders));

  let score = 100;
  score -= unreadRatio * 45;
  score -= Math.min(neverOpened, 40) * 0.5;
  score -= Math.min(unsubCapable, 50) * 0.35;
  score -= Math.min(ready / total, 1) * 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** ISO-8601 week label for a timestamp, e.g. "2026-W37". */
export function isoWeek(now: number): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  // Thursday of the current week decides the year.
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const week1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const weekNo =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86_400_000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7,
    );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

const MAX_HISTORY_WEEKS = 12;

/**
 * Append `score` to `history` as this week's data point, oldest first, keeping
 * the last 12 weeks. If the current week already has an entry it's overwritten
 * (the score reflects the latest scan), so opening the dashboard twice in a
 * week doesn't create two bars. Returns a new array — never mutates the input.
 */
export function recordHealthSnapshot(
  history: HealthSnapshot[],
  score: number,
  now: number,
): HealthSnapshot[] {
  const week = isoWeek(now);
  const withoutThisWeek = history.filter((h) => h.week !== week);
  return [...withoutThisWeek, { week, score }].slice(-MAX_HISTORY_WEEKS);
}
