import { log } from "./log";
import type { EmailProvider, ProviderId } from "./providers/emailProvider";
import type { SenderSummary } from "./senderModel";
import { updateSettings, type ClusterSettings } from "./settingsStore";

// The Screener (Clean Email's headline feature): hold mail from senders you've
// never corresponded with until you decide. "Known" = anyone on your explicit
// allowlist plus everyone you've emailed (sentCorrespondents, refreshed on a
// TTL). Provider-agnostic filtering — whether a given sender's provider can
// actually hold mail (needs EmailProvider.screenSender) is checked by the
// caller, not here.

export const SENT_CORRESPONDENTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sentCorrespondentsStale(settings: ClusterSettings): boolean {
  return Date.now() - settings.sentCorrespondents.fetchedAt > SENT_CORRESPONDENTS_TTL_MS;
}

/**
 * Refreshes the "have I actually emailed this person" allowlist across every
 * connected provider that supports it. Shared by background.ts's periodic
 * triage (unconditional -- this signal now also feeds the general
 * protection gate, see protectionPolicy.ts, not just the opt-in Screener)
 * and screenerTab.ts's "just turned Screener on" foreground refresh.
 * TTL-gated internally, so calling it when already fresh is a cheap no-op.
 */
export async function refreshSentCorrespondents(
  settings: ClusterSettings,
  providerById: Map<ProviderId, EmailProvider>,
): Promise<ClusterSettings["sentCorrespondents"]> {
  if (!sentCorrespondentsStale(settings)) return settings.sentCorrespondents;
  const addresses = new Set(settings.sentCorrespondents.addresses);
  let anySucceeded = false;
  for (const provider of providerById.values()) {
    if (!provider.listSentCorrespondents) continue;
    const token = await provider.getAuthToken(false).catch(() => null);
    if (!token) continue;
    try {
      for (const addr of await provider.listSentCorrespondents(token)) addresses.add(addr);
      anySucceeded = true;
    } catch (err) {
      log.error("Sent-correspondent refresh failed", provider.id, err);
    }
  }
  if (!anySucceeded) return settings.sentCorrespondents;
  const sent = { addresses: [...addresses], fetchedAt: Date.now() };
  await updateSettings({ sentCorrespondents: sent });
  return sent;
}

/** A list or an automated sender, not a person writing for the first time. */
function looksBulk(s: SenderSummary): boolean {
  return Boolean(s.unsubscribe.postUrl || s.unsubscribe.httpUrl || s.unsubscribe.mailto) || s.messages.some((m) => m.looksAutomated);
}

export function knownSenderSet(settings: ClusterSettings): Set<string> {
  return new Set(
    [...settings.screenerAllowlist, ...settings.sentCorrespondents.addresses].map((a) => a.toLowerCase()),
  );
}

/**
 * Senders (any provider) that should sit in the Screener: not known, not
 * starred, not marked important by the provider, not replying to your own
 * mail, and not already handled elsewhere (`excluded` = muted ∪
 * already-screened).
 */
export function pendingScreenerSenders(
  senders: SenderSummary[],
  known: Set<string>,
  excluded: Set<string> = new Set(),
  holdPeople = true,
): SenderSummary[] {
  return senders.filter(
    (s) =>
      (holdPeople || looksBulk(s)) &&
      s.protectedMessageIds.length === 0 &&
      !s.messages.some((m) => m.providerMarkedPersonal || m.repliesToYou) &&
      !known.has(s.address.toLowerCase()) &&
      !excluded.has(s.address.toLowerCase()),
  );
}
