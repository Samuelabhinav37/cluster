// Labelled protection corpus for evaluation.test.ts: mail a person would be
// upset to lose (must be protected) and plain bulk mail (fine to clean up).
// Includes the registered protection bugs in algorithmAudit.test.ts.
import type { MessageRecord } from "../../lib/senderModel";

export interface ProtectionCase {
  id: string;
  mustProtect: boolean;
  record: Partial<MessageRecord>;
  knownSender?: string;
}

const keep = (id: string, record: Partial<MessageRecord>, knownSender?: string): ProtectionCase => ({
  id,
  mustProtect: true,
  record,
  knownSender,
});
const clean = (id: string, record: Partial<MessageRecord>): ProtectionCase => ({
  id,
  mustProtect: false,
  record,
});

export const PROTECTION_CORPUS: ProtectionCase[] = [
  keep("starred", { isProtected: true }),
  keep("provider-personal", { providerMarkedPersonal: true }),
  keep("receipt", { kind: "receipt", subject: "Your receipt for order 1234" }),
  keep("password-reset", { subject: "Password reset requested" }),
  keep("tax-document", { subject: "Your 2025 tax documents are ready" }),
  keep("ticket", { subject: "Your ticket for Saturday" }),
  keep("tickets-plural", { subject: "Your tickets for Taylor Swift | The Eras Tour" }),
  keep("reservations-plural", { subject: "Your reservations in Lisbon are confirmed" }),
  keep("boarding-pass", { subject: "Your boarding pass for flight UA 123" }),
  keep("return-window", { subject: "Return window closes Friday" }),
  keep("redeem-by", { subject: "Redeem by Oct 31" }),
  keep("human-no-bulk", { looksAutomated: false, kind: "other", subject: "Lunch next week?" }),
  keep("known-correspondent", { kind: "newsletter", subject: "Our team update" }, "known"),
  clean("plain-newsletter", { subject: "This week's update" }),
  clean("promo", { subject: "Deals picked for you" }),
  clean("flash-sale", { subject: "Flash sale ends tonight — 40% off" }),
  clean("digest", { subject: "Your weekly digest" }),
  clean("new-arrivals", { subject: "New arrivals you'll love" }),
  clean("sale-last-chance", { subject: "Last chance: 30% off sitewide" }),
];
