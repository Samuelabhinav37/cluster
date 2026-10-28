// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// 3.13: once an order says delivered, its shipping updates can leave the inbox.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, fixtureMailbox } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Delivered orders", () => {
  it("archives the in-transit updates, keeps the confirmation and the delivered note", async () => {
    const now = Date.now();
    const ship = (id: string, subject: string, daysAgo: number) => ({
      ...fixtureMailbox(now)[0],
      id,
      fromAddress: "ship@store.example",
      fromDisplayName: "Store",
      subject,
      receivedAt: now - daysAgo * 86_400_000,
      unsubscribe: {},
    });
    const dash = await bootDashboard({
      mailbox: [
        ...fixtureMailbox(now),
        ship("o1", "Order #77123 confirmed", 6),
        ship("o2", "Order #77123 has shipped", 5),
        ship("o3", "Order #77123 is out for delivery", 4),
        ship("o4", "Order #77123 was delivered", 3),
      ],
    });
    dash.showScreen("organize");
    const card = () => document.querySelector<HTMLElement>('#presets [data-preset="delivered"]');
    await vi.waitFor(() => {
      if (!card()) throw new Error("no card yet");
    });
    expect(card()!.textContent).toContain("2 shipping updates done");
    card()!.querySelector("button")!.click();
    const archive = dash.gmail.archiveMessages as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => expect(archive).toHaveBeenCalledTimes(1));
    expect([...archive.mock.calls[0][1]].sort()).toEqual(["o2", "o3"]);
  });
});
