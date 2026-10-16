// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Phase 2 — Security tab: "Label as suspicious" and the auto-quarantine toggle.
import { describe, expect, it, vi } from "vitest";
import { bootDashboard, confirmStep } from "./testHarness";

describe("Label as suspicious", () => {
  it("files the sender's mail under Possible Phishing and logs it", async () => {
    const dash = await bootDashboard();
    dash.showTab("security");

    const li = Array.from(dash.el("security-sender-list").querySelectorAll("li")).find((n) =>
      n.textContent?.toLowerCase().includes("paypal"),
    );
    expect(li, "no flagged sender row for the brand-claim fixture").toBeTruthy();

    const btn = Array.from(li!.querySelectorAll("button")).find(
      (b) => b.textContent === "Label as suspicious",
    )!;
    const slot = btn.closest("span")!; // renderConfirmStep replaces the slot's contents
    btn.click();
    await confirmStep(slot);

    expect(dash.gmail.labelSuspicious).toHaveBeenCalledTimes(1);
    const [, ids] = (dash.gmail.labelSuspicious as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((ids as string[]).length).toBeGreaterThan(0);

    dash.showTab("recent");
    expect(dash.el("recent-list").textContent).toMatch(/suspicious/i);
  });
});

describe("Auto-quarantine toggle", () => {
  it("is off by default, persists when turned on, and comes back on after a reboot", async () => {
    const dash = await bootDashboard();
    const toggle = dash.el("auto-quarantine-toggle") as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(dash.storedSettings().autoQuarantineHighRisk).toBe(true));

    const rebooted = await bootDashboard({ settings: { autoQuarantineHighRisk: true } });
    expect((rebooted.el("auto-quarantine-toggle") as HTMLInputElement).checked).toBe(true);
  });
});
