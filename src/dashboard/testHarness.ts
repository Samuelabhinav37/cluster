// Test-only helper (imported solely by *.dom.test.ts, tree-shaken from the
// build). Boots a real dashboard into jsdom with spy providers so tests can
// drive click-throughs and assert the three things that matter: the provider
// call, the stored-settings mutation, and the Recently-done entry + undo.
//
// Each bootDashboard() resets the module registry and re-imports dashboard.ts,
// so tests get isolated module state (state.ts's ctx, event listeners, etc.).
import { vi } from "vitest";
import rawIndexHtml from "./index.html?raw";
import type { EmailProvider, NormalizedMessageMetadata } from "../lib/providers/emailProvider";
import { CURRENT_SETTINGS_SCHEMA_VERSION, type ClusterSettings } from "../lib/settingsStore";

const DAY = 86_400_000;

export interface FixtureMessage extends NormalizedMessageMetadata {
  /** Convenience: the sender key this message rolls up to. */
  senderKey?: string;
}

/** A broad default mailbox: two domain categories, an unsubscribe-capable
 * sender, a starred (protected) sender, a first-contact sender, a free-mail
 * brand-claim sender for Security, an aged OTP for expiry, a big+old message
 * for Smart Views, and an Outlook-tagged sender. */
export function fixtureMailbox(now = Date.now()): NormalizedMessageMetadata[] {
  const base = {
    provider: "gmail" as const,
    replyToAddress: "",
    isProtected: false,
    unread: true,
    sizeBytes: 4096,
    unsubscribe: {} as { postUrl?: string; httpUrl?: string; mailto?: string },
    authenticationResults: undefined as string | undefined,
  };
  return [
    // shopping domain, unsubscribe-capable, all unread -> cleanup + subscriptions
    { ...base, id: "s1", fromAddress: "deals@shop.example", fromDisplayName: "Shop",
      subject: "Big sale inside", receivedAt: now - 3 * DAY,
      unsubscribe: { postUrl: "https://shop.example/u" } },
    { ...base, id: "s2", fromAddress: "deals@shop.example", fromDisplayName: "Shop",
      subject: "Even more deals", receivedAt: now - 5 * DAY,
      unsubscribe: { postUrl: "https://shop.example/u" } },
    { ...base, id: "s3", fromAddress: "deals@shop.example", fromDisplayName: "Shop",
      subject: "Last chance", receivedAt: now - 9 * DAY,
      unsubscribe: { postUrl: "https://shop.example/u" } },
    // finance domain sender
    { ...base, id: "f1", fromAddress: "statements@chase.com", fromDisplayName: "Chase",
      subject: "Your statement is ready", receivedAt: now - 10 * DAY, unread: false },
    { ...base, id: "f2", fromAddress: "statements@chase.com", fromDisplayName: "Chase",
      subject: "Statement", receivedAt: now - 40 * DAY, unread: false },
    // starred sender -> excluded from destructive actions
    { ...base, id: "p1", fromAddress: "family@personal.example", fromDisplayName: "A Person",
      subject: "photos", receivedAt: now - 2 * DAY, isProtected: true },
    { ...base, id: "p2", fromAddress: "family@personal.example", fromDisplayName: "A Person",
      subject: "re: photos", receivedAt: now - 4 * DAY },
    // aged OTP -> expiry bucket
    { ...base, id: "o1", fromAddress: "code@auth.example", fromDisplayName: "Auth",
      subject: "Your verification code is 123456", receivedAt: now - 6 * DAY },
    // big + old -> smart views (large, older-than-1y)
    { ...base, id: "b1", fromAddress: "reports@bigmail.example", fromDisplayName: "Reports",
      subject: "Q3 report", sizeBytes: 5_000_000, receivedAt: now - 400 * DAY },
    // free-mail brand claim -> Security tab
    { ...base, id: "x1", fromAddress: "paypal-help@gmail.com", fromDisplayName: "PayPal Support",
      subject: "Account notice", receivedAt: now - 1 * DAY },
  ];
}

type Spy = ReturnType<typeof vi.fn>;
export interface GmailSpy extends EmailProvider {
  [k: string]: unknown;
}

/** Every EmailProvider method as a vi.fn with a benign default. Override any of
 * them via `overrides`. `listCandidateMessages` / `getMessageMetadata` are
 * wired to `mailbox`. */
export function makeGmailSpy(
  mailbox: NormalizedMessageMetadata[] = fixtureMailbox(),
  overrides: Partial<Record<string, unknown>> = {},
): GmailSpy {
  const ok: Spy = vi.fn(async () => {});
  const spy: Record<string, unknown> = {
    id: "gmail",
    isConnected: vi.fn(async () => true),
    getAuthToken: vi.fn(async () => "gmail-token"),
    listCandidateMessages: vi.fn(async () =>
      mailbox.map((m) => ({ id: m.id, provider: "gmail" as const })),
    ),
    getMessageMetadata: vi.fn(async (_t: string, id: string) => mailbox.find((m) => m.id === id)),
    trashMessages: vi.fn(async () => {}),
    untrashMessages: vi.fn(async () => {}),
    archiveMessages: vi.fn(async () => {}),
    unarchiveMessages: vi.fn(async () => {}),
    markReadMessages: vi.fn(async () => {}),
    labelMessages: vi.fn(async () => {}),
    unlabelMessages: vi.fn(async () => {}),
    keepSorted: vi.fn(async () => {}),
    muteSender: vi.fn(async () => {}),
    unmuteSender: vi.fn(async () => {}),
    screenSender: vi.fn(async () => {}),
    allowSenderThrough: vi.fn(async () => {}),
    listSentCorrespondents: vi.fn(async () => []),
    snoozeMessages: vi.fn(async () => {}),
    resurfaceMessages: vi.fn(async () => {}),
    labelSuspicious: vi.fn(async () => {}),
    unlabelSuspicious: vi.fn(async () => {}),
    permanentlyDeleteMessages: vi.fn(async () => {}),
    ...overrides,
  };
  void ok;
  return spy as unknown as GmailSpy;
}

export function makeOutlookSpy(overrides: Partial<Record<string, unknown>> = {}): GmailSpy {
  return {
    id: "outlook",
    isConnected: vi.fn(async () => false),
    getAuthToken: vi.fn(async () => "outlook-token"),
    listCandidateMessages: vi.fn(async () => []),
    getMessageMetadata: vi.fn(async () => undefined),
    trashMessages: vi.fn(async () => {}),
    ...overrides,
  } as unknown as GmailSpy;
}

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
      for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
    },
    setAccessLevel: async () => {},
    _store: store,
  };
}

const BODY = rawIndexHtml
  .replace(/^[\s\S]*?<body>/, "")
  .replace(/<\/body>[\s\S]*$/, "")
  .replace(/<script[\s\S]*?<\/script>/g, "");

export interface BootOptions {
  settings?: Partial<ClusterSettings>;
  mailbox?: NormalizedMessageMetadata[];
  gmail?: GmailSpy;
  outlook?: GmailSpy;
  /** Make the incremental filter-scope consent screen come back denied. */
  denyFilterScope?: boolean;
  /** Stub global fetch (e.g. for the one-click unsubscribe POST). */
  fetchImpl?: typeof fetch;
  /** chrome.permissions.contains/request resolve true (the per-origin grant
   * the one-click unsubscribe needs). Default false. */
  grantOrigins?: boolean;
  online?: boolean;
}

export interface BootedDashboard {
  gmail: GmailSpy;
  outlook: GmailSpy;
  /** Read the persisted settings object as the dashboard last wrote it. */
  storedSettings: () => ClusterSettings;
  /** Re-read #status text. */
  status: () => string;
  /** Click a top-nav tab by its data-tab id. */
  showTab: (tab: string) => void;
  el: (id: string) => HTMLElement;
  /** All <button>s under a container id whose text matches. */
  button: (containerId: string, text: string | RegExp) => HTMLButtonElement | undefined;
}

/** Boot a fresh dashboard. Safe to call once per test. */
export async function bootDashboard(opts: BootOptions = {}): Promise<BootedDashboard> {
  vi.resetModules();
  vi.unstubAllGlobals();

  const mailbox = opts.mailbox ?? fixtureMailbox();
  const gmail = opts.gmail ?? makeGmailSpy(mailbox);
  const outlook = opts.outlook ?? makeOutlookSpy();

  // Seed a partial settings object stamped with the current schema version so
  // no migration runs over it (the 2->3 migration, for one, blanks
  // senderEngagement). settingsStore merges it over its defaults on read, so
  // main()'s first getSettings() already sees these fields.
  const local = fakeArea(
    opts.settings
      ? { clusterSettings: { schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION, ...opts.settings } }
      : {},
  );

  const chromeStub = {
    storage: { local, session: fakeArea(), managed: fakeArea() },
    identity: {
      getAuthToken: (o: { scopes?: string[] }, cb: (t?: string) => void) => {
        if (opts.denyFilterScope && o?.scopes?.some((s) => s.includes("settings.basic"))) {
          (chromeStub.runtime as { lastError?: unknown }).lastError = { message: "denied" };
          cb(undefined);
          (chromeStub.runtime as { lastError?: unknown }).lastError = undefined;
          return;
        }
        cb("token");
      },
      removeCachedAuthToken: (_d: unknown, cb: () => void) => cb(),
    },
    runtime: { lastError: undefined as unknown, getURL: (p: string) => p, id: "test" },
    action: { setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: vi.fn(async () => {}) },
    permissions: {
      contains: async () => Boolean(opts.grantOrigins),
      request: async () => Boolean(opts.grantOrigins),
    },
    tabs: { query: async () => [], create: () => {}, update: () => {} },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
  };
  vi.stubGlobal("chrome", chromeStub);
  vi.stubGlobal("fetch", opts.fetchImpl ?? vi.fn(async () => new Response("{}", { status: 200 })));

  if (!("scrollIntoView" in Element.prototype)) {
    (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
  }
  Object.defineProperty(globalThis.navigator, "onLine", {
    configurable: true,
    value: opts.online ?? true,
  });

  document.body.innerHTML = BODY;

  vi.doMock("../lib/providers/gmailProvider", () => ({ gmailProvider: gmail }));
  vi.doMock("../lib/providers/outlookProvider", async () => {
    const actual = (await vi.importActual("../lib/providers/outlookProvider")) as Record<
      string,
      unknown
    >;
    return {
      ...actual,
      outlookProvider: outlook,
      createInboxRule: vi.fn(async () => "rule-id"),
      deleteInboxRule: vi.fn(async () => {}),
      getArchiveFolderId: vi.fn(async () => null),
    };
  });
  vi.doMock("../lib/gmailApi", async () => {
    const actual = (await vi.importActual("../lib/gmailApi")) as Record<string, unknown>;
    return {
      ...actual,
      listFilters: vi.fn(async () => []),
      listLabelNames: vi.fn(async () => []),
      getOrCreateLabel: vi.fn(async () => "label-id"),
      createFilter: vi.fn(async () => "filter-id"),
      deleteFilter: vi.fn(async () => {}),
    };
  });

  await import("./dashboard");

  await vi.waitFor(
    () => {
      const status = document.getElementById("status") as HTMLElement;
      if (!status.hidden) throw new Error(`#status still visible: "${status.textContent}"`);
    },
    { timeout: 5000, interval: 20 },
  );

  const el = (id: string) => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`no #${id}`);
    return node;
  };

  return {
    gmail,
    outlook,
    storedSettings: () =>
      (local._store.get("clusterSettings") ?? {}) as ClusterSettings,
    status: () => el("status").textContent ?? "",
    showTab: (tab: string) => {
      const btn = document.querySelector<HTMLButtonElement>(`#tabs button[data-tab="${tab}"]`);
      if (!btn) throw new Error(`no tab button for "${tab}"`);
      btn.click();
    },
    el,
    button: (containerId, text) =>
      Array.from(el(containerId).querySelectorAll("button")).find((b) =>
        typeof text === "string" ? b.textContent?.trim() === text : text.test(b.textContent ?? ""),
      ),
  };
}

/** Click a renderConfirmStep's Confirm button and wait for its async onConfirm
 * to resolve. renderConfirmStep puts the prompt in a leading <span> and
 * overwrites that span's text with the result (or an error) when done, so we
 * wait for that text to change. Returns the container's text after. */
export async function confirmStep(container: HTMLElement): Promise<string> {
  const confirm = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === "Confirm",
  );
  if (!confirm) throw new Error("no Confirm button in container");
  const summary = container.querySelector("span");
  const before = summary?.textContent ?? container.textContent ?? "";
  confirm.click();
  await vi.waitFor(
    () => {
      const now = summary?.textContent ?? container.textContent ?? "";
      if (now === before || now.includes("…")) throw new Error("confirm step still running");
    },
    { timeout: 3000, interval: 10 },
  );
  return container.textContent ?? "";
}
