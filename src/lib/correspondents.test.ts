import { describe, expect, it } from "vitest";
import { buildCorrespondents, mergeCorrespondentAddresses } from "./correspondents";
import type { SentRecord } from "./providers/emailProvider";

function sent(id: string, sentAt: number, to: [string, string][], cc: [string, string][] = []): SentRecord {
  const list = (pairs: [string, string][]) => pairs.map(([address, name]) => ({ address, name }));
  return { id, provider: "gmail", sentAt, to: list(to), cc: list(cc), bcc: [] };
}

describe("buildCorrespondents", () => {
  const records = [
    sent("1", 100, [["lisa@x.com", "Lisa"]], [["lisa@x.com", "Lisa"]]),
    sent("2", 300, [
      ["lisa@x.com", "Mum"],
      ["me@home.com", "Me"],
    ]),
    sent("3", 200, [
      ["lisa@x.com", "Lisa"],
      ["bob@y.com", ""],
    ]),
  ];

  it("counts one per message, keeps names by use and the latest send", () => {
    expect(buildCorrespondents(records, ["Me@Home.com"])).toEqual([
      { address: "lisa@x.com", names: ["Lisa", "Mum"], sentCount: 3, lastSentAt: 300 },
      { address: "bob@y.com", names: [], sentCount: 1, lastSentAt: 200 },
    ]);
  });
});

describe("mergeCorrespondentAddresses", () => {
  it("keeps existing addresses and adds the sent store's", () => {
    const merged = mergeCorrespondentAddresses(
      ["Old@Z.com", "lisa@x.com"],
      buildCorrespondents([sent("1", 1, [["lisa@x.com", "Lisa"]])]),
    );
    expect(merged.sort()).toEqual(["lisa@x.com", "old@z.com"]);
  });
});
