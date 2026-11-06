import { describe, expect, it } from "vitest";
import type { SenderSummary } from "./senderModel";
import type { ThreatSignal } from "./threatSignals";
import { SCAN_CHECKS, scanCheckCounts, scanFound } from "./securityScan";

function sender(address: string, threatSignals: ThreatSignal[]): SenderSummary {
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
    threatSignals,
    authVerdicts: { spf: "pass", dkim: "pass", dmarc: "pass" },
    firstContact: false,
  };
}

const lookalike: ThreatSignal = { kind: "lookalike-domain", brand: "paypal", confidence: "high" };
const lure: ThreatSignal = { kind: "lure-language", brand: "x", confidence: "medium" };

describe("scanCheckCounts", () => {
  it("counts a warned sender under its check and skips a lone weak sign", () => {
    const senders = [sender("a@paypa1.com", [lookalike]), sender("b@x.com", [lure])];
    const counts = scanCheckCounts(senders, new Set());
    expect(counts[SCAN_CHECKS.findIndex((c) => c.label === "Lookalike addresses")]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(scanFound(senders, new Set())).toBe(1);
  });

  it("doesn't flag a lookalike from someone you write to", () => {
    const senders = [sender("a@paypa1.com", [lookalike])];
    expect(scanFound(senders, new Set(["a@paypa1.com"]))).toBe(0);
  });

  it("covers every warning sign once", () => {
    const kinds = SCAN_CHECKS.flatMap((c) => c.kinds);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds.length).toBe(14);
  });
});
