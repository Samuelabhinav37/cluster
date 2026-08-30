import { describe, expect, it } from "vitest";
import { keepNewestExcess, keepNewestExcessCount } from "./keepNewest";
import type { MessageRecord, SenderSummary } from "./senderModel";

const DAY_MS = 24 * 60 * 60 * 1000;

function msg(id: string, daysAgo: number, isProtected = false): MessageRecord {
  return {
    id,
    receivedAt: Date.now() - daysAgo * DAY_MS,
    kind: "other",
    isProtected,
    unread: false,
    sizeBytes: 0,
  };
}

function sender(provider: "gmail" | "outlook", address: string, messages: MessageRecord[]): SenderSummary {
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

describe("keepNewestExcess", () => {
  it("returns everything older than the newest N per sender", () => {
    const s = sender("gmail", "a@x.com", [
      msg("d1", 1),
      msg("d2", 2),
      msg("d3", 3),
      msg("d4", 4),
      msg("d5", 5),
    ]);
    expect(keepNewestExcess([s], 2).get("gmail")).toEqual(["d3", "d4", "d5"]);
  });

  it("keeps senders with N or fewer messages untouched", () => {
    const s = sender("gmail", "a@x.com", [msg("d1", 1), msg("d2", 2)]);
    expect(keepNewestExcess([s], 3).size).toBe(0);
  });

  it("never counts starred messages toward the kept N or the excess", () => {
    const s = sender("gmail", "a@x.com", [
      msg("d1", 1),
      msg("s", 2, true),
      msg("d3", 3),
      msg("d4", 4),
    ]);
    // keep newest 1 non-starred (d1); excess is d3, d4; the starred one is left alone.
    expect(keepNewestExcess([s], 1).get("gmail")).toEqual(["d3", "d4"]);
  });

  it("groups excess by provider and totals via the count helper", () => {
    const g = sender("gmail", "a@x.com", [msg("g1", 1), msg("g2", 2), msg("g3", 3)]);
    const o = sender("outlook", "b@y.com", [msg("o1", 1), msg("o2", 2)]);
    const result = keepNewestExcess([g, o], 1);
    expect(result.get("gmail")).toEqual(["g2", "g3"]);
    expect(result.get("outlook")).toEqual(["o2"]);
    expect(keepNewestExcessCount([g, o], 1)).toBe(3);
  });
});
