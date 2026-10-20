// Best-effort classification from Subject (a header, never the body) plus the
// List-Unsubscribe signal already parsed for the unsubscribe feature. This is
// a heuristic, not a verified fact — false negatives just fall back to
// "other", which carries no default retention policy (see retentionPolicy.ts).
export type MessageKind = "otp" | "receipt" | "shipping" | "newsletter" | "social" | "other";

const OTP_RE =
  /\b(one[- ]?time (pass(word|code)|code|pin|password)|verification code|security code|otp|passcode|confirm your (email|sign[- ]?in)|(login|sign[- ]?in) code|is your code|your code is|2fa|two-factor|verify (your|this|a new) (device|login|sign[- ]?in|browser)|confirm (it'?s|that it'?s) you)\b/i;
// A code number next to "code": "482913 is your Instagram code", "Your Uber
// code is 4821", "Sign-in code: 773201". Not a promo code to type at
// checkout ("Use code 2026 for 20% off").
const OTP_NUMBER_RE = /\b\d{4,8} is your\b.{0,30}\bcode\b|\byour\b.{0,25}\bcode is\b|\bcode:?\s+\d{4,8}\b/i;
const PROMO_CODE_RE = /\b(use|with|promo|discount|coupon|enter|apply)\s+(the\s+)?code\b|\b\d+% off\b/i;
// Security notices that mention codes or 2FA ("Two-factor authentication was
// disabled", "Security alert") are not disposable codes. Mirrors
// OTP_EXCLUDED_PHRASES in categoryQueries.ts.
const OTP_EXCLUDE_RE = /\b(alert|disabled|changed|new sign[- ]?in|suspicious)\b/i;
// Words promotions borrow ("Free delivery", "Tracking your fitness goals",
// "Our statement on the outage", "paid early access") only count with the
// context a real order, bill or delivery notice puts around them.
const SHIPPING_RE =
  /\b(shipped|out for delivery|delivery (scheduled|update|attempt(ed)?|confirmation|today|tomorrow|exception|window)|delivered|tracking (number|info|information|update|details|#)|track your (package|order|shipment|parcel)|order (confirm|confirmed|confirmation)|order #|has shipped|arriving|on its way|your (package|parcel|shipment))\b/i;
const RECEIPT_RE =
  /\b(receipt|invoice|payment (received|confirmation|confirmed)|(received|got) your payment|your bill|(monthly|account|card|bank|billing|e-?) ?statement|statement (is )?(ready|available)|you('ve)? paid|paid in full)\b/i;
const SOCIAL_RE = /\b(mentioned you|tagged you|new follower|friend request|liked your|commented on)\b/i;

function looksLikeOtp(subject: string): boolean {
  if (OTP_EXCLUDE_RE.test(subject)) return false;
  return OTP_RE.test(subject) || (OTP_NUMBER_RE.test(subject) && !PROMO_CODE_RE.test(subject));
}

export function classifyMessageKind(subject: string, hasListUnsubscribe: boolean): MessageKind {
  const s = subject || "";
  if (looksLikeOtp(s)) return "otp";
  if (SHIPPING_RE.test(s)) return "shipping";
  if (RECEIPT_RE.test(s)) return "receipt";
  if (SOCIAL_RE.test(s)) return "social";
  if (hasListUnsubscribe) return "newsletter";
  return "other";
}

// Subjects that read like an actual code to type in, not just a mention of
// "one-time" or "2FA" ("Your one-time payment receipt", "Enable 2FA").
const CODE_PHRASE_RE =
  /\b(verification|security|login|sign[- ]?in|confirmation|access) code\b|\bone[- ]?time pass(word|code)\b|\bpasscode\b|\bis your code\b|\byour code is\b|\botp\b/i;
const CODE_TOKEN_RE = /\b\d{4,8}\b|\b(?=[A-Z0-9]*\d)[A-Z0-9]{6,8}\b/;

/** True when a one-time-code subject looks like a disposable code, the only
 * kind of "code" mail it is safe to trash automatically. */
export function looksLikeDisposableCode(subject: string | undefined): boolean {
  const s = subject ?? "";
  return CODE_PHRASE_RE.test(s) || CODE_TOKEN_RE.test(s);
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
