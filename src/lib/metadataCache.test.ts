import { beforeEach, describe, expect, it } from "vitest";
import {
  FRESH_WINDOW_MS,
  clearMetadataCache,
  loadMetadataCache,
  saveMetadataCache,
} from "./metadataCache";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";

function fakeChromeStorage() {
  let store: Record<string, unknown> = {};
  return {
    local: {
      async get(key: string) {
        return key in store ? { [key]: store[key] } : {};
      },
      async set(items: Record<string, unknown>) {
        store = { ...store, ...items };
      },
      async remove(key: string) {
        delete store[key];
      },
    },
  };
}

function meta(id: string, receivedAt: number): NormalizedMessageMetadata {
  return {
    id,
    provider: "gmail",
    fromAddress: `${id}@example.com`,
    fromDisplayName: id,
    replyToAddress: "",
    subject: "hi",
    isProtected: false,
    unread: false,
    sizeBytes: 1000,
    unsubscribe: {},
    receivedAt,
  };
}

const NOW = 1_000_000_000_000;

beforeEach(() => {
  (globalThis as any).chrome = { storage: fakeChromeStorage() };
});

describe("metadataCache", () => {
  it("round-trips entries older than the fresh window", async () => {
    const cache = new Map([["gmail:a", meta("a", NOW - FRESH_WINDOW_MS - 1)]]);
    await saveMetadataCache(cache);

    const loaded = await loadMetadataCache(NOW);
    expect(loaded.get("gmail:a")?.fromAddress).toBe("a@example.com");
  });

  it("drops entries within the fresh window so label state is re-fetched", async () => {
    const cache = new Map([
      ["gmail:old", meta("old", NOW - FRESH_WINDOW_MS - 1)],
      ["gmail:recent", meta("recent", NOW - 1000)],
    ]);
    await saveMetadataCache(cache);

    const loaded = await loadMetadataCache(NOW);
    expect(loaded.has("gmail:old")).toBe(true);
    expect(loaded.has("gmail:recent")).toBe(false);
  });

  it("keeps the most-recently-received entries past the cap", async () => {
    // Cap is 2000; insert 2100 stale entries with increasing receivedAt and
    // confirm the 100 oldest-received fall off, newest-received are kept.
    const base = NOW - FRESH_WINDOW_MS - 100_000;
    const cache = new Map<string, NormalizedMessageMetadata>();
    for (let i = 0; i < 2100; i++) {
      cache.set(`gmail:m${i}`, meta(`m${i}`, base - i));
    }
    await saveMetadataCache(cache);

    const loaded = await loadMetadataCache(NOW);
    expect(loaded.size).toBe(2000);
    expect(loaded.has("gmail:m0")).toBe(true); // newest receivedAt (base - 0)
    expect(loaded.has("gmail:m1999")).toBe(true);
    expect(loaded.has("gmail:m2000")).toBe(false); // oldest 100 evicted
    expect(loaded.has("gmail:m2099")).toBe(false);
  });

  it("clears the stored cache", async () => {
    await saveMetadataCache(new Map([["gmail:a", meta("a", NOW - FRESH_WINDOW_MS - 1)]]));
    await clearMetadataCache();
    expect((await loadMetadataCache(NOW)).size).toBe(0);
  });

  it("returns an empty map when nothing is stored", async () => {
    expect((await loadMetadataCache(NOW)).size).toBe(0);
  });

  it("survives a storage failure by starting cold", async () => {
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: () => Promise.reject(new Error("quota")),
          set: () => Promise.reject(new Error("quota")),
          remove: () => Promise.reject(new Error("quota")),
        },
      },
    };
    expect((await loadMetadataCache(NOW)).size).toBe(0);
    await expect(saveMetadataCache(new Map())).resolves.toBeUndefined();
    await expect(clearMetadataCache()).resolves.toBeUndefined();
  });
});
