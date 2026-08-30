export interface UnsubscribeInfo {
  /** RFC 8058 one-click POST endpoint with provider-trusted DKIM evidence. */
  postUrl?: string;
  /** RFC 2369 link that only supports GET — opens a page, may need confirmation. */
  httpUrl?: string;
  mailto?: string;
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
    for (const result of header.matchAll(/(?:^|;)\s*dkim=pass\b([^;]*)/gi)) {
      const properties = result[1] ?? "";
      const domain = /\bheader\.d=([^\s;]+)/i.exec(properties)?.[1];
      const identity = /\bheader\.i=([^\s;]+)/i.exec(properties)?.[1];
      const value = domain ?? identity?.slice(identity.lastIndexOf("@") + 1);
      if (value) domains.add(value.trim().toLowerCase().replace(/\.$/, ""));
    }
  }
  return domains;
}

function dkimTag(signature: string, tag: string): string | undefined {
  return new RegExp(`(?:^|;)\\s*${tag}=([^;]+)`, "i").exec(signature)?.[1]?.trim();
}

function domainsAlign(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/** Conservative RFC 8058 verification using only provider-supplied metadata. */
export function hasVerifiedOneClickSignature(context: OneClickVerificationContext): boolean {
  const fromDomain = context.fromAddress.toLowerCase().split("@").pop() ?? "";
  if (!fromDomain) return false;
  const passedDomains = passingDkimDomains(context);
  if (passedDomains.size === 0) return false;

  return context.dkimSignatures.some((signature) => {
    const signingDomain = dkimTag(signature, "d")?.toLowerCase().replace(/\.$/, "");
    const signedHeaders = (dkimTag(signature, "h") ?? "")
      .split(":")
      .map((header) => header.trim().toLowerCase());
    return Boolean(
      signingDomain &&
      passedDomains.has(signingDomain) &&
      domainsAlign(signingDomain, fromDomain) &&
      signedHeaders.includes("list-unsubscribe") &&
      signedHeaders.includes("list-unsubscribe-post"),
    );
  });
}

export function parseListUnsubscribe(
  headerValue: string | undefined,
  postHeaderValue: string | undefined,
  verification?: OneClickVerificationContext,
): UnsubscribeInfo {
  const info: UnsubscribeInfo = {};
  if (!headerValue) return info;

  for (const entry of headerValue.split(",").map((s) => s.trim())) {
    const match = entry.match(/^<(.+)>$/);
    if (!match) continue;
    const value = match[1];
    if (value.startsWith("mailto:")) {
      info.mailto = value;
    } else if (value.startsWith("https:")) {
      info.httpUrl = value;
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

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export function isAllowedOneClickUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
      return false;
    }
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) return false;
    if (isPrivateIpv4(hostname)) return false;
    if (
      hostname === "::" ||
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      /^fe[89ab]/.test(hostname) ||
      hostname.startsWith("::ffff:")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
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
