import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry, parseRetryAfterMs } from "./httpRetry";

function makeResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

function makeJsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const gmailRateLimitBody = {
  error: {
    code: 403,
    status: "PERMISSION_DENIED",
    errors: [{ reason: "rateLimitExceeded", domain: "usageLimits" }],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithRetry", () => {
  it("returns immediately on a successful response with no retries", async () => {
    const fetchMock = vi.fn(async () => makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com", {}, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429))
      .mockResolvedValueOnce(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com", {}, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors Retry-After on a 429 response", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429, { "Retry-After": "2" }))
      .mockResolvedValueOnce(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("https://example.com", {}, { baseDelayMs: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    const res = await promise;
    expect(res.status).toBe(200);
    vi.useRealTimers();
  });

  it("parses both Retry-After seconds and HTTP dates", () => {
    const now = Date.parse("2026-08-30T12:00:00Z");
    expect(parseRetryAfterMs("2", now)).toBe(2000);
    expect(parseRetryAfterMs("Sun, 30 Aug 2026 12:00:03 GMT", now)).toBe(3000);
    expect(parseRetryAfterMs("invalid", now)).toBeUndefined();
  });

  it("retries transient 5xx errors up to maxRetries, then returns the failing response", async () => {
    const fetchMock = vi.fn(async () => makeResponse(503));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com", {}, { baseDelayMs: 1, maxRetries: 2 });
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  it("does not retry a 4xx auth failure", async () => {
    const fetchMock = vi.fn(async () => makeResponse(401));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com", {}, { baseDelayMs: 1 });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a Gmail rate-limit returned as HTTP 403", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse(403, gmailRateLimitBody))
      .mockResolvedValueOnce(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com", {}, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a plain 403 permission denial", async () => {
    const fetchMock = vi.fn(async () =>
      makeJsonResponse(403, { error: { message: "Request had insufficient authentication scopes." } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com", {}, { baseDelayMs: 1 });
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The body peek used a clone — the caller can still read it.
    await expect(res.json()).resolves.toMatchObject({ error: { message: expect.any(String) } });
  });

  it("caps the wait when a rate-limit response asks for an implausibly long Retry-After", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse(403, gmailRateLimitBody, { "Retry-After": "120" }))
      .mockResolvedValueOnce(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("https://example.com", {}, { baseDelayMs: 1 });
    await vi.advanceTimersByTimeAsync(10_000); // the cap, not 120s
    await expect(promise).resolves.toHaveProperty("status", 200);
    vi.useRealTimers();
  });

  it("retries on a thrown network error and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce(makeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com", {}, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
  });
});
