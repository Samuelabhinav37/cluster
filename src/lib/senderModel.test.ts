import { describe, expect, it, vi } from "vitest";
import { buildCombinedSenderSummaries, buildSenderSummaries } from "./senderModel";
import { lanesFromLabelIds } from "./providers/gmailProvider";
import type { EmailProvider, NormalizedMessageMetadata } from "./providers/emailProvider";

function makeProvider(id: "gmail" | "outlook", metas: NormalizedMessageMetadata[]): EmailProvider {
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
    replyToAddress: "",
    subject: "hi",
    isProtected: false,
    unread: false,
    sizeBytes: 0,
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
    const outlook = makeProvider("outlook", [
      makeMeta({ id: "o1", provider: "outlook", fromAddress: "c@y.com" }),
    ]);

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
    expect(gmail.listCandidateMessages).toHaveBeenCalledWith("gmail-token", 250, 30, "cleanup");
  });

  it("passes a purpose-specific scan lane through to the provider", async () => {
    const gmail = makeProvider("gmail", []);
    await buildSenderSummaries([gmail], 250, 30, undefined, "security");
    expect(gmail.listCandidateMessages).toHaveBeenCalledWith("gmail-token", 250, 30, "security");
  });

  it("flags failed-authentication from any of a sender's messages, not just the first one seen", async () => {
    // First message from this sender authenticates fine; a later one fails
    // DMARC (the spoofed copy). The old code only scored the first message,
    // so this signal was silently missed.
    const gmail = makeProvider("gmail", [
      makeMeta({
        id: "g1",
        fromAddress: "alerts@bank.example",
        authenticationResults: "mx.google.com; spf=pass; dkim=pass; dmarc=pass",
      }),
      makeMeta({
        id: "g2",
        fromAddress: "alerts@bank.example",
        authenticationResults: "mx.google.com; dmarc=fail (p=REJECT)",
      }),
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

  it("catches a brand claim that only appears in a later message's display name", async () => {
    // First message looks ordinary; a later one from the SAME address changes
    // the display name to impersonate a brand. Identity signals used to be
    // frozen after message 1, so this was missed.
    const gmail = makeProvider("gmail", [
      makeMeta({ id: "g1", fromAddress: "noreply@sketchy.example", fromDisplayName: "Weekly Update" }),
      makeMeta({ id: "g2", fromAddress: "noreply@sketchy.example", fromDisplayName: "PayPal" }),
    ]);

    const senders = await buildSenderSummaries([gmail]);

    expect(senders[0].threatSignals).toEqual([
      { kind: "brand-impersonation", brand: "paypal", confidence: "medium" },
    ]);
  });

  it("does not duplicate a signal when the display name varies but the brand claim repeats", async () => {
    const gmail = makeProvider("gmail", [
      makeMeta({ id: "g1", fromAddress: "x@sketchy.example", fromDisplayName: "PayPal" }),
      makeMeta({ id: "g2", fromAddress: "x@sketchy.example", fromDisplayName: "PayPal Inc" }),
      makeMeta({ id: "g3", fromAddress: "x@sketchy.example", fromDisplayName: "PayPal Support" }),
    ]);

    const senders = await buildSenderSummaries([gmail]);

    expect(senders[0].threatSignals.filter((s) => s.kind === "brand-impersonation")).toHaveLength(1);
  });

  it("fetches each message's metadata once when a cache is shared across scans", async () => {
    // The cleanup scan sees g1,g2,g3; the security scan sees g2,g3,g4 — g2 and
    // g3 overlap. With one shared cache, getMessageMetadata should run once per
    // unique id (4), not once per stub across both scans (6).
    const metas = ["g1", "g2", "g3", "g4"].map((id) => makeMeta({ id, fromAddress: `${id}@x.com` }));
    const provider = makeProvider("gmail", metas);
    const stubsFor = (ids: string[]) => ids.map((id) => ({ id, provider: "gmail" as const }));
    (provider.listCandidateMessages as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(async () => stubsFor(["g1", "g2", "g3"]))
      .mockImplementationOnce(async () => stubsFor(["g2", "g3", "g4"]));

    const cache = new Map();
    await buildSenderSummaries([provider], 500, 180, undefined, "cleanup", cache);
    await buildSenderSummaries([provider], 500, 30, undefined, "security", cache);

    expect(provider.getMessageMetadata).toHaveBeenCalledTimes(4);
    expect(cache.size).toBe(4);
  });

  it("still fetches every message when no cache is passed", async () => {
    const metas = ["g1", "g2"].map((id) => makeMeta({ id }));
    const provider = makeProvider("gmail", metas);
    await buildSenderSummaries([provider]);
    await buildSenderSummaries([provider]);
    expect(provider.getMessageMetadata).toHaveBeenCalledTimes(4);
  });

  it("surfaces the most alarming auth verdict across a sender's messages", async () => {
    // Message 1 authenticates cleanly; message 2 fails DKIM and DMARC. The
    // chip should reflect the failure, not the earlier pass.
    const gmail = makeProvider("gmail", [
      makeMeta({
        id: "g1",
        fromAddress: "s@vendor.example",
        authenticationResults: "mx.google.com; spf=pass; dkim=pass; dmarc=pass",
      }),
      makeMeta({
        id: "g2",
        fromAddress: "s@vendor.example",
        authenticationResults: "mx.google.com; spf=pass; dkim=fail; dmarc=fail",
      }),
    ]);

    const senders = await buildSenderSummaries([gmail]);

    expect(senders[0].authVerdicts).toEqual({ spf: "pass", dkim: "fail", dmarc: "fail" });
  });

  it("does not let a later benign softfail downgrade an earlier pass", async () => {
    const gmail = makeProvider("gmail", [
      makeMeta({ id: "g1", fromAddress: "s@list.example", authenticationResults: "mx.google.com; spf=pass" }),
      makeMeta({
        id: "g2",
        fromAddress: "s@list.example",
        authenticationResults: "mx.google.com; spf=softfail",
      }),
    ]);

    const senders = await buildSenderSummaries([gmail]);

    expect(senders[0].authVerdicts.spf).toBe("pass");
  });

  it("computes threatSignals per sender from scoreMessageForThreats", async () => {
    const gmail = makeProvider("gmail", [
      makeMeta({ id: "g1", fromAddress: "paypal-support@gmail.com", fromDisplayName: "PayPal Support" }),
      makeMeta({
        id: "g2",
        fromAddress: "hello@ordinary-newsletter.example",
        fromDisplayName: "Ordinary Newsletter",
      }),
    ]);

    const senders = await buildSenderSummaries([gmail]);

    const flagged = senders.find((s) => s.address === "paypal-support@gmail.com")!;
    expect(flagged.threatSignals).toEqual([
      { kind: "freemail-brand-claim", brand: "paypal", confidence: "high" },
    ]);
    const clean = senders.find((s) => s.address === "hello@ordinary-newsletter.example")!;
    expect(clean.threatSignals).toEqual([]);
  });
});

describe("lanesFromLabelIds", () => {
  it("routes an inbox promo to both lanes", () => {
    expect(lanesFromLabelIds(["INBOX", "CATEGORY_PROMOTIONS"]).sort()).toEqual(["cleanup", "security"]);
  });
  it("routes a primary-inbox message to security only", () => {
    expect(lanesFromLabelIds(["INBOX", "CATEGORY_PERSONAL"])).toEqual(["security"]);
  });
  it("routes an archived promo to cleanup only", () => {
    expect(lanesFromLabelIds(["CATEGORY_UPDATES"])).toEqual(["cleanup"]);
  });
  it("defaults an unlabelled message to cleanup", () => {
    expect(lanesFromLabelIds([])).toEqual(["cleanup"]);
  });
});

describe("buildCombinedSenderSummaries", () => {
  it("partitions one fetched set into the two lanes by meta.lanes", async () => {
    const gmail = makeProvider("gmail", [
      makeMeta({ id: "c1", fromAddress: "promo@shop.example", lanes: ["cleanup"] }),
      makeMeta({ id: "s1", fromAddress: "boss@work.example", lanes: ["security"] }),
      makeMeta({ id: "b1", fromAddress: "news@brand.example", lanes: ["cleanup", "security"] }),
    ]);

    const { cleanup, security, scannedCount } = await buildCombinedSenderSummaries([gmail]);

    expect(scannedCount).toBe(3);
    expect(cleanup.map((s) => s.address).sort()).toEqual(["news@brand.example", "promo@shop.example"]);
    expect(security.map((s) => s.address).sort()).toEqual(["boss@work.example", "news@brand.example"]);
    // getMessageMetadata called once per message, not once per lane.
    expect(gmail.getMessageMetadata).toHaveBeenCalledTimes(3);
  });

  it("caps the security slice, newest first, without a second fetch", async () => {
    const now = Date.now();
    const metas = Array.from({ length: 10 }, (_, i) =>
      makeMeta({
        id: `m${i}`,
        fromAddress: `s${i}@x.example`,
        receivedAt: now - i * 1000,
        lanes: ["cleanup", "security"],
      }),
    );
    const gmail = makeProvider("gmail", metas);

    const { cleanup, security } = await buildCombinedSenderSummaries(
      [gmail],
      500,
      180,
      3, // securityMaxMessages
    );

    expect(cleanup).toHaveLength(10);
    expect(security).toHaveLength(3);
    expect(security.map((s) => s.address)).toEqual(["s0@x.example", "s1@x.example", "s2@x.example"]);
  });
});

describe("addToSenders providerMarkedPersonal/looksAutomated", () => {
  it("carries providerMarkedPersonal through onto the MessageRecord", async () => {
    const gmail = makeProvider("gmail", [
      makeMeta({ id: "g1", providerMarkedPersonal: true }),
      makeMeta({ id: "g2", providerMarkedPersonal: false }),
      makeMeta({ id: "g3" }), // absent -> defaults to false
    ]);
    const [sender] = await buildSenderSummaries([gmail]);
    const byId = Object.fromEntries(sender.messages.map((m) => [m.id, m]));
    expect(byId.g1.providerMarkedPersonal).toBe(true);
    expect(byId.g2.providerMarkedPersonal).toBe(false);
    expect(byId.g3.providerMarkedPersonal).toBe(false);
  });

  it("derives looksAutomated from hasListUnsubscribe/precedence/autoSubmitted", async () => {
    const gmail = makeProvider("gmail", [
      makeMeta({ id: "g1", unsubscribe: { httpUrl: "https://example.com/unsub" } }),
      makeMeta({ id: "g2", precedence: "bulk" }),
      makeMeta({ id: "g3", autoSubmitted: "auto-generated" }),
      makeMeta({ id: "g4" }),
    ]);
    const [sender] = await buildSenderSummaries([gmail]);
    const byId = Object.fromEntries(sender.messages.map((m) => [m.id, m]));
    expect(byId.g1.looksAutomated).toBe(true);
    expect(byId.g2.looksAutomated).toBe(true);
    expect(byId.g3.looksAutomated).toBe(true);
    expect(byId.g4.looksAutomated).toBe(false);
  });
});
