// Releasing the Screener's backlog: everything held under the Screener label,
// not just the senders the latest (150-message) scan happened to see. Each
// held message goes where "Sort my inbox" would put it (a category label,
// out of the inbox, since this is old mail); mail from people the user
// knows, or that fits no category, goes back to the inbox. Senders that
// look like phishing stay held for a person to look at.
import { domainOf } from "./domainGrouping";
import type { GmailFilterResource } from "./gmailApi";
import type { SenderSummary } from "./senderModel";
import { effectiveBucket, type SortBucket, type SortOverride } from "./sortTaxonomy";
import { riskTier, senderRiskScore } from "./threatSignals";

export type ReleaseDestination = SortBucket | "inbox";

export interface ReleaseGroup {
  destination: ReleaseDestination;
  ids: string[];
  /** Lowercased sender addresses with at least one message in this group. */
  senders: string[];
}

export interface ScreenerReleasePlan {
  groups: ReleaseGroup[];
  /** Sender → every destination its messages are split across. */
  destinationsBySender: Record<string, ReleaseDestination[]>;
  /** Suspicious senders left held. */
  keptHeld: { address: string; count: number }[];
}

export function planScreenerRelease(
  senders: SenderSummary[],
  known: Set<string>,
  overrides: Record<string, SortOverride> = {},
): ScreenerReleasePlan {
  const groups = new Map<ReleaseDestination, { ids: string[]; senders: Set<string> }>();
  const destinationsBySender: Record<string, ReleaseDestination[]> = {};
  const keptHeld: ScreenerReleasePlan["keptHeld"] = [];

  for (const sender of senders) {
    const address = sender.address.toLowerCase();
    if (riskTier(senderRiskScore(sender.threatSignals)) === "high") {
      keptHeld.push({ address, count: sender.messages.length });
      continue;
    }
    const domain = domainOf(sender.address);
    const dests = new Set<ReleaseDestination>();
    for (const msg of sender.messages) {
      const dest: ReleaseDestination = known.has(address)
        ? "inbox"
        : (effectiveBucket(msg.kind, domain, address, overrides, msg.promotion) ?? "inbox");
      const group = groups.get(dest) ?? { ids: [], senders: new Set<string>() };
      group.ids.push(msg.id);
      group.senders.add(address);
      groups.set(dest, group);
      dests.add(dest);
    }
    destinationsBySender[address] = [...dests];
  }

  return {
    groups: [...groups.entries()]
      .map(([destination, g]) => ({ destination, ids: g.ids, senders: [...g.senders] }))
      .sort((a, b) => b.ids.length - a.ids.length),
    destinationsBySender,
    keptHeld: keptHeld.sort((a, b) => b.count - a.count),
  };
}

export interface ScreenerReleaseApi {
  /** The label id a category's mail is filed under (created if missing). */
  labelIdFor(bucket: SortBucket): Promise<string>;
  batchModify(ids: string[], add: string[], remove: string[]): Promise<void>;
  listFilters(): Promise<GmailFilterResource[]>;
  deleteFilter(id: string): Promise<void>;
}

export interface ScreenerReleaseResult {
  moved: number;
  /** Senders whose every held message was moved, so their hold is lifted. */
  released: string[];
  filtersRemoved: number;
}

export async function runScreenerRelease(
  plan: ScreenerReleasePlan,
  selected: Set<ReleaseDestination>,
  screenerLabelIds: string[],
  api: ScreenerReleaseApi,
): Promise<ScreenerReleaseResult> {
  let moved = 0;
  for (const group of plan.groups) {
    if (!selected.has(group.destination) || group.ids.length === 0) continue;
    const add = group.destination === "inbox" ? ["INBOX"] : [await api.labelIdFor(group.destination)];
    await api.batchModify(group.ids, add, screenerLabelIds);
    moved += group.ids.length;
  }

  // Lift the hold (the standing from: filter) only for senders with nothing
  // left behind; a sender split across an unticked group stays held.
  const released = Object.entries(plan.destinationsBySender)
    .filter(([, dests]) => dests.every((d) => selected.has(d)))
    .map(([address]) => address);
  const releasedSet = new Set(released);
  const screenerSet = new Set(screenerLabelIds);
  let filtersRemoved = 0;
  for (const f of await api.listFilters()) {
    const from = f.criteria?.from?.trim().toLowerCase();
    if (!from || !releasedSet.has(from)) continue;
    if (!(f.action?.addLabelIds ?? []).some((id) => screenerSet.has(id))) continue;
    await api.deleteFilter(f.id);
    filtersRemoved++;
  }
  return { moved, released, filtersRemoved };
}
