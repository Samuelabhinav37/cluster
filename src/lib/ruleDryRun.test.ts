import { describe, expect, it, vi } from "vitest";
import type { EmailProvider, ProviderId } from "./providers/emailProvider";
import { buildRuleDryRunReport } from "./ruleDryRun";
import type { ClusterRule } from "./rules";
import type { MessageRecord, SenderSummary } from "./senderModel";

function message(id: string, over: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id,
    receivedAt: 1,
    kind: "newsletter",
    isProtected: false,
    unread: true,
    sizeBytes: 0,
    ...over,
  };
}

function sender(messages: MessageRecord[], provider: ProviderId = "gmail"): SenderSummary {
  return {
    key: `${provider}:news@example.com`,
    provider,
    address: "news@example.com",
    displayName: "News",
    count: messages.length,
    messageIds: messages.map(({ id }) => id),
    protectedMessageIds: messages.filter(({ isProtected }) => isProtected).map(({ id }) => id),
    unsubscribe: { postUrl: "https://example.com/unsubscribe" },
    messages,
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
  };
}

function rule(over: Partial<ClusterRule> = {}): ClusterRule {
  return {
    id: "rule",
    name: "Newsletters",
    enabled: true,
    conditions: { kind: "newsletter" },
    action: "archive",
    ...over,
  };
}

function provider(id: ProviderId, over: Partial<EmailProvider> = {}): EmailProvider {
  return {
    id,
    isConnected: vi.fn(async () => true),
    getAuthToken: vi.fn(async () => "token"),
    listCandidateMessages: vi.fn(async () => []),
    getMessageMetadata: vi.fn(),
    trashMessages: vi.fn(async () => {}),
    ...over,
  };
}

describe("buildRuleDryRunReport", () => {
  it("explains protected and exception exclusions without exposing them as matches", () => {
    const current = sender([
      message("eligible"),
      message("starred", { isProtected: true }),
      message("excepted", { unread: false }),
    ]);
    const report = buildRuleDryRunReport(
      [rule({ exceptions: { unread: false } })],
      [current],
      new Map([["gmail", provider("gmail", { archiveMessages: vi.fn() })]]),
      2,
    );

    expect(report.uniqueMatchedMessageCount).toBe(1);
    expect(report.protectedExclusionCount).toBe(1);
    expect(report.exceptionExclusionCount).toBe(1);
    expect(report.impacts[0].senders).toMatchObject([{ senderKey: current.key, eligibleMessageCount: 1 }]);
  });

  it("simulates priority, overlap, and stop-processing", () => {
    const current = sender([message("one")]);
    const report = buildRuleDryRunReport(
      [
        rule({ id: "low", priority: 0, action: "trash" }),
        rule({ id: "high", priority: 10, stopProcessing: true }),
      ],
      [current],
      new Map([["gmail", provider("gmail", { archiveMessages: vi.fn() })]]),
      2,
    );

    expect(report.overlapMessageCount).toBe(1);
    expect(report.predictedRuleApplicationCount).toBe(1);
    expect(report.impacts.map(({ rule: item }) => item.id)).toEqual(["high", "low"]);
    expect(report.impacts[1]).toMatchObject({ rawMatchCount: 1, effectiveMatchCount: 0 });
    expect(report.impacts[1].stoppedByEarlierRuleCount).toBe(1);
  });

  it("reports unsupported and partially supported action sequences by provider", () => {
    const current = sender([message("one")], "outlook");
    const outlook = provider("outlook", { labelMessages: vi.fn() });
    const none = buildRuleDryRunReport([rule()], [current], new Map([["outlook", outlook]]), 2);
    expect(none.impacts[0].providers[0]).toMatchObject({ completion: "none", actionableMessageCount: 0 });

    const partial = buildRuleDryRunReport(
      [rule({ actions: [{ action: "label", labelName: "News" }, { action: "archive" }] })],
      [current],
      new Map([["outlook", outlook]]),
      2,
    );
    expect(partial.impacts[0].providers[0]).toMatchObject({
      completion: "partial",
      actionableMessageCount: 1,
    });
  });

  it("uses the same per-rule ceiling and exposes deferred work", () => {
    const current = sender([message("one"), message("two"), message("three")]);
    const report = buildRuleDryRunReport(
      [rule({ maxMessagesPerRun: 2 })],
      [current],
      new Map([["gmail", provider("gmail", { archiveMessages: vi.fn() })]]),
      2,
    );

    expect(report).toMatchObject({ predictedRuleApplicationCount: 2, deferredByLimitCount: 1 });
    expect(report.impacts[0]).toMatchObject({
      rawMatchCount: 3,
      effectiveMatchCount: 2,
      deferredByLimitCount: 1,
    });
  });

  it("prevents a later overlapping rule from bypassing an earlier safety limit", () => {
    const current = sender([message("one"), message("two")]);
    const report = buildRuleDryRunReport(
      [
        rule({ id: "limited", priority: 10, maxMessagesPerRun: 1 }),
        rule({ id: "later", priority: 0, action: "trash" }),
      ],
      [current],
      new Map([["gmail", provider("gmail", { archiveMessages: vi.fn() })]]),
      2,
    );

    expect(report.impacts[0]).toMatchObject({ effectiveMatchCount: 1, deferredByLimitCount: 1 });
    expect(report.impacts[1]).toMatchObject({
      rawMatchCount: 2,
      effectiveMatchCount: 1,
      blockedByEarlierLimitCount: 1,
    });
  });
});
