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

describe("scoreMessageForThreats: brand-impersonation / freemail-brand-claim", () => {
  it("returns no signals for a brand-named sender using its own real domain", () => {
    expect(scoreMessageForThreats(message({ fromDisplayName: "PayPal", fromAddress: "service@paypal.com" }))).toEqual([]);
  });

  it("accepts a legitimate subdomain of a brand's real domain", () => {
    // Real fix from this pass: notify.paypal.com was previously flagged as
    // impersonation because the old check only did an exact-domain match.
    expect(
      scoreMessageForThreats(message({ fromDisplayName: "PayPal", fromAddress: "service@notify.paypal.com" }))
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
    expect(scoreMessageForThreats(message({ fromDisplayName: "Kirsten Owens", fromAddress: "kirsten@example.com" }))).toEqual([]);
  });

  it("is case-insensitive on both the brand name and the domain", () => {
    expect(scoreMessageForThreats(message({ fromDisplayName: "AMAZON", fromAddress: "orders@AMAZON.COM" }))).toEqual([]);
  });

  it("accepts any of a brand's several legitimate domains", () => {
    expect(scoreMessageForThreats(message({ fromDisplayName: "Amazon", fromAddress: "auto-confirm@amazon.co.uk" }))).toEqual([]);
  });
});

describe("scoreMessageForThreats: lookalike-domain", () => {
  it("flags a single-character-substitution lookalike even without the brand name in the display name", () => {
    expect(scoreMessageForThreats(message({ fromDisplayName: "Account Update", fromAddress: "billing@paypa1.com" }))).toEqual([
      { kind: "lookalike-domain", brand: "paypal", confidence: "high" },
    ]);
  });

  it("flags a multi-character-substitution lookalike within the distance threshold", () => {
    expect(scoreMessageForThreats(message({ fromDisplayName: "Order Update", fromAddress: "ship@arnazon.com" }))).toEqual([
      { kind: "lookalike-domain", brand: "amazon", confidence: "high" },
    ]);
  });

  it("does not flag a legitimate brand domain as its own lookalike", () => {
    expect(scoreMessageForThreats(message({ fromDisplayName: "Notice", fromAddress: "x@paypal.com" }))).toEqual([]);
  });

  it("does not flag a domain that's too different in edit distance", () => {
    expect(scoreMessageForThreats(message({ fromDisplayName: "Notice", fromAddress: "x@totally-unrelated-domain.example" }))).toEqual(
      []
    );
  });

  it("does not double-report when the exact brand-impersonation check already fired for the same message", () => {
    // chase-secure-login.example already fires brand-impersonation above (display name
    // says "Chase") -- it should not also separately fire as a chase.com lookalike.
    const result = scoreMessageForThreats(
      message({ fromDisplayName: "Chase Bank Alerts", fromAddress: "alerts@chase-secure-login.example" })
    );
    expect(result.filter((s) => s.kind === "lookalike-domain")).toEqual([]);
  });
});

describe("scoreMessageForThreats: failed-authentication", () => {
  it("flags a DMARC fail regardless of brand name or domain", () => {
    expect(
      scoreMessageForThreats(
        message({
          fromDisplayName: "Ordinary Sender",
          fromAddress: "person@example.com",
          authenticationResults: "mx.google.com; spf=pass; dkim=pass; dmarc=fail (p=REJECT) header.from=example.com",
        })
      )
    ).toEqual([{ kind: "failed-authentication", brand: "example.com", confidence: "high" }]);
  });

  it("does not flag on a DMARC pass", () => {
    expect(
      scoreMessageForThreats(
        message({ authenticationResults: "mx.google.com; spf=pass; dkim=pass; dmarc=pass header.from=example.com" })
      )
    ).toEqual([]);
  });

  it("does not flag on SPF/DKIM failure alone when DMARC isn't a fail (forwarding/mailing-list false-positive avoidance)", () => {
    expect(
      scoreMessageForThreats(message({ authenticationResults: "mx.google.com; spf=fail; dkim=fail; dmarc=pass" }))
    ).toEqual([]);
  });

  it("does not flag when there's no Authentication-Results header at all", () => {
    expect(scoreMessageForThreats(message({ authenticationResults: undefined }))).toEqual([]);
  });

  it("combines with a brand signal when both fire on the same message", () => {
    const result = scoreMessageForThreats(
      message({
        fromDisplayName: "PayPal Support",
        fromAddress: "paypal-support@gmail.com",
        authenticationResults: "mx.google.com; dmarc=fail",
      })
    );
    expect(result).toEqual([
      { kind: "freemail-brand-claim", brand: "paypal", confidence: "high" },
      { kind: "failed-authentication", brand: "gmail.com", confidence: "high" },
    ]);
  });
});
