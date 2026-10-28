// Cluster's Gmail sign-in helper. Google only gives a Web application client
// its tokens with the client secret, and a secret shipped inside an extension
// is public. So the extension signs in itself (launchWebAuthFlow + PKCE) and
// sends only the code, or a refresh token, here; this adds the secret, asks
// Google, and passes Google's answer straight back. Nothing is stored or
// logged, and no mail ever comes through here.

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  EXTENSION_ID: string;
  IP_LIMITER: RateLimiter;
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_BODY_BYTES = 8 * 1024;
// Google's codes, verifiers and refresh tokens are well under this.
const MAX_FIELD = 2048;

function json(body: unknown, status: number, origin: string | null): Response {
  const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store" };
  if (origin) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(body), { status, headers });
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const field = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_FIELD;

export async function handle(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  const extensionOrigin = `chrome-extension://${env.EXTENSION_ID}`;
  const origin = request.headers.get("origin") === extensionOrigin ? extensionOrigin : null;

  if (request.method === "OPTIONS") {
    return origin ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : new Response(null, { status: 403 });
  }
  if (request.method !== "POST" || (url.pathname !== "/token" && url.pathname !== "/refresh")) {
    return json({ error: "not_found" }, 404, origin);
  }
  // Only Cluster's own pages. A script can fake this header, but all it could
  // then do is use a code (with its verifier) or a refresh token it already holds.
  if (!origin) return json({ error: "forbidden" }, 403, null);

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await env.IP_LIMITER.limit({ key: ip })).success) return json({ error: "busy" }, 429, origin);

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json({ error: "too_large" }, 413, origin);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return json({ error: "bad_request" }, 400, origin);
  }

  const form = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET });
  if (url.pathname === "/token") {
    if (!field(body.code) || !field(body.code_verifier)) return json({ error: "bad_request" }, 400, origin);
    form.set("grant_type", "authorization_code");
    form.set("code", body.code);
    form.set("code_verifier", body.code_verifier);
    // Fixed here, never taken from the request.
    form.set("redirect_uri", `https://${env.EXTENSION_ID}.chromiumapp.org/`);
  } else {
    if (!field(body.refresh_token)) return json({ error: "bad_request" }, 400, origin);
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", body.refresh_token);
  }

  let google: Response;
  try {
    google = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
  } catch {
    return json({ error: "google_unreachable" }, 502, origin);
  }
  const answer = (await google.json().catch(() => ({ error: "bad_google_response" }))) as Record<string, unknown>;
  return json(answer, google.status, origin);
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
};
