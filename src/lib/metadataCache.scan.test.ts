import { beforeEach, describe, expect, it, vi } from "vitest";
import { FRESH_WINDOW_MS, loadMetadataCache, saveMetadataCache } from "./metadataCache";
import { buildSenderSummaries } from "./senderModel";
import type { EmailProvider, NormalizedMessageMetadata } from "./providers/emailProvider";

// The cross-session round trip the "state after first live test" write-up
// flagged as unverified: a scan persists its warm cache, a *fresh* page load
// reloads it, and the next scan re-fetches only what the cache can't safely
// serve (mail inside the fresh window). This ties saveMetadataCache /
// loadMetadataCache to buildSenderSummaries with a fake chrome.storage.

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

function makeMeta(
  overrides: Partial<NormalizedMessageMetadata> & { id: string },
): NormalizedMessageMetadata {
  return {
    provider: "gmail",
    fromAddress: "a@x.com",
    fromDisplayName: "A",
    replyToAddress: "",
    subject: "hi",
    isProtected: false,
    unread: false,
    sizeBytes: 0,
    unsubscribe: {},
    receivedAt: Date.now(),
    ...overrides,
  };
}

function makeProvider(metas: NormalizedMessageMetadata[]): EmailProvider {
  return {
    id: "gmail",
    isConnected: vi.fn(async () => true),
    getAuthToken: vi.fn(async () => "gmail-token"),
    listCandidateMessages: vi.fn(async () => metas.map((m) => ({ id: m.id, provider: "gmail" as const }))),
    getMessageMetadata: vi.fn(async (_t: string, id: string) => metas.find((m) => m.id === id)!),
    trashMessages: vi.fn(async () => {}),
  };
}

const NOW = 1_700_000_000_000;
const STALE = NOW - FRESH_WINDOW_MS - 60_000;
const FRESH = NOW - 60_000;

beforeEach(() => {
  (globalThis as any).chrome = { storage: fakeChromeStorage() };
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

describe("metadata cache across sessions", () => {
  it("a fresh page load reuses the persisted cache and only re-fetches mail in the fresh window", async () => {
    const metas = [
      makeMeta({ id: "old1", fromAddress: "shop@x.com", receivedAt: STALE }),
      makeMeta({ id: "old2", fromAddress: "shop@x.com", receivedAt: STALE }),
      makeMeta({ id: "old3", fromAddress: "news@y.com", receivedAt: STALE }),
      makeMeta({ id: "new1", fromAddress: "news@y.com", receivedAt: FRESH }),
    ];
    const provider = makeProvider(metas);

    // Scan 1 — cold. Fetches every message, then persists.
    const cache1 = await loadMetadataCache();
    const senders1 = await buildSenderSummaries([provider], 500, 180, undefined, "cleanup", cache1);
    await saveMetadataCache(cache1);
    expect(provider.getMessageMetadata).toHaveBeenCalledTimes(4);

    // Scan 2 — brand-new Map, as a reloaded dashboard would build. The three
    // stale messages come from storage; only the fresh-window one is re-fetched.
    const cache2 = await loadMetadataCache();
    expect([...cache2.keys()].sort()).toEqual(["gmail:old1", "gmail:old2", "gmail:old3"]);

    const senders2 = await buildSenderSummaries([provider], 500, 180, undefined, "cleanup", cache2);
    expect(provider.getMessageMetadata).toHaveBeenCalledTimes(5); // +1, the fresh message
    expect(provider.getMessageMetadata).toHaveBeenLastCalledWith("gmail-token", "new1");

    // Same senders, same counts — the cache changed cost, not the result.
    expect(senders2.map((s) => [s.key, s.count])).toEqual(senders1.map((s) => [s.key, s.count]));
  });

  it("a warm cache still costs nothing to fetch when no mail is new", async () => {
    const metas = [
      makeMeta({ id: "a", receivedAt: STALE }),
      makeMeta({ id: "b", receivedAt: STALE }),
    ];
    const provider = makeProvider(metas);

    const cold = await loadMetadataCache();
    await buildSenderSummaries([provider], 500, 180, undefined, "cleanup", cold);
    await saveMetadataCache(cold);
    expect(provider.getMessageMetadata).toHaveBeenCalledTimes(2);

    const warm = await loadMetadataCache();
    await buildSenderSummaries([provider], 500, 180, undefined, "cleanup", warm);
    expect(provider.getMessageMetadata).toHaveBeenCalledTimes(2); // no additional fetches
  });
});
