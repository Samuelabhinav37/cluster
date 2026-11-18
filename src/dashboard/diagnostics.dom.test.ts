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

describe("Scam lists row", () => {
  it("says the date, and says out of date past 30 days", async () => {
    document.body.innerHTML = `<div class="set-row"><span id="list-dates"></span></div>`;
    const { renderListDates } = await import("./settingsMore");
    const bundled = Date.parse((await import("../lib/data/malwareDomains.generated.json")).generatedAt);
    await renderListDates(bundled + 5 * 86_400_000);
    expect(document.getElementById("list-dates")!.textContent).toMatch(/^Updated \w{3} \d+, \d{4}$/);
    await renderListDates(bundled + 40 * 86_400_000);
    expect(document.getElementById("list-dates")!.textContent).toMatch(/^Out of date, last updated /);
  });
});
