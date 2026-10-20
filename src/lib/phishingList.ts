// Known phishing domains from Phishing.Database (MIT,
// github.com/Phishing-Database/Phishing.Database), published weekly as a
// signed dataset beside the others (publish-datasets.yml,
// scripts/refresh-phishing-domains.mjs). Too large to bundle (about 300,000
// domains), so it ships as a sorted set of 53-bit hashes and nothing is
// bundled: until the first refresh, nothing matches.
//
// Entries are registrable domains, except on shared hosting (weebly.com,
// glitch.me, 000webhostapp.com, ...), where only the exact phishing host is
// listed, so ordinary mail from those platforms never matches. The refresh
// script also drops any brand, free-mail or top-site domain, and a hit is a
// strong signal that still needs a second one to hold mail (verdict.ts):
// a bad publish can raise warnings, not quarantine mail on its own.
import { HashedDomainSet } from "./domainHash";
import { normalizeDomain } from "./registrableDomain";
import { getDataset, refreshDataset } from "./remoteDataset";

export interface PhishingDataset {
  v: 1;
  hash: "cyrb53";
  count: number;
  /** base64 of a sorted Float64Array of cyrb53 hashes. */
  data: string;
}

function isPhishingDataset(value: unknown): value is PhishingDataset {
  const d = value as Partial<PhishingDataset> | null;
  return Boolean(d) && d?.v === 1 && d.hash === "cyrb53" && typeof d.data === "string" && typeof d.count === "number";
}

let set: HashedDomainSet | null = null;

function load(dataset: unknown): void {
  if (!isPhishingDataset(dataset)) return;
  try {
    set = HashedDomainSet.fromBase64(dataset.data);
  } catch {
    // A malformed payload leaves the previous set in place.
  }
}

// Local only, at module load: never waits on the network.
void getDataset<unknown>("phishingDomains", null).then(load);

/** Called by the background alarm (background.ts). Returns whether it changed. */
export async function refreshPhishingList(publicKeyB64?: string): Promise<boolean> {
  const updated = await refreshDataset("phishingDomains", "phishingDomains.json", isPhishingDataset, "block", publicKeyB64);
  if (updated) load(await getDataset<unknown>("phishingDomains", null));
  return updated;
}

/** For tests: replace the loaded set. */
export function setPhishingListForTests(next: HashedDomainSet | null): void {
  set = next;
}

/** True if `domain` or one of its parents is a listed phishing domain. */
export function isPhishingDomain(domain: string): boolean {
  if (!set) return false;
  // The last 16 labels cover any real sender; a hostile 4,000-label name
  // must not cost more.
  const labels = normalizeDomain(domain).split(".").filter(Boolean).slice(-16);
  // Walk parents (a.b.evil.example -> b.evil.example -> evil.example), but
  // never test a bare TLD.
  for (let i = 0; i < labels.length - 1; i++) {
    if (set.has(labels.slice(i).join("."))) return true;
  }
  return false;
}
