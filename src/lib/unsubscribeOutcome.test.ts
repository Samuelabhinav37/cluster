import { describe, expect, it } from "vitest";
import type { MessageRecord, SenderSummary } from "./senderModel";
import {
  UNSUBSCRIBE_OBSERVATION_MS,
  evaluateUnsubscribeOutcome,
  unsubscribeOutcomeRank,
} from "./unsubscribeOutcome";

function sender(receivedTimes: number[]): SenderSummary {
  const messages: MessageRecord[] = receivedTimes.map((receivedAt, index) => ({
    id: String(index),
    receivedAt,
    kind: "newsletter",
    isProtected: false,
    unread: true,
    sizeBytes: 0,
  }));
  return {
    key: "gmail:news@example.com",
    provider: "gmail",
    address: "news@example.com",
    displayName: "News",
    count: messages.length,
    messageIds: messages.map((message) => message.id),
    protectedMessageIds: [],
    unsubscribe: {},
    messages,
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
  };
}

describe("evaluateUnsubscribeOutcome", () => {
  const requestedAt = 1_000;
  const deadline = requestedAt + UNSUBSCRIBE_OBSERVATION_MS;

  it("reports untracked senders without inventing an outcome", () => {
    expect(evaluateUnsubscribeOutcome(sender([500]), undefined, deadline).state).toBe("untracked");
  });

  it("keeps newer arrivals pending during the observation window", () => {
    const outcome = evaluateUnsubscribeOutcome(
      sender([500, requestedAt + 10]),
      { requestedAt },
      deadline - 1,
    );
    expect(outcome).toMatchObject({ state: "pending", newerMessageCount: 1, lateMessageCount: 0 });
  });

  it("calls a sender quiet only in the scope of the current scan", () => {
    const outcome = evaluateUnsubscribeOutcome(sender([500]), { requestedAt }, deadline + 1);
    expect(outcome.state).toBe("quiet");
    expect(outcome.detail).toContain("scan-limited");
  });

  it("flags mail that arrives after the full observation window", () => {
    const outcome = evaluateUnsubscribeOutcome(
      sender([500, deadline, deadline + 1, deadline + 2]),
      { requestedAt },
      deadline + 3,
    );
    expect(outcome).toMatchObject({
      state: "still-sending",
      newerMessageCount: 3,
      lateMessageCount: 2,
      latestMessageAt: deadline + 2,
    });
  });

  it("can report scan-scoped quiet when a tracked sender is absent", () => {
    expect(evaluateUnsubscribeOutcome(undefined, { requestedAt }, deadline + 1).state).toBe("quiet");
  });

  it("orders intervention states ahead of pending, quiet, and untracked rows", () => {
    expect(
      [...(["quiet", "untracked", "still-sending", "pending"] as const)].sort(
        (a, b) => unsubscribeOutcomeRank(a) - unsubscribeOutcomeRank(b),
      ),
    ).toEqual(["still-sending", "pending", "quiet", "untracked"]);
  });
});
