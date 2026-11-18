import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_SETTINGS_SCHEMA_VERSION, getSettings, pullSyncedSettings, updateSettings } from "./settingsStore";

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
    expect(settings.scanWindowDays).toBe(36500);
    expect(settings.readCap).toBe(20_000);
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
    expect(settings.autoSort.inboxHoursByBucket).toMatchObject({ otp: 1, shipping: 1, travel: 1 });
  });

  it("gives a label added after setup the time setup's answers give it", async () => {
    await chrome.storage.local.set({
      clusterSettings: {
        schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
        onboarding: { version: 1, answers: { sorted: {}, keep: ["people"], hands: "tidy" }, answeredAt: 1 },
        // saved before Jobs existed
        autoSort: { inboxHoursByBucket: { otp: 3, travel: 3 } },
      },
    });

    const hours = (await getSettings()).autoSort.inboxHoursByBucket;
    expect(hours.jobs).toBe(1);
    expect(hours.accounts).toBe(1);
    expect(hours.travel).toBe(3);
  });

  it("migrates schema 14 on through 20: every label waits an hour", async () => {
    await chrome.storage.local.set({
      clusterSettings: {
        schemaVersion: 14,
        onboarding: { version: 1, answers: { sorted: {}, keep: ["people"], hands: "tidy" }, answeredAt: 1 },
        autoSort: { inboxHoursByBucket: { accounts: null, travel: null, otp: 24, promotions: 0 } },
      },
    });

    const hours = (await getSettings()).autoSort.inboxHoursByBucket;
    expect(hours).toMatchObject({ accounts: 1, jobs: 1, travel: 1, otp: 1, promotions: 1 });
  });

  it("migrates schema 16 on through 20: every label waits an hour", async () => {
    await chrome.storage.local.set({
      clusterSettings: { schemaVersion: 16, autoSort: { inboxHoursByBucket: { promotions: 0, receipt: 1, finance: 24, travel: null } } },
    });
    const hours = (await getSettings()).autoSort.inboxHoursByBucket;
    expect(hours).toMatchObject({ promotions: 1, receipt: 1, finance: 1, travel: 1 });
  });

  it("migrates schema 19: labels that skipped the inbox wait an hour, kept labels stay kept", async () => {
    await chrome.storage.local.set({
      clusterSettings: { schemaVersion: 19, autoSort: { inboxHoursByBucket: { promotions: 0, finance: 24, travel: null } } },
    });
    const hours = (await getSettings()).autoSort.inboxHoursByBucket;
    expect(hours).toMatchObject({ promotions: 1, finance: 24, travel: null });
  });

  it("migrates schema 17: forgets the mail earlier sweeps kept in the inbox", async () => {
    await chrome.storage.local.set({ clusterSettings: { schemaVersion: 17, autoSort: { keptInInboxIds: ["a", "b"] } } });
    expect((await getSettings()).autoSort.keptInInboxIds).toEqual([]);
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

describe("settings sync across devices", () => {
  function syncArea() {
    let items: Record<string, unknown> = {};
    const sets: Record<string, unknown>[] = [];
    return {
      sets,
      items: () => items,
      area: {
        async get(keys: string[] | null) {
          return keys === null ? { ...items } : Object.fromEntries(keys.filter((k) => k in items).map((k) => [k, items[k]]));
        },
        async set(next: Record<string, unknown>) {
          sets.push(next);
          items = { ...items, ...next };
        },
        async remove(keys: string[]) {
          items = Object.fromEntries(Object.entries(items).filter(([k]) => !keys.includes(k)));
        },
      },
    };
  }

  it("syncs the user's choices, not this device's bookkeeping, and skips unchanged ones", async () => {
    const sync = syncArea();
    (globalThis as any).chrome.storage.sync = sync.area;
    await pullSyncedSettings();
    await updateSettings({ theme: "dark", actionLog: [] });
    await vi.waitFor(() => expect(sync.items()["settings:theme"]).toBe("dark"));
    expect(Object.keys(sync.items()).some((k) => k.includes("actionLog"))).toBe(false);
    expect(sync.items()["settings:autoSort"]).toHaveProperty("inboxHoursByBucket");
    expect(sync.items()["settings:autoSort"]).not.toHaveProperty("filterIdsByBucket");

    const writes = sync.sets.length;
    await updateSettings({ scanWindowDays: (await getSettings()).scanWindowDays });
    await new Promise((r) => setTimeout(r, 0));
    expect(sync.sets.length).toBe(writes);
  });

  it("a synced copy written by an older version is migrated, not laid back over this computer", async () => {
    const sync = syncArea();
    // Written before every label skipped the inbox, with no schema marker.
    await sync.area.set({ "settings:autoSort": { timeLimitsEnabled: true, inboxHoursByBucket: { jobs: 1, finance: 1 } } });
    (globalThis as any).chrome.storage.sync = sync.area;
    vi.resetModules();
    const fresh = await import("./settingsStore");
    await fresh.pullSyncedSettings();
    const hours = (await fresh.getSettings()).autoSort.inboxHoursByBucket;
    expect(hours).toMatchObject({ jobs: 1, finance: 1 });
    // The first pull pushes this computer's copy, now marked with its schema.
    expect(sync.items()["settings:schema"]).toBe(fresh.CURRENT_SETTINGS_SCHEMA_VERSION);
    expect((sync.items()["settings:autoSort"] as any).inboxHoursByBucket.jobs).toBe(1);
  });

  it("a choice grown past sync's 8 KB item limit syncs in chunks, and a smaller one cleans them up", async () => {
    const sync = syncArea();
    (globalThis as any).chrome.storage.sync = sync.area;
    await pullSyncedSettings();
    const big = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`sender${i}@long-domain-name.example`, "newsletter" as const]));
    await updateSettings({ sortOverrides: big });
    await vi.waitFor(() => expect(sync.items()["settings:sortOverrides"]).toEqual({ chunks: 10 }));
    for (const [key, value] of Object.entries(sync.items())) expect(key.length + JSON.stringify(value).length).toBeLessThanOrEqual(8192);
    // Another computer pulls all 400 back.
    await chrome.storage.local.set({ clusterSettings: { ...(await getSettings()), sortOverrides: {} } });
    await pullSyncedSettings();
    expect(Object.keys((await getSettings()).sortOverrides)).toHaveLength(400);
    await updateSettings({ sortOverrides: { "a@x.example": "shopping" } });
    await vi.waitFor(() => expect(sync.items()["settings:sortOverrides"]).toEqual({ "a@x.example": "shopping" }));
    expect(Object.keys(sync.items()).filter((k) => k.includes("#"))).toEqual([]);
  });

  it("a new computer takes the synced choices and keeps its own bookkeeping", async () => {
    const sync = syncArea();
    await sync.area.set({
      "settings:setupDone": true,
      "settings:theme": "light",
      "settings:autoSort": { timeLimitsEnabled: true, inboxHoursByBucket: { jobs: 1 } },
      "settings:schema": CURRENT_SETTINGS_SCHEMA_VERSION,
    });
    (globalThis as any).chrome.storage.sync = sync.area;
    // A fresh computer: this context hasn't pulled yet.
    vi.resetModules();
    const fresh = await import("./settingsStore");
    // A save before the first pull must not push this computer's defaults.
    await fresh.updateSettings({ lastTriageSummary: "this device" });
    expect(sync.items()["settings:theme"]).toBe("light");

    await fresh.pullSyncedSettings();
    const s = await fresh.getSettings();
    expect(s).toMatchObject({ setupDone: true, theme: "light", lastTriageSummary: "this device" });
    expect(s.autoSort.timeLimitsEnabled).toBe(true);
    expect(s.autoSort.inboxHoursByBucket.jobs).toBe(1);
    // Hours missing from the synced copy keep their default.
    expect(s.autoSort.inboxHoursByBucket.otp).toBe(1);
  });
});
