import { describe, expect, it } from "vitest";
import { addWaiting, WAITING_DAYS } from "./waiting";

const DAY = 86_400_000;
const ask = (address: string) => ({ kind: "mute" as const, key: `gmail:${address}`, address, ids: ["1"] });

describe("Waiting for you", () => {
  it("adds one item per sender, skips senders you said no to, and expires after 7 days", () => {
    const first = addWaiting([], [ask("a@x.com"), ask("a@x.com"), ask("b@x.com")], ["b@x.com"], 0);
    expect(first.waiting.map((w) => w.address)).toEqual(["a@x.com"]);
    const later = addWaiting(first.waiting, [ask("a@x.com")], [], WAITING_DAYS * DAY);
    expect(later.waiting).toEqual([]);
    expect(later.expired).toEqual(["a@x.com"]);
  });
});
