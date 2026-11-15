// Who handed a message to the internet: a bulk-mail service, or a person's
// mail app. Bulk mail leaves through a sending service (Gmail requires bulk
// senders to authenticate and set one-click unsubscribe; the service shows in
// Return-Path and Message-ID), while a person's mail carries their own address
// as Return-Path and their app's Message-ID (Gmail's end @mail.gmail.com).
//
// These headers are written by the sender, so a scammer can fake them. They
// only ever choose between Personal and the Screener; they never lower a scam
// check (the same rule as the shape headers in headerFields.ts).
import { domainOf } from "./domainGrouping";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import { registrableDomain } from "./registrableDomain";

export type SendingEvidence = "service" | "person-app";

// Hosts the big sending services put in Message-IDs.
const SERVICE_HOST =
  /(^|\.)(sendgrid\.net|amazonses\.com|mcsv\.net|mailchimp(app)?\.(com|net)|mailgun\.(org|net)|sparkpostmail\.com|mandrillapp\.com|postmarkapp\.com|mailjet\.com|sailthru\.com|exacttarget\.com|braze\.com|klaviyomail\.com|hubspotemail\.net|constantcontact\.com|sendinblue\.com|brevo\.com|customer\.io|iterable\.com|marketo\.org|rsgsv\.net|list-manage\.com)$/i;
// Mail apps people write from.
const PERSON_APP_HOST =
  /(^|\.)(mail\.gmail\.com|prod\.outlook\.com|mail\.yahoo\.com|yahoo\.com|icloud\.com|me\.com|proton\.me|protonmail\.(com|ch)|fastmail\.com|zoho\.com)$/i;

export function sendingEvidence(meta: Pick<NormalizedMessageMetadata, "fromAddress" | "returnPathDomain" | "messageIdHeader" | "feedbackId">): SendingEvidence | undefined {
  const from = registrableDomain(domainOf(meta.fromAddress));
  const bounce = meta.returnPathDomain ? registrableDomain(meta.returnPathDomain) : undefined;
  const id = meta.messageIdHeader ?? "";
  const host = id.slice(id.lastIndexOf("@") + 1).replace(/>$/, "").toLowerCase();
  if (meta.feedbackId || (bounce && bounce !== from) || (host && SERVICE_HOST.test(host))) return "service";
  if (host && PERSON_APP_HOST.test(host) && (!bounce || bounce === from)) return "person-app";
  return undefined;
}
