import type { MessageKind } from "./messageKind";

// Standing user-defined rules — Declutter's answer to Clean Email's "Auto
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

export interface DeclutterRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleConditions;
  action: RuleAction;
  /** Required when action === "label". Nested under "Declutter/" by convention. */
  labelName?: string;
}
