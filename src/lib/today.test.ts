import { describe, expect, it } from "vitest";
import type { MessageKind } from "./messageKind";
import type { MessageRecord, SenderSummary } from "./senderModel";
import type { ThreatSignal } from "./threatSignals";
import { fillToday, pickToday, todayEmailDue, todayEmailMessage } from "./today";

const NOW = Date.UTC(2026, 10, 3, 12);
const HOUR = 3600_000;

function msg(id: string, kind: MessageKind = "other", extra: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id,
    receivedAt: NOW - HOUR,
    kind,
    isProtected: false,
    unread: true,
    sizeBytes: 0,
    subject: "",
    providerMarkedPersonal: false,
    looksAutomated: true,
    ...extra,
  };
}

function sender(address: string, messages: MessageRecord[], threatSignals: ThreatSignal[] = []): SenderSummary {
  return {
    key: `gmail:${address}`,
    provider: "gmail",
    address,
    displayName: address,
    count: messages.length,
    messageIds: messages.map((m) => m.id),
    protectedMessageIds: [],
    unsubscribe: {},
    messages,
    threatSignals,
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
  };
}

describe("pickToday", () => {
  const senders = [
    sender("deals@shop.example", [msg("promo", "other", { promotion: true, subject: "50% off" })]),
    sender("mom@gmail.com", [msg("mom", "other", { looksAutomated: false, subject: "Dinner?" })]),
    sender("alerts@hdfcbank.net", [msg("bank", "other", { subject: "Transaction on your card" })]),
    sender("no-reply@accounts.google.com", [msg("alert", "other", { subject: "Security alert" })]),
    sender("ship@amazon.in", [msg("ship", "shipping", { subject: "Out for delivery: 2 items" })]),
    sender("boss@work.example", [msg("old", "other", { receivedAt: NOW - 30 * HOUR })]),
    sender("x@work.example", [msg("star", "other", { isProtected: true, receivedAt: NOW - 5 * HOUR })]),
  ];

  it("keeps people, starred, alerts and today's deliveries from the last day, starred first", () => {
    const ids = pickToday(senders, new Set(["boss@work.example"]), NOW).map((t) => t.id);
    expect(ids).toEqual(["star", "mom", "bank", "alert", "ship"]);
  });

  it("leaves likely scams to Protect, and caps the list", () => {
    const fake = sender("paypal@gmail.com", [msg("fake", "other", { looksAutomated: false })], [
      { kind: "freemail-brand-claim", brand: "paypal", confidence: "high" } as ThreatSignal,
      { kind: "lure-language", confidence: "high" } as ThreatSignal,
    ]);
    expect(pickToday([fake], new Set(), NOW).map((t) => t.id)).not.toContain("fake");
    expect(pickToday(senders, new Set(), NOW, 2)).toHaveLength(2);
  });
});

describe("Today by email", () => {
  const morning = new Date(2026, 10, 3, 8).getTime();
  it("is due once a day from 7 in the morning, only when on", () => {
    expect(todayEmailDue({ todayEmail: true, lastTodayEmail: 0 }, morning)).toBe(true);
    expect(todayEmailDue({ todayEmail: false, lastTodayEmail: 0 }, morning)).toBe(false);
    expect(todayEmailDue({ todayEmail: true, lastTodayEmail: morning - HOUR }, morning)).toBe(false);
    expect(todayEmailDue({ todayEmail: true, lastTodayEmail: 0 }, new Date(2026, 10, 3, 6).getTime())).toBe(false);
  });

  it("builds a plain email to yourself with one Gmail link per item", () => {
    const raw = todayEmailMessage(
      [{ id: "abc", provider: "gmail", address: "mom@gmail.com", name: "Mom", subject: "Dinner?", receivedAt: morning, reason: "person" }],
      "me@gmail.com",
      morning,
    );
    expect(raw).toMatch(/^From: Cluster <me@gmail.com>\r\nTo: me@gmail.com\r\n/);
    expect(raw).toContain("From a person: Mom\r\nDinner?\r\nhttps://mail.google.com/mail/u/0/#all/abc");
    expect(raw).not.toMatch(/[^\r]\n/);
  });
});

describe("fillToday", () => {
  it("tops up with the newest other mail from the last day, skipping promotions and old mail", () => {
    const senders = [
      sender("a@x.com", [msg("new", "other", { receivedAt: NOW - HOUR }), msg("promo", "other", { promotion: true }), msg("old", "other", { receivedAt: NOW - 30 * HOUR })]),
      sender("b@x.com", [msg("newer", "other", { receivedAt: NOW - 60_000 })]),
    ];
    const got = fillToday([], senders, NOW, 5).map((t) => t.id);
    expect(got).toEqual(["newer", "new"]);
  });
});
