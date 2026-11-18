import { describe, expect, it } from "vitest";
import { KIND_PHRASES, MAX_FILTER_QUERY, OTP_EXCLUDED_PHRASES, categoryQueries, categoryQuery } from "./categoryQueries";
import { classifyMessageKind } from "./messageKind";
import { ALL_SORT_BUCKETS, classifySortBucket } from "./sortTaxonomy";

describe("KIND_PHRASES", () => {
  it("never matches more than the client classifier: each phrase is classified as its own kind", () => {
    for (const [kind, phrases] of Object.entries(KIND_PHRASES)) {
      for (const phrase of phrases) {
        expect(classifyMessageKind(`Hello ${phrase} here`, false), `${kind}: ${phrase}`).toBe(kind);
      }
    }
  });

  it("keeps security notices out of one-time codes on both sides", () => {
    for (const subject of [
      "Two-factor authentication was disabled",
      "Security alert: new sign-in to your account",
      "Your 2FA settings changed",
    ]) {
      expect(classifyMessageKind(subject, false), subject).not.toBe("otp");
    }
    expect(OTP_EXCLUDED_PHRASES).toContain("disabled");
  });

  it("catches the common code wordings the old classifier missed", () => {
    expect(classifyMessageKind("482913 is your code", false)).toBe("otp");
    expect(classifyMessageKind("Your sign-in code", false)).toBe("otp");
    expect(classifyMessageKind("Your package was delivered", false)).toBe("shipping");
    expect(classifyMessageKind("Order confirmed: #1234", false)).toBe("shipping");
  });
});

describe("categoryQuery", () => {
  it("never files free mail by subject: a scam's fake receipt from gmail.com gets no label", () => {
    for (const bucket of ["otp", "accounts", "shipping", "receipt", "social", "jobs"] as const)
      for (const q of categoryQueries(bucket)) {
        expect(q).toContain("-from:(gmail.com OR googlemail.com");
        expect(q.length).toBeLessThanOrEqual(MAX_FILTER_QUERY);
      }
    expect(categoryQueries("shopping").join(" ")).not.toContain("gmail.com");
  });

  it("skips a company's other services: AWS isn't Shopping, LinkedIn job alerts aren't Social", () => {
    const shopping = categoryQueries("shopping").join(" ");
    expect(shopping).toContain("-from:(");
    expect(shopping).toContain("no-reply-aws@amazon.com");
    expect(categoryQueries("productivity").join(" ")).toMatch(/from:\([^)]*no-reply-aws@amazon\.com/);
    const social = categoryQueries("social").join(" ");
    expect(social).toMatch(/-from:\([^)]*jobalerts-noreply@linkedin\.com/);
    for (const q of [...categoryQueries("shopping"), ...categoryQueries("social")]) expect(q.length).toBeLessThanOrEqual(MAX_FILTER_QUERY);
  });

  it("matches one-time codes by subject and excludes security notices", () => {
    const q = categoryQuery("otp")!;
    expect(q).toMatch(/^subject:\("verification code" OR /);
    expect(q).toContain('-subject:(alert OR disabled OR changed OR "new sign-in" OR suspicious)');
  });

  it("keeps the client's kind order: shipping excludes code phrases", () => {
    const q = categoryQuery("shipping")!;
    expect(q).toMatch(/^subject:\(shipped OR /);
    expect(q).toContain('-subject:("verification code"');
  });

  it("gives sender categories their domains and excludes every kind phrase", () => {
    const q = categoryQuery("shopping")!;
    expect(q).toMatch(/^from:\(amazon\.com OR /);
    expect(q).toContain("-subject:(");
    expect(q).toContain("shipped");
  });

  it("files ads from Gmail's Promotions tab", () => {
    expect(categoryQuery("promotions")).toMatch(/^category:promotions -subject:\(/);
  });

  it("applies per-sender corrections: redirected in, never-sorted out", () => {
    const qs = categoryQueries("otp", { "codes@bank.example": "otp", "friend@mail.example": "never" });
    // The user's redirect is its own query: their correction beats every rule.
    expect(qs).toContain("from:(codes@bank.example)");
    expect(qs[0]).toContain("-from:(friend@mail.example)");
  });

  it("has a query for every category the time limits cover", () => {
    for (const bucket of [
      "otp", "shipping", "receipt", "social", "newsletter", "promotions",
      "shopping", "travel", "finance", "productivity", "education",
    ] as const) {
      expect(categoryQuery(bucket), bucket).not.toBeNull();
    }
  });
});

describe("classifySortBucket with Promotions", () => {
  it("uses Gmail's Promotions tab after kind, before sender category", () => {
    expect(classifySortBucket("other", "deals.example", true)).toBe("promotions");
    expect(classifySortBucket("other", "amazon.com", true)).toBe("promotions");
    expect(classifySortBucket("shipping", "deals.example", true)).toBe("shipping");
    expect(classifySortBucket("other", "deals.example", false)).toBeNull();
  });
});

describe("filter length", () => {
  it("splits a long domain list across filters, each under Gmail's limit, missing none", async () => {
    const { ALL_SORT_BUCKETS } = await import("./sortTaxonomy");
    const { MAX_FILTER_QUERY, categoryQueries } = await import("./categoryQueries");
    const { domainsForCategory } = await import("./domainCategories");
    for (const b of ALL_SORT_BUCKETS) {
      const qs = categoryQueries(b);
      for (const q of qs) expect(q.length, b).toBeLessThanOrEqual(MAX_FILTER_QUERY);
      const joined = qs.join(" ");
      for (const d of domainsForCategory(b as never)) expect(joined, `${b}: ${d}`).toContain(d);
    }
    expect(categoryQueries("shopping").length).toBeGreaterThan(1);
    expect(categoryQuery("shopping")).toContain("amazon.com");
  });
});

describe("kind-scoped corrections in filters", () => {
  const overrides = { "ship@amazon.com|receipt": "shopping" as const };
  it("gives the target its own from+subject query", () => {
    const q = categoryQueries("shopping", overrides);
    expect(q.at(-1)).toMatch(/^\(from:ship@amazon\.com subject:\(receipt OR invoice/);
    expect(q.slice(0, -1).join(" ")).not.toContain("ship@amazon.com");
  });
  it("keeps the sender out of its kind's own filter only", () => {
    expect(categoryQuery("receipt", overrides)).toContain("-from:(ship@amazon.com)");
    expect(categoryQuery("shipping", overrides)).not.toContain("ship@amazon.com");
  });
  it("keeps a whole-sender redirect, minus the scoped kind", () => {
    const q = categoryQueries("shipping", { ...overrides, "ship@amazon.com": "shipping" }).at(-1)!;
    expect(q).toMatch(/^from:\(ship@amazon\.com\) -\(from:ship@amazon\.com subject:\(receipt/);
  });
});

describe("job receipts", () => {
  it("the Receipts filter skips a job application's receipt", () => {
    expect(categoryQuery("receipt")).toContain('-subject:("resume receipt"');
  });
});

describe("corrections never break a filter (audit B1)", () => {
  const many = (n: number, target: "shopping" | "never") =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`someone.long.name${i}@company-number-${i}.example`, target]));
  it.each([0, 30, 200, 1000])("every query stays under the limit with %i corrections", (n) => {
    const overrides = { ...many(n, "shopping"), ...many(n, "never") };
    for (const b of ALL_SORT_BUCKETS) for (const q of categoryQueries(b, overrides)) expect(q.length, `${b}: ${q.slice(0, 60)}`).toBeLessThanOrEqual(MAX_FILTER_QUERY);
  });
  it("every redirected sender is matched by some query", () => {
    const overrides = many(300, "shopping");
    const all = categoryQueries("shopping", overrides).join(" ");
    for (const a of Object.keys(overrides)) expect(all).toContain(a);
  });
  it("the newest correction wins the room to be left out", () => {
    const overrides = { ...many(300, "never"), "newest@last.example": "never" as const };
    expect(categoryQuery("receipt", overrides)).toContain("newest@last.example");
  });
});
