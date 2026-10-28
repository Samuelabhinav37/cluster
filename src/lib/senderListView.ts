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

// A starred or answered receipt is still the company's mail; only mail that
// reads like a person's stays out of the company row.
function staysOutOfCompany(profile: SenderProfile | undefined): boolean {
  return isPerson(profile) && profile?.kind === "person";
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

/** The one fact a row shows about a sender, such as "12 a month". The row's
 * bar already shows how much is read. */
export function profileLine(profile: SenderProfile | undefined): string | undefined {
  if (!profile) return undefined;
  if (profile.youWrote > 0) return `You've written ${profile.youWrote === 1 ? "once" : `${profile.youWrote} times`}`;
  if (!profile.stillSending) return "Gone quiet";
  if (profile.perMonth >= 1) return `${Math.round(profile.perMonth)} a month`;
  return undefined;
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
    if (!profile?.companyKey || staysOutOfCompany(profile)) continue;
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

/** The name a company goes by: the display name carrying the most mail. */
export function companyName(group: CompanyGroup): string {
  const byName = new Map<string, number>();
  for (const s of group.senders) {
    const name = s.displayName?.trim();
    if (name) byName.set(name, (byName.get(name) ?? 0) + senderVolume(s));
  }
  let best = group.key;
  let most = 0;
  for (const [name, n] of byName) if (n > most) [best, most] = [name, n];
  return best;
}

export type ListEntry = { kind: "sender"; sender: SenderSummary } | { kind: "company"; group: CompanyGroup };

/**
 * The Senders list with each company's addresses folded into one entry, in
 * the order of the company's first address. A company with one address
 * stays a plain sender row.
 */
export function foldByCompany(
  sorted: readonly SenderSummary[],
  profiles: ReadonlyMap<string, SenderProfile>,
): ListEntry[] {
  const groups = new Map(
    groupByCompany(sorted, profiles)
      .filter((g) => g.senders.length > 1)
      .map((g) => [g.key, g] as const),
  );
  const out: ListEntry[] = [];
  const placed = new Set<string>();
  for (const sender of sorted) {
    const key = profiles.get(sender.key)?.companyKey;
    const group = key && !staysOutOfCompany(profiles.get(sender.key)) ? groups.get(key) : undefined;
    if (!group) {
      out.push({ kind: "sender", sender });
      continue;
    }
    if (placed.has(group.key)) continue;
    placed.add(group.key);
    out.push({ kind: "company", group });
  }
  return out;
}
