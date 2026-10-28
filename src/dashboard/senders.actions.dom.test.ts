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
