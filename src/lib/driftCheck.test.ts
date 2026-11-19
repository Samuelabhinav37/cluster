import { describe, expect, it } from "vitest";
import { labelDrift } from "./driftCheck";
import type { EmailDecision } from "./mailEngine";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";

const now = Date.UTC(2026, 10, 19, 12);
const row = (id: string, minsAgo: number, labelIds: string[]) =>
  ({ id, fromAddress: `${id}@shop.example`, receivedAt: now - minsAgo * 60_000, labelIds }) as NormalizedMessageMetadata;
const d = (place: EmailDecision["place"]): EmailDecision => ({ kind: "other", place, risk: "none" as EmailDecision["risk"] });
const names = new Map([["L1", "Shopping"], ["L2", "Receipts"]]);
const want = (x: EmailDecision) => (x.place === "shopping" ? "Shopping" : x.place === "receipt" ? "Receipts" : null);

describe("label drift check (plan 4.8)", () => {
  it("counts settled emails missing the label the engine expects", () => {
    const rows = [row("a", 60, ["INBOX", "L1"]), row("b", 60, ["INBOX", "L2"]), row("c", 5, ["INBOX"]), row("d", 60, ["SPAM"]), row("e", 60, ["INBOX"])];
    const decided = new Map([["a", d("shopping")], ["b", d("shopping")], ["c", d("shopping")], ["d", d("shopping")], ["e", d(null)]]);
    const r = labelDrift(rows, decided, names, want, now);
    expect(r).toEqual({ checked: 2, wrong: 1, examples: [{ from: "b@shop.example", want: "Shopping", got: "Receipts" }] });
  });
});
