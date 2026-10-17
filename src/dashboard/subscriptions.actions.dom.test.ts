// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Action-flow tests for the Subscriptions screen: the verified one-click
// unsubscribe path (single row and bulk). Cluster never fills in a form or
// hits a non-List-Unsubscribe URL on the user's behalf — these tests assert
// the actual fetch() call shape, not just that a button exists.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootDashboard, confirmStep } from "./testHarness";

function findSubRow(container: HTMLElement, title: string): HTMLElement {
  const titleEl = Array.from(container.querySelectorAll(".row-title")).find(
    (t) => t.textContent === title,
  );
  if (!titleEl) throw new Error(`no subscription row titled "${title}"`);
  return titleEl.closest(".list-row") as HTMLElement;
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
    // Public Suffix List file aren't unsubscribe requests.
    (call: unknown[]) => !String(call[0]).includes("googleapis.com") && !String(call[0]).endsWith("public-suffix.json"),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Subscriptions screen — one-click unsubscribe", () => {
  it("POSTs List-Unsubscribe=One-Click to the sender's postUrl and records the request", async () => {
    const fetchImpl = makeFetchImpl(async () => new Response("", { status: 202 }));
    const dash = await bootDashboard({ grantOrigins: true, fetchImpl });
    dash.showScreen("subscriptions");

    const row = findSubRow(dash.el("subscriptions-list"), "Shop");
    const unsubBtn = Array.from(row.querySelectorAll("button")).find(
      (b) => b.textContent === "Unsubscribe",
    )!;
    unsubBtn.click();

    await vi.waitFor(() => {
      if (unsubscribeCalls(fetchImpl).length === 0) throw new Error("fetch not called yet");
    });

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
    const unsubBtn = Array.from(row.querySelectorAll("button")).find(
      (b) => b.textContent === "Unsubscribe",
    )!;
    unsubBtn.click();

    await vi.waitFor(() => {
      if (unsubBtn.textContent === "Requesting…") throw new Error("still requesting");
    });

    expect(unsubBtn.textContent).toBe("Failed, retry");
    expect(unsubBtn.disabled).toBe(false);
    expect(unsubscribeCalls(fetchImpl)).toHaveLength(0);
  });
});

describe("Subscriptions screen — bulk unsubscribe all", () => {
  it("sends the verified one-click request to every unsubscribe-capable sender", async () => {
    const fetchImpl = makeFetchImpl(async () => new Response("", { status: 202 }));
    const dash = await bootDashboard({ grantOrigins: true, fetchImpl });
    dash.showScreen("subscriptions");

    const allBtn = dash.el("subs-unsub-all-btn") as HTMLButtonElement;
    allBtn.click();
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
