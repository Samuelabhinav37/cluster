import { afterEach, beforeEach, describe, expect, it } from "vitest";
import data from "../../public/data/public-suffix.json";
import { isPublicSuffixListLoaded, publicSuffix, registrableDomainOf, setPublicSuffixRules } from "./publicSuffix";
import { registrableDomain, registrableDomainCandidates } from "./registrableDomain";

describe("with the bundled Public Suffix List", () => {
  beforeEach(() => setPublicSuffixRules(data));
  afterEach(() => setPublicSuffixRules(null));

  // From the list's own test vectors (publicsuffix/list tests/test_psl.txt),
  // in the ASCII form mail headers use.
  const vectors: [string, string | null][] = [
    ["com", null],
    ["example.com", "example.com"],
    ["a.b.example.com", "example.com"],
    ["uk.com", null],
    ["example.uk.com", "example.uk.com"],
    ["a.example.uk.com", "example.uk.com"],
    ["test.ac", "test.ac"],
    ["c.mm", null],
    ["b.c.mm", "b.c.mm"],
    ["a.b.c.mm", "b.c.mm"],
    ["test.jp", "test.jp"],
    ["www.test.jp", "test.jp"],
    ["ac.jp", null],
    ["test.ac.jp", "test.ac.jp"],
    ["kyoto.jp", null],
    ["ide.kyoto.jp", null],
    ["b.ide.kyoto.jp", "b.ide.kyoto.jp"],
    ["c.kobe.jp", null],
    ["b.c.kobe.jp", "b.c.kobe.jp"],
    ["city.kobe.jp", "city.kobe.jp"],
    ["www.city.kobe.jp", "city.kobe.jp"],
    ["test.ck", null],
    ["b.test.ck", "b.test.ck"],
    ["www.ck", "www.ck"],
    ["www.www.ck", "www.ck"],
    ["test.k12.ak.us", "test.k12.ak.us"],
    ["k12.ak.us", null],
    ["xn--55qx5d.cn", null],
    ["www.xn--85x722f.xn--55qx5d.cn", "xn--85x722f.xn--55qx5d.cn"],
    ["shishi.xn--55qx5d.cn", "shishi.xn--55qx5d.cn"],
  ];
  it.each(vectors)("%s -> %s", (domain, expected) => {
    expect(registrableDomainOf(domain)).toBe(expected);
  });

  it("treats a site on a shared host as its own registrable domain", () => {
    expect(registrableDomainOf("evil.github.io")).toBe("evil.github.io");
    expect(publicSuffix("evil.github.io")).toBe("github.io");
  });

  it("is case and trailing-dot insensitive", () => {
    expect(registrableDomainOf("Mail.Example.CO.UK.")).toBe("example.co.uk");
  });

  it("stops the parent walk at the registrable domain, never at a public suffix", () => {
    expect(registrableDomainCandidates("mail.evil.co.uk")).toEqual(["mail.evil.co.uk", "evil.co.uk"]);
    expect(registrableDomainCandidates("a.b.evil.github.io")).toEqual([
      "a.b.evil.github.io",
      "b.evil.github.io",
      "evil.github.io",
    ]);
    expect(registrableDomain("news.shop.example.co.uk")).toBe("example.co.uk");
  });
});

describe("before the list has loaded", () => {
  it("falls back to the last label as the suffix, as before", () => {
    expect(isPublicSuffixListLoaded()).toBe(false);
    expect(registrableDomainOf("mail.example.co.uk")).toBe("co.uk");
    expect(registrableDomainCandidates("mail.evil.example")).toEqual(["mail.evil.example", "evil.example"]);
  });
});
