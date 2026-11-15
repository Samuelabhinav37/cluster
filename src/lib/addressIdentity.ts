// One mailbox, many spellings (Wu et al., "One Email, Many Faces", NDSS 2026).
// Every provider ignores case before the @; some also ignore a +tag or dots.
// Only rules a provider is known to apply are used: Yahoo has no +tag alias,
// so alice+friend@yahoo.com is somebody else, and an unknown domain is
// compared as written.

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
