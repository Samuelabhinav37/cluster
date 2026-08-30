import type { SenderSummary } from "./senderModel";

export const UNSUBSCRIBE_OBSERVATION_MS = 14 * 24 * 60 * 60 * 1_000;

export type UnsubscribeOutcomeState = "untracked" | "pending" | "quiet" | "still-sending";

export interface UnsubscribeOutcome {
  state: UnsubscribeOutcomeState;
  label: string;
  detail: string;
  requestAt?: number;
  deadlineAt?: number;
  newerMessageCount: number;
  lateMessageCount: number;
  latestMessageAt?: number;
}

interface RequestRecord {
  requestedAt: number;
}

/**
 * Infer an unsubscribe outcome from the current metadata scan. "Quiet" is
 * intentionally scan-scoped: provider limits, categories, and the configured
 * time window mean absence here cannot prove that all delivery stopped.
 */
export function evaluateUnsubscribeOutcome(
  sender: SenderSummary | undefined,
  request: RequestRecord | undefined,
  now = Date.now(),
): UnsubscribeOutcome {
  if (!request) {
    return {
      state: "untracked",
      label: "Not requested",
      detail: "Cluster has not sent a verified one-click request for this sender.",
      newerMessageCount: 0,
      lateMessageCount: 0,
    };
  }

  const deadlineAt = request.requestedAt + UNSUBSCRIBE_OBSERVATION_MS;
  const arrivals = (sender?.messages ?? [])
    .map((message) => message.receivedAt)
    .filter((receivedAt) => receivedAt > request.requestedAt)
    .sort((a, b) => a - b);
  const lateArrivals = arrivals.filter((receivedAt) => receivedAt > deadlineAt);
  const common = {
    requestAt: request.requestedAt,
    deadlineAt,
    newerMessageCount: arrivals.length,
    lateMessageCount: lateArrivals.length,
    latestMessageAt: arrivals.at(-1),
  };

  if (lateArrivals.length > 0) {
    return {
      ...common,
      state: "still-sending",
      label: "Still sending",
      detail: `${lateArrivals.length} scanned message${lateArrivals.length === 1 ? " arrived" : "s arrived"} after the 14-day observation window. Retry or review the sender manually.`,
    };
  }

  if (now <= deadlineAt) {
    return {
      ...common,
      state: "pending",
      label: "Pending",
      detail:
        arrivals.length > 0
          ? `${arrivals.length} newer scanned message${arrivals.length === 1 ? "" : "s"}; still within the 14-day observation window.`
          : "No newer message in this scan; still within the 14-day observation window.",
    };
  }

  return {
    ...common,
    state: "quiet",
    label: "Quiet in current scan",
    detail:
      arrivals.length > 0
        ? `No scanned message arrived after the 14-day window; ${arrivals.length} arrived before it closed.`
        : "No message newer than the request is visible in the current scan. This is scan-limited, not proof that all delivery stopped.",
  };
}

export function unsubscribeOutcomeRank(state: UnsubscribeOutcomeState): number {
  if (state === "still-sending") return 0;
  if (state === "pending") return 1;
  if (state === "quiet") return 2;
  return 3;
}
