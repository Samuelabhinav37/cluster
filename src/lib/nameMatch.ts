// "Name matches someone you write to, but the address is new": a sender you
// don't know using the display name of one you do. A common way to pose as
// a friend, boss or relative from a fresh free-mail account.
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
