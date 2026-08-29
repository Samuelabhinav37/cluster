import { describe, expect, it } from "vitest";
import { extractLinksFromHtml, findBlocklistedLinkTargets, findMismatchedLinks } from "./linkMismatch";

describe("extractLinksFromHtml", () => {
  it("extracts a plain anchor's text and href", () => {
    expect(extractLinksFromHtml('<a href="https://example.com">example.com</a>')).toEqual([
      { text: "example.com", href: "https://example.com" },
    ]);
  });

  it("strips nested markup from the visible text", () => {
    expect(extractLinksFromHtml('<a href="https://example.com"><b>example.com</b></a>')).toEqual([
      { text: "example.com", href: "https://example.com" },
    ]);
  });

  it("extracts multiple links", () => {
    const html = '<a href="https://a.example">a.example</a> and <a href="https://b.example">click here</a>';
    expect(extractLinksFromHtml(html)).toEqual([
      { text: "a.example", href: "https://a.example" },
      { text: "click here", href: "https://b.example" },
    ]);
  });

  it("skips an anchor with no visible text", () => {
    expect(extractLinksFromHtml('<a href="https://example.com"></a>')).toEqual([]);
  });

  it("returns an empty array for HTML with no anchors", () => {
    expect(extractLinksFromHtml("<p>No links here.</p>")).toEqual([]);
  });
});

describe("findMismatchedLinks", () => {
  it("flags a link whose displayed domain differs from its actual target", () => {
    const links = [{ text: "Verify at paypal.com", href: "https://paypal-secure.example/verify" }];
    expect(findMismatchedLinks(links)).toEqual([
      { text: "Verify at paypal.com", href: "https://paypal-secure.example/verify", displayedDomain: "paypal.com", actualDomain: "paypal-secure.example" },
    ]);
  });

  it("does not flag a link where the displayed domain matches the actual one", () => {
    expect(findMismatchedLinks([{ text: "paypal.com", href: "https://paypal.com/login" }])).toEqual([]);
  });

  it("does not flag a link to a legitimate subdomain of the displayed domain", () => {
    expect(findMismatchedLinks([{ text: "paypal.com", href: "https://accounts.paypal.com/login" }])).toEqual([]);
  });

  it("does not flag a link whose text has no domain-shaped substring at all", () => {
    expect(findMismatchedLinks([{ text: "Click here to verify", href: "https://evil.example" }])).toEqual([]);
  });

  it("skips a non-URL href (mailto:) without throwing", () => {
    expect(findMismatchedLinks([{ text: "contact@example.com", href: "mailto:contact@example.com" }])).toEqual([]);
  });

  it("does not flag a domain-shaped token that is really an email-address host in the visible text", () => {
    expect(
      findMismatchedLinks([{ text: "Email us at support@paypal.com", href: "https://help.example/contact" }])
    ).toEqual([]);
  });

  it("flags only the mismatched links out of a mixed set", () => {
    const links = [
      { text: "Click here", href: "https://evil.example" },
      { text: "amazon.com", href: "https://not-amazon.example" },
    ];
    const result = findMismatchedLinks(links);
    expect(result).toHaveLength(1);
    expect(result[0].displayedDomain).toBe("amazon.com");
  });
});

describe("findBlocklistedLinkTargets", () => {
  const isBlocked = (d: string) => d === "malware.example" || d === "phish.example";

  it("returns the distinct blocked http(s) hosts among the links", () => {
    const links = [
      { text: "a", href: "https://malware.example/x" },
      { text: "b", href: "http://phish.example/" },
      { text: "c", href: "https://safe.example/" },
      { text: "d", href: "https://malware.example/y" },
    ];
    expect(findBlocklistedLinkTargets(links, isBlocked).sort()).toEqual(["malware.example", "phish.example"]);
  });

  it("ignores non-http(s) and unparseable hrefs", () => {
    const links = [
      { text: "e", href: "mailto:x@malware.example" },
      { text: "f", href: "not a url" },
    ];
    expect(findBlocklistedLinkTargets(links, isBlocked)).toEqual([]);
  });

  it("returns an empty array when nothing is blocked", () => {
    expect(findBlocklistedLinkTargets([{ text: "g", href: "https://safe.example" }], isBlocked)).toEqual([]);
  });
});
