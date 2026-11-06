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

describe("Clean up — KPIs pick what the table shows", () => {
  const rowNames = () => Array.from(document.querySelectorAll("#cu-senders-table tbody .ct-reason")).map((p) => p.textContent);

  it("Expired filters the table; ticked rows go to Trash after Confirm", async () => {
    const dash = await bootDashboard();
    dash.showScreen("delete");
    dash.el("past-date-card").click();
    expect(dash.el("past-date-card").classList.contains("selected")).toBe(true);
    expect(rowNames().length).toBeGreaterThan(0);
    expect(new Set(rowNames())).toEqual(new Set(["Expired"]));
    expect(dash.el("cu-chart").querySelector(".pl-chart")).not.toBeNull();

    document.querySelector<HTMLInputElement>("#cu-senders-table tbody input")!.click();
    const slot = document.querySelector<HTMLElement>("#cu-senders-table .ct-sel-slot")!;
    Array.from(slot.querySelectorAll("button")).find((b) => b.textContent === "Trash")!.click();
    await vi.waitFor(() => {
      const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>("#cu-senders-table button")).find((b) => b.textContent === "Confirm");
      if (!confirm) throw new Error("no visible confirm yet");
      expect(confirm.closest("[hidden]")).toBeNull();
      confirm.click();
    });
    await vi.waitFor(() => expect(dash.gmail.trashMessages).toHaveBeenCalled());
    const calledIds = (dash.gmail.trashMessages as ReturnType<typeof vi.fn>).mock.calls.flatMap(([, ids]) => ids as string[]);
    expect(calledIds).toContain("o1");
  });

  it("clicking the picked KPI again shows every sender", async () => {
    const dash = await bootDashboard();
    dash.showScreen("delete");
    const all = rowNames().length;
    dash.el("past-date-card").click();
    dash.el("past-date-card").click();
    expect(dash.el("past-date-card").classList.contains("selected")).toBe(false);
    expect(rowNames().length).toBe(all);
  });
});
