import { describe, expect, it } from "vitest";
import { AddressSet, canonicalAddress } from "./addressIdentity";

describe("canonicalAddress", () => {
  it("drops Gmail's dots and +tag and folds googlemail.com into gmail.com", () => {
    expect(canonicalAddress("Alice.B+news@GoogleMail.com")).toBe("aliceb@gmail.com");
    expect(canonicalAddress("a.l.i.c.e.b@gmail.com")).toBe("aliceb@gmail.com");
  });

  it("drops a +tag only where the provider supports one", () => {
    expect(canonicalAddress("alice+work@outlook.com")).toBe("alice@outlook.com");
    expect(canonicalAddress("al.ice@outlook.com")).toBe("al.ice@outlook.com");
    // Yahoo has no +tag alias: this is a different person.
    expect(canonicalAddress("alice+friend@yahoo.com")).toBe("alice+friend@yahoo.com");
    // An unknown domain is compared as written, apart from case.
    expect(canonicalAddress("Orders+X@Shop.example")).toBe("orders+x@shop.example");
  });

  it("drops Proton's dots, hyphens and underscores", () => {
    expect(canonicalAddress("a.l-i_ce+x@proton.me")).toBe("alice@proton.me");
  });

  it("leaves something that isn't an address alone", () => {
    expect(canonicalAddress("  @Host ")).toBe("@host");
    expect(canonicalAddress("+@gmail.com")).toBe("+@gmail.com");
  });
});

describe("AddressSet", () => {
  it("matches every spelling of a mailbox, from the constructor too", () => {
    const set = new AddressSet(["Alice.B@gmail.com"]);
    expect(set.has("aliceb+shop@googlemail.com")).toBe(true);
    expect(set.has("aliceb@yahoo.com")).toBe(false);
    set.delete("a.liceb@gmail.com");
    expect(set.size).toBe(0);
  });
});

describe("spellings in sorting and known senders", () => {
  it("a correction saved for one spelling covers the others, and older lowercase keys still work", async () => {
    const { effectiveBucket } = await import("./sortTaxonomy");
    expect(effectiveBucket("other", "gmail.com", "Ali.Ce+x@googlemail.com", { "alice@gmail.com": "jobs" })).toBe("jobs");
    expect(effectiveBucket("other", "yahoo.com", "Bob+x@yahoo.com", { "bob+x@yahoo.com": "finance" })).toBe("finance");
    expect(effectiveBucket("other", "yahoo.com", "bob+x@yahoo.com", { "bob@yahoo.com": "finance" })).toBe(null);
  });

  it("someone you wrote to is known under any spelling", async () => {
    const { knownSenderSet } = await import("./screener");
    const settings = { screenerAllowlist: [], sentCorrespondents: { addresses: ["sivaram.challa123@gmail.com"], fetchedAt: 0 } };
    const known = knownSenderSet(settings as unknown as Parameters<typeof knownSenderSet>[0]);
    expect(known.has("SivaramChalla123@gmail.com")).toBe(true);
    expect(known.has("sivaramchalla123@yahoo.com")).toBe(false);
  });
});
