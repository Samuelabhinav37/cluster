import { categorizeDomain, type DomainCategory } from "./domainCategories";
import type { ProviderId } from "./providers/emailProvider";
import type { SenderSummary } from "./senderModel";

// Major free-mail providers are excluded from domain-level grouping: thousands
// of unrelated individual senders share these domains, so grouping by domain
// here would lump strangers' mail together instead of one brand's senders.
const FREE_MAIL_EXCEPTIONS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "aol.com",
  "protonmail.com",
]);

export interface DomainGroup {
  key: string;
  domain: string;
  category: DomainCategory;
  isFreeMailException: boolean;
  senders: SenderSummary[];
  totalCount: number;
  protectedCount: number;
  deletableMessageIds: Map<ProviderId, string[]>;
  protectedMessageIds: Map<ProviderId, string[]>;
}

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? address : address.slice(at + 1).toLowerCase();
}

function groupingKeyFor(sender: SenderSummary): {
  key: string;
  domain: string;
  isFreeMailException: boolean;
} {
  const domain = domainOf(sender.address);
  const isFreeMailException = FREE_MAIL_EXCEPTIONS.has(domain);
  const key = isFreeMailException ? `${sender.provider}:addr:${sender.address}` : `domain:${domain}`;
  return { key, domain, isFreeMailException };
}

function appendIds(map: Map<ProviderId, string[]>, provider: ProviderId, ids: string[]) {
  if (ids.length === 0) return;
  const existing = map.get(provider);
  if (existing) existing.push(...ids);
  else map.set(provider, [...ids]);
}

export function buildDomainGroups(senders: SenderSummary[]): DomainGroup[] {
  const groups = new Map<string, DomainGroup>();

  for (const sender of senders) {
    const { key, domain, isFreeMailException } = groupingKeyFor(sender);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        domain,
        category: categorizeDomain(domain),
        isFreeMailException,
        senders: [],
        totalCount: 0,
        protectedCount: 0,
        deletableMessageIds: new Map(),
        protectedMessageIds: new Map(),
      };
      groups.set(key, group);
    }

    group.senders.push(sender);
    group.totalCount += sender.count;
    group.protectedCount += sender.protectedMessageIds.length;

    const protectedSet = new Set(sender.protectedMessageIds);
    const deletable = sender.messageIds.filter((id) => !protectedSet.has(id));
    appendIds(group.deletableMessageIds, sender.provider, deletable);
    appendIds(group.protectedMessageIds, sender.provider, sender.protectedMessageIds);
  }

  return [...groups.values()].sort((a, b) => b.totalCount - a.totalCount);
}
