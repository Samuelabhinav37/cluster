import { log } from "./log";

// Cluster's own GitHub Pages -- the one external host this project talks to
// beyond the Gmail/Outlook APIs it already calls. Publishes a small set of
// public reference datasets (known-bad domains, brand-sending-domains) on a
// schedule (.github/workflows/publish-datasets.yml). Nothing about the user
// or their mail is ever included in a request here: it's a plain GET for a
// static file, identical for every install, the same shape as a software
// update check. See docs/privacy.md for the user-facing explanation.
export const DATASET_BASE_URL = "https://samuelabhinav37.github.io/cluster";

// Don't refetch more than this often even if the caller (the background
// alarm, possibly after a service-worker restart) asks more frequently --
// keeps a misbehaving trigger from hammering the endpoint.
const MIN_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface CachedDataset<T> {
  data: T;
  fetchedAt: number;
}

function storageKeyFor(name: string): string {
  return `remoteDataset:${name}`;
}

// This module is imported transitively by most of src/lib (threatSignals,
// blocklist, spamList all hydrate from it at load time), so it has to
// tolerate running somewhere chrome.storage isn't available -- a plain unit
// test that never stubs a chrome global, for instance -- by treating that
// the same as "nothing cached yet" rather than throwing.
function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

async function readCache<T>(name: string): Promise<CachedDataset<T> | undefined> {
  if (!hasChromeStorage()) return undefined;
  const key = storageKeyFor(name);
  const stored = (await chrome.storage.local.get(key)) as Record<string, CachedDataset<T> | undefined>;
  return stored[key];
}

/**
 * The freshest data available for `name`: a live cache if one exists,
 * otherwise `fallback` (the dataset bundled into the extension at build
 * time, always complete enough on its own). Always local and fast -- never
 * fetches, so reading a dataset never adds network latency to a scan.
 */
export async function getDataset<T>(name: string, fallback: T): Promise<T> {
  const cached = await readCache<T>(name);
  return cached?.data ?? fallback;
}

/**
 * Fetches the published dataset for `name` from `${DATASET_BASE_URL}/{path}`
 * and updates its cache if the response is present and passes `isValid`.
 * Meant to be called by the background alarm on a schedule -- never by
 * anything on the interactive scan path, so a slow or failed fetch is never
 * user-visible. Never throws: a failed fetch just leaves the existing cache
 * (or the bundled fallback) in place. Returns whether the cache changed.
 */
export async function refreshDataset<T>(
  name: string,
  path: string,
  isValid: (data: unknown) => data is T,
): Promise<boolean> {
  if (!hasChromeStorage()) return false;
  const cached = await readCache<T>(name);
  if (cached && Date.now() - cached.fetchedAt < MIN_REFRESH_INTERVAL_MS) return false;

  try {
    const response = await fetch(`${DATASET_BASE_URL}/${path}`);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const data: unknown = await response.json();
    if (!isValid(data)) throw new Error(`unexpected shape for dataset "${name}"`);
    const key = storageKeyFor(name);
    const entry: CachedDataset<T> = { data, fetchedAt: Date.now() };
    await chrome.storage.local.set({ [key]: entry });
    return true;
  } catch (err) {
    log.error(`Dataset refresh failed: ${name}`, err);
    return false;
  }
}
