// Home's one sentence about the inbox right now, most urgent thing first.
// The tiles under it live in homeDashboard.ts.

export interface HomeFacts {
  /** Senders with scam warnings. */
  suspicious: number;
  /** New senders waiting in the screener. */
  waiting: number;
  /** Messages in the Clear out plan. */
  cleanupMessages: number;
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** The one sentence at the top of Home. Most urgent thing first. */
export function homeHeadline(f: HomeFacts): string {
  if (f.suspicious > 0) {
    return `${count(f.suspicious, "sender")} ${f.suspicious === 1 ? "looks" : "look"} suspicious. Check before you act.`;
  }
  if (f.waiting > 0) {
    return `Nothing looks like a scam. ${count(f.waiting, "new sender")} ${f.waiting === 1 ? "is" : "are"} waiting for you.`;
  }
  if (f.cleanupMessages > 0) {
    return `Nothing looks like a scam. ${count(f.cleanupMessages, "email")} can be cleared out.`;
  }
  return "Nothing looks like a scam, and nothing needs you right now.";
}
