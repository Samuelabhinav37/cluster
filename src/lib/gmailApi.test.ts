import { afterEach, describe, expect, it, vi } from "vitest";
import { listInboxMessageIdsSince } from "./gmailApi";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
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
