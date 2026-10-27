// The background worker's view of the mail index. Instead of scanning mail
// itself every 6 hours (and every 5 minutes for time limits), it brings the
// index up to date from the change feed, a couple of quota units, and reads
// senders from it. A provider whose index isn't built yet, or that has no
// change feed, is left to the old scans until the dashboard builds it.
import { markRepliesToYou } from "./correspondents";
import { buildCorrespondents, mergeCorrespondentAddresses, type Correspondent } from "./correspondents";
import { log } from "./log";
import { openMailIndex, type MailIndexStore } from "./mailIndex";
import { readMailIndex, syncMailIndex } from "./mailSync";
import type { EmailProvider, NormalizedMessageMetadata } from "./providers/emailProvider";
import { summarizeCombined, type SenderSummary } from "./senderModel";
import { mutateSettings, type ClusterSettings } from "./settingsStore";
import { tryWithStorageLock } from "./storageLock";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The lock the dashboard's index sync holds (see dashboard startIndexSync). */
export function mailIndexLockKey(provider: EmailProvider): string {
  return `mail-index:${provider.id}`;
}

/**
 * Applies the change feed for each provider whose index is built, without
 * waiting if the dashboard is mid-sync (its build may hold the lock for many
 * minutes; the index is then read as it stands). Returns the providers whose
 * index can be read in place of a scan.
 */
export async function refreshIndexForBackground(
  providers: readonly EmailProvider[],
  windowDays: number,
  store?: MailIndexStore,
): Promise<EmailProvider[]> {
  const index = store ?? (await openMailIndex());
  const ready: EmailProvider[] = [];
  for (const provider of providers) {
    if (!provider.listChangesSince) continue;
    const state = await index.getState(provider.id);
    if (!state?.complete || !state.cursor) continue;
    try {
      const token = await provider.getAuthToken(false);
      await tryWithStorageLock(mailIndexLockKey(provider), () =>
        syncMailIndex(provider, token, index, { windowDays, changesOnly: true }),
      );
    } catch (err) {
      // A failed refresh still leaves a usable index from the last sync.
      log.error(`Background mail index refresh failed for ${provider.id}`, err);
    }
    const after = await index.getState(provider.id);
    if (after?.complete) ready.push(provider);
  }
  return ready;
}

export interface IndexedSenders {
  /** Senders in the clean-up lane within the scan window. */
  cleanup: SenderSummary[];
  /** Senders of the newest inbox mail within the security window. */
  security: SenderSummary[];
}

/** Sender summaries from the index, in the same shape the scans produced. */
export async function readIndexedSenders(
  providers: readonly EmailProvider[],
  options: { scanWindowDays: number; securityWindowDays: number; securityMax: number; now?: number },
  store?: MailIndexStore,
): Promise<IndexedSenders> {
  const index = store ?? (await openMailIndex());
  const now = options.now ?? Date.now();
  const metas = (await readMailIndex(index, providers)).sort((a, b) => b.receivedAt - a.receivedAt);
  const within = (days: number) => (m: NormalizedMessageMetadata) => m.receivedAt >= now - days * DAY_MS;
  const cleanup = summarizeCombined(metas.filter(within(options.scanWindowDays)), 0, false).cleanup;
  const security = summarizeCombined(
    metas.filter(within(options.securityWindowDays)),
    options.securityMax,
    false,
  ).security;
  const sent = (await Promise.all(providers.map((p) => index.allSent(p.id)))).flat();
  markRepliesToYou([...cleanup, ...security], metas, sent);
  return { cleanup, security };
}

/**
 * A metadata map seeded from the index, in the shape the scan helpers take as
 * their cache (`${provider}:${id}`). Messages the index doesn't have are
 * fetched by the caller as before; `saveFetched` then writes them back.
 */
export async function indexSeededCache(
  provider: EmailProvider,
  ids: readonly string[],
  store?: MailIndexStore,
): Promise<{ cache: Map<string, NormalizedMessageMetadata>; saveFetched: () => Promise<void> }> {
  const index = store ?? (await openMailIndex());
  const rows = await index.get(provider.id, [...ids]);
  const cache = new Map(rows.map((row) => [`${provider.id}:${row.id}`, row] as const));
  const seeded = new Set(cache.keys());
  return {
    cache,
    saveFetched: async () => {
      const fetched = [...cache].filter(([key]) => !seeded.has(key)).map(([, row]) => row);
      try {
        await index.put(fetched);
      } catch (err) {
        log.error("Could not save fetched messages to the mail index", err);
      }
    },
  };
}

/**
 * Everyone in the index's sent store joins settings.sentCorrespondents, the
 * "people you write to" list that protection, the Screener and the scam
 * verdict read. Stamps fetchedAt, so the old 150-message weekly sent scan
 * stays idle while the index keeps the list current. Returns the settings
 * as written, or undefined when there was no sent mail to add.
 */
export async function applyIndexedCorrespondents(
  providers: readonly EmailProvider[],
  store?: MailIndexStore,
): Promise<ClusterSettings | undefined> {
  const index = store ?? (await openMailIndex());
  const correspondents: Correspondent[] = [];
  for (const provider of providers) {
    const records = await index.allSent(provider.id);
    if (records.length === 0) continue;
    const state = await index.getState(provider.id);
    correspondents.push(...buildCorrespondents(records, state?.accountId ? [state.accountId] : []));
  }
  if (correspondents.length === 0) return undefined;
  correspondents.sort((a, b) => b.sentCount - a.sentCount || b.lastSentAt - a.lastSentAt);
  return await mutateSettings((current) => ({
    ...current,
    sentCorrespondents: {
      addresses: mergeCorrespondentAddresses(current.sentCorrespondents.addresses, correspondents),
      fetchedAt: Date.now(),
    },
  }));
}
