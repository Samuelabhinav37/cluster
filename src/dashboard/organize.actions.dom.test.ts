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
    Array.from(bar.querySelectorAll("button")).find((b) => b.textContent === "Archive")!.click();

    await vi.waitFor(() => expect(dash.gmail.archiveMessages).toHaveBeenCalledTimes(1));
    const [, ids] = (dash.gmail.archiveMessages as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ids).toEqual(["b1"]);
  });
});

describe("Organize screen — Sort my inbox", () => {
  it("previews then applies a sort plan, labelling messages via the provider", async () => {
    const dash = await bootDashboard();
    dash.showScreen("organize");
    // Every label starts Off; turn them on so there is something to sort.
    for (const k of Array.from(document.querySelectorAll<HTMLSelectElement>("#time-limits-rows select"))) {
      k.value = "24";
      k.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const startBtn = dash.el("sort-inbox-btn") as HTMLButtonElement;
    startBtn.click();

    // startSortFlow() awaits listLabelNames() before building the preview.
    await vi.waitFor(() => {
      if (dash.el("sort-inbox-preview").querySelectorAll(".sort-preview-bucket").length === 0) {
        throw new Error("preview not rendered yet");
      }
    });

    const applyBtn = Array.from(
      dash.el("sort-inbox-preview").querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent?.startsWith("Sort "))!;
    expect(applyBtn.disabled).toBe(false);
    applyBtn.click();

    await vi.waitFor(() => {
      if (dash.gmail.labelMessages === undefined) throw new Error("no labelMessages spy");
      if ((dash.gmail.labelMessages as ReturnType<typeof vi.fn>).mock.calls.length === 0) {
        throw new Error("labelMessages not called yet");
      }
    });
    expect(dash.gmail.labelMessages).toHaveBeenCalled();

    // Not covered here (scoped down — see plan P2.5 item 4 for the eventual
    // listRow rebuild of this screen): label-name collision resolution, the
    // per-sender "wrong bucket?" override menu, and the seed-from-existing
    // card. Each is a materially separate flow from the base apply path
    // asserted above.
  });
});
