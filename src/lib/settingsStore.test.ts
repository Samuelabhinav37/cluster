import { beforeEach, describe, expect, it } from "vitest";
import { CURRENT_SETTINGS_SCHEMA_VERSION, getSettings, updateSettings } from "./settingsStore";

function makeFakeChromeStorage() {
  let store: Record<string, unknown> = {};
  return {
    local: {
      async get(key: string) {
        return key in store ? { [key]: store[key] } : {};
      },
      async set(items: Record<string, unknown>) {
        store = { ...store, ...items };
      },
    },
  };
}

beforeEach(() => {
  (globalThis as any).chrome = { storage: makeFakeChromeStorage() };
});

describe("settingsStore", () => {
  it("returns defaults when nothing has been stored yet", async () => {
    const settings = await getSettings();
    expect(settings.scanWindowDays).toBe(180);
    expect(settings.maxMessagesPerProvider).toBe(150);
    expect(settings.fastPermanentDeleteEnabled).toBe(false);
    expect(settings.unsubscribeRequests).toEqual({});
    expect(settings.onboardingDismissed).toBe(false);
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.clusterOwnedLabels).toEqual([]);
    expect(settings.labelChoices).toEqual({});
    expect(settings.sortOverrides).toEqual({});
    expect(settings.autoSort.filterIdsByBucket).toEqual({});
    expect(settings.autoSort.ruleIdsByBucket).toEqual({});
    expect(settings.seededFromExisting).toBe(false);
  });

  it("updateSettings merges a partial change on top of current values and persists it", async () => {
    const updated = await updateSettings({ scanWindowDays: 90 });
    expect(updated.scanWindowDays).toBe(90);
    expect(updated.maxMessagesPerProvider).toBe(150); // untouched field preserved

    const reread = await getSettings();
    expect(reread.scanWindowDays).toBe(90);
  });

  it("applies successive partial updates cumulatively", async () => {
    await updateSettings({ fastPermanentDeleteEnabled: true });
    await updateSettings({ collapsedDomainCategories: ["shopping"] });
    const settings = await getSettings();
    expect(settings.fastPermanentDeleteEnabled).toBe(true);
    expect(settings.collapsedDomainCategories).toEqual(["shopping"]);
  });

  it("migrates legacy settings and deep-merges nested defaults", async () => {
    await chrome.storage.local.set({
      clusterSettings: {
        scanWindowDays: 30,
        autoSort: { enabledBuckets: ["shopping"] },
      },
    });

    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.scanWindowDays).toBe(30);
    expect(settings.autoSort.enabledBuckets).toEqual(["shopping"]);
    expect(settings.autoSort.fileOutByBucket).toEqual({});
    expect(settings.autoSort.keepSorting).toBe(false);
    expect(settings.incrementalSyncCursors).toEqual({});
    expect(settings.senderEngagement).toEqual({});
  });

  it("migrates schema 2 settings with an empty private engagement model", async () => {
    await chrome.storage.local.set({
      clusterSettings: { schemaVersion: 2, scanWindowDays: 60, incrementalSyncCursors: {} },
    });

    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.scanWindowDays).toBe(60);
    expect(settings.senderEngagement).toEqual({});
  });

  it("migrates schema 3 settings with an empty flat-label collision state", async () => {
    await chrome.storage.local.set({
      clusterSettings: { schemaVersion: 3, scanWindowDays: 45, senderEngagement: {} },
    });

    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.scanWindowDays).toBe(45);
    expect(settings.clusterOwnedLabels).toEqual([]);
    expect(settings.labelChoices).toEqual({});
    expect(settings.sortOverrides).toEqual({});
  });

  it("migrates schema 4 settings with an empty sort-override map", async () => {
    await chrome.storage.local.set({
      clusterSettings: { schemaVersion: 4, scanWindowDays: 20, clusterOwnedLabels: ["Shopping"] },
    });

    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.scanWindowDays).toBe(20);
    expect(settings.clusterOwnedLabels).toEqual(["🛍 Shopping", "Shopping"]); // v12 adds today's name
    expect(settings.sortOverrides).toEqual({});
  });

  it("migrates schema 5 settings with an empty server-sort filter map, keeping other autoSort fields", async () => {
    await chrome.storage.local.set({
      clusterSettings: {
        schemaVersion: 5,
        autoSort: { enabledBuckets: ["shopping"], keepSorting: true },
      },
    });

    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.autoSort.enabledBuckets).toEqual(["shopping"]);
    expect(settings.autoSort.keepSorting).toBe(true);
    expect(settings.autoSort.filterIdsByBucket).toEqual({});
    expect(settings.autoSort.ruleIdsByBucket).toEqual({});
  });

  it("migrates schema 6 settings with an empty Outlook rule map", async () => {
    await chrome.storage.local.set({
      clusterSettings: {
        schemaVersion: 6,
        autoSort: { keepSorting: true, filterIdsByBucket: { shopping: ["f1"] } },
      },
    });

    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.autoSort.filterIdsByBucket).toEqual({ shopping: ["f1"] });
    expect(settings.autoSort.ruleIdsByBucket).toEqual({});
  });

  it("migrates schema 7 settings with seededFromExisting defaulted false", async () => {
    await chrome.storage.local.set({
      clusterSettings: { schemaVersion: 7, scanWindowDays: 12 },
    });

    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.scanWindowDays).toBe(12);
    expect(settings.seededFromExisting).toBe(false);
  });

  it("migrates schema 8 settings with theme defaulted to system", async () => {
    await chrome.storage.local.set({
      clusterSettings: { schemaVersion: 8, scanWindowDays: 9, seededFromExisting: true },
    });

    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.scanWindowDays).toBe(9);
    expect(settings.seededFromExisting).toBe(true);
    expect(settings.theme).toBe("system");
  });

  it("migrates schema 9 settings with quarantine tracking defaulted empty", async () => {
    await chrome.storage.local.set({
      clusterSettings: { schemaVersion: 9, scanWindowDays: 11 },
    });

    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.scanWindowDays).toBe(11);
    expect(settings.quarantinedSenders).toEqual({});
    expect(settings.quarantineReview).toEqual({});
  });

  it("migrates schema 10 settings with an empty health history", async () => {
    await chrome.storage.local.set({
      clusterSettings: { schemaVersion: 10, scanWindowDays: 8 },
    });

    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.scanWindowDays).toBe(8);
    expect(settings.healthHistory).toEqual([]);
  });

  it("migrates schema 11 settings to the emoji label names", async () => {
    await chrome.storage.local.set({
      clusterSettings: {
        schemaVersion: 11,
        clusterOwnedLabels: ["Newsletters", "Shopping"],
        labelChoices: { Shopping: "Shopping (Cluster)", "My thing": "My thing" },
        rules: [
          {
            id: "a",
            name: "Auto-sort: Newsletters",
            enabled: true,
            conditions: { kind: "newsletter" },
            action: "label",
            labelName: "Newsletters",
          },
          {
            id: "b",
            name: "Auto-sort: expire one-time codes",
            enabled: true,
            conditions: { kind: "otp", olderThanDays: 2 },
            action: "trash",
          },
          {
            id: "c",
            name: "Mine",
            enabled: true,
            conditions: { fromDomain: "x.com" },
            action: "label",
            labelName: "Travel",
            actions: [{ action: "label", labelName: "Cluster/Muted" }],
          },
        ],
      },
    });

    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.clusterOwnedLabels).toEqual(["📰 Newsletters", "🛍 Shopping", "Newsletters", "Shopping"]);
    expect(settings.labelChoices).toEqual({ "My thing": "My thing" });
    const [a, b, c] = settings.rules;
    expect(a.name).toBe("Sort: 📰 Newsletters");
    expect(a.labelName).toBe("📰 Newsletters");
    expect(b.name).toBe("Sort: expire one-time codes");
    // A plain "Travel" Cluster never claimed may be the user's own label: untouched.
    expect(c.labelName).toBe("Travel");
    // A Cluster/-prefixed name is always Cluster's.
    expect(c.actions?.[0].labelName).toBe("🔇 Muted");
  });

  it("migrates schema 12 settings with time limits off and every category's default limit", async () => {
    await chrome.storage.local.set({
      clusterSettings: {
        schemaVersion: 12,
        autoSort: { enabledBuckets: ["otp"], keepSorting: true, filterIdsByBucket: { travel: ["F"] } },
      },
    });

    const settings = await getSettings();
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.autoSort.timeLimitsEnabled).toBe(false);
    expect(settings.autoSort.keepSorting).toBe(true);
    expect(settings.autoSort.filterIdsByBucket).toEqual({ travel: ["F"] });
    expect(settings.autoSort.filterSpecByBucket).toEqual({});
    expect(settings.autoSort.inboxHoursByBucket).toMatchObject({ otp: 24, shipping: 168, travel: null });
  });

  it("serializes concurrent partial updates so unrelated changes are preserved", async () => {
    await Promise.all([
      updateSettings({ scanWindowDays: 14 }),
      updateSettings({ collapsedDomainCategories: ["finance"] }),
    ]);
    const settings = await getSettings();
    expect(settings.scanWindowDays).toBe(14);
    expect(settings.collapsedDomainCategories).toEqual(["finance"]);
  });
});
