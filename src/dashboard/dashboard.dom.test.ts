// @vitest-environment jsdom
/// <reference types="vite/client" />
//
// Boot smoke test: load the real index.html into jsdom, stub chrome + the
// Gmail provider with a fixture mailbox, import dashboard.ts (which runs
// main() on import), and assert the whole pure render chain wires up — every
// tab switches, each extracted module produced its section, and a confirm
// step opens. This is the automated stand-in for a reload-unpacked pass;
// it would have caught the managed_schema.json load break from 01cc8b6.
import { beforeAll, describe, expect, it, vi } from "vitest";
import rawIndexHtml from "./index.html?raw";

vi.mock("../lib/providers/gmailProvider", () => {
  const DAY = 86_400_000;
  const now = Date.now();
  const base = {
    provider: "gmail" as const,
    replyToAddress: "",
    isProtected: false,
    unread: true,
    sizeBytes: 4096,
    unsubscribe: {} as { postUrl?: string },
    authenticationResults: undefined as string | undefined,
  };
  const FIXTURE = [
    {
      ...base,
      id: "m1",
      fromAddress: "deals@shop.example",
      fromDisplayName: "Shop",
      subject: "Big sale inside",
      receivedAt: now - 3 * DAY,
      unsubscribe: { postUrl: "https://shop.example/u" },
    },
    {
      ...base,
      id: "m2",
      fromAddress: "deals@shop.example",
      fromDisplayName: "Shop",
      subject: "Even more deals",
      receivedAt: now - 5 * DAY,
      unsubscribe: { postUrl: "https://shop.example/u" },
    },
    {
      ...base,
      id: "m3",
      fromAddress: "code@auth.example",
      fromDisplayName: "Auth",
      subject: "Your verification code is 123456",
      receivedAt: now - 6 * DAY,
    },
    {
      ...base,
      id: "m4",
      fromAddress: "paypal-help@gmail.com",
      fromDisplayName: "PayPal Support",
      subject: "Account notice",
      receivedAt: now - 1 * DAY,
    },
  ];
  const ok = () => Promise.resolve();
  return {
    gmailProvider: {
      id: "gmail",
      isConnected: () => Promise.resolve(true),
      getAuthToken: () => Promise.resolve("gmail-token"),
      listCandidateMessages: () =>
        Promise.resolve(FIXTURE.map((m) => ({ id: m.id, provider: "gmail" as const }))),
      getMessageMetadata: (_t: string, id: string) => Promise.resolve(FIXTURE.find((m) => m.id === id)),
      trashMessages: ok,
      untrashMessages: ok,
      archiveMessages: ok,
      unarchiveMessages: ok,
      markReadMessages: ok,
      keepSorted: ok,
      snoozeMessages: ok,
      resurfaceMessages: ok,
      muteSender: ok,
      unmuteSender: ok,
      labelMessages: ok,
      unlabelMessages: ok,
      labelSuspicious: ok,
      unlabelSuspicious: ok,
    },
  };
});

function fakeArea(seed: Record<string, unknown> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    get: async (keys?: string | string[] | null) => {
      const list = keys == null ? [...store.keys()] : Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) if (store.has(k)) out[k] = store.get(k);
      return out;
    },
    set: async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
    },
    remove: async (keys: string | string[]) => {
      for (const k of (Array.isArray(keys) ? keys : [keys])) store.delete(k);
    },
    setAccessLevel: async () => {},
  };
}

const BODY = rawIndexHtml
  .replace(/^[\s\S]*?<body>/, "")
  .replace(/<\/body>[\s\S]*$/, "")
  .replace(/<script[\s\S]*?<\/script>/g, "");

beforeAll(async () => {
  document.body.innerHTML = BODY;
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local: fakeArea(), session: fakeArea(), managed: fakeArea() },
    identity: {
      getAuthToken: (_o: unknown, cb: (t: string) => void) => cb("t"),
      removeCachedAuthToken: (_d: unknown, cb: () => void) => cb(),
    },
    runtime: {},
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    permissions: { contains: async () => false, request: async () => false },
  };

  await import("./dashboard");

  // main() kicked off on import; wait for scanAndRender() to finish (it hides
  // #status on success; the top-level catch would leave it visible with an
  // error message).
  await vi.waitFor(
    () => {
      const status = document.getElementById("status") as HTMLElement;
      expect(status.hidden, `#status still shows: "${status.textContent}"`).toBe(true);
    },
    { timeout: 5000, interval: 25 },
  );
});

describe("dashboard boot smoke", () => {
  it("renders the overview headline from the fixture scan", () => {
    expect(document.getElementById("overview-headline")!.textContent).toMatch(/Scanned \d+ sender/);
  });

  it("builds the sender table with rows", () => {
    const groups = document.getElementById("sender-groups") as HTMLElement;
    expect(groups.hidden).toBe(false);
    expect(groups.querySelectorAll("tr").length).toBeGreaterThan(0);
  });

  it("flags the free-mail brand claim in the Security tab", () => {
    const items = document.querySelectorAll("#security-sender-list li");
    expect(items.length).toBeGreaterThan(0);
    expect(Array.from(items).map((li) => li.textContent).join(" ").toLowerCase()).toContain("paypal");
  });

  it("lists the unsubscribe-capable sender in the Subscriptions tab", () => {
    expect(document.getElementById("subscriptions-list")!.textContent).toContain("shop.example");
  });

  it("shows the empty Recently-done state", () => {
    expect(document.getElementById("recent-list")!.textContent).toContain("Nothing done yet");
  });

  it("switches to every tab, showing exactly one panel", () => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("#tabs button[data-tab]"),
    );
    expect(buttons.length).toBe(7);
    for (const button of buttons) {
      button.click();
      const shown = Array.from(
        document.querySelectorAll<HTMLElement>("section.tab-panel[data-tab]"),
      ).filter((panel) => !panel.hidden);
      expect(shown).toHaveLength(1);
      expect(shown[0].dataset.tab).toBe(button.dataset.tab);
    }
  });

  it("opens a confirm step from a sender-row action", () => {
    document.querySelector<HTMLButtonElement>('#tabs button[data-tab="cleanup"]')!.click();
    const muteBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>("#sender-groups button"),
    ).find((b) => b.textContent === "Mute");
    expect(muteBtn, "no Mute button rendered in the sender table").toBeTruthy();
    const cell = muteBtn!.closest("td")!;
    muteBtn!.click();
    // renderConfirmStep clears the cell and swaps in a summary + Confirm/Cancel.
    expect(cell.textContent).toContain("Hide all mail from");
    expect(Array.from(cell.querySelectorAll("button")).map((b) => b.textContent)).toEqual(
      expect.arrayContaining(["Confirm", "Cancel"]),
    );
  });
});
