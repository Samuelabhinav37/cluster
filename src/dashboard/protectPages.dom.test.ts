// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Protect: one "Look at these" list, and the Warning signs tile opens a page of
// the senders behind each sign, with Back.
import { describe, expect, it } from "vitest";
import { bootDashboard, fixtureMailbox } from "./testHarness";

describe("Protect pages", () => {
  it("lists a brand claim once and opens Warning signs as its own page", async () => {
    const [base] = fixtureMailbox();
    const dash = await bootDashboard({
      mailbox: [
        ...fixtureMailbox(),
        { ...base, id: "m1", fromAddress: "service@paypal-billing.help", fromDisplayName: "PayPal", subject: "Invoice" },
      ],
    });
    dash.showScreen("impersonation");
    const listed = document.body.innerHTML.split("paypal-billing.help").length - 1;
    expect(dash.el("brand-check").textContent).not.toContain("paypal-billing.help");
    expect(listed).toBeGreaterThan(0);

    dash.el("report-signs-card").click();
    const page = dash.el("protect-page");
    expect(page.hidden).toBe(false);
    expect(page.textContent).toContain("Warning signs");
    expect(page.textContent).toContain("Name doesn't match the address");
    expect(page.querySelector(".list-row, .ios-row, [role='link'], a, button.row")).not.toBeNull();

    page.querySelector<HTMLButtonElement>(".cu-back")!.click();
    expect(page.hidden).toBe(true);
  });
});
