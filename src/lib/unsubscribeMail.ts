// The unsubscribe email itself. It carries exactly what the sender's mailto
// URL asked for: their subject (or "unsubscribe" when they gave none) and
// their body (or none). No footer, no signature, no Auto-Submitted header,
// since RFC 3834 reserves that for mail no person asked to send and it can
// stop a list server from confirming. It is a new message, not a reply.
import type { MailtoParts } from "./unsubscribe";

export const DEFAULT_UNSUBSCRIBE_SUBJECT = "unsubscribe";
/** Longer subjects or bodies than this are refused rather than sent. */
export const MAX_SUBJECT = 200;
export const MAX_BODY = 2_000;

export interface UnsubscribeMail {
  from: string;
  to: string;
  subject: string;
  body: string;
}

export function unsubscribeMailFor(from: string, parts: MailtoParts): UnsubscribeMail | undefined {
  const subject = parts.subject?.trim() || DEFAULT_UNSUBSCRIBE_SUBJECT;
  const body = parts.body ?? "";
  if (subject.length > MAX_SUBJECT || body.length > MAX_BODY) return undefined;
  return { from, to: parts.to, subject, body };
}

function utf8Base64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const ASCII = /^[\x20-\x7e]*$/;

/** RFC 2047 encoded-word for a header value that isn't plain ASCII. */
function headerText(value: string): string {
  return ASCII.test(value) ? value : `=?UTF-8?B?${utf8Base64(value)}?=`;
}

/** The message as RFC 5322 text with CRLF line endings. */
export function unsubscribeMime(mail: UnsubscribeMail): string {
  const body = mail.body.replace(/\r?\n/g, "\r\n");
  const plain = ASCII.test(body.replace(/\r\n/g, ""));
  const lines = [
    `From: ${mail.from}`,
    `To: ${mail.to}`,
    `Subject: ${headerText(mail.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    `Content-Transfer-Encoding: ${plain ? "7bit" : "base64"}`,
    "",
    plain ? body : (utf8Base64(body).match(/.{1,76}/g) ?? []).join("\r\n"),
  ];
  return lines.join("\r\n");
}

/** base64url of the UTF-8 message, the Gmail API's `raw` field. */
export function toGmailRaw(mime: string): string {
  return utf8Base64(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
