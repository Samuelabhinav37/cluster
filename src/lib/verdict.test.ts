import { describe, expect, it } from "vitest";
import type { SenderSummary } from "./senderModel";
import type { ThreatSignal } from "./threatSignals";
import { brandName, reasonText, senderVerdict } from "./verdict";

function sender(threatSignals: ThreatSignal[]): SenderSummary {
  return {
    key: "gmail:x@example.com",
    provider: "gmail",
    address: "x@example.com",
    displayName: "X",
    count: 1,
    messageIds: ["m1"],
    protectedMessageIds: [],
    unsubscribe: {},
    messages: [],
    threatSignals,
    authVerdicts: { spf: "pass", dkim: "pass", dmarc: "pass" },
    firstContact: false,
  };
}

const stranger = { knownCorrespondent: false };
const contact = { knownCorrespondent: true };

const blocklisted: ThreatSignal = { kind: "blocklisted-domain", brand: "evil.example", confidence: "high" };
const freemailBank: ThreatSignal = { kind: "freemail-brand-claim", brand: "bank of america", confidence: "high" };
const lookalike: ThreatSignal = { kind: "lookalike-domain", brand: "paypal", confidence: "high" };
const lookalikeAmazon: ThreatSignal = { kind: "lookalike-domain", brand: "amazon", confidence: "high" };
const lure: ThreatSignal = { kind: "lure-language", brand: "", confidence: "medium" };
const brandClaim: ThreatSignal = { kind: "brand-impersonation", brand: "chase", confidence: "medium" };
const replyTo: ThreatSignal = { kind: "reply-to-mismatch", brand: "gmail.com", confidence: "medium" };
const authFail: ThreatSignal = { kind: "failed-authentication", brand: "chase.com", confidence: "high" };
const identity: ThreatSignal = { kind: "identity-change", brand: "acme-pay.example", confidence: "medium" };

describe("senderVerdict: when to hold", () => {
  it("holds on a decisive signal alone: a domain on a known-bad list", () => {
    expect(senderVerdict(sender([blocklisted]), stranger).tier).toBe("hold");
  });

  it("holds on a decisive signal alone: a bank claim from a free email account", () => {
    expect(senderVerdict(sender([freemailBank]), stranger).tier).toBe("hold");
  });

  it("only warns on one strong but non-decisive signal", () => {
    expect(senderVerdict(sender([lookalike]), stranger).tier).toBe("warn");
  });

  it("holds when two different kinds of signal agree", () => {
    expect(senderVerdict(sender([lookalike, lure]), stranger).tier).toBe("hold");
  });

  it("doesn't hold on two signals of the same kind, however high they add up", () => {
    const verdict = senderVerdict(sender([lookalike, lookalikeAmazon]), stranger);
    expect(verdict.score).toBeGreaterThanOrEqual(6);
    expect(verdict.tier).toBe("warn");
  });

  it("returns none with no signals", () => {
    expect(senderVerdict(sender([]), stranger)).toMatchObject({ tier: "none", score: 0, reasons: [] });
  });
});

describe("senderVerdict: people you write to", () => {
  it("sets aside a brand-like name for a known correspondent and says why", () => {
    const verdict = senderVerdict(sender([freemailBank]), contact);
    expect(verdict.tier).toBe("none");
    expect(verdict.signals).toEqual([]);
    expect(verdict.trustReasons.map((r) => r.kind)).toEqual(["known-correspondent"]);
  });

  it("keeps the brand evidence when the mail failed authentication", () => {
    const verdict = senderVerdict(sender([brandClaim, authFail]), contact);
    expect(verdict.signals).toEqual([brandClaim, authFail]);
    expect(verdict.tier).toBe("hold");
  });

  it("keeps the brand evidence when the provider's own verdicts say authentication failed", () => {
    const spoofed = { ...sender([freemailBank]), authVerdicts: { spf: "fail", dkim: "fail", dmarc: "fail" } } as SenderSummary;
    expect(senderVerdict(spoofed, contact).tier).toBe("hold");
  });

  it("never sets aside an identity change or a redirected reply", () => {
    const verdict = senderVerdict(sender([identity, replyTo]), contact);
    expect(verdict.signals).toEqual([identity, replyTo]);
    expect(verdict.tier).toBe("hold");
  });
});

describe("senderVerdict: review history", () => {
  it("drops a borderline hold to a warning once the user released this sender", () => {
    const signals = [brandClaim, replyTo];
    expect(senderVerdict(sender(signals), stranger).tier).toBe("hold");
    const released = senderVerdict(sender(signals), {
      knownCorrespondent: false,
      review: { verdict: "released", at: 0 },
    });
    expect(released.tier).toBe("warn");
    expect(released.trustReasons.map((r) => r.kind)).toEqual(["released-before"]);
  });

  it("still holds a known-bad domain after a release", () => {
    const verdict = senderVerdict(sender([blocklisted]), { knownCorrespondent: false, review: { verdict: "released", at: 0 } });
    expect(verdict.tier).toBe("hold");
  });
});

describe("reasons", () => {
  it("lists the strongest reason first, in plain words", () => {
    const verdict = senderVerdict(sender([lure, freemailBank]), stranger);
    expect(verdict.reasons.map((r) => r.text)).toEqual([
      "It says it's from Bank of America, but it was sent from a free email account.",
      "The subject pushes you to act fast or to sign in.",
    ]);
  });

  it("names the new domain in an identity change", () => {
    expect(reasonText(identity)).toBe("This sender doesn't usually use acme-pay.example.");
  });

  it("capitalises brand names the way people write them", () => {
    expect(brandName("bank of america")).toBe("Bank of America");
    expect(brandName("paypal")).toBe("PayPal");
    expect(brandName("wells fargo")).toBe("Wells Fargo");
  });
});

describe("heldMessageIds", () => {
  function withMessages(signals: ThreatSignal[]): SenderSummary {
    return { ...sender(signals), messageIds: ["a", "b", "c"] };
  }

  it("holds every message when the hold rests on the address itself", () => {
    expect(senderVerdict(withMessages([blocklisted]), stranger).heldMessageIds).toEqual(["a", "b", "c"]);
  });

  it("holds only the message that carries two kinds of evidence", () => {
    const signals: ThreatSignal[] = [
      { ...identity, messageIds: ["b"] },
      { ...replyTo, messageIds: ["b"] },
    ];
    expect(senderVerdict(withMessages(signals), stranger).heldMessageIds).toEqual(["b"]);
  });

  it("combines an address signal with one message's own evidence", () => {
    const signals: ThreatSignal[] = [lookalike, { ...lure, messageIds: ["c"] }];
    const verdict = senderVerdict(withMessages(signals), stranger);
    expect(verdict.tier).toBe("hold");
    expect(verdict.heldMessageIds).toEqual(["c"]);
  });

  it("holds nothing when the evidence is spread across different messages", () => {
    const signals: ThreatSignal[] = [
      { ...identity, messageIds: ["a"] },
      { ...replyTo, messageIds: ["b"] },
    ];
    const verdict = senderVerdict(withMessages(signals), stranger);
    expect(verdict.tier).toBe("hold");
    expect(verdict.heldMessageIds).toEqual([]);
  });
});
