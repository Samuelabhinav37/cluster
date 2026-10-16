// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Phase 2 — "Sort my inbox": the non-destructive preview tree, per-message
// ticks, per-sender override, Apply, and "keep sorting new mail".
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, type BootedDashboard } from "./testHarness";

let dash: BootedDashboard;

async function openPreview(dash: BootedDashboard) {
  dash.showTab("cleanup");
  dash.el("sort-inbox-btn").click();
  await vi.waitFor(() =>
    expect(dash.el("sort-inbox-preview").querySelectorAll("details.sort-preview-bucket").length)
      .toBeGreaterThan(0),
  );
}

function applyButton(dash: BootedDashboard): HTMLButtonElement {
  const btn = Array.from(dash.el("sort-inbox-preview").querySelectorAll("button")).find((b) =>
    /^Apply —/.test(b.textContent ?? ""),
  );
  if (!btn) throw new Error("no Apply button in the sort preview");
  return btn;
}

function labelledIds(dash: BootedDashboard): string[] {
  return (dash.gmail.labelMessages as ReturnType<typeof vi.fn>).mock.calls.flatMap(
    ([, ids]) => ids as string[],
  );
}

beforeEach(async () => {
  dash = await bootDashboard();
});

describe("preview → apply", () => {
  it("labels each bucket, skips an unticked message, never touches starred mail", async () => {
    await openPreview(dash);

    const checkboxes = Array.from(
      dash.el("sort-inbox-preview").querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    expect(checkboxes.length).toBeGreaterThan(1);

    const before = Number(applyButton(dash).textContent!.match(/\d+/)![0]);
    checkboxes[0].checked = false;
    checkboxes[0].dispatchEvent(new Event("change"));
    const after = Number(applyButton(dash).textContent!.match(/\d+/)![0]);
    expect(after).toBe(before - 1);

    applyButton(dash).click();
    await vi.waitFor(() => expect(dash.gmail.labelMessages).toHaveBeenCalled());

    const ids = labelledIds(dash);
    expect(ids).not.toContain("p1"); // starred sender's messages
    expect(ids).not.toContain("p2");

    dash.showTab("recent");
    expect(dash.el("recent-list").textContent).not.toContain("Nothing done yet");
  });
});

describe("per-sender override", () => {
  it("'never sort this sender' persists and drops the sender from the preview", async () => {
    await openPreview(dash);

    const select = dash.el("sort-inbox-preview").querySelector<HTMLSelectElement>(
      "details.sort-preview-sender select",
    )!;
    const row = select.closest("details")!;
    const address = row.querySelector("summary")!.textContent!.match(/[\w.+-]+@[\w.-]+/)?.[0];

    select.value = "never";
    select.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      const ov = dash.storedSettings().sortOverrides;
      expect(Object.values(ov)).toContain("never");
    });
    if (address) {
      await vi.waitFor(() =>
        expect(dash.el("sort-inbox-preview").textContent).not.toContain(address),
      );
    }
  });
});

describe("keep sorting new mail", () => {
  it("creates a standing filter per domain-category bucket and records it", async () => {
    dash.showTab("cleanup");
    const keep = dash.el("sort-keep-sorting") as HTMLInputElement;
    keep.checked = true;
    keep.dispatchEvent(new Event("change"));

    await openPreview(dash);
    applyButton(dash).click();

    await vi.waitFor(() => expect(dash.storedSettings().autoSort.keepSorting).toBe(true));
    await vi.waitFor(() => expect(dash.gmailApi.createFilter).toHaveBeenCalled());

    const filterBuckets = Object.values(dash.storedSettings().autoSort.filterIdsByBucket).filter(
      (v) => Array.isArray(v) && v.length > 0,
    );
    expect(filterBuckets.length).toBeGreaterThan(0);
  });
});
