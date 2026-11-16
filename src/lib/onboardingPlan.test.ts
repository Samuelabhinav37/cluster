import { describe, expect, it } from "vitest";
import { buildOnboardingPlan } from "./onboardingPlan";

describe("buildOnboardingPlan", () => {
  it("by default every label waits an hour in the inbox, scams held", () => {
    const plan = buildOnboardingPlan({ who: "me", sorted: {}, keep: [] });
    expect(plan.tidy).toBe(true);
    expect(plan.holdScams).toBe(true);
    expect(plan.hours).toMatchObject({ promotions: 1, newsletter: 1, social: 1, otp: 1, finance: 1 });
    expect(Object.keys(plan.hours)).toHaveLength(13);
    expect(plan.hours.accounts).toBe(1);
    expect(plan.persona).toBe("calm");
  });

  it("what the user keeps stays in the inbox", () => {
    const plan = buildOnboardingPlan({ who: "me", sorted: {}, keep: ["bank", "receipts", "work"] });
    expect(plan.hours).toMatchObject({ finance: null, receipt: null, shipping: null, productivity: null, travel: 1 });
  });

  it("Ask me first saves the times but moves and holds nothing", () => {
    const plan = buildOnboardingPlan({ who: "safe", sorted: {}, keep: [], hands: "ask" });
    expect(plan.tidy).toBe(false);
    expect(plan.holdScams).toBe(false);
    expect(plan.lines.map((l) => l.text)).toContain("Nothing moves until you press Sort my inbox");
  });

  it("people you write to always stay", () => {
    const plan = buildOnboardingPlan({ who: "safe", sorted: {}, keep: [], hands: "tidy" });
    expect(plan.lines.some((l) => l.text.includes("people you write to"))).toBe(true);
  });
});
