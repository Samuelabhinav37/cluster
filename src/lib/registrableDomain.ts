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

/** `domain` and each of its parent domains, most specific first, stopping
 * before the bare TLD so a set that happened to contain e.g. "com" could
 * never match everything: mail.evil.example -> ["mail.evil.example",
 * "evil.example"]. Empty array for an empty/unparseable domain. */
export function registrableDomainCandidates(domain: string): string[] {
  const normalized = normalizeDomain(domain);
  if (!normalized) return [];
  const labels = normalized.split(".");
  const candidates = [normalized];
  for (let i = 1; i < labels.length - 1; i++) {
    candidates.push(labels.slice(i).join("."));
  }
  return candidates;
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
