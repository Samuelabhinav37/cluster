import { registrableDomain } from "./registrableDomain";

// Free-mail domains. Thousands of unrelated people share each of these, so a
// domain here never stands for one company: grouping, company keys and
// domain-wide filters all skip them.
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "mail.com",
  // Regional and other big free-mail services
  "yahoo.co.in",
  "yahoo.co.uk",
  "yahoo.co.jp",
  "yahoo.fr",
  "yahoo.de",
  "yahoo.ca",
  "yahoo.com.au",
  "yahoo.com.br",
  "rocketmail.com",
  "outlook.in",
  "outlook.co.uk",
  "outlook.de",
  "outlook.fr",
  "hotmail.co.uk",
  "hotmail.fr",
  "hotmail.de",
  "hotmail.it",
  "hotmail.es",
  "live.co.uk",
  "live.in",
  "windowslive.com",
  "pm.me",
  "protonmail.ch",
  "tuta.io",
  "tutanota.com",
  "tuta.com",
  "fastmail.com",
  "hey.com",
  "zoho.com",
  "zohomail.in",
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  "inbox.ru",
  "bk.ru",
  "list.ru",
  "gmx.de",
  "gmx.net",
  "web.de",
  "t-online.de",
  "libero.it",
  "orange.fr",
  "laposte.net",
  "qq.com",
  "163.com",
  "126.com",
  "sina.com",
  "naver.com",
  "daum.net",
  "hanmail.net",
  "rediffmail.com",
  "comcast.net",
  "verizon.net",
  "att.net",
  "sbcglobal.net",
  "btinternet.com",
]);

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.has(domain.toLowerCase());
}

/** A school address: .edu, .edu.xx or .ac.xx (oxford.ac.uk, iitb.ac.in). */
export function isSchoolDomain(domain: string): boolean {
  return /\.edu(\.[a-z]{2})?$|\.ac\.[a-z]{2}$/i.test(domain);
}

// Shared mailboxes and robots. Never a person, even on a free-mail domain.
const ROLE_LOCAL = /^(no-?reply|do-?not-?reply|support|help|info|hello|hi|team|billing|accounts?|notifications?|alerts?|news|newsletters?|updates|marketing|sales|admin|service|orders?|receipts?|mailer-daemon|postmaster)([+._-]|$)/i;

export function isRoleAddress(address: string): boolean {
  return ROLE_LOCAL.test(address.slice(0, address.indexOf("@")));
}

// Platforms that send for many unrelated customers: every address on them is
// a different publisher or employer (lenny@substack.com and
// platformer@substack.com share nothing; walmart@myworkday.com is Walmart).
// Sending domains from research/2026-10-28-grouping-rules-organization.md.
// Anything missing here is caught by platformRoots in senderProfile.ts.
const SHARED_SENDER_PLATFORMS: ReadonlySet<string> = new Set([
  "substack.com",
  "beehiiv.com",
  "buttondown.email",
  "ghost.io",
  // Hiring and HR
  "myworkday.com",
  "workday.com",
  "greenhouse.io",
  "greenhouse-mail.io",
  "paylocity.com",
  // Mailchimp's own domains, used when a sender hasn't set up theirs
  "mcsv.net",
  "mcdlv.net",
  "mailchimpapp.net",
  "rsgsv.net",
]);

/** A listed platform that sends for many customers (Substack, Workday). */
export function isListedPlatform(domain: string): boolean {
  return SHARED_SENDER_PLATFORMS.has(registrableDomain(domain.toLowerCase()));
}

/** Free-mail or a newsletter platform: the domain never stands for one sender. */
export function isSharedSenderDomain(domain: string): boolean {
  return isFreeMailDomain(domain) || isListedPlatform(domain);
}
