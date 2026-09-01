import { describe, expect, it } from "vitest";
import { buildBucketFilter, bucketMatchTerms, isServerSortBucket } from "./serverSort";

describe("isServerSortBucket", () => {
  it("is true for the domain-category buckets, false for the subject-kind ones", () => {
    expect(isServerSortBucket("shopping")).toBe(true);
    expect(isServerSortBucket("finance")).toBe(true);
    expect(isServerSortBucket("otp")).toBe(false);
    expect(isServerSortBucket("shipping")).toBe(false);
    expect(isServerSortBucket("receipt")).toBe(false);
  });
});

describe("bucketMatchTerms", () => {
  it("starts from the curated domains for the category", () => {
    const { include } = bucketMatchTerms("shopping", {});
    expect(include).toContain("amazon.com");
    expect(include).toContain("etsy.com");
  });

  it("adds an address redirected into the bucket, negates 'never' and other-bucket addresses", () => {
    const { include, exclude } = bucketMatchTerms("shopping", {
      "shop@indie.example": "shopping",
      "promos@amazon.com": "never",
      "news@amazon.com": "newsletter",
    });
    expect(include).toContain("shop@indie.example");
    expect(exclude).toEqual(expect.arrayContaining(["promos@amazon.com", "news@amazon.com"]));
  });

  it("a same-address redirect-in wins over an exclude", () => {
    const { include, exclude } = bucketMatchTerms("finance", { "x@bank.example": "finance" });
    expect(include).toContain("x@bank.example");
    expect(exclude).not.toContain("x@bank.example");
  });
});

describe("buildBucketFilter", () => {
  it("returns null when there's nothing to match", () => {
    expect(buildBucketFilter("Label_1", true, { include: [], exclude: [] })).toBeNull();
  });

  it("builds an OR from-query and strips INBOX when filing out", () => {
    const spec = buildBucketFilter("Label_1", true, { include: ["amazon.com", "etsy.com"], exclude: [] });
    expect(spec).toEqual({
      criteria: { from: "amazon.com OR etsy.com" },
      action: { addLabelIds: ["Label_1"], removeLabelIds: ["INBOX"] },
    });
  });

  it("parenthesises and negates excludes, keeps INBOX when labelling in place", () => {
    const spec = buildBucketFilter("Label_2", false, {
      include: ["amazon.com", "walmart.com"],
      exclude: ["promos@amazon.com"],
    });
    expect(spec?.criteria.from).toBe("(amazon.com OR walmart.com) -promos@amazon.com");
    expect(spec?.action.removeLabelIds).toEqual([]);
  });
});
