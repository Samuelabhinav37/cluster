// "People you write to", from the sent store of the mail index. One entry per
// address: the names you've used for them, how often you've written, and
// when you last did. This replaces the old 150-message sent sample as the
// source of protection, the Screener's allowlist and the verdict's
// known-correspondent check.
import type { SentRecord } from "./providers/emailProvider";

export interface Correspondent {
  address: string;
  /** Display names seen on your sent mail to them, most used first. */
  names: string[];
  sentCount: number;
  lastSentAt: number;
}

/** Most addresses kept in settings.sentCorrespondents. */
export const MAX_CORRESPONDENTS = 5_000;

/**
 * Rolls sent records up by recipient address. `ownAddresses` (your own
 * mailbox, aliases) are left out, so writing to yourself doesn't make you a
 * correspondent. Sorted by how often you wrote, then by how recently.
 */
export function buildCorrespondents(
  records: readonly SentRecord[],
  ownAddresses: readonly string[] = [],
): Correspondent[] {
  const own = new Set(ownAddresses.map((a) => a.toLowerCase()));
  const byAddress = new Map<string, { names: Map<string, number>; sentCount: number; lastSentAt: number }>();
  for (const record of records) {
    // One count per message, even if an address is on To and Cc.
    const seen = new Set<string>();
    for (const { address, name } of [...record.to, ...record.cc, ...record.bcc]) {
      if (own.has(address) || seen.has(address)) continue;
      seen.add(address);
      const entry = byAddress.get(address) ?? { names: new Map(), sentCount: 0, lastSentAt: 0 };
      entry.sentCount += 1;
      entry.lastSentAt = Math.max(entry.lastSentAt, record.sentAt);
      if (name) entry.names.set(name, (entry.names.get(name) ?? 0) + 1);
      byAddress.set(address, entry);
    }
  }
  return [...byAddress]
    .map(([address, entry]) => ({
      address,
      names: [...entry.names].sort((a, b) => b[1] - a[1]).map(([name]) => name),
      sentCount: entry.sentCount,
      lastSentAt: entry.lastSentAt,
    }))
    .sort((a, b) => b.sentCount - a.sentCount || b.lastSentAt - a.lastSentAt);
}

/** The settings allowlist: what was there, plus everyone in the sent store. */
export function mergeCorrespondentAddresses(
  existing: readonly string[],
  correspondents: readonly Correspondent[],
): string[] {
  const merged = new Set(correspondents.slice(0, MAX_CORRESPONDENTS).map((c) => c.address));
  for (const address of existing) {
    if (merged.size >= MAX_CORRESPONDENTS) break;
    merged.add(address.toLowerCase());
  }
  return [...merged];
}
