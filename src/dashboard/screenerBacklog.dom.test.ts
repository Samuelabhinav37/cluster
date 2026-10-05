// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// The Screener backlog: the real count of held messages (not just the senders
// in the latest scan) and the one-pass "sort the held mail" release.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard } from "./testHarness";

const SCREENER = { id: "L_SCREEN", name: "Declutter/Screener", type: "user" as const, messagesTotal: 1434 };

beforeEach(() => {
  vi.restoreAllMocks();
});

async function backlogShown(dash: Awaited<ReturnType<typeof bootDashboard>>) {
  dash.showScreen("screener");
  await vi.waitFor(() => {
    if (dash.el("screener-backlog").hidden) throw new Error("backlog not shown yet");
  });
  return dash.el("screener-backlog");
}

describe("Screener backlog", () => {
  it("shows how many messages are really held, even with the Screener off", async () => {
    const dash = await bootDashboard({ labels: [SCREENER] });
    const card = await backlogShown(dash);
    expect(card.textContent).toContain("1,434 messages are waiting in the Screener.");
  });

  it("previews where held mail goes, then files it and lifts the hold", async () => {
    // o1 is an OTP from an unknown sender; p2 is from someone already allowed.
    const dash = await bootDashboard({
      labels: [SCREENER],
      labelMessages: { L_SCREEN: ["o1", "p2"] },
      settings: { screenerAllowlist: ["family@personal.example"] },
    });
    const card = await backlogShown(dash);
    dash.button("screener-backlog", "Sort the held mail…")!.click();

    await vi.waitFor(() => {
      if (!card.textContent?.includes("Here's where the held mail would go")) throw new Error("no preview yet");
    });
    expect(card.textContent).toContain("🔑 One-time codes · 1 message from 1 sender");
    expect(card.textContent).toContain("Back to your inbox · 1 message from 1 sender");

    dash.button("screener-backlog", "Sort them")!.click();
    await vi.waitFor(() => {
      if (dash.gmailApi.batchModify.mock.calls.length < 2) throw new Error("not moved yet");
    });
    expect(dash.gmailApi.batchModify).toHaveBeenCalledWith("gmail-token", ["o1"], ["label-id"], ["L_SCREEN"]);
    expect(dash.gmailApi.batchModify).toHaveBeenCalledWith("gmail-token", ["p2"], ["INBOX"], ["L_SCREEN"]);
    await vi.waitFor(() => {
      if (!dash.storedSettings().screenerAllowlist?.includes("code@auth.example")) throw new Error("not saved");
    });
  });
});
