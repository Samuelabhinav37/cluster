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
const refreshBrandDomains = vi.fn(async () => true);
vi.mock("./lib/threatSignals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/threatSignals")>();
  return { ...actual, refreshBrandDomains };
});
const refreshMalwareBlocklist = vi.fn(async () => true);
vi.mock("./lib/blocklist", () => ({ refreshMalwareBlocklist }));
const refreshSpamList = vi.fn(async () => true);
vi.mock("./lib/spamList", () => ({ refreshSpamList }));

// ── chrome stub with listener capture ────────────────────────────────────
type AlarmCb = (a: { name: string }) => void;
let alarmListener: AlarmCb | undefined;
const setBadgeText = vi.fn(async () => {});
const setBadgeBackgroundColor = vi.fn(async () => {});
const alarmsCreate = vi.fn();
type InstalledCb = (d?: { reason: string }) => void;
let installedListener: InstalledCb | undefined;
const tabsCreate = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  gmailConnected = true;
  gmailQuotaHeadroom.mockResolvedValue(6000);
  buildSenderSummaries.mockResolvedValue([]);
  alarmListener = undefined;

  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      getURL: (p: string) => p,
      onInstalled: {
        addListener: (fn: InstalledCb) => {
          installedListener = fn;
          fn(undefined);
        },
      },
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
    tabs: { query: async () => [], create: tabsCreate, update: () => {} },
  };

  vi.resetModules();
  await import("./background");
});

const settleTriage = () =>
  vi.waitFor(() => expect(updateSettings).toHaveBeenCalled(), { timeout: 2000, interval: 10 });

describe("install", () => {
  it("opens the dashboard on a fresh install, so the welcome screen is the first thing seen", async () => {
    installedListener?.({ reason: "install" });
    await vi.waitFor(() =>
      expect(tabsCreate).toHaveBeenCalledWith({ url: "src/dashboard/index.html" }),
    );
  });

  it("stays silent on an extension or Chrome update", async () => {
    installedListener?.({ reason: "update" });
    installedListener?.({ reason: "chrome_update" });
    await new Promise((r) => setTimeout(r, 20));
    expect(tabsCreate).not.toHaveBeenCalled();
  });
});

describe("alarm routing", () => {
  it("registers the four alarms on install", () => {
    expect(alarmsCreate).toHaveBeenCalledWith("cluster-triage", expect.any(Object));
    expect(alarmsCreate).toHaveBeenCalledWith("cluster-athena-flush", expect.any(Object));
    expect(alarmsCreate).toHaveBeenCalledWith("cluster-jobs", expect.any(Object));
    expect(alarmsCreate).toHaveBeenCalledWith("cluster-dataset-refresh", expect.any(Object));
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

  it("the dataset-refresh alarm refreshes all three public datasets independently", async () => {
    alarmListener!({ name: "cluster-dataset-refresh" });
    await new Promise((r) => setTimeout(r, 10));
    expect(refreshBrandDomains).toHaveBeenCalledTimes(1);
    expect(refreshMalwareBlocklist).toHaveBeenCalledTimes(1);
    expect(refreshSpamList).toHaveBeenCalledTimes(1);
  });

  it("one dataset refresh failing does not block the others", async () => {
    refreshBrandDomains.mockRejectedValueOnce(new Error("offline"));
    alarmListener!({ name: "cluster-dataset-refresh" });
    await new Promise((r) => setTimeout(r, 10));
    expect(refreshMalwareBlocklist).toHaveBeenCalledTimes(1);
    expect(refreshSpamList).toHaveBeenCalledTimes(1);
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

describe("auto-quarantine (opt-in)", () => {
  const highRiskSender = (address: string) => ({
    key: `gmail:${address}`,
    provider: "gmail",
    address,
    displayName: "Chase Miller",
    count: 2,
    messageIds: ["q1", "q2"],
    protectedMessageIds: [],
    unsubscribe: {},
    messages: [],
    threatSignals: [{ kind: "freemail-brand-claim", brand: "chase", confidence: "high" }],
    authVerdicts: { spf: "pass", dkim: "pass", dmarc: "pass" },
    firstContact: false,
  });

  async function triageWith(sender: ReturnType<typeof highRiskSender>, sentTo: string[]) {
    const saved = { ...SETTINGS };
    Object.assign(SETTINGS, {
      autoQuarantineHighRisk: true,
      quarantineReview: {},
      quarantinedSenders: {},
      sentCorrespondents: { addresses: sentTo, fetchedAt: Date.now() },
    });
    buildIncrementalSenderSummaries.mockResolvedValueOnce({
      senders: [sender] as never[],
      cursors: {},
      resetProviders: [],
      changedMessageCount: 2,
    });
    try {
      alarmListener!({ name: "cluster-triage" });
      await settleTriage();
      await new Promise((r) => setTimeout(r, 30));
    } finally {
      for (const k of Object.keys(SETTINGS)) delete (SETTINGS as Record<string, unknown>)[k];
      Object.assign(SETTINGS, saved);
    }
  }

  const labelSuspicious = async () =>
    ((await import("./lib/providers/gmailProvider")).gmailProvider as unknown as { labelSuspicious: ReturnType<typeof vi.fn> })
      .labelSuspicious;

  it("quarantines an unknown high-risk sender when the setting is on", async () => {
    await triageWith(highRiskSender("stranger@gmail.com"), []);
    expect(await labelSuspicious()).toHaveBeenCalledWith(expect.anything(), ["q1", "q2"]);
  });

  // Audit finding: runQuarantine never consults the known-correspondent set,
  // so someone you email (here, a friend whose name contains a brand word)
  // can have their mail filed out of the inbox as "Possible Phishing".
  it.fails("KNOWN BUG: quarantines mail from someone the user corresponds with", async () => {
    await triageWith(highRiskSender("chase.miller@gmail.com"), ["chase.miller@gmail.com"]);
    expect(await labelSuspicious()).not.toHaveBeenCalled();
  });
});
