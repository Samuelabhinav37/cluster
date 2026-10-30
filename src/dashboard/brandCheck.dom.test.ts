// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Protect's brand check: a sender using PayPal's name from its own domain is listed
// under Doesn't match; Check with no certificate offers Trust and Block, and
// Trust moves it to Checked for good.
import { describe, expect, it, vi } from "vitest";
import { bootDashboard, fixtureMailbox } from "./testHarness";

vi.mock("../lib/markCheck", () => ({
  checkMark: vi.fn(async () => ({ verdict: "no-certificate" })),
}));

const buttonIn = (root: HTMLElement, label: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => b.textContent === label)!;

describe("Protect brand check", () => {
  it("checks a brand claim, then Trust settles it", async () => {
    const [base] = fixtureMailbox();
    const dash = await bootDashboard({
      mailbox: [
        ...fixtureMailbox(),
        {
          ...base,
          id: "m1",
          fromAddress: "service@paypal-billing.help",
          fromDisplayName: "PayPal",
          subject: "Invoice",
        },
      ],
    });
    dash.showScreen("impersonation");
    const root = dash.el("brand-check");
    const row = () =>
      Array.from(root.querySelectorAll<HTMLElement>(".mm-row")).find((r) =>
        r.textContent?.includes("paypal-billing.help"),
      );
    expect(root.textContent).toContain("Doesn't match");
    buttonIn(row()!, "Check").click();
    await vi.waitFor(() => expect(row()!.textContent).toContain("No certificate"));
    buttonIn(row()!, "Trust").click();
    await vi.waitFor(() => expect(row()!.textContent).toContain("Real"));
    const stored = await chrome.storage.local.get("clusterSettings");
    expect(JSON.stringify(stored)).toContain('"verdict":"real"');
  });
});
