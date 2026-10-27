import { describe, expect, it } from "vitest";
import { buildCorrespondents, markRepliesToYou, mergeCorrespondentAddresses } from "./correspondents";
import type { NormalizedMessageMetadata, SentRecord } from "./providers/emailProvider";
import type { SenderSummary } from "./senderModel";

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

describe("markRepliesToYou", () => {
  it("flags mail in your threads or answering your Message-ID, nothing else", () => {
    const meta = (id: string, over: Partial<NormalizedMessageMetadata>) =>
      ({ id, provider: "gmail", ...over }) as NormalizedMessageMetadata;
    const metas = [
      meta("a", { threadId: "t1" }),
      meta("b", { inReplyTo: "<m1@me>" }),
      meta("c", { threadId: "t9", inReplyTo: "<other@x>" }),
      meta("d", { provider: "outlook", threadId: "t1" }),
    ];
    const mine = { ...sent("s", 0, [["lisa@x.com", "Lisa"]]), threadId: "t1", messageIdHeader: "<m1@me>" };
    const sender = {
      provider: "gmail",
      messages: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    } as unknown as SenderSummary;
    markRepliesToYou([sender], metas, [mine]);
    expect(sender.messages.map((m) => Boolean(m.repliesToYou))).toEqual([true, true, false, false]);
  });
});
