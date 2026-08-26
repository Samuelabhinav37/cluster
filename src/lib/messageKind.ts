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
