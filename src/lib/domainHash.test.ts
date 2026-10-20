import { describe, expect, it } from "vitest";
import { cyrb53, HashedDomainSet } from "./domainHash";
// The dataset builder carries its own copy; both must hash identically or
// every published entry would miss.
import { buildEntries, cyrb53 as scriptCyrb53, encode } from "../../scripts/refresh-phishing-domains.mjs";

const VECTORS: Array<[string, number]> = [
  ["", 3338908027751811],
  ["paypa1.com", 107091598071174],
  ["evil.example", 5561097965284191],
  ["a.b.c", 2205077231395489],
];

describe("cyrb53", () => {
  it("matches the pinned vectors in the extension and in the dataset builder", () => {
    for (const [text, hash] of VECTORS) {
      expect(cyrb53(text)).toBe(hash);
      expect(scriptCyrb53(text)).toBe(hash);
    }
  });
});

describe("HashedDomainSet", () => {
  it("round-trips what the builder encodes", () => {
    const set = HashedDomainSet.fromBase64(encode(new Set(["evil.example", "bad.test", "x.weebly.com"])));
    expect(set.size).toBe(3);
    expect(set.has("evil.example")).toBe(true);
    expect(set.has("x.weebly.com")).toBe(true);
    expect(set.has("weebly.com")).toBe(false);
    expect(set.has("good.example")).toBe(false);
  });
});

describe("dataset builder", () => {
  const psl = new Map([["com", new Set(["com"])]]);

  it("lists registrable domains, but only exact hosts on shared hosting", () => {
    const hosts = [
      "login.evil.com",
      "pay.evil.com",
      ...Array.from({ length: 25 }, (_, i) => `site${i}.sharedhost.com`),
    ];
    const entries = buildEntries(hosts, { psl, excluded: new Set() });
    expect(entries.has("evil.com")).toBe(true);
    expect(entries.has("sharedhost.com")).toBe(false);
    expect(entries.has("site3.sharedhost.com")).toBe(true);
  });

  it("never lists an excluded (brand, free-mail, top-site) domain", () => {
    const entries = buildEntries(["phish.paypal.com", "x.gmail.com"], {
      psl,
      excluded: new Set(["paypal.com", "gmail.com"]),
    });
    expect([...entries]).toEqual([]);
  });
});
