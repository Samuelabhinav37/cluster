// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ctx } from "./state";
import type { ClusterSettings } from "../lib/settingsStore";

vi.mock("../lib/settingsStore", () => ({
  updateSettings: vi.fn(async (partial: Partial<ClusterSettings>) => ({ ...ctx.settings, ...partial })),
}));
const { wireStartList } = await import("./startList");

const flush = () => new Promise((r) => setTimeout(r));

describe("Get started card", () => {
  it("waits for setup, ticks items only when they are done, and stays gone once hidden", async () => {
    ctx.settings = { setupDone: false } as ClusterSettings;
    const root = document.createElement("div");
    const open = { screener: vi.fn(), cleanup: vi.fn(), search: vi.fn() };
    const list = wireStartList(root, open);
    expect(root.hidden).toBe(true);

    ctx.settings = { setupDone: true } as ClusterSettings;
    list.paint();
    expect(root.hidden).toBe(false);
    expect(root.querySelector(".sl-count")!.textContent).toBe("0 of 3 done");

    // Clicking an item only takes you there; doing it ticks it.
    root.querySelectorAll<HTMLButtonElement>(".sl-item")[2].click();
    expect(open.search).toHaveBeenCalled();
    expect(root.querySelector(".sl-count")!.textContent).toBe("0 of 3 done");
    document.dispatchEvent(new CustomEvent("cluster:search"));
    // Background sorting is not the user cleaning up.
    document.dispatchEvent(new CustomEvent("cluster:action", { detail: { kind: "pin" } }));
    document.dispatchEvent(new CustomEvent("cluster:action", { detail: { kind: "trash" } }));
    await flush();
    expect(root.querySelector(".sl-count")!.textContent).toBe("2 of 3 done");

    (root.querySelector(".sl-hide") as HTMLButtonElement).click();
    await flush();
    expect(root.hidden).toBe(true);
    list.mark("screener");
    await flush();
    expect(root.hidden).toBe(true);
  });
});
