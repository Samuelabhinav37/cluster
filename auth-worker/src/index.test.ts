import { describe, expect, it, vi } from "vitest";
import { handle, type Env } from "./index";

const ID = "liaceeofdpmhnmklhphnldjjpchcpbcn";
const ORIGIN = `chrome-extension://${ID}`;
const env = (overrides: Partial<Env> = {}): Env => ({
  GOOGLE_CLIENT_ID: "cid",
  GOOGLE_CLIENT_SECRET: "shh",
  EXTENSION_ID: ID,
  IP_LIMITER: { limit: async () => ({ success: true }) },
  ...overrides,
});

const post = (path: string, body: unknown, origin: string | null = ORIGIN) =>
  new Request(`https://cluster-auth.example.workers.dev${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });

function google(status = 200, answer: unknown = { access_token: "a", expires_in: 3599 }) {
  return vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(answer), { status }));
}

describe("cluster-auth worker", () => {
  it("swaps a code with the secret and a fixed redirect, and passes Google's answer back", async () => {
    const fetchImpl = google();
    const res = await handle(
      post("/token", { code: "c", code_verifier: "v", redirect_uri: "https://evil.example/" }),
      env(),
      fetchImpl as unknown as typeof fetch,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: "a", expires_in: 3599 });
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const sent: Record<string, string> = {};
    (fetchImpl.mock.calls[0][1].body as URLSearchParams).forEach((v, k) => (sent[k] = v));
    expect(sent).toEqual({
      client_id: "cid",
      client_secret: "shh",
      grant_type: "authorization_code",
      code: "c",
      code_verifier: "v",
      redirect_uri: `https://${ID}.chromiumapp.org/`,
    });
  });

  it("refreshes, and passes Google's errors through with their status", async () => {
    const fetchImpl = google(400, { error: "invalid_grant" });
    const res = await handle(post("/refresh", { refresh_token: "r" }), env(), fetchImpl as unknown as typeof fetch);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_grant" });
  });

  it("refuses other origins, bad fields, other paths and busy callers without asking Google", async () => {
    const fetchImpl = google();
    const f = fetchImpl as unknown as typeof fetch;
    expect((await handle(post("/token", { code: "c", code_verifier: "v" }, "https://evil.example"), env(), f)).status).toBe(403);
    expect((await handle(post("/token", { code: "c" }), env(), f)).status).toBe(400);
    expect((await handle(post("/refresh", { refresh_token: "x".repeat(5000) }), env(), f)).status).toBe(400);
    expect((await handle(post("/other", {}), env(), f)).status).toBe(404);
    const busy = env({ IP_LIMITER: { limit: async () => ({ success: false }) } });
    expect((await handle(post("/refresh", { refresh_token: "r" }), busy, f)).status).toBe(429);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers the preflight only for Cluster", async () => {
    const pre = (origin: string) => new Request("https://x/token", { method: "OPTIONS", headers: { origin } });
    expect((await handle(pre(ORIGIN), env())).status).toBe(204);
    expect((await handle(pre("https://evil.example"), env())).status).toBe(403);
  });
});
