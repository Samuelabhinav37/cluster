// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// First-run connect gate: no silent token → explainer + Connect button, and
// Google's prompt only opens on that click. Covers the cancelled-prompt path
// that used to end in "Something went wrong (unknown error)".
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, fixtureMailbox, makeGmailSpy } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

/** A Gmail spy with no cached grant: silent calls fail until an interactive
 * call succeeds (as Chrome caches the token after consent), and the
 * interactive call does whatever `interactive` says. */
function notYetConnected(interactive: () => Promise<string>) {
  let granted: string | null = null;
  return makeGmailSpy(fixtureMailbox(), {
    getAuthToken: vi.fn(async (isInteractive: boolean) => {
      if (granted) return granted;
      if (!isInteractive) throw new Error("OAuth2 not granted or revoked.");
      granted = await interactive();
      return granted;
    }),
  });
}

const gateVisible = () => !document.getElementById("connect-gate")!.hidden;

describe("connect gate", () => {
  it("an already-connected user never sees the gate or an interactive prompt", async () => {
    const dash = await bootDashboard();
    expect(gateVisible()).toBe(false);
    expect(document.body.dataset.state).toBeUndefined();
    expect(dash.gmail.getAuthToken).toHaveBeenCalledWith(false);
    expect(dash.gmail.getAuthToken).not.toHaveBeenCalledWith(true);
  });

  it("first run shows the gate and does not scan or prompt until Connect is pressed", async () => {
    const gmail = notYetConnected(async () => "fresh-token");
    const dash = await bootDashboard({ gmail, tolerateScanError: true });

    expect(gateVisible()).toBe(true);
    expect(document.body.dataset.state).toBe("connect");
    expect(dash.el("connect-title").textContent).toBe("Connect Gmail to get started");
    expect(gmail.getAuthToken).not.toHaveBeenCalledWith(true);
    expect(gmail.listCandidateMessages).not.toHaveBeenCalled();

    (dash.el("connect-gmail-btn") as HTMLButtonElement).click();

    await vi.waitFor(() => expect(gmail.listCandidateMessages).toHaveBeenCalled(), { timeout: 3000 });
    expect(gmail.getAuthToken).toHaveBeenCalledWith(true);
    expect(gateVisible()).toBe(false);
    expect(document.body.dataset.state).toBeUndefined();
    // The gate replaced the trust banner, so it's marked as seen.
    await vi.waitFor(() => expect(dash.storedSettings().onboardingDismissed).toBe(true));
    expect(dash.el("onboarding-banner").hidden).toBe(true);
  });

  it("a cancelled Google prompt keeps the gate up with a plain explanation, and retry works", async () => {
    let attempt = 0;
    const gmail = notYetConnected(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("The user did not approve access.");
      return "fresh-token";
    });
    const dash = await bootDashboard({ gmail, tolerateScanError: true });
    const btn = dash.el("connect-gmail-btn") as HTMLButtonElement;

    btn.click();
    await vi.waitFor(() => expect(dash.el("connect-error").textContent).toMatch(/cancelled/));
    expect(gateVisible()).toBe(true);
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe("Connect Gmail");
    expect(dash.status()).not.toMatch(/Something went wrong/);
    expect(gmail.listCandidateMessages).not.toHaveBeenCalled();

    btn.click();
    await vi.waitFor(() => expect(gmail.listCandidateMessages).toHaveBeenCalled(), { timeout: 3000 });
    expect(gateVisible()).toBe(false);
    expect(dash.el("connect-error").textContent).toBe("");
  });

  it("a real connect failure shows its message rather than 'cancelled'", async () => {
    const gmail = notYetConnected(async () => {
      throw new Error("Authorization page could not be loaded.");
    });
    const dash = await bootDashboard({ gmail, tolerateScanError: true });
    (dash.el("connect-gmail-btn") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(dash.el("connect-error").textContent).toContain("Authorization page could not be loaded."),
    );
    expect(dash.el("connect-error").textContent).not.toMatch(/cancelled/);
  });

  it("someone who has scanned before gets 'Reconnect' copy, not the first-run welcome", async () => {
    const gmail = notYetConnected(async () => "fresh-token");
    const dash = await bootDashboard({
      gmail,
      tolerateScanError: true,
      settings: { healthHistory: [{ week: "2026-W39", score: 60 }] },
    });
    expect(gateVisible()).toBe(true);
    expect(dash.el("connect-title").textContent).toBe("Reconnect Gmail");
    expect(dash.el("connect-lead").textContent).toMatch(/expired/);
  });
});
