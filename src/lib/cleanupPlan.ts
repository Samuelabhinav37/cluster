// The recommended clean-up: the suggestions (suggestions.ts) as one checked
// list with one button, so a first clean takes two clicks instead of a trip
// through every section. Pure: the dashboard renders the rows and runs them.
//
// - Confidence bands decide what starts ticked. A row is "high" only when
//   the evidence is plain: they stopped sending, or the user has opened none
//   of at least HIGH_CONFIDENCE_JUDGED of their messages. Everything else
//   starts unticked, for the user to opt into.
// - Senders that share one unsubscribe link are one sender to the user (a
//   brand's several "news@", "deals@" addresses): one row, their mail merged.
// - Every action here is reversible: mute and keep-sorted file mail away and
//   can be undone, and clearing old mail archives rather than trashes.
//   Unsubscribe isn't run from here (it has its own verification step); its
//   rows point at Subscriptions.
import type { Suggestion, SuggestionAction } from "./suggestions";

export type Confidence = "high" | "medium";

export interface CleanupRow {
  /** One key per row: the first sender's key. */
  key: string;
  action: SuggestionAction;
  confidence: Confidence;
  /** Start ticked. */
  preChecked: boolean;
  suggestions: Suggestion[];
  messageIds: string[];
  reasons: string[];
}

/** Opened none of at least this many judged messages. */
export const HIGH_CONFIDENCE_JUDGED = 10;

export function confidenceOf(suggestion: Suggestion): Confidence {
  const p = suggestion.profile;
  if (suggestion.action === "clearOld" && !p.stillSending) return "high";
  if (suggestion.action !== "keepSorted" && (p.openRate ?? 1) === 0 && p.judged >= HIGH_CONFIDENCE_JUDGED) {
    return "high";
  }
  return "medium";
}

/** Where a sender's unsubscribe link points, without its per-recipient
 * query string: the same list behind several addresses shares it. */
function unsubscribeTarget(suggestion: Suggestion): string | undefined {
  const u = suggestion.sender.unsubscribe;
  const link = u.postUrl ?? u.httpUrl;
  if (link) {
    try {
      const url = new URL(link);
      return `${url.host}${url.pathname}`.toLowerCase();
    } catch {
      return undefined;
    }
  }
  return u.mailtoParts?.to?.toLowerCase();
}

export function planRecommendedCleanup(suggestions: readonly Suggestion[]): CleanupRow[] {
  const rows: CleanupRow[] = [];
  const byTarget = new Map<string, CleanupRow>();
  for (const suggestion of suggestions) {
    const confidence = confidenceOf(suggestion);
    const target = unsubscribeTarget(suggestion);
    const groupKey = target ? `${suggestion.sender.provider}:${suggestion.action}:${target}` : undefined;
    const existing = groupKey ? byTarget.get(groupKey) : undefined;
    if (existing) {
      existing.suggestions.push(suggestion);
      existing.messageIds.push(...suggestion.safeMessageIds);
      // A merged row is only as sure as its least sure sender.
      if (confidence === "medium") existing.confidence = "medium";
      existing.preChecked = existing.confidence === "high" && existing.action !== "unsubscribe";
      continue;
    }
    const row: CleanupRow = {
      key: suggestion.sender.key,
      action: suggestion.action,
      confidence,
      preChecked: confidence === "high" && suggestion.action !== "unsubscribe",
      suggestions: [suggestion],
      messageIds: [...suggestion.safeMessageIds],
      reasons: suggestion.reasons,
    };
    rows.push(row);
    if (groupKey) byTarget.set(groupKey, row);
  }
  return rows.sort(
    (a, b) => Number(b.preChecked) - Number(a.preChecked) || b.messageIds.length - a.messageIds.length,
  );
}

/** Rows the one button can run (unsubscribe has its own flow). */
export function runnable(rows: readonly CleanupRow[]): CleanupRow[] {
  return rows.filter((row) => row.action !== "unsubscribe");
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * The button's words: the verb, the counts and what stays, so the click is
 * the confirmation. "Mute 3 senders, archive 1,240 old emails from 2 senders
 * and keep 1 sender sorted · starred and protected mail stays".
 */
export function describeCleanup(rows: readonly CleanupRow[]): string {
  const senders = (action: SuggestionAction) =>
    rows.filter((r) => r.action === action).reduce((n, r) => n + r.suggestions.length, 0);
  const messages = (action: SuggestionAction) =>
    rows.filter((r) => r.action === action).reduce((n, r) => n + r.messageIds.length, 0);
  const parts: string[] = [];
  if (senders("mute")) parts.push(`mute ${plural(senders("mute"), "sender")}`);
  if (senders("clearOld")) {
    parts.push(
      `archive ${plural(messages("clearOld"), "old email")} from ${plural(senders("clearOld"), "sender")}`,
    );
  }
  if (senders("keepSorted")) parts.push(`keep ${plural(senders("keepSorted"), "sender")} sorted`);
  if (parts.length === 0) return "";
  const sentence =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} · starred and protected mail stays`;
}
