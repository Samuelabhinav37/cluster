// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Regression (R0 B11): a Clean up action's confirm must render where it can
// be seen, not inside a collapsed review section.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Clean up cards", () => {
  it("the Expired card opens its page, where Trash asks first in plain view", async () => {
    // The default fixture has a one-time code aged past its 2-day expiry.
    const dash = await bootDashboard();
    dash.showScreen("delete");
    const card = dash.el("past-date-card");
    expect(card.hidden).toBe(false);

    card.click();
    const page = dash.el("cu-page");
    expect(page.hidden).toBe(false);
    Array.from(page.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.startsWith("Trash"))!.click();
    await vi.waitFor(() => {
      const confirm = Array.from(page.querySelectorAll("button")).find((b) => b.textContent === "Confirm");
      if (!confirm) throw new Error("no visible confirm yet");
      expect(confirm.closest("[hidden]")).toBeNull();
    });
  });
});
