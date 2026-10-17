// Did the sender stop? Read from the mail index, so it sees every message,
// not one scan. Only list mail counts (mail with an unsubscribe header or a
// newsletter shape); receipts and security mail from the same sender keep
// arriving by design. Gmail and Yahoo expect bulk senders to stop within 2
// days, so "still sending" waits 3; US law allows 10 business days, so the
// final verdict waits 14.
import type { SenderSummary } from "./senderModel";
import type { ReplyKind } from "./unsubscribeReplies";

const DAY_MS = 24 * 60 * 60 * 1_000;
export const UNSUBSCRIBE_GRACE_MS = 3 * DAY_MS;
export const UNSUBSCRIBE_OBSERVATION_MS = 14 * DAY_MS;

export type UnsubscribeOutcomeState =
  | "untracked"
  | "pending"
  | "quiet"
  | "still-sending"
  /** The request bounced. */
  | "failed"
  /** The sender wants a click to confirm. */
  | "needs-you";

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

export const STOP_COPY = "Most senders stop within 2 days. The law allows up to 10 business days.";

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function evaluateUnsubscribeOutcome(
  sender: SenderSummary | undefined,
  request: RequestRecord | undefined,
  now = Date.now(),
  replies: readonly ReplyKind[] = [],
): UnsubscribeOutcome {
  if (!request) {
    return {
      state: "untracked",
      label: "Not requested",
      detail: "Cluster hasn't asked this sender to stop.",
      newerMessageCount: 0,
      lateMessageCount: 0,
    };
  }

  const graceAt = request.requestedAt + UNSUBSCRIBE_GRACE_MS;
  const deadlineAt = request.requestedAt + UNSUBSCRIBE_OBSERVATION_MS;
  const arrivals = (sender?.messages ?? [])
    .filter((m) => m.receivedAt > request.requestedAt && (m.looksAutomated || m.kind === "newsletter"))
    .map((m) => m.receivedAt)
    .sort((a, b) => a - b);
  const afterGrace = arrivals.filter((at) => at > graceAt);
  const common = {
    requestAt: request.requestedAt,
    deadlineAt,
    newerMessageCount: arrivals.length,
    lateMessageCount: afterGrace.length,
    latestMessageAt: arrivals.at(-1),
  };

  if (replies.includes("bounce")) {
    return { ...common, state: "failed", label: "Didn't reach them", detail: "The unsubscribe email bounced." };
  }
  if (replies[0] === "needs-click" && afterGrace.length === 0) {
    return {
      ...common,
      state: "needs-you",
      label: "Needs your click",
      detail: "They sent an email asking you to confirm. Open it and confirm there.",
    };
  }
  if (afterGrace.length > 0) {
    // Nothing until after the 2-week watch: they stopped, then started again.
    const cameBack = arrivals[0] > deadlineAt;
    return {
      ...common,
      state: "still-sending",
      label: cameBack ? "Came back" : "Still sending",
      detail: cameBack
        ? `They stopped, then sent ${plural(afterGrace.length, "message")} more than 2 weeks later. That often follows a purchase or a new account.`
        : `${plural(afterGrace.length, "message")} arrived more than 3 days after you asked.`,
    };
  }
  if (now <= graceAt) {
    return {
      ...common,
      state: "pending",
      label: "Waiting",
      detail: replies.includes("confirmed") ? `They confirmed. ${STOP_COPY}` : STOP_COPY,
    };
  }
  return {
    ...common,
    state: "quiet",
    label: "Stopped",
    detail:
      now <= deadlineAt
        ? "Nothing new from their list since the request. Cluster keeps watching for 2 weeks."
        : "Nothing new from their list in the 2 weeks since the request.",
  };
}

export function unsubscribeOutcomeRank(state: UnsubscribeOutcomeState): number {
  const order: UnsubscribeOutcomeState[] = ["failed", "still-sending", "needs-you", "pending", "quiet", "untracked"];
  return order.indexOf(state);
}

/** "12 asked · 9 stopped · 2 still sending · 1 waiting": counted on this
 * device from the requests and their outcomes, nothing sent anywhere. */
export function unsubscribeTally(outcomes: readonly UnsubscribeOutcome[]): string {
  const asked = outcomes.filter((o) => o.state !== "untracked");
  if (asked.length === 0) return "";
  const count = (state: UnsubscribeOutcomeState) => asked.filter((o) => o.state === state).length;
  const parts: [number, string][] = [
    [asked.length, "asked"],
    [count("quiet"), "stopped"],
    [count("still-sending"), "still sending"],
    [count("pending"), "waiting"],
    [count("needs-you"), "need your click"],
    [count("failed"), "didn't reach them"],
  ];
  return parts
    .filter(([n], i) => i === 0 || n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ");
}
