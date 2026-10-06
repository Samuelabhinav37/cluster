// A static, in-repo set of known-bad domains: the hand-maintained
// BLOCKLIST_SEED unioned with the build-time-vendored URLhaus slice
// (data/malwareDomains.generated.json, refreshed by scripts/refresh-blocklist.mjs).
// Everything here is a committed copy -- nothing fetches at runtime, which
// keeps this consistent with the project's no-network / metadata-only
// stance. See threatSignals.ts for how a sender domain on this list becomes
// a signal, and linkMismatch.ts for the link-target check used by Deep scan.
import generated from "./data/malwareDomains.generated.json";
import { BLOCKLIST_SEED } from "./blocklistSeed";
import { domainMatchesSet, normalizeDomain } from "./registrableDomain";
import { getDataset, refreshDataset } from "./remoteDataset";

/** Builds a matcher over an explicit domain set -- exported so tests can
 * exercise the matching logic without depending on the real vendored data. */
export function createBlocklist(domains: Iterable<string>): {
  isBlockedDomain: (domain: string) => boolean;
  size: number;
} {
  const set = new Set<string>();
  for (const domain of domains) {
    const normalized = normalizeDomain(domain);
    if (normalized) set.add(normalized);
  }

  // domainMatchesSet walks parent labels so a subdomain of a blocked
  // registrable domain matches too: mail.evil.example -> evil.example.
  const isBlockedDomain = (domain: string): boolean => domainMatchesSet(domain, set);

  return { isBlockedDomain, size: set.size };
}

const bundledDomains = [...BLOCKLIST_SEED, ...(generated.domains as readonly string[])];
let defaultBlocklist = createBlocklist(bundledDomains);

function isValidDomainList(data: unknown): data is string[] {
  return Array.isArray(data) && data.every((d) => typeof d === "string");
}

// Hydrate from any existing cache at module load -- local only, never blocks
// on network. A live-published copy of this same feed only ever ADDS
// domains on top of the bundled seed+URLhaus slice, never replaces it.
void getDataset<string[]>("malwareDomains", []).then((extra) => {
  if (isValidDomainList(extra) && extra.length > 0) {
    defaultBlocklist = createBlocklist([...bundledDomains, ...extra]);
  }
});

/** Called by the background alarm on a schedule (see background.ts) -- never
 * from the interactive scan path. Returns whether the cache changed. */
export async function refreshMalwareBlocklist(publicKeyB64?: string): Promise<boolean> {
  const updated = await refreshDataset("malwareDomains", "malwareDomains.json", isValidDomainList, "block", publicKeyB64);
  if (updated) {
    const extra = await getDataset<string[]>("malwareDomains", []);
    if (isValidDomainList(extra)) defaultBlocklist = createBlocklist([...bundledDomains, ...extra]);
  }
  return updated;
}

/** True if `domain` (or a parent of it) is on the seed list, the vendored
 * URLhaus slice, or the live-refreshed copy of the same feed. */
export function isBlockedDomain(domain: string): boolean {
  return defaultBlocklist.isBlockedDomain(domain);
}
