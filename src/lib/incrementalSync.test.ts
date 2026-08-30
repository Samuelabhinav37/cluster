import { describe, expect, it, vi } from "vitest";
import { buildIncrementalSenderSummaries } from "./incrementalSync";
import type { EmailProvider, NormalizedMessageMetadata } from "./providers/emailProvider";

const metadata: NormalizedMessageMetadata = {
  id: "m1",
  provider: "gmail",
  fromAddress: "news@example.com",
  fromDisplayName: "News",
  replyToAddress: "",
  subject: "Update",
  isProtected: false,
  unread: true,
  sizeBytes: 10,
  unsubscribe: {},
  receivedAt: 1,
};

function provider(): EmailProvider {
  return {
    id: "gmail",
    isConnected: vi.fn(async () => true),
    getAuthToken: vi.fn(async () => "token"),
    listCandidateMessages: vi.fn(async () => []),
    listIncrementalMessages: vi.fn(async () => ({
      messages: [{ id: "m1", provider: "gmail" as const }],
      cursor: "history-2",
      reset: false,
    })),
    getMessageMetadata: vi.fn(async () => metadata),
    trashMessages: vi.fn(async () => {}),
  };
}

describe("buildIncrementalSenderSummaries", () => {
  it("uses the prior cursor and returns a checkpoint only after metadata succeeds", async () => {
    const gmail = provider();
    const result = await buildIncrementalSenderSummaries(
      [gmail],
      { gmail: "history-1" },
      500,
      30,
      "security",
    );
    expect(gmail.listIncrementalMessages).toHaveBeenCalledWith("token", "history-1", 500, 30, "security");
    expect(result.cursors.gmail).toBe("history-2");
    expect(result.changedMessageCount).toBe(1);
    expect(result.senders[0].address).toBe("news@example.com");
  });

  it("does not return a new checkpoint when metadata processing fails", async () => {
    const gmail = provider();
    gmail.getMessageMetadata = vi.fn(async () => {
      throw new Error("metadata failed");
    });
    await expect(
      buildIncrementalSenderSummaries([gmail], { gmail: "history-1" }, 500, 30, "security"),
    ).rejects.toThrow("metadata failed");
  });
});
