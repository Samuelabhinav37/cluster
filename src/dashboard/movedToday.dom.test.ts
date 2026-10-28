// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// 4.2: Home lists what the time-limit sweep moved out today, with a way back.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

const sweepEntry = {
  id: "sort-1",
  at: Date.now() - 60_000,
  kind: "sort" as const,
  summary: "Time limits moved 2 messages out of the inbox into their labels",
  undo: { provider: "gmail" as const, ids: ["m1", "m2"], via: "unarchive" as const },
};

function card(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".moved-today");
}

function buttonIn(el: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(el.querySelectorAll("button")).find((b) => b.textContent === label)!;
}

describe("Moved today", () => {
  it("puts today's sweep back in the inbox", async () => {
    const dash = await bootDashboard({ settings: { actionLog: [sweepEntry] } });
    await vi.waitFor(() => {
      if (!card()) throw new Error("no card yet");
    });
    expect(card()!.textContent).toContain("moved 2 emails");
    buttonIn(card()!, "Back to inbox").click();
    await vi.waitFor(() => {
      if (!dash.storedSettings().autoSort?.keptInInboxIds?.includes("m2")) throw new Error("not back yet");
    });
    expect(dash.gmail.unarchiveMessages).toHaveBeenCalledWith("gmail-token", ["m1", "m2"]);
  });

  it("hides on Looks right and skips user sorts and older moves", async () => {
    await bootDashboard({ settings: { actionLog: [sweepEntry] } });
    await vi.waitFor(() => {
      if (!card()) throw new Error("no card yet");
    });
    buttonIn(card()!, "Looks right").click();
    expect(card()).toBeNull();

    document.body.innerHTML = "";
    await bootDashboard({
      settings: {
        actionLog: [
          { ...sweepEntry, id: "u", undo: { ...sweepEntry.undo, via: "unsort" as const } },
          { ...sweepEntry, id: "old", at: Date.now() - 3 * 86_400_000 },
        ],
      },
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(card()).toBeNull();
  });
});
