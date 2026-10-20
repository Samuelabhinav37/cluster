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

export interface KindEvidence {
  subject: string;
  hasListUnsubscribe: boolean;
  /** List-Unsubscribe-Post: one-click unsubscribe, which Google and Yahoo
   * require of bulk marketing mail, so a marketing tell. */
  oneClick?: boolean;
  listId?: string;
  /** The provider filed it as promotional (Gmail Promotions tab). */
  promotion?: boolean;
}

export interface ScoredKind {
  kind: MessageKind;
  /** 0-1. Act on it reversibly from 0.9 (ACT_CONFIDENCE), suggest from 0.7
   * (SUGGEST_CONFIDENCE), never below. Hand-set until the labelled corpus is
   * big enough to fit; evaluation.test.ts checks the bands hold there. */
  confidence: number;
}

export const ACT_CONFIDENCE = 0.9;
export const SUGGEST_CONFIDENCE = 0.7;

// Order and delivery wording too specific for promotion copy to borrow.
const STRONG_TRANSACTIONAL_RE =
  /\b(order #?\s?[\w-]*\d|tracking (number|#)|invoice #?\s?\d|receipt (for|from)|has shipped|out for delivery|(has been|was) delivered|payment (received|confirmation))\b/i;

const clamp = (n: number) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));

/**
 * A message's kind and how sure that is. The kind is classifyMessageKind's
 * (subject first, then List-Unsubscribe); the other headers only move the
 * confidence: one-click unsubscribe and the Promotions tab make a
 * "receipt" or "shipping" subject less likely to be a real one, and list
 * headers make "newsletter" more certain.
 */
export function scoreMessageKind(e: KindEvidence): ScoredKind {
  const s = e.subject || "";
  const kind = classifyMessageKind(s, e.hasListUnsubscribe);
  const marketing = (e.oneClick ? 0.15 : 0) + (e.promotion ? 0.1 : 0);
  switch (kind) {
    case "otp":
      return { kind, confidence: clamp((OTP_RE.test(s) ? 0.95 : 0.85) - (e.oneClick ? 0.15 : 0)) };
    case "receipt":
    case "shipping":
      return { kind, confidence: clamp((STRONG_TRANSACTIONAL_RE.test(s) ? 0.95 : 0.8) - marketing) };
    case "social":
      return { kind, confidence: 0.85 };
    case "newsletter":
      return { kind, confidence: clamp(0.75 + (e.oneClick ? 0.1 : 0) + (e.listId || e.promotion ? 0.1 : 0)) };
    default:
      return { kind, confidence: 0.6 };
  }
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
