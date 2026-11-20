// Waiting for you (research ideas 2 and 6): actions Cluster would take on its
// own but was told to ask about first. One list, Approve or Not now. An item
// nobody answers in 7 days expires as "nothing happened", the way Defender's
// pending actions do. Pure helpers; storage is settings.waiting.

export interface WaitingItem {
  kind: "mute";
  /** Sender key (`gmail:address`) and address. */
  key: string;
  address: string;
  /** Inbox mail the action would move, at the time it was asked. */
  ids: string[];
  at: number;
}

export const WAITING_DAYS = 7;
const DAY_MS = 86_400_000;

/** The list with `asks` added (one per sender) and items past 7 days dropped. */
export function addWaiting(
  list: readonly WaitingItem[],
  asks: readonly Omit<WaitingItem, "at">[],
  declined: readonly string[],
  now: number,
): { waiting: WaitingItem[]; expired: string[] } {
  const no = new Set(declined.map((a) => a.toLowerCase()));
  const expired = list.filter((w) => now - w.at >= WAITING_DAYS * DAY_MS).map((w) => w.address);
  const kept = list.filter((w) => now - w.at < WAITING_DAYS * DAY_MS);
  const have = new Set(kept.map((w) => w.address.toLowerCase()));
  for (const a of asks) {
    const address = a.address.toLowerCase();
    if (have.has(address) || no.has(address) || expired.some((e) => e.toLowerCase() === address)) continue;
    have.add(address);
    kept.push({ ...a, at: now });
  }
  return { waiting: kept, expired };
}
