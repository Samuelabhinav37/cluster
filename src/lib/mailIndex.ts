// The local mail index: every message Cluster has read, kept on this device
// so a dashboard open, a rescan or a background pass never re-reads mail it
// already knows. mailSync.ts fills and updates it; every screen reads it.
//
// Stored in IndexedDB (the manifest grants unlimitedStorage). Rows are the
// same NormalizedMessageMetadata the scanners always produced, so the sender
// model works on them unchanged. When IndexedDB isn't available (tests,
// unusual runtimes) an in-memory store keeps the same behaviour for the life
// of the page.
import { log } from "./log";
import type { NormalizedMessageMetadata, ProviderId, SentRecord } from "./providers/emailProvider";

/** Most messages the index keeps per account by default. Oldest go first past this. */
export const MAIL_INDEX_CAP = 20_000;
/** The most a user can choose to read ("All" in setup for a big mailbox). */
// shortcut: every screen loads the whole index into memory, so 100,000 rows is a guess at what stays smooth; measure on a real 100k mailbox before raising it.
export const MAIL_INDEX_MAX = 100_000;

/** Shape version of a stored message row. Bump when a provider starts
 * filling a new field; older rows are re-read once, paced, in the background.
 * 2: relationship headers (To/Cc, thread, List-Id, Return-Path, Feedback-ID). */
export const MAIL_ROW_VERSION = 2;
/** 2: Social and Forums mail joined the index (it was Inbox, Promotions and
 * Updates only). 3: mail filed under any label stays in. */
export const INDEX_SCOPE_VERSION = 3;

export interface MailIndexState {
  provider: ProviderId;
  /** The mailbox this index belongs to (Gmail address). A different signed-in
   * account clears the index instead of showing someone else's mail. */
  accountId?: string;
  /** Provider change cursor (Gmail historyId), committed once a build or a
   * change pass has been fully applied. */
  cursor?: string;
  /** Cursor captured before a build started. Kept across interruptions so a
   * resumed build still replays every change since the first attempt. */
  pendingCursor?: string;
  /** Gmail said the cursor is too old (history kept about a week): the next
   * full sync re-lists, reading only mail the index lacks (indexNeedsBuild). */
  cursorExpired?: boolean;
  /** True once a full listing has been read into the index. */
  complete: boolean;
  lastSyncAt?: number;
  /** Scan window the last listing used. A different window re-lists. */
  windowDays?: number;
  /** Read cap the last listing used. A different cap re-lists. */
  cap?: number;
  /** MAIL_ROW_VERSION of the last full listing; older rows get re-read. */
  rowVersion?: number;
  /** Which mail the listing covered (INDEX_SCOPE_VERSION). A wider scope
   * re-lists once; only mail the index lacks is read. */
  scopeVersion?: number;
  /** True once the Sent folder has been read into the sent store. */
  sentComplete?: boolean;
  /** Message ids with a risky attachment shape, from the last sync. Applied
   * when the index is read, so the flag stays current without rewriting rows. */
  riskyIds?: string[];
  /** Message ids in Gmail's Purchases view, from the last sync. Applied the
   * same way as riskyIds. */
  purchaseIds?: string[];
  /** Message ids in Gmail's Reservations view, applied the same way. */
  reservationIds?: string[];
}

/** One sender's mail as counted with a search ("fetch one, count many"):
 * every listed message from the address, read or not. Counts are a snapshot
 * from the build that took them; actions never use these ids directly. */
export interface CensusRow {
  provider: ProviderId;
  address: string;
  ids: string[];
  unread: number;
  starred: number;
  countedAt: number;
}

export interface MailIndexStore {
  all(provider: ProviderId): Promise<NormalizedMessageMetadata[]>;
  ids(provider: ProviderId): Promise<Set<string>>;
  get(provider: ProviderId, ids: string[]): Promise<NormalizedMessageMetadata[]>;
  put(rows: NormalizedMessageMetadata[]): Promise<void>;
  remove(provider: ProviderId, ids: string[]): Promise<void>;
  clear(provider: ProviderId): Promise<void>;
  getState(provider: ProviderId): Promise<MailIndexState | undefined>;
  setState(state: MailIndexState): Promise<void>;
  /** Sent mail: who you wrote to. Kept apart from the received-mail rows so
   * it never shows up as a "sender" on any screen. */
  allSent(provider: ProviderId): Promise<SentRecord[]>;
  sentIds(provider: ProviderId): Promise<Set<string>>;
  putSent(rows: SentRecord[]): Promise<void>;
  removeSent(provider: ProviderId, ids: string[]): Promise<void>;
  allCensus(provider: ProviderId): Promise<CensusRow[]>;
  putCensus(rows: CensusRow[]): Promise<void>;
}

export function createMemoryMailIndex(): MailIndexStore {
  const rows = new Map<string, NormalizedMessageMetadata>();
  const sent = new Map<string, SentRecord>();
  const census = new Map<string, CensusRow>();
  const states = new Map<ProviderId, MailIndexState>();
  const key = (provider: ProviderId, id: string) => `${provider}:${id}`;
  return {
    async all(provider) {
      return [...rows.values()].filter((row) => row.provider === provider).map((row) => ({ ...row }));
    },
    async ids(provider) {
      return new Set([...rows.values()].filter((row) => row.provider === provider).map((row) => row.id));
    },
    async get(provider, ids) {
      return ids.flatMap((id) => {
        const row = rows.get(key(provider, id));
        return row ? [{ ...row }] : [];
      });
    },
    async put(list) {
      for (const row of list) rows.set(key(row.provider, row.id), { ...row });
    },
    async remove(provider, ids) {
      for (const id of ids) rows.delete(key(provider, id));
    },
    async clear(provider) {
      for (const [k, row] of rows) if (row.provider === provider) rows.delete(k);
      for (const [k, row] of sent) if (row.provider === provider) sent.delete(k);
      for (const [k, row] of census) if (row.provider === provider) census.delete(k);
      states.delete(provider);
    },
    async allSent(provider) {
      return [...sent.values()].filter((row) => row.provider === provider).map((row) => ({ ...row }));
    },
    async sentIds(provider) {
      return new Set([...sent.values()].filter((row) => row.provider === provider).map((row) => row.id));
    },
    async putSent(list) {
      for (const row of list) sent.set(key(row.provider, row.id), { ...row });
    },
    async removeSent(provider, ids) {
      for (const id of ids) sent.delete(key(provider, id));
    },
    async allCensus(provider) {
      return [...census.values()].filter((row) => row.provider === provider).map((row) => ({ ...row }));
    },
    async putCensus(list) {
      for (const row of list) census.set(key(row.provider, row.address), { ...row });
    },
    async getState(provider) {
      const state = states.get(provider);
      return state ? { ...state } : undefined;
    },
    async setState(state) {
      states.set(state.provider, { ...state });
    },
  };
}

const DB_NAME = "cluster-mail-index";
const DB_VERSION = 3;
const MESSAGES = "messages";
const STATE = "state";
const SENT = "sent";
const CENSUS = "census";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MESSAGES)) {
        const store = db.createObjectStore(MESSAGES, { keyPath: ["provider", "id"] });
        store.createIndex("provider", "provider");
      }
      if (!db.objectStoreNames.contains(STATE)) db.createObjectStore(STATE, { keyPath: "provider" });
      if (!db.objectStoreNames.contains(CENSUS)) {
        const store = db.createObjectStore(CENSUS, { keyPath: ["provider", "address"] });
        store.createIndex("provider", "provider");
      }
      if (!db.objectStoreNames.contains(SENT)) {
        const store = db.createObjectStore(SENT, { keyPath: ["provider", "id"] });
        store.createIndex("provider", "provider");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function createIdbMailIndex(db: IDBDatabase): MailIndexStore {
  const read = (name: string) => db.transaction(name, "readonly").objectStore(name);
  return {
    async all(provider) {
      return await request(
        read(MESSAGES).index("provider").getAll(provider) as IDBRequest<NormalizedMessageMetadata[]>,
      );
    },
    async ids(provider) {
      const keys = (await request(read(MESSAGES).index("provider").getAllKeys(provider))) as unknown as [
        ProviderId,
        string,
      ][];
      return new Set(keys.map((k) => k[1]));
    },
    async get(provider, ids) {
      const store = read(MESSAGES);
      const found = await Promise.all(
        ids.map((id) =>
          request(store.get([provider, id]) as IDBRequest<NormalizedMessageMetadata | undefined>),
        ),
      );
      return found.filter((row): row is NormalizedMessageMetadata => Boolean(row));
    },
    async put(rows) {
      if (rows.length === 0) return;
      const tx = db.transaction(MESSAGES, "readwrite");
      const store = tx.objectStore(MESSAGES);
      for (const row of rows) store.put(row);
      await done(tx);
    },
    async remove(provider, ids) {
      if (ids.length === 0) return;
      const tx = db.transaction(MESSAGES, "readwrite");
      const store = tx.objectStore(MESSAGES);
      for (const id of ids) store.delete([provider, id]);
      await done(tx);
    },
    async clear(provider) {
      const tx = db.transaction([MESSAGES, SENT, CENSUS, STATE], "readwrite");
      for (const name of [MESSAGES, SENT, CENSUS]) {
        const store = tx.objectStore(name);
        const keys = await request(store.index("provider").getAllKeys(provider));
        for (const k of keys) store.delete(k);
      }
      tx.objectStore(STATE).delete(provider);
      await done(tx);
    },
    async allSent(provider) {
      return await request(read(SENT).index("provider").getAll(provider) as IDBRequest<SentRecord[]>);
    },
    async sentIds(provider) {
      const keys = (await request(read(SENT).index("provider").getAllKeys(provider))) as unknown as [
        ProviderId,
        string,
      ][];
      return new Set(keys.map((k) => k[1]));
    },
    async putSent(rows) {
      if (rows.length === 0) return;
      const tx = db.transaction(SENT, "readwrite");
      const store = tx.objectStore(SENT);
      for (const row of rows) store.put(row);
      await done(tx);
    },
    async removeSent(provider, ids) {
      if (ids.length === 0) return;
      const tx = db.transaction(SENT, "readwrite");
      const store = tx.objectStore(SENT);
      for (const id of ids) store.delete([provider, id]);
      await done(tx);
    },
    async allCensus(provider) {
      return await request(read(CENSUS).index("provider").getAll(provider) as IDBRequest<CensusRow[]>);
    },
    async putCensus(rows) {
      if (rows.length === 0) return;
      const tx = db.transaction(CENSUS, "readwrite");
      const store = tx.objectStore(CENSUS);
      for (const row of rows) store.put(row);
      await done(tx);
    },
    async getState(provider) {
      return (await request(read(STATE).get(provider))) as MailIndexState | undefined;
    },
    async setState(state) {
      const tx = db.transaction(STATE, "readwrite");
      tx.objectStore(STATE).put(state);
      await done(tx);
    },
  };
}

let shared: Promise<MailIndexStore> | undefined;

/** The page's (or worker's) mail index. Falls back to memory if IndexedDB
 * can't be opened, so Cluster still works, just without the saved index. */
export function openMailIndex(): Promise<MailIndexStore> {
  shared ??= (async () => {
    const factory = globalThis.indexedDB;
    if (!factory) return createMemoryMailIndex();
    try {
      return createIdbMailIndex(await openDb(factory));
    } catch (error) {
      log.error("mailIndex: IndexedDB unavailable, keeping the index in memory", error);
      return createMemoryMailIndex();
    }
  })();
  return shared;
}

/**
 * A read cache over `store` for one background run. The scam hold, the
 * unsubscribed sweep and auto-mute each loaded the whole index (up to 100,000
 * rows) every 5 minutes; with this they share one read. Any write drops the
 * cache, so a step always sees what an earlier step changed.
 */
export function runSnapshot(store: MailIndexStore): MailIndexStore {
  const cache = new Map<string, Promise<unknown>>();
  const read = <T>(key: string, load: () => Promise<T>): Promise<T> => {
    if (!cache.has(key)) cache.set(key, load().catch((err) => (cache.delete(key), Promise.reject(err))));
    return cache.get(key) as Promise<T>;
  };
  const write =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    (...args: A) => {
      cache.clear();
      return fn(...args);
    };
  return {
    all: async (p) => [...(await read(`all:${p}`, () => store.all(p)))],
    allSent: async (p) => [...(await read(`sent:${p}`, () => store.allSent(p)))],
    allCensus: async (p) => [...(await read(`census:${p}`, () => store.allCensus(p)))],
    ids: async (p) => new Set(await read(`ids:${p}`, () => store.ids(p))),
    sentIds: async (p) => new Set(await read(`sentIds:${p}`, () => store.sentIds(p))),
    get: (p, ids) => store.get(p, ids),
    getState: (p) => store.getState(p),
    put: write((rows) => store.put(rows)),
    remove: write((p, ids) => store.remove(p, ids)),
    clear: write((p) => store.clear(p)),
    setState: write((s) => store.setState(s)),
    putSent: write((rows) => store.putSent(rows)),
    removeSent: write((p, ids) => store.removeSent(p, ids)),
    putCensus: write((rows) => store.putCensus(rows)),
  };
}
