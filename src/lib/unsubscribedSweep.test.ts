import { describe, expect, it } from "vitest";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import { stillSendingToMute, unsubscribedToFile } from "./unsubscribedSweep";

const row = (id: string, from: string, receivedAt: number, extra: Partial<NormalizedMessageMetadata> = {}) =>
  ({
    id,
    provider: "gmail",
    fromAddress: from,
    receivedAt,
    isProtected: false,
    unsubscribe: { httpUrl: "https://x.example/u" },
    labelIds: ["INBOX"],
    ...extra,
  }) as NormalizedMessageMetadata;

const requests = {
  "gmail:news@shop.example": { requestedAt: 100, provider: "gmail" as const },
  "gmail:filtered@shop.example": { requestedAt: 100, provider: "gmail" as const, filterId: "f1" },
};

describe("unsubscribedToFile", () => {
  it("moves list mail that arrived after the request", () => {
    const rows = [
      row("new", "news@shop.example", 200),
      row("old", "news@shop.example", 50),
      row("receipt", "news@shop.example", 210, { unsubscribe: {} }),
      row("starred", "news@shop.example", 220, { isProtected: true }),
      row("archived", "news@shop.example", 230, { labelIds: [] }),
      row("other", "friend@x.example", 240),
    ];
    expect(unsubscribedToFile(rows, requests)).toEqual(["new"]);
  });

  it("leaves senders a filter already covers", () => {
    expect(unsubscribedToFile([row("f", "filtered@shop.example", 200)], requests)).toEqual([]);
  });
});

describe("stillSendingToMute", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const reqs = {
    "gmail:late@x.example": { requestedAt: 0, provider: "gmail" as const },
    "gmail:quiet@x.example": { requestedAt: 0, provider: "gmail" as const },
    "gmail:recent@x.example": { requestedAt: 10 * DAY, provider: "gmail" as const },
    "gmail:muted@x.example": { requestedAt: 0, provider: "gmail" as const },
  };
  it("mutes only senders still sending list mail after the grace, 14 days on", () => {
    const rows = [
      row("a", "late@x.example", 5 * DAY),
      row("b", "quiet@x.example", 1 * DAY),
      row("c", "recent@x.example", 14 * DAY),
      row("d", "muted@x.example", 5 * DAY),
      row("e", "late@x.example", 6 * DAY, { labelIds: [] }),
    ];
    expect(stillSendingToMute(rows, reqs, ["muted@x.example"], 15 * DAY)).toEqual([
      { key: "gmail:late@x.example", address: "late@x.example", inboxIds: ["a"] },
    ]);
  });
});
