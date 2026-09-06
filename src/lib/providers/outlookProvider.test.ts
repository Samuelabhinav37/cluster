import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./msalAuth", () => ({
  forceRefreshOutlookToken: vi.fn(async () => "refreshed-token"),
  getOutlookToken: vi.fn(async () => "token"),
  isOutlookConnected: vi.fn(async () => true),
}));

import {
  batchPerId,
  createInboxRule,
  deleteInboxRule,
  GraphBatchError,
  getArchiveFolderId,
  listInboxRules,
  outlookProvider,
} from "./outlookProvider";
import { forceRefreshOutlookToken } from "./msalAuth";

const forceRefreshMock = vi.mocked(forceRefreshOutlookToken);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const noContent = () => new Response(null, { status: 204 });

function call(fetchMock: ReturnType<typeof vi.fn>, n: number) {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit | undefined];
  return {
    url,
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
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
      .mockResolvedValueOnce(json({ value: [{ displayName: "Shopping" }] }))
      .mockResolvedValueOnce(
        json({ responses: [{ id: "0", status: 200, body: { categories: ["Important"] } }] }),
      )
      .mockResolvedValueOnce(json({ responses: [{ id: "0", status: 200, body: {} }] }));
    vi.stubGlobal("fetch", fetchMock);

    await outlookProvider.labelMessages!("token", ["message-a"], "Shopping", true);

    const patchBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(patchBody.requests[0].body.categories).toEqual(["Important", "Shopping"]);
    expect(patchBody.requests[0].headers.Prefer).toBe('IdType="ImmutableId"');
  });
});

describe("Graph inbox-rule request shape", () => {
  it("lists inbox rules, tolerating an empty response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ value: [{ id: "r1", displayName: "Shopping" }] })),
    );
    await expect(listInboxRules("t")).resolves.toEqual([{ id: "r1", displayName: "Shopping" }]);

    vi.stubGlobal("fetch", vi.fn(async () => json({})));
    await expect(listInboxRules("t")).resolves.toEqual([]);
  });

  it("creates a rule, reusing an existing master category", async () => {
    const body = {
      displayName: "Cluster: Shopping",
      sequence: 1,
      isEnabled: true,
      conditions: { senderContains: ["amazon.com"] },
      actions: { assignCategories: ["Shopping"], stopProcessingRules: true },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ value: [{ displayName: "Shopping" }] })) // masterCategories GET
      .mockResolvedValueOnce(json({ id: "rule-1" })); // messageRules POST
    vi.stubGlobal("fetch", fetchMock);

    await expect(createInboxRule("t", body)).resolves.toBe("rule-1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const post = call(fetchMock, 1);
    expect(post.url).toBe("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messageRules");
    expect(post.method).toBe("POST");
    expect(post.body).toEqual(body);
  });

  it("creates the master category first when it does not exist", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ value: [] })) // masterCategories GET — absent
      .mockResolvedValueOnce(json({})) // masterCategories POST
      .mockResolvedValueOnce(json({ id: "rule-2" })); // messageRules POST
    vi.stubGlobal("fetch", fetchMock);

    await createInboxRule("t", {
      displayName: "Cluster: Travel",
      actions: { assignCategories: ["Travel"] },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const catPost = call(fetchMock, 1);
    expect(catPost.url).toBe("https://graph.microsoft.com/v1.0/me/outlook/masterCategories");
    expect(catPost.method).toBe("POST");
    expect(catPost.body).toMatchObject({ displayName: "Travel" });
  });

  it("deletes an inbox rule by id", async () => {
    const fetchMock = vi.fn(noContent);
    vi.stubGlobal("fetch", fetchMock);

    await deleteInboxRule("t", "r9");

    expect(call(fetchMock, 0).url).toBe(
      "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messageRules/r9",
    );
    expect(call(fetchMock, 0).method).toBe("DELETE");
  });

  it("resolves the archive folder id, and returns null when Graph errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ id: "AAMk-archive" })));
    await expect(getArchiveFolderId("t")).resolves.toBe("AAMk-archive");

    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "not found" }, 404)));
    await expect(getArchiveFolderId("t")).resolves.toBeNull();
  });
});

describe("Graph stale-token recovery", () => {
  beforeEach(() => {
    forceRefreshMock.mockClear();
    forceRefreshMock.mockResolvedValue("refreshed-token");
  });

  it("force-refreshes once on a 401 and retries with the new token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "token expired" }, 401))
      .mockResolvedValueOnce(json({ value: [{ id: "r1", displayName: "Shopping" }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listInboxRules("stale-token")).resolves.toEqual([{ id: "r1", displayName: "Shopping" }]);

    expect(forceRefreshMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1] as { headers: Headers }).headers.get("Authorization")).toBe(
      "Bearer refreshed-token",
    );
  });

  it("propagates a second consecutive 401 as a Graph error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "revoked" }, 401)),
    );
    await expect(listInboxRules("stale-token")).rejects.toMatchObject({ status: 401 });
    expect(forceRefreshMock).toHaveBeenCalledTimes(1);
  });

  it("recovers inside a helper that swallows Graph errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "token expired" }, 401))
      .mockResolvedValueOnce(json({ id: "archive-folder" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getArchiveFolderId("stale-token")).resolves.toBe("archive-folder");
    expect(forceRefreshMock).toHaveBeenCalledTimes(1);
  });
});

describe("Outlook delta synchronization", () => {
  it("follows delta pages, skips removed messages, and returns the opaque checkpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          value: [{ id: "a" }, { id: "gone", "@removed": { reason: "deleted" } }],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/next-page",
        }),
      )
      .mockResolvedValueOnce(
        json({
          value: [{ id: "b" }],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/delta-checkpoint",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await outlookProvider.listIncrementalMessages!("token", undefined, 500, 30, "security");
    expect(result.messages.map((message) => message.id)).toEqual(["a", "b"]);
    expect(result.cursor).toContain("delta-checkpoint");
    expect(result.reset).toBe(true);
  });
});
