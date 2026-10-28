// One picture of each sender, built from the mail index: how much they send,
// how much of it you open, whether they're still sending, whether you write
// to them, and what kind of sender they are. Suggestions, the Senders screen,
// grouping and Sort my inbox all read this instead of re-deriving it from one
// scan each. Pure: no storage, no network.
import { buildCorrespondents } from "./correspondents";
import { passingDkimDomains } from "./emailAuth";
import { isSharedSenderDomain } from "./freeMail";
import type { CensusRow } from "./mailIndex";
import { classifyMessageKind, looksAutomated } from "./messageKind";
import type { NormalizedMessageMetadata, ProviderId, SentRecord } from "./providers/emailProvider";
import { registrableDomain } from "./registrableDomain";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Mail younger than this isn't counted as "not opened" yet. */
export const OPEN_GRACE_MS = 3 * DAY_MS;
/** A kind needs this share of a sender's votes; below it the sender is mixed. */
const KIND_MAJORITY = 0.7;
const NEW_SENDER_MS = 14 * DAY_MS;
const QUIET_FLOOR_MS = 30 * DAY_MS;
const CLOSE_RECENT_MS = 365 * DAY_MS;
/** Templates shown as one line need at least this many messages. */
export const TEMPLATE_MIN = 3;
const MAX_TEMPLATES = 10;

export type SenderKind = "person" | "list" | "promotion" | "otp" | "receipt" | "shipping" | "social" | "mixed";

export type SenderTier = "close" | "known" | "regular" | "ignored" | "new" | "other";

export interface TemplateGroup {
  key: string;
  count: number;
  ids: string[];
  newestAt: number;
}

export interface SenderProfile {
  key: string;
  provider: ProviderId;
  address: string;
  /** All their mail: the census total when it counted more than was read. */
  received: number;
  unread: number;
  starred: number;
  important: number;
  /** Sampled messages still in the inbox (Gmail INBOX label). */
  inInbox: number;
  /** Messages read into the index, after duplicate copies are dropped. */
  sampled: number;
  /** Read share of sampled mail older than the grace period; null if none. */
  openRate: number | null;
  /** Sampled mail old enough to judge openRate on. */
  judged: number;
  lastOpenedAt?: number;
  firstSeenAt: number;
  lastSeenAt: number;
  /** Messages a month over the last 90 days. */
  perMonth: number;
  stillSending: boolean;
  youWrote: number;
  lastWroteAt?: number;
  /** You replied to at least one of their messages. */
  replied: boolean;
  /** Most of their mail carries bulk or machine signals. */
  machine: boolean;
  kind: SenderKind;
  tier: SenderTier;
  /** Their most common List-Id, if their mail carries one. */
  listId?: string;
  /** Registrable domain of an authenticated company sender; null otherwise. */
  companyKey: string | null;
  /** Repeated templates, most first, each with TEMPLATE_MIN or more. */
  templates: TemplateGroup[];
  /** Copies dropped because they shared a Message-ID with another row. */
  duplicates: number;
  duplicateIds: string[];
}

export interface ProfileInputs {
  rows: readonly NormalizedMessageMetadata[];
  sent?: readonly SentRecord[];
  census?: readonly CensusRow[];
  /** The user's own addresses, never counted as correspondents. */
  ownAddresses?: readonly string[];
  /** Addresses the protection rules already trust (Screener allowlist etc). */
  knownSenders?: ReadonlySet<string>;
  now?: number;
}

const MONTH_DATE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(st|nd|rd|th)?\b/gi;
const AMOUNT = /[$€£₹¥]\s?\d[\d,.]*/g;
const NUMBERISH = /#?\b[\w-]*\d[\w-]*\b/g;
const QUOTED = /(["“'‘])[^"”'’]{1,60}\1|“[^”]{1,60}”/g;

/**
 * A subject with its changing parts masked, so "Your order #1234 has shipped"
 * and "Your order #98 has shipped" share one key (Ailon et al., WSDM 2013).
 * Dates, amounts, anything containing a digit and quoted names become `*`.
 */
export function templateKey(subject: string): string {
  return (subject || "")
    .toLowerCase()
    .replace(/^((re|fwd?|aw|sv)\s*:\s*)+/i, "")
    .replace(QUOTED, "*")
    .replace(MONTH_DATE, "*")
    .replace(AMOUNT, "*")
    .replace(NUMBERISH, "*")
    .replace(/\*(\s*[*,.:/-]\s*)*\*/g, "*")
    .replace(/\s+/g, " ")
    .trim();
}

function domainOfAddress(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).toLowerCase();
}

function hasUnsubscribe(m: NormalizedMessageMetadata): boolean {
  return Boolean(m.unsubscribe.postUrl || m.unsubscribe.httpUrl || m.unsubscribe.mailto);
}

// Addresses that stand for a team or a system, not a person (grouping doc 2.1).
const ROLE_LOCAL_PART =
  /^(no-?reply|do-?not-?reply|notifications?|alerts?|service|support|billing|info|hello|team|mailer-daemon|postmaster)([._+-]|$)/i;

function isBulk(m: NormalizedMessageMetadata): boolean {
  const labels = m.labelIds ?? [];
  return (
    looksAutomated(hasUnsubscribe(m), m.precedence, m.autoSubmitted) ||
    Boolean(m.listId) ||
    Boolean(m.gmailPromotion) ||
    labels.includes("CATEGORY_UPDATES") ||
    labels.includes("CATEGORY_SOCIAL") ||
    labels.includes("CATEGORY_FORUMS")
  );
}

/** One message's vote for its sender's kind, strongest evidence first. */
function kindVote(m: NormalizedMessageMetadata, repliesToYou: boolean): Exclude<SenderKind, "mixed"> | null {
  if (repliesToYou) return "person";
  const labels = m.labelIds ?? [];
  const bulk = isBulk(m);
  const kind = classifyMessageKind(m.subject, hasUnsubscribe(m), { address: m.fromAddress, displayName: m.fromDisplayName });
  if (kind === "otp" || kind === "receipt" || kind === "shipping") return kind;
  if (kind === "social" || labels.includes("CATEGORY_SOCIAL")) return "social";
  if (m.gmailPromotion) return "promotion";
  if (m.listId || hasUnsubscribe(m) || labels.includes("CATEGORY_FORUMS")) return "list";
  if (!bulk) return "person";
  return null;
}

function majority(votes: Map<string, number>, total: number): SenderKind {
  let best: string | undefined;
  let bestCount = 0;
  for (const [kind, count] of votes) {
    if (count > bestCount) {
      best = kind;
      bestCount = count;
    }
  }
  if (!best || total === 0 || bestCount / total < KIND_MAJORITY) return "mixed";
  return best as SenderKind;
}

function mostCommon(values: (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | undefined;
  for (const [v, n] of counts) if (!best || n > counts.get(best)!) best = v;
  return best;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** At least this many addresses on one domain before names are checked. */
const PLATFORM_MIN_ADDRESSES = 10;

/**
 * Domains that look like a platform sending for many customers, so the list
 * in freeMail.ts need not be complete. A company's addresses mostly carry its
 * own name ("Amazon.com", "Bank of America" for bankofamerica.com); a
 * platform's carry its customers' ("Walmart", "Target Careers" on
 * myworkday.com). O(rows).
 */
export function platformRoots(rows: readonly NormalizedMessageMetadata[]): Set<string> {
  const byRoot = new Map<string, Map<string, string>>();
  for (const m of rows) {
    const domain = domainOfAddress(m.fromAddress);
    if (!domain) continue;
    const root = registrableDomain(domain);
    const names = byRoot.get(root) ?? new Map<string, string>();
    byRoot.set(root, names);
    if (!names.has(m.fromAddress)) names.set(m.fromAddress, m.fromDisplayName);
  }
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const out = new Set<string>();
  for (const [root, names] of byRoot) {
    if (names.size < PLATFORM_MIN_ADDRESSES) continue;
    const label = squash(root.split(".")[0] ?? "");
    const named = [...names.values()].filter((n) => label && squash(n).includes(label)).length;
    if (named * 2 < names.size) out.add(root);
  }
  return out;
}

function companyKeyFor(
  address: string,
  rows: readonly NormalizedMessageMetadata[],
  platforms: ReadonlySet<string>,
): string | null {
  const domain = domainOfAddress(address);
  if (!domain || isSharedSenderDomain(domain)) return null;
  const root = registrableDomain(domain);
  if (platforms.has(root)) return null;
  const aligned = rows.some((m) =>
    passingDkimDomains(m.authenticationResults).some((d) => registrableDomain(d) === root),
  );
  return aligned ? root : null;
}

function buildTemplates(rows: readonly NormalizedMessageMetadata[]): TemplateGroup[] {
  const groups = new Map<string, TemplateGroup>();
  for (const m of rows) {
    const key = templateKey(m.subject);
    if (!key || key === "*") continue;
    const group = groups.get(key) ?? { key, count: 0, ids: [], newestAt: 0 };
    group.count += 1;
    group.ids.push(m.id);
    group.newestAt = Math.max(group.newestAt, m.receivedAt);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((g) => g.count >= TEMPLATE_MIN)
    .sort((a, b) => b.count - a.count || b.newestAt - a.newestAt)
    .slice(0, MAX_TEMPLATES);
}

function tierFor(p: Omit<SenderProfile, "tier">, known: boolean, now: number): SenderTier {
  if (p.youWrote >= 3 && p.lastWroteAt !== undefined && now - p.lastWroteAt <= CLOSE_RECENT_MS) return "close";
  if (p.youWrote > 0 || p.starred > 0 || p.replied || known) return "known";
  if (now - p.firstSeenAt < NEW_SENDER_MS) return "new";
  if (p.kind === "person" || !p.machine) return "other";
  if (p.openRate !== null && p.openRate >= 0.4) return "regular";
  if (p.openRate !== null && p.openRate < 0.1 && p.judged >= 5) return "ignored";
  return "other";
}

/** Builds a profile for every sender in the rows, keyed `${provider}:${address}`. */
export function buildSenderProfiles(inputs: ProfileInputs): Map<string, SenderProfile> {
  const now = inputs.now ?? Date.now();
  const known = inputs.knownSenders ?? new Set<string>();
  const correspondents = new Map(
    buildCorrespondents(inputs.sent ?? [], inputs.ownAddresses ?? []).map((c) => [c.address, c] as const),
  );
  const sentMessageIds = new Set((inputs.sent ?? []).map((s) => s.messageIdHeader).filter(Boolean) as string[]);
  const repliedTo = new Set((inputs.sent ?? []).map((s) => s.inReplyTo).filter(Boolean) as string[]);
  const census = new Map<string, CensusRow>(
    (inputs.census ?? []).map((row) => [`${row.provider}:${row.address}`, row] as const),
  );

  // Group by sender, dropping duplicate copies of one Message-ID.
  const bySender = new Map<string, { rows: NormalizedMessageMetadata[]; dupIds: string[] }>();
  const seenMessageIds = new Set<string>();
  const sorted = [...inputs.rows].sort((a, b) => b.receivedAt - a.receivedAt);
  for (const m of sorted) {
    const key = `${m.provider}:${m.fromAddress}`;
    const entry = bySender.get(key) ?? { rows: [], dupIds: [] };
    bySender.set(key, entry);
    const mid = m.messageIdHeader ? `${m.provider}:${m.messageIdHeader}` : undefined;
    if (mid && seenMessageIds.has(mid)) {
      entry.dupIds.push(m.id);
      continue;
    }
    if (mid) seenMessageIds.add(mid);
    entry.rows.push(m);
  }

  const platforms = platformRoots(inputs.rows);
  const profiles = new Map<string, SenderProfile>();
  for (const [key, { rows, dupIds }] of bySender) {
    if (rows.length === 0) continue;
    const first = rows[0];
    const address = first.fromAddress;
    const ascending = rows.map((m) => m.receivedAt).sort((a, b) => a - b);
    const firstSeenAt = ascending[0];
    const lastSeenAt = ascending[ascending.length - 1];
    const judgedRows = rows.filter((m) => now - m.receivedAt >= OPEN_GRACE_MS);
    const opened = judgedRows.filter((m) => !m.unread).length;
    const readRows = rows.filter((m) => !m.unread);
    const usualGap = median(ascending.slice(1).map((t, i) => t - ascending[i]));
    const votes = new Map<string, number>();
    let voted = 0;
    let bulkCount = 0;
    let replied = false;
    for (const m of rows) {
      const answersYou = Boolean(m.inReplyTo && sentMessageIds.has(m.inReplyTo));
      if (m.messageIdHeader && repliedTo.has(m.messageIdHeader)) replied = true;
      if (isBulk(m)) bulkCount += 1;
      const vote = kindVote(m, answersYou);
      if (!vote) continue;
      votes.set(vote, (votes.get(vote) ?? 0) + 1);
      voted += 1;
    }
    const counted = census.get(key);
    const unreadRead = rows.filter((m) => m.unread).length;
    const correspondent = correspondents.get(address);
    const base: Omit<SenderProfile, "tier"> = {
      key,
      provider: first.provider,
      address,
      received: Math.max(rows.length, counted?.ids.length ?? 0),
      unread: counted && counted.ids.length > rows.length && counted.unread >= 0 ? counted.unread : unreadRead,
      starred: rows.filter((m) => m.isProtected).length,
      important: rows.filter((m) => m.providerMarkedPersonal).length,
      inInbox: rows.filter((m) => m.labelIds?.includes("INBOX")).length,
      sampled: rows.length,
      openRate: judgedRows.length > 0 ? opened / judgedRows.length : null,
      judged: judgedRows.length,
      // Rows are newest first, so the first read row is the latest opened.
      lastOpenedAt: readRows[0]?.receivedAt,
      firstSeenAt,
      lastSeenAt,
      perMonth: Math.round((rows.filter((m) => now - m.receivedAt <= 90 * DAY_MS).length / 3) * 10) / 10,
      stillSending: now - lastSeenAt <= Math.max(QUIET_FLOOR_MS, 2 * usualGap),
      youWrote: correspondent?.sentCount ?? 0,
      lastWroteAt: correspondent?.lastSentAt,
      replied,
      machine: bulkCount * 2 > rows.length || ROLE_LOCAL_PART.test(address.split("@")[0] ?? ""),
      kind: majority(votes, voted),
      listId: mostCommon(rows.map((m) => m.listId)),
      companyKey: companyKeyFor(address, rows, platforms),
      templates: buildTemplates(rows),
      duplicates: dupIds.length,
      duplicateIds: dupIds,
    };
    profiles.set(key, { ...base, tier: tierFor(base, known.has(address), now) });
  }
  return profiles;
}
