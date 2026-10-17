// Sorting, the one-line summary and the company view for the Senders
// screen, all read from sender profiles. Pure, so the screen stays a thin
// render of these.
import { senderUnread, senderVolume } from "./census";
import type { SenderSummary } from "./senderModel";
import type { SenderProfile, SenderTier, TemplateGroup } from "./senderProfile";

export type SenderSortId = "volume" | "unread" | "newest" | "leastOpened" | "lastOpened" | "people";

export const SENDER_SORT_LABELS: Record<SenderSortId, string> = {
  volume: "Most mail",
  unread: "Most unread",
  newest: "Newest",
  leastOpened: "Least opened",
  lastOpened: "Longest since opened",
  people: "People first",
};

const TIER_ORDER: SenderTier[] = ["close", "known", "regular", "other", "new", "ignored"];

export function isPerson(profile: SenderProfile | undefined): boolean {
  return profile?.tier === "close" || profile?.tier === "known";
}

export function sortSenders(
  senders: readonly SenderSummary[],
  profiles: ReadonlyMap<string, SenderProfile>,
  sort: SenderSortId,
): SenderSummary[] {
  const p = (s: SenderSummary) => profiles.get(s.key);
  const byVolume = (a: SenderSummary, b: SenderSummary) => senderVolume(b) - senderVolume(a);
  const keyed: Record<SenderSortId, (a: SenderSummary, b: SenderSummary) => number> = {
    volume: byVolume,
    unread: (a, b) => senderUnread(b) - senderUnread(a) || byVolume(a, b),
    newest: (a, b) => (p(b)?.lastSeenAt ?? 0) - (p(a)?.lastSeenAt ?? 0),
    // Senders not judged yet (all mail too new) sort after everyone judged.
    leastOpened: (a, b) => (p(a)?.openRate ?? 2) - (p(b)?.openRate ?? 2) || byVolume(a, b),
    // Never opened first, then the longest ago.
    lastOpened: (a, b) => (p(a)?.lastOpenedAt ?? 0) - (p(b)?.lastOpenedAt ?? 0) || byVolume(a, b),
    people: (a, b) =>
      TIER_ORDER.indexOf(p(a)?.tier ?? "other") - TIER_ORDER.indexOf(p(b)?.tier ?? "other") || byVolume(a, b),
  };
  return [...senders].sort(keyed[sort]);
}

/** The template most of their mail follows, when one does. */
export function mainTemplate(profile: SenderProfile): TemplateGroup | undefined {
  const top = profile.templates[0];
  return top && top.count * 2 >= profile.sampled ? top : undefined;
}

/** One quiet line, such as "Opens 4% · 12 a month · still sending". */
export function profileLine(profile: SenderProfile | undefined): string | undefined {
  if (!profile) return undefined;
  const parts: string[] = [];
  if (profile.youWrote > 0) parts.push(`You've written ${profile.youWrote === 1 ? "once" : `${profile.youWrote} times`}`);
  if (profile.openRate !== null) parts.push(`Opens ${Math.round(profile.openRate * 100)}%`);
  if (profile.perMonth >= 1) parts.push(`${Math.round(profile.perMonth)} a month`);
  parts.push(profile.stillSending ? "still sending" : "gone quiet");
  return parts.join(" · ");
}

export interface CompanyGroup {
  key: string;
  senders: SenderSummary[];
  total: number;
  unread: number;
  /** Read share across the company's judged mail; null if none judged. */
  openRate: number | null;
}

/**
 * Senders grouped by authenticated company (senderProfile companyKey).
 * Senders without one, such as people on free mail, are left out: a shared
 * domain never stands for one company.
 */
export function groupByCompany(
  senders: readonly SenderSummary[],
  profiles: ReadonlyMap<string, SenderProfile>,
): CompanyGroup[] {
  const groups = new Map<string, CompanyGroup & { judged: number; opened: number }>();
  for (const sender of senders) {
    const profile = profiles.get(sender.key);
    if (!profile?.companyKey || isPerson(profile)) continue;
    const group = groups.get(profile.companyKey) ?? {
      key: profile.companyKey,
      senders: [],
      total: 0,
      unread: 0,
      openRate: null,
      judged: 0,
      opened: 0,
    };
    group.senders.push(sender);
    group.total += senderVolume(sender);
    group.unread += senderUnread(sender);
    group.judged += profile.judged;
    group.opened += Math.round((profile.openRate ?? 0) * profile.judged);
    groups.set(profile.companyKey, group);
  }
  return [...groups.values()]
    .map(({ judged, opened, ...g }) => ({ ...g, openRate: judged > 0 ? opened / judged : null }))
    .sort((a, b) => b.total - a.total);
}
