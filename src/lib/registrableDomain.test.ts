import { describe, expect, it } from "vitest";
import {
  domainMatchesSet,
  isSameOrSubdomain,
  lookupDomainInMap,
  normalizeDomain,
  registrableDomainCandidates,
} from "./registrableDomain";

describe("normalizeDomain", () => {
  it("lowercases, strips a leading www., and strips a trailing dot", () => {
    expect(normalizeDomain("WWW.Example.Com.")).toBe("example.com");
  });

  it("trims whitespace", () => {
    expect(normalizeDomain("  example.com  ")).toBe("example.com");
  });
});

describe("isSameOrSubdomain", () => {
  it("matches the exact domain", () => {
    expect(isSameOrSubdomain("evil.example", "evil.example")).toBe(true);
  });

  it("matches a subdomain", () => {
    expect(isSameOrSubdomain("mail.evil.example", "evil.example")).toBe(true);
    expect(isSameOrSubdomain("a.b.evil.example", "evil.example")).toBe(true);
  });

  it("does not match an unrelated domain that shares a suffix without a dot boundary", () => {
    expect(isSameOrSubdomain("notevil.example", "evil.example")).toBe(false);
  });

  it("does not match the reverse direction", () => {
    expect(isSameOrSubdomain("evil.example", "mail.evil.example")).toBe(false);
  });

  it("is false for empty input", () => {
    expect(isSameOrSubdomain("", "evil.example")).toBe(false);
    expect(isSameOrSubdomain("evil.example", "")).toBe(false);
  });
});

describe("registrableDomainCandidates", () => {
  it("returns the domain and each parent, most specific first", () => {
    expect(registrableDomainCandidates("mail.evil.example")).toEqual(["mail.evil.example", "evil.example"]);
  });

  it("stops before the bare TLD", () => {
    expect(registrableDomainCandidates("evil.example")).toEqual(["evil.example"]);
    expect(registrableDomainCandidates("example")).toEqual(["example"]);
  });

  it("normalizes before walking", () => {
    expect(registrableDomainCandidates("WWW.Mail.Evil.Example.")).toEqual(["mail.evil.example", "evil.example"]);
  });

  it("returns an empty array for empty input", () => {
    expect(registrableDomainCandidates("")).toEqual([]);
  });
});

describe("domainMatchesSet", () => {
  it("matches a set member directly or via a parent", () => {
    const set = new Set(["evil.example"]);
    expect(domainMatchesSet("evil.example", set)).toBe(true);
    expect(domainMatchesSet("mail.evil.example", set)).toBe(true);
    expect(domainMatchesSet("safe.example", set)).toBe(false);
  });

  it("never matches everything via a bare-TLD entry", () => {
    const set = new Set(["example"]);
    expect(domainMatchesSet("evil.example", set)).toBe(false);
  });
});

describe("lookupDomainInMap", () => {
  it("returns the value for the domain or its nearest matching parent", () => {
    const map = new Map([["amazon.com", "shopping"]]);
    expect(lookupDomainInMap("amazon.com", map)).toBe("shopping");
    expect(lookupDomainInMap("email.amazon.com", map)).toBe("shopping");
    expect(lookupDomainInMap("unrelated.example", map)).toBeUndefined();
  });
});
