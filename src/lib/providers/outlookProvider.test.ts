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

// Dispatches by method+path substring rather than call order -- these features
// (keepSorted/mute/screen) each fan out through ensureCategory/
// ensureMailFolder/findRuleIdByName/createInboxRule internally, so pinning
// exact call sequence would make the tests brittle to refactors of those
// shared helpers (already covered by their own tests above).
function graphRouter(
  handlers: Array<{ method: string; test: (url: string) => boolean; respond: (url: string, body: unknown) => Response }>,
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const handler = handlers.find((h) => h.method === method && h.test(url));
    if (!handler) throw new Error(`No handler for ${method} ${url}`);
    return handler.respond(url, body);
  });
}

describe("Outlook Screener / mute / keep-sorted / auto-quarantine parity", () => {
  it("keepSorted: ensures the category, creates a sender rule scoped to the archive folder, and files existing mail", async () => {
    const fetchMock = graphRouter([
      { method: "GET", test: (u) => u.includes("/outlook/masterCategories"), respond: () => json({ value: [{ displayName: "Shopping" }] }) },
      { method: "GET", test: (u) => u.includes("/mailFolders/archive"), respond: () => json({ id: "archive-id" }) },
      { method: "GET", test: (u) => u.endsWith("/messageRules"), respond: () => json({ value: [] }) },
      { method: "POST", test: (u) => u.endsWith("/messageRules"), respond: () => json({ id: "rule-1" }) },
      { method: "POST", test: (u) => u.endsWith("/$batch"), respond: (_u, b) => {
          const reqs = (b as { requests: { id: string; method: string; url: string }[] }).requests;
          return json({ responses: reqs.map((r) => ({ id: r.id, status: r.method === "GET" ? 200 : 200, body: r.method === "GET" ? { categories: [] } : {} })) });
        } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    await outlookProvider.keepSorted!("t", "amazon.com", "Shopping", ["m1"]);

    const rulePost = fetchMock.mock.calls.find(
      ([u, i]) => (u as string).endsWith("/messageRules") && (i as RequestInit | undefined)?.method === "POST",
    );
    const ruleBody = JSON.parse(String((rulePost?.[1] as RequestInit).body));
    expect(ruleBody).toMatchObject({
      displayName: "Cluster keep-sorted: amazon.com",
      conditions: { senderContains: ["amazon.com"] },
      actions: { assignCategories: ["Shopping"], moveToFolder: "archive-id", stopProcessingRules: true },
    });
  });

  it("muteSender: creates the Muted folder and a move-to-folder rule, then files existing mail there", async () => {
    const fetchMock = graphRouter([
      { method: "GET", test: (u) => u.includes("/mailFolders?"), respond: () => json({ value: [{ id: "muted-folder", displayName: "Muted" }] }) },
      { method: "GET", test: (u) => u.includes("/outlook/masterCategories"), respond: () => json({ value: [{ displayName: "Muted" }] }) },
      { method: "GET", test: (u) => u.endsWith("/messageRules"), respond: () => json({ value: [] }) },
      { method: "POST", test: (u) => u.endsWith("/messageRules"), respond: () => json({ id: "rule-mute" }) },
      { method: "POST", test: (u) => u.endsWith("/$batch"), respond: (_u, b) => {
          const reqs = (b as { requests: { id: string }[] }).requests;
          return json({ responses: reqs.map((r) => ({ id: r.id, status: 200, body: {} })) });
        } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    await outlookProvider.muteSender!("t", "spammer@x.com", ["m1", "m2"]);

    const rulePost = fetchMock.mock.calls.find(
      ([u, i]) => (u as string).endsWith("/messageRules") && (i as RequestInit | undefined)?.method === "POST",
    );
    const ruleBody = JSON.parse(String((rulePost?.[1] as RequestInit).body));
    expect(ruleBody).toMatchObject({
      displayName: "Cluster mute: spammer@x.com",
      conditions: { senderContains: ["spammer@x.com"] },
      actions: { assignCategories: ["Muted"], moveToFolder: "muted-folder", stopProcessingRules: true },
    });

    const batchPost = fetchMock.mock.calls.find(([u]) => (u as string).endsWith("/$batch"));
    const batchBody = JSON.parse(String((batchPost?.[1] as RequestInit).body));
    expect(batchBody.requests.every((r: { url: string; body: { destinationId: string } }) => r.body.destinationId === "muted-folder")).toBe(true);
  });

  it("unmuteSender: deletes the sender's mute rule (found by displayName) and moves mail back to inbox", async () => {
    const fetchMock = graphRouter([
      { method: "GET", test: (u) => u.endsWith("/messageRules"), respond: () => json({ value: [{ id: "rule-mute", displayName: "Cluster mute: spammer@x.com" }] }) },
      { method: "DELETE", test: (u) => u.includes("/messageRules/rule-mute"), respond: () => noContent() },
      { method: "POST", test: (u) => u.endsWith("/$batch"), respond: (_u, b) => {
          const reqs = (b as { requests: { id: string }[] }).requests;
          return json({ responses: reqs.map((r) => ({ id: r.id, status: 200, body: {} })) });
        } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    await outlookProvider.unmuteSender!("t", "spammer@x.com", ["m1"]);

    expect(fetchMock.mock.calls.some(([u, i]) => (u as string).includes("rule-mute") && (i as RequestInit)?.method === "DELETE")).toBe(true);
    const batchPost = fetchMock.mock.calls.find(([u]) => (u as string).endsWith("/$batch"));
    const batchBody = JSON.parse(String((batchPost?.[1] as RequestInit).body));
    expect(batchBody.requests[0].body.destinationId).toBe("inbox");
  });

  it("screenSender/allowSenderThrough: same mechanism as mute, scoped to the Screener folder/category", async () => {
    const fetchMock = graphRouter([
      { method: "GET", test: (u) => u.includes("/mailFolders?"), respond: () => json({ value: [{ id: "screener-folder", displayName: "Screener" }] }) },
      { method: "GET", test: (u) => u.includes("/outlook/masterCategories"), respond: () => json({ value: [{ displayName: "Screener" }] }) },
      { method: "GET", test: (u) => u.endsWith("/messageRules"), respond: () => json({ value: [{ id: "rule-screen", displayName: "Cluster screener: new@x.com" }] }) },
      { method: "DELETE", test: (u) => u.includes("/messageRules/rule-screen"), respond: () => noContent() },
      { method: "POST", test: (u) => u.endsWith("/messageRules"), respond: () => json({ id: "rule-screen-2" }) },
      { method: "POST", test: (u) => u.endsWith("/$batch"), respond: (_u, b) => {
          const reqs = (b as { requests: { id: string }[] }).requests;
          return json({ responses: reqs.map((r) => ({ id: r.id, status: 200, body: {} })) });
        } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    await outlookProvider.screenSender!("t", "new@x.com", ["m1"]);
    const rulePost = fetchMock.mock.calls.find(
      ([u, i]) => (u as string).endsWith("/messageRules") && (i as RequestInit | undefined)?.method === "POST",
    );
    expect(JSON.parse(String((rulePost?.[1] as RequestInit).body))).toMatchObject({
      displayName: "Cluster screener: new@x.com",
      actions: { assignCategories: ["Screener"], moveToFolder: "screener-folder", stopProcessingRules: true },
    });

    fetchMock.mockClear();
    await outlookProvider.allowSenderThrough!("t", "new@x.com", ["m1"]);
    expect(
      fetchMock.mock.calls.some(
        ([u, i]) => (u as string).includes("rule-screen") && (i as RequestInit)?.method === "DELETE",
      ),
    ).toBe(true);
    const batchPost = fetchMock.mock.calls.find(([u]) => (u as string).endsWith("/$batch"));
    expect(JSON.parse(String((batchPost?.[1] as RequestInit).body)).requests[0].body.destinationId).toBe("inbox");
  });

  it("listSentCorrespondents: dedupes To/Cc addresses across sent items, lowercased", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          value: [
            {
              toRecipients: [{ emailAddress: { address: "Friend@Example.com" } }],
              ccRecipients: [{ emailAddress: { address: "colleague@work.com" } }],
            },
            { toRecipients: [{ emailAddress: { address: "friend@example.com" } }] },
          ],
        }),
      ),
    );

    const addresses = await outlookProvider.listSentCorrespondents!("t");
    expect(addresses.sort()).toEqual(["colleague@work.com", "friend@example.com"]);
  });

  it("listProtectedMessageIds: filters on flag/flagStatus eq 'flagged' and pages through nextLink", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ value: [{ id: "m1" }, { id: "m2" }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/next" }),
      )
      .mockResolvedValueOnce(json({ value: [{ id: "m3" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const ids = await outlookProvider.listProtectedMessageIds!("t");
    expect(ids).toEqual(new Set(["m1", "m2", "m3"]));
    const firstUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstUrl).toContain(encodeURIComponent(`flag/flagStatus eq 'flagged'`));
  });

  it("labelSuspicious/unlabelSuspicious reuse labelMessages/unlabelMessages with the Possible Phishing category", async () => {
    const fetchMock = graphRouter([
      { method: "GET", test: (u) => u.includes("/outlook/masterCategories"), respond: () => json({ value: [{ displayName: "Possible Phishing" }] }) },
      { method: "POST", test: (u) => u.endsWith("/$batch"), respond: (_u, b) => {
          const reqs = (b as { requests: { id: string; method: string }[] }).requests;
          return json({ responses: reqs.map((r) => ({ id: r.id, status: 200, body: r.method === "GET" ? { categories: [] } : {} })) });
        } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    await outlookProvider.labelSuspicious!("t", ["m1"]);

    const batchCalls = fetchMock.mock.calls.filter(([u]) => (u as string).endsWith("/$batch"));
    const patchCall = batchCalls
      .map(([, i]) => JSON.parse(String((i as RequestInit).body)))
      .find((b) => b.requests.some((r: { method: string }) => r.method === "PATCH"));
    const patchReq = patchCall.requests.find((r: { method: string }) => r.method === "PATCH");
    expect(patchReq.body.categories).toContain("Possible Phishing");
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
