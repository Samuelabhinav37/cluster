import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no types
import { guardProblems } from "../../scripts/dataset-guard.mjs";

const list = (n: number, prefix = "spam") => Array.from({ length: n }, (_, i) => `${prefix}${i}.example`);

describe("weekly list refresh guard (plan step 3.5)", () => {
  it("passes a normal refresh", () => {
    expect(guardProblems({ Spam: { before: list(100), after: list(95), block: true } }, ["gmail.com"])).toEqual([]);
  });

  it("stops a list that shrank more than 20%", () => {
    expect(guardProblems({ Spam: { before: list(100), after: list(79), block: true } }, [])).toEqual([
      "Spam shrank from 100 to 79 (more than 20%)",
    ]);
  });

  it("stops a block list that would catch a known-good domain or its subdomain", () => {
    const after = [...list(10), "gmail.com", "mail.paypal.com"];
    expect(guardProblems({ Spam: { before: list(10), after, block: true } }, ["gmail.com", "paypal.com"])).toEqual([
      "Spam would block known-good domains: gmail.com, mail.paypal.com",
    ]);
  });

  it("an allow list may hold known-good domains", () => {
    expect(guardProblems({ Brands: { before: ["paypal.com"], after: ["paypal.com"], block: false } }, ["paypal.com"])).toEqual([]);
  });
});
