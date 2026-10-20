// Keeps the local mail index (mailIndex.ts) in step with one mailbox.
//
// First run: list the scan population (newest first, up to the cap) and read
// each message's headers once. The caller is told as soon as the newest
// `quickCount` are in, so the dashboard can show results while older mail is
// still being read.
//
// After that: ask the provider what changed (Gmail history, Outlook delta)
// and apply it. New mail is read, deleted mail is dropped, and read/starred/
// category changes are applied from the label events without re-reading
// anything. A provider with no change feed re-lists, reads only messages the
// index doesn't have, and re-reads the last week, where read and flag state
// still moves.
//
// Interrupted runs resume: rows are written in small batches and the change
// cursor captured during the first attempt is kept until a build finishes.
import { mapWithConcurrency } from "./concurrency";
import { log } from "./log";
import {
  MAIL_INDEX_CAP,
  MAIL_ROW_VERSION,
  MAIL_SCOPE_VERSION,
  type MailIndexState,
  type MailIndexStore,
} from "./mailIndex";
import type { EmailProvider, NormalizedMessageMetadata, SentRecord } from "./providers/emailProvider";

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

/** "reading" finds every sender (counting their mail as it goes); "detail"
 * then reads the counted mail one by one, at low priority. */
export type SyncPhase = "listing" | "reading" | "sent" | "detail" | "updating" | "done";

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
  /** Called when the Sent folder has been read, before older received mail,
   * so "people you write to" can be used without waiting for the whole build. */
  onSentReady?: () => Promise<void> | void;
  /** Called once every listed sender has been found and counted, before the
   * counted mail is read in detail. */
  onCounted?: () => Promise<void> | void;
  /** Only apply the change feed; never list, backfill or re-read rows. For
   * the background worker, which has minutes, not the hour a build can take.
   * Does nothing for an index that isn't built or has no usable cursor. */
  changesOnly?: boolean;
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

  // 1. Apply what changed since last time, when there's a usable cursor.
  let result: SyncResult = { mode: "changes", read: 0, removed: 0, updated: 0 };
  let applied = false;
  if (state.complete && state.cursor && provider.listChangesSince) {
    const changes = await provider.listChangesSince(token, state.cursor);
    if (changes.expired) {
      state = { ...state, cursor: undefined };
    } else {
      result = await applyChanges(provider, token, store, changes, options);
      state = { ...state, cursor: changes.cursor };
      applied = true;
      await store.setState(state);
    }
  }

  if (options.changesOnly) {
    if (applied) {
      await refreshRiskyIds(provider, token, state, options.windowDays);
      await enforceLimits(provider, store, cap, options.windowDays, now);
      await store.setState({ ...state, lastSyncAt: now() });
    }
    options.onProgress?.({ phase: "done", done: result.read, total: result.read });
    return result;
  }

  // 2. Re-list when there's no cursor, the scan window changed, or rows were
  //    stored before a field was added. Known mail isn't read again, except
  //    rows of an older shape.
  const windowChanged = state.windowDays !== undefined && state.windowDays !== options.windowDays;
  const rowsOutdated = state.complete && (state.rowVersion ?? 1) < MAIL_ROW_VERSION;
  const scopeWidened = state.complete && (state.scopeVersion ?? 1) < MAIL_SCOPE_VERSION;
  if (!applied || windowChanged || rowsOutdated || scopeWidened) {
    if (applied) {
      // Changes up to the cursor are already applied; replay from there.
      state.pendingCursor = state.cursor;
    }
    await store.setState(state);
    // Captured once the first screen is up but before the full listing, so
    // mail arriving mid-build is replayed next time. (Outlook pages its whole
    // inbox for a cursor; doing it first would hold the first screen back.)
    const captureCursor = async () => {
      if (!provider.getChangeCursor || state.pendingCursor) return;
      state.pendingCursor = await provider.getChangeCursor(token);
      await store.setState(state);
    };
    const build = await buildFromListing(provider, token, store, state, cap, options, now, signalQuick, captureCursor);
    result = {
      mode: "build",
      read: result.read + build.read,
      removed: result.removed + build.removed,
      updated: result.updated + build.updated,
    };
    state = {
      ...state,
      complete: true,
      windowDays: options.windowDays,
      rowVersion: MAIL_ROW_VERSION,
      scopeVersion: MAIL_SCOPE_VERSION,
      cursor: state.pendingCursor ?? state.cursor,
      pendingCursor: undefined,
    };
  } else if (!state.sentComplete) {
    // An index built before sent mail was indexed: read the Sent folder now.
    result.read += await backfillSent(provider, token, store, state, options);
  }

  await refreshRiskyIds(provider, token, state, options.windowDays);
  await enforceLimits(provider, store, cap, options.windowDays, now);
  await store.setState({ ...state, lastSyncAt: now() });
  signalQuick();
  options.onProgress?.({ phase: "done", done: result.read, total: result.read });
  return result;
}

/** Most sent messages read for "people you write to". */
export const SENT_CAP = 5_000;

/**
 * Reads the Sent folder (newest first, up to SENT_CAP) into the sent store,
 * skipping what's already there, paced like the rest of the backfill. Marks
 * the state once the listing has been read. Returns how many were read.
 */
async function backfillSent(
  provider: EmailProvider,
  token: string,
  store: MailIndexStore,
  state: MailIndexState,
  options: SyncOptions,
): Promise<number> {
  if (!provider.listSentMessageIds || !provider.getSentRecord) {
    state.sentComplete = true;
    return 0;
  }
  const ids = await provider.listSentMessageIds(token, SENT_CAP);
  const known = await store.sentIds(provider.id);
  const toRead = ids.filter((id) => !known.has(id));
  const read = await readSentInto(provider, token, store, toRead, options, true);
  state.sentComplete = true;
  await store.setState(state);
  await options.onSentReady?.();
  return read;
}

async function readSentInto(
  provider: EmailProvider,
  token: string,
  store: MailIndexStore,
  ids: string[],
  options: SyncOptions,
  paced: boolean,
): Promise<number> {
  if (!provider.getSentRecord) return 0;
  let doneCount = 0;
  for (let start = 0; start < ids.length; start += WRITE_BATCH) {
    if (paced) await options.waitForHeadroom?.();
    const batch = ids.slice(start, start + WRITE_BATCH);
    const rows = await mapWithConcurrency(batch, FETCH_CONCURRENCY, async (id) => {
      try {
        return await provider.getSentRecord?.(token, id);
      } catch (error) {
        log.error(`mailSync: could not read sent message ${id}`, error);
        return undefined;
      }
    });
    await store.putSent(rows.filter((row): row is SentRecord => Boolean(row)));
    doneCount += batch.length;
    options.onProgress?.({ phase: "sent", done: doneCount, total: ids.length });
  }
  return doneCount;
}

async function buildFromListing(
  provider: EmailProvider,
  token: string,
  store: MailIndexStore,
  state: MailIndexState,
  cap: number,
  options: SyncOptions,
  now: () => number,
  signalQuick: () => void,
  captureCursor: () => Promise<void>,
): Promise<SyncResult> {
  const quickCount = Math.min(options.quickCount ?? DEFAULT_QUICK_COUNT, cap);
  options.onProgress?.({ phase: "listing", done: 0, total: 0 });

  // Quick view first: one list page, then the newest messages the index
  // doesn't have, unpaced. Listing all 20,000 ids first would delay the first
  // screen by dozens of list calls.
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
  await captureCursor();

  // Who you write to matters more than older bulk mail, so Sent goes next.
  let sentRead = 0;
  if (!state.sentComplete) sentRead = await backfillSent(provider, token, store, state, options);

  const stubs =
    firstPage.length < Math.min(cap, FIRST_PAGE)
      ? firstPage
      : await provider.listCandidateMessages(token, cap, options.windowDays, "combined");
  const listed = new Set(stubs.map((stub) => stub.id));
  known = await store.ids(provider.id);

  // Gone from the listing: trashed, archived out of every lane, or aged out.
  const gone = [...known].filter((id) => !listed.has(id));
  await store.remove(provider.id, gone);

  // Rows to read again: an older stored shape, or (without a change feed)
  // recent mail whose read/flag state may have moved.
  const cutoff = now() - REFRESH_WINDOW_MS;
  const knownRows = await store.get(
    provider.id,
    stubs.filter((stub) => known.has(stub.id)).map((stub) => stub.id),
  );
  const outdated = new Set<string>();
  const stale = new Set<string>();
  for (const row of knownRows) {
    if ((row.v ?? 1) < MAIL_ROW_VERSION) outdated.add(row.id);
    else if (!provider.listChangesSince && row.receivedAt >= cutoff) stale.add(row.id);
  }

  // Newest first: unknown and stale mail, counting senders as they appear;
  // then the counted mail in detail, and older-shape rows last.
  const fresh = stubs.filter((stub) => !known.has(stub.id) || stale.has(stub.id)).map((s) => s.id);
  const upgrade = stubs.filter((stub) => outdated.has(stub.id)).map((s) => s.id);
  const discovery = await discoverAndCount(provider, token, store, fresh, listed, options, now);
  const rest = [...discovery.pending, ...upgrade];
  const detail = await readInto(provider, token, store, rest, options, true, "detail");
  return {
    mode: "build",
    read: quickRead + sentRead + discovery.read + detail,
    removed: gone.length,
    updated: 0,
  };
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

  // Mail you sent since last time feeds "people you write to".
  const sentAdded = changes.added.filter((id) => {
    const labelIds = labelsById.get(id);
    return Boolean(labelIds && provider.isSentLabels?.(labelIds));
  });
  await store.removeSent(provider.id, [...removed]);
  const sentRead = await readSentInto(provider, token, store, sentAdded, options, false);
  return { mode: "changes", read: read + sentRead, removed: dropped.length, updated: updates.length };
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
  phase: SyncPhase = "reading",
): Promise<number> {
  let doneCount = 0;
  for (let start = 0; start < ids.length; start += WRITE_BATCH) {
    if (paced) await options.waitForHeadroom?.();
    await readRows(provider, token, store, ids.slice(start, start + WRITE_BATCH));
    doneCount += Math.min(WRITE_BATCH, ids.length - start);
    options.onProgress?.({ phase, done: doneCount, total: ids.length });
  }
  return doneCount;
}

/** Reads one batch of headers and stores the ones still in scope. */
async function readRows(
  provider: EmailProvider,
  token: string,
  store: MailIndexStore,
  batch: string[],
): Promise<NormalizedMessageMetadata[]> {
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
  return found;
}

/** Most ids counted for one sender. */
const CENSUS_MAX_PER_SENDER = 5_000;
/** Census rows are saved this often (in batches read) so screens get them early. */
const CENSUS_SAVE_EVERY = 25;
/** Smaller batches while finding senders: a batch is read before any of its
 * senders can be counted, so a big one wastes reads on the same sender. */
const DISCOVERY_BATCH = 8;
const BULK_CATEGORIES = new Set(["CATEGORY_UPDATES", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"]);

/** Whether one search to count a sender's mail is likely to pay for itself
 * (5 units against 20 per message read): bulk mail, or a second message. */
function worthCounting(row: NormalizedMessageMetadata, seen: number): boolean {
  if (seen >= 2) return true;
  const { postUrl, httpUrl, mailto } = row.unsubscribe;
  if (row.listId || postUrl || httpUrl || mailto || row.gmailPromotion) return true;
  if (row.precedence && /bulk|list|junk/i.test(row.precedence)) return true;
  if (row.autoSubmitted && row.autoSubmitted.toLowerCase() !== "no") return true;
  return Boolean(row.labelIds?.some((label) => BULK_CATEGORIES.has(label)));
}

/**
 * "Fetch one, count many." Reads listed messages newest first, but skips any
 * message already counted under its sender. When a read message comes from a
 * sender worth counting, one search lists all of that sender's mail in the
 * listing, so it isn't read one by one just to learn who sent it. Every
 * sender shows up, with its real volume, after reading roughly one message
 * per sender instead of every message. Returns how many were read, and the
 * counted messages still to read in detail.
 */
async function discoverAndCount(
  provider: EmailProvider,
  token: string,
  store: MailIndexStore,
  queue: string[],
  listed: Set<string>,
  options: SyncOptions,
  now: () => number,
): Promise<{ read: number; pending: string[] }> {
  if (!provider.listMessageIdsFrom) {
    return { read: 0, pending: queue };
  }
  const labelled = async (label: "unread" | "starred") => {
    try {
      return await provider.listLabelledIds?.(token, label, listed.size, options.windowDays);
    } catch (error) {
      log.error(`mailSync: could not list ${label} mail`, error);
      return undefined;
    }
  };
  const unreadIds = await labelled("unread");
  const starredIds = await labelled("starred");

  const counted = new Map<string, Set<string>>();
  const claimed = new Set<string>();
  const seen = new Map<string, number>();
  const readIds = new Set<string>();
  let position = 0;
  let batches = 0;

  const saveCensus = async () => {
    const at = now();
    const countIn = (ids: Set<string>, set: Set<string> | undefined) =>
      set ? [...ids].filter((id) => set.has(id)).length : -1;
    await store.putCensus(
      [...counted].map(([address, ids]) => ({
        provider: provider.id,
        address,
        ids: [...ids],
        unread: countIn(ids, unreadIds),
        starred: countIn(ids, starredIds),
        countedAt: at,
      })),
    );
  };

  while (position < queue.length) {
    const batch: string[] = [];
    while (batch.length < DISCOVERY_BATCH && position < queue.length) {
      const id = queue[position++];
      if (!claimed.has(id)) batch.push(id);
    }
    if (batch.length === 0) break;
    await options.waitForHeadroom?.();
    const rows = await readRows(provider, token, store, batch);
    for (const id of batch) readIds.add(id);
    for (const row of rows) {
      const address = row.fromAddress;
      if (!address) continue;
      const times = (seen.get(address) ?? 0) + 1;
      seen.set(address, times);
      if (counted.has(address) || !worthCounting(row, times)) continue;
      try {
        const found = await provider.listMessageIdsFrom(
          token,
          address,
          CENSUS_MAX_PER_SENDER,
          options.windowDays,
        );
        const ids = new Set(found.filter((id) => listed.has(id)));
        ids.add(row.id);
        counted.set(address, ids);
        for (const id of ids) claimed.add(id);
      } catch (error) {
        log.error(`mailSync: could not count mail from ${address}`, error);
      }
    }
    options.onProgress?.({ phase: "reading", done: position, total: queue.length });
    batches += 1;
    if (batches % CENSUS_SAVE_EVERY === 0) await saveCensus();
  }
  await saveCensus();
  await options.onCounted?.();
  return { read: readIds.size, pending: queue.filter((id) => !readIds.has(id)) };
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
