import { describe, expect, it } from "vitest";
import { KIND_PHRASES, OTP_EXCLUDED_PHRASES, categoryQuery } from "./categoryQueries";
import { classifyMessageKind } from "./messageKind";
import { classifySortBucket } from "./sortTaxonomy";

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
    const q = categoryQuery("otp", { "codes@bank.example": "otp", "friend@mail.example": "never" })!;
    expect(q).toMatch(/^\{subject:\(.*\) from:\(codes@bank\.example\)\}/);
    expect(q).toContain("-from:(friend@mail.example)");
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
  it("uses Gmail's Promotions tab only after kind and sender category", () => {
    expect(classifySortBucket("other", "deals.example", true)).toBe("promotions");
    expect(classifySortBucket("other", "amazon.com", true)).toBe("shopping");
    expect(classifySortBucket("shipping", "deals.example", true)).toBe("shipping");
    expect(classifySortBucket("other", "deals.example", false)).toBeNull();
  });
});
