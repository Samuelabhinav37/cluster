import type { EmailProvider, ProviderId } from "./providers/emailProvider";
import {
  applyRuleRunLimit,
  evaluateRuleMessage,
  orderedRules,
  ruleActions,
  type ClusterRule,
  type RuleActionSpec,
} from "./rules";
import type { SenderSummary } from "./senderModel";

export interface RuleActionSupport {
  action: RuleActionSpec["action"];
  labelName?: string;
  supported: boolean;
}

export interface RuleDryRunProviderImpact {
  provider: ProviderId;
  eligibleMessageCount: number;
  actionableMessageCount: number;
  completion: "full" | "partial" | "none";
  actions: RuleActionSupport[];
}

export interface RuleDryRunSenderImpact {
  senderKey: string;
  provider: ProviderId;
  address: string;
  displayName: string;
  eligibleMessageCount: number;
}

export interface RuleDryRunImpact {
  rule: ClusterRule;
  rawMatchCount: number;
  effectiveMatchCount: number;
  actionableMessageCount: number;
  protectedExcludedCount: number;
  exceptionExcludedCount: number;
  overlapCount: number;
  stoppedByEarlierRuleCount: number;
  blockedByEarlierLimitCount: number;
  deferredByLimitCount: number;
  providers: RuleDryRunProviderImpact[];
  senders: RuleDryRunSenderImpact[];
}

export interface RuleDryRunReport {
  enabledRuleCount: number;
  uniqueMatchedMessageCount: number;
  predictedRuleApplicationCount: number;
  overlapMessageCount: number;
  protectedExclusionCount: number;
  exceptionExclusionCount: number;
  deferredByLimitCount: number;
  impacts: RuleDryRunImpact[];
}

interface RawMatch {
  key: string;
  provider: ProviderId;
  sender: SenderSummary;
}

function actionSupported(provider: EmailProvider | undefined, action: RuleActionSpec): boolean {
  if (!provider) return false;
  if (action.action === "trash") return true;
  if (action.action === "archive") return Boolean(provider.archiveMessages);
  if (action.action === "markRead") return Boolean(provider.markReadMessages);
  return Boolean(provider.labelMessages && action.labelName);
}

function providerImpact(
  providerId: ProviderId,
  count: number,
  actions: RuleActionSpec[],
  providerById: Map<ProviderId, EmailProvider>,
): RuleDryRunProviderImpact {
  const provider = providerById.get(providerId);
  const support = actions.map((action) => ({
    action: action.action,
    labelName: action.labelName,
    supported: actionSupported(provider, action),
  }));
  const completedPrefix = support.findIndex((item) => !item.supported);
  const completedActions = completedPrefix < 0 ? support.length : completedPrefix;
  const completion =
    completedActions === support.length ? "full" : completedActions === 0 ? "none" : "partial";
  return {
    provider: providerId,
    eligibleMessageCount: count,
    actionableMessageCount: completion === "none" ? 0 : count,
    completion,
    actions: support,
  };
}

/**
 * Simulate enabled rules in priority order without provider calls. The report
 * assumes supported actions succeed; runtime failures remain possible and are
 * recorded by the real runner as partial results.
 */
export function buildRuleDryRunReport(
  rules: ClusterRule[],
  senders: SenderSummary[],
  providerById: Map<ProviderId, EmailProvider>,
  now = Date.now(),
): RuleDryRunReport {
  const enabledRules = orderedRules(rules).filter((rule) => rule.enabled);
  const owners = new Map<string, number>();
  const stoppedMessages = new Set<string>();
  const limitBlockedMessages = new Set<string>();
  const impacts: RuleDryRunImpact[] = [];

  for (const rule of enabledRules) {
    const rawMatches: RawMatch[] = [];
    let protectedExcludedCount = 0;
    let exceptionExcludedCount = 0;
    for (const sender of senders) {
      for (const message of sender.messages) {
        const decision = evaluateRuleMessage(rule, sender, message, now);
        if (decision === "protected") protectedExcludedCount += 1;
        if (decision === "exception") exceptionExcludedCount += 1;
        if (decision === "matched") {
          rawMatches.push({
            key: `${sender.provider}:${message.id}`,
            provider: sender.provider,
            sender,
          });
        }
      }
    }

    const overlapCount = rawMatches.filter(({ key }) => (owners.get(key) ?? 0) > 0).length;
    for (const { key } of rawMatches) owners.set(key, (owners.get(key) ?? 0) + 1);
    const stoppedByEarlierRuleCount = rawMatches.filter(({ key }) => stoppedMessages.has(key)).length;
    const blockedByEarlierLimitCount = rawMatches.filter(({ key }) => limitBlockedMessages.has(key)).length;
    const eligibleAfterStops = rawMatches.filter(
      ({ key }) => !stoppedMessages.has(key) && !limitBlockedMessages.has(key),
    );
    const {
      selected: effectiveMatches,
      deferred,
      deferredCount: deferredByLimitCount,
    } = applyRuleRunLimit(rule, eligibleAfterStops);
    for (const { key } of deferred) limitBlockedMessages.add(key);
    const actions = ruleActions(rule);

    const matchesByProvider = new Map<ProviderId, RawMatch[]>();
    for (const match of effectiveMatches) {
      const list = matchesByProvider.get(match.provider) ?? [];
      list.push(match);
      matchesByProvider.set(match.provider, list);
    }
    const providers = [...matchesByProvider.entries()].map(([provider, matches]) =>
      providerImpact(provider, matches.length, actions, providerById),
    );

    if (rule.stopProcessing) {
      const fullySupportedProviders = new Set(
        providers.filter(({ completion }) => completion === "full").map(({ provider }) => provider),
      );
      for (const match of effectiveMatches) {
        if (fullySupportedProviders.has(match.provider)) stoppedMessages.add(match.key);
      }
    }

    const senderCounts = new Map<string, RuleDryRunSenderImpact>();
    for (const { sender } of effectiveMatches) {
      const current = senderCounts.get(sender.key);
      if (current) current.eligibleMessageCount += 1;
      else {
        senderCounts.set(sender.key, {
          senderKey: sender.key,
          provider: sender.provider,
          address: sender.address,
          displayName: sender.displayName,
          eligibleMessageCount: 1,
        });
      }
    }

    impacts.push({
      rule,
      rawMatchCount: rawMatches.length,
      effectiveMatchCount: effectiveMatches.length,
      actionableMessageCount: providers.reduce((sum, item) => sum + item.actionableMessageCount, 0),
      protectedExcludedCount,
      exceptionExcludedCount,
      overlapCount,
      stoppedByEarlierRuleCount,
      blockedByEarlierLimitCount,
      deferredByLimitCount,
      providers,
      senders: [...senderCounts.values()].sort(
        (a, b) => b.eligibleMessageCount - a.eligibleMessageCount || a.address.localeCompare(b.address),
      ),
    });
  }

  return {
    enabledRuleCount: enabledRules.length,
    uniqueMatchedMessageCount: owners.size,
    predictedRuleApplicationCount: impacts.reduce((sum, impact) => sum + impact.actionableMessageCount, 0),
    overlapMessageCount: [...owners.values()].filter((count) => count > 1).length,
    protectedExclusionCount: impacts.reduce((sum, impact) => sum + impact.protectedExcludedCount, 0),
    exceptionExclusionCount: impacts.reduce((sum, impact) => sum + impact.exceptionExcludedCount, 0),
    deferredByLimitCount: impacts.reduce((sum, impact) => sum + impact.deferredByLimitCount, 0),
    impacts,
  };
}

export function describeActionSupport(action: RuleActionSupport): string {
  const name = action.action === "label" ? `label “${action.labelName ?? "missing"}”` : action.action;
  return `${name} ${action.supported ? "supported" : "unsupported"}`;
}
