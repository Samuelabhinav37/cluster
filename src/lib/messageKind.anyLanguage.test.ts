import { describe, expect, it } from "vitest";
import { classifyMessageKind } from "./messageKind";

const noreply = { address: "no-reply@bank.example", displayName: "Bank" };

describe("kind signals in any language (plan 4.6)", () => {
  it("a bare code from an automated sender is a code", () => {
    expect(classifyMessageKind("Ihr Code: 482913", false, noreply)).toBe("otp");
    expect(classifyMessageKind("482913 是您的验证码", false, noreply)).toBe("otp");
    expect(classifyMessageKind("Código 4829", false, { address: "verify@app.example", displayName: "" })).toBe("otp");
  });

  it("not a code: a list, a person, an amount, an order number, a long subject", () => {
    expect(classifyMessageKind("Ihr Code: 482913", true, noreply)).not.toBe("otp");
    expect(classifyMessageKind("Treffen 2026", false, { address: "anna@mail.example", displayName: "Anna" })).not.toBe("otp");
    expect(classifyMessageKind("Zahlung 1500 €", false, noreply)).not.toBe("otp");
    expect(classifyMessageKind("Bestellung #48291", false, noreply)).not.toBe("otp");
  });

  it("currency plus an order number is a receipt", () => {
    expect(classifyMessageKind("注文番号 #10234 ¥3,200", false)).toBe("receipt");
    expect(classifyMessageKind("Pedido 7Q2-48821 · R$ 89,90", true)).toBe("receipt");
    expect(classifyMessageKind("Commande AB12-4821 : 49,90 €", false)).toBe("receipt");
  });

  it("an amount alone (a sale) is not a receipt", () => {
    expect(classifyMessageKind("-30% auf alles, ab 20 €", true)).toBe("newsletter");
  });
});

describe("replies are never codes", () => {
  it("Re:/AW:/SV: with a number stays out of codes", () => {
    for (const s of ["Re: request 63523", "AW: Ticket 48291", "SV: sak 10234", "回复：订单 482913"])
      expect(classifyMessageKind(s, false, { address: "no-reply@desk.example", displayName: "" })).not.toBe("otp");
    expect(classifyMessageKind("Ticket 48291", false, { address: "support@desk.example", displayName: "" })).not.toBe("otp");
  });
});
