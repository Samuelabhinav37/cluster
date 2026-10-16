// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Phase 2 — Screener tab: turning it on holds unknown senders; the held queue's
// Allow / Block release them.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, type BootedDashboard } from "./testHarness";

let dash: BootedDashboard;

async function turnScreenerOn(dash: BootedDashboard) {
  dash.showTab("screener");
  const toggle = dash.el("screener-toggle") as HTMLInputElement;
  toggle.checked = true;
  toggle.dispatchEvent(new Event("change"));
  await vi.waitFor(() =>
    expect((dash.gmail.screenSender as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0),
  );
}

beforeEach(async () => {
  dash = await bootDashboard();
});

describe("turning the Screener on", () => {
  it("holds every unknown, unstarred sender and persists the state", async () => {
    await turnScreenerOn(dash);

    expect(dash.storedSettings().screenerEnabled).toBe(true);
    expect(dash.storedSettings().screenedSenders.length).toBeGreaterThan(0);
    // family@personal.example has starred mail — never screened.
    expect(dash.storedSettings().screenedSenders).not.toContain("family@personal.example");
  });
});

describe("releasing a held sender", () => {
  it("Allow lets the sender through and adds it to the allowlist", async () => {
    await turnScreenerOn(dash);
    dash.showTab("screener");

    const allow = Array.from(dash.el("screener-queue").querySelectorAll("button")).find(
      (b) => b.textContent === "Allow",
    );
    expect(allow, "no Allow button in the held queue").toBeTruthy();
    const row = allow!.closest("tr")!;
    const address = row.textContent!.match(/[\w.+-]+@[\w.-]+/)![0];

    allow!.click();
    await vi.waitFor(() =>
      expect((dash.gmail.allowSenderThrough as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1),
    );
    expect(dash.storedSettings().screenerAllowlist).toContain(address);
    expect(dash.storedSettings().screenedSenders).not.toContain(address);
  });

  it("Block routes the sender into Mute", async () => {
    await turnScreenerOn(dash);
    dash.showTab("screener");

    const block = Array.from(dash.el("screener-queue").querySelectorAll("button")).find(
      (b) => b.textContent === "Block",
    )!;
    const address = block.closest("tr")!.textContent!.match(/[\w.+-]+@[\w.-]+/)![0];

    block.click();
    await vi.waitFor(() =>
      expect((dash.gmail.muteSender as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1),
    );
    expect(dash.storedSettings().mutedSenders).toContain(address);
  });
});
