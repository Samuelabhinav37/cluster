import { describe, expect, it } from "vitest";
import { domainFromAddress, logoFor } from "./senderLogos";

describe("domainFromAddress", () => {
  it("pulls the domain out of a bare address", () => {
    expect(domainFromAddress("news@amazon.com")).toBe("amazon.com");
  });

  it("lowercases and strips a trailing angle bracket", () => {
    expect(domainFromAddress("News@AMAZON.com>")).toBe("amazon.com");
  });

  it("returns empty string for something with no @", () => {
    expect(domainFromAddress("not-an-address")).toBe("");
  });
});

describe("logoFor", () => {
  it("uses the curated brand colour for a known domain", () => {
    const logo = logoFor("shipment-tracking@amazon.com", "Amazon");
    expect(logo.brand).toBe(true);
    expect(logo.background).toBe("#ff9900");
    // Amazon orange is light — dark text for contrast.
    expect(logo.foreground).toBe("#1d1d1f");
    expect(logo.monogram).toBe("AM");
  });

  it("matches a brand on a parent domain", () => {
    const logo = logoFor("noreply@marketing.email.stripe.com", "Stripe");
    expect(logo.brand).toBe(true);
    expect(logo.background).toBe("#635bff");
  });

  it("falls back to a stable hashed tint for an unknown sender", () => {
    const a = logoFor("hello@some-obscure-shop.example", "Some Obscure Shop");
    const b = logoFor("promo@some-obscure-shop.example", "Some Obscure Shop");
    expect(a.brand).toBe(false);
    expect(a.background).toBe(b.background); // deterministic per domain
    expect(a.monogram).toBe("SO");
  });

  it("never returns a favicon URL or triggers I/O — background is always a colour", () => {
    const logo = logoFor("weird@ünüsual.test");
    expect(logo.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(logo.monogram.length).toBeGreaterThanOrEqual(1);
  });

  it("derives a monogram from the address when there is no display name", () => {
    expect(logoFor("kev.wexler@brightpath-consulting.io").monogram).toBe("KE");
  });
});
