import { describe, expect, it } from "vitest";
import { createSpamList } from "./spamList";

describe("createSpamList", () => {
  const list = createSpamList(["Mailinator.com", "guerrillamail.com", "spammer.example", ""]);

  it("matches an exact domain, case- and www-insensitively", () => {
    expect(list.isSpamDomain("mailinator.com")).toBe(true);
    expect(list.isSpamDomain("MAILINATOR.COM")).toBe(true);
    expect(list.isSpamDomain("www.mailinator.com")).toBe(true);
    expect(list.isSpamDomain("mailinator.com.")).toBe(true);
  });

  it("matches a subdomain of a listed registrable domain", () => {
    expect(list.isSpamDomain("promo.spammer.example")).toBe(true);
    expect(list.isSpamDomain("a.b.spammer.example")).toBe(true);
  });

  it("does not match a different domain or a superstring", () => {
    expect(list.isSpamDomain("gmail.com")).toBe(false);
    expect(list.isSpamDomain("notmailinator.com")).toBe(false);
    expect(list.isSpamDomain("spammer.example.co")).toBe(false);
  });

  it("ignores empty input", () => {
    expect(list.isSpamDomain("")).toBe(false);
    expect(list.size).toBe(3);
  });
});
