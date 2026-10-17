import { passingDkimDomains as passingDkimDomainsFromHeader } from "./emailAuth";
import { isPublicHttpsUrl } from "./netGuard";

export interface UnsubscribeInfo {
  /** RFC 8058 one-click POST endpoint with provider-trusted DKIM evidence. */
  postUrl?: string;
  /** RFC 2369 link that only supports GET — opens a page, may need confirmation. */
  httpUrl?: string;
  /** The mailto URL as the header gave it (RFC 2369). */
  mailto?: string;
  /** That URL parsed under RFC 6068, when it is safe to send as is: one
   * recipient, and no fields other than subject and body. */
  mailtoParts?: MailtoParts;
}

export interface MailtoParts {
  to: string;
  subject?: string;
  body?: string;
}

export interface OneClickVerificationContext {
  provider: "gmail" | "outlook";
  fromAddress: string;
  authenticationResults: string[];
  dkimSignatures: string[];
}

const ONE_CLICK_VALUE = /^\s*List-Unsubscribe\s*=\s*One-Click\s*$/i;

function authServiceId(headerValue: string): string {
  return headerValue.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function trustedAuthResult(provider: OneClickVerificationContext["provider"], value: string): boolean {
  const id = authServiceId(value);
  if (provider === "gmail") return id === "mx.google.com";
  return (
    id === "outlook.com" ||
    id.endsWith(".outlook.com") ||
    id === "protection.outlook.com" ||
    id.endsWith(".protection.outlook.com")
  );
}

function passingDkimDomains(context: OneClickVerificationContext): Set<string> {
  const domains = new Set<string>();
  for (const header of context.authenticationResults.filter((value) =>
    trustedAuthResult(context.provider, value),
  )) {
    for (const domain of passingDkimDomainsFromHeader(header)) domains.add(domain);
  }
  return domains;
}

function dkimTag(signature: string, tag: string): string | undefined {
  return new RegExp(`(?:^|;)\\s*${tag}=([^;]+)`, "i").exec(signature)?.[1]?.trim();
}

function domainsAlign(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * Signing domains of DKIM signatures that the provider says passed and that
 * cover every one of `headers`. Only the provider's own
 * Authentication-Results count, so a sender can't vouch for itself.
 */
export function passingSignersCovering(context: OneClickVerificationContext, headers: readonly string[]): string[] {
  const passedDomains = passingDkimDomains(context);
  if (passedDomains.size === 0) return [];
  const out: string[] = [];
  for (const signature of context.dkimSignatures) {
    const signingDomain = dkimTag(signature, "d")?.toLowerCase().replace(/\.$/, "");
    const signedHeaders = (dkimTag(signature, "h") ?? "").split(":").map((header) => header.trim().toLowerCase());
    if (signingDomain && passedDomains.has(signingDomain) && headers.every((h) => signedHeaders.includes(h))) {
      out.push(signingDomain);
    }
  }
  return out;
}

/** Conservative RFC 8058 verification using only provider-supplied metadata. */
export function hasVerifiedOneClickSignature(context: OneClickVerificationContext): boolean {
  const fromDomain = context.fromAddress.toLowerCase().split("@").pop() ?? "";
  if (!fromDomain) return false;
  return passingSignersCovering(context, ["list-unsubscribe", "list-unsubscribe-post"]).some((domain) =>
    domainsAlign(domain, fromDomain),
  );
}

const ADDRESS_RE = /^[^\s@<>(),;:"[\]]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const LINE_BREAK = /[\r\n]/;

function decodeOnce(value: string): string | undefined {
  try {
    // RFC 6068: percent-decode once, as UTF-8. A "+" is a literal plus.
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/**
 * Reads a mailto URL under RFC 6068 and returns it only when it is safe to
 * send for the user: exactly one recipient, and no header fields other than
 * subject and body. Cc, bcc, extra recipients, unknown fields and line
 * breaks outside the body are refused, as RFC 6068 asks clients to treat
 * them as suspect.
 */
export function parseMailto(url: string): MailtoParts | undefined {
  if (!/^mailto:/i.test(url)) return undefined;
  const rest = url.slice("mailto:".length);
  const q = rest.indexOf("?");
  const toPart = q === -1 ? rest : rest.slice(0, q);
  const recipients = toPart.split(",").map((a) => decodeOnce(a.trim()));
  if (recipients.length !== 1 || !recipients[0]) return undefined;
  const to = recipients[0].toLowerCase();
  if (!ADDRESS_RE.test(to)) return undefined;
  const parts: MailtoParts = { to };
  if (q !== -1) {
    for (const field of rest.slice(q + 1).split("&")) {
      if (!field) continue;
      const eq = field.indexOf("=");
      const name = decodeOnce(eq === -1 ? field : field.slice(0, eq))?.toLowerCase();
      const value = decodeOnce(eq === -1 ? "" : field.slice(eq + 1));
      if (name === undefined || value === undefined) return undefined;
      if (name === "subject" && parts.subject === undefined && !LINE_BREAK.test(value)) parts.subject = value;
      else if (name === "body" && parts.body === undefined) parts.body = value;
      else return undefined;
    }
  }
  return parts;
}

/** The bracketed items of a List-Unsubscribe header, in order, stopping at
 * the first one that isn't well formed (RFC 2369). Commas inside a URL stay
 * part of it, and whitespace inside the brackets is dropped. */
export function listUnsubscribeItems(headerValue: string): string[] {
  const items: string[] = [];
  let i = 0;
  while (i < headerValue.length) {
    while (i < headerValue.length && /[\s,]/.test(headerValue[i])) i += 1;
    if (i >= headerValue.length) break;
    if (headerValue[i] !== "<") break;
    const close = headerValue.indexOf(">", i);
    if (close === -1) break;
    const value = headerValue.slice(i + 1, close).replace(/\s+/g, "");
    if (!value) break;
    items.push(value);
    i = close + 1;
  }
  return items;
}

export function parseListUnsubscribe(
  headerValue: string | undefined,
  postHeaderValue: string | undefined,
  verification?: OneClickVerificationContext,
): UnsubscribeInfo {
  const info: UnsubscribeInfo = {};
  if (!headerValue) return info;

  for (const value of listUnsubscribeItems(headerValue)) {
    if (/^mailto:/i.test(value)) {
      if (info.mailto) continue;
      info.mailto = value;
      const parts = parseMailto(value);
      if (parts) info.mailtoParts = parts;
    } else if (/^https:/i.test(value)) {
      if (!info.httpUrl) info.httpUrl = value;
    }
    // A plain http:// unsubscribe link is dropped: RFC 8058 one-click requires
    // HTTPS, firing it would leak the unsubscribe token in cleartext, and it's
    // the only thing that would otherwise pull http://*/* into a permission
    // request. mailto/https links from the same header still work.
  }

  // Header presence is sender-declared, not verified. Automatic POST is only
  // enabled when a provider-trusted DKIM pass maps to a signature that covers
  // both RFC 8058 headers and aligns with the From domain.
  const supportsOneClick = ONE_CLICK_VALUE.test(postHeaderValue ?? "");
  if (supportsOneClick && info.httpUrl && verification && hasVerifiedOneClickSignature(verification)) {
    info.postUrl = info.httpUrl;
  }

  return info;
}

export function originPattern(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/*`;
}

// One-click unsubscribe endpoints are always public :443 web servers — the
// strict form of the shared guard (no non-standard port, no private hosts).
export function isAllowedOneClickUrl(value: string): boolean {
  return isPublicHttpsUrl(value);
}

// Extension declares no broad host access up front (see manifest.json's
// optional_host_permissions) — we ask for just the origin(s) actually needed,
// at the moment the user fires an unsubscribe, not for every domain forever.
export async function ensureOriginsPermission(urls: string[]): Promise<boolean> {
  if (urls.some((url) => !isAllowedOneClickUrl(url))) return false;
  const origins = [...new Set(urls.map(originPattern))];
  if (origins.length === 0) return true;
  if (await chrome.permissions.contains({ origins })) return true;
  return chrome.permissions.request({ origins });
}

async function ensureOriginPermission(url: string): Promise<boolean> {
  return ensureOriginsPermission([url]);
}

export async function fireOneClickUnsubscribe(url: string): Promise<boolean> {
  if (!isAllowedOneClickUrl(url)) return false;
  if (!(await ensureOriginPermission(url))) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
