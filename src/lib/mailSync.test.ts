import { describe, expect, it, vi } from "vitest";
import { createMemoryMailIndex } from "./mailIndex";
import { catchUpIndex, readMailIndex, syncMailIndex } from "./mailSync";
import type { EmailProvider, MailboxChanges, NormalizedMessageMetadata } from "./providers/emailProvider";
import { gmailLabelFields, inIndexScope } from "./providers/gmailProvider";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function message(id: string, labelIds: string[], ageDays = 1): NormalizedMessageMetadata {
  return {
    id,
    provider: "gmail",
    fromAddress: `${id}@example.com`,
    fromDisplayName: id,
    replyToAddress: "",
    subject: id,
    sizeBytes: 100,
    unsubscribe: {},
    receivedAt: NOW - ageDays * DAY,
    ...gmailLabelFields(labelIds),
  };
}

/** A Gmail-like provider over an in-memory mailbox with a change feed. */
function fakeGmail(mailbox: NormalizedMessageMetadata[], account = "me@example.com") {
  const state = { account, changes: undefined as MailboxChanges | undefined };
  const provider = {
    id: "gmail",
    isConnected: async () => true,
    getAuthToken: async () => "t",
    listCandidateMessages: vi.fn(async (_t: string, max: number) =>
      [...mailbox]
        .sort((a, b) => b.receivedAt - a.receivedAt)
        .slice(0, max)
        .map((m) => ({ id: m.id, provider: "gmail" as const })),
    ),
    getMessageMetadata: vi.fn(async (_t: string, id: string) => {
      const found = mailbox.find((m) => m.id === id);
      if (!found) throw new Error(`no message ${id}`);
      return { ...found };
    }),
    trashMessages: async () => {},
    getAccountId: async () => state.account,
    getChangeCursor: vi.fn(async () => "h1"),
    listChangesSince: vi.fn(async (_t: string, cursor: string) => {
      return state.changes ?? { added: [], removed: [], labelUpdates: [], cursor, expired: false };
    }),
    applyLabelIds: (meta: NormalizedMessageMetadata, labelIds: string[]) =>
      inIndexScope(labelIds) ? { ...meta, ...gmailLabelFields(labelIds) } : null,
  };
  return { provider: provider as unknown as EmailProvider & typeof provider, state };
}

const options = { windowDays: 365, now: () => NOW };

describe("syncMailIndex: first build", () => {
  it("reads every listed message once and signals quick-ready after the newest", async () => {
    const mailbox = Array.from({ length: 60 }, (_, i) => message(`m${i}`, ["INBOX", "UNREAD"], i));
    const { provider } = fakeGmail(mailbox);
    const store = createMemoryMailIndex();
    const quickAt: number[] = [];

    const result = await syncMailIndex(provider, "t", store, {
      ...options,
      quickCount: 25,
      onQuickReady: () => quickAt.push(provider.getMessageMetadata.mock.calls.length),
    });

    expect(result).toMatchObject({ mode: "build", read: 60 });
    expect(provider.getMessageMetadata).toHaveBeenCalledTimes(60);
    expect(quickAt).toHaveLength(1);
    expect(quickAt[0]).toBeLessThan(60);
    expect((await store.ids("gmail")).size).toBe(60);
    expect(await store.getState("gmail")).toMatchObject({
      complete: true,
      cursor: "h1",
      accountId: "me@example.com",
    });
  });

  it("resumes an interrupted build without re-reading what it already has", async () => {
    const mailbox = Array.from({ length: 30 }, (_, i) => message(`m${i}`, ["INBOX"], i));
    const { provider } = fakeGmail(mailbox);
    const store = createMemoryMailIndex();
    await store.put(mailbox.slice(0, 20));
    await store.setState({ provider: "gmail", complete: false, pendingCursor: "h0" });

    const result = await syncMailIndex(provider, "t", store, options);

    expect(result.read).toBe(10);
    // The cursor from before the interruption is kept, so no change is lost.
    expect(provider.getChangeCursor).not.toHaveBeenCalled();
    expect((await store.getState("gmail"))?.cursor).toBe("h0");
  });

  it("keeps only the newest messages up to the cap", async () => {
    const mailbox = Array.from({ length: 12 }, (_, i) => message(`m${i}`, ["INBOX"], i));
    const { provider } = fakeGmail(mailbox);
    const store = createMemoryMailIndex();

    await syncMailIndex(provider, "t", store, { ...options, cap: 5 });

    expect([...(await store.ids("gmail"))].sort()).toEqual(["m0", "m1", "m2", "m3", "m4"]);
  });

  it("skips a message trashed between listing and reading", async () => {
    const mailbox = [message("keep", ["INBOX"]), message("gone", ["TRASH"])];
    const { provider } = fakeGmail(mailbox);
    const store = createMemoryMailIndex();

    await syncMailIndex(provider, "t", store, options);

    expect([...(await store.ids("gmail"))]).toEqual(["keep"]);
  });

  it("clears the index when a different account signs in", async () => {
    const { provider, state } = fakeGmail([message("a", ["INBOX"])]);
    const store = createMemoryMailIndex();
    await syncMailIndex(provider, "t", store, options);
    await store.put([message("old-account-only", ["INBOX"])]);

    state.account = "other@example.com";
    await syncMailIndex(provider, "t", store, options);

    expect([...(await store.ids("gmail"))]).toEqual(["a"]);
    expect((await store.getState("gmail"))?.accountId).toBe("other@example.com");
  });
});

describe("syncMailIndex: changes after the first build", () => {
  async function built(mailbox: NormalizedMessageMetadata[]) {
    const fake = fakeGmail(mailbox);
    const store = createMemoryMailIndex();
    await syncMailIndex(fake.provider, "t", store, options);
    fake.provider.getMessageMetadata.mockClear();
    fake.provider.listCandidateMessages.mockClear();
    return { ...fake, store };
  }

  it("applies label changes in place without re-reading anything", async () => {
    const { provider, state, store } = await built([message("a", ["INBOX", "UNREAD"])]);
    state.changes = {
      added: [],
      removed: [],
      labelUpdates: [{ id: "a", labelIds: ["INBOX", "STARRED"] }],
      cursor: "h2",
      expired: false,
    };

    const result = await syncMailIndex(provider, "t", store, options);

    expect(result).toMatchObject({ mode: "changes", read: 0, updated: 1 });
    expect(provider.getMessageMetadata).not.toHaveBeenCalled();
    expect(provider.listCandidateMessages).not.toHaveBeenCalled();
    const [row] = await store.get("gmail", ["a"]);
    expect(row).toMatchObject({ unread: false, isProtected: true });
    expect((await store.getState("gmail"))?.cursor).toBe("h2");
  });

  it("reads new mail, drops trashed and deleted mail, and ignores new spam", async () => {
    const { provider, state, store } = await built([
      message("a", ["INBOX"]),
      message("b", ["INBOX"]),
      message("c", ["INBOX"]),
    ]);
    const mailbox = provider.getMessageMetadata;
    mailbox.mockImplementation(async (_t: string, id: string) => message(id, ["INBOX"]));
    state.changes = {
      added: ["new", "junk"],
      removed: ["c"],
      labelUpdates: [
        { id: "new", labelIds: ["INBOX", "UNREAD"] },
        { id: "junk", labelIds: ["SPAM"] },
        { id: "b", labelIds: ["TRASH"] },
      ],
      cursor: "h3",
      expired: false,
    };

    const result = await syncMailIndex(provider, "t", store, options);

    expect(provider.getMessageMetadata).toHaveBeenCalledTimes(1);
    expect(provider.getMessageMetadata).toHaveBeenCalledWith("t", "new");
    expect([...(await store.ids("gmail"))].sort()).toEqual(["a", "new"]);
    expect(result).toMatchObject({ read: 1, removed: 2 });
  });

  it("rebuilds from a fresh listing when the cursor expired", async () => {
    const { provider, state, store } = await built([message("a", ["INBOX"])]);
    state.changes = { added: [], removed: [], labelUpdates: [], cursor: "h1", expired: true };
    provider.getChangeCursor.mockResolvedValueOnce("h9");

    const result = await syncMailIndex(provider, "t", store, options);

    expect(result.mode).toBe("build");
    expect(provider.listCandidateMessages).toHaveBeenCalledTimes(1);
    // Already-known mail isn't read again.
    expect(provider.getMessageMetadata).not.toHaveBeenCalled();
    expect((await store.getState("gmail"))?.cursor).toBe("h9");
  });

  it("signals quick-ready at once for an index built before", async () => {
    const { provider, store } = await built([message("a", ["INBOX"])]);
    let ready = false;
    let resolveChanges: (c: MailboxChanges) => void = () => {};
    provider.listChangesSince.mockImplementationOnce(
      () => new Promise<MailboxChanges>((resolve) => (resolveChanges = resolve)),
    );

    const run = syncMailIndex(provider, "t", store, { ...options, onQuickReady: () => (ready = true) });
    await vi.waitFor(() => expect(ready).toBe(true));
    resolveChanges({ added: [], removed: [], labelUpdates: [], cursor: "h1", expired: false });
    await run;
  });
});

describe("syncMailIndex: provider without a change feed", () => {
  it("re-reads only unknown mail and the last week", async () => {
    const mailbox = [message("recent", ["INBOX"], 2), message("old", ["INBOX"], 30)];
    const { provider } = fakeGmail(mailbox);
    const plain = {
      ...provider,
      listChangesSince: undefined,
      getChangeCursor: undefined,
      applyLabelIds: undefined,
    };
    const store = createMemoryMailIndex();
    await syncMailIndex(plain, "t", store, options);
    provider.getMessageMetadata.mockClear();

    await syncMailIndex(plain, "t", store, options);

    expect(provider.getMessageMetadata).toHaveBeenCalledTimes(1);
    expect(provider.getMessageMetadata).toHaveBeenCalledWith("t", "recent");
  });
});

describe("catchUpIndex", () => {
  it("applies the person's own actions to a build still in progress", async () => {
    const { provider, state } = fakeGmail([]);
    const store = createMemoryMailIndex();
    await store.put([message("a", ["INBOX"]), message("b", ["INBOX"])]);
    await store.setState({ provider: "gmail", complete: false, pendingCursor: "h0" });
    state.changes = {
      added: [],
      removed: [],
      labelUpdates: [{ id: "a", labelIds: ["TRASH"] }],
      cursor: "h5",
      expired: false,
    };

    await catchUpIndex(provider, "t", store);

    expect([...(await store.ids("gmail"))]).toEqual(["b"]);
    // Nothing is committed; the build replays these events itself.
    expect((await store.getState("gmail"))?.cursor).toBeUndefined();
  });
});

describe("readMailIndex", () => {
  it("applies the risky-attachment ids from the last sync", async () => {
    const store = createMemoryMailIndex();
    await store.put([message("a", ["INBOX"]), message("b", ["INBOX"])]);
    await store.setState({ provider: "gmail", complete: true, riskyIds: ["b"] });
    const { provider } = fakeGmail([]);

    const rows = await readMailIndex(store, [provider]);

    expect(rows.find((r) => r.id === "a")?.hasRiskyAttachment).toBeUndefined();
    expect(rows.find((r) => r.id === "b")?.hasRiskyAttachment).toBe(true);
  });
});

describe("syncMailIndex: scan window", () => {
  it("re-lists when the window changes, reading only mail it doesn't have", async () => {
    const mailbox = [message("a", ["INBOX"], 1), message("b", ["INBOX"], 100)];
    const { provider } = fakeGmail(mailbox);
    const store = createMemoryMailIndex();
    await syncMailIndex(provider, "t", store, { ...options, windowDays: 30 });
    provider.getMessageMetadata.mockClear();

    const result = await syncMailIndex(provider, "t", store, { ...options, windowDays: 365 });

    expect(result.mode).toBe("build");
    expect(provider.getMessageMetadata).toHaveBeenCalledTimes(1);
    expect(provider.getMessageMetadata).toHaveBeenCalledWith("t", "b");
  });
});
