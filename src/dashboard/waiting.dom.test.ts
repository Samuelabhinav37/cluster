// @vitest-environment jsdom
/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

describe("Waiting for you (research ideas 2 and 6)", () => {
  it("shows an Ask me action on the Dashboard, and Not now drops it for good", async () => {
    const item = { kind: "mute", key: "gmail:deals@shop.example", address: "deals@shop.example", ids: ["m1"], at: Date.now() };
    const dash = await bootDashboard({ settings: { autoMute: "ask", waiting: [item] } as never });
    dash.showScreen("overview");
    const card = dash.el("overview-waiting");
    await vi.waitFor(() => expect(card.hidden).toBe(false));
    expect(card.textContent).toContain("deals@shop.example");
    const no = Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Not now")!;
    no.click();
    await vi.waitFor(() => expect(dash.storedSettings().waiting).toEqual([]));
    expect(dash.storedSettings().waitingDeclined).toContain("deals@shop.example");
    expect(card.hidden).toBe(true);
  });

  it("Settings lists what Cluster does on its own, and the mute tier saves", async () => {
    const dash = await bootDashboard();
    dash.showScreen("settings");
    const host = dash.el("settings-autonomy");
    expect(host.textContent).toContain("Always asks");
    const select = host.querySelector("select")!;
    select.value = "ask";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(dash.storedSettings().autoMute).toBe("ask"));
  });
});
