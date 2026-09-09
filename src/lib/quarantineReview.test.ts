import { describe, expect, it } from "vitest";
import { quarantineScoreAdjustment, recordQuarantineVerdict } from "./quarantineReview";

describe("recordQuarantineVerdict", () => {
  it("adds a verdict without mutating the input map", () => {
    const before = {};
    const after = recordQuarantineVerdict(before, "gmail:a@example.com", "released", 1000);
    expect(before).toEqual({});
    expect(after).toEqual({ "gmail:a@example.com": { verdict: "released", at: 1000 } });
  });

  it("overwrites a prior verdict for the same sender", () => {
    const first = recordQuarantineVerdict({}, "gmail:a@example.com", "confirmed", 1000);
    const second = recordQuarantineVerdict(first, "gmail:a@example.com", "released", 2000);
    expect(second["gmail:a@example.com"]).toEqual({ verdict: "released", at: 2000 });
  });
});

describe("quarantineScoreAdjustment", () => {
  it("returns 0 for a sender with no review history", () => {
    expect(quarantineScoreAdjustment(undefined)).toBe(0);
  });

  it("suppresses score for a released (false-positive) sender", () => {
    expect(quarantineScoreAdjustment({ verdict: "released", at: 1000 })).toBeLessThan(0);
  });

  it("reinforces score for a confirmed sender", () => {
    expect(quarantineScoreAdjustment({ verdict: "confirmed", at: 1000 })).toBeGreaterThan(0);
  });

  it("a release does not fully cancel a blocklisted-domain-alone score reaching high tier", () => {
    // blocklisted-domain alone weighs 6 + 1 (high confidence) = 7, riskTier
    // "high" starts at 6 -- the release adjustment must not drag that below 6,
    // per this module's own documented intent (confirmed-bad stays flagged).
    const blocklistedAloneScore = 7;
    const adjustment = quarantineScoreAdjustment({ verdict: "released", at: 1000 });
    expect(blocklistedAloneScore + adjustment).toBeGreaterThanOrEqual(6);
  });
});
