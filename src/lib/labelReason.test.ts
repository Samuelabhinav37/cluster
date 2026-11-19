import { describe, expect, it } from "vitest";
import { labelReason } from "./sortTaxonomy";

describe("label reasons (plan 4.9)", () => {
  it("names the deciding signal", () => {
    expect(labelReason("newsletter", "newsletter", "shop.example", "a@shop.example", { "a@shop.example": "newsletter" })).toBe("You filed this sender here");
    expect(labelReason("promotions", "newsletter", "shop.example", "a@shop.example", {}, true)).toBe("Gmail says Promotions");
    expect(labelReason("otp", "otp", "unknown-app.example", "no-reply@unknown-app.example", {})).toBe("Looks like a sign-in code");
    expect(labelReason("travel", "other", "hotel.example", "a@hotel.example", {}, false, { reservation: true })).toBe("Gmail says it's a booking");
  });
  it("a label from the sender's usual one says so", () => {
    expect(labelReason("shipping", "other", "unknown-shop.example", "a@unknown-shop.example", {})).toBe("Most of this sender's mail goes here");
  });
});
