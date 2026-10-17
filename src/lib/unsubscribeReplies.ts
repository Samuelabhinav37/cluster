// Replies to an unsubscribe request, read from the subject line only. Within
// 72 hours of a request, mail from the list's domain or from a mail server's
// bounce address is sorted into: confirmed, needs a click (Cluster never
// clicks for the user), an auto-reply (no answer yet), or a bounce (the
// request failed).
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import { registrableDomain } from "./registrableDomain";

export type ReplyKind = "confirmed" | "needs-click" | "auto-reply" | "bounce";

export const REPLY_WINDOW_MS = 72 * 60 * 60 * 1000;

const BOUNCE_FROM = /^(mailer-daemon|postmaster)@/i;
const BOUNCE_SUBJECT =
  /undeliverable|delivery status notification|mail delivery (failed|subsystem)|returned mail|delivery failure|failure notice|could not be delivered/i;
const NEEDS_CLICK =
  /confirm (your )?(unsubscri|removal|opt[- ]?out)|click .{0,30}to (confirm|complete)|verify your (unsubscri|removal)|one more step/i;
const CONFIRMED =
  /(you('ve| have) been|successfully|now) unsubscribed|unsubscri(be|ption) (confirmation|confirmed|successful|complete)|removed from (our|the|this) (mailing )?list|no longer receive/i;
const AUTO_REPLY = /^(auto(matic)?[- ]?(reply|response)|out of (the )?office)/i;

export function classifyUnsubscribeReply(
  m: Pick<NormalizedMessageMetadata, "fromAddress" | "subject" | "autoSubmitted">,
): ReplyKind | null {
  const subject = m.subject ?? "";
  if (BOUNCE_FROM.test(m.fromAddress) || BOUNCE_SUBJECT.test(subject)) return "bounce";
  if (NEEDS_CLICK.test(subject)) return "needs-click";
  if (CONFIRMED.test(subject)) return "confirmed";
  if (/^auto-replied/i.test(m.autoSubmitted ?? "") || AUTO_REPLY.test(subject)) return "auto-reply";
  return null;
}

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).toLowerCase();
}

/**
 * Replies to one request: mail in the 72 hours after it from the target's
 * company domain (or the sender's), or a bounce in the request's own
 * thread. Newest first.
 */
export function repliesTo(
  request: { requestedAt: number; to?: string; sentThreadId?: string },
  senderAddress: string,
  rows: readonly NormalizedMessageMetadata[],
): ReplyKind[] {
  const domains = new Set(
    [request.to, senderAddress].filter(Boolean).map((a) => registrableDomain(domainOf(a!))),
  );
  const out: { at: number; kind: ReplyKind }[] = [];
  for (const m of rows) {
    if (m.receivedAt < request.requestedAt || m.receivedAt > request.requestedAt + REPLY_WINDOW_MS) continue;
    const fromList = domains.has(registrableDomain(domainOf(m.fromAddress)));
    // A bounce counts only in the thread of the request it answers; a mail
    // server's bounce address answers every failed send.
    const inThread = Boolean(request.sentThreadId && m.threadId === request.sentThreadId);
    if (!fromList && !inThread) continue;
    const kind = classifyUnsubscribeReply(m);
    if (kind === "bounce" && !inThread) continue;
    if (kind) out.push({ at: m.receivedAt, kind });
  }
  return out.sort((a, b) => b.at - a.at).map((r) => r.kind);
}
