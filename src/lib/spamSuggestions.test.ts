import { describe, expect, it } from "vitest";
import { domainOf, suggestSpamSenders, type SpamMatchers } from "./spamSuggestions";
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
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
  };
}

const matchers: SpamMatchers = {
  isBlocked: (d) => d === "evil.example",
  isSpam: (d) => d === "throwaway.example" || d === "spammer.example",
};

describe("domainOf", () => {
  it("extracts and normalises the domain from a bare address", () => {
    expect(domainOf("a@Mailinator.COM")).toBe("mailinator.com");
    expect(domainOf("a@host.example.")).toBe("host.example");
    expect(domainOf("nobody")).toBe("");
  });
});

describe("suggestSpamSenders", () => {
  it("flags a sender on the spam list with the listed-spam reason", () => {
    const s = sender("promo@throwaway.example", [msg({ id: "1" }), msg({ id: "2" })]);
    expect(suggestSpamSenders([s], matchers)).toEqual([
      { sender: s, domain: "throwaway.example", reason: "listed-spam-domain", messageCount: 2 },
    ]);
  });

  it("flags a sender on the malware blocklist with the known-bad reason, which wins", () => {
    const s = sender("x@evil.example", [msg({ id: "1" })]);
    const [only] = suggestSpamSenders([s], { ...matchers, isSpam: () => true });
    expect(only.reason).toBe("known-bad-domain");
  });

  it("excludes a sender with any starred/flagged message, even if the domain matches", () => {
    const s = sender("promo@spammer.example", [msg({ id: "1" }), msg({ id: "s", isProtected: true })]);
    expect(suggestSpamSenders([s], matchers)).toEqual([]);
  });

  it("ignores senders whose domain is on neither list", () => {
    const s = sender("news@gmail.com", [msg({ id: "1" })]);
    expect(suggestSpamSenders([s], matchers)).toEqual([]);
  });

  it("skips a sender with no parseable domain", () => {
    const s = sender("weird-address", [msg({ id: "1" })]);
    expect(suggestSpamSenders([s], matchers)).toEqual([]);
  });

  it("sorts by message count, most first", () => {
    const small = sender("a@spammer.example", [msg({ id: "1" })]);
    const big = sender("b@throwaway.example", [msg({ id: "2" }), msg({ id: "3" }), msg({ id: "4" })]);
    expect(suggestSpamSenders([small, big], matchers).map((s) => s.sender.address)).toEqual([
      "b@throwaway.example",
      "a@spammer.example",
    ]);
  });
});
