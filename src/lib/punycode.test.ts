import { describe, expect, it } from "vitest";
import { decodePunycodeLabel, domainToUnicode } from "./punycode";

describe("domainToUnicode", () => {
  // Each Unicode domain is encoded by the URL parser's own IDNA converter,
  // then decoded by ours, which must give the original back.
  const samples = ["pаypаl.com", "gооgle.com", "münchen.de", "bücher.example", "例え.jp", "公司.cn", "παράδειγμα.δοκιμή"];
  it.each(samples)("decodes the URL parser's encoding of %s back to it", (unicode) => {
    const ascii = new URL(`http://${unicode}/`).hostname;
    expect(ascii).toMatch(/xn--/);
    expect(domainToUnicode(ascii)).toBe(unicode);
  });

  it("decodes the RFC 3492 sample", () => {
    // RFC 3492 7.1 (L) "3年B組金八先生"
    expect(decodePunycodeLabel("3B-ww4c5e180e575a65lsy2b")).toBe("3年B組金八先生");
  });

  it("decodes a Cyrillic lookalike", () => {
    expect(domainToUnicode("xn--pypl-53dc.com")).toBe("pаypаl.com");
  });

  it("leaves plain and malformed labels alone", () => {
    expect(domainToUnicode("mail.example.com")).toBe("mail.example.com");
    expect(domainToUnicode("xn--!!!.com")).toBe("xn--!!!.com");
  });
});
