import { describe, expect, it } from "vitest";
import { isPublicHttpsUrl } from "./netGuard";

describe("isPublicHttpsUrl", () => {
  it("accepts ordinary public https URLs", () => {
    expect(isPublicHttpsUrl("https://example.com/x")).toBe(true);
    expect(isPublicHttpsUrl("https://sub.example.co.uk/a/b?c=1")).toBe(true);
    expect(isPublicHttpsUrl("https://example.com:443/x")).toBe(true);
  });

  it("accepts an internal DNS name that is not an address literal", () => {
    expect(isPublicHttpsUrl("https://athena.corp.internal/events")).toBe(true);
  });

  it("rejects non-https, embedded credentials, and non-443 ports by default", () => {
    expect(isPublicHttpsUrl("http://example.com/x")).toBe(false);
    expect(isPublicHttpsUrl("https://user:pass@example.com/x")).toBe(false);
    expect(isPublicHttpsUrl("https://example.com:8443/x")).toBe(false);
  });

  it("permits a non-standard port only when asked", () => {
    expect(isPublicHttpsUrl("https://example.com:8443/x", { allowNonStandardPort: true })).toBe(true);
  });

  it("rejects loopback, link-local, CGNAT, and RFC 1918 literals", () => {
    for (const url of [
      "https://localhost/x",
      "https://api.localhost/x",
      "https://127.0.0.1/x",
      "https://0.0.0.0/x",
      "https://10.1.2.3/x",
      "https://192.168.0.1/x",
      "https://172.16.0.1/x",
      "https://169.254.169.254/x",
      "https://100.64.0.1/x",
      "https://[::1]/x",
      "https://[fd00::1]/x",
      "https://[fe80::1]/x",
    ]) {
      expect(isPublicHttpsUrl(url), url).toBe(false);
    }
  });

  it("still rejects a private host when a non-standard port is allowed", () => {
    expect(isPublicHttpsUrl("https://169.254.169.254:8443/x", { allowNonStandardPort: true })).toBe(
      false,
    );
  });

  it("rejects unparseable input", () => {
    expect(isPublicHttpsUrl("not a url")).toBe(false);
    expect(isPublicHttpsUrl("")).toBe(false);
  });
});
