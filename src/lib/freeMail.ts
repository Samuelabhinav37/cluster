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
]);

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.has(domain.toLowerCase());
}

// Newsletter platforms: every address on them is a different publisher
// (lenny@substack.com and platformer@substack.com share nothing).
const SHARED_SENDER_PLATFORMS: ReadonlySet<string> = new Set([
  "substack.com",
  "beehiiv.com",
  "buttondown.email",
  "ghost.io",
]);

/** Free-mail or a newsletter platform: the domain never stands for one sender. */
export function isSharedSenderDomain(domain: string): boolean {
  return isFreeMailDomain(domain) || SHARED_SENDER_PLATFORMS.has(registrableDomain(domain.toLowerCase()));
}
