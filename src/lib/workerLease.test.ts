import { beforeEach, describe, expect, it } from "vitest";
import { holdWorkerLease, STALE_MS } from "./workerLease";

function area() {
  let items: Record<string, unknown> = {};
  return {
    async get(key: string) {
      return key in items ? { [key]: items[key] } : {};
    },
    async set(next: Record<string, unknown>) {
      items = { ...items, ...next };
    },
  };
}

/** Two computers: separate local storage, one shared sync area. */
const sync = area();
const computers = { a: area(), b: area() };
async function on(name: "a" | "b", now: number) {
  (globalThis as any).chrome = { storage: { local: computers[name], sync } };
  return holdWorkerLease(now);
}

beforeEach(() => {
  (globalThis as any).crypto ??= { randomUUID: () => Math.random().toString(36) };
});

describe("holdWorkerLease", () => {
  it("lets one computer work, and another take over once the first goes quiet", async () => {
    expect(await on("a", 0)).toBe(true);
    expect(await on("b", 5 * 60_000)).toBe(false);
    expect(await on("a", 10 * 60_000)).toBe(true);
    // a stops renewing (closed): b waits out the lease, then takes it.
    expect(await on("b", 10 * 60_000 + STALE_MS - 1)).toBe(false);
    expect(await on("b", 10 * 60_000 + STALE_MS)).toBe(true);
    expect(await on("a", 10 * 60_000 + STALE_MS + 60_000)).toBe(false);
  });

  it("a computer that can't work lets go, and the other takes over at once", async () => {
    (globalThis as any).chrome = { storage: { local: computers.a, sync } };
    expect(await holdWorkerLease(100 * 60_000)).toBe(true);
    // a is signed out: it doesn't claim, and frees the lease.
    expect(await holdWorkerLease(101 * 60_000, false)).toBe(false);
    (globalThis as any).chrome = { storage: { local: computers.b, sync } };
    expect(await holdWorkerLease(102 * 60_000)).toBe(true);
  });

  it("always works without Chrome sync", async () => {
    (globalThis as any).chrome = { storage: { local: area() } };
    expect(await holdWorkerLease(0)).toBe(true);
  });
});
