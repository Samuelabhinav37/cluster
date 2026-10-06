import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpamList, isSpamDomain, refreshSpamList } from "./spamList";

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

describe("refreshSpamList", () => {
  function makeFakeChromeStorage() {
    let store: Record<string, unknown> = {};
    return {
      local: {
        async get(key: string) {
          return key in store ? { [key]: store[key] } : {};
        },
        async set(items: Record<string, unknown>) {
          store = { ...store, ...items };
        },
      },
    };
  }

  beforeEach(() => {
    (globalThis as any).chrome = { storage: makeFakeChromeStorage() };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds live-fetched domains on top of the bundled seed/disposable slice without replacing it", async () => {
    expect(isSpamDomain("live-only-spam.example")).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(["live-only-spam.example"]), { status: 200 })),
    );
    expect(await refreshSpamList("")).toBe(true);
    expect(isSpamDomain("live-only-spam.example")).toBe(true);
  });

  it("leaves the existing list untouched when the fetch response isn't a string array", async () => {
    // A domain distinct from the previous test's -- defaultSpamList is
    // module-level state that isn't reset between tests in this file.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ not: "a list" }), { status: 200 })),
    );
    expect(await refreshSpamList("")).toBe(false);
    expect(isSpamDomain("another-live-spam.example")).toBe(false);
  });
});
