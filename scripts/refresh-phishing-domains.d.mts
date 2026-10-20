// Types for the parts of refresh-phishing-domains.mjs that domainHash.test.ts
// checks against the extension's own code.
export function cyrb53(text: string, seed?: number): number;
export function registrable(domain: string, psl: Map<string, Set<string>>): string | null;
export function buildEntries(
  hosts: Iterable<string>,
  options: { psl: Map<string, Set<string>>; excluded: Set<string> },
): Set<string>;
export function encode(entries: Set<string>): string;
