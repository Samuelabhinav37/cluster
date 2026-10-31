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
