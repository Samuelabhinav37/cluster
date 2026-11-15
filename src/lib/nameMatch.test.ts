import { describe, expect, it } from "vitest";
import { AddressSet } from "./addressIdentity";
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

  it("ignores mailbox names like Support Team", () => {
    const known = sender("support@shop.example", "Support Team");
    const other = sender("help@acme-saas.example", "Support Team");
    expect(markNameMatches([known, other], new Set(["support@shop.example"]))).toBe(0);
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

describe("alias lookalikes", () => {
  const known = () => new AddressSet(["alice@yahoo.com", "bob.smith@gmail.com", "jsmith@corp.example"]);

  it("flags an address that reads as a contact's alias but isn't one for that provider", () => {
    const senders = [
      sender("alice+friend@yahoo.com", "Alice"),
      sender("a.lice@yahoo.com", "Alice"),
      sender("j.smith@corp.example", "J"),
    ];
    expect(markNameMatches(senders, known())).toBe(3);
    expect(senders.map((s) => s.threatSignals.find((t) => t.kind === "alias-lookalike")?.confidence)).toEqual(["high", "high", "medium"]);
    expect(senders[0].threatSignals[0].brand).toBe("alice@yahoo.com");
  });

  it("leaves real aliases and strangers alone", () => {
    const senders = [sender("bobsmith+news@googlemail.com", "Bob"), sender("carol@yahoo.com", "Carol")];
    expect(markNameMatches(senders, known())).toBe(0);
  });

  it("a free-mail alias lookalike is held on its own; a company one only warns", () => {
    const [free, corp] = [sender("alice+x@yahoo.com", "A"), sender("j.smith@corp.example", "J")];
    markNameMatches([free, corp], known());
    expect(senderVerdict(free, { knownCorrespondent: false }).tier).toBe("hold");
    expect(senderVerdict(corp, { knownCorrespondent: false }).tier).toBe("warn");
  });
});

describe("isMailboxName", () => {
  it("mailbox words make a mailbox; a person's name doesn't", async () => {
    const { isMailboxName } = await import("./nameMatch");
    expect(isMailboxName("PayPal Resolution Center")).toBe(true);
    expect(isMailboxName("Billing Office")).toBe(true);
    expect(isMailboxName("Maya Lee")).toBe(false);
  });
});
