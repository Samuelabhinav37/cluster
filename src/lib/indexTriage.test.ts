import { describe, expect, it, vi } from "vitest";
import {
  indexSeededCache,
  mailIndexLockKey,
  readIndexedSenders,
  refreshIndexForBackground,
} from "./indexTriage";
import { createMemoryMailIndex, MAIL_ROW_VERSION } from "./mailIndex";
import type { EmailProvider, NormalizedMessageMetadata } from "./providers/emailProvider";
import { gmailLabelFields, inIndexScope } from "./providers/gmailProvider";
import { withStorageLock } from "./storageLock";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function message(id: string, from: string, labelIds: string[], ageDays: number): NormalizedMessageMetadata {
  return {
    id,
    provider: "gmail",
    fromAddress: from,
    fromDisplayName: from,
    replyToAddress: "",
    subject: id,
    sizeBytes: 1,
    unsubscribe: {},
    receivedAt: NOW - ageDays * DAY,
    ...gmailLabelFields(labelIds),
    v: MAIL_ROW_VERSION,
  };
}

function provider(overrides: Partial<EmailProvider> = {}) {
  return {
    id: "gmail",
    isConnected: async () => true,
    getAuthToken: async () => "t",
    listCandidateMessages: vi.fn(async () => []),
    getMessageMetadata: vi.fn(async (_t: string, id: string) => message(id, "new@x.com", ["INBOX"], 0)),
    trashMessages: async () => {},
    listChangesSince: vi.fn(async (_t: string, cursor: string) => ({
      added: [],
      removed: [],
      labelUpdates: [{ id: "a", labelIds: ["INBOX", "STARRED"] }],
      cursor: `${cursor}+`,
      expired: false,
    })),
    applyLabelIds: (meta: NormalizedMessageMetadata, labelIds: string[]) =>
      inIndexScope(labelIds) ? { ...meta, ...gmailLabelFields(labelIds) } : null,
    ...overrides,
  } as EmailProvider & { listCandidateMessages: ReturnType<typeof vi.fn> };
}

describe("refreshIndexForBackground", () => {
  it("applies only the change feed to a built index and reports it ready", async () => {
    const store = createMemoryMailIndex();
    await store.put([message("a", "a@x.com", ["INBOX"], 1)]);
    await store.setState({ provider: "gmail", complete: true, cursor: "h1", rowVersion: MAIL_ROW_VERSION });
    const gmail = provider();

    const ready = await refreshIndexForBackground([gmail], 180, store);

    expect(ready).toEqual([gmail]);
    expect(gmail.listCandidateMessages).not.toHaveBeenCalled();
    expect((await store.get("gmail", ["a"]))[0].isProtected).toBe(true);
    expect((await store.getState("gmail"))?.cursor).toBe("h1+");
  });

  it("leaves an unbuilt index, or a provider with no change feed, to the old scans", async () => {
    const store = createMemoryMailIndex();
    await store.setState({ provider: "gmail", complete: false, pendingCursor: "h0" });
    expect(await refreshIndexForBackground([provider()], 180, store)).toEqual([]);

    await store.setState({ provider: "gmail", complete: true, cursor: "h1" });
    expect(await refreshIndexForBackground([provider({ listChangesSince: undefined })], 180, store)).toEqual(
      [],
    );
  });

  it("reads the index as it stands while the dashboard holds the sync lock", async () => {
    const store = createMemoryMailIndex();
    await store.setState({ provider: "gmail", complete: true, cursor: "h1", rowVersion: MAIL_ROW_VERSION });
    const gmail = provider();
    let release: () => void = () => {};
    const held = withStorageLock(mailIndexLockKey(gmail), () => new Promise<void>((r) => (release = r)));

    const ready = await refreshIndexForBackground([gmail], 180, store);

    expect(ready).toEqual([gmail]);
    expect(gmail.listChangesSince).not.toHaveBeenCalled();
    release();
    await held;
  });
});

describe("readIndexedSenders", () => {
  it("splits lanes and applies each window", async () => {
    const store = createMemoryMailIndex();
    await store.put([
      message("p1", "promo@shop.com", ["CATEGORY_PROMOTIONS"], 10),
      message("p2", "old@shop.com", ["CATEGORY_PROMOTIONS"], 200),
      message("i1", "friend@x.com", ["INBOX"], 5),
      message("i2", "older@x.com", ["INBOX"], 40),
    ]);
    const gmail = provider();

    const result = await readIndexedSenders(
      [gmail],
      { scanWindowDays: 180, securityWindowDays: 30, securityMax: 100, now: NOW },
      store,
    );

    // Inbox-only mail is the security lane; promotions within 180 days are clean-up.
    expect(result.cleanup.map((s) => s.address)).toEqual(["promo@shop.com"]);
    expect(result.security.map((s) => s.address)).toEqual(["friend@x.com"]);
  });
});

describe("indexSeededCache", () => {
  it("serves indexed rows and saves only what the caller fetched", async () => {
    const store = createMemoryMailIndex();
    await store.put([message("a", "a@x.com", ["INBOX"], 1)]);
    const gmail = provider();

    const { cache, saveFetched } = await indexSeededCache(gmail, ["a", "b"], store);
    expect([...cache.keys()]).toEqual(["gmail:a"]);
    cache.set("gmail:b", message("b", "b@x.com", ["INBOX"], 0));
    await saveFetched();

    expect([...(await store.ids("gmail"))].sort()).toEqual(["a", "b"]);
  });
});
