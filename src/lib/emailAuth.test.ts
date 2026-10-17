import { describe, expect, it } from "vitest";
import {
  isTrustedAuthenticationResults,
  parseAuthenticationResults,
  parseAuthResultEntries,
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

describe("parseAuthenticationResults: sender-controlled text can't fake a verdict", () => {
  // Gmail's comments and smtp.mailfrom repeat the envelope sender, which the
  // sender picks. A first-match regex read "dkim=pass" out of that text.
  it("ignores a verdict planted in the envelope sender inside a comment and smtp.mailfrom", () => {
    const header =
      "mx.google.com; spf=pass (google.com: domain of dkim=pass@evil.example designates 1.2.3.4 as permitted sender) " +
      "smtp.mailfrom=dkim=pass@evil.example; dkim=fail header.d=evil.example; dmarc=fail (p=NONE) header.from=paypal.com";
    expect(parseAuthenticationResults(header)).toEqual({ spf: "pass", dkim: "fail", dmarc: "fail" });
  });

  it("ignores a dmarc verdict planted in a property value", () => {
    const header = "mx.google.com; spf=pass smtp.mailfrom=dmarc=pass@evil.example; dmarc=fail header.from=paypal.com";
    expect(parseAuthenticationResults(header).dmarc).toBe("fail");
  });

  it("doesn't let a semicolon inside a comment start a new result", () => {
    const header =
      "mx.google.com; spf=pass (domain of x;dkim=pass header.d=paypal.com@evil.example) smtp.mailfrom=x@evil.example; " +
      "dkim=none; dmarc=fail header.from=paypal.com";
    expect(parseAuthenticationResults(header)).toEqual({ spf: "pass", dkim: "none", dmarc: "fail" });
  });

  it("doesn't let a semicolon inside a quoted string start a new result", () => {
    const header =
      'mx.google.com; spf=pass smtp.mailfrom="x;dkim=pass header.d=paypal.com"@evil.example; dkim=none';
    expect(parseAuthenticationResults(header).dkim).toBe("none");
  });

  it("handles nested comments and escaped parentheses", () => {
    const header = "mx.google.com; spf=pass (outer (inner \\) dkim=pass) still comment) smtp.mailfrom=a@b.example; dkim=fail";
    expect(parseAuthenticationResults(header).dkim).toBe("fail");
  });
});

describe("parseAuthenticationResults: RFC 8601 shapes", () => {
  it("reports dkim pass when any signature passes, as DKIM itself does", () => {
    const header =
      "mx.google.com; dkim=fail header.d=broken.example; dkim=pass header.d=example.com; spf=pass";
    expect(parseAuthenticationResults(header).dkim).toBe("pass");
  });

  it("accepts whitespace around = and a method version", () => {
    expect(parseAuthenticationResults("mx.example.com; dkim/1 = pass; dmarc =fail")).toMatchObject({
      dkim: "pass",
      dmarc: "fail",
    });
  });

  it("returns unknown for the 'none' no-result form", () => {
    expect(parseAuthenticationResults("mx.google.com; none")).toEqual({
      spf: "unknown",
      dkim: "unknown",
      dmarc: "unknown",
    });
  });
});

describe("parseAuthResultEntries", () => {
  it("returns each result with its properties, comments removed", () => {
    const header =
      "mx.google.com; dkim=pass (good sig) header.i=@example.com header.d=example.com header.s=s1; " +
      "dmarc=pass (p=REJECT) header.from=Example.com";
    expect(parseAuthResultEntries(header)).toEqual([
      {
        method: "dkim",
        result: "pass",
        properties: { "header.i": "@example.com", "header.d": "example.com", "header.s": "s1" },
      },
      { method: "dmarc", result: "pass", properties: { "header.from": "Example.com" } },
    ]);
  });

  it("returns nothing for an empty or missing header", () => {
    expect(parseAuthResultEntries(undefined)).toEqual([]);
    expect(parseAuthResultEntries("")).toEqual([]);
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
