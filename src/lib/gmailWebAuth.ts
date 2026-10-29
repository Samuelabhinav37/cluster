// Gmail sign-in through Google's own window (launchWebAuthFlow + PKCE), the
// way Outlook already signs in (msalAuth.ts). Google gives this client its
// tokens only with the client secret, which can't ship in an extension, so
// the code and refresh swaps go through Cluster's sign-in helper
// (auth-worker/), which adds the secret and keeps nothing.
//
// The refresh token lives in chrome.storage.local, the 1-hour access token in
// chrome.storage.session. Only an open page ever shows Google's window; the
// service worker only refreshes.

const CLIENT_ID = "995931931748-bthcfr7bc5s12u86dafnlvfmogg4pnh9.apps.googleusercontent.com";
const HELPER = "https://cluster-auth.samuelabhinav37.workers.dev";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const REFRESH_KEY = "gmailAuth";
const ACCESS_KEY = "gmailAccess";
// Renew this long before Google's expiry, so a call never starts on a dying token.
const EARLY_MS = 2 * 60_000;

interface StoredAuth {
  refreshToken: string;
  scopes: string[];
  email?: string;
}

interface StoredAccess {
  token: string;
  expiresAt: number;
  scopes: string[];
}

interface TokenAnswer {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

/** Google said the refresh token is no good (revoked, expired, password change). */
export class GmailSignInExpired extends Error {
  constructor() {
    super("Your Gmail sign-in expired. Connect again.");
  }
}

const covers = (granted: readonly string[], wanted: readonly string[]) => wanted.every((s) => granted.includes(s));

function base64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function readStored(): Promise<StoredAuth | undefined> {
  return ((await chrome.storage.local.get(REFRESH_KEY)) as Record<string, StoredAuth | undefined>)[REFRESH_KEY];
}

async function readAccess(): Promise<StoredAccess | undefined> {
  return ((await chrome.storage.session.get(ACCESS_KEY)) as Record<string, StoredAccess | undefined>)[ACCESS_KEY];
}

async function askHelper(path: "/token" | "/refresh", body: Record<string, string>): Promise<TokenAnswer> {
  const res = await fetch(`${HELPER}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const answer = (await res.json().catch(() => ({}))) as TokenAnswer;
  if (res.ok && answer.access_token) return answer;
  if (answer.error === "invalid_grant") throw new GmailSignInExpired();
  throw new Error(`Gmail sign-in failed: ${answer.error_description ?? answer.error ?? res.status}`);
}

async function saveAccess(answer: TokenAnswer, scopes: string[]): Promise<string> {
  const access: StoredAccess = {
    token: answer.access_token!,
    expiresAt: Date.now() + (answer.expires_in ?? 3600) * 1000,
    scopes,
  };
  await chrome.storage.session.set({ [ACCESS_KEY]: access });
  return access.token;
}

async function refresh(stored: StoredAuth): Promise<string> {
  try {
    const answer = await askHelper("/refresh", { refresh_token: stored.refreshToken });
    return await saveAccess(answer, answer.scope ? answer.scope.split(" ") : stored.scopes);
  } catch (err) {
    if (err instanceof GmailSignInExpired) await chrome.storage.local.remove(REFRESH_KEY);
    throw err;
  }
}

/** Google's window: pick an account, approve `scopes` (plus any already granted). */
async function signIn(scopes: string[], stored: StoredAuth | undefined): Promise<string> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const url = new URL(AUTH_URL);
  const params: Record<string, string> = {
    client_id: CLIENT_ID,
    redirect_uri: chrome.identity.getRedirectURL(),
    response_type: "code",
    scope: [...new Set([...(stored?.scopes ?? []), ...scopes])].join(" "),
    include_granted_scopes: "true",
    access_type: "offline",
    // "consent" makes Google send a refresh token every time, so asking for
    // one more permission later still leaves a working one.
    prompt: stored?.email ? "consent" : "select_account consent",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  };
  if (stored?.email) params.login_hint = stored.email;
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const responseUrl = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive: true });
  const back = new URL(responseUrl ?? "");
  // launchWebAuthFlow ties the answer to this request; state guards the rest.
  if (back.searchParams.get("state") !== state) throw new Error("Gmail sign-in failed: state mismatch");
  const error = back.searchParams.get("error");
  if (error) throw new Error(error === "access_denied" ? "The user did not approve access." : `Gmail sign-in failed: ${error}`);
  const code = back.searchParams.get("code");
  if (!code) throw new Error("Gmail sign-in failed: no code");

  const answer = await askHelper("/token", { code, code_verifier: verifier });
  const granted = answer.scope ? answer.scope.split(" ") : scopes;
  const refreshToken = answer.refresh_token ?? stored?.refreshToken;
  const token = await saveAccess(answer, granted);
  if (refreshToken) {
    const email = stored?.email ?? (await profileEmail(token));
    await chrome.storage.local.set({ [REFRESH_KEY]: { refreshToken, scopes: granted, email } satisfies StoredAuth });
  }
  return token;
}

async function profileEmail(token: string): Promise<string | undefined> {
  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok ? ((await res.json()) as { emailAddress?: string }).emailAddress : undefined;
  } catch {
    return undefined;
  }
}

let inFlight: Promise<string> | undefined;

/**
 * An access token covering `scopes`: the saved one while fresh, else a
 * quiet refresh, else (only when `interactive`) Google's window. Throws when
 * it would need the window and may not show it.
 */
export async function getGmailToken(scopes: string[], interactive: boolean): Promise<string> {
  const access = await readAccess();
  if (access && access.expiresAt - EARLY_MS > Date.now() && covers(access.scopes, scopes)) return access.token;
  const stored = await readStored();
  if (stored && covers(stored.scopes, scopes)) {
    // One refresh at a time per page; Gmail calls run in parallel.
    inFlight ??= refresh(stored).finally(() => (inFlight = undefined));
    try {
      return await inFlight;
    } catch (err) {
      if (!interactive || !(err instanceof GmailSignInExpired)) throw err;
    }
  }
  if (!interactive) throw new Error("No auth token returned");
  return signIn(scopes, await readStored());
}

/** The permissions Google has granted so far, empty when signed out. */
export async function grantedGmailScopes(): Promise<string[]> {
  return (await readStored())?.scopes ?? [];
}

/** Forget a token Gmail rejected, so the next call refreshes. */
export async function dropGmailToken(token: string): Promise<void> {
  if ((await readAccess())?.token === token) await chrome.storage.session.remove(ACCESS_KEY);
}

/** The refresh token, for revoking on sign out (revoking it revokes everything). */
export async function gmailRefreshToken(): Promise<string | undefined> {
  return (await readStored())?.refreshToken;
}

/** Forget this Gmail sign-in on this computer. */
export async function forgetGmailSignIn(): Promise<void> {
  await chrome.storage.local.remove(REFRESH_KEY);
  await chrome.storage.session.remove(ACCESS_KEY);
}
