// Seam / contract test: run the whole pure pipeline the dashboard depends on
// against one fixture mailbox, through mock providers, with no network. The
// per-module unit tests each check one function; this catches the class of
// regression they miss -- a field rename or shape change in senderModel that
// silently breaks a downstream consumer (expiry, spam, sort, smart views,
// rules, first-contact).
import { describe, expect, it, vi } from "vitest";
import { buildSenderSummaries } from "./senderModel";
import { buildExpiryBuckets, totalExpiryCount } from "./expiryTriage";
import { suggestSpamSenders } from "./spamSuggestions";
import { buildSortPlan, totalPlanCount } from "./autoSort";
import { neverReadSenders } from "./neverRead";
import { SMART_VIEWS, evaluateSmartView } from "./smartViews";
import { previewRuleMatches } from "./ruleRunner";
import { markFirstContact } from "./firstContact";
import type { ClusterRule } from "./rules";
import type { EmailProvider, NormalizedMessageMetadata } from "./providers/emailProvider";

const DAY = 24 * 60 * 60 * 1000;

function meta(over: Partial<NormalizedMessageMetadata> & { id: string }): NormalizedMessageMetadata {
  return {
    provider: "gmail",
    fromAddress: "hello@newsletter.example",
    fromDisplayName: "A Newsletter",
    replyToAddress: "",
    subject: "This week's digest",
    isProtected: false,
    unread: true,
    sizeBytes: 12_000,
    unsubscribe: { postUrl: "https://newsletter.example/u" },
    receivedAt: Date.now() - 10 * DAY,
    ...over,
  };
}

const FIXTURE: NormalizedMessageMetadata[] = [
  // amazon.com — shopping domain; one shipping-kind, two plain → sort: shipping + shopping
  meta({ id: "1", fromAddress: "ship@amazon.com", fromDisplayName: "Amazon", subject: "Your order has shipped", unsubscribe: {} }),
  meta({ id: "2", fromAddress: "deals@amazon.com", fromDisplayName: "Amazon", subject: "Deals for you", unsubscribe: {} }),
  meta({ id: "3", fromAddress: "deals@amazon.com", fromDisplayName: "Amazon", subject: "More deals", unsubscribe: {} }),
  // OTP, 5 days old → expiry bucket (retention 2d) + sort: otp
  meta({ id: "4", fromAddress: "code@auth-service.example", subject: "Your verification code is 123456", receivedAt: Date.now() - 5 * DAY, unsubscribe: {} }),
  // disposable-domain sender, never opened → spam suggestion + never-read
  meta({ id: "5", fromAddress: "promo@spam-domain.example", subject: "hi", unread: true }),
  meta({ id: "6", fromAddress: "promo@spam-domain.example", subject: "hi again", unread: true }),
  meta({ id: "7", fromAddress: "promo@spam-domain.example", subject: "still here", unread: true }),
  // big + old → smart views (large, older-than-1y)
  meta({ id: "8", fromAddress: "reports@bigmail.example", sizeBytes: 5_000_000, receivedAt: Date.now() - 400 * DAY }),
  // starred → excluded everywhere destructive
  meta({ id: "9", fromAddress: "promo@spam-domain.example", subject: "pick me", isProtected: true }),
  // brand impersonation from a free-mail address → threat signal
  meta({ id: "10", fromAddress: "paypal-help@gmail.com", fromDisplayName: "PayPal Support", subject: "Account notice", unsubscribe: {} }),
];

function mockGmail(metas: NormalizedMessageMetadata[]): EmailProvider {
  return {
    id: "gmail",
    isConnected: vi.fn(async () => true),
    getAuthToken: vi.fn(async () => "t"),
    listCandidateMessages: vi.fn(async () => metas.map((m) => ({ id: m.id, provider: "gmail" as const }))),
    getMessageMetadata: vi.fn(async (_t: string, id: string) => metas.find((m) => m.id === id)!),
    trashMessages: vi.fn(),
  };
}

describe("pipeline contract", () => {
  it("feeds every downstream consumer a well-formed scan", async () => {
    const senders = await buildSenderSummaries([mockGmail(FIXTURE)], 100, 500);

    // senderModel invariants
    expect(senders.length).toBeGreaterThan(0);
    for (const s of senders) {
      expect(s.key).toBe(`gmail:${s.address}`);
      expect(s.messageIds.length).toBe(s.count);
      expect(s.authVerdicts).toHaveProperty("dmarc");
      expect(typeof s.firstContact).toBe("boolean");
      // starred id 9 is always in protectedMessageIds for its sender
      if (s.address === "promo@spam-domain.example") expect(s.protectedMessageIds).toContain("9");
    }

    // expiry — the 5-day-old OTP is past its 2-day window
    const expiry = buildExpiryBuckets(senders);
    expect(totalExpiryCount(expiry)).toBeGreaterThanOrEqual(1);
    expect(expiry.some((b) => b.kind === "otp")).toBe(true);

    // spam — spam-domain.example flagged, and the starred message excluded
    const spam = suggestSpamSenders(senders, { isBlocked: () => false, isSpam: (d) => d === "spam-domain.example" });
    expect(spam).toEqual([]); // the only spam-domain sender also has a starred message → excluded whole

    const spamNoStar = suggestSpamSenders(
      senders.map((s) => ({ ...s, protectedMessageIds: [] })),
      { isBlocked: () => false, isSpam: (d) => d === "spam-domain.example" },
    );
    expect(spamNoStar.map((x) => x.domain)).toContain("spam-domain.example");

    // sort plan — shipping (kind) + shopping (domain) + otp, starred excluded
    const plan = buildSortPlan(senders);
    const buckets = plan.map((e) => e.bucket);
    expect(buckets).toEqual(expect.arrayContaining(["shipping", "shopping", "otp"]));
    expect(totalPlanCount(plan)).toBeGreaterThan(0);
    for (const e of plan) {
      for (const ids of e.idsByProvider.values()) expect(ids).not.toContain("9");
    }

    // never-read — the 3-message all-unread spam sender qualifies
    expect(neverReadSenders(senders).some((s) => s.address === "promo@spam-domain.example")).toBe(true);

    // smart views — every view evaluates to a provider→ids map without throwing
    for (const view of SMART_VIEWS) {
      const m = evaluateSmartView(view, senders);
      expect(m).toBeInstanceOf(Map);
      for (const ids of m.values()) expect(ids).not.toContain("9");
    }

    // rules — a domain-category rule previews a non-negative count
    const rule: ClusterRule = {
      id: "r",
      name: "Shopping → label",
      enabled: true,
      conditions: { fromDomainCategory: "shopping" },
      action: "label",
      labelName: "Cluster/Shopping",
    };
    expect(previewRuleMatches([rule], senders)).toBeGreaterThan(0);

    // first-contact — every fixture sender is new against an empty ledger
    const fc = markFirstContact(senders, {});
    expect(fc.firstContactCount).toBe(senders.length);
    expect(senders.every((s) => s.firstContact)).toBe(true);
  });
});
