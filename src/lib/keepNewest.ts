import type { ProviderId } from "./providers/emailProvider";
import type { SenderSummary } from "./senderModel";

// "Keep Newest" (Clean Email) — for repetitive senders (daily reports, alerts,
// receipts you only ever need the latest of), keep the most recent N non-starred
// messages per sender and return the rest, grouped by provider, for the caller
// to trash. Never touches starred/flagged mail.
export function keepNewestExcess(
  senders: SenderSummary[],
  keepPerSender: number,
): Map<ProviderId, string[]> {
  const keep = Math.max(0, Math.floor(keepPerSender));
  const out = new Map<ProviderId, string[]>();
  for (const s of senders) {
    const excess = s.messages
      .filter((m) => !m.isProtected)
      .sort((a, b) => b.receivedAt - a.receivedAt)
      .slice(keep);
    if (excess.length === 0) continue;
    const list = out.get(s.provider) ?? [];
    for (const m of excess) list.push(m.id);
    out.set(s.provider, list);
  }
  return out;
}

export function keepNewestExcessCount(senders: SenderSummary[], keepPerSender: number): number {
  let n = 0;
  for (const ids of keepNewestExcess(senders, keepPerSender).values()) n += ids.length;
  return n;
}
