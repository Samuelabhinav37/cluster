// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Action-flow tests for the Phishing screen (DOM data-screen="impersonation",
// UI-titled "Phishing"): "Block sender" (labelSuspicious), the auto-quarantine
// toggle, and the quarantine review queue's Confirm/Release.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, confirmStep } from "./testHarness";

function findThreatCard(container: HTMLElement, needle: string): HTMLElement {
  const card = Array.from(container.querySelectorAll("li.glass-card")).find((li) =>
    li.textContent?.includes(needle),
  );
  if (!card) throw new Error(`no threat card containing "${needle}"`);
  return card as HTMLElement;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Phishing screen — flagged senders", () => {
  it("flags the free-mail brand-claim sender and labels it suspicious on Block sender", async () => {
    const dash = await bootDashboard();
    dash.showScreen("impersonation");

    const card = findThreatCard(dash.el("security-sender-list"), "paypal-help@gmail.com");
    const blockBtn = Array.from(card.querySelectorAll("button")).find(
      (b) => b.textContent === "Block sender",
    )!;
    const slot = blockBtn.closest(".confirm-slot") as HTMLElement;
    blockBtn.click();
    const resultText = await confirmStep(slot);

    expect(resultText).toContain("Labeled");
    expect(dash.gmail.labelSuspicious).toHaveBeenCalledTimes(1);
    const [, ids] = (dash.gmail.labelSuspicious as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ids).toEqual(["x1"]);

    dash.showScreen("recent");
    expect(dash.el("recent-list").textContent).toContain("paypal-help@gmail.com");
  });
});

describe("Phishing screen — auto-quarantine toggle", () => {
  it("persists the toggle to settings", async () => {
    const dash = await bootDashboard();
    dash.showScreen("impersonation");

    const toggle = dash.el("auto-quarantine-toggle") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    toggle.click();
    toggle.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      expect(dash.storedSettings().autoQuarantineHighRisk).toBe(true);
    });
  });
});

describe("Phishing screen — quarantine review", () => {
  it("shows a pending quarantined sender and Confirm keeps it filed", async () => {
    const dash = await bootDashboard({
      settings: {
        quarantinedSenders: {
          "gmail:spammy@bad.example": { at: Date.now(), messageIds: ["q1"] },
        },
      },
    });
    dash.showScreen("impersonation");

    expect(dash.el("quarantine-review-section").hidden).toBe(false);
    const list = dash.el("quarantine-review-list");
    expect(list.textContent).toContain("spammy@bad.example");

    const confirmBtn = Array.from(list.querySelectorAll("button")).find(
      (b) => b.textContent === "Confirm — keep filed",
    )!;
    confirmBtn.click();

    await vi.waitFor(() => {
      if ("gmail:spammy@bad.example" in dash.storedSettings().quarantinedSenders) {
        throw new Error("entry not removed yet");
      }
    });
    expect(dash.storedSettings().quarantineReview?.["gmail:spammy@bad.example"]).toMatchObject({
      verdict: "confirmed",
    });
    expect(dash.el("quarantine-review-section").hidden).toBe(true);
  });

  it("Release calls unlabelSuspicious and drops the entry", async () => {
    const dash = await bootDashboard({
      settings: {
        quarantinedSenders: {
          "gmail:spammy@bad.example": { at: Date.now(), messageIds: ["q1"] },
        },
      },
    });
    dash.showScreen("impersonation");

    const list = dash.el("quarantine-review-list");
    const releaseBtn = Array.from(list.querySelectorAll("button")).find(
      (b) => b.textContent === "Release — false positive",
    )!;
    releaseBtn.click();

    await vi.waitFor(() => {
      if ((dash.gmail.unlabelSuspicious as ReturnType<typeof vi.fn>).mock.calls.length === 0) {
        throw new Error("unlabelSuspicious not called yet");
      }
    });
    const [, ids] = (dash.gmail.unlabelSuspicious as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ids).toEqual(["q1"]);

    await vi.waitFor(() => {
      expect(dash.storedSettings().quarantineReview?.["gmail:spammy@bad.example"]).toMatchObject({
        verdict: "released",
      });
    });
  });
});

describe("Phishing screen — sender-controlled text", () => {
  // Audit finding (security): securityTab.ts builds the "Claims to be" /
  // "Actually sent from" panels with innerHTML, interpolating the sender's
  // display name and address. CSP blocks script, but markup still lands: a
  // remote <img> is a tracking pixel (breaking the no-egress promise) and
  // fake links/buttons can be drawn onto the screen meant to protect the
  // user. A crafted From like `PayPal <a@b.c><img src=https://evil.example/p.gif>`
  // reaches this code as exactly the address used below (see the From parser
  // in gmailProvider.ts). Both panels are reachable through the address
  // alone: "Actually sent from" shows it, and "Claims to be" shows the first
  // signal's `brand`, which for a failed-DMARC signal is the sender's own
  // domain (everything after the last "@").
  const hostileAddress = 'support@paypa1-help.example><img src="https://evil.example/p.gif" data-injected="1"';

  async function bootWithHostileSender(displayName: string, fromAddress: string) {
    const { fixtureMailbox } = await import("./testHarness");
    const mailbox = [
      ...fixtureMailbox(),
      {
        ...fixtureMailbox()[0],
        id: "h1",
        fromAddress,
        fromDisplayName: displayName,
        subject: "Your account has been suspended",
        unsubscribe: {},
        authenticationResults: "mx.google.com; spf=fail; dkim=fail; dmarc=fail header.from=paypa1-help.example",
      },
    ];
    const dash = await bootDashboard({ mailbox });
    dash.showScreen("impersonation");
    return dash;
  }

  it.fails("KNOWN BUG: a hostile sender address injects markup into the Phishing screen", async () => {
    const dash = await bootWithHostileSender("PayPal Security", hostileAddress);
    const list = dash.el("security-sender-list");
    expect(list.querySelector("[data-injected]")).toBeNull();
    expect(list.querySelector('img[src^="https://evil.example"]')).toBeNull();
  });

});
