import { describe, expect, it, vi } from "vitest";
import { continueMailRead } from "./backgroundRead";
import { createMemoryMailIndex, MAIL_ROW_VERSION } from "./mailIndex";
import type { EmailProvider, NormalizedMessageMetadata } from "./providers/emailProvider";
import { gmailLabelFields } from "./providers/gmailProvider";

vi.mock("./inboxTimeLimitsRunner", () => ({ readLabeller: async () => null, learnFromLabelMoves: async () => {} }));
vi.mock("./gmailQuotaLedger", () => ({ waitForGmailHeadroom: async () => {} }));
vi.mock("./indexTriage", () => ({ mailIndexLockKey: () => "mail-index:gmail", applyIndexedCorrespondents: async () => undefined }));

const NOW = 1_800_000_000_000;
const settings = { scanWindowDays: 365, readCap: 100_000 };

function mailbox(n: number): NormalizedMessageMetadata[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    provider: "gmail",
    fromAddress: `s${i}@example.com`,
    fromDisplayName: `s${i}`,
    replyToAddress: "",
    subject: "hi",
    sizeBytes: 1,
    unsubscribe: {},
    receivedAt: NOW - i * 60_000,
    ...gmailLabelFields(["INBOX"]),
    v: MAIL_ROW_VERSION,
  }));
}

function fakeGmail(mail: NormalizedMessageMetadata[], onRead: () => void = () => {}) {
  return {
    id: "gmail",
    isConnected: async () => true,
    getAuthToken: async () => "t",
    listCandidateMessages: async () => mail.map((m) => ({ id: m.id, provider: "gmail" as const })),
    getMessageMetadata: vi.fn(async (_t: string, id: string) => {
      onRead();
      await new Promise((r) => setTimeout(r, 2));
      return { ...mail.find((m) => m.id === id)! };
    }),
    getAccountId: async () => "me@example.com",
    getChangeCursor: async () => "h1",
    listChangesSince: async (_t: string, cursor: string) => ({ added: [], removed: [], labelUpdates: [], cursor, expired: false }),
  } as unknown as EmailProvider & { getMessageMetadata: ReturnType<typeof vi.fn> };
}

describe("continueMailRead", () => {
  it("finishes the read while no dashboard is open, then has nothing left", async () => {
    const store = createMemoryMailIndex();
    const provider = fakeGmail(mailbox(40));
    expect(await continueMailRead(provider, settings, { pageOpen: async () => false, store, now: () => NOW })).toBe("done");
    expect((await store.ids("gmail")).size).toBe(40);
    expect(await continueMailRead(provider, settings, { pageOpen: async () => false, store, now: () => NOW })).toBe("idle");
  });

  it("leaves the read to an open dashboard", async () => {
    const provider = fakeGmail(mailbox(5));
    const store = createMemoryMailIndex();
    expect(await continueMailRead(provider, settings, { pageOpen: async () => true, store })).toBe("busy");
    expect(provider.getMessageMetadata).not.toHaveBeenCalled();
  });

  it("hands over when a dashboard opens mid-read, keeping every row already read", async () => {
    let open = false;
    let reads = 0;
    const provider = fakeGmail(mailbox(400), () => {
      if (++reads === 60) open = true;
    });
    const store = createMemoryMailIndex();
    const outcome = await continueMailRead(provider, settings, { pageOpen: async () => open, store, pollMs: 1, now: () => NOW });
    expect(outcome).toBe("handed-off");
    const kept = (await store.ids("gmail")).size;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(400);
    // The next reader only reads what's left.
    const next = fakeGmail(mailbox(400));
    expect(await continueMailRead(next, settings, { pageOpen: async () => false, store, now: () => NOW })).toBe("done");
    expect(next.getMessageMetadata.mock.calls.length).toBeLessThanOrEqual(400 - kept);
    expect((await store.ids("gmail")).size).toBe(400);
  });
});
