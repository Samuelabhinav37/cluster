import { describe, expect, it } from "vitest";
import type { MessageRecord, SenderSummary } from "./senderModel";
import {
  UNSUBSCRIBE_GRACE_MS,
  UNSUBSCRIBE_OBSERVATION_MS,
  evaluateUnsubscribeOutcome,
  unsubscribeOutcomeRank,
} from "./unsubscribeOutcome";

function sender(receivedTimes: number[], kind: MessageRecord["kind"] = "newsletter"): SenderSummary {
  const messages: MessageRecord[] = receivedTimes.map((receivedAt, index) => ({
    id: String(index),
    receivedAt,
    kind,
    isProtected: false,
    unread: true,
    sizeBytes: 0,
    providerMarkedPersonal: false,
    looksAutomated: false,
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
  const grace = requestedAt + UNSUBSCRIBE_GRACE_MS;
  const deadline = requestedAt + UNSUBSCRIBE_OBSERVATION_MS;

  it("reports untracked senders without inventing an outcome", () => {
    expect(evaluateUnsubscribeOutcome(sender([500]), undefined, deadline).state).toBe("untracked");
  });

  it("waits through the first 3 days, even if mail still arrives", () => {
    const outcome = evaluateUnsubscribeOutcome(sender([500, requestedAt + 10]), { requestedAt }, grace - 1);
    expect(outcome).toMatchObject({ state: "pending", label: "Waiting", newerMessageCount: 1 });
    expect(outcome.detail).toContain("within 2 days");
  });

  it("calls it stopped after 3 quiet days and keeps watching to 2 weeks", () => {
    expect(evaluateUnsubscribeOutcome(sender([500]), { requestedAt }, grace + 1)).toMatchObject({
      state: "quiet",
      label: "Stopped",
    });
    expect(evaluateUnsubscribeOutcome(undefined, { requestedAt }, deadline + 1).detail).toContain("2 weeks since");
  });

  it("flags list mail that keeps arriving after 3 days", () => {
    const outcome = evaluateUnsubscribeOutcome(sender([500, grace + 1, grace + 2]), { requestedAt }, grace + 3);
    expect(outcome).toMatchObject({ state: "still-sending", label: "Still sending", lateMessageCount: 2 });
  });

  it("doesn't count receipts as still sending", () => {
    expect(evaluateUnsubscribeOutcome(sender([grace + 1], "receipt"), { requestedAt }, grace + 2).state).toBe("quiet");
  });

  it("says 'came back' when mail starts again after the 2-week watch", () => {
    expect(evaluateUnsubscribeOutcome(sender([deadline + 5]), { requestedAt }, deadline + 6).label).toBe("Came back");
  });

  it("reads replies: a bounce fails, a confirm request needs the user", () => {
    expect(evaluateUnsubscribeOutcome(sender([]), { requestedAt }, grace, ["bounce"]).state).toBe("failed");
    expect(evaluateUnsubscribeOutcome(sender([]), { requestedAt }, grace, ["needs-click"]).state).toBe("needs-you");
    expect(evaluateUnsubscribeOutcome(sender([]), { requestedAt }, requestedAt + 5, ["confirmed"]).detail).toMatch(
      /^They confirmed\./,
    );
  });

  it("orders the states that need attention first", () => {
    expect(
      [...(["quiet", "untracked", "still-sending", "pending", "failed", "needs-you"] as const)].sort(
        (a, b) => unsubscribeOutcomeRank(a) - unsubscribeOutcomeRank(b),
      ),
    ).toEqual(["failed", "still-sending", "needs-you", "pending", "quiet", "untracked"]);
  });
});

describe("unsubscribeTally", () => {
  it("counts requests by outcome and skips empty states", async () => {
    const { unsubscribeTally } = await import("./unsubscribeOutcome");
    const o = (state: string) => ({ state, label: "", detail: "", newerMessageCount: 0, lateMessageCount: 0 }) as never;
    expect(unsubscribeTally([o("quiet"), o("quiet"), o("still-sending"), o("untracked")])).toBe(
      "3 asked · 2 stopped · 1 still sending",
    );
    expect(unsubscribeTally([o("untracked")])).toBe("");
  });
});
