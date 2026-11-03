// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Home's Today list: the few emails from the last day that matter, with
// Gmail's preview line fetched for those ids only and never stored.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, fixtureMailbox } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Today", () => {
  it("lists a person's email from the last hour with its preview, fetched for Today's ids only", async () => {
    const now = Date.now();
    const mailbox = [
      ...fixtureMailbox(now),
      {
        ...fixtureMailbox(now)[0],
        id: "t1",
        fromAddress: "mom@gmail.com",
        fromDisplayName: "Mom",
        subject: "Dinner on Sunday?",
        receivedAt: now - 3600_000,
        unsubscribe: {},
      },
    ];
    const dash = await bootDashboard({ mailbox });
    await vi.waitFor(() => {
      if (!document.querySelector(".today-row")) throw new Error("no Today rows yet");
    });
    const row = document.querySelector<HTMLAnchorElement>(".today-row")!;
    expect(row.textContent).toContain("Mom");
    expect(row.textContent).toContain("Dinner on Sunday?");
    expect(row.href).toContain("t1");
    await vi.waitFor(() => expect(row.querySelector(".today-snippet")!.textContent).toBe("Preview of t1 & more"));
    const asked = dash.gmailApi.getSnippets.mock.calls.flatMap((c) => c[1] as string[]);
    expect(asked).toContain("t1");
    expect(asked.length).toBeLessThanOrEqual(10);
    expect(JSON.stringify(dash.storedSettings())).not.toContain("Preview of");
  });
});
