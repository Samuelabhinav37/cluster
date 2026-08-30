// A static, in-repo set of known-bad domains: the hand-maintained
// BLOCKLIST_SEED unioned with the build-time-vendored URLhaus slice
// (data/malwareDomains.generated.json, refreshed by scripts/refresh-blocklist.mjs).
// Everything here is a committed copy -- nothing fetches at runtime, which
// keeps this consistent with the project's no-network / metadata-only
// stance. See threatSignals.ts for how a sender domain on this list becomes
// a signal, and linkMismatch.ts for the link-target check used by Deep scan.
import generated from "./data/malwareDomains.generated.json";
import { BLOCKLIST_SEED } from "./blocklistSeed";

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

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

  const isBlockedDomain = (domain: string): boolean => {
    const normalized = normalizeDomain(domain);
    if (!normalized) return false;
    if (set.has(normalized)) return true;
    // Walk parent labels so a subdomain of a blocked registrable domain
    // matches too: mail.evil.example -> evil.example. Stops before the final
    // single label, so a bare TLD on the list could never match everything.
    const labels = normalized.split(".");
    for (let i = 1; i < labels.length - 1; i++) {
      if (set.has(labels.slice(i).join("."))) return true;
    }
    return false;
  };

  return { isBlockedDomain, size: set.size };
}

const defaultBlocklist = createBlocklist([
  ...BLOCKLIST_SEED,
  ...(generated.domains as readonly string[]),
]);

/** True if `domain` (or a parent of it) is on the seed list or the vendored
 * URLhaus slice. */
export function isBlockedDomain(domain: string): boolean {
  return defaultBlocklist.isBlockedDomain(domain);
}
