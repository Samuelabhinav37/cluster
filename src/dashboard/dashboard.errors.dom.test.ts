// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Error-path tests: P1.2's per-screen render isolation (safeRender), the
// generic scan-failure retry UI, and the offline/online window listeners.
// These lock in behavior from the 2026-09-06 audit-remediation branch that
// has no other automated coverage — the redesign's boot smoke test only
// exercises the happy path.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("safeRender per-screen isolation (P1.2)", () => {
  it("a throw in one screen's render doesn't blank the others or trip the global scan error", async () => {
    vi.doMock("./subscriptionsTab", async () => {
      const actual = await vi.importActual<typeof import("./subscriptionsTab")>("./subscriptionsTab");
      return {
        ...actual,
        renderSubscriptionsTab: () => {
          throw new Error("boom-subscriptions");
        },
      };
    });

    const dash = await bootDashboard();

    // The scan itself succeeded — #status hid normally, not the scan-error UI.
    // (Its text is left over from the last "Scanning… N/N messages" progress
    // update rather than cleared, so only `hidden` distinguishes success from
    // showScanError's visible retry UI.)
    expect(dash.el("status").hidden).toBe(true);

    // Overview and Recently-done, rendered by unrelated safeRender calls,
    // are unaffected.
    expect(dash.el("overview-headline").textContent).toMatch(/Scanned \d+ sender/);
    expect(dash.el("recent-list").textContent).toContain("Nothing done yet");

    // The subscriptions screen itself gets the inline failure note instead
    // of silently staying empty.
    dash.showScreen("subscriptions");
    const note = document.querySelector('section.screen[data-screen="subscriptions"] .screen-error');
    expect(note, "no .screen-error note rendered for the failed screen").toBeTruthy();
    expect(note!.textContent).toMatch(/didn't load/i);
  });
});

describe("scan failure", () => {
  it("shows the generic retry UI when the scan itself throws", async () => {
    const gmail = (await import("./testHarness")).makeGmailSpy(undefined, {
      listCandidateMessages: vi.fn(async () => {
        throw new Error("network exploded");
      }),
    });
    const dash = await bootDashboard({ gmail, tolerateScanError: true });

    await vi.waitFor(() => {
      if (dash.el("status").hidden) throw new Error("status still hidden");
    });
    expect(dash.status()).toContain("Couldn't load your mail");
    expect(dash.status()).toContain("network exploded");
    const retryBtn = Array.from(dash.el("status").querySelectorAll("button")).find(
      (b) => b.textContent === "Retry",
    );
    expect(retryBtn, "no Retry button rendered").toBeTruthy();
  });
});

describe("offline handling", () => {
  it("shows the offline status and disables bulk actions, then restores them online", async () => {
    const dash = await bootDashboard();
    expect(dash.el("status").hidden).toBe(true);

    window.dispatchEvent(new Event("offline"));
    expect(dash.el("status").hidden).toBe(false);
    expect(dash.status()).toContain("You're offline");
    expect((dash.el("bulk-delete-domains-btn") as HTMLButtonElement).disabled).toBe(true);
    expect((dash.el("expiry-cleanup-btn") as HTMLButtonElement).disabled).toBe(true);
    expect((dash.el("fast-delete-toggle") as HTMLInputElement).disabled).toBe(true);

    window.dispatchEvent(new Event("online"));
    expect(dash.el("status").hidden).toBe(true);
    // fast-delete-toggle isn't re-derived from any selection state afterward
    // (unlike bulk-delete-domains-btn, which updateDomainBulkBar() immediately
    // re-disables since nothing is selected) — a clean signal that "online"
    // actually re-enabled actions rather than leaving them stuck.
    expect((dash.el("fast-delete-toggle") as HTMLInputElement).disabled).toBe(false);
  });
});
