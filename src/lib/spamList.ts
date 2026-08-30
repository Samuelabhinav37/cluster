// A static, in-repo set of spam / throwaway-mailbox sender domains: the
// hand-maintained SPAM_SEED unioned with the build-time-vendored slice
// (data/spamDomains.generated.json -- disposable-email-domains + a sample of
// StopForumSpam's toxic domains, refreshed by scripts/refresh-spam-domains.mjs).
// Everything here is a committed copy -- nothing fetches at runtime, matching
// the project's no-network / metadata-only stance.
//
// This list drives the "Suggested spam" section of the Clean up tab
// (see spamSuggestions.ts). It is deliberately separate from blocklist.ts,
// which is the malware/phishing list feeding threat detection.
import generated from "./data/spamDomains.generated.json";
import { SPAM_SEED } from "./spamSeed";

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

/** Builds a matcher over an explicit domain set -- exported so tests can
 * exercise the matching logic without depending on the real vendored data. */
export function createSpamList(domains: Iterable<string>): {
  isSpamDomain: (domain: string) => boolean;
  size: number;
} {
  const set = new Set<string>();
  for (const domain of domains) {
    const normalized = normalizeDomain(domain);
    if (normalized) set.add(normalized);
  }

  const isSpamDomain = (domain: string): boolean => {
    const normalized = normalizeDomain(domain);
    if (!normalized) return false;
    if (set.has(normalized)) return true;
    // Walk parent labels so a subdomain of a listed registrable domain matches
    // too: promo.spammer.example -> spammer.example. Stops before the final
    // single label, so a bare TLD on the list could never match everything.
    const labels = normalized.split(".");
    for (let i = 1; i < labels.length - 1; i++) {
      if (set.has(labels.slice(i).join("."))) return true;
    }
    return false;
  };

  return { isSpamDomain, size: set.size };
}

const defaultSpamList = createSpamList([
  ...SPAM_SEED,
  ...(generated.domains as readonly string[]),
]);

/** True if `domain` (or a parent of it) is on the seed list or the vendored
 * disposable / StopForumSpam slice. */
export function isSpamDomain(domain: string): boolean {
  return defaultSpamList.isSpamDomain(domain);
}

export function spamListSize(): number {
  return defaultSpamList.size;
}
