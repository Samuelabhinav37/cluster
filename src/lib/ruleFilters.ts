// A rule Gmail can run on its own becomes a Gmail filter, so it keeps working
// with Chrome closed. Gmail filters only see the sender (no age, kind or
// read state), so rules with those conditions stay with Cluster's runner.
import { createFilter, deleteFilter, getOrCreateLabel, listFilters, type GmailFilterCriteria } from "./gmailApi";
import { ruleActions, type ClusterRule, type RuleConditions } from "./rules";

export interface FilterPlan {
  criteria: GmailFilterCriteria;
  /** A user label to add, by name; resolved to an id when synced. */
  labelName?: string;
  addLabelIds: string[];
  removeLabelIds: string[];
}

const fromOf = (c: RuleConditions) => c.fromAddress?.toLowerCase() ?? (c.fromDomain ? c.fromDomain.toLowerCase() : undefined);

/** Only the sender: anything else (age, kind, read, unsubscribe link, a
 * category) needs Cluster's own runner. */
function senderOnly(c: RuleConditions): boolean {
  return Object.entries(c).every(([k, v]) => v === undefined || v === "" || k === "fromAddress" || k === "fromDomain");
}

/** The Gmail filter for a rule, or null when Gmail can't express it. */
export function gmailFilterFor(rule: ClusterRule): FilterPlan | null {
  const from = fromOf(rule.conditions);
  if (!rule.enabled || !from || !senderOnly(rule.conditions)) return null;
  const except = rule.exceptions ? fromOf(rule.exceptions) : undefined;
  if (rule.exceptions && (!senderOnly(rule.exceptions) || (Object.values(rule.exceptions).some(Boolean) && !except)))
    return null;
  const plan: FilterPlan = { criteria: { from }, addLabelIds: [], removeLabelIds: [] };
  if (except) plan.criteria.negatedQuery = `from:${except}`;
  const actions = ruleActions(rule);
  // Gmail allows one user label per filter.
  if (actions.filter((a) => a.action === "label").length > 1) return null;
  for (const a of actions) {
    if (a.action === "label") {
      if (!a.labelName) return null;
      plan.labelName = a.labelName;
      if (!a.labelKeepInInbox) plan.removeLabelIds.push("INBOX");
    } else if (a.action === "archive") plan.removeLabelIds.push("INBOX");
    else if (a.action === "markRead") plan.removeLabelIds.push("UNREAD");
    else if (a.action === "trash") plan.addLabelIds.push("TRASH");
  }
  plan.removeLabelIds = [...new Set(plan.removeLabelIds)];
  return plan;
}

/** A fingerprint of what the filter does, to tell when a rule's filter is stale. */
export function filterSpec(plan: FilterPlan): string {
  return JSON.stringify([plan.criteria, plan.labelName ?? "", plan.addLabelIds, plan.removeLabelIds]);
}

export interface RuleFilterRecord {
  id: string;
  spec: string;
}

/** Makes Gmail's filters match the rules: one per expressible rule, replaced
 * when the rule changes, deleted when the rule goes or can't be expressed. */
export async function syncRuleFilters(
  rules: readonly ClusterRule[],
  existing: Readonly<Record<string, RuleFilterRecord>>,
  token: string,
): Promise<Record<string, RuleFilterRecord>> {
  const next: Record<string, RuleFilterRecord> = {};
  const wanted = new Map<string, FilterPlan>();
  for (const rule of rules) {
    const plan = gmailFilterFor(rule);
    if (plan) wanted.set(rule.id, plan);
  }
  // A filter deleted in Gmail by hand is recreated.
  const live = new Set((await listFilters(token)).map((f) => f.id));
  for (const [ruleId, record] of Object.entries(existing)) {
    const plan = wanted.get(ruleId);
    if (plan && filterSpec(plan) === record.spec && live.has(record.id)) {
      next[ruleId] = record;
      continue;
    }
    if (live.has(record.id)) await deleteFilter(token, record.id);
  }
  for (const [ruleId, plan] of wanted) {
    if (next[ruleId]) continue;
    const add = [...plan.addLabelIds];
    if (plan.labelName) add.push(await getOrCreateLabel(token, plan.labelName));
    const id = await createFilter(token, plan.criteria, {
      ...(add.length ? { addLabelIds: add } : {}),
      ...(plan.removeLabelIds.length ? { removeLabelIds: plan.removeLabelIds } : {}),
    });
    next[ruleId] = { id, spec: filterSpec(plan) };
  }
  return next;
}
