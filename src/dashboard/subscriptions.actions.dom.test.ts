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

/** The control behind a row's ⋯ menu item (it lives in the strip row under it). */
function rowControl(row: HTMLElement, label: string): HTMLButtonElement {
  const strip = row.nextElementSibling as HTMLElement;
  const btn = Array.from(strip.querySelectorAll("button")).find((b) => b.textContent === label);
  if (!btn) throw new Error(`no "${label}" in the row's menu`);
  return btn;
}

function pickMenuItem(row: HTMLElement, label: string) {
  const item = Array.from(row.querySelectorAll<HTMLButtonElement>("[role=menuitem]")).find((b) => b.textContent === label);
  if (!item) throw new Error(`no "${label}" menu item`);
  item.click();
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

describe("Subscriptions screen — one-click unsubscribe", () => {
  it("POSTs List-Unsubscribe=One-Click to the sender's postUrl and records the request", async () => {
    const fetchImpl = makeFetchImpl(async () => new Response("", { status: 202 }));
    const dash = await bootDashboard({ grantOrigins: true, fetchImpl });
    dash.showScreen("subscriptions");

    const row = findSubRow(dash.el("subscriptions-list"), "Shop");
    pickMenuItem(row, "Unsubscribe");

    // The request waits out the 3 s Undo grace first.
    await vi.waitFor(
      () => {
        if (unsubscribeCalls(fetchImpl).length === 0) throw new Error("fetch not called yet");
      },
      { timeout: 5000 },
    );

    const [url, init] = unsubscribeCalls(fetchImpl)[0] as [string, RequestInit];
    expect(url).toBe("https://shop.example/u");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("List-Unsubscribe=One-Click");

    await vi.waitFor(() => {
      expect(dash.storedSettings().unsubscribeRequests?.["gmail:deals@shop.example"]).toBeTruthy();
    });

    dash.showScreen("recent");
    expect(dash.el("recent-list").textContent).toContain("deals@shop.example");
  });

  it("leaves the button retryable when the origin permission is denied", async () => {
    const fetchImpl = makeFetchImpl(async () => new Response("", { status: 202 }));
    // grantOrigins defaults to false — the permission-request step must fail
    // closed, never silently skip straight to firing the request.
    const dash = await bootDashboard({ fetchImpl });
    dash.showScreen("subscriptions");

    const row = findSubRow(dash.el("subscriptions-list"), "Shop");
    const unsubBtn = rowControl(row, "Unsubscribe");
    pickMenuItem(row, "Unsubscribe");

    await vi.waitFor(() => expect(unsubBtn.textContent).toBe("Failed, retry"), { timeout: 5000 });

    expect(unsubBtn.textContent).toBe("Failed, retry");
    expect(unsubBtn.disabled).toBe(false);
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
    row.querySelector<HTMLInputElement>("input.check")!.click();
    dash.el("subs-unsub-all-btn").click();
    await confirmStep(dash.el("subs-unsub-all-slot"));
    await vi.waitFor(() => {
      const urls = unsubscribeCalls(fetchImpl).map((c) => c[0]);
      expect(urls).toContain("https://shop.example/n");
      expect(urls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("Subscriptions screen — Undo before the request goes out", () => {
  it("sends nothing when Undo is pressed during the grace", async () => {
    const fetchImpl = makeFetchImpl(async () => new Response("", { status: 202 }));
    const dash = await bootDashboard({ grantOrigins: true, fetchImpl });
    dash.showScreen("subscriptions");
    const row = findSubRow(dash.el("subscriptions-list"), "Shop");
    pickMenuItem(row, "Unsubscribe");
    Array.from((row.nextElementSibling as HTMLElement).querySelectorAll("button")).find((b) => b.textContent === "Undo")!.click();
    await new Promise((r) => setTimeout(r, 3200));
    expect(unsubscribeCalls(fetchImpl)).toHaveLength(0);
    expect(dash.storedSettings().unsubscribeRequests?.["gmail:deals@shop.example"]).toBeUndefined();
  });
});

describe("Subscriptions screen — Stop and archive old", () => {
  it("unsubscribes, then archives the old list mail instead of trashing it", async () => {
    const fetchImpl = makeFetchImpl(async () => new Response("", { status: 202 }));
    const dash = await bootDashboard({ grantOrigins: true, fetchImpl });
    dash.showScreen("subscriptions");
    const list = dash.el("subscriptions-list");
    const row = findSubRow(list, "Shop");
    pickMenuItem(row, "Stop and archive old");
    const confirm = Array.from(list.querySelectorAll(".instead-strip button")).find((b) => b.textContent === "Confirm")!;
    const result = await confirmStep(confirm.parentElement as HTMLElement);
    expect(result).toContain("to the archive");
    expect(dash.gmail.archiveMessages).toHaveBeenCalled();
    expect(dash.gmail.trashMessages).not.toHaveBeenCalled();
  });
});

describe("Subscriptions screen — senders that already stopped", () => {
  it("says they stopped and offers Clear out old mail first", async () => {
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
    const row = findSubRow(dash.el("subscriptions-list"), "Quiet Letters");
    expect(row.querySelector(".ct-reason")?.textContent).toBe("Stopped sending");
    expect(row.querySelector("[role=menuitem]")?.textContent).toBe("Clear out old mail");
    expect(findSubRow(dash.el("subscriptions-list"), "Shop").querySelector("[role=menuitem]")?.textContent).toBe("Unsubscribe");
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
