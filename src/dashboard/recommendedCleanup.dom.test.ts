// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// The recommended clean-up sheet (cleanupPlan.ts): clear-cut senders start
// ticked, the one button says exactly what it does and runs without a
// confirm step, each sender gets an Undo in Recent, and nothing is trashed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, fixtureMailbox } from "./testHarness";
import type { NormalizedMessageMetadata } from "../lib/providers/emailProvider";

const DAY = 86_400_000;

/** `n` unread newsletters from one sender, old enough to judge. */
function ignoredSender(address: string, n: number, now = Date.now()): NormalizedMessageMetadata[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${address}-${i}`,
    provider: "gmail" as const,
    fromAddress: address,
    fromDisplayName: address.split("@")[0],
    replyToAddress: "",
    subject: "This week's news",
    isProtected: false,
    unread: true,
    sizeBytes: 4096,
    unsubscribe: {},
    receivedAt: now - (20 + i * 3) * DAY,
    authenticationResults: undefined,
    labelIds: ["INBOX", "UNREAD", "CATEGORY_PROMOTIONS"],
    gmailPromotion: true,
    precedence: "bulk",
  }));
}

beforeEach(() => vi.restoreAllMocks());

describe("recommended clean-up sheet", () => {
  it("ticks the clear-cut sender, labels the button with what it does, and mutes without a confirm", async () => {
    const mailbox = [...fixtureMailbox(), ...ignoredSender("weekly@news.example", 12)];
    const dash = await bootDashboard({ mailbox });

    const section = dash.el("never-read-section");
    const ticks = Array.from(section.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-key]"));
    const tick = ticks.find((t) => t.dataset.key === "gmail:weekly@news.example");
    expect(tick, "no row for the ignored sender").toBeTruthy();
    expect(tick!.checked).toBe(true);

    const button = dash.el("never-read-mute-btn") as HTMLButtonElement;
    expect(button.textContent).toMatch(/^Mute 1 sender · starred and protected mail stays$/);

    button.click();
    await vi.waitFor(() => expect(dash.gmail.muteSender).toHaveBeenCalledTimes(1));
    expect((dash.gmail.muteSender as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe("weekly@news.example");
    expect(dash.gmail.trashMessages).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(dash.storedSettings().mutedSenders).toContain("weekly@news.example"));
    const log = dash.storedSettings().actionLog;
    expect(
      log.some(
        (e: { undo?: { via?: string; fromAddress?: string } }) =>
          e.undo?.via === "unmute" && e.undo.fromAddress === "weekly@news.example",
      ),
    ).toBe(true);
  });

  it("an unticked row isn't run, and an empty selection disables the button", async () => {
    const mailbox = [...fixtureMailbox(), ...ignoredSender("weekly@news.example", 12)];
    const dash = await bootDashboard({ mailbox });
    const section = dash.el("never-read-section");
    const tick = section.querySelector<HTMLInputElement>('input[data-key="gmail:weekly@news.example"]')!;
    tick.checked = false;
    tick.dispatchEvent(new Event("change"));
    const button = dash.el("never-read-mute-btn") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Tick a sender to clean up");
  });
});
