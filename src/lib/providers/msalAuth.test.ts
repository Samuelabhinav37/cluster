import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutlookReauthRequired, forceRefreshOutlookToken } from "./msalAuth";

// Storage keys, mirrored from msalAuth.ts.
const REFRESH_KEY = "outlookRefreshToken";
const ACCESS_KEY = "outlookAccessToken";

function fakeStorageArea(seed: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(seed));
  return {
    store,
    async get(keys?: string | string[]) {
      const list = keys == null ? [...store.keys()] : Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const key of list) if (store.has(key)) out[key] = store.get(key);
      return out;
    },
    async set(items: Record<string, unknown>) {
      for (const [key, value] of Object.entries(items)) store.set(key, value);
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
    },
  };
}

function tokenResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

let local: ReturnType<typeof fakeStorageArea>;
let session: ReturnType<typeof fakeStorageArea>;

beforeEach(() => {
  local = fakeStorageArea();
  session = fakeStorageArea();
  vi.stubGlobal("chrome", { storage: { local, session } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("forceRefreshOutlookToken", () => {
  it("throws OutlookReauthRequired when no refresh token is stored", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(forceRefreshOutlookToken()).rejects.toBeInstanceOf(OutlookReauthRequired);
  });

  it("exchanges the stored refresh token and returns the new access token", async () => {
    await local.set({ [REFRESH_KEY]: { refreshToken: "rt-1" } });
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        tokenResponse({ access_token: "at-2", refresh_token: "rt-2", expires_in: 3600 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(forceRefreshOutlookToken()).resolves.toBe("at-2");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=rt-1");
    const stored = (await session.get(ACCESS_KEY))[ACCESS_KEY] as { accessToken: string };
    expect(stored.accessToken).toBe("at-2");
  });

  it("throws OutlookReauthRequired when the refresh token is rejected", async () => {
    await local.set({ [REFRESH_KEY]: { refreshToken: "rt-dead" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => tokenResponse({ error: "invalid_grant" }, 400)),
    );
    await expect(forceRefreshOutlookToken()).rejects.toBeInstanceOf(OutlookReauthRequired);
  });
});
