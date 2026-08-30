import type { MessageRecord, SenderSummary } from "./senderModel";

export type ProtectionReason = "starred-or-flagged" | "transactional" | "sensitive-subject";

export interface ProtectionDecision {
  protected: boolean;
  reason?: ProtectionReason;
}

const SENSITIVE_SUBJECT =
  /\b(tax|w-?2|1099|ticket|boarding pass|reservation|booking|appointment|password reset|security alert|new sign[- ]?in|account recovery|legal notice)\b/i;

/** Central guard used by mixed unsubscribe/cleanup operations. */
export function protectionDecision(message: MessageRecord): ProtectionDecision {
  if (message.isProtected) return { protected: true, reason: "starred-or-flagged" };
  if (["receipt", "shipping", "otp"].includes(message.kind)) {
    return { protected: true, reason: "transactional" };
  }
  if (SENSITIVE_SUBJECT.test(message.subject ?? "")) {
    return { protected: true, reason: "sensitive-subject" };
  }
  return { protected: false };
}

export interface SenderCleanupPlan {
  trashIds: string[];
  protectedIds: string[];
  retainedOtherIds: string[];
  protectionReasons: Record<ProtectionReason, number>;
}

/**
 * Unsubscribe cleanup is intentionally conservative: only messages classified
 * as newsletters are eligible. Transactional/sensitive messages and ambiguous
 * "other" mail stay in the mailbox.
 */
export function buildSenderCleanupPlan(sender: SenderSummary): SenderCleanupPlan {
  const plan: SenderCleanupPlan = {
    trashIds: [],
    protectedIds: [],
    retainedOtherIds: [],
    protectionReasons: {
      "starred-or-flagged": 0,
      transactional: 0,
      "sensitive-subject": 0,
    },
  };
  for (const message of sender.messages) {
    const decision = protectionDecision(message);
    if (decision.protected) {
      plan.protectedIds.push(message.id);
      plan.protectionReasons[decision.reason!] += 1;
    } else if (message.kind === "newsletter") {
      plan.trashIds.push(message.id);
    } else {
      plan.retainedOtherIds.push(message.id);
    }
  }
  return plan;
}
