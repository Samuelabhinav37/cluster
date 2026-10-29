import { beforeEach, describe, expect, it, vi } from "vitest";
import { dropGmailToken, forgetGmailSignIn, getGmailToken, GmailSignInExpired, grantedGmailScopes } from "./gmailWebAuth";

const MODIFY = "https://www.googleapis.com/auth/gmail.modify";
const FILTER = "https://www.googleapis.com/auth/gmail.settings.basic";
const HELPER = "https://cluster-auth.samuelabhinav37.workers.dev";

function area() {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
    set: async (items: Record<string, unknown>) => void Object.assign(data, items),
    remove: async (key: string) => void delete data[key],
  };
}

let local: ReturnType<typeof area>;
let session: ReturnType<typeof area>;
let authUrls: URL[];

/** Google's window: answers with a code for whatever state it was given. */
function stubChrome(answer: (url: URL) => string = (url) => `?code=c1&state=${url.searchParams.get("state")}`) {
  local = area();
  session = area();
  authUrls = [];
  vi.stubGlobal("chrome", {
    storage: { local, session },
    identity: {
      getRedirectURL: () => "https://id.chromiumapp.org/",
      launchWebAuthFlow: vi.fn(async ({ url }: { url: string }) => {
        const u = new URL(url);
        authUrls.push(u);
        return `https://id.chromiumapp.org/${answer(u)}`;
      }),
    },
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

/** The helper and Gmail's profile, answered per path. */
function stubFetch(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (input: string, _init?: RequestInit) => {
    const path = input.startsWith(HELPER) ? input.slice(HELPER.length) : "profile";
    return routes[path]?.() ?? json({ error: "unexpected" }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
  stubChrome();
});

describe("getGmailToken", () => {
  it("signs in through Google's window, swaps the code at the helper, and remembers the account", async () => {
    const fetchMock = stubFetch({
      "/token": () => json({ access_token: "a1", refresh_token: "r1", expires_in: 3600, scope: MODIFY }),
      profile: () => json({ emailAddress: "me@gmail.com" }),
    });
    expect(await getGmailToken([MODIFY], true)).toBe("a1");

    const url = authUrls[0];
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("select_account consent");
    expect(url.searchParams.get("scope")).toBe(MODIFY);
    const sent = JSON.parse(fetchMock.mock.calls[0][1]!.body as string) as Record<string, string>;
    expect(Object.keys(sent).sort()).toEqual(["code", "code_verifier"]);
    expect(local.data.gmailAuth).toEqual({ refreshToken: "r1", scopes: [MODIFY], email: "me@gmail.com" });
    expect(await grantedGmailScopes()).toEqual([MODIFY]);

    // Fresh: no second call anywhere.
    expect(await getGmailToken([MODIFY], false)).toBe("a1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes quietly once the pass is old, and never shows the window when it may not", async () => {
    local.data.gmailAuth = { refreshToken: "r1", scopes: [MODIFY], email: "me@gmail.com" };
    session.data.gmailAccess = { token: "old", expiresAt: Date.now() + 30_000, scopes: [MODIFY] };
    stubFetch({ "/refresh": () => json({ access_token: "a2", expires_in: 3600, scope: MODIFY }) });
    expect(await getGmailToken([MODIFY], false)).toBe("a2");
    expect(authUrls).toHaveLength(0);

    // Filters need one more permission: not without a window.
    await expect(getGmailToken([MODIFY, FILTER], false)).rejects.toThrow("No auth token returned");
    expect(authUrls).toHaveLength(0);
  });

  it("asks for one more permission with the account prefilled, keeping the old refresh token if none comes", async () => {
    local.data.gmailAuth = { refreshToken: "r1", scopes: [MODIFY], email: "me@gmail.com" };
    stubFetch({ "/token": () => json({ access_token: "a3", expires_in: 3600, scope: `${MODIFY} ${FILTER}` }) });
    expect(await getGmailToken([MODIFY, FILTER], true)).toBe("a3");
    expect(authUrls[0].searchParams.get("login_hint")).toBe("me@gmail.com");
    expect(authUrls[0].searchParams.get("scope")).toBe(`${MODIFY} ${FILTER}`);
    expect(local.data.gmailAuth).toEqual({ refreshToken: "r1", scopes: [MODIFY, FILTER], email: "me@gmail.com" });
  });

  it("forgets a revoked sign-in and says so", async () => {
    local.data.gmailAuth = { refreshToken: "dead", scopes: [MODIFY] };
    stubFetch({ "/refresh": () => json({ error: "invalid_grant" }, 400) });
    await expect(getGmailToken([MODIFY], false)).rejects.toBeInstanceOf(GmailSignInExpired);
    expect(local.data.gmailAuth).toBeUndefined();
  });

  it("refuses a window answer for another request, and passes a refusal through as cancelled", async () => {
    stubChrome(() => "?code=c1&state=forged");
    stubFetch({});
    await expect(getGmailToken([MODIFY], true)).rejects.toThrow(/state mismatch/);

    stubChrome((url) => `?error=access_denied&state=${url.searchParams.get("state")}`);
    await expect(getGmailToken([MODIFY], true)).rejects.toThrow("The user did not approve access.");
  });

  it("drops a rejected pass and forgets everything on sign out", async () => {
    local.data.gmailAuth = { refreshToken: "r1", scopes: [MODIFY] };
    session.data.gmailAccess = { token: "a1", expiresAt: Date.now() + 3_600_000, scopes: [MODIFY] };
    await dropGmailToken("other");
    expect(session.data.gmailAccess).toBeDefined();
    await dropGmailToken("a1");
    expect(session.data.gmailAccess).toBeUndefined();
    await forgetGmailSignIn();
    expect(local.data.gmailAuth).toBeUndefined();
  });
});
