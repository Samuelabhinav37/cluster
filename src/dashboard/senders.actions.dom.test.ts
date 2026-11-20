// @vitest-environment jsdom
/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

describe("Settings — Sign out", () => {
  it("asks about Cluster's filters, removes them on request, and revokes Google access", async () => {
    const dash = await bootDashboard({ labels: [{ id: "L1", name: "🔇 Muted", type: "user" }] });
    dash.showScreen("settings");
    (dash.el("settings-signout") as HTMLButtonElement).click();
    const slot = dash.el("settings-signout-slot");
    expect(slot.textContent).toContain("Cluster's Gmail filters");
    Array.from(slot.querySelectorAll("button")).find((b) => b.textContent === "Remove them")!.click();
    await vi.waitFor(() => expect(dash.gmailApi.revokeGoogleAccess).toHaveBeenCalled());
    const [, ids] = dash.gmailApi.deleteFiltersInto.mock.calls[0] as [string, Set<string>];
    expect([...ids]).toEqual(["L1"]);
  });

  it("Remove from Gmail deletes Cluster's filters and labels, never the user's, then signs out", async () => {
    const dash = await bootDashboard({
      labels: [
        { id: "L1", name: "🔇 Muted", type: "user" },
        { id: "MINE", name: "Job Applications", type: "user" },
      ],
    });
    dash.showScreen("settings");
    (dash.el("settings-remove") as HTMLButtonElement).click();
    const slot = dash.el("settings-remove-slot");
    Array.from(slot.querySelectorAll("button")).find((b) => b.textContent === "Filters and labels")!.click();
    await vi.waitFor(() => expect(dash.gmailApi.revokeGoogleAccess).toHaveBeenCalled());
    expect(dash.gmailApi.deleteLabel.mock.calls.map((c) => c[1])).toEqual(["L1"]);
    const [, ids] = dash.gmailApi.deleteFiltersInto.mock.calls[0] as [string, Set<string>];
    expect([...ids]).toEqual(["L1"]);
  });
});

describe("Settings — What Cluster learned", () => {
  it("lists each sort correction as a rule and Remove forgets just that one", async () => {
    const dash = await bootDashboard({ settings: { sortOverrides: { "deals@shop.example": "never", "news@paper.example": "newsletter" } } });
    dash.showScreen("settings");
    const host = dash.el("settings-learned");
    expect(host.closest(".set-sec")!.classList.contains("set-off")).toBe(false);
    const row = Array.from(host.querySelectorAll<HTMLElement>(".set-row")).find((r) => r.textContent?.startsWith("deals@shop.example → never sorted"))!;
    row.querySelector("button")!.click();
    await vi.waitFor(() => expect(dash.storedSettings().sortOverrides).toEqual({ "news@paper.example": "newsletter" }));
  });
});
