import { afterEach, describe, expect, it, vi } from "vitest";
import { batchPerId, GraphBatchError, outlookProvider } from "./outlookProvider";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Outlook JSON batching", () => {
  it("retries only throttled inner responses and succeeds after partial retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          responses: [
            { id: "0", status: 204 },
            { id: "1", status: 429, headers: { "Retry-After": "0" } },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ responses: [{ id: "1", status: 204 }] }));
    vi.stubGlobal("fetch", fetchMock);

    await batchPerId("token", ["a", "b"], (id) => ({
      method: "PATCH",
      url: `/me/messages/${id}`,
      body: { isRead: true },
    }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(retryBody.requests).toHaveLength(1);
    expect(retryBody.requests[0].url).toContain("/b");
  });

  it("surfaces non-retryable inner failures with their message ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ responses: [{ id: "0", status: 403, body: { error: "denied" } }] })),
    );

    await expect(
      batchPerId("token", ["message-a"], (id) => ({ method: "DELETE", url: `/me/messages/${id}` })),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GraphBatchError>>({
        failures: [{ messageId: "message-a", status: 403, body: { error: "denied" } }],
      }),
    );
  });

  it("merges a Cluster category without replacing existing Outlook categories", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ value: [{ displayName: "Cluster/Shopping" }] }))
      .mockResolvedValueOnce(
        json({ responses: [{ id: "0", status: 200, body: { categories: ["Important"] } }] }),
      )
      .mockResolvedValueOnce(json({ responses: [{ id: "0", status: 200, body: {} }] }));
    vi.stubGlobal("fetch", fetchMock);

    await outlookProvider.labelMessages!("token", ["message-a"], "Cluster/Shopping", true);

    const patchBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(patchBody.requests[0].body.categories).toEqual(["Important", "Cluster/Shopping"]);
    expect(patchBody.requests[0].headers.Prefer).toBe('IdType="ImmutableId"');
  });
});
