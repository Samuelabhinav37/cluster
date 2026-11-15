// Best-effort classification from Subject (a header, never the body) plus the
// List-Unsubscribe signal already parsed for the unsubscribe feature. This is
// a heuristic, not a verified fact — false negatives just fall back to
// "other", which carries no default retention policy (see retentionPolicy.ts).
import { cleanText } from "./normalize";

export type MessageKind = "otp" | "accounts" | "receipt" | "shipping" | "newsletter" | "social" | "jobs" | "other";

// "Your code is" and "is your code" only count next to an actual code, so a
// colleague's "Your code is in the repo now" stays mail from a person. The
// last line covers the same phrase in French, Spanish, Portuguese, German,
// Italian and Dutch.
const OTP_RE =
  /\b(one[- ]?time|(verification|security|confirmation|authentication) code|otp|passcode|(confirm|verify) your (email|identity|sign[- ]?in)|email verification|(login|sign[- ]?in) code|\d{4,8} is your( \w+)? code|your( \w+)? code is:?\s*[A-Z0-9-]*\d|verify your device|confirm it.?s you|use \d{4,8} to ((sign|log) ?in|change|reset|verify|confirm)|single[- ]use code|access code|2fa|two-factor|code de (vérification|confirmation|sécurité)|código de (verificación|verificação|seguridad|segurança|acceso)|(bestätigungs|sicherheits|verifizierungs|anmelde)code|codice di (verifica|sicurezza)|verificatiecode)\b/i;
// Security notices that mention codes or 2FA ("Two-factor authentication was
// disabled", "Security alert") are not disposable codes. Mirrors
// OTP_EXCLUDED_PHRASES in categoryQueries.ts.
const OTP_EXCLUDE_RE = /\b(alert|disabled|changed|new sign[- ]?in|suspicious)\b/i;
// Notices about the account itself: sign-ins, password and recovery changes.
// Checked right after codes so a Google "Security alert" with an unsubscribe
// footer is never filed as a newsletter.
const ACCOUNT_RE =
  /\b(security alert|new sign[- ]?in|sign[- ]?in (attempt|alert)|new (login|device)|password (reset|changed|(was|has been) (changed|updated|reset)|updated|assistance)|changed (your )?password|reset your( \w+)? password|signed in (from|on|to)|new account linked|verify your( \w+)? account|(new )?trusted (browser|device)|authentication added|found your info|suspicious (activity|sign[- ]?in|login)|account (recovery|activity|alert|locked|suspended)|recovery (email|phone)|2-step verification|two-factor authentication (was )?(disabled|turned off|enabled|turned on)|app password|passkey|shared some( \w+)? account data|account (created|details)|(login|sign[- ]?in) activity|invited (you )?to join|reconnect your)\b/i;
// Phrases, not lone words: "Free delivery this weekend" and "Tracking your
// fitness goals" are promotions, "Our statement on the outage" is news.
const SHIPPING_RE =
  /\b(shipped|out for delivery|delivery (update|attempt|scheduled|exception|confirmation)|delivered|tracking (number|info|information|update|details)|track your (order|package|parcel|shipment)|order (confirm|confirmed|confirmation)|order #|order (is |has been )?(confirmed|placed|received)|has shipped|arriving|on its way|on the way|received your order|package (has )?arrived|delivery order)\b|^ordered:/i;
const RECEIPT_RE =
  /\b(receipt|reciept|has (been )?renewed|subscription (has )?(been )?(canceled|cancelled|expired)|change to your( [\w-]+){0,6} subscription|registration confirm(ed|ation)|invoice|payment (received|confirmation)|received your payment|purchase (confirmation|confirmed)|refund (confirmation|issued|processed)|your refund|booking confirm(ation|ed)|your tickets?|your bill|e-?statement|statement (is )?(ready|available)|your( \w+){0,3} statement|(has been|was|is|been) paid|will renew|renews on|is renewing|renewal (notice|reminder|confirmation)|auto-?renew)\b/i;
// Oracle's "Security Alert for CVE-2026-1234" is an advisory, not your account.
const ACCOUNT_EXCLUDE_RE = /\bcve-\d/i;
// No bare "application": PayPal's "Pay in 4 application" is not a job.
const JOBS_RE =
  /\b(thanks?( you)? for (applying|your application|your interest)|position (has been |was )?(closed|filled)|submitting your resume|thank you for considering|invited to (an? )?interview|application is( officially)? (in|under) review|resume submission|right to represent|(phone|video) interview|interview request|has applied on|opportunity at|job recommendations|background (screening|check)|your (job )?application|job application|application (update|status|received|confirmation)|received your application|job alerts?|job (notifications?|search|match(es)?)|jobs for you|new jobs?|looking for( [\w-]+){0,4} jobs|job opening|new opportunity|career opportunit(y|ies)|(urgent|immediate) (hiring|opportunity|requirement)|complete your( [\w-]+){0,4} application|(complete )?your( \w+)? interview|interview (questionnaire|invitation|request|scheduled))\b|^application [–—-] /i;
// recruiting@dupaco.com, recruitingnoreply@ford.com, talentacquisition@hr.questdiagnostics.com.
// A staffing agency's one-to-one post: a job title next to a work mode
// ("Cybersecurity Engineer :: Remote", "IAM Consultant - Frisco, TX (Onsite)").
// Only without an unsubscribe link, so newsletters about remote work stay news.
const JOB_POST_RE =
  /\b(analyst|engineer|administrator|consultant|developer|architect|specialist|manager)\b.*\b(remote|hybrid|on-?site|contract|w2|c2c)\b|\b(remote|hybrid|on-?site|contract)\b.*\b(analyst|engineer|administrator|consultant|developer|architect|specialist|manager)\b|^looking for\b/i;
const JOBS_SENDER_RE = /\b(recruit\w*|hiring|ats|talent ?(acquisition|exchange|network|community)|careers|jobs?|job ?(alerts?|notifications?))\b/i;
const SOCIAL_RE = /\b(mentioned you|tagged you|new follower|friend request|liked your|commented on)\b/i;
// When the subject says nothing ("Your Thursday evening trip with Uber"), a
// sender named for receipts or orders still does: "Uber Receipts",
// reservations@hertz.com, shipment-tracking@amazon.com. "careers" only in the
// plural: career@ and "Career Advice" senders sell courses.
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
  if (ACCOUNT_RE.test(s) && !ACCOUNT_EXCLUDE_RE.test(s)) return "accounts";
  if (SHIPPING_RE.test(s)) return "shipping";
  if (RECEIPT_RE.test(s)) return "receipt";
  if (SOCIAL_RE.test(s)) return "social";
  if (JOBS_RE.test(s) || (!hasListUnsubscribe && JOB_POST_RE.test(s))) return "jobs";
  if (sender) {
    // Subdomains count too: talentacquisition.abbvie.com, ats.rippling.com.
    const [local, host = ""] = sender.address.split("@");
    const sub = host.split(".").slice(0, -2).join(" ");
    const who = `${local.replace(/[._+-]/g, " ")} ${sub} ${cleanText(sender.displayName)}`;
    if (SHIPPING_SENDER_RE.test(who)) return "shipping";
    if (RECEIPT_SENDER_RE.test(who)) return "receipt";
    if (JOBS_SENDER_RE.test(who)) return "jobs";
  }
  if (hasListUnsubscribe) return "newsletter";
  return "other";
}

/** Gmail's Purchases view is stronger evidence than any subject phrase:
 * what it lists is a receipt unless the subject already says code or
 * shipping. */
export function withPurchase(kind: MessageKind, purchase: boolean | undefined): MessageKind {
  return purchase && kind !== "otp" && kind !== "shipping" ? "receipt" : kind;
}

// Subjects that read like an actual code to type in, not just a mention of
// "one-time" or "2FA" ("Your one-time payment receipt", "Enable 2FA").
const CODE_PHRASE_RE =
  /\b(verification|security|login|sign[- ]?in|confirmation|access) code\b|\bone[- ]?time pass(word|code)\b|\bsingle[- ]use code\b|\bpasscode\b|\bis your code\b|\byour code is\b|\botp\b/i;
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
  /** List-Id or Feedback-ID: only mailing lists and bulk-mail services set
   * them (Rakuten via Iterable sends no List-Unsubscribe). */
  bulkId?: string,
): boolean {
  if (hasListUnsubscribe || bulkId) return true;
  if (precedence && PRECEDENCE_BULK_RE.test(precedence)) return true;
  if (autoSubmitted && AUTO_SUBMITTED_RE.test(autoSubmitted)) return true;
  return false;
}
