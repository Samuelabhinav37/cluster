import type { SenderSummary } from "./senderModel";
import type { ClusterSettings } from "./settingsStore";

// The Screener (Clean Email's headline feature): hold mail from senders you've
// never corresponded with until you decide. "Known" = anyone on your explicit
// allowlist plus everyone you've emailed (sentCorrespondents, refreshed on a
// TTL). Gmail-only — it needs the filters API.

export const SENT_CORRESPONDENTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sentCorrespondentsStale(settings: ClusterSettings): boolean {
  return Date.now() - settings.sentCorrespondents.fetchedAt > SENT_CORRESPONDENTS_TTL_MS;
}

export function knownSenderSet(settings: ClusterSettings): Set<string> {
  return new Set(
    [...settings.screenerAllowlist, ...settings.sentCorrespondents.addresses].map((a) => a.toLowerCase()),
  );
}

/**
 * Gmail senders that should sit in the Screener: not known, not starred, and
 * not already handled elsewhere (`excluded` = muted ∪ already-screened).
 */
export function pendingScreenerSenders(
  senders: SenderSummary[],
  known: Set<string>,
  excluded: Set<string> = new Set(),
): SenderSummary[] {
  return senders.filter(
    (s) =>
      s.provider === "gmail" &&
      s.protectedMessageIds.length === 0 &&
      !known.has(s.address.toLowerCase()) &&
      !excluded.has(s.address.toLowerCase()),
  );
}
