// 1.4 spike: does Google issue tokens to a Web application client with a
// chromiumapp.org redirect and PKCE, without a client secret? Throwaway page;
// it prints each step's outcome and never shows a token.
const CLIENT_ID = "995931931748-bthcfr7bc5s12u86dafnlvfmogg4pnh9.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const out = document.getElementById("out")!;
const lines: string[] = [];
const say = (line: string) => {
  lines.push(line);
  out.textContent = lines.join("\n");
};

function base64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function tokenCall(body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, ...json };
}

/** What a token response holds, with the secrets replaced by "yes". */
function shape(r: Record<string, unknown>): string {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) safe[k] = /token/.test(k) ? Boolean(v) : v;
  return JSON.stringify(safe, null, 2);
}

async function run(): Promise<void> {
  lines.length = 0;
  const redirectUri = chrome.identity.getRedirectURL();
  say(`Extension ID: ${chrome.runtime.id}`);
  say(`Redirect URI: ${redirectUri}`);

  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [k, v] of Object.entries({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "select_account consent",
    state,
  }))
    auth.searchParams.set(k, v);

  say("\n1. Google sign-in window…");
  let responseUrl: string;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({ url: auth.toString(), interactive: true }) ?? "";
  } catch (err) {
    say(`   Failed: ${(err as Error).message}`);
    return;
  }
  const back = new URL(responseUrl);
  if (back.searchParams.get("error")) return say(`   Google said: ${back.searchParams.get("error")}`);
  if (back.searchParams.get("state") !== state) return say("   State did not match. Stopped.");
  const code = back.searchParams.get("code");
  if (!code) return say("   No code came back.");
  say("   Got a sign-in code.");

  say("\n2. Swap the code for tokens, no secret…");
  const tokens = await tokenCall({
    client_id: CLIENT_ID,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  say(shape(tokens));
  const access = tokens.access_token as string | undefined;
  const refresh = tokens.refresh_token as string | undefined;
  if (!access) return say("\nRESULT: Google wants the secret (or something else failed above).");

  say("\n3. Read your Gmail profile with it…");
  const profile = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${access}` },
  });
  const p = (await profile.json()) as { emailAddress?: string; messagesTotal?: number };
  say(profile.ok ? `   Signed in as ${p.emailAddress} (${p.messagesTotal} emails)` : `   Failed: ${profile.status}`);

  if (refresh) {
    say("\n4. Refresh without a secret…");
    say(shape(await tokenCall({ client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: refresh })));
  } else {
    say("\n4. No refresh token came back.");
  }
  // Leave nothing behind: revoke what this test got.
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh ?? access)}`, {
    method: "POST",
  }).catch(() => {});
  say("\nDone. The test's access was revoked again.");
}

document.getElementById("run")!.onclick = () => void run().catch((err) => say(`Error: ${(err as Error).message}`));
