// @vitest-environment jsdom
/// <reference types="vite/client" />
// Backlog 5.3: one company is one row in Details, the same fold Senders uses.
import { describe, expect, it } from "vitest";
import type { SenderSummary } from "../lib/senderModel";
import { detailSenders } from "./detailsPanel";

describe("one row per company", () => {
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
