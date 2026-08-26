export interface UnsubscribeInfo {
  /** RFC 8058 one-click POST endpoint — safe to fire automatically. */
  postUrl?: string;
  /** RFC 2369 link that only supports GET — opens a page, may need confirmation. */
  httpUrl?: string;
  mailto?: string;
}

export function parseListUnsubscribe(
  headerValue: string | undefined,
  postHeaderValue: string | undefined,
): UnsubscribeInfo {
  const info: UnsubscribeInfo = {};
  if (!headerValue) return info;

  for (const entry of headerValue.split(",").map((s) => s.trim())) {
    const match = entry.match(/^<(.+)>$/);
    if (!match) continue;
    const value = match[1];
    if (value.startsWith("mailto:")) {
      info.mailto = value;
    } else if (value.startsWith("http")) {
      info.httpUrl = value;
    }
  }

  // RFC 8058: only trust a bare GET link as one-click-safe when the sender
  // explicitly declares support via List-Unsubscribe-Post.
  const supportsOneClick = (postHeaderValue ?? "").toLowerCase().includes("one-click");
  if (supportsOneClick && info.httpUrl) {
    info.postUrl = info.httpUrl;
  }

  return info;
}

export function originPattern(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/*`;
}

// Extension declares no broad host access up front (see manifest.json's
// optional_host_permissions) — we ask for just the origin(s) actually needed,
// at the moment the user fires an unsubscribe, not for every domain forever.
export async function ensureOriginsPermission(urls: string[]): Promise<boolean> {
  const origins = [...new Set(urls.map(originPattern))];
  if (origins.length === 0) return true;
  if (await chrome.permissions.contains({ origins })) return true;
  return chrome.permissions.request({ origins });
}

async function ensureOriginPermission(url: string): Promise<boolean> {
  return ensureOriginsPermission([url]);
}

export async function fireOneClickUnsubscribe(url: string): Promise<boolean> {
  if (!(await ensureOriginPermission(url))) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    return res.ok;
  } catch {
    return false;
  }
}
