// Sender totals from the mail index's census ("fetch one, count many"). A
// sender's SenderSummary counts only messages Cluster has read; the census
// knows how many there really are, counted with one search. Screens that
// describe or rank a sender use these totals. Actions never do: they act only
// on read messages, which have been through every protection check.
import type { CensusRow } from "./mailIndex";
import type { SenderSummary } from "./senderModel";

/** Adds census totals to each sender that has more mail than was read. */
export function applyCensus(senders: SenderSummary[], rows: readonly CensusRow[]): SenderSummary[] {
  const byKey = new Map(rows.map((row) => [`${row.provider}:${row.address}`, row]));
  for (const sender of senders) {
    const row = byKey.get(sender.key);
    if (!row || row.ids.length <= sender.count) continue;
    sender.totalCount = row.ids.length;
    if (row.unread >= 0) sender.totalUnread = row.unread;
  }
  return senders;
}

/** How much mail a sender has sent, counted or read. */
export function senderVolume(sender: SenderSummary): number {
  return sender.totalCount ?? sender.count;
}

/** How much of it is still unread, counted or read. */
export function senderUnread(sender: SenderSummary): number {
  return sender.totalUnread ?? sender.messages.filter((m) => m.unread).length;
}

/** How often they really send, from the mail read: "Daily", "3 a week". */
export function cadenceLabel(count: number, windowDays: number): string {
  const perWeek = count / Math.max(1, windowDays / 7);
  if (perWeek >= 5) return "Daily";
  if (perWeek >= 1) return `${Math.round(perWeek)} a week`;
  const perMonth = Math.round(perWeek * 4.3);
  return perMonth >= 1 ? `${perMonth} a month` : "Now and then";
}
