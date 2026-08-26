import { OUTLOOK_CLIENT_ID, OUTLOOK_TENANT } from "./outlookConfig";

const AUTH_BASE = `https://login.microsoftonline.com/${OUTLOOK_TENANT}/oauth2/v2.0`;
const SCOPES = "offline_access Mail.ReadBasic Mail.ReadWrite";
const STORAGE_KEY = "outlookTokens";
const EXPIRY_SKEW_MS = 60_000;

interface OutlookTokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
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
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return (data[STORAGE_KEY] as OutlookTokenState) ?? null;
}

async function saveTokens(tokens: OutlookTokenState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: tokens });
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

async function requestTokens(body: URLSearchParams): Promise<OutlookTokenState> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Outlook token request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const tokens: OutlookTokenState = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
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
  );
}

export async function isOutlookConnected(): Promise<boolean> {
  const tokens = await loadTokens();
  return Boolean(tokens?.refreshToken);
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
