import { describe, expect, it, vi } from "vitest";
import { createMemoryMailIndex, runSnapshot } from "./mailIndex";
import type { NormalizedMessageMetadata } from "./providers/emailProvider";

const row = (id: string) => ({ provider: "gmail", id, receivedAt: 1 }) as unknown as NormalizedMessageMetadata;

describe("runSnapshot", () => {
  it("reads the index once per run, and again after any write", async () => {
    const base = createMemoryMailIndex();
    await base.put([row("a")]);
    const all = vi.spyOn(base, "all");
    const snap = runSnapshot(base);
    expect((await snap.all("gmail")).map((r) => r.id)).toEqual(["a"]);
    await snap.all("gmail");
    expect(all).toHaveBeenCalledTimes(1);
    await snap.put([row("b")]);
    expect((await snap.all("gmail")).map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(all).toHaveBeenCalledTimes(2);
  });

  it("hands each caller its own array, so a sort in one step can't reorder another's", async () => {
    const snap = runSnapshot(createMemoryMailIndex());
    await snap.put([row("a"), row("b")]);
    const first = await snap.all("gmail");
    first.reverse();
    expect(first).not.toBe(await snap.all("gmail"));
  });
});
