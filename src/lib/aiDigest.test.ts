import { describe, expect, it } from "vitest";
import { buildDigestInput } from "./aiDigest";
import type { ExpiryBucket } from "./expiryTriage";
import type { SenderSummary } from "./senderModel";

function makeSender(overrides: Partial<SenderSummary> & { address: string }): SenderSummary {
  return {
    key: `gmail:${overrides.address}`,
    provider: "gmail",
    displayName: "",
    count: 1,
    messageIds: [],
    protectedMessageIds: [],
    unsubscribe: {},
    messages: [],
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
    ...overrides,
  };
}

function makeBucket(overrides: Partial<ExpiryBucket> & { count: number }): ExpiryBucket {
  return {
    kind: "otp",
    label: "One-time codes",
    retentionDays: 2,
    messageIdsByProvider: new Map(),
    ...overrides,
  };
}

describe("buildDigestInput", () => {
  it("groups senders by category with message and sender counts, sorted by volume", () => {
    const senders = [
      makeSender({ address: "a@amazon.com", count: 10 }),
      makeSender({ address: "b@ebay.com", count: 5 }),
      makeSender({ address: "c@facebook.com", count: 1 }),
    ];
    const input = buildDigestInput(senders, []);
    expect(input).toContain("Shopping: 15 messages from 2 senders");
    expect(input).toContain("Social: 1 messages from 1 senders");
    expect(input.indexOf("Shopping")).toBeLessThan(input.indexOf("Social"));
  });

  it("lists the top 5 senders by count, descending", () => {
    const senders = Array.from({ length: 7 }, (_, i) =>
      makeSender({ address: `s${i}@x.com`, displayName: `Sender ${i}`, count: i + 1 }),
    );
    const input = buildDigestInput(senders, []);
    expect(input).toContain("Top senders by volume: Sender 6 (7), Sender 5 (6), Sender 4 (5), Sender 3 (4), Sender 2 (3)");
  });

  it("reports no expiry line when nothing is ready to clean up", () => {
    const input = buildDigestInput([], []);
    expect(input).toContain("Nothing flagged as ready to clean up.");
  });

  it("summarizes non-zero expiry buckets and skips zero-count ones", () => {
    const buckets = [
      makeBucket({ kind: "otp", label: "One-time codes", retentionDays: 2, count: 5 }),
      makeBucket({ kind: "shipping", label: "Shipping updates", retentionDays: 30, count: 0 }),
    ];
    const input = buildDigestInput([], buckets);
    expect(input).toContain("Ready to clean up: 5 one-time codes, 2+ days old.");
    expect(input).not.toContain("shipping updates");
  });

  it("never includes message subjects or ids, only aggregate counts and labels", () => {
    const senders = [makeSender({ address: "a@x.com", count: 3, messageIds: ["secret-subject-leak-id"] })];
    const input = buildDigestInput(senders, []);
    expect(input).not.toContain("secret-subject-leak-id");
  });
});
