// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Inbox time limits on the Organize screen: saving turns on per-category
// Gmail filters that label without leaving the inbox, and the existing-inbox
// preview labels what's already there.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

async function openOrganize(dash: Awaited<ReturnType<typeof bootDashboard>>) {
  dash.showScreen("organize");
  await vi.waitFor(() => {
    if (!document.getElementById("time-limit-otp")) throw new Error("rows not rendered yet");
  });
}

describe("Inbox time limits", () => {
  it("shows every category with its default limit", async () => {
    const dash = await bootDashboard();
    await openOrganize(dash);
    expect((dash.el("time-limit-otp") as HTMLSelectElement).value).toBe("24");
    expect((dash.el("time-limit-shipping") as HTMLSelectElement).value).toBe("168");
    expect((dash.el("time-limit-travel") as HTMLSelectElement).value).toBe("stay");
    expect(dash.el("time-limits-rows").textContent).toContain("🏷 Promotions");
    // "Straight to label" skips the inbox, so only Promotions offers it.
    const values = (id: string) => Array.from((dash.el(id) as HTMLSelectElement).options).map((o) => o.value);
    expect(values("time-limit-otp")).not.toContain("0");
    expect(values("time-limit-promotions")).toContain("0");
  });

  it("saving creates a filter per category that labels and keeps mail in the inbox", async () => {
    const dash = await bootDashboard();
    await openOrganize(dash);
    (dash.el("time-limits-toggle") as HTMLInputElement).checked = true;
    const promos = dash.el("time-limit-promotions") as HTMLSelectElement;
    promos.value = "0";
    (dash.el("time-limits-save") as HTMLButtonElement).click();

    await vi.waitFor(() => {
      if (!dash.el("time-limits-status").textContent?.startsWith("Saved.")) throw new Error("not saved yet");
    });
    const calls = dash.gmailApi.createFilter.mock.calls as [string, { query?: string }, { removeLabelIds: string[] }][];
    expect(calls).toHaveLength(11);
    const otp = calls.find(([, c]) => c.query?.startsWith('subject:("verification code"'));
    expect(otp?.[2].removeLabelIds).toEqual([]);
    const promo = calls.find(([, c]) => c.query?.startsWith("category:promotions"));
    expect(promo?.[2].removeLabelIds).toEqual(["INBOX"]);

    const stored = dash.storedSettings().autoSort;
    expect(stored.timeLimitsEnabled).toBe(true);
    expect(stored.inboxHoursByBucket.promotions).toBe(0);
    expect(Object.keys(stored.filterIdsByBucket)).toHaveLength(11);
    expect(dash.el("time-limits-status").textContent).toContain("11 Gmail filters label new mail as it arrives");
  });

  it("labels matching mail already in the inbox without moving it", async () => {
    const dash = await bootDashboard({
      settings: { autoSort: { timeLimitsEnabled: true } as never },
      search: (q) => (q.startsWith("in:inbox -is:starred subject:(\"verification code\"") ? ["m1", "m2"] : []),
    });
    await openOrganize(dash);
    (dash.el("time-limits-backlog-btn") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      if (!dash.el("time-limits-backlog").textContent?.includes("2 messages")) throw new Error("no preview yet");
    });
    expect(dash.el("time-limits-backlog").textContent).toContain("🔑 One-time codes · 2 messages");

    dash.button("time-limits-backlog", "Label them")!.click();
    await vi.waitFor(() => {
      if (!dash.el("time-limits-backlog").textContent?.includes("Labelled 2 messages")) throw new Error("not done");
    });
    expect(dash.gmailApi.batchModify).toHaveBeenCalledWith("gmail-token", ["m1", "m2"], ["label-id"], []);
  });
});
