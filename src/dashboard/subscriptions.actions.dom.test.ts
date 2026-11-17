// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Action-flow tests for the Subscriptions screen: the verified one-click
// unsubscribe path (single row and bulk). Cluster never fills in a form or
// hits a non-List-Unsubscribe URL on the user's behalf — these tests assert
// the actual fetch() call shape, not just that a button exists.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, confirmStep, fixtureMailbox } from "./testHarness";

function findSubRow(container: HTMLElement, title: string): HTMLElement {
  const titleEl = Array.from(container.querySelectorAll(".ct-name b")).find((t) => t.textContent === title);
  if (!titleEl) throw new Error(`no mailing list row titled "${title}"`);
  return titleEl.closest("tr") as HTMLElement;
}

/** Ticks a row and opens the selection bar's Unsubscribe confirm. */
function tickAndUnsubscribe(dash: { el(id: string): HTMLElement }, row: HTMLElement) {
  row.querySelector<HTMLInputElement>("input.check")!.click();
  dash.el("subs-unsub-all-btn").click();
}

/** dashboard.ts also fetches the signed-in account's email off
 * gmail.googleapis.com on boot, on the same global fetch() this harness
 * stubs — route that one to a benign JSON response and let everything else
 * (the actual unsubscribe POST) fall through to the real impl. */
function makeFetchImpl(real: typeof fetch): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("googleapis.com")) {
      return new Response(JSON.stringify({ emailAddress: "test@example.com" }), { status: 200 });
    }
    return real(input, init);
  }) as unknown as typeof fetch;
}

function unsubscribeCalls(fetchImpl: typeof fetch) {
  return (fetchImpl as ReturnType<typeof vi.fn>).mock.calls.filter(
    // Gmail API calls and the dashboard's startup load of its own bundled
    // data files (Public Suffix List, brand registry) aren't unsubscribe requests.
    (call: unknown[]) => !String(call[0]).includes("googleapis.com") && !String(call[0]).startsWith("data/"),
  );
}

// Single unsubscribes wait out a 3 s Undo grace before the request goes out.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Mailing lists — one-click unsubscribe from the selection bar", () => {
  it("POSTs List-Unsubscribe=One-Click to the sender's postUrl and records the request", async () => {
    const fetchImpl = makeFetchImpl(async () => new Response("", { status: 202 }));
    const dash = await bootDashboard({ grantOrigins: true, fetchImpl });
    dash.showScreen("subscriptions");

    tickAndUnsubscribe(dash, findSubRow(dash.el("subscriptions-list"), "Shop"));
    await confirmStep(dash.el("subs-unsub-all-slot"));

    const [url, init] = unsubscribeCalls(fetchImpl)[0] as [string, RequestInit];
    expect(url).toBe("https://shop.example/u");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("List-Unsubscribe=One-Click");
    await vi.waitFor(() => {
      expect(dash.storedSettings().unsubscribeRequests?.["gmail:deals@shop.example"]).toBeTruthy();
    });
  });

  it("sends nothing when the origin permission is denied", async () => {
    const fetchImpl = makeFetchImpl(async () => new Response("", { status: 202 }));
    // grantOrigins defaults to false: the permission step must fail closed.
    const dash = await bootDashboard({ fetchImpl });
    dash.showScreen("subscriptions");

    tickAndUnsubscribe(dash, findSubRow(dash.el("subscriptions-list"), "Shop"));
    const result = await confirmStep(dash.el("subs-unsub-all-slot"));

    expect(result).toContain("Permission denied");
    expect(unsubscribeCalls(fetchImpl)).toHaveLength(0);
  });
});

describe("Mailing lists — one row per domain", () => {
  it("merges a domain's addresses; its Unsubscribe stops all of them after Confirm", async () => {
    const now = Date.now();
    const auth = "mx.google.com; dkim=pass header.d=shop.example; spf=pass; dmarc=pass";
    const mailbox = fixtureMailbox(now).map((m) =>
      m.fromAddress === "deals@shop.example" ? { ...m, authenticationResults: auth } : m,
    );
    const shop = mailbox.find((m) => m.id === "s1")!;
    const news = [1, 2].map((i) => ({
      ...shop,
      id: `n${i}`,
      fromAddress: "news@shop.example",
      fromDisplayName: "Shop News",
      receivedAt: now - i * 24 * 60 * 60 * 1000,
      unsubscribe: { postUrl: "https://shop.example/n" },
    }));
    const fetchImpl = makeFetchImpl(async () => new Response("", { status: 202 }));
    const dash = await bootDashboard({ grantOrigins: true, fetchImpl, mailbox: [...mailbox, ...news] });
    dash.showScreen("subscriptions");
    const list = dash.el("subscriptions-list");
    const shopRows = Array.from(list.querySelectorAll(".ct-name b")).filter((t) => /shop/i.test(t.textContent ?? ""));
    expect(shopRows).toHaveLength(1);
    const row = shopRows[0].closest<HTMLElement>("tr")!;
    expect(row.textContent).toContain("2 lists");
    tickAndUnsubscribe(dash, row);
    await confirmStep(dash.el("subs-unsub-all-slot"));
    await vi.waitFor(() => {
      const urls = unsubscribeCalls(fetchImpl).map((c) => c[0]);
      expect(urls).toContain("https://shop.example/n");
      expect(urls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("Subscriptions screen — senders that already stopped", () => {
  it("files them under Stopped sending in the Filter menu", async () => {
    const now = Date.now();
    const old = fixtureMailbox(now).find((m) => m.id === "s1")!;
    const quiet = [60, 90, 120].map((days, i) => ({
      ...old,
      id: `q${i}`,
      fromAddress: "letters@quiet.example",
      fromDisplayName: "Quiet Letters",
      subject: `Issue ${i}`,
      receivedAt: now - days * 24 * 60 * 60 * 1000,
      listId: "letters.quiet.example",
      unsubscribe: { postUrl: "https://quiet.example/u" },
    }));
    const dash = await bootDashboard({ mailbox: [...fixtureMailbox(now), ...quiet] });
    dash.showScreen("subscriptions");
    findSubRow(dash.el("subscriptions-list"), "Quiet Letters");
    const filter = Array.from(dash.el("cu-tools-lists").querySelectorAll<HTMLButtonElement>("[role=menuitem]")).find((b) =>
      b.textContent?.includes("Stopped sending"),
    );
    expect(filter?.textContent).toContain("Stopped sending (1)");
    filter!.click();
    const names = Array.from(dash.el("subscriptions-list").querySelectorAll(".ct-name b")).map((b) => b.textContent);
    expect(names).toEqual(["Quiet Letters"]);
  });
});

describe("Subscriptions screen — bulk unsubscribe all", () => {
  it("sends the verified one-click request to every unsubscribe-capable sender", async () => {
    const fetchImpl = makeFetchImpl(async () => new Response("", { status: 202 }));
    const dash = await bootDashboard({ grantOrigins: true, fetchImpl });
    dash.showScreen("subscriptions");

    dash.el("subscriptions-list").querySelector<HTMLInputElement>("thead input.check")!.click();
    dash.el("subs-unsub-all-btn").click();
    const resultText = await confirmStep(dash.el("subs-unsub-all-slot"));

    // Only deals@shop.example has a postUrl in the fixture mailbox.
    const calls = unsubscribeCalls(fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("https://shop.example/u");
    expect(resultText).toContain("Unsubscribed 1");

    dash.showScreen("recent");
    expect(dash.el("recent-list").textContent).toContain("Bulk unsubscribed from 1 sender");
  });
});
