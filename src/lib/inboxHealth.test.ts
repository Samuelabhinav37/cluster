import { describe, expect, it } from "vitest";
import {
  buildInboxHealth,
  inboxHealthScore,
  isoWeek,
  recordHealthSnapshot,
} from "./inboxHealth";
import type { MessageRecord, SenderSummary } from "./senderModel";
import type { ClusterSettings, HealthSnapshot } from "./settingsStore";

function msg(over: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: Math.random().toString(36).slice(2),
    receivedAt: Date.now(),
    kind: "other",
    isProtected: false,
    unread: true,
    sizeBytes: 0,
    providerMarkedPersonal: false,
    looksAutomated: false,
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

describe("inboxHealthScore", () => {
  it("is 100 for an all-read inbox with no cruft", () => {
    const senders = [sender({ messages: [msg({ unread: false }), msg({ unread: false })] })];
    expect(inboxHealthScore(senders)).toBe(100);
  });

  it("drops as the unread ratio climbs", () => {
    const allRead = [sender({ messages: [msg({ unread: false }), msg({ unread: false })] })];
    const allUnread = [sender({ messages: [msg({ unread: true }), msg({ unread: true })] })];
    expect(inboxHealthScore(allUnread)).toBeLessThan(inboxHealthScore(allRead));
  });

  it("stays within 0–100", () => {
    const noisy = Array.from({ length: 60 }, (_, i) =>
      sender({
        address: `s${i}@x.com`,
        unsubscribe: { postUrl: "https://x/u" },
        messages: [msg({ unread: true }), msg({ unread: true })],
      }),
    );
    const score = inboxHealthScore(noisy);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("handles an empty scan without dividing by zero", () => {
    expect(inboxHealthScore([])).toBe(100);
  });
});

describe("isoWeek / recordHealthSnapshot", () => {
  it("formats an ISO week label", () => {
    // 2026-09-10 is a Thursday in ISO week 37.
    expect(isoWeek(Date.UTC(2026, 8, 10))).toBe("2026-W37");
  });

  it("appends the current week and caps at 12 entries", () => {
    let history: HealthSnapshot[] = [];
    for (let w = 0; w < 20; w++) {
      history = recordHealthSnapshot(history, 50 + w, Date.UTC(2026, 0, 1) + w * 7 * 86_400_000);
    }
    expect(history).toHaveLength(12);
    expect(history[history.length - 1].score).toBe(69);
  });

  it("overwrites this week's entry instead of adding a second bar", () => {
    const now = Date.UTC(2026, 8, 10);
    const once = recordHealthSnapshot([], 60, now);
    const twice = recordHealthSnapshot(once, 72, now + 3600_000);
    expect(twice).toHaveLength(1);
    expect(twice[0].score).toBe(72);
  });

  it("does not mutate the input array", () => {
    const input: HealthSnapshot[] = [{ week: "2026-W01", score: 40 }];
    recordHealthSnapshot(input, 90, Date.UTC(2026, 8, 10));
    expect(input).toEqual([{ week: "2026-W01", score: 40 }]);
  });
});
