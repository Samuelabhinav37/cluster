import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasVerifiedOneClickSignature,
  isAllowedOneClickUrl,
  originPattern,
  listUnsubscribeItems,
  parseListUnsubscribe,
  parseMailto,
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

describe("hasVerifiedOneClickSignature: planted results", () => {
  it("ignores a dkim pass planted after a semicolon inside a comment", () => {
    expect(
      hasVerifiedOneClickSignature({
        ...verified,
        authenticationResults: [
          "mx.google.com; spf=pass (domain of x;dkim=pass header.d=example.com x@evil.example) " +
            "smtp.mailfrom=x@evil.example; dkim=fail header.d=evil.example",
        ],
      }),
    ).toBe(false);
  });

  it("ignores a dkim pass planted inside a quoted envelope sender", () => {
    expect(
      hasVerifiedOneClickSignature({
        ...verified,
        authenticationResults: [
          'mx.google.com; spf=pass smtp.mailfrom="x;dkim=pass header.d=example.com x"@evil.example; dkim=none',
        ],
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

describe("listUnsubscribeItems (RFC 2369)", () => {
  it("keeps commas inside a URL and drops whitespace inside the brackets", () => {
    expect(listUnsubscribeItems("<https://x.example/u?l=a,b>, <mailto:u@x.example>")).toEqual([
      "https://x.example/u?l=a,b",
      "mailto:u@x.example",
    ]);
    expect(listUnsubscribeItems("<https://x.example/very/\r\n long>")).toEqual(["https://x.example/very/long"]);
  });

  it("stops at the first item that isn't well formed", () => {
    expect(listUnsubscribeItems("<mailto:a@x.example>, junk, <https://x.example/u>")).toEqual(["mailto:a@x.example"]);
    expect(listUnsubscribeItems("<https://x.example/u")).toEqual([]);
  });

  it("keeps the first mailto, not the last", () => {
    const info = parseListUnsubscribe("<mailto:first@x.example>, <mailto:second@x.example>", undefined);
    expect(info.mailtoParts?.to).toBe("first@x.example");
  });
});

describe("parseMailto (RFC 6068)", () => {
  it("reads the address, subject and body, decoding once", () => {
    expect(parseMailto("mailto:list-leave@x.example?subject=unsubscribe%20me&body=leave%0D%0Anow")).toEqual({
      to: "list-leave@x.example",
      subject: "unsubscribe me",
      body: "leave\r\nnow",
    });
    expect(parseMailto("mailto:a+b@x.example?subject=a+b")).toEqual({ to: "a+b@x.example", subject: "a+b" });
    expect(parseMailto("mailto:u@x.example?subject=%2520")).toEqual({ to: "u@x.example", subject: "%20" });
  });

  it("refuses anything that would add recipients or headers", () => {
    expect(parseMailto("mailto:a@x.example,b@x.example")).toBeUndefined();
    expect(parseMailto("mailto:a@x.example?cc=victim@y.example")).toBeUndefined();
    expect(parseMailto("mailto:a@x.example?bcc=victim@y.example")).toBeUndefined();
    expect(parseMailto("mailto:a@x.example?to=victim@y.example")).toBeUndefined();
    expect(parseMailto("mailto:a@x.example?attach=/etc/passwd")).toBeUndefined();
    expect(parseMailto("mailto:a@x.example?subject=hi%0D%0ABcc:%20v@y.example")).toBeUndefined();
  });

  it("refuses malformed addresses and encodings", () => {
    expect(parseMailto("mailto:")).toBeUndefined();
    expect(parseMailto("mailto:not-an-address")).toBeUndefined();
    expect(parseMailto("mailto:a@x.example?subject=%E0%A4%A")).toBeUndefined();
    expect(parseMailto("https://x.example")).toBeUndefined();
  });
});
