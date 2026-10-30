// Sorting, the one-line summary and the company view for the Senders
// screen, all read from sender profiles. Pure, so the screen stays a thin
// render of these.
import { senderUnread, senderVolume } from "./census";
import type { SenderSummary } from "./senderModel";
import type { SenderProfile, SenderTier, TemplateGroup } from "./senderProfile";
import { registrableDomain } from "./registrableDomain";

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

/** You interact with them (tier), and they are a person: not a machine and
 * their mail reads person to person. Starring or answering a receipt makes
 * service@paypal.com important, not a person. */
export function isPerson(profile: SenderProfile | undefined): boolean {
  if (profile?.personOverride !== undefined) return profile.personOverride;
  return (
    (profile?.tier === "close" || profile?.tier === "known") && !profile.machine && profile.kind === "person"
  );
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

/** What folds a sender with others: its authenticated company, else its
 * signed List-Id (one newsletter sent from several addresses). */
export function groupKeyFor(profile: SenderProfile | undefined): string | null {
  if (!profile || isPerson(profile)) return null;
  if (profile.companyKey) return profile.companyKey;
  return profile.listId && profile.listIdSigned ? `list:${profile.listId}` : null;
}

/**
 * Senders grouped by authenticated company (senderProfile companyKey), or by
 * signed List-Id when there is none. Other senders, such as people on free
 * mail, are left out: a shared domain never stands for one company.
 */
export function groupByCompany(
  senders: readonly SenderSummary[],
  profiles: ReadonlyMap<string, SenderProfile>,
): CompanyGroup[] {
  const groups = new Map<string, CompanyGroup & { judged: number; opened: number }>();
  for (const sender of senders) {
    const profile = profiles.get(sender.key);
    const key = groupKeyFor(profile);
    if (!profile || !key) continue;
    const group = groups.get(key) ?? {
      key,
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
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ judged, opened, ...g }) => ({ ...g, openRate: judged > 0 ? opened / judged : null }))
    .sort((a, b) => b.total - a.total);
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The first label of the address's registrable domain: "linkedin" for news.linkedin.com. */
function domainLabel(address: string): string {
  const domain = address.slice(address.lastIndexOf("@") + 1);
  return squash(registrableDomain(domain).split(".")[0] ?? "");
}

/** Whether a name is the domain's own brand ("LinkedIn" for linkedin.com). */
function namesDomain(name: string, address: string): boolean {
  const label = domainLabel(address);
  return label.length >= 3 && squash(name).includes(label);
}

/**
 * The name a sender's row shows. Platforms put the person who acted in the
 * name ("Suhas Nayak via LinkedIn"); the row shows the platform, but only
 * when the address really is that platform's, so a fake "via PayPal" from
 * another domain keeps its full name.
 */
export function senderName(s: Pick<SenderSummary, "displayName" | "address">): string {
  const name = s.displayName?.trim() ?? "";
  const via = /\s\(?via\s+([^)]+)\)?$/i.exec(name)?.[1]?.trim();
  if (via && namesDomain(via, s.address)) return via;
  return name || s.address;
}

/** The name a company goes by: the one carrying the most mail, preferring
 * names that are the domain's own brand over people writing through it. */
export function companyName(group: Pick<CompanyGroup, "key" | "senders">): string {
  const byName = new Map<string, { n: number; brand: boolean }>();
  for (const s of group.senders) {
    if (!s.displayName?.trim()) continue;
    const name = senderName(s);
    const entry = byName.get(name) ?? { n: 0, brand: namesDomain(name, s.address) };
    entry.n += senderVolume(s);
    byName.set(name, entry);
  }
  let best = group.key.replace(/^list:/, "");
  let top: { n: number; brand: boolean } = { n: 0, brand: false };
  for (const [name, e] of byName)
    if ((e.brand && !top.brand) || (e.brand === top.brand && e.n > top.n)) [best, top] = [name, e];
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
    const key = groupKeyFor(profiles.get(sender.key));
    const group = key ? groups.get(key) : undefined;
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

export type SenderGroup = "people" | "companies" | "subs";

/** The one Senders list a sender belongs in. Subscriptions are lists you can
 * leave; a company's receipts, codes and deliveries stay under Companies even
 * when they carry an unsubscribe link. */
export function senderGroup(sender: SenderSummary, profile: SenderProfile | undefined): SenderGroup {
  if (isPerson(profile)) return "people";
  const { postUrl, httpUrl, mailto } = sender.unsubscribe;
  const service = profile?.kind === "receipt" || profile?.kind === "shipping" || profile?.kind === "otp";
  return (postUrl || httpUrl || mailto) && !service ? "subs" : "companies";
}
