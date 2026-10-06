import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBlocklist, isBlockedDomain, refreshMalwareBlocklist } from "./blocklist";

describe("createBlocklist", () => {
  const { isBlockedDomain } = createBlocklist([
    "evil.example",
    "Bad-Domain.TEST",
    "phish.co.uk",
    "trailing.example.",
  ]);

  it("matches an exact domain, case-insensitively", () => {
    expect(isBlockedDomain("evil.example")).toBe(true);
    expect(isBlockedDomain("EVIL.example")).toBe(true);
    expect(isBlockedDomain("bad-domain.test")).toBe(true);
  });

  it("matches a subdomain of a blocked registrable domain", () => {
    expect(isBlockedDomain("login.evil.example")).toBe(true);
    expect(isBlockedDomain("a.b.phish.co.uk")).toBe(true);
  });

  it("normalises a leading www. and a trailing dot", () => {
    expect(isBlockedDomain("www.evil.example")).toBe(true);
    expect(isBlockedDomain("trailing.example")).toBe(true);
  });

  it("does not match an unrelated domain or a bare parent TLD", () => {
    expect(isBlockedDomain("evil.example.org")).toBe(false);
    expect(isBlockedDomain("notevil.example")).toBe(false);
    expect(isBlockedDomain("example")).toBe(false);
    expect(isBlockedDomain("")).toBe(false);
  });

  it("de-duplicates when reporting its size", () => {
    expect(createBlocklist(["a.example", "a.example", "b.example"]).size).toBe(2);
  });
});

describe("refreshMalwareBlocklist", () => {
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

  it("refuses an unsigned list now that the shipped build has a signing key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith(".sig") ? new Response("missing", { status: 404 }) : new Response(JSON.stringify(["gmail.com"]), { status: 200 }),
      ),
    );
    expect(await refreshMalwareBlocklist()).toBe(false);
    expect(isBlockedDomain("gmail.com")).toBe(false);
  });

  it("adds live-fetched domains on top of the bundled seed/URLhaus slice without replacing it", async () => {
    expect(isBlockedDomain("live-only-bad.example")).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(["live-only-bad.example"]), { status: 200 })),
    );
    expect(await refreshMalwareBlocklist("")).toBe(true);
    expect(isBlockedDomain("live-only-bad.example")).toBe(true);
  });

  it("leaves the existing list untouched when the fetch response isn't a string array", async () => {
    // A domain distinct from the previous test's -- defaultBlocklist is
    // module-level state that isn't reset between tests in this file.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ not: "a list" }), { status: 200 })),
    );
    expect(await refreshMalwareBlocklist("")).toBe(false);
    expect(isBlockedDomain("another-live-bad.example")).toBe(false);
  });
});
