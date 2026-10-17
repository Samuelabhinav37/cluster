// @vitest-environment jsdom
//
// The unsubscribe-by-email sheet: it must show every email before anything
// is sent, send only what stays ticked, and list refused senders with their
// reason instead of sending.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnsubscribeDetails } from "../lib/providers/emailProvider";
import type { SenderSummary } from "../lib/senderModel";
import { parseListUnsubscribe } from "../lib/unsubscribe";

const sendRawMessage = vi.fn(async () => ({ id: "sent-1", labelIds: ["SENT"] }));
vi.mock("../lib/gmailApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/gmailApi")>()),
  getAuthToken: async () => "t",
  listSendAs: async () => [{ address: "me@gmail.com", isPrimary: true }],
  sendRawMessage,
  hasRecentSentTo: async () => false,
}));

const details = new Map<string, UnsubscribeDetails>();
vi.mock("../lib/providers/gmailProvider", () => ({
  gmailProvider: {
    id: "gmail",
    getAuthToken: async () => "t",
    getUnsubscribeDetails: async (_t: string, id: string) => details.get(id)!,
  },
}));

const createOutlookDraft = vi.fn(async () => ({ id: "d1", webLink: "https://outlook.office.com/mail/d1" }));
vi.mock("../lib/providers/outlookProvider", () => ({
  outlookProvider: {
    id: "outlook",
    getAuthToken: async () => "t",
    getUnsubscribeDetails: async (_t: string, id: string) => details.get(id)!,
  },
  outlookAccountAddresses: async () => ["me@outlook.com"],
  createOutlookDraft,
}));

const recordUnsubscribeRequests = vi.fn(async () => {});
vi.mock("./unsubscribeRecord", () => ({ recordUnsubscribeRequests }));
vi.mock("./state", () => ({ logAction: vi.fn(async () => {}) }));

const { openUnsubscribeSheet } = await import("./unsubscribeSheet");

const AR = (d: string) => `mx.google.com; dkim=pass header.i=@${d}; spf=pass smtp.mailfrom=${d}; dmarc=pass header.from=${d}`;

function sender(
  address: string,
  messageId: string,
  header: string,
  over: Partial<UnsubscribeDetails> = {},
  provider: "gmail" | "outlook" = "gmail",
) {
  const domain = address.split("@")[1];
  details.set(messageId, {
    messageId,
    fromAddress: address,
    inSpam: false,
    unsubscribe: parseListUnsubscribe(header, undefined),
    dkimSignatures: [`v=1; d=${domain}; h=from:list-unsubscribe; b=x`],
    authenticationResults: [AR(domain)],
    deliveredTo: ["me@gmail.com"],
    ...over,
  });
  return {
    key: `${provider}:${address}`,
    provider,
    address,
    displayName: address.split("@")[0],
    count: 1,
    messageIds: [messageId],
    protectedMessageIds: [],
    unsubscribe: parseListUnsubscribe(header, undefined),
    messages: [{ id: messageId, receivedAt: 1, kind: "newsletter", isProtected: false, unread: true, sizeBytes: 1, providerMarkedPersonal: false, looksAutomated: true }],
    threatSignals: [],
    authVerdicts: { spf: "pass", dkim: "pass", dmarc: "pass" },
    firstContact: false,
  } as SenderSummary;
}

function fakeStorage() {
  let store: Record<string, unknown> = {};
  return {
    async get(key: string) {
      return key in store ? { [key]: structuredClone(store[key]) } : {};
    },
    async set(items: Record<string, unknown>) {
      store = { ...store, ...structuredClone(items) };
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  details.clear();
  sendRawMessage.mockClear();
  recordUnsubscribeRequests.mockClear();
  vi.stubGlobal("chrome", { storage: { local: fakeStorage() } });
});

const sheet = () => document.querySelector(".unsub-sheet") as HTMLElement;

describe("unsubscribe sheet", () => {
  it("shows the full email first, then sends only on Send", async () => {
    const news = sender("news@shop.example", "m1", "<mailto:leave@shop.example?subject=remove%20me>");
    const spam = sender("x@spam.example", "m2", "<mailto:u@spam.example>, <https://spam.example/u>", { inSpam: true });
    await openUnsubscribeSheet([news, spam]);

    await vi.waitFor(() => expect(sheet().textContent).toContain("They will show in Sent."));
    const text = sheet().textContent!;
    expect(text).toContain("me@gmail.com");
    expect(text).toContain("leave@shop.example");
    expect(text).toContain("remove me");
    expect(text).toContain("Needs you");
    expect(text).toContain("It's in Spam.");
    expect(sendRawMessage).not.toHaveBeenCalled();

    const send = Array.from(sheet().querySelectorAll("button")).find((b) => b.textContent === "Send 1 email")!;
    send.click();
    await vi.waitFor(() => expect(sheet().textContent).toContain("Sent 1."));
    expect(sendRawMessage).toHaveBeenCalledTimes(1);
    expect(recordUnsubscribeRequests).toHaveBeenCalledWith([news], "mailto", {
      "gmail:news@shop.example": {
        from: "me@gmail.com",
        to: "leave@shop.example",
        sentMessageId: "sent-1",
        sentThreadId: undefined,
      },
    });
  });

  it("sends nothing that was unticked", async () => {
    await openUnsubscribeSheet([sender("news@shop.example", "m1", "<mailto:leave@shop.example>")]);
    await vi.waitFor(() => expect(sheet().querySelector("input[type=checkbox]")).not.toBeNull());
    const box = sheet().querySelector("input[type=checkbox]") as HTMLInputElement;
    box.click();
    const send = Array.from(sheet().querySelectorAll("button")).find((b) => b.textContent?.startsWith("Send"))!;
    expect(send.disabled).toBe(true);
    expect(sendRawMessage).not.toHaveBeenCalled();
  });

  it("saves Outlook requests as drafts and never sends them", async () => {
    const outlook = sender("news@shop.example", "o1", "<mailto:leave@shop.example>", {
      authenticationResults: [
        "outlook.com; dkim=pass header.d=shop.example; spf=pass smtp.mailfrom=shop.example; dmarc=pass header.from=shop.example",
      ],
      deliveredTo: ["me@outlook.com"],
    }, "outlook");
    await openUnsubscribeSheet([outlook]);
    await vi.waitFor(() => expect(sheet().textContent).toContain("drafts in Outlook"));
    const save = Array.from(sheet().querySelectorAll("button")).find((b) => b.textContent === "Save 1 draft")!;
    save.click();
    await vi.waitFor(() => expect(sheet().textContent).toContain("Open in Outlook"));
    expect(createOutlookDraft).toHaveBeenCalledWith("t", {
      from: "me@outlook.com",
      to: "leave@shop.example",
      subject: "unsubscribe",
      body: "",
    });
    expect(sendRawMessage).not.toHaveBeenCalled();
  });
});
