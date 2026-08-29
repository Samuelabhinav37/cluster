import { describe, expect, it } from "vitest";
import { originPattern, parseListUnsubscribe } from "./unsubscribe";

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

  it("only sets postUrl when List-Unsubscribe-Post declares one-click support", () => {
    const withoutPost = parseListUnsubscribe("<https://example.com/unsub>", undefined);
    expect(withoutPost.postUrl).toBeUndefined();
    expect(withoutPost.httpUrl).toBe("https://example.com/unsub");

    const withPost = parseListUnsubscribe("<https://example.com/unsub>", "List-Unsubscribe=One-Click");
    expect(withPost.postUrl).toBe("https://example.com/unsub");
  });

  it("treats List-Unsubscribe-Post case-insensitively", () => {
    const info = parseListUnsubscribe("<https://example.com/unsub>", "list-unsubscribe=ONE-CLICK");
    expect(info.postUrl).toBe("https://example.com/unsub");
  });

  it("never sets postUrl for a mailto-only entry, even with one-click declared", () => {
    const info = parseListUnsubscribe("<mailto:unsub@example.com>", "List-Unsubscribe=One-Click");
    expect(info.postUrl).toBeUndefined();
  });
});

describe("originPattern", () => {
  it("builds a chrome.permissions-style origin pattern from a URL", () => {
    expect(originPattern("https://example.com/unsub?id=1")).toBe("https://example.com/*");
    expect(originPattern("http://sub.example.com/x")).toBe("http://sub.example.com/*");
  });
});
