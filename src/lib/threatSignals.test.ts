import { describe, expect, it } from "vitest";
import { scoreMessageForThreats } from "./threatSignals";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";

function message(overrides: Partial<NormalizedMessageMetadata>): NormalizedMessageMetadata {
  return {
    id: "1",
    provider: "gmail",
    fromAddress: "notifications@example.com",
    fromDisplayName: "Example Notifications",
    subject: "Hello",
    isProtected: false,
    unsubscribe: {},
    receivedAt: 0,
    ...overrides,
  };
}

describe("scoreMessageForThreats", () => {
  it("returns no signals for a brand-named sender using its own real domain", () => {
    expect(
      scoreMessageForThreats(message({ fromDisplayName: "PayPal", fromAddress: "service@paypal.com" }))
    ).toEqual([]);
  });

  it("returns no signals when the display name doesn't invoke a known brand", () => {
    expect(
      scoreMessageForThreats(message({ fromDisplayName: "Sam's Coffee Shop", fromAddress: "hello@samscoffee.example" }))
    ).toEqual([]);
  });

  it("flags freemail-brand-claim (high confidence) when a brand name is paired with a consumer free-mail domain", () => {
    expect(
      scoreMessageForThreats(message({ fromDisplayName: "PayPal Support", fromAddress: "paypal-support@gmail.com" }))
    ).toEqual([{ kind: "freemail-brand-claim", brand: "paypal", confidence: "high" }]);
  });

  it("flags brand-impersonation (medium confidence) when a brand name is paired with a non-freemail, non-legitimate domain", () => {
    expect(
      scoreMessageForThreats(message({ fromDisplayName: "Chase Bank Alerts", fromAddress: "alerts@chase-secure-login.example" }))
    ).toEqual([{ kind: "brand-impersonation", brand: "chase", confidence: "medium" }]);
  });

  it("matches the brand by whole word, not substring", () => {
    // "irs" should not fire on a display name that merely contains the letters -- only a
    // real word-boundary match should trigger, and this display name has neither the word
    // "irs" nor any other listed brand in it.
    expect(scoreMessageForThreats(message({ fromDisplayName: "Kirsten Owens", fromAddress: "kirsten@example.com" }))).toEqual([]);
  });

  it("is case-insensitive on both the brand name and the domain", () => {
    expect(
      scoreMessageForThreats(message({ fromDisplayName: "AMAZON", fromAddress: "orders@AMAZON.COM" }))
    ).toEqual([]);
  });

  it("accepts any of a brand's several legitimate domains", () => {
    expect(
      scoreMessageForThreats(message({ fromDisplayName: "Amazon", fromAddress: "auto-confirm@amazon.co.uk" }))
    ).toEqual([]);
  });
});
