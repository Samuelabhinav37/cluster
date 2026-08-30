import { describe, expect, it } from "vitest";
import {
  isTrustedAuthenticationResults,
  parseAuthenticationResults,
  selectTrustedAuthenticationResults,
} from "./emailAuth";

describe("parseAuthenticationResults", () => {
  it("parses a fully-passing header (Gmail-shaped)", () => {
    const header =
      "mx.google.com; dkim=pass header.i=@example.com header.s=selector1 header.b=abc; " +
      "spf=pass (google.com: domain of x@example.com designates 1.2.3.4 as permitted sender) smtp.mailfrom=x@example.com; " +
      "dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=example.com";
    expect(parseAuthenticationResults(header)).toEqual({ spf: "pass", dkim: "pass", dmarc: "pass" });
  });

  it("parses a failing dmarc verdict independent of the others", () => {
    const header =
      "mx.google.com; spf=pass smtp.mailfrom=x@evil.example; dkim=none; dmarc=fail (p=REJECT) header.from=paypal.com";
    expect(parseAuthenticationResults(header)).toEqual({ spf: "pass", dkim: "none", dmarc: "fail" });
  });

  it("returns unknown for every mechanism when there is no header at all", () => {
    expect(parseAuthenticationResults(undefined)).toEqual({
      spf: "unknown",
      dkim: "unknown",
      dmarc: "unknown",
    });
  });

  it("returns unknown for every mechanism when the header text has none of the three tokens", () => {
    expect(parseAuthenticationResults("mx.example.com; something=else")).toEqual({
      spf: "unknown",
      dkim: "unknown",
      dmarc: "unknown",
    });
  });

  it("is case-insensitive on both the mechanism name and the verdict", () => {
    expect(parseAuthenticationResults("mx.example.com; DMARC=FAIL")).toEqual({
      spf: "unknown",
      dkim: "unknown",
      dmarc: "fail",
    });
  });

  it("handles softfail and neutral verdicts", () => {
    expect(parseAuthenticationResults("mx.example.com; spf=softfail; dkim=neutral")).toEqual({
      spf: "softfail",
      dkim: "neutral",
      dmarc: "unknown",
    });
  });
});

describe("Authentication-Results trust boundary", () => {
  it("accepts provider-owned Gmail and Outlook authserv-ids", () => {
    expect(isTrustedAuthenticationResults("gmail", "mx.google.com; dkim=pass")).toBe(true);
    expect(
      isTrustedAuthenticationResults("outlook", "NAM12-BN8-obe.outbound.protection.outlook.com; dkim=pass"),
    ).toBe(true);
  });

  it("rejects a sender-injected header and selects the trusted duplicate", () => {
    const forged = "attacker.example; dkim=pass; dmarc=pass";
    const trusted = "mx.google.com; dkim=fail; dmarc=fail";
    expect(isTrustedAuthenticationResults("gmail", forged)).toBe(false);
    expect(selectTrustedAuthenticationResults("gmail", [forged, trusted])).toBe(trusted);
  });
});
