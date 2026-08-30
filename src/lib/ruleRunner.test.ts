import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageRecord, SenderSummary } from "./senderModel";
import type { EmailProvider, ProviderId } from "./providers/emailProvider";
import type { ClusterRule } from "./rules";

const { appendActionLog } = vi.hoisted(() => ({ appendActionLog: vi.fn() }));
vi.mock("./actionLog", async (orig) => ({
  ...(await orig<typeof import("./actionLog")>()),
  appendActionLog,
}));

import { applyRules, previewRuleMatches } from "./ruleRunner";

function msg(over: Partial<MessageRecord> & { id: string }): MessageRecord {
  return {
    receivedAt: Date.now(),
    kind: "newsletter",
    isProtected: false,
    unread: false,
    sizeBytes: 0,
    ...over,
  };
}

function sender(address: string, provider: ProviderId, messages: MessageRecord[]): SenderSummary {
  return {
    key: `${provider}:${address}`,
    provider,
    address,
    displayName: address,
    count: messages.length,
    messageIds: messages.map((m) => m.id),
    protectedMessageIds: messages.filter((m) => m.isProtected).map((m) => m.id),
    unsubscribe: {},
    messages,
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
  };
}

function fakeProvider(id: ProviderId, over: Partial<EmailProvider> = {}): EmailProvider {
  return {
    id,
    isConnected: vi.fn(async () => true),
    getAuthToken: vi.fn(async () => `${id}-token`),
    listCandidateMessages: vi.fn(async () => []),
    getMessageMetadata: vi.fn(),
    trashMessages: vi.fn(async () => {}),
    ...over,
  };
}

const archiveRule: ClusterRule = {
  id: "r1",
  name: "Old newsletters",
  enabled: true,
  conditions: { kind: "newsletter", fromDomain: "news.com" },
  action: "archive",
};

beforeEach(() => appendActionLog.mockClear());

describe("applyRules", () => {
  it("calls the matching provider action with the matched ids and logs one entry", async () => {
    const archiveMessages = vi.fn(async () => {});
    const gmail = fakeProvider("gmail", { archiveMessages });
    const s = sender("a@news.com", "gmail", [msg({ id: "1" }), msg({ id: "2" })]);

    const results = await applyRules([archiveRule], [s], new Map([["gmail", gmail]]));

    expect(archiveMessages).toHaveBeenCalledWith("gmail-token", ["1", "2"]);
    expect(results[0].movedByProvider.get("gmail")).toBe(2);
    expect(appendActionLog).toHaveBeenCalledTimes(1);
    expect(appendActionLog.mock.calls[0][0]).toHaveLength(1);
  });

  it("skips disabled rules and writes no log entry when nothing matched", async () => {
    const archiveMessages = vi.fn(async () => {});
    const gmail = fakeProvider("gmail", { archiveMessages });
    const s = sender("a@other.com", "gmail", [msg({ id: "1" })]);

    await applyRules([{ ...archiveRule, enabled: false }], [s], new Map([["gmail", gmail]]));
    await applyRules([archiveRule], [s], new Map([["gmail", gmail]])); // domain doesn't match

    expect(archiveMessages).not.toHaveBeenCalled();
    expect(appendActionLog).toHaveBeenCalledWith([]);
  });

  it("no-ops a rule whose action the provider doesn't support", async () => {
    const outlook = fakeProvider("outlook"); // no archiveMessages
    const s = sender("a@news.com", "outlook", [msg({ id: "1" })]);

    const results = await applyRules([archiveRule], [s], new Map([["outlook", outlook]]));

    expect(results[0].movedByProvider.size).toBe(0);
    expect(appendActionLog).toHaveBeenCalledWith([]);
  });

  it("trash works for any provider via trashMessages", async () => {
    const trashMessages = vi.fn(async () => {});
    const outlook = fakeProvider("outlook", { trashMessages });
    const s = sender("a@news.com", "outlook", [msg({ id: "1" })]);

    await applyRules([{ ...archiveRule, action: "trash" }], [s], new Map([["outlook", outlook]]));

    expect(trashMessages).toHaveBeenCalledWith("outlook-token", ["1"]);
  });

  it("a label rule now runs for Outlook and passes labelKeepInInbox through", async () => {
    const labelMessages = vi.fn(async () => {});
    const outlook = fakeProvider("outlook", { labelMessages });
    const s = sender("a@news.com", "outlook", [msg({ id: "1" })]);

    await applyRules(
      [{ ...archiveRule, action: "label", labelName: "Cluster/Newsletters", labelKeepInInbox: true }],
      [s],
      new Map([["outlook", outlook]]),
    );

    expect(labelMessages).toHaveBeenCalledWith("outlook-token", ["1"], "Cluster/Newsletters", true);
  });

  it("attaches an undo to the log entry for a Gmail trash/archive rule, not for markRead", async () => {
    const gmail = fakeProvider("gmail", {
      archiveMessages: vi.fn(async () => {}),
      markReadMessages: vi.fn(async () => {}),
    });
    const s = sender("a@news.com", "gmail", [msg({ id: "1" }), msg({ id: "2" })]);

    await applyRules([archiveRule], [s], new Map([["gmail", gmail]]));
    const archiveEntry = appendActionLog.mock.calls.at(-1)![0][0];
    expect(archiveEntry.undo).toEqual({ provider: "gmail", ids: ["1", "2"], via: "unarchive" });

    appendActionLog.mockClear();
    await applyRules([{ ...archiveRule, action: "markRead" }], [s], new Map([["gmail", gmail]]));
    expect(appendActionLog.mock.calls.at(-1)![0][0].undo).toBeUndefined();
  });

  it("runs higher-priority rules first and honors stopProcessing", async () => {
    const archiveMessages = vi.fn(async () => {});
    const trashMessages = vi.fn(async () => {});
    const gmail = fakeProvider("gmail", { archiveMessages, trashMessages });
    const s = sender("a@news.com", "gmail", [msg({ id: "1" })]);
    await applyRules(
      [
        { ...archiveRule, id: "low", priority: 0, action: "trash" },
        { ...archiveRule, id: "high", priority: 10, stopProcessing: true, action: "archive" },
      ],
      [s],
      new Map([["gmail", gmail]]),
    );
    expect(archiveMessages).toHaveBeenCalledWith("gmail-token", ["1"]);
    expect(trashMessages).not.toHaveBeenCalled();
  });

  it("runs multiple actions in their declared order", async () => {
    const calls: string[] = [];
    const gmail = fakeProvider("gmail", {
      labelMessages: vi.fn(async () => {
        calls.push("label");
      }),
      archiveMessages: vi.fn(async () => {
        calls.push("archive");
      }),
    });
    const s = sender("a@news.com", "gmail", [msg({ id: "1" })]);
    await applyRules(
      [
        {
          ...archiveRule,
          actions: [{ action: "label", labelName: "Cluster/News" }, { action: "archive" }],
        },
      ],
      [s],
      new Map([["gmail", gmail]]),
    );
    expect(calls).toEqual(["label", "archive"]);
  });

  it("reports a partially completed action sequence instead of hiding it", async () => {
    const gmail = fakeProvider("gmail", {
      labelMessages: vi.fn(async () => {}),
      archiveMessages: vi.fn(async () => {
        throw new Error("archive failed");
      }),
    });
    const s = sender("a@news.com", "gmail", [msg({ id: "1" })]);
    const [result] = await applyRules(
      [
        {
          ...archiveRule,
          actions: [{ action: "label", labelName: "Cluster/News" }, { action: "archive" }],
        },
      ],
      [s],
      new Map([["gmail", gmail]]),
    );
    expect(result.movedByProvider.get("gmail")).toBe(1);
    expect(result.partialProviders).toEqual(["gmail"]);
    expect(appendActionLog.mock.calls.at(-1)![0][0].summary).toContain("partial action sequence");
  });
});

describe("previewRuleMatches", () => {
  it("counts matches across enabled rules only", () => {
    const s = sender("a@news.com", "gmail", [msg({ id: "1" }), msg({ id: "2" })]);
    expect(previewRuleMatches([archiveRule, { ...archiveRule, id: "r2", enabled: false }], [s])).toBe(2);
  });
});
