// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Action-flow tests for the Organize screen: decision-row primary actions,
// "Sort my inbox", and Smart Views. These push past the existing boot-smoke
// assertion (which only checks that Confirm/Cancel render for Mute) into
// actually completing the flow and asserting on the provider call.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Details — smart views", () => {
  it("archives the large message from the Large chip", async () => {
    const dash = await bootDashboard();
    const root = dash.el("details");
    root.querySelector<HTMLButtonElement>(".details-tab")!.click();
    const chip = Array.from(root.querySelectorAll<HTMLButtonElement>(".chips button")).find((b) =>
      b.textContent?.includes("Large"),
    );
    expect(chip, "no Large chip in Details").toBeTruthy();
    chip!.click();
    root.querySelector<HTMLInputElement>("tbody .tick:not(:disabled)")!.click();
    const bar = root.querySelector<HTMLElement>(".selbar")!;
    Array.from(bar.querySelectorAll("button"))
      .find((b) => b.textContent === "Archive")!
      .click();

    await vi.waitFor(() => expect(dash.gmail.archiveMessages).toHaveBeenCalledTimes(1));
    const [, ids] = (dash.gmail.archiveMessages as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ids).toEqual(["b1"]);
  });
});

describe("Organize screen — Sort my inbox", () => {
  it("sorts new mail from the New mail choice, labelling messages via the provider", async () => {
    const dash = await bootDashboard();
    dash.showScreen("organize");
    // Every label starts Off; turn them on so there is something to sort.
    for (const k of Array.from(document.querySelectorAll<HTMLSelectElement>("#time-limits-rows select"))) {
      k.value = "24";
      k.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Sort inbox opens on two choices; New mail starts straight away.
    (dash.el("sort-inbox-btn") as HTMLButtonElement).click();
    const choice = dash
      .el("sort-inbox-preview")
      .querySelector<HTMLButtonElement>('.sort-choice[data-mode="new"]');
    expect(choice, "no New mail choice").toBeTruthy();
    expect(dash.el("sort-inbox-preview").querySelector('.sort-choice[data-mode="all"]')).toBeTruthy();
    choice!.click();

    await vi.waitFor(() => {
      if (dash.gmail.labelMessages === undefined) throw new Error("no labelMessages spy");
      if ((dash.gmail.labelMessages as ReturnType<typeof vi.fn>).mock.calls.length === 0) {
        throw new Error("labelMessages not called yet");
      }
    });
    expect(dash.gmail.labelMessages).toHaveBeenCalled();
    // The scan-style report replaces the plan: the total, then a ticked row per label.
    await vi.waitFor(() => {
      const big = dash.el("sort-inbox-preview").querySelector(".sort-report .sort-big");
      if (!big?.textContent?.endsWith("sorted")) throw new Error("report not shown yet");
    });
    expect(dash.el("sort-inbox-preview").querySelectorAll(".sort-report-row.done").length).toBeGreaterThan(0);
  });

  it("Everything ends by saying it's all sorted, with no per-label list", async () => {
    const dash = await bootDashboard();
    dash.showScreen("organize");
    for (const k of Array.from(document.querySelectorAll<HTMLSelectElement>("#time-limits-rows select"))) {
      k.value = "24";
      k.dispatchEvent(new Event("change", { bubbles: true }));
    }
    (dash.el("sort-inbox-btn") as HTMLButtonElement).click();
    dash.el("sort-inbox-preview").querySelector<HTMLButtonElement>('.sort-choice[data-mode="all"]')!.click();
    await vi.waitFor(() => {
      const big = dash.el("sort-inbox-preview").querySelector(".sort-big");
      if (big?.textContent !== "Everything is sorted") throw new Error("not done yet");
    });
    expect(dash.el("sort-inbox-preview").querySelector(".sort-check")).toBeTruthy();
    expect(dash.el("sort-inbox-preview").querySelectorAll(".sort-report-row").length).toBe(0);
  });
});
