// Keeps the local mail index (mailIndex.ts) in step with one mailbox.
//
// First run: list the scan population (newest first, up to the cap) and read
// each message's headers once. The caller is told as soon as the newest
// `quickCount` are in, so the dashboard can show results while older mail is
// still being read.
//
// After that: ask the provider what changed (Gmail history) and apply it.
// New mail is read, deleted mail is dropped, and read/starred/category
// changes are applied from the label events without re-reading anything.
// A provider with no change feed (Outlook today) re-lists, reads only
// messages the index doesn't have, and re-reads the last week, where read and
// flag state still moves.
//
// Interrupted runs resume: rows are written in small batches and the change
// cursor captured before the first attempt is kept until a build finishes.
import { mapWithConcurrency } from "./concurrency";
import { log } from "./log";
import { MAIL_INDEX_CAP, type MailIndexState, type MailIndexStore } from "./mailIndex";
import type { EmailProvider, NormalizedMessageMetadata } from "./providers/emailProvider";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Without a change feed, mail this recent is re-read so read/flag state is current. */
export const REFRESH_WINDOW_MS = 7 * DAY_MS;
const WRITE_BATCH = 25;
/** First list page, read before the full listing so the first screen is quick. */
const FIRST_PAGE = 500;
/** 150 headers cost 3,000 of Gmail's ~5,500 units a minute, so the first
 * screen fits inside one minute's quota with room for the page's own calls. */
export const DEFAULT_QUICK_COUNT = 150;
const FETCH_CONCURRENCY = 4;

export type SyncPhase = "listing" | "reading" | "updating" | "done";

export interface SyncProgress {
  phase: SyncPhase;
  /** Messages read so far in this run. */
  done: number;
  /** Messages this run needs to read. */
  total: number;
}

export interface SyncOptions {
  windowDays: number;
  cap?: number;
  /** Signal `onQuickReady` once this many of the newest messages are in. */
  quickCount?: number;
  onProgress?: (progress: SyncProgress) => void;
  /** Called once, when the index holds enough to show (or right away when
   * it already did before this run). */
  onQuickReady?: () => void;
  /** Awaited between batches; lets the caller hold the run back while user
   * actions need the quota. */
  waitForHeadroom?: () => Promise<void>;
  now?: () => number;
}

export interface SyncResult {
  /** "build" read a listing; "changes" applied a change feed. */
  mode: "build" | "changes";
  read: number;
  removed: number;
  updated: number;
}

/** True when the run changed anything a screen would show. */
export function syncChangedIndex(result: SyncResult): boolean {
  return result.read + result.removed + result.updated > 0;
}

export async function syncMailIndex(
  provider: EmailProvider,
  token: string,
  store: MailIndexStore,
  options: SyncOptions,
): Promise<SyncResult> {
  const now = options.now ?? Date.now;
  const cap = options.cap ?? MAIL_INDEX_CAP;
  let quickSignalled = false;
  const signalQuick = () => {
    if (quickSignalled) return;
    quickSignalled = true;
    options.onQuickReady?.();
  };

  let state: MailIndexState = (await store.getState(provider.id)) ?? {
    provider: provider.id,
    complete: false,
  };

  if (provider.getAccountId) {
    const accountId = await provider.getAccountId(token);
    if (state.accountId && accountId && state.accountId !== accountId) {
      // Signed into a different mailbox: never show the old one's mail.
      await store.clear(provider.id);
      state = { provider: provider.id, complete: false };
    }
    if (accountId) state.accountId = accountId;
  }

  // An index that was built before is good enough to show straight away.
  // On failure nothing is signalled: the caller decides what to show.
  if (state.complete) signalQuick();

  {
    const sameWindow = state.windowDays === undefined || state.windowDays === options.windowDays;
    if (state.complete && state.cursor && sameWindow && provider.listChangesSince) {
      const changes = await provider.listChangesSince(token, state.cursor);
      if (!changes.expired) {
        const result = await applyChanges(provider, token, store, changes, options);
        await refreshRiskyIds(provider, token, state, options.windowDays);
        await enforceLimits(provider, store, cap, options.windowDays, now);
        await store.setState({ ...state, cursor: changes.cursor, lastSyncAt: now() });
        options.onProgress?.({ phase: "done", done: result.read, total: result.read });
        return result;
      }
      // Too long since the last pass: rebuild from a fresh listing below.
      state = { ...state, cursor: undefined };
    }

    if (provider.getChangeCursor && !state.pendingCursor) {
      // Captured before listing, so mail arriving mid-build is replayed next time.
      state.pendingCursor = await provider.getChangeCursor(token);
    }
    await store.setState(state);

    const result = await buildFromListing(provider, token, store, cap, options, now, signalQuick);
    await refreshRiskyIds(provider, token, state, options.windowDays);
    await enforceLimits(provider, store, cap, options.windowDays, now);
    await store.setState({
      ...state,
      complete: true,
      windowDays: options.windowDays,
      cursor: state.pendingCursor ?? state.cursor,
      pendingCursor: undefined,
      lastSyncAt: now(),
    });
    signalQuick();
    options.onProgress?.({ phase: "done", done: result.read, total: result.read });
    return result;
  }
}

async function buildFromListing(
  provider: EmailProvider,
  token: string,
  store: MailIndexStore,
  cap: number,
  options: SyncOptions,
  now: () => number,
  signalQuick: () => void,
): Promise<SyncResult> {
  const quickCount = Math.min(options.quickCount ?? DEFAULT_QUICK_COUNT, cap);
  options.onProgress?.({ phase: "listing", done: 0, total: 0 });

  // Quick view first: one list page, then the newest unread-by-us messages,
  // unpaced. Listing all 20,000 ids first would delay the first screen by
  // dozens of list calls.
  const firstPage = await provider.listCandidateMessages(
    token,
    Math.min(cap, FIRST_PAGE),
    options.windowDays,
    "combined",
  );
  let known = await store.ids(provider.id);
  const quickIds = firstPage
    .slice(0, quickCount)
    .filter((stub) => !known.has(stub.id))
    .map((stub) => stub.id);
  let quickRead = 0;
  if (quickIds.length > 0) {
    quickRead = await readInto(provider, token, store, quickIds, options, false);
  }
  signalQuick();

  const stubs =
    firstPage.length < Math.min(cap, FIRST_PAGE)
      ? firstPage
      : await provider.listCandidateMessages(token, cap, options.windowDays, "combined");
  const listed = new Set(stubs.map((stub) => stub.id));
  known = await store.ids(provider.id);

  // Gone from the listing: trashed, archived out of every lane, or aged out.
  const gone = [...known].filter((id) => !listed.has(id));
  await store.remove(provider.id, gone);

  // Without a change feed, recent rows are re-read for current read/flag state.
  let stale = new Set<string>();
  if (!provider.listChangesSince) {
    const cutoff = now() - REFRESH_WINDOW_MS;
    const rows = await store.get(
      provider.id,
      stubs.filter((stub) => known.has(stub.id)).map((stub) => stub.id),
    );
    stale = new Set(rows.filter((row) => row.receivedAt >= cutoff).map((row) => row.id));
  }

  // Listing order is newest first. The rest is paced so the person's own
  // clicks keep some of Gmail's per-minute quota.
  const toRead = stubs.filter((stub) => !known.has(stub.id) || stale.has(stub.id)).map((s) => s.id);
  const read = await readInto(provider, token, store, toRead, options, true);
  return { mode: "build", read: quickRead + read, removed: gone.length, updated: 0 };
}

async function applyChanges(
  provider: EmailProvider,
  token: string,
  store: MailIndexStore,
  changes: Awaited<ReturnType<NonNullable<EmailProvider["listChangesSince"]>>>,
  options: SyncOptions,
): Promise<SyncResult> {
  options.onProgress?.({ phase: "updating", done: 0, total: 0 });
  const removed = new Set(changes.removed);
  const labelsById = new Map(changes.labelUpdates.map((u) => [u.id, u.labelIds]));
  const known = await store.ids(provider.id);
  const toRead = new Set<string>();

  // New mail in scope gets read. Mail whose labels say it's out of scope
  // (spam, trash, a draft) is skipped without a fetch.
  for (const id of changes.added) {
    if (known.has(id) || removed.has(id)) continue;
    const labelIds = labelsById.get(id);
    if (labelIds && provider.applyLabelIds && !inScope(provider, labelIds)) continue;
    toRead.add(id);
  }

  // Label changes on known rows are applied in place; a row that left the
  // scope is dropped. A message that newly entered the scope is read.
  const updates: NormalizedMessageMetadata[] = [];
  const dropped: string[] = [...removed].filter((id) => known.has(id));
  const knownChanged = [...labelsById.keys()].filter((id) => known.has(id) && !removed.has(id));
  const rows = await store.get(provider.id, knownChanged);
  for (const row of rows) {
    const next = provider.applyLabelIds?.(row, labelsById.get(row.id) ?? []);
    if (next === null) dropped.push(row.id);
    else if (next) updates.push(next);
  }
  for (const [id, labelIds] of labelsById) {
    if (!known.has(id) && !removed.has(id) && inScope(provider, labelIds)) toRead.add(id);
  }

  await store.put(updates);
  await store.remove(provider.id, dropped);
  const read = await readInto(provider, token, store, [...toRead], options, false);
  return { mode: "changes", read, removed: dropped.length, updated: updates.length };
}

function inScope(provider: EmailProvider, labelIds: string[]): boolean {
  if (!provider.applyLabelIds) return true;
  return provider.applyLabelIds(PROBE, labelIds) !== null;
}

/** A throwaway row used only to ask a provider whether labels are in scope. */
const PROBE: NormalizedMessageMetadata = {
  id: "",
  provider: "gmail",
  fromAddress: "",
  fromDisplayName: "",
  replyToAddress: "",
  subject: "",
  isProtected: false,
  unread: false,
  sizeBytes: 0,
  unsubscribe: {},
  receivedAt: 0,
};

/** Reads headers for `ids` in order and writes them in small batches, so an
 * interrupted run keeps what it already paid for. Returns how many were read.
 * A message that fails to load is skipped (and retried on a later run). */
async function readInto(
  provider: EmailProvider,
  token: string,
  store: MailIndexStore,
  ids: string[],
  options: SyncOptions,
  paced: boolean,
): Promise<number> {
  let doneCount = 0;
  for (let start = 0; start < ids.length; start += WRITE_BATCH) {
    if (paced) await options.waitForHeadroom?.();
    const batch = ids.slice(start, start + WRITE_BATCH);
    const rows = await mapWithConcurrency(batch, FETCH_CONCURRENCY, async (id) => {
      try {
        return await provider.getMessageMetadata(token, id);
      } catch (error) {
        log.error(`mailSync: could not read message ${id}`, error);
        return undefined;
      }
    });
    // A message trashed or moved to spam since it was listed doesn't belong.
    const found = rows.filter(
      (row): row is NormalizedMessageMetadata =>
        Boolean(row) && (!row?.labelIds || inScope(provider, row.labelIds)),
    );
    await store.put(found);
    doneCount += batch.length;
    options.onProgress?.({ phase: "reading", done: doneCount, total: ids.length });
  }
  return doneCount;
}

async function refreshRiskyIds(
  provider: EmailProvider,
  token: string,
  state: MailIndexState,
  windowDays: number,
): Promise<void> {
  if (!provider.listRiskyAttachmentMessageIds) return;
  try {
    state.riskyIds = [...(await provider.listRiskyAttachmentMessageIds(token, windowDays))];
  } catch {
    // Best-effort, as in the scan: a failed lookup only skips this one check.
  }
}

/** Drops rows past the scan window, then the oldest rows past the cap. */
async function enforceLimits(
  provider: EmailProvider,
  store: MailIndexStore,
  cap: number,
  windowDays: number,
  now: () => number,
): Promise<void> {
  const rows = await store.all(provider.id);
  const cutoff = now() - windowDays * DAY_MS;
  const sorted = rows.sort((a, b) => b.receivedAt - a.receivedAt);
  const drop = sorted.filter((row, i) => row.receivedAt < cutoff || i >= cap).map((row) => row.id);
  await store.remove(provider.id, drop);
}

/** Every indexed message for these providers, with the risky-attachment flag
 * from the last sync applied. */
export async function readMailIndex(
  store: MailIndexStore,
  providers: readonly EmailProvider[],
): Promise<NormalizedMessageMetadata[]> {
  const out: NormalizedMessageMetadata[] = [];
  for (const provider of providers) {
    const [rows, state] = await Promise.all([store.all(provider.id), store.getState(provider.id)]);
    const risky = new Set(state?.riskyIds ?? []);
    for (const row of rows) {
      out.push(risky.has(row.id) ? { ...row, hasRiskyAttachment: true } : row);
    }
  }
  return out;
}

/**
 * While a long first build is still running, the user can already act (trash,
 * label, archive). This replays the label and delete events since the build
 * started onto rows already in the index, so the next render doesn't show mail
 * the user just moved. It reads no messages and commits no cursor: the build
 * replays the same events again when it finishes, which is harmless.
 */
export async function catchUpIndex(
  provider: EmailProvider,
  token: string,
  store: MailIndexStore,
): Promise<void> {
  if (!provider.listChangesSince) return;
  const state = await store.getState(provider.id);
  const cursor = state?.pendingCursor ?? state?.cursor;
  if (!cursor) return;
  const changes = await provider.listChangesSince(token, cursor);
  if (changes.expired) return;
  const labelsById = new Map(changes.labelUpdates.map((u) => [u.id, u.labelIds]));
  const rows = await store.get(provider.id, [...labelsById.keys()]);
  const updates: NormalizedMessageMetadata[] = [];
  const dropped = [...changes.removed];
  for (const row of rows) {
    const next = provider.applyLabelIds?.(row, labelsById.get(row.id) ?? []);
    if (next === null) dropped.push(row.id);
    else if (next) updates.push(next);
  }
  await store.put(updates);
  await store.remove(provider.id, dropped);
}
