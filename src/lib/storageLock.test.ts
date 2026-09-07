import { afterEach, describe, expect, it, vi } from "vitest";
import { withStorageLock } from "./storageLock";

afterEach(() => {
  vi.unstubAllGlobals();
});

const defer = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("withStorageLock (process-local fallback — no navigator.locks)", () => {
  it("runs callers for the same key one at a time, in call order", async () => {
    const events: string[] = [];
    const gateA = defer<void>();

    const a = withStorageLock("k", async () => {
      events.push("a:start");
      await gateA.promise;
      events.push("a:end");
      return "a";
    });
    const b = withStorageLock("k", async () => {
      events.push("b:start");
      return "b";
    });

    // b must not have started while a holds the lock.
    await Promise.resolve();
    expect(events).toEqual(["a:start"]);

    gateA.resolve();
    expect(await Promise.all([a, b])).toEqual(["a", "b"]);
    expect(events).toEqual(["a:start", "a:end", "b:start"]);
  });

  it("does not serialize across different keys", async () => {
    const events: string[] = [];
    const gate = defer<void>();

    const x = withStorageLock("kx", async () => {
      events.push("x:start");
      await gate.promise;
      return "x";
    });
    const y = withStorageLock("ky", async () => {
      events.push("y:start");
      return "y";
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toContain("y:start"); // y ran while x is still held

    gate.resolve();
    await Promise.all([x, y]);
  });

  it("a rejected holder still releases the lock for the next caller", async () => {
    const failing = withStorageLock("k", async () => {
      throw new Error("holder blew up");
    });
    await expect(failing).rejects.toThrow("holder blew up");

    const next = await withStorageLock("k", async () => "recovered");
    expect(next).toBe("recovered");
  });
});

describe("withStorageLock (navigator.locks available)", () => {
  it("delegates to navigator.locks.request with a namespaced exclusive lock", async () => {
    const request = vi.fn(
      async (_name: string, _opts: unknown, fn: () => Promise<unknown>) => fn(),
    );
    vi.stubGlobal("navigator", { locks: { request } });

    const result = await withStorageLock("quota", async () => 42);

    expect(result).toBe(42);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("cluster-storage:quota");
    expect(request.mock.calls[0][1]).toEqual({ mode: "exclusive" });
  });
});
