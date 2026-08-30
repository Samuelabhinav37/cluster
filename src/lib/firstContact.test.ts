import { describe, expect, it } from "vitest";
import { markFirstContact } from "./firstContact";
import type { SenderSummary } from "./senderModel";

function sender(address: string): SenderSummary {
  return {
    key: `gmail:${address}`,
    provider: "gmail",
    address,
    displayName: address,
    count: 1,
    messageIds: ["m1"],
    protectedMessageIds: [],
    unsubscribe: {},
    messages: [],
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
  };
}

describe("markFirstContact", () => {
  it("flags a sender absent from the ledger and records it at `now`", () => {
    const s = sender("new@example.com");
    const { updatedKnownSenders, firstContactCount } = markFirstContact([s], {}, 1000);
    expect(s.firstContact).toBe(true);
    expect(firstContactCount).toBe(1);
    expect(updatedKnownSenders).toEqual({ "gmail:new@example.com": 1000 });
  });

  it("does not flag a sender already in the ledger and leaves its timestamp alone", () => {
    const s = sender("known@example.com");
    const { updatedKnownSenders, firstContactCount } = markFirstContact(
      [s],
      { "known@example.com": 500 },
      1000,
    );
    expect(s.firstContact).toBe(false);
    expect(firstContactCount).toBe(0);
    expect(updatedKnownSenders).toEqual({ "known@example.com": 500 });
  });

  it("matches the ledger case-insensitively", () => {
    const s = sender("Mixed@Example.com");
    const { firstContactCount } = markFirstContact([s], { "mixed@example.com": 1 }, 2);
    expect(s.firstContact).toBe(false);
    expect(firstContactCount).toBe(0);
  });

  it("does not mutate the passed ledger", () => {
    const known = {};
    markFirstContact([sender("a@b.com")], known, 1);
    expect(known).toEqual({});
  });

  it("seeds an initial baseline without flagging every existing sender as new", () => {
    const s = sender("existing@example.com");
    const result = markFirstContact([s], {}, 1000, false);
    expect(result.firstContactCount).toBe(0);
    expect(s.firstContact).toBe(false);
    expect(result.updatedKnownSenders).toEqual({ "gmail:existing@example.com": 1000 });
  });

  it("tracks the same address separately across providers", () => {
    const gmail = sender("same@example.com");
    const outlook = {
      ...sender("same@example.com"),
      key: "outlook:same@example.com",
      provider: "outlook" as const,
    };
    const result = markFirstContact([gmail, outlook], {}, 1000);
    expect(result.firstContactCount).toBe(2);
    expect(result.updatedKnownSenders).toEqual({
      "gmail:same@example.com": 1000,
      "outlook:same@example.com": 1000,
    });
  });
});
