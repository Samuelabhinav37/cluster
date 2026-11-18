// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

describe("Diagnostics", () => {
  it("puts a job failing 3 times in a row at the top, in plain words", async () => {
    const items: Record<string, unknown> = {
      clusterJobHealth: { sort: { failures: 3, nextTryAt: 0, lastError: "Cluster's sign-in helper didn't answer" }, weekly: { failures: 1, nextTryAt: 0 } },
    };
    (globalThis as any).chrome = {
      storage: {
        local: { get: async (k: string) => (k in items ? { [k]: items[k] } : {}) },
        session: { setAccessLevel: async () => {}, get: async () => ({}) },
        onChanged: { addListener: () => {} },
      },
    };
    (globalThis as any).__BUILD__ = "test";
    document.body.innerHTML = `<div id="settings-runs"></div>`;
    const { renderRuns } = await import("./settingsMore");
    await renderRuns();
    const first = document.querySelector("#settings-runs .run-row") as HTMLElement;
    expect(first.dataset.status).toBe("failed");
    expect(first.textContent).toBe("Can't sort your inboxCluster's sign-in helper didn't answer, 3 times in a row");
    expect(document.querySelectorAll('#settings-runs [data-status="failed"]').length).toBe(1);
  });
});
