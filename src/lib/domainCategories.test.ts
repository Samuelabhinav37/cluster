import { describe, expect, it } from "vitest";
import { categorizeDomain, domainsForCategory } from "./domainCategories";

describe("categorizeDomain", () => {
  it("maps an exact curated domain", () => {
    expect(categorizeDomain("amazon.com")).toBe("shopping");
    expect(categorizeDomain("chase.com")).toBe("finance");
  });

  it("falls back to the registrable domain for a sending subdomain", () => {
    expect(categorizeDomain("email.amazon.com")).toBe("shopping");
    expect(categorizeDomain("e.delta.com")).toBe("travel");
    expect(categorizeDomain("marketing.notifications.chase.com")).toBe("finance");
  });

  it("normalises case, a leading www., and a trailing dot", () => {
    expect(categorizeDomain("WWW.Amazon.Com.")).toBe("shopping");
  });

  it("never matches on a bare TLD and returns 'other' for the unknown", () => {
    expect(categorizeDomain("something.com")).toBe("other");
    expect(categorizeDomain("")).toBe("other");
  });
});

describe("domainsForCategory", () => {
  it("returns the curated list for a category and nothing for 'other'", () => {
    expect(domainsForCategory("shopping")).toContain("amazon.com");
    expect(domainsForCategory("other")).toEqual([]);
  });
});
