// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Phase 3 — error, offline, and edge rendering. Boots clean, then drives a
// rescan (or a window event) into each failure path.
import { describe, expect, it, vi } from "vitest";
import { bootDashboard, makeGmailSpy, makeOutlookSpy } from "./testHarness";

const rescan = () => document.getElementById("apply-scan-settings-btn")!.dispatchEvent(
  new MouseEvent("click", { bubbles: true }),
);

describe("Gmail quota 403", () => {
  it("shows a rate-limit message and a Rescan button", async () => {
    const dash = await bootDashboard();
    const { GmailApiError } = await import("../lib/gmailApi");

    (dash.gmail.getMessageMetadata as ReturnType<typeof vi.fn>).mockRejectedValue(
      new GmailApiError(403, "Gmail API /users/me/messages/x failed: 403 rateLimitExceeded"),
    );
    rescan();

    await vi.waitFor(() => {
      const status = dash.el("status");
      expect(status.hidden).toBe(false);
      expect(status.textContent).toMatch(/rate-limit/i);
    });
    expect(dash.button("status", "Rescan")).toBeTruthy();
  });
});

describe("Outlook re-auth required", () => {
  it("offers a Reconnect Outlook button, not the generic error", async () => {
    const outlook = makeOutlookSpy({ isConnected: vi.fn(async () => true) });
    const dash = await bootDashboard({ outlook });
    const { OutlookReauthRequired } = await import("../lib/providers/msalAuth");

    (outlook.getMessageMetadata as ReturnType<typeof vi.fn>).mockRejectedValue(
      new OutlookReauthRequired("refresh token dead"),
    );
    (outlook.listCandidateMessages as ReturnType<typeof vi.fn>).mockRejectedValue(
      new OutlookReauthRequired("refresh token dead"),
    );
    rescan();

    await vi.waitFor(() => {
      expect(dash.el("status").textContent).toMatch(/Outlook sign-in expired/i);
    });
    expect(dash.button("status", "Reconnect Outlook")).toBeTruthy();
  });
});

describe("offline / online", () => {
  it("disables bulk actions offline and re-enables them online", async () => {
    const dash = await bootDashboard();

    const rescanBtn = dash.el("apply-scan-settings-btn") as HTMLButtonElement;

    window.dispatchEvent(new Event("offline"));
    expect(dash.el("status").hidden).toBe(false);
    expect(dash.el("status").textContent).toMatch(/offline/i);
    expect(rescanBtn.disabled).toBe(true);
    expect((dash.el("bulk-keep-sorted-btn") as HTMLButtonElement).disabled).toBe(true);

    window.dispatchEvent(new Event("online"));
    expect(dash.el("status").hidden).toBe(true);
    // Not selection-gated, so it comes back enabled (the bulk buttons stay
    // disabled until something is selected — that's updateSenderBulkBar, not
    // the offline state).
    expect(rescanBtn.disabled).toBe(false);
  });
});

describe("main() failure", () => {
  it("renders an inline Reload button, not a bare error string", async () => {
    const gmail = makeGmailSpy(undefined, {
      // main() calls getAuthToken(true) once, up front.
      getAuthToken: vi.fn(async (interactive?: boolean) => {
        if (interactive) throw new Error("sign-in cancelled");
        return "token";
      }),
    });
    const dash = await bootDashboard({ gmail, tolerateScanError: true });

    await vi.waitFor(() => {
      expect(dash.el("status").textContent).toMatch(/Something went wrong/i);
    });
    expect(dash.button("status", "Reload")).toBeTruthy();
  });
});
