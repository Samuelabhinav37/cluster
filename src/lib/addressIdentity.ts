// One mailbox, many spellings (Wu et al., "One Email, Many Faces", NDSS 2026).
// Every provider ignores case before the @; some also ignore a +tag or dots.
// Only rules a provider is known to apply are used: Yahoo has no +tag alias,
// so alice+friend@yahoo.com is somebody else, and an unknown domain is
// compared as written.

import { isFreeMailDomain } from "./freeMail";

const GMAIL = new Set(["gmail.com", "googlemail.com"]);
// Accept a +tag (the paper's Table III).
const PLUS_TAG = new Set([
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "zoho.com", "zohomail.com",
  "yandex.com", "yandex.ru", "ya.ru",
  "mail.ru", "aliyun.com", "fastmail.com",
]);
// Proton also ignores dots, hyphens and underscores.
const PROTON = new Set(["proton.me", "protonmail.com", "protonmail.ch", "pm.me"]);

/** The mailbox an address delivers to: lowercase, and with the aliases its
 * provider ignores taken out. alice.b+news@googlemail.com → aliceb@gmail.com. */
export function canonicalAddress(address: string): string {
  const lower = address.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at <= 0) return lower;
  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1);
  const untagged = local.split("+")[0] || local;
  if (GMAIL.has(domain)) {
    local = untagged.replace(/\./g, "");
    domain = "gmail.com";
  } else if (PROTON.has(domain)) {
    local = untagged.replace(/[._-]/g, "");
  } else if (PLUS_TAG.has(domain)) {
    local = untagged;
  }
  return `${local}@${domain}`;
}

/** A Set of addresses that matches any spelling of the same mailbox. */
export class AddressSet extends Set<string> {
  override add(address: string): this {
    return super.add(canonicalAddress(address));
  }
  override has(address: string): boolean {
    return super.has(canonicalAddress(address));
  }
  override delete(address: string): boolean {
    return super.delete(canonicalAddress(address));
  }
}

/** A sending address with its machine-made parts as *: bounce-8812@mail.x.com
 * → bounce-*@mail.x.com, update+ab12cd@facebookmail.com →
 * update+*@facebookmail.com. Yahoo's mail sorting learns per such pattern,
 * not per domain: at one company orders@ is shopping, careers@ is jobs and
 * name.lastname@ is a person (Grbovic et al., CIKM 2014). Null for free
 * mail (a person's address), when nothing varies, or when every part would
 * be a * (that would be the whole domain). */
export function senderPattern(address: string): string | null {
  const canonical = canonicalAddress(address);
  const at = canonical.lastIndexOf("@");
  if (at <= 0) return null;
  const domain = canonical.slice(at + 1);
  if (isFreeMailDomain(domain)) return null;
  const [base, tag] = splitOnce(canonical.slice(0, at), "+");
  const parts = base.split(/([._-])/);
  const wild = parts.map((p, i) => (i % 2 === 0 && isMachinePart(p) ? "*" : p));
  if (wild.every((p, i) => i % 2 === 1 || p === "*")) return null;
  const local = wild.join("") + (tag === undefined ? "" : "+*");
  return local === canonical.slice(0, at) ? null : `${local}@${domain}`;
}

// A part with a digit (bounce-8812, abc123def) or a long random-looking run.
function isMachinePart(part: string): boolean {
  return /^\d+$/.test(part) || (part.length >= 3 && /\d/.test(part)) || (part.length >= 16 && !/[aeiou]{2}/.test(part));
}

function splitOnce(s: string, sep: string): [string, string | undefined] {
  const i = s.indexOf(sep);
  return i < 0 ? [s, undefined] : [s.slice(0, i), s.slice(i + 1)];
}

/** The key a correction for this sender is saved under: its pattern when its
 * address has machine-made parts, else the mailbox. */
export function correctionKey(address: string): string {
  return senderPattern(address) ?? canonicalAddress(address);
}
