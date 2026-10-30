// The brand registry: company names, the domains they really send from, and
// their logos, built by scripts/refresh-brands.mjs into public/data/.
//
//   - "certified" companies come from BIMI mark certificates, where a CA
//     checked the trademark before binding name + domains + logo together.
//   - "listed" companies come from Wikidata, only for hand-list brands with
//     no certificate.
//
// Loaded once with loadBrandRegistry(), like the Public Suffix List. On load
// it widens the hand list's brands (threatSignals.ts) with every domain the
// registry ties to them, so a real eBay or Google domain the hand list
// missed stops reading as a fake. It never adds a brand: matching a display
// name to a brand stays the hand list's job.
import { isSameOrSubdomain, normalizeDomain } from "./registrableDomain";
import { baseBrandDomains, setBrandDomainSource } from "./threatSignals";

export interface RegistryCompany {
  /** Stable key, also the key into brand-logos.json. */
  id: string;
  /** Legal name from the certificate, or the Wikidata label. */
  name: string;
  trust: "certified" | "listed";
  domains: string[];
  /** Hand-list brand a listed company was looked up for. */
  brand?: string;
  ca?: string;
  /** "US 2015389": trademark office and registration number. */
  trademark?: string;
  logo?: boolean;
}

/** A CA that issues mark certificates, with the key that signs them. */
export interface RegistryIssuer {
  ca: string;
  name: string;
  /** DER SubjectPublicKeyInfo, base64. */
  spki: string;
}

export interface BrandRegistry {
  issuers: RegistryIssuer[];
  companies: RegistryCompany[];
}

let registry: BrandRegistry | null = null;
let byDomain = new Map<string, RegistryCompany>();

function isBrandRegistry(data: unknown): data is BrandRegistry {
  const d = data as BrandRegistry | null;
  return (
    Array.isArray(d?.issuers) &&
    Array.isArray(d?.companies) &&
    d.companies.every((c) => typeof c?.id === "string" && typeof c.name === "string" && Array.isArray(c.domains))
  );
}

/** The hand-list brand each registry company belongs to, if any. */
function brandOf(company: RegistryCompany, base: Readonly<Record<string, string[]>>): string | undefined {
  if (company.trust === "listed") return company.brand;
  return Object.keys(base).find((brand) =>
    base[brand].some((own) => company.domains.some((d) => isSameOrSubdomain(d, own) || isSameOrSubdomain(own, d))),
  );
}

export function setBrandRegistry(data: BrandRegistry | null): void {
  registry = data;
  byDomain = new Map();
  const base = baseBrandDomains();
  const patch: Record<string, string[]> = {};
  for (const company of data?.companies ?? []) {
    for (const domain of company.domains) byDomain.set(normalizeDomain(domain), company);
    const brand = brandOf(company, base);
    if (brand && brand in base) (patch[brand] ??= []).push(...company.domains);
  }
  setBrandDomainSource("registry", patch);
}

/** Loads the bundled registry once. Never throws; outside an extension it
 * does nothing and the hand list works on its own. */
let loading: Promise<boolean> | null = null;
export function loadBrandRegistry(): Promise<boolean> {
  if (registry) return Promise.resolve(true);
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return Promise.resolve(false);
  loading ??= (async () => {
    try {
      const data: unknown = await (await fetch(chrome.runtime.getURL("data/brand-registry.json"))).json();
      if (!isBrandRegistry(data)) return false;
      setBrandRegistry(data);
      return true;
    } catch {
      return false;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** The company that owns `domain` or a parent of it (reply.ebay.ca → eBay). */
export function companyForDomain(domain: string): RegistryCompany | undefined {
  const labels = normalizeDomain(domain).split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const company = byDomain.get(labels.slice(i).join("."));
    if (company) return company;
  }
  return undefined;
}

/** Certified companies behind a hand-list brand ("chase" → JPMorgan Chase & Co.). */
export function certifiedCompaniesForBrand(brand: string): RegistryCompany[] {
  const base = baseBrandDomains();
  return (registry?.companies ?? []).filter((c) => c.trust === "certified" && brandOf(c, base) === brand);
}

export function registryIssuers(): RegistryIssuer[] {
  return registry?.issuers ?? [];
}

let logos: Promise<Record<string, string>> | null = null;
/** The company's certified logo as SVG text, loaded on first use. */
export async function companyLogo(company: RegistryCompany): Promise<string | undefined> {
  if (!company.logo || typeof chrome === "undefined" || !chrome.runtime?.getURL) return undefined;
  logos ??= fetch(chrome.runtime.getURL("data/brand-logos.json"))
    .then((r) => r.json() as Promise<{ logos: Record<string, string> }>)
    .then((d) => d.logos ?? {})
    .catch(() => ({}));
  return (await logos)[company.id];
}
