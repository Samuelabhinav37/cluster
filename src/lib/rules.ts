import { categorizeDomain, DOMAIN_CATEGORY_LABELS, type DomainCategory } from "./domainCategories";
import { domainOf } from "./domainGrouping";
import type { MessageKind } from "./messageKind";
import type { ProviderId } from "./providers/emailProvider";
import type { SenderSummary } from "./senderModel";

// Standing user-defined rules — Cluster's answer to Clean Email's "Auto
// Clean". A rule is a set of AND-ed conditions over a single message plus one
// action. Evaluated against already-fetched metadata only (no body), applied by
// ruleRunner.ts from both the dashboard ("Apply now") and the background alarm.
//
// Hard limits, enforced by matchRule (Phase 2) and ruleRunner:
// - starred/flagged mail is always excluded, no matter what a rule says;
// - the only actions are label / archive / trash / markRead — never permanent
//   delete;
// - a rule with zero conditions matches nothing (not everything).

export type RuleAction = "label" | "archive" | "trash" | "markRead";

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
  action: RuleAction;
  /** Required when action === "label". Nested under "Cluster/" by convention. */
  labelName?: string;
  /** For action === "label": leave the message in the inbox instead of filing
   * it out. Set by the "keep sorting" rules "Sort my inbox" saves for
   * label-in-place buckets (Shopping, Finance, …). */
  labelKeepInInbox?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A rule needs at least one condition — an all-empty rule matches nothing, so
 * a mis-saved rule can never sweep an entire inbox. */
export function ruleHasConditions(c: RuleConditions): boolean {
  return Object.values(c).some((v) => v !== undefined && v !== "");
}

function senderHasUnsubscribe(sender: SenderSummary): boolean {
  const u = sender.unsubscribe;
  return Boolean(u.postUrl || u.httpUrl || u.mailto);
}

/**
 * Message ids this rule would act on, grouped by provider. Sender-level
 * conditions (from address/domain, has-unsubscribe) are checked once per
 * sender; message-level ones (age, kind, unread) per message. Starred/flagged
 * mail is always excluded regardless of the rule.
 */
export function matchRule(rule: ClusterRule, senders: SenderSummary[]): Map<ProviderId, string[]> {
  const out = new Map<ProviderId, string[]>();
  const c = rule.conditions;
  if (!ruleHasConditions(c)) return out;
  const now = Date.now();

  for (const sender of senders) {
    if (c.fromAddress && sender.address !== c.fromAddress.toLowerCase()) continue;
    if (c.fromDomain && domainOf(sender.address) !== c.fromDomain.toLowerCase()) continue;
    if (c.fromDomainCategory && categorizeDomain(domainOf(sender.address)) !== c.fromDomainCategory) continue;
    if (c.hasUnsubscribe !== undefined && senderHasUnsubscribe(sender) !== c.hasUnsubscribe) continue;

    for (const m of sender.messages) {
      if (m.isProtected) continue;
      if (c.kind && m.kind !== c.kind) continue;
      if (c.unread !== undefined && m.unread !== c.unread) continue;
      if (c.olderThanDays !== undefined && now - m.receivedAt < c.olderThanDays * DAY_MS) continue;

      const list = out.get(sender.provider);
      if (list) list.push(m.id);
      else out.set(sender.provider, [m.id]);
    }
  }
  return out;
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
  const action =
    rule.action === "label" ? `${ACTION_PHRASE.label} "${rule.labelName ?? "?"}"` : ACTION_PHRASE[rule.action];
  return `${parts.join(" ")} ${action}`;
}
