import { describe, expect, it } from "vitest";
import { buildSortPlan, totalPlanCount } from "./autoSort";
import type { MessageRecord, SenderSummary } from "./senderModel";
import type { MessageKind } from "./messageKind";

function msg(id: string, kind: MessageKind, isProtected = false, subject = ""): MessageRecord {
  return { id, receivedAt: Date.now(), kind, isProtected, unread: true, sizeBytes: 0, subject };
}

function sender(address: string, provider: "gmail" | "outlook", messages: MessageRecord[]): SenderSummary {
  return {
    key: `${provider}:${address}`,
    provider,
    address,
    displayName: address,
    count: messages.length,
    messageIds: messages.map((m) => m.id),
    protectedMessageIds: messages.filter((m) => m.isProtected).map((m) => m.id),
    unsubscribe: {},
    messages,
    threatSignals: [],
    authVerdicts: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    firstContact: false,
  };
}

describe("buildSortPlan", () => {
  it("buckets by kind then by domain category, biggest bucket first", () => {
    const plan = buildSortPlan([
      sender("orders@amazon.com", "gmail", [msg("a", "shipping"), msg("b", "other"), msg("c", "other")]),
      sender("code@auth.example", "gmail", [msg("d", "otp")]),
    ]);
    // amazon.com: 1 shipping (kind) + 2 shopping (domain fallback); auth.example: 1 otp
    expect(plan.map((e) => [e.bucket, e.count])).toEqual([
      ["shopping", 2],
      ["shipping", 1],
      ["otp", 1],
    ]);
  });

  it("excludes starred/flagged messages", () => {
    const plan = buildSortPlan([
      sender("code@auth.example", "gmail", [msg("d", "otp"), msg("e", "otp", true)]),
    ]);
    expect(plan).toEqual([
      expect.objectContaining({ bucket: "otp", count: 1, idsByProvider: new Map([["gmail", ["d"]]]) }),
    ]);
  });

  it("groups ids by provider", () => {
    const plan = buildSortPlan([
      sender("a@chase.com", "gmail", [msg("g1", "other")]),
      sender("b@chase.com", "outlook", [msg("o1", "other")]),
    ]);
    expect(plan[0].bucket).toBe("finance");
    expect(plan[0].idsByProvider).toEqual(new Map([["gmail", ["g1"]], ["outlook", ["o1"]]]));
  });

  it("applies a per-bucket fileOut override", () => {
    const plan = buildSortPlan([sender("code@auth.example", "gmail", [msg("d", "otp")])], { otp: false });
    expect(plan[0].fileOut).toBe(false);
  });

  it("skips messages that fall in no bucket", () => {
    const plan = buildSortPlan([sender("hi@nowhere.example", "gmail", [msg("x", "other")])]);
    expect(plan).toEqual([]);
    expect(totalPlanCount(plan)).toBe(0);
  });

  it("carries per-message detail for the preview", () => {
    const plan = buildSortPlan([
      sender("news@substack.com", "gmail", [msg("m1", "newsletter", false, "Weekly digest")]),
    ]);
    expect(plan[0].messages).toEqual([
      expect.objectContaining({
        id: "m1",
        provider: "gmail",
        address: "news@substack.com",
        subject: "Weekly digest",
        sensitiveWhenFiled: false,
      }),
    ]);
  });

  it("flags a sensitive-looking subject for filed-out buckets", () => {
    const plan = buildSortPlan([
      sender("alerts@bank.example", "gmail", [msg("m1", "newsletter", false, "Security alert on your account")]),
    ]);
    expect(plan[0].messages[0].sensitiveWhenFiled).toBe(true);
  });

  it("honours a 'never' override", () => {
    const plan = buildSortPlan(
      [sender("orders@amazon.com", "gmail", [msg("a", "shipping")])],
      {},
      { "orders@amazon.com": "never" },
    );
    expect(plan).toEqual([]);
  });

  it("honours a bucket override that redirects a sender", () => {
    const plan = buildSortPlan(
      [sender("hello@unknown.example", "gmail", [msg("a", "newsletter")])],
      {},
      { "hello@unknown.example": "finance" },
    );
    expect(plan.map((e) => e.bucket)).toEqual(["finance"]);
  });
});
