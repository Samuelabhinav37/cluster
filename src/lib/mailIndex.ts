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
import type { NormalizedMessageMetadata, ProviderId } from "./providers/emailProvider";

/** Most messages the index keeps per account. Oldest go first past this. */
export const MAIL_INDEX_CAP = 20_000;

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
  /** True once a full listing has been read into the index. */
  complete: boolean;
  lastSyncAt?: number;
  /** Scan window the last listing used. A different window re-lists. */
  windowDays?: number;
  /** Message ids with a risky attachment shape, from the last sync. Applied
   * when the index is read, so the flag stays current without rewriting rows. */
  riskyIds?: string[];
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
}

export function createMemoryMailIndex(): MailIndexStore {
  const rows = new Map<string, NormalizedMessageMetadata>();
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
      states.delete(provider);
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
const DB_VERSION = 1;
const MESSAGES = "messages";
const STATE = "state";

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
      const tx = db.transaction([MESSAGES, STATE], "readwrite");
      const messages = tx.objectStore(MESSAGES);
      const keys = await request(messages.index("provider").getAllKeys(provider));
      for (const k of keys) messages.delete(k);
      tx.objectStore(STATE).delete(provider);
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
