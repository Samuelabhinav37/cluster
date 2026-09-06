import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GmailApiError,
  createFilter,
  createSenderFilter,
  deleteFilter,
  deleteSenderFilters,
  getCurrentHistoryId,
  getOrCreateLabel,
  listFilters,
  listInboxMessageIdsSince,
} from "./gmailApi";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Gmail returns 204 (no body) from a successful DELETE. */
const noContent = () => new Response(null, { status: 204 });

/** URL + method + parsed JSON body of the Nth fetch call. */
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
});

describe("Gmail filter API request shape", () => {
  it("lists filters and tolerates an empty response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ filter: [{ id: "f1", criteria: { from: "a@x.com" } }] })),
    );
    await expect(listFilters("t")).resolves.toEqual([{ id: "f1", criteria: { from: "a@x.com" } }]);

    vi.stubGlobal("fetch", vi.fn(async () => json({})));
    await expect(listFilters("t")).resolves.toEqual([]);
  });

  it("creates a filter with a criteria/action body and returns the new id", async () => {
    const fetchMock = vi.fn(async () => json({ id: "new-filter" }));
    vi.stubGlobal("fetch", fetchMock);

    const id = await createFilter("t", { from: "(a.com OR b.com) -c.com" }, { addLabelIds: ["L1"] });

    expect(id).toBe("new-filter");
    const c = call(fetchMock, 0);
    expect(c.url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/settings/filters");
    expect(c.method).toBe("POST");
    expect(c.body).toEqual({
      criteria: { from: "(a.com OR b.com) -c.com" },
      action: { addLabelIds: ["L1"] },
    });
  });

  it("deletes a filter by id", async () => {
    const fetchMock = vi.fn(noContent);
    vi.stubGlobal("fetch", fetchMock);

    await deleteFilter("t", "f9");

    const c = call(fetchMock, 0);
    expect(c.url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/settings/filters/f9");
    expect(c.method).toBe("DELETE");
  });

  it("createSenderFilter labels and files a from:address out of the inbox", async () => {
    const fetchMock = vi.fn(async () => json({ id: "f-sender" }));
    vi.stubGlobal("fetch", fetchMock);

    await createSenderFilter("t", "spam@x.com", "LABEL_9");

    expect(call(fetchMock, 0).body).toEqual({
      criteria: { from: "spam@x.com" },
      action: { addLabelIds: ["LABEL_9"], removeLabelIds: ["INBOX"] },
    });
  });

  it("deleteSenderFilters removes only the filters whose from: matches, case-insensitively", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          filter: [
            { id: "match-1", criteria: { from: "Foo@Bar.com" } },
            { id: "other", criteria: { from: "someone@else.com" } },
            { id: "match-2", criteria: { from: "foo@bar.com" } },
          ],
        }),
      )
      .mockResolvedValue(noContent());
    vi.stubGlobal("fetch", fetchMock);

    await deleteSenderFilters("t", "foo@bar.com");

    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 list + 2 deletes
    expect(call(fetchMock, 1).method).toBe("DELETE");
    expect(call(fetchMock, 1).url).toContain("/filters/match-1");
    expect(call(fetchMock, 2).url).toContain("/filters/match-2");
  });

  it("getOrCreateLabel reuses an existing label case-insensitively, else creates one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ labels: [{ id: "L_SHOP", name: "shopping" }] })),
    );
    await expect(getOrCreateLabel("t", "Shopping")).resolves.toBe("L_SHOP");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ labels: [{ id: "L_OTHER", name: "Work" }] }))
      .mockResolvedValueOnce(json({ id: "L_NEW" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getOrCreateLabel("t", "Shopping")).resolves.toBe("L_NEW");
    expect(call(fetchMock, 1).method).toBe("POST");
    expect(call(fetchMock, 1).body).toMatchObject({ name: "Shopping" });
  });
});

describe("Gmail stale-token recovery", () => {
  function stubIdentity(freshToken: string) {
    const removeCachedAuthToken = vi.fn((_d: { token: string }, cb: () => void) => cb());
    const getAuthToken = vi.fn((_o: unknown, cb: (t: string) => void) => cb(freshToken));
    vi.stubGlobal("chrome", { runtime: {}, identity: { getAuthToken, removeCachedAuthToken } });
    return { removeCachedAuthToken, getAuthToken };
  }

  it("evicts a 401 token, refreshes once, and retries the request", async () => {
    const { removeCachedAuthToken, getAuthToken } = stubIdentity("fresh-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "invalid credentials" }, 401))
      .mockResolvedValueOnce(json({ historyId: "42" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCurrentHistoryId("stale-token")).resolves.toBe("42");

    expect(removeCachedAuthToken).toHaveBeenCalledWith({ token: "stale-token" }, expect.any(Function));
    expect(getAuthToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer fresh-token",
    });
  });

  it("gives up after a second consecutive 401", async () => {
    const { removeCachedAuthToken } = stubIdentity("fresh-token");
    const fetchMock = vi.fn(async () => json({ error: "revoked" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    const err = await getCurrentHistoryId("stale-token").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GmailApiError);
    expect((err as GmailApiError).status).toBe(401);
    expect(removeCachedAuthToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not treat a 403 as a recoverable token problem", async () => {
    const { removeCachedAuthToken } = stubIdentity("fresh-token");
    const fetchMock = vi.fn(async () => json({ error: "forbidden" }, 403));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCurrentHistoryId("token")).rejects.toMatchObject({ status: 403 });
    expect(removeCachedAuthToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Gmail history synchronization", () => {
  it("deduplicates Inbox additions across pages and returns the latest history id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          history: [{ messagesAdded: [{ message: { id: "a", labelIds: ["INBOX"] } }] }],
          nextPageToken: "page-2",
          historyId: "11",
        }),
      )
      .mockResolvedValueOnce(
        json({
          history: [
            {
              messagesAdded: [
                { message: { id: "a", labelIds: ["INBOX"] } },
                { message: { id: "b", labelIds: ["INBOX"] } },
                { message: { id: "archived", labelIds: [] } },
              ],
            },
          ],
          historyId: "12",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listInboxMessageIdsSince("token", "10");
    expect(result).toEqual({ messageIds: ["a", "b"], historyId: "12", expired: false });
  });

  it("reports an expired checkpoint on Gmail's 404 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "stale" }, 404)),
    );
    await expect(listInboxMessageIdsSince("token", "old")).resolves.toEqual({
      messageIds: [],
      historyId: "old",
      expired: true,
    });
  });
});
