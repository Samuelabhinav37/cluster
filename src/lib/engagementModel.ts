import type { SenderSummary } from "./senderModel";

/**
 * A privacy-preserving behavioral summary. Cluster stores counts and ratios,
 * never message ids, subjects, or bodies. A snapshot is counted only when its
 * aggregate state changes, so opening the dashboard repeatedly cannot inflate
 * confidence.
 */
export interface SenderEngagementRecord {
  samples: number;
  unreadRatioEma: number;
  lastObservedLatestMessageAt: number;
  lastObservedCount: number;
  lastObservedUnreadCount: number;
  lastSeenAt: number;
  acceptedActions: number;
  dismissedSuggestions: number;
  undoneActions: number;
  snoozedUntil?: number;
}

export type SenderEngagementMap = Record<string, SenderEngagementRecord>;
export type EngagementFeedback = "accept" | "dismiss" | "undo";
export type EngagementSuggestionAction = "unsubscribe" | "mute" | "review";

export interface EngagementSuggestion {
  sender: SenderSummary;
  score: number;
  confidence: "medium" | "high";
  reasons: string[];
  suggestedAction: EngagementSuggestionAction;
  safeMessageIds: string[];
}

const EMA_CURRENT_WEIGHT = 0.35;
const MAX_SAMPLES = 100;
const MAX_RECORDS = 1_000;
const RECORD_TTL_MS = 365 * 24 * 60 * 60 * 1_000;
export const SUGGESTION_DISMISS_MS = 30 * 24 * 60 * 60 * 1_000;

function emptyRecord(now: number): SenderEngagementRecord {
  return {
    samples: 0,
    unreadRatioEma: 0,
    lastObservedLatestMessageAt: 0,
    lastObservedCount: 0,
    lastObservedUnreadCount: 0,
    lastSeenAt: now,
    acceptedActions: 0,
    dismissedSuggestions: 0,
    undoneActions: 0,
  };
}

function safeMessages(sender: SenderSummary) {
  return sender.messages.filter((message) => !message.isProtected);
}

/** Merge changed, aggregate-only observations and prune stale/old records. */
export function updateEngagementObservations(
  existing: SenderEngagementMap,
  senders: SenderSummary[],
  now = Date.now(),
): SenderEngagementMap {
  const next: SenderEngagementMap = {};
  const cutoff = now - RECORD_TTL_MS;
  for (const [key, record] of Object.entries(existing)) {
    if (record.lastSeenAt >= cutoff) next[key] = { ...record };
  }

  for (const sender of senders) {
    const messages = safeMessages(sender);
    if (messages.length === 0) continue;
    const unreadCount = messages.filter((message) => message.unread).length;
    const latestMessageAt = Math.max(...messages.map((message) => message.receivedAt));
    const previous = next[sender.key] ?? emptyRecord(now);
    const changed =
      previous.lastObservedCount !== messages.length ||
      previous.lastObservedUnreadCount !== unreadCount ||
      previous.lastObservedLatestMessageAt !== latestMessageAt;

    if (!changed) {
      next[sender.key] = { ...previous, lastSeenAt: now };
      continue;
    }

    const currentRatio = unreadCount / messages.length;
    const unreadRatioEma =
      previous.samples === 0
        ? currentRatio
        : previous.unreadRatioEma * (1 - EMA_CURRENT_WEIGHT) + currentRatio * EMA_CURRENT_WEIGHT;
    next[sender.key] = {
      ...previous,
      samples: Math.min(MAX_SAMPLES, previous.samples + 1),
      unreadRatioEma,
      lastObservedLatestMessageAt: latestMessageAt,
      lastObservedCount: messages.length,
      lastObservedUnreadCount: unreadCount,
      lastSeenAt: now,
    };
  }

  return Object.fromEntries(
    Object.entries(next)
      .sort(([, a], [, b]) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, MAX_RECORDS),
  );
}

export function recordEngagementFeedback(
  existing: SenderEngagementMap,
  senderKeys: string[],
  feedback: EngagementFeedback,
  now = Date.now(),
): SenderEngagementMap {
  const next = { ...existing };
  for (const key of new Set(senderKeys)) {
    const current = next[key] ?? emptyRecord(now);
    next[key] = {
      ...current,
      lastSeenAt: now,
      acceptedActions: current.acceptedActions + (feedback === "accept" ? 1 : 0),
      dismissedSuggestions: current.dismissedSuggestions + (feedback === "dismiss" ? 1 : 0),
      undoneActions: current.undoneActions + (feedback === "undo" ? 1 : 0),
      snoozedUntil: feedback === "dismiss" ? now + SUGGESTION_DISMISS_MS : current.snoozedUntil,
    };
  }
  return next;
}

function suggestionAction(sender: SenderSummary): EngagementSuggestionAction {
  if (sender.unsubscribe.postUrl || sender.unsubscribe.httpUrl || sender.unsubscribe.mailto) {
    return "unsubscribe";
  }
  return sender.provider === "gmail" ? "mute" : "review";
}

/**
 * Build conservative, explainable suggestions. `score` is a deterministic fit
 * score, not a probability. Protected senders and recently dismissed advice
 * are deliberately excluded.
 */
export function buildEngagementSuggestions(
  senders: SenderSummary[],
  observations: SenderEngagementMap,
  now = Date.now(),
): EngagementSuggestion[] {
  const suggestions: EngagementSuggestion[] = [];
  for (const sender of senders) {
    if (sender.protectedMessageIds.length > 0) continue;
    const messages = safeMessages(sender);
    const record = observations[sender.key];
    if (!record || messages.length < 3 || (record.snoozedUntil && record.snoozedUntil > now)) continue;

    const unreadCount = messages.filter((message) => message.unread).length;
    const currentRatio = unreadCount / messages.length;
    const hasEnoughHistory = record.samples >= 2 || (messages.length >= 5 && currentRatio === 1);
    if (!hasEnoughHistory || currentRatio < 2 / 3 || record.unreadRatioEma < 0.7) continue;

    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          currentRatio * 50 +
            record.unreadRatioEma * 25 +
            Math.min(record.samples, 5) * 3 +
            Math.min(record.acceptedActions, 2) * 4 -
            record.dismissedSuggestions * 8 -
            record.undoneActions * 25,
        ),
      ),
    );
    if (score < 70) continue;

    const unreadPercent = Math.round(currentRatio * 100);
    const historyPercent = Math.round(record.unreadRatioEma * 100);
    suggestions.push({
      sender,
      score,
      confidence: record.samples >= 3 && score >= 82 ? "high" : "medium",
      reasons: [
        `${unreadPercent}% of ${messages.length} current messages are unread`,
        `${historyPercent}% rolling unread pattern across ${record.samples} changed snapshot${record.samples === 1 ? "" : "s"}`,
        "No starred or flagged messages are included",
      ],
      suggestedAction: suggestionAction(sender),
      safeMessageIds: messages.map((message) => message.id),
    });
  }
  return suggestions.sort((a, b) => b.score - a.score || b.safeMessageIds.length - a.safeMessageIds.length);
}
