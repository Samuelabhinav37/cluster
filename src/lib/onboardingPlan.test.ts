import { describe, expect, it } from "vitest";
import { buildOnboardingPlan } from "./onboardingPlan";

describe("buildOnboardingPlan", () => {
  it("turns practice choices into time limits", () => {
    const plan = buildOnboardingPlan({
      who: "me",
      sorted: { promo: "trash", news: "later", social: "keep" },
      keep: ["people"],
    });
    expect(plan.hours).toMatchObject({ promotions: 24, otp: 24, newsletter: 168, social: null });
    expect(plan.persona).toBe("calm");
    expect(plan.tidy).toBe(false);
  });

  it("holds scams once the fake was sorted, and warns when it was kept", () => {
    const kept = buildOnboardingPlan({ who: "me", sorted: { scam: "keep" }, keep: [] });
    expect(kept.holdScams).toBe(true);
    expect(kept.lines.map((l) => l.text)).toContain("That Account Team email was fake");
    expect(buildOnboardingPlan({ who: "me", sorted: {}, keep: [] }).holdScams).toBe(false);
    expect(buildOnboardingPlan({ who: "business", sorted: {}, keep: [] }).holdScams).toBe(true);
  });

  it("never sets a timer on bank mail, and what stays wins", () => {
    const plan = buildOnboardingPlan({ who: "me", sorted: { bank: "trash" }, keep: ["bank", "receipts"] });
    expect(plan.hours.finance).toBeNull();
    expect(plan.hours.receipt).toBeNull();
    expect(plan.hours.shipping).toBeNull();
    expect(buildOnboardingPlan({ who: "me", sorted: { bank: "trash" }, keep: [] }).hours.finance).toBeUndefined();
  });

  it("people you write to always stay, and Keep me safe turns on Simple mode", () => {
    const plan = buildOnboardingPlan({ who: "safe", sorted: {}, keep: [], hands: "tidy" });
    expect(plan.lines.some((l) => l.text.includes("people you write to"))).toBe(true);
    expect(plan.simpleMode).toBe(true);
    expect(plan.tidy).toBe(true);
  });
});
