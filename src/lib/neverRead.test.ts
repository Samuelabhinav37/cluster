import { describe, expect, it } from "vitest";
import { neverReadSenders } from "./neverRead";
import type { MessageRecord, SenderSummary } from "./senderModel";

function msg(over: Partial<MessageRecord> & { id: string }): MessageRecord {
  return { receivedAt: Date.now(), kind: "newsletter", isProtected: false, unread: true, sizeBytes: 0, ...over };
}

function sender(address: string, messages: MessageRecord[]): SenderSummary {
  return {
    key: `gmail:${address}`,
    provider: "gmail",
    address,
    displayName: address,
    count: messages.length,
    messageIds: messages.map((m) => m.id),
    protectedMessageIds: messages.filter((m) => m.isProtected).map((m) => m.id),
    unsubscribe: {},
    messages,
    threatSignals: [],
  };
}

describe("neverReadSenders", () => {
  it("includes a sender whose non-starred mail is all unread and numerous enough", () => {
    const s = sender("news@x.com", [msg({ id: "1" }), msg({ id: "2" }), msg({ id: "3" })]);
    expect(neverReadSenders([s])).toEqual([s]);
  });

  it("excludes a sender with even one read message", () => {
    const s = sender("news@x.com", [msg({ id: "1" }), msg({ id: "2", unread: false }), msg({ id: "3" })]);
    expect(neverReadSenders([s])).toEqual([]);
  });

  it("excludes a sender below the minimum message count", () => {
    const s = sender("news@x.com", [msg({ id: "1" }), msg({ id: "2" })]);
    expect(neverReadSenders([s])).toEqual([]);
  });

  it("ignores starred messages when judging, but still needs enough unstarred ones", () => {
    const enough = sender("a@x.com", [
      msg({ id: "1" }),
      msg({ id: "2" }),
      msg({ id: "3" }),
      msg({ id: "s", unread: false, isProtected: true }),
    ]);
    const notEnough = sender("b@x.com", [
      msg({ id: "1" }),
      msg({ id: "2" }),
      msg({ id: "s1", isProtected: true }),
      msg({ id: "s2", isProtected: true }),
    ]);
    expect(neverReadSenders([enough, notEnough])).toEqual([enough]);
  });
});
