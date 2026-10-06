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
    await refreshDataset("widgets", "widgets.json", isStringArray, "block");
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

    const updated = await refreshDataset("widgets", "widgets.json", isStringArray, "block");

    expect(updated).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(`${DATASET_BASE_URL}/widgets.json`);
    expect(await getDataset("widgets", [])).toEqual(["a"]);
  });

  it("leaves the cache untouched when the response fails validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ not: "an array" }), { status: 200 })),
    );
    const updated = await refreshDataset("widgets", "widgets.json", isStringArray, "block");
    expect(updated).toBe(false);
    expect(await getDataset("widgets", ["fallback"])).toEqual(["fallback"]);
  });

  it("leaves the cache untouched when the fetch is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const updated = await refreshDataset("widgets", "widgets.json", isStringArray, "block");
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
    const updated = await refreshDataset("widgets", "widgets.json", isStringArray, "block");
    expect(updated).toBe(false);
    expect(await getDataset("widgets", ["fallback"])).toEqual(["fallback"]);
  });

  it("skips refetching when the cache is still within the minimum refresh interval", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(["a"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await refreshDataset("widgets", "widgets.json", isStringArray, "block");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Still well within the 6h minimum interval -- must not refetch.
    vi.setSystemTime(60 * 60 * 1000);
    const updated = await refreshDataset("widgets", "widgets.json", isStringArray, "block");
    expect(updated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches once the cache is older than the minimum refresh interval", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(["a"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await refreshDataset("widgets", "widgets.json", isStringArray, "block");
    vi.setSystemTime(7 * 60 * 60 * 1000); // past the 6h minimum interval
    const updated = await refreshDataset("widgets", "widgets.json", isStringArray, "block");

    expect(updated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does nothing when chrome.storage isn't available at all", async () => {
    (globalThis as any).chrome = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const updated = await refreshDataset("widgets", "widgets.json", isStringArray, "block");
    expect(updated).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("refreshDataset: signed datasets", () => {
  const body = JSON.stringify(["a", "b"]);

  async function keypair() {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    const publicKeyB64 = btoa(String.fromCharCode(...spki.subarray(12)));
    const sign = async (text: string) => {
      const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", pair.privateKey, new TextEncoder().encode(text)));
      return btoa(String.fromCharCode(...sig));
    };
    return { publicKeyB64, sign };
  }

  function serve(files: Record<string, string>) {
    const fetchMock = vi.fn(async (url: string) => {
      const path = url.slice(DATASET_BASE_URL.length + 1);
      return path in files ? new Response(files[path], { status: 200 }) : new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("never fetches an allow-list when no key is configured", async () => {
    const fetchMock = serve({ "widgets.json": body });
    expect(await refreshDataset("widgets", "widgets.json", isStringArray, "allow", "")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches an allow-list whose signature verifies", async () => {
    const { publicKeyB64, sign } = await keypair();
    serve({ "widgets.json": body, "widgets.json.sig": await sign(body) });
    expect(await refreshDataset("widgets", "widgets.json", isStringArray, "allow", publicKeyB64)).toBe(true);
    expect(await getDataset("widgets", [])).toEqual(["a", "b"]);
  });

  it("rejects a file changed after signing", async () => {
    const { publicKeyB64, sign } = await keypair();
    serve({ "widgets.json": JSON.stringify(["a", "b", "scam.example"]), "widgets.json.sig": await sign(body) });
    expect(await refreshDataset("widgets", "widgets.json", isStringArray, "allow", publicKeyB64)).toBe(false);
    expect(await getDataset("widgets", ["fallback"])).toEqual(["fallback"]);
  });

  it("rejects a signature from a different key", async () => {
    const { publicKeyB64 } = await keypair();
    const other = await keypair();
    serve({ "widgets.json": body, "widgets.json.sig": await other.sign(body) });
    expect(await refreshDataset("widgets", "widgets.json", isStringArray, "allow", publicKeyB64)).toBe(false);
  });

  it("rejects a missing signature once a key is configured, even for a block list", async () => {
    const { publicKeyB64 } = await keypair();
    serve({ "widgets.json": body });
    expect(await refreshDataset("widgets", "widgets.json", isStringArray, "block", publicKeyB64)).toBe(false);
    expect(await getDataset("widgets", ["fallback"])).toEqual(["fallback"]);
  });

  it("ignores a cache written before signature checks existed", async () => {
    await chrome.storage.local.set({ "remoteDataset:widgets": { data: ["old"], fetchedAt: 0 } });
    expect(await getDataset("widgets", ["fallback"])).toEqual(["fallback"]);
  });
});
