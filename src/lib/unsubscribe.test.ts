import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasVerifiedOneClickSignature,
  isAllowedOneClickUrl,
  originPattern,
  parseListUnsubscribe,
  fireOneClickUnsubscribe,
  type OneClickVerificationContext,
} from "./unsubscribe";

const verified: OneClickVerificationContext = {
  provider: "gmail",
  fromAddress: "news@example.com",
  authenticationResults: [
    "mx.google.com; dkim=pass header.i=@example.com header.d=example.com header.s=mail",
  ],
  dkimSignatures: [
    "v=1; d=example.com; s=mail; h=from:subject:list-unsubscribe:list-unsubscribe-post; b=abc",
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseListUnsubscribe", () => {
  it("returns an empty info when there is no header", () => {
    expect(parseListUnsubscribe(undefined, undefined)).toEqual({});
  });

  it("parses a mailto entry", () => {
    const info = parseListUnsubscribe("<mailto:unsub@example.com>", undefined);
    expect(info.mailto).toBe("mailto:unsub@example.com");
    expect(info.httpUrl).toBeUndefined();
    expect(info.postUrl).toBeUndefined();
  });

  it("parses multiple comma-separated entries, keeping both mailto and http", () => {
    const info = parseListUnsubscribe(
      "<mailto:unsub@example.com>, <https://example.com/unsub?id=1>",
      undefined,
    );
    expect(info.mailto).toBe("mailto:unsub@example.com");
    expect(info.httpUrl).toBe("https://example.com/unsub?id=1");
  });

  it("ignores malformed entries that aren't wrapped in angle brackets", () => {
    const info = parseListUnsubscribe("https://example.com/unsub", undefined);
    expect(info.httpUrl).toBeUndefined();
  });

  it("drops a plain http:// link but still keeps a mailto from the same header", () => {
    const info = parseListUnsubscribe(
      "<http://example.com/unsub?id=1>, <mailto:unsub@example.com>",
      "List-Unsubscribe=One-Click",
    );
    expect(info.httpUrl).toBeUndefined();
    expect(info.postUrl).toBeUndefined();
    expect(info.mailto).toBe("mailto:unsub@example.com");
  });

  it("only sets postUrl when one-click is declared and provider-trusted DKIM covers both headers", () => {
    const withoutPost = parseListUnsubscribe("<https://example.com/unsub>", undefined);
    expect(withoutPost.postUrl).toBeUndefined();
    expect(withoutPost.httpUrl).toBe("https://example.com/unsub");

    const declaredOnly = parseListUnsubscribe("<https://example.com/unsub>", "List-Unsubscribe=One-Click");
    expect(declaredOnly.postUrl).toBeUndefined();

    const withPost = parseListUnsubscribe(
      "<https://example.com/unsub>",
      "List-Unsubscribe=One-Click",
      verified,
    );
    expect(withPost.postUrl).toBe("https://example.com/unsub");
  });

  it("treats List-Unsubscribe-Post case-insensitively", () => {
    const info = parseListUnsubscribe("<https://example.com/unsub>", "list-unsubscribe=ONE-CLICK", verified);
    expect(info.postUrl).toBe("https://example.com/unsub");
  });

  it("requires the exact RFC 8058 key/value declaration", () => {
    const info = parseListUnsubscribe(
      "<https://example.com/unsub>",
      "X-List-Unsubscribe=One-Click",
      verified,
    );
    expect(info.postUrl).toBeUndefined();
  });

  it("never sets postUrl for a mailto-only entry, even with one-click declared", () => {
    const info = parseListUnsubscribe("<mailto:unsub@example.com>", "List-Unsubscribe=One-Click");
    expect(info.postUrl).toBeUndefined();
  });
});

describe("hasVerifiedOneClickSignature", () => {
  it("rejects forged Authentication-Results and signatures missing a required header", () => {
    expect(
      hasVerifiedOneClickSignature({
        ...verified,
        authenticationResults: ["attacker.example; dkim=pass header.d=example.com"],
      }),
    ).toBe(false);
    expect(
      hasVerifiedOneClickSignature({
        ...verified,
        dkimSignatures: ["v=1; d=example.com; h=from:list-unsubscribe; b=abc"],
      }),
    ).toBe(false);
  });
});

describe("isAllowedOneClickUrl", () => {
  it("accepts ordinary HTTPS endpoints", () => {
    expect(isAllowedOneClickUrl("https://example.com/unsubscribe?id=1")).toBe(true);
  });

  it("rejects credentials, non-default ports, plaintext, localhost, and private IPs", () => {
    expect(isAllowedOneClickUrl("http://example.com/u")).toBe(false);
    expect(isAllowedOneClickUrl("https://user:pass@example.com/u")).toBe(false);
    expect(isAllowedOneClickUrl("https://example.com:8443/u")).toBe(false);
    expect(isAllowedOneClickUrl("https://localhost/u")).toBe(false);
    expect(isAllowedOneClickUrl("https://127.0.0.1/u")).toBe(false);
    expect(isAllowedOneClickUrl("https://192.168.1.2/u")).toBe(false);
    expect(isAllowedOneClickUrl("https://[::1]/u")).toBe(false);
  });
});

describe("originPattern", () => {
  it("builds a chrome.permissions-style origin pattern from a URL", () => {
    expect(originPattern("https://example.com/unsub?id=1")).toBe("https://example.com/*");
  });
});

describe("fireOneClickUnsubscribe", () => {
  it("posts without credentials, referrer, or redirects", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("chrome", {
      permissions: {
        contains: vi.fn(async () => true),
        request: vi.fn(async () => true),
      },
    });

    await expect(fireOneClickUnsubscribe("https://example.com/u")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/u",
      expect.objectContaining({
        method: "POST",
        body: "List-Unsubscribe=One-Click",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      }),
    );
  });
});
