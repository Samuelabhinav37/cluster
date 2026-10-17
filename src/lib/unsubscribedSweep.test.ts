import { describe, expect, it } from "vitest";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import { unsubscribedToFile } from "./unsubscribedSweep";

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
