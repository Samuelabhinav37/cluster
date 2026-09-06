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

  it("keeps only the most-recently-inserted entries past the cap", async () => {
    // Cap is 4000; insert 4100 stale entries and confirm the oldest 100 fall off.
    const cache = new Map<string, NormalizedMessageMetadata>();
    for (let i = 0; i < 4100; i++) {
      cache.set(`gmail:m${i}`, meta(`m${i}`, NOW - FRESH_WINDOW_MS - 1));
    }
    await saveMetadataCache(cache);

    const loaded = await loadMetadataCache(NOW);
    expect(loaded.size).toBe(4000);
    expect(loaded.has("gmail:m0")).toBe(false);
    expect(loaded.has("gmail:m99")).toBe(false);
    expect(loaded.has("gmail:m100")).toBe(true);
    expect(loaded.has("gmail:m4099")).toBe(true);
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
