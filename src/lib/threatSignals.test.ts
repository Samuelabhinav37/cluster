import { describe, expect, it, vi } from "vitest";
import { riskTier, scoreMessageForThreats, senderRiskScore } from "./threatSignals";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";

// The real blocklist is the empty vendored slice plus a (shipped-empty)
// hand seed; stub a single known-bad host so the blocklisted-domain signal
// is exercisable without coupling the test to real data.
vi.mock("./blocklist", () => ({
  isBlockedDomain: (domain: string) => domain === "known-malware-host.example",
}));

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

  it("matches a brand key containing punctuation (at&t)", () => {
    expect(
      scoreMessageForThreats(message({ fromDisplayName: "AT&T Billing", fromAddress: "billing@att-account-update.example" }))
    ).toEqual([{ kind: "brand-impersonation", brand: "at&t", confidence: "medium" }]);
  });

  it("matches a multi-word brand key across an irregular run of whitespace", () => {
    expect(
      scoreMessageForThreats(message({ fromDisplayName: "Capital  One Alerts", fromAddress: "alerts@capitalone-secure.example" }))
    ).toEqual([{ kind: "brand-impersonation", brand: "capital one", confidence: "medium" }]);
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

  it("does not flag a short-label brand's near-neighbour as a lookalike (ubs.com is not a ups.com typosquat)", () => {
    expect(scoreMessageForThreats(message({ fromDisplayName: "Statement ready", fromAddress: "no-reply@ubs.com" }))).toEqual([]);
  });

  it("does not flag a TLD swap on a short-label brand (att.net is AT&T's own domain, not a lookalike of att.com)", () => {
    expect(scoreMessageForThreats(message({ fromDisplayName: "Your bill", fromAddress: "billing@att.net" }))).toEqual([]);
  });

  it("flags a homoglyph domain that renders identically to a brand's (Cyrillic a in pаypаl.com)", () => {
    expect(scoreMessageForThreats(message({ fromDisplayName: "Account", fromAddress: "security@pаypаl.com" }))).toEqual([
      { kind: "lookalike-domain", brand: "paypal", confidence: "high" },
    ]);
  });

  it("flags a digit-for-letter lookalike via the ASCII skeleton (g00gle.com)", () => {
    expect(scoreMessageForThreats(message({ fromDisplayName: "Security alert", fromAddress: "no-reply@g00gle.com" }))).toEqual([
      { kind: "lookalike-domain", brand: "google", confidence: "high" },
    ]);
  });

  it("does not flag an unrelated domain that merely contains a digit", () => {
    expect(scoreMessageForThreats(message({ fromDisplayName: "Newsletter", fromAddress: "hi@shop123.example" }))).toEqual([]);
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

describe("scoreMessageForThreats: blocklisted-domain", () => {
  it("flags a sender whose domain is on the blocklist", () => {
    expect(
      scoreMessageForThreats(message({ fromDisplayName: "Anyone", fromAddress: "x@known-malware-host.example" }))
    ).toEqual([{ kind: "blocklisted-domain", brand: "known-malware-host.example", confidence: "high" }]);
  });

  it("adds the blocklist signal alongside a brand signal, not instead of it", () => {
    expect(
      scoreMessageForThreats(message({ fromDisplayName: "PayPal", fromAddress: "x@known-malware-host.example" }))
    ).toEqual([
      { kind: "blocklisted-domain", brand: "known-malware-host.example", confidence: "high" },
      { kind: "brand-impersonation", brand: "paypal", confidence: "medium" },
    ]);
  });

  it("does not flag a domain that isn't on the list", () => {
    expect(scoreMessageForThreats(message({ fromAddress: "x@ordinary.example" }))).toEqual([]);
  });
});

describe("senderRiskScore / riskTier", () => {
  it("is zero for a sender with no signals", () => {
    expect(senderRiskScore([])).toBe(0);
    expect(riskTier(0)).toBe("low");
  });

  it("ranks a blocklisted-domain signal above every heuristic signal", () => {
    const blocked = senderRiskScore([{ kind: "blocklisted-domain", brand: "x.example", confidence: "high" }]);
    const freemail = senderRiskScore([{ kind: "freemail-brand-claim", brand: "paypal", confidence: "high" }]);
    expect(blocked).toBeGreaterThan(freemail);
  });

  it("ranks a high-confidence freemail brand claim above a lone medium brand-impersonation", () => {
    const freemail = senderRiskScore([{ kind: "freemail-brand-claim", brand: "paypal", confidence: "high" }]);
    const impersonation = senderRiskScore([{ kind: "brand-impersonation", brand: "chase", confidence: "medium" }]);
    expect(freemail).toBeGreaterThan(impersonation);
  });

  it("ranks a sender with two signals above one with a single signal", () => {
    const one = senderRiskScore([{ kind: "brand-impersonation", brand: "chase", confidence: "medium" }]);
    const two = senderRiskScore([
      { kind: "brand-impersonation", brand: "chase", confidence: "medium" },
      { kind: "failed-authentication", brand: "chase-alerts.example", confidence: "high" },
    ]);
    expect(two).toBeGreaterThan(one);
  });

  it("maps score to a tier", () => {
    expect(riskTier(2)).toBe("low");
    expect(riskTier(3)).toBe("elevated");
    expect(riskTier(6)).toBe("high");
  });
});
