// "Name matches someone you write to, but the address is new": a sender you
// don't know using the display name of one you do. A common way to pose as
// a friend, boss or relative from a fresh free-mail account.
import { canonicalAddress } from "./addressIdentity";
import { isFreeMailDomain } from "./freeMail";
import type { SenderSummary } from "./senderModel";

/** Lowercased, quotes and extra spaces dropped. Only full names (two words or
 * more) count, so "Support" or "Team" never match. */
function fullName(raw: string): string | undefined {
  const name = raw.toLowerCase().replace(/["'“”]/g, "").replace(/\s+/g, " ").trim();
  return name.split(" ").length >= 2 ? name : undefined;
}

/** Adds a "name-match" signal to each unknown sender whose name belongs to a
 * known one. Mutates `senders` in place, as firstContact.ts does.
 * shortcut: names come from the senders in this scan, not from sent mail; store sent-to names if this misses people. */
export function markNameMatches(senders: SenderSummary[], known: ReadonlySet<string>): number {
  return markNames(senders, known) + markAliasLookalikes(senders, known);
}

/** What a person might read as the same mailbox: no +tag, no dots, hyphens
 * or underscores. Wider than any one provider's real rule, on purpose. */
function looseKey(address: string): string {
  const [local = "", domain = ""] = address.toLowerCase().split("@");
  return `${(local.split("+")[0] || local).replace(/[._-]/g, "")}@${domain}`;
}

/** An unknown address that reads as an alias of someone you write to but
 * isn't one for that provider: alice+friend@yahoo.com, al.ice@outlook.com
 * when you know alice@ there. 31.65% of people who knew about aliases took
 * such an address for their friend's (Wu et al., NDSS 2026). Decisive on a
 * free-mail domain, whose rules are known; a warning elsewhere, where a
 * colleague can be j.smith next to jsmith. */
function markAliasLookalikes(senders: SenderSummary[], known: ReadonlySet<string>): number {
  const byLoose = new Map<string, string>();
  for (const address of known) if (address.includes("@")) byLoose.set(looseKey(address), address);
  if (byLoose.size === 0) return 0;
  let marked = 0;
  for (const s of senders) {
    if (known.has(s.address) || s.threatSignals.some((t) => t.kind === "alias-lookalike")) continue;
    const theirs = byLoose.get(looseKey(s.address));
    if (!theirs || theirs === canonicalAddress(s.address)) continue;
    const free = isFreeMailDomain(s.address.split("@")[1] ?? "");
    s.threatSignals.push({ kind: "alias-lookalike", brand: theirs, confidence: free ? "high" : "medium" });
    marked++;
  }
  return marked;
}

function markNames(senders: SenderSummary[], known: ReadonlySet<string>): number {
  const knownNames = new Map<string, string>();
  for (const s of senders) {
    const name = fullName(s.displayName);
    if (name && known.has(s.address.toLowerCase())) knownNames.set(name, s.address.toLowerCase());
  }
  let marked = 0;
  for (const s of senders) {
    const name = fullName(s.displayName);
    const theirs = name && knownNames.get(name);
    if (!theirs || known.has(s.address.toLowerCase())) continue;
    if (s.threatSignals.some((t) => t.kind === "name-match")) continue;
    s.threatSignals.push({ kind: "name-match", brand: theirs, confidence: "medium" });
    marked++;
  }
  return marked;
}
