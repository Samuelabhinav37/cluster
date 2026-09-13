import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DATASET_BASE_URL, getDataset, refreshDataset } from "./remoteDataset";

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

function isStringArray(data: unknown): data is string[] {
  return Array.isArray(data) && data.every((d) => typeof d === "string");
}

beforeEach(() => {
  (globalThis as any).chrome = { storage: makeFakeChromeStorage() };
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("getDataset", () => {
  it("returns the fallback when nothing is cached yet", async () => {
    expect(await getDataset("widgets", ["a", "b"])).toEqual(["a", "b"]);
  });

  it("returns the cached copy once refreshDataset has populated it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(["x", "y"]), { status: 200 })),
    );
    await refreshDataset("widgets", "widgets.json", isStringArray);
    expect(await getDataset("widgets", ["fallback"])).toEqual(["x", "y"]);
  });

  it("falls back gracefully when chrome.storage isn't available at all", async () => {
    (globalThis as any).chrome = undefined;
    expect(await getDataset("widgets", ["fallback"])).toEqual(["fallback"]);
  });
});

describe("refreshDataset", () => {
  it("fetches from DATASET_BASE_URL + path and caches a valid response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(["a"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const updated = await refreshDataset("widgets", "widgets.json", isStringArray);

    expect(updated).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${DATASET_BASE_URL}/widgets.json`);
    expect(await getDataset("widgets", [])).toEqual(["a"]);
  });

  it("leaves the cache untouched when the response fails validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ not: "an array" }), { status: 200 })),
    );
    const updated = await refreshDataset("widgets", "widgets.json", isStringArray);
    expect(updated).toBe(false);
    expect(await getDataset("widgets", ["fallback"])).toEqual(["fallback"]);
  });

  it("leaves the cache untouched when the fetch is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const updated = await refreshDataset("widgets", "widgets.json", isStringArray);
    expect(updated).toBe(false);
    expect(await getDataset("widgets", ["fallback"])).toEqual(["fallback"]);
  });

  it("leaves the cache untouched when fetch itself throws (offline)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const updated = await refreshDataset("widgets", "widgets.json", isStringArray);
    expect(updated).toBe(false);
    expect(await getDataset("widgets", ["fallback"])).toEqual(["fallback"]);
  });

  it("skips refetching when the cache is still within the minimum refresh interval", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(["a"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await refreshDataset("widgets", "widgets.json", isStringArray);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Still well within the 6h minimum interval -- must not refetch.
    vi.setSystemTime(60 * 60 * 1000);
    const updated = await refreshDataset("widgets", "widgets.json", isStringArray);
    expect(updated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches once the cache is older than the minimum refresh interval", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(["a"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await refreshDataset("widgets", "widgets.json", isStringArray);
    vi.setSystemTime(7 * 60 * 60 * 1000); // past the 6h minimum interval
    const updated = await refreshDataset("widgets", "widgets.json", isStringArray);

    expect(updated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does nothing when chrome.storage isn't available at all", async () => {
    (globalThis as any).chrome = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const updated = await refreshDataset("widgets", "widgets.json", isStringArray);
    expect(updated).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
