import { describe, expect, it } from "vitest";
import { categorizeDomain, domainsForCategory } from "./domainCategories";

describe("categorizeDomain", () => {
  it("files any school domain under education", () => {
    expect(categorizeDomain("iastate.edu")).toBe("education");
    expect(categorizeDomain("vitap.ac.in")).toBe("education");
    expect(categorizeDomain("iastate.edu.example.com")).toBe("other");
  });

  it("maps an exact curated domain", () => {
    expect(categorizeDomain("amazon.com")).toBe("shopping");
    expect(categorizeDomain("chase.com")).toBe("finance");
    expect(categorizeDomain("alerts.hdfcbank.net")).toBe("finance");
    expect(categorizeDomain("sbi.co.in")).toBe("finance");
    expect(categorizeDomain("irctc.co.in")).toBe("travel");
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

describe("domain lists", () => {
  it("never lists a domain or service in two categories", () => {
    const cats = ["shopping", "travel", "finance", "social", "productivity", "newsletter", "education", "jobs"] as const;
    const all = cats.flatMap((c) => domainsForCategory(c));
    expect(all.length).toBe(new Set(all).size);
  });
});
