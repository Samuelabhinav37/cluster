// Inbox unread over time: Gmail's own INBOX unread count, one snapshot a day,
// kept on this computer for Home's 7-day bar and its "vs last week".
const DAY_MS = 86_400_000;
const KEEP_DAYS = 14;

const dayKey = (t: number) => new Date(t).toLocaleDateString("en-CA");

/** The snapshots with today's count set, and anything older than two weeks dropped. */
export function recordUnread(
  snapshots: Readonly<Record<string, number>>,
  unread: number,
  now: number,
): Record<string, number> {
  const keep = new Set(Array.from({ length: KEEP_DAYS }, (_, i) => dayKey(now - i * DAY_MS)));
  const next = Object.fromEntries(Object.entries(snapshots).filter(([day]) => keep.has(day)));
  next[dayKey(now)] = unread;
  return next;
}

/** The last seven days, oldest first; a day with no snapshot is null. */
export function unreadDays(snapshots: Readonly<Record<string, number>>, now: number): (number | null)[] {
  return Array.from({ length: 7 }, (_, i) => snapshots[dayKey(now - (6 - i) * DAY_MS)] ?? null);
}

/** Unread a week ago, when that day was recorded. */
export function unreadWeekAgo(snapshots: Readonly<Record<string, number>>, now: number): number | undefined {
  return snapshots[dayKey(now - 7 * DAY_MS)];
}
