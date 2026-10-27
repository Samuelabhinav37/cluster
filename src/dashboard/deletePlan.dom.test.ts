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
  it("the past-date card's Trash opens its confirm inside the visible card", async () => {
    // The default fixture has a one-time code aged past its 2-day expiry.
    const dash = await bootDashboard();
    dash.showScreen("delete");
    const card = dash.el("past-date-card");
    expect(card.hidden).toBe(false);

    card.querySelector<HTMLButtonElement>("button")!.click();
    await vi.waitFor(() => {
      const confirm = Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Confirm");
      if (!confirm) throw new Error("no visible confirm yet");
      expect(confirm.closest("[hidden]")).toBeNull();
    });
  });
});
