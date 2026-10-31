import { describe, expect, it } from "vitest";
import { markNameMatches } from "./nameMatch";
import type { SenderSummary } from "./senderModel";
import { senderVerdict } from "./verdict";

const sender = (address: string, displayName: string, over: Partial<SenderSummary> = {}) =>
  ({
    key: `gmail:${address}`,
    provider: "gmail",
    address,
    displayName,
    threatSignals: [],
    messageIds: ["m1"],
    messages: [],
    authVerdicts: {},
    firstContact: false,
    ...over,
  }) as unknown as SenderSummary;

describe("markNameMatches", () => {
  it("flags a stranger using the full name of someone you write to", () => {
    const real = sender("priya.n@gmail.com", "Priya Nair");
    const fake = sender("priya.nair.ceo@outlook.com", "Priya Nair");
    expect(markNameMatches([real, fake], new Set(["priya.n@gmail.com"]))).toBe(1);
    expect(fake.threatSignals.map((s) => s.kind)).toEqual(["name-match"]);
    expect(real.threatSignals).toEqual([]);
  });

  it("ignores one-word names and senders you already know", () => {
    const a = sender("help@shop.com", "Support");
    const b = sender("help@other.com", "Support");
    expect(markNameMatches([a, b], new Set(["help@shop.com"]))).toBe(0);
  });

  it("warns alone but never holds alone, even with first contact", () => {
    const real = sender("priya.n@gmail.com", "Priya Nair");
    const fake = sender("priya.nair.ceo@outlook.com", "Priya Nair", { firstContact: true });
    markNameMatches([real, fake], new Set(["priya.n@gmail.com"]));
    const v = senderVerdict(fake, { knownCorrespondent: false });
    expect(v.tier).toBe("warn");
    expect(v.reasons.map((r) => r.kind)).toContain("first-contact");
  });

  it("first contact alone adds nothing", () => {
    const v = senderVerdict(sender("new@x.com", "New Person", { firstContact: true }), { knownCorrespondent: false });
    expect(v.tier).toBe("none");
    expect(v.score).toBe(0);
  });
});
