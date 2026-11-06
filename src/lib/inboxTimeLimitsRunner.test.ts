import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryMailIndex, type MailIndexStore } from "./mailIndex";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";
import type { ScanState } from "./scanState";

let index: MailIndexStore;
let scan: ScanState | null;
const labelFromIndex = vi.fn();

vi.mock("./providers/gmailProvider", () => ({
  gmailProvider: { id: "gmail", isConnected: async () => true, getAuthToken: async () => "t" },
}));
vi.mock("./settingsStore", () => ({
  getSettings: async () => ({
    autoSort: { timeLimitsEnabled: true, labelsOff: [], inboxHoursByBucket: {} },
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
vi.mock("./indexTriage", () => ({ applyIndexedCorrespondents: vi.fn(async () => undefined) }));
vi.mock("./inboxTimeLimits", async (orig) => ({ ...(await orig<object>()), labelFromIndex: (...a: unknown[]) => labelFromIndex(...a) }));

const { readLabeller } = await import("./inboxTimeLimitsRunner");

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

  it("is off once the read is finished", async () => {
    await index.setState({ provider: "gmail", complete: true });
    expect(await readLabeller()).toBeNull();
  });
});
