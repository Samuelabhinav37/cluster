// @vitest-environment jsdom
/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

describe("Not now on a warning (research idea 9)", () => {
  it("hides the sender's warning for a week and remembers it", async () => {
    const dash = await bootDashboard();
    dash.showScreen("impersonation");
    const card = await vi.waitFor(() => {
      const c = document.querySelector<HTMLElement>("tbody.is-scam");
      if (!c) throw new Error("no warning row");
      return c;
    });
    const later = Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Not now")!;
    later.click();
    await vi.waitFor(() => expect(Object.keys(dash.storedSettings().warnSnoozed)).toHaveLength(1));
    const until = Object.values(dash.storedSettings().warnSnoozed)[0] as number;
    expect(until - Date.now()).toBeGreaterThan(6 * 86_400_000);
  });
});
