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
    expect(settings.maxMessagesPerProvider).toBe(500);
    expect(settings.fastPermanentDeleteEnabled).toBe(false);
    expect(settings.unsubscribeRequests).toEqual({});
    expect(settings.onboardingDismissed).toBe(false);
    expect(settings.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.clusterOwnedLabels).toEqual([]);
    expect(settings.labelChoices).toEqual({});
    expect(settings.sortOverrides).toEqual({});
  });

  it("updateSettings merges a partial change on top of current values and persists it", async () => {
    const updated = await updateSettings({ scanWindowDays: 90 });
    expect(updated.scanWindowDays).toBe(90);
    expect(updated.maxMessagesPerProvider).toBe(500); // untouched field preserved

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
    expect(settings.clusterOwnedLabels).toEqual(["Shopping"]);
    expect(settings.sortOverrides).toEqual({});
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
