import { log } from "./log";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";

// A dashboard scan fetches one 20-unit messages.get per message. Without a
// cache that survives the page, every dashboard open re-fetches the entire
// mailbox from scratch — the single biggest source of quota pressure once the
// tool is used repeatedly.
//
// Message metadata (From / Subject / List-Unsubscribe / auth results / size /
// receivedAt) is immutable once the message is delivered. The only fields that
// drift are label-derived — `unread` and `isProtected` (starred). We handle
// that by never serving *recent* mail from the warm cache (see FRESH_WINDOW_MS
// below): the user is only realistically starring / reading mail from the last
// couple of weeks, and an "Rescan" bypasses the cache entirely.

const STORAGE_KEY = "clusterMetadataCache";
// Cap the stored map so a warm rescan pays list quota (5 units/page) instead of
// re-fetching the whole mailbox (20 units per messages.get). The manifest now
// carries `unlimitedStorage`, so this is bounded by serialize/parse cost per
// scan rather than the old 10 MB chrome.storage.local ceiling — 2,000 entries
// at ~1.5 KB each is ~3 MB, which covers the default scan (maxMessagesPer
// provider 150) and a generously widened one. A user who pushes the scan limit
// toward its 5,000 max keeps ~40% of the mailbox warm rather than losing the
// cache almost entirely, which the previous 400-entry cap did.
const MAX_ENTRIES = 2000;
// Mail newer than this is always re-fetched, so a freshly starred or newly
// read message can't be served with stale label state into a bulk action.
// A week keeps the bulk of an older mailbox warm while still re-reading
// everything the user has plausibly touched since the last scan.
export const FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type StoredCache = Record<string, NormalizedMessageMetadata>;

/**
 * Loads the warm metadata cache, dropping entries for mail received within the
 * last {@link FRESH_WINDOW_MS} so their label-derived fields are re-read. The
 * returned Map is the same shape `buildSenderSummaries` already accepts as its
 * `metadataCache` argument.
 */
export async function loadMetadataCache(
  now: number = Date.now(),
): Promise<Map<string, NormalizedMessageMetadata>> {
  const map = new Map<string, NormalizedMessageMetadata>();
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const raw = (stored[STORAGE_KEY] ?? {}) as StoredCache;
    const cutoff = now - FRESH_WINDOW_MS;
    for (const [key, meta] of Object.entries(raw)) {
      if (typeof meta?.receivedAt === "number" && meta.receivedAt < cutoff) {
        map.set(key, meta);
      }
    }
  } catch (error) {
    log.error("metadataCache: could not load, starting cold", error);
  }
  return map;
}

/**
 * Persists the cache after a scan. When over {@link MAX_ENTRIES}, keeps the
 * most-recently-received messages: those sit closest to the fresh window and
 * are the likeliest to still be in a later scan's candidate set, so retaining
 * them maximises the warm-hit rate next time. (Insertion order is not a useful
 * proxy here — `buildSenderSummaries` fetches concurrently, so it's roughly
 * arbitrary.) A write failure is non-fatal — the next scan is simply cold.
 */
export async function saveMetadataCache(
  cache: Map<string, NormalizedMessageMetadata>,
): Promise<void> {
  try {
    let kept = [...cache.entries()];
    if (kept.length > MAX_ENTRIES) {
      kept = kept
        .sort(([, a], [, b]) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0))
        .slice(0, MAX_ENTRIES);
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: Object.fromEntries(kept) });
  } catch (error) {
    log.error("metadataCache: could not save", error);
  }
}

/** Wipes the warm cache so the next scan re-fetches everything. Wired to the
 * explicit "Rescan" control. */
export async function clearMetadataCache(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch (error) {
    log.error("metadataCache: could not clear", error);
  }
}
