// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Clear out's "Receipts? Keep them" chip: shown on a store sender you never
// open, never on a mailing list, and a yes keeps that sender's mail.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { many } from "../test/mailFixtures";
import { bootDashboard } from "./testHarness";

beforeEach(() => {
  vi.restoreAllMocks();
});

const DAY = 86_400_000;

describe("Receipts? Keep them", () => {
  it("asks about a store sender, not a list, and a yes keeps its mail", async () => {
    const old = Date.now() - 20 * DAY;
    const dash = await bootDashboard({
      mailbox: [
        ...many(8, { fromAddress: "hello@acme-store.example", subject: "Your Acme picks", receivedAt: old }),
        ...many(8, { fromAddress: "news@paper.example", listId: "daily.paper.example", receivedAt: old }),
      ],
    });
    dash.showScreen("delete");
    const rows = () => Array.from(dash.el("never-read-section").querySelectorAll("tbody tr"));
    const rowFor = (address: string) => rows().find((r) => r.textContent?.includes(address));
    await vi.waitFor(() => expect(rowFor("hello@acme-store.example")).toBeDefined());
    expect(rowFor("news@paper.example")?.textContent).not.toContain("Receipts?");

    const keep = Array.from(rowFor("hello@acme-store.example")!.querySelectorAll("button")).find(
      (b) => b.textContent === "Receipts? Keep them",
    );
    expect(keep).toBeDefined();
    keep!.click();

    await vi.waitFor(() => expect(rowFor("hello@acme-store.example")).toBeUndefined());
    expect(rowFor("news@paper.example")).toBeDefined();
    const stored = await chrome.storage.local.get("kindModel");
    expect(stored.kindModel.answers).toEqual({ "gmail:hello@acme-store.example": "yes" });
  });
});
