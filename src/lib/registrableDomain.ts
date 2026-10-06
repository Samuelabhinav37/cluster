// Shared domain-matching primitives. Before this module existed, four
// call sites each re-implemented some version of "does domain X match
// domain Y, or a parent label of X" independently: blocklist.ts's
// parent-walk over a Set, domainCategories.ts's identical walk over a Map,
// and threatSignals.ts's isSameOrSubdomain pairwise check. rules.ts's
// fromDomain condition had no such logic at all -- it was exact-match only,
// so a "from @amazon.com" rule never matched a sender at email.amazon.com.
// This module is the one implementation the others now call, so the three
// independent-but-equivalent versions can't drift, and the one real gap
// (rules.ts) gets the same correct behaviour for free.

import { registrableDomainOf } from "./publicSuffix";

export function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

/** True if `domain` is exactly `candidate`, or a subdomain of it --
 * mail.evil.example is a subdomain of evil.example; evilexample.com is not
 * (no dot boundary). Both inputs are normalized before comparing. */
export function isSameOrSubdomain(domain: string, candidate: string): boolean {
  const a = normalizeDomain(domain);
  const b = normalizeDomain(candidate);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`);
}

/** `domain` and each of its parent domains, most specific first, stopping at
 * the registrable domain (publicSuffix.ts) so a set that happened to contain
 * a public suffix like "com" or "co.uk" could never match everything:
 * mail.evil.co.uk -> ["mail.evil.co.uk", "evil.co.uk"]. Before the suffix
 * list has loaded this stops before the bare TLD instead. A domain that is
 * itself a public suffix yields just itself. Empty array for an empty domain. */
export function registrableDomainCandidates(domain: string): string[] {
  const normalized = normalizeDomain(domain);
  if (!normalized) return [];
  const registrable = registrableDomainOf(normalized);
  if (!registrable) return [normalized];
  const labels = normalized.split(".");
  const stop = labels.length - registrable.split(".").length;
  const candidates = [normalized];
  for (let i = 1; i <= stop; i++) {
    candidates.push(labels.slice(i).join("."));
  }
  return candidates;
}

/** The registrable domain of `domain` (example.co.uk for mail.example.co.uk),
 * or the normalized domain itself when it is a public suffix. */
export function registrableDomain(domain: string): string {
  const normalized = normalizeDomain(domain);
  return registrableDomainOf(normalized) ?? normalized;
}

/** True if `domain` or any parent of it is a member of `set` (already-
 * normalized domain strings). */
export function domainMatchesSet(domain: string, set: { has(key: string): boolean }): boolean {
  return registrableDomainCandidates(domain).some((candidate) => set.has(candidate));
}

/** First value found for `domain` or a parent of it as a key in `map`
 * (already-normalized domain keys). */
export function lookupDomainInMap<T>(domain: string, map: { get(key: string): T | undefined }): T | undefined {
  for (const candidate of registrableDomainCandidates(domain)) {
    const value = map.get(candidate);
    if (value !== undefined) return value;
  }
  return undefined;
}
