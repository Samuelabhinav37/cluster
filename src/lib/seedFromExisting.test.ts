import { describe, expect, it } from "vitest";
import type { GmailFilterResource } from "./gmailApi";
import {
  filteredFromTargets,
  findLabelReuseCandidates,
  skipOverridesFor,
} from "./seedFromExisting";

describe("findLabelReuseCandidates", () => {
  it("matches a bucket label to a user label of the same name, case-insensitively", () => {
    expect(
      findLabelReuseCandidates(["Shopping", "Newsletters"], ["shopping", "Work"], []),
    ).toEqual([{ bucketLabel: "Shopping", existing: "shopping" }]);
  });

  it("skips a label Cluster already owns and Gmail system labels", () => {
    expect(
      findLabelReuseCandidates(["Shopping"], ["Shopping", "INBOX", "CATEGORY_PROMOTIONS"], ["Shopping"]),
    ).toEqual([]);
  });
});

describe("filteredFromTargets", () => {
  const f = (from: string): GmailFilterResource => ({ id: from, criteria: { from } });

  it("keeps plain addresses and bare domains, drops compound queries", () => {
    expect(
      filteredFromTargets([f("news@stripe.com"), f("amazon.com"), f("(a OR b)"), f("x -y")]),
    ).toEqual(["news@stripe.com", "amazon.com"]);
  });

  it("dedupes and lowercases", () => {
    expect(filteredFromTargets([f("News@Stripe.com"), f("news@stripe.com")])).toEqual([
      "news@stripe.com",
    ]);
  });
});

describe("skipOverridesFor", () => {
  it("maps every target to a 'never' override", () => {
    expect(skipOverridesFor(["news@stripe.com", "Amazon.com"])).toEqual({
      "news@stripe.com": "never",
      "amazon.com": "never",
    });
  });
});
