import { beforeEach, describe, expect, it } from "vitest";
import type { ClusterRule } from "./rules";
import {
  MAX_RULE_COMPLETION_RECEIPTS,
  RULE_COMPLETION_TTL_MS,
  getRuleCompletionKeys,
  pruneRuleCompletionReceipts,
  recordRuleCompletions,
  ruleCompletionKey,
  ruleExecutionSignature,
} from "./ruleCompletionLedger";

function rule(over: Partial<ClusterRule> = {}): ClusterRule {
  return {
    id: "rule-1",
    name: "Archive newsletters",
    enabled: true,
    conditions: { kind: "newsletter", unread: true },
    action: "archive",
    ...over,
  };
}

function fakeStorage() {
  let store: Record<string, unknown> = {};
  return {
    local: {
      async get(key: string) {
        return key in store ? { [key]: store[key] } : {};
      },
      async set(items: Record<string, unknown>) {
        store = { ...store, ...items };
      },
    },
  };
}

beforeEach(() => {
  (globalThis as any).chrome = { storage: fakeStorage() };
});

describe("rule completion identity", () => {
  it("is stable across object property order but changes with rule behavior", () => {
    const first = rule({ conditions: { kind: "newsletter", unread: true } });
    const reordered = rule({ conditions: { unread: true, kind: "newsletter" } });
    expect(ruleExecutionSignature(first)).toBe(ruleExecutionSignature(reordered));
    expect(ruleExecutionSignature({ ...first, action: "trash" })).not.toBe(ruleExecutionSignature(first));
    expect(ruleCompletionKey(first, "gmail", "message-1")).not.toContain("Archive newsletters");
  });

  it("does not invalidate receipts for presentation or safety-limit changes", () => {
    const first = rule();
    expect(ruleExecutionSignature({ ...first, name: "Renamed", maxMessagesPerRun: 5 })).toBe(
      ruleExecutionSignature(first),
    );
  });
});

describe("rule completion storage", () => {
  it("records fully completed ids and reads them as a key set", async () => {
    const current = rule();
    await recordRuleCompletions(
      [{ rule: current, idsByProvider: new Map([["gmail", ["one", "two"]]]) }],
      100,
    );
    const keys = await getRuleCompletionKeys(100);
    expect(keys).toEqual(
      new Set([ruleCompletionKey(current, "gmail", "one"), ruleCompletionKey(current, "gmail", "two")]),
    );
  });

  it("drops expired, future, duplicate, and over-cap receipts", () => {
    const now = RULE_COMPLETION_TTL_MS + 1_000;
    const many = Array.from({ length: MAX_RULE_COMPLETION_RECEIPTS + 2 }, (_, index) => ({
      key: `key-${index}`,
      completedAt: now - index,
    }));
    const pruned = pruneRuleCompletionReceipts(
      [
        { key: "expired", completedAt: 0 },
        { key: "future", completedAt: now + 1 },
        { key: "key-0", completedAt: now - 50 },
        ...many,
      ],
      now,
    );
    expect(pruned).toHaveLength(MAX_RULE_COMPLETION_RECEIPTS);
    expect(pruned.some(({ key }) => key === "expired" || key === "future")).toBe(false);
    expect(pruned.filter(({ key }) => key === "key-0")).toHaveLength(1);
  });
});
