// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Action-flow tests for the Screener: turning it on holds every
// never-corresponded-with sender, then Allow/Block release each one.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

function findScreenerCard(container: HTMLElement, address: string): HTMLElement {
  const card = Array.from(container.querySelectorAll(".glass-card")).find((c) =>
    c.textContent?.includes(address),
  );
  if (!card) throw new Error(`no screener card for "${address}"`);
  return card as HTMLElement;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Screener", () => {
  it("holds every sender the user hasn't corresponded with once turned on", async () => {
    // The default spy's listSentCorrespondents resolves [], so every fixture
    // sender is "unknown" except the already-starred family@personal.example
    // (pendingScreenerSenders excludes anyone with a protected message).
    const dash = await bootDashboard();
    dash.showScreen("screener");

    const toggle = dash.el("screener-toggle") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    toggle.click();
    toggle.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      if (dash.gmail.screenSender === undefined) throw new Error("no screenSender spy");
      if ((dash.gmail.screenSender as ReturnType<typeof vi.fn>).mock.calls.length === 0) {
        throw new Error("screenPending hasn't held anyone yet");
      }
    });

    const heldAddresses = (dash.gmail.screenSender as ReturnType<typeof vi.fn>).mock.calls.map(
      ([, address]) => address,
    );
    expect(new Set(heldAddresses)).toEqual(
      new Set([
        "deals@shop.example",
        "statements@chase.com",
        "code@auth.example",
        "reports@bigmail.example",
        "paypal-help@gmail.com",
      ]),
    );
    expect(heldAddresses).not.toContain("family@personal.example");

    await vi.waitFor(() => {
      expect(dash.storedSettings().screenedSenders).toEqual(expect.arrayContaining(heldAddresses));
    });
  });

  it("Let through allows a held sender and drops them from the queue", async () => {
    const dash = await bootDashboard();
    dash.showScreen("screener");
    const toggle = dash.el("screener-toggle") as HTMLInputElement;
    toggle.click();
    toggle.dispatchEvent(new Event("change"));
    await vi.waitFor(() => {
      if ((dash.gmail.screenSender as ReturnType<typeof vi.fn>).mock.calls.length === 0) {
        throw new Error("not held yet");
      }
    });

    const card = findScreenerCard(dash.el("screener-queue"), "statements@chase.com");
    const allowBtn = Array.from(card.querySelectorAll("button")).find(
      (b) => b.textContent === "Let through",
    )!;
    allowBtn.click();

    await vi.waitFor(() => {
      if ((dash.gmail.allowSenderThrough as ReturnType<typeof vi.fn>).mock.calls.length === 0) {
        throw new Error("allowSenderThrough not called yet");
      }
    });
    const [, address] = (dash.gmail.allowSenderThrough as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(address).toBe("statements@chase.com");

    await vi.waitFor(() => {
      expect(dash.storedSettings().screenerAllowlist).toContain("statements@chase.com");
      expect(dash.storedSettings().screenedSenders).not.toContain("statements@chase.com");
    });

    dash.showScreen("recent");
    expect(dash.el("recent-list").textContent).toContain("Allowed statements@chase.com");
  });

  it("Block mutes a held sender instead of calling screenSender again", async () => {
    // releaseHeldSender's "block" branch calls muteSender, not screenSender —
    // blocking is the existing Mute primitive, not a second screener state.
    const dash = await bootDashboard();
    dash.showScreen("screener");
    const toggle = dash.el("screener-toggle") as HTMLInputElement;
    toggle.click();
    toggle.dispatchEvent(new Event("change"));
    await vi.waitFor(() => {
      if ((dash.gmail.screenSender as ReturnType<typeof vi.fn>).mock.calls.length === 0) {
        throw new Error("not held yet");
      }
    });

    const card = findScreenerCard(dash.el("screener-queue"), "code@auth.example");
    const blockBtn = Array.from(card.querySelectorAll("button")).find(
      (b) => b.textContent === "Block",
    )!;
    blockBtn.click();

    await vi.waitFor(() => {
      if ((dash.gmail.muteSender as ReturnType<typeof vi.fn>).mock.calls.length === 0) {
        throw new Error("muteSender not called yet");
      }
    });
    const [, address] = (dash.gmail.muteSender as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(address).toBe("code@auth.example");

    await vi.waitFor(() => {
      expect(dash.storedSettings().mutedSenders).toContain("code@auth.example");
      expect(dash.storedSettings().screenedSenders).not.toContain("code@auth.example");
    });
  });
});
