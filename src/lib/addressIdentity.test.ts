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

describe("senderPattern", () => {
  it("turns machine-made parts into *", async () => {
    const { senderPattern, correctionKey } = await import("./addressIdentity");
    expect(senderPattern("bounce-8812@mail.shop.example")).toBe("bounce-*@mail.shop.example");
    expect(senderPattern("update+ab12cd@facebookmail.com")).toBe("update+*@facebookmail.com");
    expect(senderPattern("noreply.x7k2q9@notify.bank.example")).toBe("noreply.*@notify.bank.example");
    expect(senderPattern("Bounce-99@mail.shop.example")).toBe("bounce-*@mail.shop.example");
    expect(correctionKey("orders@target.com")).toBe("orders@target.com");
  });

  it("never widens a person's address or a whole domain", async () => {
    const { senderPattern } = await import("./addressIdentity");
    // Free mail is a person's mailbox.
    expect(senderPattern("sivaramchalla123@gmail.com")).toBe(null);
    // Every part would be *: that's the whole company.
    expect(senderPattern("rec38@asciigroup.com")).toBe(null);
    expect(senderPattern("name.lastname@target.com")).toBe(null);
    expect(senderPattern("orders@target.com")).toBe(null);
  });
});

describe("pattern corrections", () => {
  it("a correction saved for one bounce address covers its siblings, never the whole company", async () => {
    const { effectiveBucket } = await import("./sortTaxonomy");
    const { correctionKey } = await import("./addressIdentity");
    const overrides = { [correctionKey("bounce-8812@mail.shop.example")]: "finance" as const };
    expect(effectiveBucket("other", "mail.shop.example", "bounce-1203@mail.shop.example", overrides)).toBe("finance");
    expect(effectiveBucket("other", "mail.shop.example", "careers@mail.shop.example", overrides)).toBe(null);
  });

  it("patterns stay out of Gmail filter queries", async () => {
    const { categoryQueries } = await import("./categoryQueries");
    const q = categoryQueries("finance", { "bounce-*@mail.shop.example": "finance", "billing@shop.example": "finance" }).join(" ");
    expect(q).toContain("billing@shop.example");
    expect(q).not.toContain("*");
  });
});
