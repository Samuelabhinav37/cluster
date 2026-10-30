import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  applyBrandVerdicts,
  certifiedCompaniesForBrand,
  companyForDomain,
  setBrandRegistry,
  type BrandRegistry,
} from "./brandRegistry";
import { scoreMessageForThreats, setBrandDomainSource } from "./threatSignals";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import registryData from "../../public/data/brand-registry.json";
import publicSuffixData from "../../public/data/public-suffix.json";
import { setPublicSuffixRules } from "./publicSuffix";

const registry = registryData as unknown as BrandRegistry;

function message(fromDisplayName: string, fromAddress: string): NormalizedMessageMetadata {
  return {
    id: "1",
    provider: "gmail",
    fromAddress,
    fromDisplayName,
    replyToAddress: "",
    subject: "Your order",
    isProtected: false,
    unread: false,
    sizeBytes: 0,
    unsubscribe: {},
    receivedAt: 0,
  };
}

const kinds = (name: string, from: string) => scoreMessageForThreats(message(name, from)).map((s) => s.kind);

beforeAll(() => setPublicSuffixRules(publicSuffixData));
afterEach(() => setBrandRegistry(null));

describe("brand registry", () => {
  it("finds the certified company behind a domain or its subdomain", () => {
    setBrandRegistry(registry);
    expect(companyForDomain("chase.com")).toMatchObject({
      trust: "certified",
      name: expect.stringMatching(/JPMorgan Chase/),
    });
    expect(companyForDomain("alerts.chase.com")?.name).toMatch(/JPMorgan Chase/);
    expect(companyForDomain("chase-alerts.com")).toBeUndefined();
    expect(certifiedCompaniesForBrand("chase").map((c) => c.name)).toContainEqual(
      expect.stringMatching(/JPMorgan Chase/),
    );
  });

  it("a certified domain the hand list missed stops reading as a fake Amazon", () => {
    expect(kinds("Amazon", "pedidos@amazon.com.br")).toContain("brand-impersonation");
    setBrandRegistry(registry);
    expect(kinds("Amazon", "pedidos@amazon.com.br")).toEqual([]);
    expect(kinds("Amazon", "pedidos@amazon-orders.example")).toContain("brand-impersonation");
  });

  it("can only widen brands the hand list already knows", () => {
    setBrandRegistry({
      issuers: [],
      companies: [
        {
          id: "evil.example",
          name: "Totally PayPal",
          trust: "listed",
          brand: "not-a-brand",
          domains: ["evil.example"],
        },
      ],
    });
    expect(kinds("PayPal", "service@evil.example")).toContain("brand-impersonation");
    // A patch naming an unknown brand is dropped whole, not partly applied.
    setBrandDomainSource("local", { paypal: ["evil.example"], "new brand": ["x.example"] });
    expect(kinds("PayPal", "service@evil.example")).toContain("brand-impersonation");
    setBrandDomainSource("local", { paypal: ["paypal-real.example"] });
    expect(kinds("PayPal", "service@paypal-real.example")).not.toContain("brand-impersonation");
    setBrandDomainSource("local", {});
  });

  it("your Real verdict makes a domain the brand's own; Fake changes nothing", () => {
    expect(kinds("PayPal", "service@paypal-mail.example")).toContain("brand-impersonation");
    applyBrandVerdicts({ "paypal-mail.example": { brand: "paypal", verdict: "fake", by: "you", at: 0 } });
    expect(kinds("PayPal", "service@paypal-mail.example")).toContain("brand-impersonation");
    applyBrandVerdicts({ "paypal-mail.example": { brand: "paypal", verdict: "real", by: "you", at: 0 } });
    expect(kinds("PayPal", "service@paypal-mail.example")).not.toContain("brand-impersonation");
    applyBrandVerdicts(undefined);
    expect(kinds("PayPal", "service@paypal-mail.example")).toContain("brand-impersonation");
  });
});
