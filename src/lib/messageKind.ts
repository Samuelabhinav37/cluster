// Best-effort classification from Subject (a header, never the body) plus the
// List-Unsubscribe signal already parsed for the unsubscribe feature. This is
// a heuristic, not a verified fact — false negatives just fall back to
// "other", which carries no default retention policy (see retentionPolicy.ts).
import { cleanText } from "./normalize";

export type MessageKind = "otp" | "receipt" | "shipping" | "newsletter" | "social" | "other";

// "Your code is" and "is your code" only count next to an actual code, so a
// colleague's "Your code is in the repo now" stays mail from a person. The
// last line covers the same phrase in French, Spanish, Portuguese, German,
// Italian and Dutch.
const OTP_RE =
  /\b(one[- ]?time|(verification|security|confirmation) code|otp|passcode|confirm your (email|sign[- ]?in)|(login|sign[- ]?in) code|\d{4,8} is your( \w+)? code|your( \w+)? code is:?\s*[A-Z0-9-]*\d|verify your device|use \d{4,8} to (sign|log) ?in|2fa|two-factor|code de (vérification|confirmation|sécurité)|código de (verificación|verificação|seguridad|segurança|acceso)|(bestätigungs|sicherheits|verifizierungs|anmelde)code|codice di (verifica|sicurezza)|verificatiecode)\b/i;
// Security notices that mention codes or 2FA ("Two-factor authentication was
// disabled", "Security alert") are not disposable codes. Mirrors
// OTP_EXCLUDED_PHRASES in categoryQueries.ts.
const OTP_EXCLUDE_RE = /\b(alert|disabled|changed|new sign[- ]?in|suspicious)\b/i;
// Phrases, not lone words: "Free delivery this weekend" and "Tracking your
// fitness goals" are promotions, "Our statement on the outage" is news.
const SHIPPING_RE =
  /\b(shipped|out for delivery|delivery (update|attempt|scheduled|exception|confirmation)|delivered|tracking (number|info|information|update|details)|track your (order|package|parcel|shipment)|order (confirm|confirmed|confirmation)|order #|order (is |has been )?(confirmed|placed|received)|has shipped|arriving|on its way)\b/i;
const RECEIPT_RE =
  /\b(receipt|invoice|payment (received|confirmation)|your bill|e-?statement|statement (is )?(ready|available)|your (\w+ )?statement|paid|will renew|renews on|is renewing|renewal (notice|reminder|confirmation)|auto-?renew)\b/i;
const SOCIAL_RE = /\b(mentioned you|tagged you|new follower|friend request|liked your|commented on)\b/i;
// When the subject says nothing ("Your Thursday evening trip with Uber"), a
// sender named for receipts or orders still does: "Uber Receipts",
// reservations@hertz.com, shipment-tracking@amazon.com.
const SHIPPING_SENDER_RE = /\b(shipping|shipments?|tracking|deliver(y|ies))\b/i;
const RECEIPT_SENDER_RE =
  /\b(receipts?|orders?|billing|invoices?|payments?|bookings?|reservations?|tickets?)\b/i;

export interface KindSender {
  address: string;
  displayName: string;
}

export function classifyMessageKind(
  subject: string,
  hasListUnsubscribe: boolean,
  sender?: KindSender,
): MessageKind {
  const s = cleanText(subject || "");
  if (OTP_RE.test(s) && !OTP_EXCLUDE_RE.test(s)) return "otp";
  if (SHIPPING_RE.test(s)) return "shipping";
  if (RECEIPT_RE.test(s)) return "receipt";
  if (SOCIAL_RE.test(s)) return "social";
  if (sender) {
    const who = `${sender.address.split("@")[0].replace(/[._+-]/g, " ")} ${cleanText(sender.displayName)}`;
    if (SHIPPING_SENDER_RE.test(who)) return "shipping";
    if (RECEIPT_SENDER_RE.test(who)) return "receipt";
  }
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
  const s = cleanText(subject ?? "");
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
