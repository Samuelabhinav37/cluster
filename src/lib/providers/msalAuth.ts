import { OUTLOOK_CLIENT_ID, OUTLOOK_TENANT } from "./outlookConfig";

const AUTH_BASE = `https://login.microsoftonline.com/${OUTLOOK_TENANT}/oauth2/v2.0`;
const SCOPES = "offline_access Mail.ReadBasic Mail.ReadWrite";
const LEGACY_STORAGE_KEY = "outlookTokens";
const REFRESH_STORAGE_KEY = "outlookRefreshToken";
const ACCESS_STORAGE_KEY = "outlookAccessToken";
const EXPIRY_SKEW_MS = 60_000;

interface OutlookTokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** Outlook is no longer usable without the user signing in again — the
 * refresh token is missing, revoked, expired, or the token endpoint
 * returned something unusable. Carries a stable `name` so callers
 * (graphFetch, the dashboard) can branch on it without importing the class. */
export class OutlookReauthRequired extends Error {
  constructor(message = "Outlook needs to be reconnected") {
    super(message);
    this.name = "OutlookReauthRequired";
  }
}

// Keep extension storage unavailable to content scripts if one is added in a
// future release. Dashboard and service-worker pages remain trusted contexts.
if (typeof chrome !== "undefined") {
  void chrome.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
  void chrome.storage.session.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

async function loadTokens(): Promise<OutlookTokenState | null> {
  const [local, session] = await Promise.all([
    chrome.storage.local.get([REFRESH_STORAGE_KEY, LEGACY_STORAGE_KEY]),
    chrome.storage.session.get(ACCESS_STORAGE_KEY),
  ]);
  const legacy = local[LEGACY_STORAGE_KEY] as OutlookTokenState | undefined;
  const refresh = local[REFRESH_STORAGE_KEY] as { refreshToken?: string } | undefined;
  const access = session[ACCESS_STORAGE_KEY] as { accessToken?: string; expiresAt?: number } | undefined;
  const refreshToken = refresh?.refreshToken ?? legacy?.refreshToken;
  if (!refreshToken) return null;
  return {
    accessToken: access?.accessToken ?? "",
    expiresAt: access?.expiresAt ?? 0,
    refreshToken,
  };
}

// Access tokens are short-lived and stay in memory-backed session storage.
// Only the refresh token persists locally so Outlook remains connected after
// a browser restart; both areas are restricted to trusted extension contexts.
async function saveTokens(tokens: OutlookTokenState): Promise<void> {
  await Promise.all([
    chrome.storage.session.set({
      [ACCESS_STORAGE_KEY]: {
        accessToken: tokens.accessToken,
        expiresAt: tokens.expiresAt,
      },
    }),
    chrome.storage.local.set({
      [REFRESH_STORAGE_KEY]: { refreshToken: tokens.refreshToken },
    }),
    chrome.storage.local.remove(LEGACY_STORAGE_KEY),
  ]);
}

function launchWebAuthFlow(url: string, interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive }, (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        reject(chrome.runtime.lastError ?? new Error("No response URL from Microsoft sign-in"));
        return;
      }
      resolve(responseUrl);
    });
  });
}

async function requestTokens(
  body: URLSearchParams,
  existingRefreshToken?: string,
): Promise<OutlookTokenState> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new OutlookReauthRequired(`Outlook token request failed: ${res.status} ${await res.text()}`);
  }
  // The token endpoint's response is untrusted input — a proxy error page, a
  // truncated body, or an OAuth error object can all come back 200. Validate
  // the fields we're about to persist and act on rather than writing
  // `undefined` into chrome.storage.
  const data = (await res.json().catch(() => null)) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  } | null;
  if (!data || typeof data.access_token !== "string" || typeof data.expires_in !== "number") {
    throw new OutlookReauthRequired("Outlook token response was missing an access token");
  }
  const refreshToken =
    typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : existingRefreshToken;
  if (!refreshToken) {
    throw new OutlookReauthRequired("Outlook token response did not include a refresh token");
  }
  const tokens: OutlookTokenState = {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  await saveTokens(tokens);
  return tokens;
}

async function interactiveSignIn(): Promise<OutlookTokenState> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const redirectUri = chrome.identity.getRedirectURL();
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));

  const authUrl = new URL(`${AUTH_BASE}/authorize`);
  authUrl.searchParams.set("client_id", OUTLOOK_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  const responseUrl = await launchWebAuthFlow(authUrl.toString(), true);
  const params = new URL(responseUrl).searchParams;
  // Reject a redirect whose state doesn't echo the nonce we just generated —
  // launchWebAuthFlow already binds the response to this request, but
  // validating state is cheap defence-in-depth against a replayed/injected code.
  if (params.get("state") !== state) {
    throw new Error("Outlook sign-in failed: state mismatch");
  }
  const code = params.get("code");
  if (!code) {
    throw new Error(`Outlook sign-in failed: ${params.get("error_description") ?? "no code returned"}`);
  }

  return requestTokens(
    new URLSearchParams({
      client_id: OUTLOOK_CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      scope: SCOPES,
    }),
  );
}

async function refreshTokens(refreshToken: string): Promise<OutlookTokenState> {
  return requestTokens(
    new URLSearchParams({
      client_id: OUTLOOK_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: SCOPES,
    }),
    refreshToken,
  );
}

export async function isOutlookConnected(): Promise<boolean> {
  const tokens = await loadTokens();
  return Boolean(tokens?.refreshToken);
}

/** Refresh the access token regardless of the cached copy's stated expiry.
 * `getOutlookToken` trusts `expiresAt` and hands back a not-yet-expired token
 * even when Microsoft has invalidated it server-side (revocation, password
 * change, clock skew) — the case a 401 recovery needs to break out of.
 * Throws `OutlookReauthRequired` when the refresh token itself is gone or
 * rejected. */
export async function forceRefreshOutlookToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens?.refreshToken) throw new OutlookReauthRequired();
  try {
    const refreshed = await refreshTokens(tokens.refreshToken);
    return refreshed.accessToken;
  } catch (err) {
    throw err instanceof OutlookReauthRequired ? err : new OutlookReauthRequired();
  }
}

export async function getOutlookToken(interactive: boolean): Promise<string> {
  let tokens = await loadTokens();

  if (tokens && Date.now() < tokens.expiresAt - EXPIRY_SKEW_MS) {
    return tokens.accessToken;
  }

  if (tokens?.refreshToken) {
    try {
      tokens = await refreshTokens(tokens.refreshToken);
      return tokens.accessToken;
    } catch {
      // Refresh token is dead (revoked/expired) — fall through to interactive sign-in.
    }
  }

  if (!interactive) {
    throw new Error("Outlook not connected");
  }

  tokens = await interactiveSignIn();
  return tokens.accessToken;
}
