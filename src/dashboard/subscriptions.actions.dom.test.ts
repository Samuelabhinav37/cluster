// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Phase 2 — Subscriptions tab: a verified one-click unsubscribe (single + bulk)
// fires the POST, records the request, and re-labels the row.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, confirmStep, type BootedDashboard } from "./testHarness";

let fetchSpy: ReturnType<typeof vi.fn>;
let dash: BootedDashboard;

function unsubButton(dash: BootedDashboard): HTMLButtonElement {
  const row = Array.from(dash.el("subscriptions-list").querySelectorAll("tr")).find((tr) =>
    tr.textContent?.includes("shop.example"),
  );
  if (!row) throw new Error("no shop.example row in subscriptions list");
  // The primary action is the first button in the unsubscribe cell; a
  // secondary "Unsubscribe + clean…" button may follow it.
  const btn = row.querySelector("button");
  if (!btn) throw new Error("no button in row");
  return btn;
}

beforeEach(async () => {
  fetchSpy = vi.fn(async () => new Response("", { status: 200 }));
  dash = await bootDashboard({ grantOrigins: true, fetchImpl: fetchSpy as unknown as typeof fetch });
  dash.showTab("subscriptions");
});

describe("single one-click unsubscribe", () => {
  it("POSTs the List-Unsubscribe endpoint, records the request, relabels the row", async () => {
    unsubButton(dash).click();

    await vi.waitFor(() =>
      expect(dash.storedSettings().unsubscribeRequests["gmail:deals@shop.example"]).toBeTruthy(),
    );

    const post = fetchSpy.mock.calls.find(
      ([url, init]) => url === "https://shop.example/u" && (init as RequestInit)?.method === "POST",
    );
    expect(post, "no POST to the unsubscribe endpoint").toBeTruthy();

    expect(unsubButton(dash).textContent).toMatch(/again|Requested/i);
    dash.showTab("recent");
    expect(dash.el("recent-list").textContent).toMatch(/Unsubscribed from .*shop\.example/);
  });
});

describe("bulk unsubscribe all verified", () => {
  it("only touches postUrl senders and records each", async () => {
    dash.el("subs-unsub-all-btn").click();
    await confirmStep(dash.el("subs-unsub-all-slot"));

    const posts = fetchSpy.mock.calls.filter(
      ([, init]) => (init as RequestInit)?.method === "POST",
    );
    // The fixture has exactly one one-click-capable sender.
    expect(posts).toHaveLength(1);
    expect(Object.keys(dash.storedSettings().unsubscribeRequests)).toContain(
      "gmail:deals@shop.example",
    );
  });
});
