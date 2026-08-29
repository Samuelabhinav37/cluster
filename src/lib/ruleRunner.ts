import { appendActionLog, makeLogId, type ActionLogEntry } from "./actionLog";
import type { EmailProvider, ProviderId } from "./providers/emailProvider";
import { describeRule, matchRule, type ClutterRule, type RuleAction } from "./rules";
import type { SenderSummary } from "./senderModel";

export interface RuleRunResult {
  rule: ClutterRule;
  /** How many messages were actioned, per provider. */
  movedByProvider: Map<ProviderId, number>;
  /** Gmail ids this run trashed or archived — the reversible portion. */
  undoableGmailIds: string[];
  undoVia?: "untrash" | "unarchive";
}

// Returns true if the action ran, false if this provider can't do it (Outlook
// has no archive/label/mute wired up yet — those rules just no-op for it).
async function runAction(
  provider: EmailProvider,
  token: string,
  action: RuleAction,
  labelName: string | undefined,
  ids: string[],
): Promise<boolean> {
  switch (action) {
    case "trash":
      await provider.trashMessages(token, ids);
      return true;
    case "archive":
      if (!provider.archiveMessages) return false;
      await provider.archiveMessages(token, ids);
      return true;
    case "markRead":
      if (!provider.markReadMessages) return false;
      await provider.markReadMessages(token, ids);
      return true;
    case "label":
      if (!provider.labelMessages || !labelName) return false;
      await provider.labelMessages(token, ids, labelName);
      return true;
  }
}

/**
 * Apply every enabled rule to the current scan. Called from the dashboard
 * ("Apply enabled rules now") and the background triage alarm. Never touches
 * starred/flagged mail (matchRule excludes it) and never permanently deletes.
 * Writes one action-log entry per rule that actioned anything.
 */
export async function applyRules(
  rules: ClutterRule[],
  senders: SenderSummary[],
  providerById: Map<ProviderId, EmailProvider>,
): Promise<RuleRunResult[]> {
  const results: RuleRunResult[] = [];
  const logEntries: ActionLogEntry[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const matched = matchRule(rule, senders);
    const moved = new Map<ProviderId, number>();
    let undoableGmailIds: string[] = [];

    for (const [providerId, ids] of matched) {
      if (ids.length === 0) continue;
      const provider = providerById.get(providerId);
      if (!provider) continue;
      try {
        const token = await provider.getAuthToken(false);
        if (await runAction(provider, token, rule.action, rule.labelName, ids)) {
          moved.set(providerId, ids.length);
          if (providerId === "gmail" && (rule.action === "trash" || rule.action === "archive")) {
            undoableGmailIds = ids;
          }
        }
      } catch (err) {
        console.error(`Rule "${rule.name}" failed for ${providerId}`, err);
      }
    }

    const undoVia = rule.action === "trash" ? "untrash" : rule.action === "archive" ? "unarchive" : undefined;
    const total = [...moved.values()].reduce((a, b) => a + b, 0);
    if (total > 0) {
      logEntries.push({
        id: makeLogId("rule"),
        at: Date.now(),
        kind: "rule",
        summary: `Rule "${rule.name}": ${describeRule(rule)} — ${total} message${total === 1 ? "" : "s"}`,
        undo:
          undoableGmailIds.length > 0 && undoVia
            ? { provider: "gmail", ids: undoableGmailIds, via: undoVia }
            : undefined,
      });
    }
    results.push({ rule, movedByProvider: moved, undoableGmailIds, undoVia });
  }

  await appendActionLog(logEntries);
  return results;
}

/** Total messages the enabled rules would act on right now — for the confirm
 * prompt, before anything runs. */
export function previewRuleMatches(rules: ClutterRule[], senders: SenderSummary[]): number {
  let total = 0;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const ids of matchRule(rule, senders).values()) total += ids.length;
  }
  return total;
}
