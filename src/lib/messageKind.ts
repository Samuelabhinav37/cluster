// Best-effort classification from Subject (a header, never the body) plus the
// List-Unsubscribe signal already parsed for the unsubscribe feature. This is
// a heuristic, not a verified fact — false negatives just fall back to
// "other", which carries no default retention policy (see retentionPolicy.ts).
export type MessageKind = "otp" | "receipt" | "shipping" | "newsletter" | "social" | "other";

const OTP_RE =
  /\b(one[- ]?time|verification code|security code|otp|passcode|confirm your (email|sign[- ]?in)|login code|2fa|two-factor)\b/i;
const SHIPPING_RE =
  /\b(shipped|out for delivery|delivery|tracking|order (confirm|confirmation)|order #|has shipped|arriving|on its way)\b/i;
const RECEIPT_RE = /\b(receipt|invoice|payment (received|confirmation)|your bill|statement|paid)\b/i;
const SOCIAL_RE = /\b(mentioned you|tagged you|new follower|friend request|liked your|commented on)\b/i;

export function classifyMessageKind(subject: string, hasListUnsubscribe: boolean): MessageKind {
  const s = subject || "";
  if (OTP_RE.test(s)) return "otp";
  if (SHIPPING_RE.test(s)) return "shipping";
  if (RECEIPT_RE.test(s)) return "receipt";
  if (SOCIAL_RE.test(s)) return "social";
  if (hasListUnsubscribe) return "newsletter";
  return "other";
}

const PRECEDENCE_BULK_RE = /\b(bulk|list|junk)\b/i;
const AUTO_SUBMITTED_RE = /^auto-(generated|replied)/i;

/**
 * A secondary/fallback "this looks like bulk or system mail, not a human
 * writing to me" signal -- used only when the provider's own importance
 * model (see NormalizedMessageMetadata.providerMarkedPersonal) has no
 * opinion yet, e.g. a brand-new correspondent. List-Unsubscribe indicates
 * an unsubscribe mechanism exists, not proof of authorship; Precedence and
 * Auto-Submitted (RFC 3834) are closer to a direct machine-authorship
 * signal.
 */
export function looksAutomated(
  hasListUnsubscribe: boolean,
  precedence?: string,
  autoSubmitted?: string,
): boolean {
  if (hasListUnsubscribe) return true;
  if (precedence && PRECEDENCE_BULK_RE.test(precedence)) return true;
  if (autoSubmitted && AUTO_SUBMITTED_RE.test(autoSubmitted)) return true;
  return false;
}
