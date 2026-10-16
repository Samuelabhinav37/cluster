// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Phase 2 — Clean-up tab action flows. Asserts the three side effects that
// matter for each action: the provider call, the persisted-settings mutation,
// and the Recently-done entry + working Undo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, confirmStep, type BootedDashboard } from "./testHarness";

function openAllGroups(container: HTMLElement) {
  container.querySelectorAll<HTMLDetailsElement>("details").forEach((d) => {
    if (!d.open) {
      d.open = true;
      d.dispatchEvent(new Event("toggle"));
    }
  });
}

function senderRow(dash: BootedDashboard, addressFragment: string): HTMLTableRowElement {
  const groups = dash.el("sender-groups");
  openAllGroups(groups);
  const row = Array.from(groups.querySelectorAll<HTMLTableRowElement>("tr")).find((tr) =>
    tr.textContent?.includes(addressFragment),
  );
  if (!row) throw new Error(`no sender row containing "${addressFragment}"`);
  return row;
}

function rowButton(row: HTMLElement, text: string): HTMLButtonElement {
  const btn = Array.from(row.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);
  if (!btn) throw new Error(`no "${text}" button in row`);
  return btn;
}

function recentRows(dash: BootedDashboard): string[] {
  dash.showTab("recent");
  return Array.from(dash.el("recent-list").querySelectorAll(".recent-row")).map(
    (r) => r.textContent ?? "",
  );
}

let dash: BootedDashboard;

beforeEach(async () => {
  dash = await bootDashboard();
  dash.showTab("cleanup");
});

describe("Mute a sender", () => {
  it("fires muteSender, persists the address, and logs an undoable entry", async () => {
    const row = senderRow(dash, "deals@shop.example");
    rowButton(row, "Mute").click();

    const cell = rowButton(row, "Confirm").closest("td")!;
    const result = await confirmStep(cell);

    expect(result).toContain("Muted");
    expect(dash.gmail.muteSender).toHaveBeenCalledTimes(1);
    const [token, address, ids] = (dash.gmail.muteSender as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(token).toBe("gmail-token");
    expect(address).toBe("deals@shop.example");
    expect(ids.length).toBeGreaterThan(0);

    expect(dash.storedSettings().mutedSenders).toContain("deals@shop.example");
    expect(recentRows(dash).some((t) => /Muted .*shop\.example/.test(t))).toBe(true);
  });

  it("Undo calls unmuteSender and clears the persisted address", async () => {
    const row = senderRow(dash, "deals@shop.example");
    rowButton(row, "Mute").click();
    await confirmStep(rowButton(row, "Confirm").closest("td")!);

    dash.showTab("recent");
    const undo = Array.from(dash.el("recent-list").querySelectorAll("button")).find(
      (b) => b.textContent === "Undo",
    )!;
    undo.click();
    await vi.waitFor(() => {
      expect(dash.gmail.unmuteSender).toHaveBeenCalledTimes(1);
    });

    const [, address] = (dash.gmail.unmuteSender as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(address).toBe("deals@shop.example");
    expect(dash.storedSettings().mutedSenders).not.toContain("deals@shop.example");
    expect(recentRows(dash).some((t) => /undone/.test(t))).toBe(true);
  });
});

describe("Bulk keep-sorted", () => {
  it("keeps every selected sender sorted", async () => {
    const groups = dash.el("sender-groups");
    openAllGroups(groups);
    const boxes = Array.from(
      groups.querySelectorAll<HTMLInputElement>("input[data-sender-key]"),
    ).slice(0, 2);
    expect(boxes.length).toBe(2);
    for (const b of boxes) {
      b.checked = true;
      b.dispatchEvent(new Event("change"));
    }

    dash.el("bulk-keep-sorted-btn").click();
    await confirmStep(dash.el("keep-sorted-bulk-slot"));

    expect(dash.gmail.keepSorted).toHaveBeenCalledTimes(2);
  });
});

describe("Never-read / personalized cleanup", () => {
  it("Trash all only touches non-starred ids", async () => {
    // Seed an engagement record so the shop sender surfaces as a suggestion
    // (a cold boot has no records and shows nothing here).
    const seeded = await bootDashboard({
      settings: {
        senderEngagement: {
          "gmail:deals@shop.example": {
            samples: 6,
            unreadRatioEma: 0.95,
            lastObservedLatestMessageAt: 0,
            lastObservedCount: 3,
            lastObservedUnreadCount: 3,
            lastSeenAt: Date.now(),
            acceptedActions: 0,
            dismissedSuggestions: 0,
            undoneActions: 0,
          },
        },
      },
    });
    seeded.showTab("cleanup");

    expect(seeded.el("never-read-section").hidden).toBe(false);
    const trashAll = seeded.button("never-read-section", /Trash suggested/i);
    expect(trashAll, "never-read section did not render a Trash button").toBeTruthy();
    expect(trashAll!.disabled).toBe(false);

    trashAll!.click();
    await confirmStep(seeded.el("never-read-trash-slot"));

    expect(seeded.gmail.trashMessages).toHaveBeenCalled();
    const trashedIds = (
      seeded.gmail.trashMessages as ReturnType<typeof vi.fn>
    ).mock.calls.flatMap(([, ids]) => ids as string[]);
    expect(trashedIds.length).toBeGreaterThan(0);
    expect(trashedIds).not.toContain("p1"); // the starred message id
  });
});

describe("Overview tile navigation", () => {
  it("clicking the unsubscribe-capable tile jumps to the Subscriptions tab", async () => {
    dash.showTab("overview");
    const tile = Array.from(
      dash.el("overview-content").querySelectorAll<HTMLButtonElement>("button.overview-tile"),
    ).find((b) => b.querySelector(".label")?.textContent === "Unsubscribe-capable senders");
    expect(tile, "unsubscribe-capable tile not rendered").toBeTruthy();
    expect(Number(tile!.querySelector(".value")?.textContent)).toBeGreaterThan(0);

    tile!.click();

    const active = document.querySelector<HTMLElement>(
      "section.tab-panel[data-tab]:not([hidden])",
    );
    expect(active?.dataset.tab).toBe("subscriptions");
    await vi.waitFor(() => expect(dash.storedSettings().activeTab).toBe("subscriptions"));
  });
});
