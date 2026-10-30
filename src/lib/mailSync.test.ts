import { describe, expect, it, vi } from "vitest";
import { createMemoryMailIndex, INDEX_SCOPE_VERSION, MAIL_ROW_VERSION } from "./mailIndex";
import { catchUpIndex, readMailIndex, SENT_FIRST, syncMailIndex } from "./mailSync";
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
    v: MAIL_ROW_VERSION,
  };
}

/** A Gmail-like provider over an in-memory mailbox with a change feed. */
function fakeGmail(mailbox: NormalizedMessageMetadata[], account = "me@example.com") {
  const state = { account, changes: undefined as MailboxChanges | undefined };
  const provider = {
    id: "gmail",
    isConnected: async () => true,
    getAuthToken: async () => "t",
    listCandidateMessages: vi.fn(async (_t: string, max: number, windowDays = Infinity) =>
      [...mailbox]
        .filter((m) => m.receivedAt >= NOW - windowDays * DAY)
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

  it("applies Gmail's Purchases ids from the last sync", async () => {
    const store = createMemoryMailIndex();
    await store.put([message("a", ["INBOX"]), message("b", ["INBOX"])]);
    await store.setState({ provider: "gmail", complete: true, purchaseIds: ["a"] });
    const { provider } = fakeGmail([]);

    const rows = await readMailIndex(store, [provider]);

    expect(rows.find((r) => r.id === "a")?.gmailPurchase).toBe(true);
    expect(rows.find((r) => r.id === "a")?.hasRiskyAttachment).toBeUndefined();
    expect(rows.find((r) => r.id === "b")?.gmailPurchase).toBeUndefined();
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

describe("syncMailIndex: pacing", () => {
  it("reads the first screen's worth without waiting for headroom, then paces the rest", async () => {
    const mailbox = Array.from({ length: 80 }, (_, i) => message(`m${i}`, ["INBOX"], i));
    const { provider } = fakeGmail(mailbox);
    const store = createMemoryMailIndex();
    const events: string[] = [];
    const waitForHeadroom = vi.fn(async () => {
      events.push("wait");
    });

    await syncMailIndex(provider, "t", store, {
      ...options,
      quickCount: 30,
      waitForHeadroom,
      onQuickReady: () => events.push("quick"),
    });

    expect(events[0]).toBe("quick");
    expect(waitForHeadroom).toHaveBeenCalled();
    expect(provider.getMessageMetadata).toHaveBeenCalledTimes(80);
  });
});

describe("syncMailIndex: sent mail", () => {
  function withSent(fake: ReturnType<typeof fakeGmail>, sentIds: string[]) {
    const provider = Object.assign(fake.provider, {
      listSentMessageIds: vi.fn(async () => sentIds),
      getSentRecord: vi.fn(async (_t: string, id: string) => ({
        id,
        provider: "gmail" as const,
        sentAt: NOW,
        to: [{ address: `${id}@friend.com`, name: id }],
        cc: [],
        bcc: [],
      })),
      isSentLabels: (labelIds: string[]) => labelIds.includes("SENT"),
    });
    return provider;
  }

  it("reads the Sent folder after the first screen, then tells the caller", async () => {
    const fake = fakeGmail([message("a", ["INBOX"])]);
    const provider = withSent(fake, ["s1", "s2"]);
    const store = createMemoryMailIndex();
    const order: string[] = [];

    await syncMailIndex(provider, "t", store, {
      ...options,
      onQuickReady: () => order.push("quick"),
      onSentReady: () => {
        order.push("sent");
      },
    });

    expect(order).toEqual(["quick", "sent"]);
    expect([...(await store.sentIds("gmail"))].sort()).toEqual(["s1", "s2"]);
    expect((await store.getState("gmail"))?.sentComplete).toBe(true);
  });

  it("reads the newest sent mail before the inbox and the rest after it", async () => {
    const inbox = Array.from({ length: 40 }, (_, i) => message(`m${i}`, ["INBOX"]));
    const fake = fakeGmail(inbox);
    const sentIds = Array.from({ length: SENT_FIRST + 50 }, (_, i) => `s${i}`);
    const provider: EmailProvider = withSent(fake, sentIds);
    provider.listSentMessageIds = vi.fn(async (_t: string, limit: number) => sentIds.slice(0, limit));
    const reads: string[] = [];
    const getSent = provider.getSentRecord!;
    provider.getSentRecord = vi.fn(async (t: string, id: string) => {
      reads.push(id);
      return getSent(t, id);
    });
    const getMeta = provider.getMessageMetadata;
    provider.getMessageMetadata = vi.fn(async (t: string, id: string) => {
      reads.push(id);
      return getMeta(t, id);
    });
    const store = createMemoryMailIndex();

    await syncMailIndex(provider, "t", store, { ...options, quickCount: 10 });

    const firstInbox = reads.findIndex((id) => id === "m10");
    const lastSentEarly = reads.indexOf(`s${SENT_FIRST - 1}`);
    const firstSentLate = reads.indexOf(`s${SENT_FIRST}`);
    expect(lastSentEarly).toBeLessThan(firstInbox);
    expect(firstSentLate).toBeGreaterThan(reads.lastIndexOf("m39"));
    expect((await store.sentIds("gmail")).size).toBe(SENT_FIRST + 50);
    expect((await store.getState("gmail"))?.sentComplete).toBe(true);
  });

  it("reads Sent for an index built before sent mail was kept", async () => {
    const fake = fakeGmail([message("a", ["INBOX"])]);
    const provider = withSent(fake, ["s1"]);
    const store = createMemoryMailIndex();
    await store.put([message("a", ["INBOX"])]);
    await store.setState({
      provider: "gmail",
      complete: true,
      cursor: "h1",
      rowVersion: MAIL_ROW_VERSION,
      scopeVersion: INDEX_SCOPE_VERSION,
      accountId: "me@example.com",
    });

    await syncMailIndex(provider, "t", store, options);

    expect(provider.listCandidateMessages).not.toHaveBeenCalled();
    expect([...(await store.sentIds("gmail"))]).toEqual(["s1"]);
  });

  it("lists once more when the index scope widened, reading only new mail", async () => {
    const fake = fakeGmail([message("a", ["INBOX"])]);
    const provider = withSent(fake, []);
    const store = createMemoryMailIndex();
    await store.put([message("a", ["INBOX"])]);
    await store.setState({
      provider: "gmail",
      complete: true,
      cursor: "h1",
      rowVersion: MAIL_ROW_VERSION,
      sentComplete: true,
      accountId: "me@example.com",
    });

    await syncMailIndex(provider, "t", store, options);

    expect(provider.listCandidateMessages).toHaveBeenCalled();
    expect((await store.getState("gmail"))?.scopeVersion).toBe(INDEX_SCOPE_VERSION);
  });

  it("adds newly sent mail from the change feed", async () => {
    const fake = fakeGmail([message("a", ["INBOX"])]);
    const provider = withSent(fake, []);
    const store = createMemoryMailIndex();
    await syncMailIndex(provider, "t", store, options);
    fake.state.changes = {
      added: ["s9"],
      removed: [],
      labelUpdates: [{ id: "s9", labelIds: ["SENT"] }],
      cursor: "h2",
      expired: false,
    };

    await syncMailIndex(provider, "t", store, options);

    expect([...(await store.sentIds("gmail"))]).toEqual(["s9"]);
    // Sent-only mail never becomes a received row.
    expect((await store.ids("gmail")).has("s9")).toBe(false);
  });
});

describe("syncMailIndex: row upgrades", () => {
  it("re-reads rows stored before the current shape, after applying changes", async () => {
    const fake = fakeGmail([message("a", ["INBOX"])]);
    const store = createMemoryMailIndex();
    await store.put([{ ...message("a", ["INBOX"]), v: undefined }]);
    await store.setState({
      provider: "gmail",
      complete: true,
      cursor: "h1",
      sentComplete: true,
      accountId: "me@example.com",
    });

    await syncMailIndex(fake.provider, "t", store, options);

    expect(fake.provider.listChangesSince).toHaveBeenCalledWith("t", "h1");
    expect(fake.provider.getMessageMetadata).toHaveBeenCalledWith("t", "a");
    const [row] = await store.get("gmail", ["a"]);
    expect(row.v).toBe(MAIL_ROW_VERSION);
    expect(await store.getState("gmail")).toMatchObject({ rowVersion: MAIL_ROW_VERSION, cursor: "h1" });
  });
});

describe("syncMailIndex: changes only", () => {
  it("never lists or backfills, even when rows are outdated or Sent isn't read", async () => {
    const fake = fakeGmail([message("a", ["INBOX"])]);
    const store = createMemoryMailIndex();
    await store.put([{ ...message("a", ["INBOX"]), v: undefined }]);
    await store.setState({ provider: "gmail", complete: true, cursor: "h1", accountId: "me@example.com" });

    await syncMailIndex(fake.provider, "t", store, { ...options, changesOnly: true });

    expect(fake.provider.listChangesSince).toHaveBeenCalledTimes(1);
    expect(fake.provider.listCandidateMessages).not.toHaveBeenCalled();
    expect(fake.provider.getMessageMetadata).not.toHaveBeenCalled();
  });

  it("does nothing for an index that was never built", async () => {
    const fake = fakeGmail([message("a", ["INBOX"])]);
    const store = createMemoryMailIndex();

    await syncMailIndex(fake.provider, "t", store, { ...options, changesOnly: true });

    expect(fake.provider.listCandidateMessages).not.toHaveBeenCalled();
    expect((await store.ids("gmail")).size).toBe(0);
  });
});

describe("syncMailIndex: fetch one, count many", () => {
  function bulk(id: string, from: string, ageDays: number, labels = ["CATEGORY_PROMOTIONS", "UNREAD"]) {
    return { ...message(id, labels, ageDays), fromAddress: from, unsubscribe: { mailto: "u@x.com" } };
  }

  it("reads one message per bulk sender, counts the rest by search, then reads them in detail", async () => {
    const shop = Array.from({ length: 40 }, (_, i) => bulk(`shop${i}`, "deals@shop.com", i + 31));
    const people = [message("p1", ["INBOX"], 0), message("p2", ["INBOX"], 50)];
    const mailbox = [...people, ...shop];
    const fake = fakeGmail(mailbox);
    const listFrom = vi.fn(async (_t: string, address: string) =>
      mailbox.filter((m) => m.fromAddress === address).map((m) => m.id),
    );
    const provider = Object.assign(fake.provider, {
      listMessageIdsFrom: listFrom,
      listLabelledIds: vi.fn(
        async (_t: string, label: string) =>
          new Set(mailbox.filter((m) => (label === "unread" ? m.unread : m.isProtected)).map((m) => m.id)),
      ),
    });
    const store = createMemoryMailIndex();
    const readAtCount: number[] = [];

    await syncMailIndex(provider, "t", store, {
      ...options,
      quickCount: 1,
      onCounted: () => {
        readAtCount.push(provider.getMessageMetadata.mock.calls.length);
      },
    });

    // Counting happened after reading one shop message (plus the people),
    // not all 40, and the shop was counted with a single search.
    expect(readAtCount[0]).toBeLessThanOrEqual(1 + 8 + 1);
    expect(listFrom).toHaveBeenCalledTimes(1);
    const census = await store.allCensus("gmail");
    expect(census).toHaveLength(1);
    expect(census[0]).toMatchObject({ address: "deals@shop.com", unread: 40, starred: 0 });
    expect(census[0].ids).toHaveLength(40);
    // People's one-off messages aren't counted by search.
    expect(listFrom).not.toHaveBeenCalledWith("t", "p1@example.com", expect.anything(), expect.anything());
    // The detail pass still reads everything in the end.
    expect((await store.ids("gmail")).size).toBe(42);
  });

  it("counts a person once they've written twice", async () => {
    const mailbox = [
      { ...message("a1", ["INBOX"], 31), fromAddress: "pal@x.com" },
      { ...message("a2", ["INBOX"], 32), fromAddress: "pal@x.com" },
      { ...message("a3", ["INBOX"], 33), fromAddress: "pal@x.com" },
    ];
    const fake = fakeGmail(mailbox);
    const listFrom = vi.fn(async () => ["a1", "a2", "a3"]);
    const provider = Object.assign(fake.provider, { listMessageIdsFrom: listFrom });
    const store = createMemoryMailIndex();

    await syncMailIndex(provider, "t", store, { ...options, quickCount: 0 });

    expect(listFrom).toHaveBeenCalledTimes(1);
    const [row] = await store.allCensus("gmail");
    expect(row.ids.sort()).toEqual(["a1", "a2", "a3"]);
    expect(row.unread).toBe(-1);
  });

  it("reads the last 30 days in full before counting older mail (2.1)", async () => {
    const recent = Array.from({ length: 20 }, (_, i) => bulk(`new${i}`, "deals@shop.com", i + 1));
    const old = Array.from({ length: 20 }, (_, i) => bulk(`old${i}`, "deals@shop.com", i + 40));
    const mailbox = [...recent, ...old];
    const fake = fakeGmail(mailbox);
    const listFrom = vi.fn(async (_t: string, address: string) =>
      mailbox.filter((m) => m.fromAddress === address).map((m) => m.id),
    );
    const provider = Object.assign(fake.provider, { listMessageIdsFrom: listFrom });
    const store = createMemoryMailIndex();
    let recentReadFirst = false;

    await syncMailIndex(provider, "t", store, {
      ...options,
      quickCount: 0,
      onCounted: async () => {
        const ids = await store.ids("gmail");
        recentReadFirst = recent.every((m) => ids.has(m.id));
      },
    });

    expect(recentReadFirst).toBe(true);
    // Older mail still goes through the census: one search, not 20 reads.
    expect(listFrom).toHaveBeenCalledTimes(1);
    expect((await store.ids("gmail")).size).toBe(40);
  });
});
