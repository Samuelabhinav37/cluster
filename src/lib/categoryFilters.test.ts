import { describe, expect, it, vi } from "vitest";
import {
  desiredCategoryFilters,
  specKey,
  syncCategoryFilters,
  type CategoryFilterApi,
  type CategoryFilterSpec,
} from "./categoryFilters";
import type { ClusterSettings } from "./settingsStore";
import { DEFAULT_INBOX_HOURS } from "./sortTaxonomy";

function settings(autoSort: Partial<ClusterSettings["autoSort"]> = {}, extra: Partial<ClusterSettings> = {}) {
  return {
    sortOverrides: {},
    labelChoices: {},
    ...extra,
    autoSort: {
      enabledBuckets: [],
      fileOutByBucket: {},
      keepSorting: false,
      expireOtp: false,
      filterIdsByBucket: {},
      ruleIdsByBucket: {},
      filterSpecByBucket: {},
      timeLimitsEnabled: false,
      inboxHoursByBucket: { ...DEFAULT_INBOX_HOURS },
      lastSweep: { at: 0, moved: 0 },
      keptInInboxIds: [],
      ...autoSort,
    },
  } as unknown as ClusterSettings;
}

function api(): CategoryFilterApi {
  let n = 0;
  return {
    labelIdFor: vi.fn(async (name: string) => `L:${name}`),
    createFilter: vi.fn(async () => `F${++n}`),
    deleteFilter: vi.fn(async () => {}),
    listFilters: vi.fn(async () => []),
  };
}

describe("desiredCategoryFilters", () => {
  it("with time limits on, files every category and keeps mail in the inbox unless its limit is 0", () => {
    const specs = desiredCategoryFilters(
      settings({ timeLimitsEnabled: true, inboxHoursByBucket: { ...DEFAULT_INBOX_HOURS, promotions: 0 } }),
    );
    expect(specs.map((s) => s.bucket)).toContain("otp");
    expect(specs.find((s) => s.bucket === "otp")).toMatchObject({ labelName: "🔑 One-time codes", fileOut: false });
    expect(specs.find((s) => s.bucket === "promotions")?.fileOut).toBe(true);
  });

  it("with only keep-sorting on, covers the enabled categories with their file-out choice", () => {
    const specs = desiredCategoryFilters(
      settings({ keepSorting: true, enabledBuckets: ["otp", "shopping"], fileOutByBucket: { shopping: true } }),
    );
    expect(specs.map((s) => [s.bucket, s.fileOut])).toEqual([
      ["otp", true],
      ["shopping", true],
    ]);
  });

  it("uses the label the user picked when a name clashed", () => {
    const [spec] = desiredCategoryFilters(
      settings({ keepSorting: true, enabledBuckets: ["shopping"] }, { labelChoices: { "🛍 Shopping": "Shopping" } }),
    );
    expect(spec.labelName).toBe("Shopping");
  });

  it("wants nothing when both are off", () => {
    expect(desiredCategoryFilters(settings())).toEqual([]);
  });
});

const otpSpec: CategoryFilterSpec = {
  bucket: "otp",
  labelName: "🔑 One-time codes",
  criteria: { query: "subject:(code)" },
  fileOut: false,
};

describe("syncCategoryFilters", () => {
  it("creates a filter that labels without leaving the inbox", async () => {
    const a = api();
    const res = await syncCategoryFilters([otpSpec], { filterIdsByBucket: {}, filterSpecByBucket: {} }, a);
    expect(a.createFilter).toHaveBeenCalledWith(
      { query: "subject:(code)" },
      { addLabelIds: ["L:🔑 One-time codes"], removeLabelIds: [] },
    );
    expect(res).toMatchObject({ created: 1, deleted: 0, filterIdsByBucket: { otp: ["F1"] } });
  });

  it("keeps an unchanged filter and replaces a changed one", async () => {
    const a = api();
    const current = {
      filterIdsByBucket: { otp: ["OLD_OTP"], shopping: ["OLD_SHOP"] },
      filterSpecByBucket: { otp: specKey(otpSpec), shopping: "stale" },
    };
    const shopSpec: CategoryFilterSpec = { ...otpSpec, bucket: "shopping", labelName: "🛍 Shopping" };
    const res = await syncCategoryFilters([otpSpec, shopSpec], current, a);
    expect(res.filterIdsByBucket.otp).toEqual(["OLD_OTP"]);
    expect(a.deleteFilter).toHaveBeenCalledWith("OLD_SHOP");
    expect(res).toMatchObject({ kept: 1, created: 1, deleted: 1 });
  });

  it("regression: a category that is still wanted keeps its filter however much mail it has", async () => {
    // Old Sort deleted a category's filter when it had no mail in that scan.
    // The desired list now comes from settings only, so nothing is torn down.
    const a = api();
    const current = { filterIdsByBucket: { otp: ["KEEP"] }, filterSpecByBucket: { otp: specKey(otpSpec) } };
    await syncCategoryFilters([otpSpec], current, a);
    expect(a.deleteFilter).not.toHaveBeenCalled();
    expect(a.createFilter).not.toHaveBeenCalled();
  });

  it("deletes filters for categories no longer wanted, ignoring ones already gone", async () => {
    const a = api();
    vi.mocked(a.deleteFilter).mockRejectedValueOnce(new Error("Gmail API 404 Not Found"));
    const res = await syncCategoryFilters([], { filterIdsByBucket: { otp: ["GONE"], travel: ["T"] }, filterSpecByBucket: {} }, a);
    expect(a.deleteFilter).toHaveBeenCalledTimes(2);
    expect(res).toMatchObject({ deleted: 1, filterIdsByBucket: {} });
  });

  it("adopts Gmail's existing copy when it refuses a duplicate", async () => {
    const a = api();
    vi.mocked(a.createFilter).mockRejectedValueOnce(new Error("400 Filter already exists"));
    vi.mocked(a.listFilters).mockResolvedValueOnce([
      { id: "EXISTING", criteria: { query: "subject:(code)" }, action: { addLabelIds: ["L:🔑 One-time codes"] } },
    ]);
    const res = await syncCategoryFilters([otpSpec], { filterIdsByBucket: {}, filterSpecByBucket: {} }, a);
    expect(res.filterIdsByBucket.otp).toEqual(["EXISTING"]);
  });
});
