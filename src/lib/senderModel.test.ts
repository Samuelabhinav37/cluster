import { describe, expect, it, vi } from "vitest";
import { buildSenderSummaries } from "./senderModel";
import type { EmailProvider, NormalizedMessageMetadata } from "./providers/emailProvider";

function makeProvider(
  id: "gmail" | "outlook",
  metas: NormalizedMessageMetadata[],
): EmailProvider {
  return {
    id,
    isConnected: vi.fn(async () => true),
    getAuthToken: vi.fn(async () => `${id}-token`),
    listCandidateMessages: vi.fn(async () => metas.map((m) => ({ id: m.id, provider: id }))),
    getMessageMetadata: vi.fn(async (_token: string, msgId: string) => metas.find((m) => m.id === msgId)!),
    trashMessages: vi.fn(async () => {}),
  };
}

function makeMeta(overrides: Partial<NormalizedMessageMetadata> & { id: string }): NormalizedMessageMetadata {
  return {
    provider: "gmail",
    fromAddress: "a@x.com",
    fromDisplayName: "A",
    subject: "hi",
    isProtected: false,
    unsubscribe: {},
    receivedAt: Date.now(),
    ...overrides,
  };
}

describe("buildSenderSummaries", () => {
  it("aggregates messages by sender across providers, sorted by count descending", async () => {
    const gmail = makeProvider("gmail", [
      makeMeta({ id: "g1", fromAddress: "a@x.com" }),
      makeMeta({ id: "g2", fromAddress: "a@x.com" }),
      makeMeta({ id: "g3", fromAddress: "b@x.com" }),
    ]);
    const outlook = makeProvider("outlook", [makeMeta({ id: "o1", provider: "outlook", fromAddress: "c@y.com" })]);

    const senders = await buildSenderSummaries([gmail, outlook]);

    expect(senders.map((s) => s.key)).toEqual(["gmail:a@x.com", "gmail:b@x.com", "outlook:c@y.com"]);
    expect(senders[0].count).toBe(2);
  });

  it("reports progress across all providers combined", async () => {
    const gmail = makeProvider("gmail", [makeMeta({ id: "g1" }), makeMeta({ id: "g2" })]);
    const outlook = makeProvider("outlook", [makeMeta({ id: "o1", provider: "outlook" })]);

    const calls: Array<[number, number]> = [];
    await buildSenderSummaries([gmail, outlook], 500, 180, (done, total) => calls.push([done, total]));

    expect(calls).toHaveLength(3);
    for (const [, total] of calls) expect(total).toBe(3);
    expect(calls.map(([done]) => done).sort()).toEqual([1, 2, 3]);
  });

  it("passes maxMessagesPerProvider and scanWindowDays through to each provider", async () => {
    const gmail = makeProvider("gmail", []);
    await buildSenderSummaries([gmail], 250, 30);
    expect(gmail.listCandidateMessages).toHaveBeenCalledWith("gmail-token", 250, 30);
  });

  it("flags failed-authentication from any of a sender's messages, not just the first one seen", async () => {
    // First message from this sender authenticates fine; a later one fails
    // DMARC (the spoofed copy). The old code only scored the first message,
    // so this signal was silently missed.
    const gmail = makeProvider("gmail", [
      makeMeta({ id: "g1", fromAddress: "alerts@bank.example", authenticationResults: "mx.google.com; spf=pass; dkim=pass; dmarc=pass" }),
      makeMeta({ id: "g2", fromAddress: "alerts@bank.example", authenticationResults: "mx.google.com; dmarc=fail (p=REJECT)" }),
    ]);

    const senders = await buildSenderSummaries([gmail]);

    expect(senders[0].threatSignals).toEqual([
      { kind: "failed-authentication", brand: "bank.example", confidence: "high" },
    ]);
  });

  it("records the failed-authentication signal only once even when several messages fail", async () => {
    const gmail = makeProvider("gmail", [
      makeMeta({ id: "g1", fromAddress: "x@y.example", authenticationResults: "mx; dmarc=fail" }),
      makeMeta({ id: "g2", fromAddress: "x@y.example", authenticationResults: "mx; dmarc=fail" }),
      makeMeta({ id: "g3", fromAddress: "x@y.example", authenticationResults: "mx; dmarc=fail" }),
    ]);

    const senders = await buildSenderSummaries([gmail]);

    expect(senders[0].threatSignals.filter((s) => s.kind === "failed-authentication")).toHaveLength(1);
  });

  it("keeps identity signals and adds a later message's auth failure alongside them", async () => {
    const gmail = makeProvider("gmail", [
      makeMeta({ id: "g1", fromAddress: "paypal-support@gmail.com", fromDisplayName: "PayPal Support" }),
      makeMeta({
        id: "g2",
        fromAddress: "paypal-support@gmail.com",
        fromDisplayName: "PayPal Support",
        authenticationResults: "mx; dmarc=fail",
      }),
    ]);

    const senders = await buildSenderSummaries([gmail]);

    expect(senders[0].threatSignals).toEqual([
      { kind: "freemail-brand-claim", brand: "paypal", confidence: "high" },
      { kind: "failed-authentication", brand: "gmail.com", confidence: "high" },
    ]);
  });

  it("computes threatSignals per sender from scoreMessageForThreats", async () => {
    const gmail = makeProvider("gmail", [
      makeMeta({ id: "g1", fromAddress: "paypal-support@gmail.com", fromDisplayName: "PayPal Support" }),
      makeMeta({ id: "g2", fromAddress: "hello@ordinary-newsletter.example", fromDisplayName: "Ordinary Newsletter" }),
    ]);

    const senders = await buildSenderSummaries([gmail]);

    const flagged = senders.find((s) => s.address === "paypal-support@gmail.com")!;
    expect(flagged.threatSignals).toEqual([{ kind: "freemail-brand-claim", brand: "paypal", confidence: "high" }]);
    const clean = senders.find((s) => s.address === "hello@ordinary-newsletter.example")!;
    expect(clean.threatSignals).toEqual([]);
  });
});
