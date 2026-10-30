import { describe, expect, it } from "vitest";
import { classifyMessageKind, looksAutomated } from "./messageKind";

describe("classifyMessageKind", () => {
  it("detects one-time codes", () => {
    expect(classifyMessageKind("Your verification code is 123456", false)).toBe("otp");
    expect(classifyMessageKind("Use this one-time passcode to sign in", false)).toBe("otp");
    expect(classifyMessageKind("Your login code", false)).toBe("otp");
  });

  it("detects shipping/order updates", () => {
    expect(classifyMessageKind("Your order has shipped!", false)).toBe("shipping");
    expect(classifyMessageKind("Order confirmation #12345", false)).toBe("shipping");
    expect(classifyMessageKind("Out for delivery today", false)).toBe("shipping");
  });

  it("detects receipts/invoices", () => {
    expect(classifyMessageKind("Your receipt from Acme", false)).toBe("receipt");
    expect(classifyMessageKind("Invoice #99 is ready", false)).toBe("receipt");
    expect(classifyMessageKind("Payment received, thank you", false)).toBe("receipt");
    expect(classifyMessageKind("Cinemark Purchase Confirmation", true)).toBe("receipt");
    expect(classifyMessageKind("Cinemark Refund Confirmation", true)).toBe("receipt");
    expect(classifyMessageKind("We've received your payment", true)).toBe("receipt");
    expect(classifyMessageKind("The hottest ticket in the multiverse", true)).toBe("newsletter");
  });

  it("detects social notifications", () => {
    expect(classifyMessageKind("Sam mentioned you in a comment", false)).toBe("social");
    expect(classifyMessageKind("You have a new follower", false)).toBe("social");
  });

  it("falls back to newsletter when List-Unsubscribe is present but nothing else matches", () => {
    expect(classifyMessageKind("This week in tech", true)).toBe("newsletter");
  });

  it("falls back to other when nothing matches and there is no List-Unsubscribe", () => {
    expect(classifyMessageKind("Let's catch up sometime", false)).toBe("other");
    expect(classifyMessageKind("", false)).toBe("other");
  });

  it("needs a real code next to 'your code is'", () => {
    expect(classifyMessageKind("Your code is 482913", false)).toBe("otp");
    expect(classifyMessageKind("482913 is your Slack code", false)).toBe("otp");
    expect(classifyMessageKind("Your code is in the repo now", false)).toBe("other");
  });

  it("reads codes in other languages", () => {
    expect(classifyMessageKind("Votre code de vérification : 304411", false)).toBe("otp");
    expect(classifyMessageKind("Tu código de verificación es 7790", false)).toBe("otp");
    expect(classifyMessageKind("Ihr Bestätigungscode", false)).toBe("otp");
  });

  it("treats renewal notices as receipts", () => {
    expect(classifyMessageKind("Your membership will renew on Nov 3", true)).toBe("receipt");
    expect(classifyMessageKind("Your subscription is renewing soon", true)).toBe("receipt");
  });

  it("falls back to a sender named for receipts or shipping", () => {
    const uber = { address: "noreply@uber.com", displayName: "Uber Receipts" };
    expect(classifyMessageKind("Your Thursday evening trip with Uber", true, uber)).toBe("receipt");
    const amazon = { address: "shipment-tracking@amazon.com", displayName: "Amazon.com" };
    expect(classifyMessageKind("A note about your package", true, amazon)).toBe("shipping");
    const shop = { address: "deals@shop.example", displayName: "Shop" };
    expect(classifyMessageKind("New arrivals", true, shop)).toBe("newsletter");
  });

  it("prioritizes specific kinds over the newsletter fallback", () => {
    expect(classifyMessageKind("Your order has shipped!", true)).toBe("shipping");
  });
});

describe("looksAutomated", () => {
  it("is true whenever List-Unsubscribe is present", () => {
    expect(looksAutomated(true)).toBe(true);
  });

  it("is true for a bulk/list/junk Precedence header", () => {
    expect(looksAutomated(false, "bulk")).toBe(true);
    expect(looksAutomated(false, "list")).toBe(true);
    expect(looksAutomated(false, "junk")).toBe(true);
    expect(looksAutomated(false, "Bulk")).toBe(true);
  });

  it("is true for an Auto-Submitted auto-generated/auto-replied header", () => {
    expect(looksAutomated(false, undefined, "auto-generated")).toBe(true);
    expect(looksAutomated(false, undefined, "auto-replied; foo=bar")).toBe(true);
  });

  it("is false with no bulk/list-unsubscribe/auto-submitted signal at all", () => {
    expect(looksAutomated(false)).toBe(false);
    expect(looksAutomated(false, "normal", "no")).toBe(false);
  });
});
