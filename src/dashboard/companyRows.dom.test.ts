// @vitest-environment jsdom
/// <reference types="vite/client" />
// Backlog 5.3: one company is one row in Clean up and Details, the same fold Senders uses.
import { describe, expect, it, vi } from "vitest";
import type { SenderSummary } from "../lib/senderModel";
import { detailSenders } from "./detailsPanel";
import { bootDashboard, confirmStep, fixtureMailbox } from "./testHarness";

async function bootWithShopCompany() {
  const auth = "mx.google.com; dkim=pass header.d=shop.example; spf=pass; dmarc=pass";
  const mailbox = fixtureMailbox(Date.now()).map((m) =>
    m.fromAddress === "deals@shop.example" ? { ...m, authenticationResults: auth } : m,
  );
  const shop = mailbox.find((m) => m.id === "s1")!;
  const news = { ...shop, id: "n1", fromAddress: "news@shop.example", fromDisplayName: "Shop" };
  return bootDashboard({ mailbox: [...mailbox, news] });
}

const rowsTitled = (root: HTMLElement, title: string) =>
  Array.from(root.querySelectorAll<HTMLElement>(".list-row")).filter(
    (r) => r.querySelector(".row-title")?.textContent?.trim() === title,
  );

describe("one row per company", () => {
  it("Clean up lists both Shop addresses as one row whose Trash takes all of them", async () => {
    const dash = await bootWithShopCompany();
    dash.showScreen("delete");

    const rows = rowsTitled(dash.el("sender-groups"), "Shop");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("2 addresses");
    expect(rows[0].textContent).toContain("4 emails");
    // Each row's bar is its share of the biggest row; the biggest fills it.
    const widths = Array.from(
      dash.el("sender-groups").querySelectorAll<HTMLElement>(".ios-value .cellbar i"),
    ).map((i) => parseFloat(i.style.width));
    expect(Math.max(...widths)).toBe(100);
    expect(widths.every((w) => w > 0 && w <= 100)).toBe(true);

    const trash = Array.from(rows[0].querySelectorAll("button")).find((b) => b.textContent === "Trash")!;
    const cell = trash.parentElement!;
    trash.click();
    await confirmStep(cell);
    const [, ids] = (dash.gmail.trashMessages as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(new Set(ids)).toEqual(new Set(["s1", "s2", "s3", "n1"]));
  });

  it("Details folds a company's addresses into one sender row", () => {
    const at = Date.now();
    const sender = (address: string, ids: string[]) =>
      ({
        key: `gmail:${address}`,
        provider: "gmail",
        address,
        displayName: "Shop",
        messages: ids.map((id) => ({ id, receivedAt: at, unread: true })),
      }) as unknown as SenderSummary;
    const senders = [sender("deals@shop.example", ["s1", "s2"]), sender("news@shop.example", ["n1"])];
    const rows = detailSenders(senders, (s) =>
      s.address.endsWith("@shop.example") ? "shop.example" : s.key,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "shop.example",
      address: "deals@shop.example",
      addresses: 2,
      emails: 3,
    });
  });
});
