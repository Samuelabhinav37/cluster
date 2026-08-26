import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./httpRetry";

function makeResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

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
