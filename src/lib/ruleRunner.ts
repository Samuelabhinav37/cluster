import { log } from "./log";
import { appendActionLog, makeLogId, type ActionLogEntry } from "./actionLog";
import type { EmailProvider, ProviderId } from "./providers/emailProvider";
import {
  applyRuleRunLimit,
  describeRule,
  matchRule,
  matchRuleMessages,
  orderedRules,
  ruleActions,
  type ClusterRule,
  type RuleActionSpec,
} from "./rules";
import type { SenderSummary } from "./senderModel";

export interface RuleRunResult {
  rule: ClusterRule;
  /** How many messages were actioned, per provider. */
  movedByProvider: Map<ProviderId, number>;
  /** Gmail ids this run trashed or archived — the reversible portion. */
  undoableGmailIds: string[];
  undoVia?: "untrash" | "unarchive";
  /** Providers where at least one ordered action succeeded but a later action failed. */
  partialProviders: ProviderId[];
  /** Eligible messages left untouched because this rule reached its per-run ceiling. */
  deferredByLimitCount: number;
}

// Returns true if the action ran, false if this provider can't do it (Outlook
// has no archive/label/mute wired up yet — those rules just no-op for it).
async function runAction(
  provider: EmailProvider,
  token: string,
  action: RuleActionSpec,
  ids: string[],
): Promise<boolean> {
  switch (action.action) {
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
      if (!provider.labelMessages || !action.labelName) return false;
      await provider.labelMessages(token, ids, action.labelName, action.labelKeepInInbox);
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
  rules: ClusterRule[],
  senders: SenderSummary[],
  providerById: Map<ProviderId, EmailProvider>,
): Promise<RuleRunResult[]> {
  const results: RuleRunResult[] = [];
  const logEntries: ActionLogEntry[] = [];
  const stoppedMessages = new Set<string>();
  const limitBlockedMessages = new Set<string>();

  for (const rule of orderedRules(rules)) {
    if (!rule.enabled) continue;
    const eligible = matchRuleMessages(rule, senders).filter(
      ({ provider, id }) =>
        !stoppedMessages.has(`${provider}:${id}`) && !limitBlockedMessages.has(`${provider}:${id}`),
    );
    const { selected, deferred, deferredCount: deferredByLimitCount } = applyRuleRunLimit(rule, eligible);
    for (const { provider, id } of deferred) limitBlockedMessages.add(`${provider}:${id}`);
    const matched = new Map<ProviderId, string[]>();
    for (const { provider, id } of selected) {
      const ids = matched.get(provider) ?? [];
      ids.push(id);
      matched.set(provider, ids);
    }
    const moved = new Map<ProviderId, number>();
    let undoableGmailIds: string[] = [];
    const actions = ruleActions(rule);
    const partialProviders: ProviderId[] = [];

    for (const [providerId, ids] of matched) {
      if (ids.length === 0) continue;
      const provider = providerById.get(providerId);
      if (!provider) continue;
      const token = await provider.getAuthToken(false).catch((err) => {
        log.error(`Rule "${rule.name}" failed to authenticate for ${providerId}`, err);
        return undefined;
      });
      if (!token) continue;
      let completedActions = 0;
      try {
        for (const action of actions) {
          if (!(await runAction(provider, token, action, ids))) {
            break;
          }
          completedActions += 1;
        }
      } catch (err) {
        log.error(`Rule "${rule.name}" failed for ${providerId}`, err);
      }
      if (completedActions > 0) {
        moved.set(providerId, ids.length);
        if (completedActions < actions.length) partialProviders.push(providerId);
        if (completedActions === actions.length) {
          if (
            actions.length === 1 &&
            providerId === "gmail" &&
            (actions[0].action === "trash" || actions[0].action === "archive")
          ) {
            undoableGmailIds = ids;
          }
          if (rule.stopProcessing) {
            for (const id of ids) stoppedMessages.add(`${providerId}:${id}`);
          }
        }
      }
    }

    const undoVia =
      actions.length === 1 && actions[0].action === "trash"
        ? "untrash"
        : actions.length === 1 && actions[0].action === "archive"
          ? "unarchive"
          : undefined;
    const total = [...moved.values()].reduce((a, b) => a + b, 0);
    if (total > 0 || deferredByLimitCount > 0) {
      logEntries.push({
        id: makeLogId("rule"),
        at: Date.now(),
        kind: "rule",
        summary:
          `Rule "${rule.name}": ${describeRule(rule)} — ${total} message${total === 1 ? "" : "s"} actioned` +
          (partialProviders.length > 0
            ? `; partial action sequence for ${partialProviders.join(", ")}`
            : "") +
          (deferredByLimitCount > 0 ? `; ${deferredByLimitCount} deferred by safety limit` : ""),
        undo:
          undoableGmailIds.length > 0 && undoVia
            ? { provider: "gmail", ids: undoableGmailIds, via: undoVia }
            : undefined,
      });
    }
    results.push({
      rule,
      movedByProvider: moved,
      undoableGmailIds,
      undoVia,
      partialProviders,
      deferredByLimitCount,
    });
  }

  await appendActionLog(logEntries);
  return results;
}

/** Total messages the enabled rules would act on right now — for the confirm
 * prompt, before anything runs. */
export function previewRuleMatches(rules: ClusterRule[], senders: SenderSummary[]): number {
  let total = 0;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const ids of matchRule(rule, senders).values()) total += ids.length;
  }
  return total;
}
