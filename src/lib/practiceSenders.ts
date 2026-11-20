// Setup's companies (research/2026-11-15-onboarding-two-sources.md): from
// the user's own newest mail, each under Cluster's guessed label. Pure: the
// setup screen fetches the mail.
import { classifyMessageKind } from "./messageKind";
import { classifySortBucket, type SortBucket } from "./sortTaxonomy";
import { registrableDomain } from "./registrableDomain";

export interface PracticeMail {
  fromAddress: string;
  fromDisplayName: string;
  subject: string;
  /** Gmail's Promotions tab. */
  promotion?: boolean;
  /** Has a List-Unsubscribe header. */
  listMail?: boolean;
}

export interface PracticeSender {
  /** The From host, as overrideFor keys a domain ("@host"). */
  host: string;
  address: string;
  name: string;
  guess: SortBucket;
}

/** A board column: a label, or Keep in inbox. */
export type BoardSpot = SortBucket | "keep";

/** The label Cluster would put on one email, or null for people, free mail and unknowns. */
export function practiceGuess(m: PracticeMail): SortBucket | null {
  const address = m.fromAddress.toLowerCase();
  const host = address.split("@")[1] ?? "";
  if (!host) return null;
  const kind = classifyMessageKind(m.subject, Boolean(m.listMail), { address, displayName: m.fromDisplayName });
  return classifySortBucket(kind, host, Boolean(m.promotion), address);
}

/** A company Cluster would label; free mail, people and unknowns aren't. */
export const isCompanyMail = (m: PracticeMail) => practiceGuess(m) !== null;

/** Up to `n` companies the user hears from most, one per domain, different guesses first. */
export function pickPracticeSenders(mail: PracticeMail[], n = 8): PracticeSender[] {
  const byDomain = new Map<string, { sender: PracticeSender; count: number }>();
  for (const m of mail) {
    const guess = practiceGuess(m);
    if (!guess) continue;
    const address = m.fromAddress.toLowerCase();
    const host = address.split("@")[1];
    const key = registrableDomain(host);
    const seen = byDomain.get(key);
    if (seen) seen.count += 1;
    else byDomain.set(key, { count: 1, sender: { host, address, name: m.fromDisplayName.trim() || key, guess } });
  }
  const ranked = [...byDomain.values()].sort((a, b) => b.count - a.count).map((x) => x.sender);
  const picked: PracticeSender[] = [];
  for (const s of ranked) if (picked.length < n && !picked.some((p) => p.guess === s.guess)) picked.push(s);
  for (const s of ranked) if (picked.length < n && !picked.includes(s)) picked.push(s);
  return picked;
}

