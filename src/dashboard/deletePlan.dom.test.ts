// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Regression (R0 B11): the Delete screen's plan buttons start a confirm that
// renders inside a review section. Those sections start hidden, so the
// confirm used to appear where nobody could see it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Delete screen plan", () => {
  it("shows the section holding the confirm when a plan button is pressed", async () => {
    // The default fixture has a one-time code aged past its 2-day expiry.
    const dash = await bootDashboard();
    dash.showScreen("delete");
    const section = dash.el("expiry-section");
    expect(section.hidden).toBe(true);

    const trash = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent?.trim() === "Trash" && !b.closest("[hidden]"),
    );
    expect(trash, "plan row Trash button").toBeDefined();
    trash!.click();

    expect(section.hidden).toBe(false);
    await vi.waitFor(() => {
      const confirm = Array.from(section.querySelectorAll("button")).find((b) => b.textContent === "Confirm");
      if (!confirm) throw new Error("no visible confirm yet");
      expect(confirm.closest("[hidden]")).toBeNull();
    });
  });
});
