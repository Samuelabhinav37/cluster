import { categorizeDomain, DOMAIN_CATEGORY_LABELS, type DomainCategory } from "./domainCategories";
import { domainOf } from "./domainGrouping";
import type { MessageKind } from "./messageKind";
import type { ProviderId } from "./providers/emailProvider";
import type { SenderSummary } from "./senderModel";

// Standing user-defined rules — Cluster's answer to Clean Email's "Auto
// Clean". Conditions are deterministic metadata predicates; Rules v2 adds
// exceptions, priority, stop-processing, and ordered actions while retaining
// the original single-action fields for stored-rule compatibility. Applied by
// ruleRunner.ts from both the dashboard ("Apply now") and the background alarm.
//
// Hard limits, enforced by matchRule (Phase 2) and ruleRunner:
// - starred/flagged mail is always excluded, no matter what a rule says;
// - the only actions are label / archive / trash / markRead — never permanent
//   delete;
// - a rule with zero conditions matches nothing (not everything).

export type RuleAction = "label" | "archive" | "trash" | "markRead";

export interface RuleActionSpec {
  action: RuleAction;
  labelName?: string;
  labelKeepInInbox?: boolean;
}

export interface RuleConditions {
  /** Registrable-ish domain of the From address, e.g. "example.com". */
  fromDomain?: string;
  /** Curated domain category of the From address (see domainCategories.ts).
   * Powers the "keep sorting" rules that "Sort my inbox" offers to save. */
  fromDomainCategory?: DomainCategory;
  /** Exact From address, lowercased. */
  fromAddress?: string;
  /** Message received at least this many days ago. */
  olderThanDays?: number;
  /** Message has any List-Unsubscribe entry. */
  hasUnsubscribe?: boolean;
  /** Heuristic message kind (see messageKind.ts). */
  kind?: MessageKind;
  /** Message is still unread. */
  unread?: boolean;
}

export interface ClusterRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleConditions;
  /** A matching message is excluded when all populated exception fields match. */
  exceptions?: RuleConditions;
  /** Higher-priority rules run first. Defaults to 0. */
  priority?: number;
  /** Prevent later rules from processing messages successfully handled here. */
  stopProcessing?: boolean;
  /** Hard ceiling for one execution. Excess matches remain untouched and are
   * reported as deferred. Legacy rules use DEFAULT_RULE_MAX_MESSAGES_PER_RUN. */
  maxMessagesPerRun?: number;
  /** Ordered Rules v2 actions. When absent, the legacy action fields below are used. */
  actions?: RuleActionSpec[];
  action: RuleAction;
  /** Required when action === "label". Nested under "Cluster/" by convention. */
  labelName?: string;
  /** For action === "label": leave the message in the inbox instead of filing
   * it out. Set by the "keep sorting" rules "Sort my inbox" saves for
   * label-in-place buckets (Shopping, Finance, …). */
  labelKeepInInbox?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_RULE_MAX_MESSAGES_PER_RUN = 100;
export const MAX_RULE_MAX_MESSAGES_PER_RUN = 500;

export function ruleRunLimit(rule: ClusterRule): number {
  const configured = Number.isFinite(rule.maxMessagesPerRun)
    ? Math.floor(rule.maxMessagesPerRun!)
    : DEFAULT_RULE_MAX_MESSAGES_PER_RUN;
  return Math.max(1, Math.min(MAX_RULE_MAX_MESSAGES_PER_RUN, configured));
}

export function applyRuleRunLimit<T>(
  rule: ClusterRule,
  items: T[],
): { selected: T[]; deferred: T[]; deferredCount: number } {
  const limit = ruleRunLimit(rule);
  const selected = items.slice(0, limit);
  const deferred = items.slice(limit);
  return { selected, deferred, deferredCount: deferred.length };
}

/** A rule needs at least one condition — an all-empty rule matches nothing, so
 * a mis-saved rule can never sweep an entire inbox. */
export function ruleHasConditions(c: RuleConditions): boolean {
  return Object.values(c).some((v) => v !== undefined && v !== "");
}

function senderHasUnsubscribe(sender: SenderSummary): boolean {
  const u = sender.unsubscribe;
  return Boolean(u.postUrl || u.httpUrl || u.mailto);
}

function conditionsMatch(
  conditions: RuleConditions,
  sender: SenderSummary,
  message: SenderSummary["messages"][number],
  now: number,
): boolean {
  if (conditions.fromAddress && sender.address !== conditions.fromAddress.toLowerCase()) return false;
  if (conditions.fromDomain && domainOf(sender.address) !== conditions.fromDomain.toLowerCase()) return false;
  if (
    conditions.fromDomainCategory &&
    categorizeDomain(domainOf(sender.address)) !== conditions.fromDomainCategory
  ) {
    return false;
  }
  if (conditions.hasUnsubscribe !== undefined && senderHasUnsubscribe(sender) !== conditions.hasUnsubscribe) {
    return false;
  }
  if (conditions.kind && message.kind !== conditions.kind) return false;
  if (conditions.unread !== undefined && message.unread !== conditions.unread) return false;
  if (
    conditions.olderThanDays !== undefined &&
    now - message.receivedAt < conditions.olderThanDays * DAY_MS
  ) {
    return false;
  }
  return true;
}

export type RuleMessageDecision = "matched" | "protected" | "exception" | "conditions-miss";

export interface RuleMessageMatch {
  provider: ProviderId;
  id: string;
}

/** Explain why one message is or is not eligible for a rule. */
export function evaluateRuleMessage(
  rule: ClusterRule,
  sender: SenderSummary,
  message: SenderSummary["messages"][number],
  now = Date.now(),
): RuleMessageDecision {
  if (!ruleHasConditions(rule.conditions) || !conditionsMatch(rule.conditions, sender, message, now)) {
    return "conditions-miss";
  }
  if (message.isProtected) return "protected";
  if (
    rule.exceptions &&
    ruleHasConditions(rule.exceptions) &&
    conditionsMatch(rule.exceptions, sender, message, now)
  ) {
    return "exception";
  }
  return "matched";
}

/**
 * Message ids this rule would act on, grouped by provider. Sender-level
 * conditions (from address/domain, has-unsubscribe) are checked once per
 * sender; message-level ones (age, kind, unread) per message. Starred/flagged
 * mail is always excluded regardless of the rule.
 */
export function matchRule(
  rule: ClusterRule,
  senders: SenderSummary[],
  now = Date.now(),
): Map<ProviderId, string[]> {
  const out = new Map<ProviderId, string[]>();
  for (const match of matchRuleMessages(rule, senders, now)) {
    const list = out.get(match.provider);
    if (list) list.push(match.id);
    else out.set(match.provider, [match.id]);
  }
  return out;
}

/** Flat matches in the original sender/message traversal order. */
export function matchRuleMessages(
  rule: ClusterRule,
  senders: SenderSummary[],
  now = Date.now(),
): RuleMessageMatch[] {
  const matches: RuleMessageMatch[] = [];
  for (const sender of senders) {
    for (const message of sender.messages) {
      if (evaluateRuleMessage(rule, sender, message, now) === "matched") {
        matches.push({ provider: sender.provider, id: message.id });
      }
    }
  }
  return matches;
}

export function ruleActions(rule: ClusterRule): RuleActionSpec[] {
  return rule.actions?.length
    ? rule.actions
    : [
        {
          action: rule.action,
          labelName: rule.labelName,
          labelKeepInInbox: rule.labelKeepInInbox,
        },
      ];
}

export function orderedRules(rules: ClusterRule[]): ClusterRule[] {
  return rules
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => (b.rule.priority ?? 0) - (a.rule.priority ?? 0) || a.index - b.index)
    .map(({ rule }) => rule);
}

/** Replace a generated rule by stable name while preserving its receipt identity. */
export function upsertRuleByName(rules: ClusterRule[], rule: ClusterRule): ClusterRule[] {
  const existing = rules.find((item) => item.name === rule.name);
  return [...rules.filter((item) => item.name !== rule.name), { ...rule, id: existing?.id ?? rule.id }];
}

export interface RuleConflict {
  provider: ProviderId;
  messageId: string;
  ruleIds: string[];
}

/** Identifies overlapping enabled rules before execution. */
export function findRuleConflicts(rules: ClusterRule[], senders: SenderSummary[]): RuleConflict[] {
  const owners = new Map<string, string[]>();
  for (const rule of orderedRules(rules).filter((item) => item.enabled)) {
    for (const [provider, ids] of matchRule(rule, senders)) {
      for (const id of ids) {
        const key = `${provider}:${id}`;
        const ruleIds = owners.get(key) ?? [];
        ruleIds.push(rule.id);
        owners.set(key, ruleIds);
      }
    }
  }
  return [...owners.entries()]
    .filter(([, ruleIds]) => ruleIds.length > 1)
    .map(([key, ruleIds]) => {
      const split = key.indexOf(":");
      return {
        provider: key.slice(0, split) as ProviderId,
        messageId: key.slice(split + 1),
        ruleIds,
      };
    });
}

const ACTION_PHRASE: Record<RuleAction, string> = {
  label: "→ label",
  archive: "→ archive",
  trash: "→ move to Trash",
  markRead: "→ mark read",
};

/** Human-readable one-liner for the rules list. */
export function describeRule(rule: ClusterRule): string {
  const c = rule.conditions;
  const parts: string[] = [c.kind ? `${c.kind} messages` : "messages"];
  if (c.fromAddress) parts.push(`from ${c.fromAddress}`);
  else if (c.fromDomain) parts.push(`from @${c.fromDomain}`);
  else if (c.fromDomainCategory) parts.push(`from ${DOMAIN_CATEGORY_LABELS[c.fromDomainCategory]} senders`);
  if (c.hasUnsubscribe === true) parts.push("with an unsubscribe link");
  if (c.hasUnsubscribe === false) parts.push("with no unsubscribe link");
  if (c.unread === true) parts.push("still unread");
  if (c.unread === false) parts.push("already read");
  if (c.olderThanDays !== undefined) parts.push(`older than ${c.olderThanDays} days`);
  if (rule.exceptions && ruleHasConditions(rule.exceptions)) parts.push("with exceptions");
  const actions = ruleActions(rule).map((spec) =>
    spec.action === "label"
      ? `${ACTION_PHRASE.label} "${spec.labelName ?? "?"}"`
      : ACTION_PHRASE[spec.action],
  );
  return `${parts.join(" ")} ${actions.join(", then ")}`;
}
