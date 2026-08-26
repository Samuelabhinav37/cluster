import { mapWithConcurrency } from "./concurrency";
import type { DomainGroup } from "./domainGrouping";
import type { EmailProvider, ProviderId } from "./providers/emailProvider";
import type { SenderSummary } from "./senderModel";

export function safeSenderKeys(senders: SenderSummary[]): Set<string> {
  return new Set(senders.filter((s) => s.protectedMessageIds.length === 0).map((s) => s.key));
}

export function safeDomainGroupKeys(groups: DomainGroup[]): Set<string> {
  return new Set(groups.filter((g) => g.protectedCount === 0).map((g) => g.key));
}

export interface UnsubscribePartition {
  automatable: SenderSummary[];
  manual: SenderSummary[];
}

export function partitionForUnsubscribe(selected: SenderSummary[]): UnsubscribePartition {
  const automatable: SenderSummary[] = [];
  const manual: SenderSummary[] = [];
  for (const s of selected) (s.unsubscribe.postUrl ? automatable : manual).push(s);
  return { automatable, manual };
}

export async function executeBulkUnsubscribe(
  automatable: SenderSummary[],
  fireOneClick: (url: string) => Promise<boolean>,
): Promise<{ succeeded: SenderSummary[]; failed: SenderSummary[] }> {
  const outcomes = await mapWithConcurrency(automatable, 5, (s) => fireOneClick(s.unsubscribe.postUrl!));
  const succeeded: SenderSummary[] = [];
  const failed: SenderSummary[] = [];
  automatable.forEach((s, i) => (outcomes[i] ? succeeded : failed).push(s));
  return { succeeded, failed };
}

export interface KeepSortedPartition {
  eligible: SenderSummary[];
  unsupported: SenderSummary[];
}

export function partitionForKeepSorted(
  selected: SenderSummary[],
  providerById: Map<ProviderId, EmailProvider>,
): KeepSortedPartition {
  const eligible: SenderSummary[] = [];
  const unsupported: SenderSummary[] = [];
  for (const s of selected) {
    (providerById.get(s.provider)?.keepSorted ? eligible : unsupported).push(s);
  }
  return { eligible, unsupported };
}

export async function executeBulkKeepSorted(
  eligible: SenderSummary[],
  providerById: Map<ProviderId, EmailProvider>,
): Promise<{ succeeded: number; failed: number }> {
  const outcomes = await mapWithConcurrency(eligible, 5, async (s) => {
    const provider = providerById.get(s.provider);
    if (!provider?.keepSorted) return false;
    try {
      const token = await provider.getAuthToken(false);
      const labelName = `Declutter/${s.displayName || s.address}`;
      await provider.keepSorted(token, s.address, labelName, s.messageIds);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  });
  const succeeded = outcomes.filter(Boolean).length;
  return { succeeded, failed: outcomes.length - succeeded };
}

export function mergeDeletableIdsByProvider(groups: DomainGroup[]): Map<ProviderId, string[]> {
  const merged = new Map<ProviderId, string[]>();
  for (const g of groups) {
    for (const [providerId, ids] of g.deletableMessageIds) {
      const existing = merged.get(providerId);
      if (existing) existing.push(...ids);
      else merged.set(providerId, [...ids]);
    }
  }
  return merged;
}

export function totalDeletableAcrossGroups(groups: DomainGroup[]): number {
  let total = 0;
  for (const g of groups) for (const ids of g.deletableMessageIds.values()) total += ids.length;
  return total;
}

export async function executeBulkDeleteDomains(
  mergedIds: Map<ProviderId, string[]>,
  providerById: Map<ProviderId, EmailProvider>,
): Promise<void> {
  await Promise.all(
    [...mergedIds.entries()].map(async ([providerId, ids]) => {
      const provider = providerById.get(providerId);
      if (!provider) return;
      const token = await provider.getAuthToken(false);
      await provider.trashMessages(token, ids);
    }),
  );
}
