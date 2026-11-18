import { describe, expect, it } from "vitest";
import generated from "./data/phishingHosts.generated.json";
import { isBadLinkHost, isPhishingHost, usePhishingHostsForTest } from "./phishingHosts";

describe("phishing hosts", () => {
  it("match a listed host and its subdomains, never a brand's own domain", () => {
    usePhishingHostsForTest(generated.domains);
    const host = generated.domains[0];
    expect(isPhishingHost(host)).toBe(true);
    expect(isPhishingHost(`login.${host}`)).toBe(true);
    for (const safe of ["google.com", "sites.google.com", "paypal.com", "gmail.com"]) expect(isBadLinkHost(safe), safe).toBe(false);
  });
});
