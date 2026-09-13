import type { MessageRecord, SenderSummary } from "./senderModel";
import { knownSenderSet } from "./screener";
import type { ClusterSettings } from "./settingsStore";

export type ProtectionReason =
  | "starred-or-flagged"
  | "provider-marked-personal"
  | "known-correspondent"
  | "active-offer-or-window"
  | "transactional"
  | "sensitive-subject"
  | "no-bulk-signal";

export interface ProtectionDecision {
  protected: boolean;
  reason?: ProtectionReason;
}

export interface ProtectionContext {
  /** Lowercased addresses: screenerAllowlist ∪ sentCorrespondents.addresses. */
  knownSenders: Set<string>;
}

export function emptyProtectionContext(): ProtectionContext {
  return { knownSenders: new Set() };
}

export function buildProtectionContext(settings: ClusterSettings): ProtectionContext {
  return { knownSenders: knownSenderSet(settings) };
}

export interface ProtectionOptions {
  /**
   * Default true. Set false only for spamSuggestions: an independent
   * blocklist/spam-domain hit is stronger evidence than these headers, and a
   * malicious sender is *less* likely to carry proper bulk headers or a
   * sensible subject than a real newsletter -- these checks would suppress
   * real phishing, which is exactly what that surface exists to catch.
   * starred-or-flagged, provider-marked-personal, known-correspondent, and
   * active-offer-or-window still apply regardless -- they're independent of
   * whether the sender is spammy.
   */
  contentHeuristics?: boolean;
}

const SENSITIVE_SUBJECT =
  /\b(tax|w-?2|1099|ticket|boarding pass|reservation|booking|appointment|password reset|security alert|new sign[- ]?in|account recovery|legal notice)\b/i;

const ACTIVE_OFFER_OR_WINDOW_RE =
  /\b(expires?|valid (thru|through|until)|offer ends|ends? (tonight|today|soon)|return (by|window)|exchange (by|window)|redeem by|use by|last day to (return|use|redeem))\b/i;

/** Central guard used by every bulk-delete-adjacent surface. */
export function protectionDecision(
  message: MessageRecord,
  senderAddress?: string,
  ctx: ProtectionContext = emptyProtectionContext(),
  options?: ProtectionOptions,
): ProtectionDecision {
  if (message.isProtected) return { protected: true, reason: "starred-or-flagged" };
  if (message.providerMarkedPersonal) return { protected: true, reason: "provider-marked-personal" };
  if (senderAddress && ctx.knownSenders.has(senderAddress.toLowerCase())) {
    return { protected: true, reason: "known-correspondent" };
  }
  if (ACTIVE_OFFER_OR_WINDOW_RE.test(message.subject ?? "")) {
    return { protected: true, reason: "active-offer-or-window" };
  }
  if (options?.contentHeuristics === false) return { protected: false };
  // otp is deliberately excluded here -- one-time codes are meant to expire
  // quickly (see retentionPolicy.ts) rather than being permanently exempt
  // like receipt/shipping records.
  if (["receipt", "shipping"].includes(message.kind)) {
    return { protected: true, reason: "transactional" };
  }
  if (SENSITIVE_SUBJECT.test(message.subject ?? "")) {
    return { protected: true, reason: "sensitive-subject" };
  }
  // Only "other" reaches here without any positive kind signal (otp/shipping/
  // receipt/social/newsletter were all already recognized above or by
  // classifyMessageKind itself) -- this is the ambiguous, unclassified case
  // where "no bulk-mail header at all" is the best evidence that a real
  // person, not a company, wrote this.
  if (message.kind === "other" && !message.looksAutomated) {
    return { protected: true, reason: "no-bulk-signal" };
  }
  return { protected: false };
}

export interface SenderCleanupPlan {
  safeNewsletterIds: string[];
  protectedIds: string[];
  retainedOtherIds: string[];
  protectionReasons: Record<ProtectionReason, number>;
}

/**
 * Unsubscribe cleanup is intentionally conservative: only messages classified
 * as newsletters, from a sender with no other protection signal, are
 * eligible. Everything else stays in the mailbox.
 */
export function buildSenderCleanupPlan(
  sender: SenderSummary,
  ctx: ProtectionContext = emptyProtectionContext(),
): SenderCleanupPlan {
  const plan: SenderCleanupPlan = {
    safeNewsletterIds: [],
    protectedIds: [],
    retainedOtherIds: [],
    protectionReasons: {
      "starred-or-flagged": 0,
      "provider-marked-personal": 0,
      "known-correspondent": 0,
      "active-offer-or-window": 0,
      transactional: 0,
      "sensitive-subject": 0,
      "no-bulk-signal": 0,
    },
  };
  for (const message of sender.messages) {
    const decision = protectionDecision(message, sender.address, ctx);
    if (decision.protected) {
      plan.protectedIds.push(message.id);
      plan.protectionReasons[decision.reason!] += 1;
    } else if (message.kind === "newsletter") {
      plan.safeNewsletterIds.push(message.id);
    } else {
      plan.retainedOtherIds.push(message.id);
    }
  }
  return plan;
}
