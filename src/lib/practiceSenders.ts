// Setup's "learn by doing" step (research/2026-11-15-onboarding-two-sources.md):
// three companies from the user's own newest mail, each with Cluster's guess,
// one other label and "Keep". Pure: the setup screen fetches the mail and
// saves the answers.
import { classifyMessageKind } from "./messageKind";
import { classifySortBucket, type SortBucket, type SortOverride } from "./sortTaxonomy";
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
  /** A recent subject from them, to jog the memory. */
  subject: string;
  guess: SortBucket;
  /** A plausible second label to choose instead. */
  alt: SortBucket;
}

export type PracticeAnswer = "guess" | "alt" | "keep";

// The label people most often mean instead of Cluster's guess.
const ALT: Record<SortBucket, SortBucket> = {
  promotions: "newsletter",
  newsletter: "promotions",
  shipping: "shopping",
  shopping: "promotions",
  receipt: "shopping",
  finance: "receipt",
  travel: "receipt",
  productivity: "newsletter",
  otp: "accounts",
  accounts: "otp",
  social: "newsletter",
  jobs: "newsletter",
  education: "newsletter",
};

/** Up to `n` companies the user hears from most, one per domain, different guesses first. */
export function pickPracticeSenders(mail: PracticeMail[], n = 3): PracticeSender[] {
  const byDomain = new Map<string, { sender: PracticeSender; count: number }>();
  for (const m of mail) {
    const address = m.fromAddress.toLowerCase();
    const host = address.split("@")[1] ?? "";
    if (!host) continue;
    const kind = classifyMessageKind(m.subject, Boolean(m.listMail), { address, displayName: m.fromDisplayName });
    const guess = classifySortBucket(kind, host, Boolean(m.promotion), address);
    // Free mail, people and unknowns have no label to practise on.
    if (!guess) continue;
    const key = registrableDomain(host);
    const seen = byDomain.get(key);
    if (seen) seen.count += 1;
    else
      byDomain.set(key, {
        count: 1,
        sender: { host, address, name: m.fromDisplayName.trim() || key, subject: m.subject, guess, alt: ALT[guess] },
      });
  }
  const ranked = [...byDomain.values()].sort((a, b) => b.count - a.count).map((x) => x.sender);
  const picked: PracticeSender[] = [];
  for (const s of ranked) if (picked.length < n && !picked.some((p) => p.guess === s.guess)) picked.push(s);
  for (const s of ranked) if (picked.length < n && !picked.includes(s)) picked.push(s);
  return picked;
}

/** What an answer saves: nothing for Cluster's own guess, the other label, or never sort. */
export function practiceOverride(sender: PracticeSender, answer: PracticeAnswer): [string, SortOverride] | null {
  if (answer === "guess") return null;
  return [`@${sender.host}`, answer === "alt" ? sender.alt : "never"];
}
