import { describe, expect, it } from "vitest";
import { describeRule, matchRule, ruleHasConditions, type DeclutterRule } from "./rules";
import type { MessageRecord, SenderSummary } from "./senderModel";
import type { ProviderId } from "./providers/emailProvider";

const DAY_MS = 24 * 60 * 60 * 1000;

function msg(over: Partial<MessageRecord> & { id: string }): MessageRecord {
  return {
    receivedAt: Date.now(),
    kind: "other",
    isProtected: false,
    unread: false,
    sizeBytes: 0,
    ...over,
  };
}

function sender(over: Partial<SenderSummary> & { address: string; messages: MessageRecord[] }): SenderSummary {
  const provider: ProviderId = over.provider ?? "gmail";
  return {
    key: `${provider}:${over.address}`,
    provider,
    address: over.address,
    displayName: over.displayName ?? over.address,
    count: over.messages.length,
    messageIds: over.messages.map((m) => m.id),
    protectedMessageIds: over.messages.filter((m) => m.isProtected).map((m) => m.id),
    unsubscribe: over.unsubscribe ?? {},
    messages: over.messages,
    threatSignals: [],
  };
}

function rule(over: Partial<DeclutterRule> = {}): DeclutterRule {
  return {
    id: "r1",
    name: "Test rule",
    enabled: true,
    conditions: {},
    action: "archive",
    ...over,
  };
}

describe("ruleHasConditions", () => {
  it("is false for an all-empty conditions object", () => {
    expect(ruleHasConditions({})).toBe(false);
    expect(ruleHasConditions({ fromDomain: "" })).toBe(false);
  });
  it("is true once any condition is set", () => {
    expect(ruleHasConditions({ olderThanDays: 30 })).toBe(true);
    expect(ruleHasConditions({ unread: false })).toBe(true);
  });
});

describe("matchRule", () => {
  it("matches nothing when the rule has no conditions", () => {
    const s = sender({ address: "a@x.com", messages: [msg({ id: "1" })] });
    expect(matchRule(rule({ conditions: {} }), [s]).size).toBe(0);
  });

  it("filters by sender domain and returns ids grouped by provider", () => {
    const gmail = sender({ address: "news@shop.com", messages: [msg({ id: "g1" }), msg({ id: "g2" })] });
    const other = sender({ address: "news@other.com", messages: [msg({ id: "o1" })] });
    const matched = matchRule(rule({ conditions: { fromDomain: "shop.com" } }), [gmail, other]);
    expect(matched.get("gmail")).toEqual(["g1", "g2"]);
    expect(matched.has("outlook")).toBe(false);
  });

  it("never includes starred/flagged messages", () => {
    const s = sender({
      address: "a@x.com",
      messages: [msg({ id: "1" }), msg({ id: "2", isProtected: true })],
    });
    expect(matchRule(rule({ conditions: { fromDomain: "x.com" } }), [s]).get("gmail")).toEqual(["1"]);
  });

  it("ANDs age, kind and unread conditions per message", () => {
    const now = Date.now();
    const s = sender({
      address: "a@x.com",
      messages: [
        msg({ id: "old-news-unread", kind: "newsletter", unread: true, receivedAt: now - 40 * DAY_MS }),
        msg({ id: "old-news-read", kind: "newsletter", unread: false, receivedAt: now - 40 * DAY_MS }),
        msg({ id: "new-news-unread", kind: "newsletter", unread: true, receivedAt: now - 2 * DAY_MS }),
        msg({ id: "old-otp-unread", kind: "otp", unread: true, receivedAt: now - 40 * DAY_MS }),
      ],
    });
    const matched = matchRule(
      rule({ conditions: { kind: "newsletter", unread: true, olderThanDays: 30 } }),
      [s],
    );
    expect(matched.get("gmail")).toEqual(["old-news-unread"]);
  });

  it("filters by has-unsubscribe at the sender level", () => {
    const withUnsub = sender({
      address: "a@x.com",
      unsubscribe: { mailto: "mailto:u@x.com" },
      messages: [msg({ id: "1" })],
    });
    const withoutUnsub = sender({ address: "b@y.com", messages: [msg({ id: "2" })] });
    const matched = matchRule(rule({ conditions: { hasUnsubscribe: true } }), [withUnsub, withoutUnsub]);
    expect(matched.get("gmail")).toEqual(["1"]);
  });
});

describe("describeRule", () => {
  it("summarises conditions and action", () => {
    expect(
      describeRule(rule({ conditions: { kind: "newsletter", olderThanDays: 30 }, action: "archive" })),
    ).toBe("newsletter messages older than 30 days → archive");
  });
  it("names the label for a label action", () => {
    expect(
      describeRule(rule({ conditions: { fromDomain: "x.com" }, action: "label", labelName: "Declutter/News" })),
    ).toBe('messages from @x.com → label "Declutter/News"');
  });
});
