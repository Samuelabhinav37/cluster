// Orchestration test for the service worker. background.ts registers its
// listeners at import time and exports nothing, so the test mocks `chrome`,
// captures the alarm listener it registers, mocks every collaborator, then
// fires alarms and asserts the routing + the runBackgroundTriage guard rails.
// The collaborators each have their own unit tests; this covers the wiring
// between them, which nothing else does.
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── collaborator mocks ───────────────────────────────────────────────────
const resurfaceDueSnoozed = vi.fn(async () => 0);
const flushAthenaSecurityEvents = vi.fn(async () => {});
const queueAthenaSecurityEvents = vi.fn(async () => {});
const resumeInterruptedJobs = vi.fn(async () => {});
const gmailQuotaHeadroom = vi.fn(async () => 6000);
const buildSenderSummaries = vi.fn(async () => []);
const buildIncrementalSenderSummaries = vi.fn(async () => ({
  senders: [],
  cursors: {},
  resetProviders: [],
  changedMessageCount: 0,
}));
const applyRules = vi.fn(async () => []);
const updateSettings = vi.fn(async (_patch?: Record<string, unknown>) => ({}));
const mutateSettings = vi.fn(async (_fn?: (s: unknown) => unknown) => ({}));

const SETTINGS = {
  maxMessagesPerProvider: 150,
  scanWindowDays: 180,
  snoozedMessages: {},
  incrementalSyncCursors: {},
  knownSenders: {},
  knownSendersInitialized: true,
  rules: [],
  screenerEnabled: false,
  autoQuarantineHighRisk: false,
  senderEngagement: {},
  mutedSenders: [],
  screenedSenders: [],
  sentCorrespondents: { addresses: [], fetchedAt: Date.now() },
};

let gmailConnected = true;

vi.mock("./lib/snoozeResurface", () => ({ resurfaceDueSnoozed }));
vi.mock("./lib/athenaIntegration", () => ({
  flushAthenaSecurityEvents,
  queueAthenaSecurityEvents,
}));
vi.mock("./lib/durableJobs", () => ({ resumeInterruptedJobs }));
vi.mock("./lib/gmailQuotaLedger", () => ({ gmailQuotaHeadroom }));
vi.mock("./lib/metadataCache", () => ({
  loadMetadataCache: vi.fn(async () => new Map()),
  saveMetadataCache: vi.fn(async () => {}),
}));
vi.mock("./lib/senderModel", () => ({ buildSenderSummaries }));
vi.mock("./lib/incrementalSync", () => ({ buildIncrementalSenderSummaries }));
vi.mock("./lib/ruleRunner", () => ({ applyRules }));
vi.mock("./lib/ruleCompletionLedger", () => ({
  getRuleCompletionKeys: vi.fn(async () => new Set()),
  recordRuleCompletions: vi.fn(async () => {}),
}));
vi.mock("./lib/firstContact", () => ({
  markFirstContact: () => ({ updatedKnownSenders: {}, firstContactCount: 0 }),
}));
vi.mock("./lib/engagementModel", () => ({ updateEngagementObservations: () => ({}) }));
vi.mock("./lib/expiryTriage", () => ({
  buildExpiryBuckets: () => [],
  totalExpiryCount: () => 0,
}));
vi.mock("./lib/snoozeFilter", () => ({ excludeSnoozedMessages: (s: unknown) => s }));
const refreshSentCorrespondents = vi.fn(async (settings: { sentCorrespondents: unknown }) => settings.sentCorrespondents);
vi.mock("./lib/screener", () => ({
  knownSenderSet: () => new Set(),
  pendingScreenerSenders: () => [],
  sentCorrespondentsStale: () => false,
  refreshSentCorrespondents,
}));
vi.mock("./lib/settingsStore", () => ({
  getSettings: async () => SETTINGS,
  updateSettings,
  mutateSettings,
}));
vi.mock("./lib/providers/gmailProvider", () => ({
  gmailProvider: {
    id: "gmail",
    isConnected: () => Promise.resolve(gmailConnected),
    getAuthToken: () => Promise.resolve("gmail-token"),
    screenSender: vi.fn(),
    labelSuspicious: vi.fn(),
  },
}));
vi.mock("./lib/providers/outlookProvider", () => ({
  outlookProvider: { id: "outlook", isConnected: () => Promise.resolve(false) },
}));

// ── chrome stub with listener capture ────────────────────────────────────
type AlarmCb = (a: { name: string }) => void;
let alarmListener: AlarmCb | undefined;
const setBadgeText = vi.fn(async () => {});
const setBadgeBackgroundColor = vi.fn(async () => {});
const alarmsCreate = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  gmailConnected = true;
  gmailQuotaHeadroom.mockResolvedValue(6000);
  buildSenderSummaries.mockResolvedValue([]);
  alarmListener = undefined;

  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      getURL: (p: string) => p,
      onInstalled: { addListener: (fn: () => void) => fn() },
      onStartup: { addListener: () => {} },
    },
    action: {
      onClicked: { addListener: () => {} },
      setBadgeText,
      setBadgeBackgroundColor,
    },
    alarms: {
      create: alarmsCreate,
      onAlarm: { addListener: (fn: AlarmCb) => (alarmListener = fn) },
    },
    tabs: { query: async () => [], create: () => {}, update: () => {} },
  };

  vi.resetModules();
  await import("./background");
});

const settleTriage = () =>
  vi.waitFor(() => expect(updateSettings).toHaveBeenCalled(), { timeout: 2000, interval: 10 });

describe("alarm routing", () => {
  it("registers the three alarms on install", () => {
    expect(alarmsCreate).toHaveBeenCalledWith("cluster-triage", expect.any(Object));
    expect(alarmsCreate).toHaveBeenCalledWith("cluster-athena-flush", expect.any(Object));
    expect(alarmsCreate).toHaveBeenCalledWith("cluster-jobs", expect.any(Object));
  });

  it("the triage alarm resurfaces due snoozes and starts a triage pass", async () => {
    alarmListener!({ name: "cluster-triage" });
    expect(resurfaceDueSnoozed).toHaveBeenCalledTimes(1);
    await settleTriage();
  });

  it("the athena alarm flushes queued events and nothing else", () => {
    alarmListener!({ name: "cluster-athena-flush" });
    expect(flushAthenaSecurityEvents).toHaveBeenCalledTimes(1);
    expect(resurfaceDueSnoozed).not.toHaveBeenCalled();
  });

  it("the jobs alarm resumes interrupted durable jobs", () => {
    alarmListener!({ name: "cluster-jobs" });
    expect(resumeInterruptedJobs).toHaveBeenCalledTimes(1);
  });

  it("ignores an unknown alarm name", () => {
    alarmListener!({ name: "something-else" });
    expect(resurfaceDueSnoozed).not.toHaveBeenCalled();
    expect(flushAthenaSecurityEvents).not.toHaveBeenCalled();
    expect(resumeInterruptedJobs).not.toHaveBeenCalled();
  });
});

describe("runBackgroundTriage guard rails", () => {
  it("does not scan when no provider is connected", async () => {
    gmailConnected = false;
    alarmListener!({ name: "cluster-triage" });
    await new Promise((r) => setTimeout(r, 20));
    expect(buildSenderSummaries).not.toHaveBeenCalled();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("skips the cycle when Gmail quota headroom is low", async () => {
    gmailQuotaHeadroom.mockResolvedValue(500);
    alarmListener!({ name: "cluster-triage" });
    await new Promise((r) => setTimeout(r, 20));
    expect(buildSenderSummaries).not.toHaveBeenCalled();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("on the happy path writes the triage summary and updates the badge", async () => {
    alarmListener!({ name: "cluster-triage" });
    await settleTriage();

    expect(buildSenderSummaries).toHaveBeenCalledTimes(1);
    expect(applyRules).toHaveBeenCalledTimes(1);
    const summaryPatch = updateSettings.mock.calls
      .map(([arg]) => arg ?? {})
      .find((arg) => "lastTriageSummary" in arg) as { lastTriageSummary?: string } | undefined;
    expect(summaryPatch?.lastTriageSummary).toContain("ready to clean up");
    // total + held = 0 → badge cleared, not set to a number
    expect(setBadgeText).toHaveBeenCalledWith({ text: "" });
    // The known-correspondent refresh now runs every triage pass regardless
    // of screenerEnabled (SETTINGS above has it false) -- it feeds the
    // general protection gate, not just the opt-in Screener.
    expect(refreshSentCorrespondents).toHaveBeenCalledTimes(1);
  });

  it("swallows a scan failure instead of letting it reject out of the alarm", async () => {
    buildSenderSummaries.mockRejectedValueOnce(new Error("Gmail 500"));
    expect(() => alarmListener!({ name: "cluster-triage" })).not.toThrow();
    await new Promise((r) => setTimeout(r, 30));
    expect(setBadgeText).not.toHaveBeenCalled();
  });
});
