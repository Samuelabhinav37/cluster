// @vitest-environment jsdom
/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { bootDashboard, confirmStep, fixtureMailbox } from "./testHarness";

describe("Senders — a company's card", () => {
  it("mutes every address of the company after one confirm", async () => {
    const now = Date.now();
    const auth = "mx.google.com; dkim=pass header.d=shop.example; spf=pass; dmarc=pass";
    const mailbox = fixtureMailbox(now).map((m) =>
      m.fromAddress === "deals@shop.example" ? { ...m, authenticationResults: auth } : m,
    );
    const shop = mailbox.find((m) => m.id === "s1")!;
    const news = { ...shop, id: "n1", fromAddress: "news@shop.example", fromDisplayName: "Shop" };
    const dash = await bootDashboard({ mailbox: [...mailbox, news] });
    dash.showScreen("senders");

    const row = dash.el("all-senders-list").querySelector<HTMLElement>('[data-pick="company:shop.example"]')!;
    row.click();
    const card = dash.el("sender-card");
    const muteAll = Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Mute all")!;
    const slot = muteAll.parentElement as HTMLElement;
    muteAll.click();
    await confirmStep(slot);
    await vi.waitFor(() => expect(dash.gmail.muteSender).toHaveBeenCalledTimes(2));
  });
});

describe("Settings — Sign out", () => {
  it("asks about Cluster's filters, removes them on request, and revokes Google access", async () => {
    const dash = await bootDashboard({ labels: [{ id: "L1", name: "🔇 Muted", type: "user" }] });
    dash.showScreen("settings");
    (dash.el("settings-signout") as HTMLButtonElement).click();
    const slot = dash.el("settings-signout-slot");
    expect(slot.textContent).toContain("Cluster's Gmail filters");
    Array.from(slot.querySelectorAll("button")).find((b) => b.textContent === "Remove them")!.click();
    await vi.waitFor(() => expect(dash.gmailApi.revokeGoogleAccess).toHaveBeenCalled());
    const [, ids] = dash.gmailApi.deleteFiltersInto.mock.calls[0] as [string, Set<string>];
    expect([...ids]).toEqual(["L1"]);
  });
});

describe("Settings — What Cluster learned", () => {
  it("counts your sort corrections and forgets them on Reset", async () => {
    const dash = await bootDashboard({ settings: { sortOverrides: { "deals@shop.example": "never" } } });
    dash.showScreen("settings");
    const host = dash.el("settings-learned");
    const row = Array.from(host.querySelectorAll<HTMLElement>(".set-row")).find((r) =>
      r.textContent?.startsWith("Sort choices"),
    )!;
    expect(row.querySelector(".ios-value")!.textContent).toBe("1");
    row.querySelector("button")!.click();
    await confirmStep(row.querySelector(".row-actions > span:last-child") as HTMLElement);
    await vi.waitFor(() => expect(dash.storedSettings().sortOverrides).toEqual({}));
  });
});
