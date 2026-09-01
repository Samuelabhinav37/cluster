import { describe, expect, it } from "vitest";
import { buildInboxHealth } from "./inboxHealth";
import type { MessageRecord, SenderSummary } from "./senderModel";
import type { ClusterSettings } from "./settingsStore";

function msg(over: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: Math.random().toString(36).slice(2),
    receivedAt: Date.now(),
    kind: "other",
    isProtected: false,
    unread: true,
    sizeBytes: 0,
    subject: "",
    ...over,
  };
}

function sender(over: Partial<SenderSummary> = {}): SenderSummary {
  const messages = over.messages ?? [msg()];
  return {
    key: `gmail:${over.address ?? "a@x.com"}`,
    provider: "gmail",
    address: over.address ?? "a@x.com",
    displayName: over.address ?? "a@x.com",
    count: messages.length,
    messageIds: messages.map((m) => m.id),
    protectedMessageIds: [],
    unsubscribe: {},
    messages,
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
    ...over,
  };
}

function settings(over: Partial<ClusterSettings> = {}): ClusterSettings {
  return {
    snoozedMessages: {},
    screenerEnabled: false,
    screenedSenders: [],
    actionLog: [],
    ...over,
  } as ClusterSettings;
}

describe("buildInboxHealth", () => {
  it("reports the scanned totals", () => {
    const h = buildInboxHealth({
      senders: [sender({ address: "a@x.com", messages: [msg(), msg()] }), sender({ address: "b@x.com" })],
      securitySenders: [],
      settings: settings(),
    });
    expect(h.scannedSenders).toBe(2);
    expect(h.scannedMessages).toBe(3);
  });

  it("counts unsubscribe-capable senders as a neutral metric", () => {
    const h = buildInboxHealth({
      senders: [
        sender({ address: "news@x.com", unsubscribe: { postUrl: "https://x/u" } }),
        sender({ address: "plain@x.com" }),
      ],
      securitySenders: [],
      settings: settings(),
    });
    const m = h.metrics.find((x) => x.id === "unsubscribe-capable")!;
    expect(m.value).toBe(1);
    expect(m.tone).toBe("neutral");
  });

  it("marks flagged senders as attention when > 0", () => {
    const flagged = sender({
      address: "spoof@x.com",
      threatSignals: [
        { kind: "failed-authentication", confidence: "high", brand: "x.com" },
        { kind: "lookalike-domain", confidence: "high", brand: "paypal" },
      ] as SenderSummary["threatSignals"],
    });
    const h = buildInboxHealth({ senders: [], securitySenders: [flagged], settings: settings() });
    const m = h.metrics.find((x) => x.id === "flagged-senders")!;
    expect(m.value).toBe(1);
    expect(m.tone).toBe("attention");
    expect(m.tab).toBe("security");
  });

  it("only counts snoozed messages that are due, and recent non-undone actions", () => {
    const now = 1_000_000_000_000;
    const h = buildInboxHealth({
      senders: [],
      securitySenders: [],
      now,
      settings: settings({
        snoozedMessages: {
          due: { resurfaceAt: now - 1, provider: "gmail" },
          later: { resurfaceAt: now + 1_000, provider: "gmail" },
        },
        actionLog: [
          { id: "1", at: now - 1000, kind: "trash", summary: "", undone: false },
          { id: "2", at: now - 1000, kind: "trash", summary: "", undone: true },
          { id: "3", at: now - 30 * 24 * 3600 * 1000, kind: "trash", summary: "" },
        ] as ClusterSettings["actionLog"],
      }),
    });
    expect(h.metrics.find((x) => x.id === "snoozed-due")!.value).toBe(1);
    expect(h.metrics.find((x) => x.id === "done-last-7-days")!.value).toBe(1);
  });
});
