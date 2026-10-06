// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Regression (B1): undoing a time-limit move must stick. Before the fix the
// restored mail was still labelled and past its limit, so the next 15-minute
// sweep moved it straight back out.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pinInInbox, sweepExpiredInbox, type InboxLimitsApi } from "../lib/inboxTimeLimits";
import { bootDashboard } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Undo of a time-limit move", () => {
  it("puts the mail back and pins it so the sweep leaves it alone", async () => {
    const dash = await bootDashboard({
      settings: {
        actionLog: [
          {
            id: "archive-1",
            at: Date.now() - 60_000,
            kind: "archive",
            summary: "Time limits moved 2 messages out of the inbox into their labels",
            undo: { provider: "gmail", ids: ["m1", "m2"], via: "unarchive" },
          },
        ],
      },
    });
    dash.showScreen("recent");
    await vi.waitFor(() => {
      if (!dash.button("recent-list", "Undo")) throw new Error("no Undo yet");
    });
    dash.button("recent-list", "Undo")!.click();

    await vi.waitFor(() => {
      if (!dash.storedSettings().autoSort?.keptInInboxIds?.includes("m2")) throw new Error("not pinned yet");
    });
    expect(dash.gmail.unarchiveMessages).toHaveBeenCalledWith("gmail-token", ["m1", "m2"]);
    const pinned = new Set(dash.storedSettings().autoSort.keptInInboxIds);

    // The next sweep sees m1 and m2 past their limit but must not move them.
    const api: InboxLimitsApi = {
      findLabelId: async () => "L",
      ensureLabelId: async () => "L",
      listIds: async (_labels, query) => (query.startsWith("before:") ? ["m1", "m2", "m3"] : []),
      readSenders: vi.fn(async () => []),
      batchModify: vi.fn(async () => {}),
    };
    await sweepExpiredInbox(
      {
        limits: [{ bucket: "otp", labelName: "🔑 One-time codes", hours: 24 }],
        known: new Set(),
        overrides: {},
        now: Date.now(),
        keptIds: pinned,
      },
      api,
    );
    expect(api.readSenders).toHaveBeenCalledWith(["m3"]);
  });
});

describe("pinInInbox", () => {
  it("adds ids newest-last, without duplicates, capped", () => {
    expect(pinInInbox(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
    const many = Array.from({ length: 2500 }, (_, i) => `x${i}`);
    const pinned = pinInInbox([], many);
    expect(pinned).toHaveLength(2000);
    expect(pinned.at(-1)).toBe("x2499");
  });
});
