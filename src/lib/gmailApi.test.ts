import { afterEach, describe, expect, it, vi } from "vitest";
import { GmailApiError, getCurrentHistoryId, listInboxMessageIdsSince } from "./gmailApi";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
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
