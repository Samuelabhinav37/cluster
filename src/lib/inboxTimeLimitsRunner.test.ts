import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryMailIndex, type MailIndexStore } from "./mailIndex";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import type { ScanState } from "./scanState";

let index: MailIndexStore;
let scan: ScanState | null;
const labelFromIndex = vi.fn();
let autoSort: Record<string, unknown>;
let indexReady: string[];

vi.mock("./providers/gmailProvider", () => ({
  gmailProvider: { id: "gmail", isConnected: async () => true, getAuthToken: async () => "t" },
}));
vi.mock("./settingsStore", () => ({
  getSettings: async () => ({
    autoSort,
    labelChoices: {},
    sortOverrides: {},
  }),
  mutateSettings: vi.fn(),
}));
vi.mock("./mailIndex", async (orig) => ({ ...(await orig<object>()), openMailIndex: async () => index }));
vi.mock("./scanState", async (orig) => ({
  ...(await orig<object>()),
  getScan: async () => scan,
  setScan: async (patch: Partial<ScanState>) => (scan = { ...(scan as ScanState), ...patch }),
}));
vi.mock("./screener", () => ({ knownSenderSet: () => new Set<string>() }));
vi.mock("./indexTriage", () => ({
  applyIndexedCorrespondents: vi.fn(async () => undefined),
  refreshIndexForBackground: async () => indexReady,
  indexSeededCache: async () => ({ cache: new Map(), saveFetched: async () => {} }),
  mailIndexLockKey: () => "k",
}));
const order: string[] = [];
vi.mock("./inboxTimeLimits", async (orig) => ({
  ...(await orig<object>()),
  labelFromIndex: (...a: unknown[]) => labelFromIndex(...a),
  tagUntaggedInbox: async () => ({ tagged: 0, byBucket: {}, oldestAt: null, listed: 0 }),
  tagOlderInbox: async () => ({ tagged: 0, nextBefore: -3 }),
  sweepExpiredInbox: async () => (order.push("sweep"), { movedIds: ["m1"], keptIds: [], more: false }),
}));
vi.mock("./categoryFilters", () => ({
  categoryLabelName: (b: string) => b,
  desiredCategoryFilters: () => [],
  syncGmailCategoryFilters: async () => {
    throw new Error("filters down");
  },
}));
vi.mock("./mailSync", async (orig) => ({
  ...(await orig<object>()),
  syncMailIndex: async () => {
    order.push("read");
    throw new Error("read died");
  },
}));
vi.mock("./metadataCache", () => ({ loadMetadataCache: async () => new Map(), saveMetadataCache: async () => {} }));
vi.mock("./actionLog", () => ({ appendActionLog: async () => {}, makeLogId: () => "id" }));
vi.mock("./gmailApi", () => ({}));

const { readLabeller, runInboxTimeLimits, LABEL_RULES_VERSION } = await import("./inboxTimeLimitsRunner");

function row(id: string, labelIds: string[]): NormalizedMessageMetadata {
  return {
    id,
    provider: "gmail",
    fromAddress: `${id}@shop.example`,
    fromDisplayName: id,
    replyToAddress: "",
    subject: id,
    isProtected: false,
    unread: true,
    sizeBytes: 1,
    unsubscribe: {},
    receivedAt: 1,
    labelIds,
  };
}

beforeEach(() => {
  index = createMemoryMailIndex();
  scan = null;
  autoSort = { timeLimitsEnabled: true, labelsOff: [], inboxHoursByBucket: {}, lastSweep: { at: 0, moved: 0 } };
  indexReady = [];
  labelFromIndex.mockReset();
  labelFromIndex.mockImplementation(async (_ctx, _api, rows: { id: string }[]) => ({
    labelled: rows.length,
    fixed: 0,
    byBucket: { shopping: rows.length },
    changes: new Map(rows.map((r) => [r.id, { add: ["L_shop"], remove: [] }])),
  }));
});

describe("readLabeller", () => {
  it("labels mail as it's read, archived too, once people you write to are in, and shows the read on the card", async () => {
    await index.setState({ provider: "gmail", complete: false });
    const labeller = (await readLabeller())!;
    expect(scan).toMatchObject({ phase: "reading", done: 0 });

    labeller.onPlanned(300);
    const inbox = Array.from({ length: 250 }, (_, i) => row(`i${i}`, ["INBOX"]));
    const archived = row("a1", ["CATEGORY_UPDATES"]);
    await index.put([...inbox, archived]);
    await labeller.onRead([...inbox, archived], 251);
    // No sent mail yet: nothing is labelled, so a friend's mail can't be.
    expect(labelFromIndex).not.toHaveBeenCalled();

    await labeller.onSentReady();
    await labeller.flush();
    const labelledIds = labelFromIndex.mock.calls.flatMap((c) => (c[2] as { id: string }[]).map((r) => r.id));
    expect(labelledIds).toHaveLength(251);
    expect(labelledIds).toContain("a1");
    expect((await index.get("gmail", ["i0"]))[0].labelIds).toContain("L_shop");
    expect(scan).toMatchObject({ phase: "reading", done: 251, total: 300, labelled: 251, byBucket: { shopping: 251 } });
  });

  it("counts the newest mail once and leaves sent mail out, so read never passes the plan", async () => {
    await index.setState({ provider: "gmail", complete: false });
    const labeller = (await readLabeller())!;
    // Before the plan: the newest 50, then some sent mail.
    await labeller.onRead(Array.from({ length: 50 }, (_, i) => row(`q${i}`, ["INBOX"])), 50);
    await labeller.onRead(Array.from({ length: 30 }, (_, i) => row(`s${i}`, ["SENT"])), 30);
    labeller.onPlanned(200); // the 50 are part of the 200
    await labeller.onRead(Array.from({ length: 150 }, (_, i) => row(`r${i}`, ["INBOX"])), 150);
    expect(scan).toMatchObject({ phase: "reading", done: 200, total: 200 });
  });

  it("is off once the read is finished", async () => {
    await index.setState({ provider: "gmail", complete: true });
    expect(await readLabeller()).toBeNull();
  });
});

describe("runInboxTimeLimits", () => {
  it("moves mail out before the long read, and when the filter sync and the read both fail", async () => {
    await index.setState({ provider: "gmail", complete: false });
    order.length = 0;
    const run = await runInboxTimeLimits(1, {});
    expect(run?.moved).toBe(1);
    expect(order).toEqual(["sweep", "read"]);
  });

  it("once a day labels all read mail, archived too, without the scan card", async () => {
    const day = 24 * 60 * 60 * 1000;
    await index.setState({ provider: "gmail", complete: true });
    await index.put([row("archived", ["L_other"])]);
    indexReady = ["gmail"];
    autoSort = { ...autoSort, labelledVersion: LABEL_RULES_VERSION, searchedVersion: LABEL_RULES_VERSION, lastRelabelAt: 5 * day };

    // Checked less than a day ago: nothing.
    await runInboxTimeLimits(5 * day + 1000, {});
    expect(labelFromIndex).not.toHaveBeenCalled();

    await runInboxTimeLimits(7 * day, {});
    expect(labelFromIndex.mock.calls[0][2]).toEqual([{ id: "archived", labelIds: ["L_other"] }]);
    expect((await index.get("gmail", ["archived"]))[0].labelIds).toContain("L_shop");
    expect(scan).toBeNull();
  });
});
