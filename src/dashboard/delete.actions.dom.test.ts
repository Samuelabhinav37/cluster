// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Action-flow tests for Clean up: they drive the real confirm click-through
// and assert on the provider call args.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, confirmStep } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Delete screen — ready-to-clean-up (expiry)", () => {
  it("cleans up the aged OTP and reports the count", async () => {
    const dash = await bootDashboard();
    dash.showScreen("delete");

    const cleanBtn = dash.el("expiry-cleanup-btn") as HTMLButtonElement;
    expect(cleanBtn.hidden).toBe(false);
    cleanBtn.click();
    const resultText = await confirmStep(dash.el("expiry-cleanup-slot"));

    expect(resultText).toMatch(/Moved 1 to Trash/);
    expect(dash.gmail.trashMessages).toHaveBeenCalled();
    const calledIds = (dash.gmail.trashMessages as ReturnType<typeof vi.fn>).mock.calls.flatMap(
      ([, ids]) => ids as string[],
    );
    expect(calledIds).toContain("o1");
  });
});

describe("Clean up — a card's own page", () => {
  it("opens from the card, lists each company, sends a row to Details, and trashes what's ticked", async () => {
    const dash = await bootDashboard();
    dash.showScreen("delete");
    const card = dash.el("past-date-card");
    expect(card.hidden).toBe(false);
    card.click();

    const page = dash.el("cu-page");
    expect(page.hidden).toBe(false);
    expect(page.querySelector(".cu-page-title")?.textContent).toBe("Old codes and news");
    const rows = page.querySelectorAll(".list-row");
    expect(rows.length).toBeGreaterThan(0);

    (rows[0] as HTMLElement).click();
    expect(dash.el("details").classList.contains("min")).toBe(false);

    const slot = page.querySelector<HTMLElement>(".cu-sel-slot")!;
    slot.querySelector("button")!.click();
    const resultText = await confirmStep(slot);
    expect(resultText).toMatch(/to Trash/);
    const calledIds = (dash.gmail.trashMessages as ReturnType<typeof vi.fn>).mock.calls.flatMap(
      ([, ids]) => ids as string[],
    );
    expect(calledIds).toContain("o1");
  });

  it("goes back to the cards", async () => {
    const dash = await bootDashboard();
    dash.showScreen("delete");
    dash.el("past-date-card").click();
    dash.el("cu-page").querySelector<HTMLButtonElement>(".cu-back")!.click();
    expect(dash.el("cu-page").hidden).toBe(true);
    expect(document.querySelector<HTMLElement>(".cu-cards")!.hidden).toBe(false);
  });
});
