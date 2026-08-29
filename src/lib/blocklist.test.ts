import { describe, expect, it } from "vitest";
import { createBlocklist } from "./blocklist";

describe("createBlocklist", () => {
  const { isBlockedDomain } = createBlocklist([
    "evil.example",
    "Bad-Domain.TEST",
    "phish.co.uk",
    "trailing.example.",
  ]);

  it("matches an exact domain, case-insensitively", () => {
    expect(isBlockedDomain("evil.example")).toBe(true);
    expect(isBlockedDomain("EVIL.example")).toBe(true);
    expect(isBlockedDomain("bad-domain.test")).toBe(true);
  });

  it("matches a subdomain of a blocked registrable domain", () => {
    expect(isBlockedDomain("login.evil.example")).toBe(true);
    expect(isBlockedDomain("a.b.phish.co.uk")).toBe(true);
  });

  it("normalises a leading www. and a trailing dot", () => {
    expect(isBlockedDomain("www.evil.example")).toBe(true);
    expect(isBlockedDomain("trailing.example")).toBe(true);
  });

  it("does not match an unrelated domain or a bare parent TLD", () => {
    expect(isBlockedDomain("evil.example.org")).toBe(false);
    expect(isBlockedDomain("notevil.example")).toBe(false);
    expect(isBlockedDomain("example")).toBe(false);
    expect(isBlockedDomain("")).toBe(false);
  });

  it("de-duplicates when reporting its size", () => {
    expect(createBlocklist(["a.example", "a.example", "b.example"]).size).toBe(2);
  });
});
