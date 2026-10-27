import { describe, expect, it } from "vitest";
import { cleanText, skeleton } from "./normalize";

describe("cleanText", () => {
  it("removes zero-width and direction-control characters", () => {
    expect(cleanText("Pay​Pal")).toBe("PayPal");
    expect(cleanText("sus⁠pen‍ded")).toBe("suspended");
    expect(cleanText("‮paypal")).toBe("paypal");
  });
  it("turns fullwidth and styled letters into plain ones", () => {
    expect(cleanText("ＰａｙＰａｌ")).toBe("PayPal");
    expect(cleanText("𝐏𝐚𝐲𝐏𝐚𝐥")).toBe("PayPal");
  });
  it("leaves ordinary text alone", () => {
    expect(cleanText("Your receipt from Apple")).toBe("Your receipt from Apple");
  });
});

describe("skeleton", () => {
  it("folds lookalike letters onto the ASCII they imitate", () => {
    expect(skeleton("PаyPal")).toBe(skeleton("paypal")); // Cyrillic а
    expect(skeleton("Аpple")).toBe(skeleton("apple")); // Cyrillic А
    expect(skeleton("paypa1")).toBe(skeleton("paypal"));
    expect(skeleton("arnazon")).toBe(skeleton("amazon"));
  });
  it("keeps different names different", () => {
    expect(skeleton("chess")).not.toBe(skeleton("chase"));
    expect(skeleton("paypal")).not.toBe(skeleton("paypa"));
  });
});
