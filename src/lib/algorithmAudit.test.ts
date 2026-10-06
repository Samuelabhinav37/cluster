// Algorithm audit (2026-10-05) — research/2026-10-05-algorithm-audit-and-upgrades.md
//
// Two kinds of test live here:
//   • `it(...)`        — invariants that hold today and must keep holding
//                        (mostly safety: nothing protected is ever deletable).
//   • `it.fails(...)`  — KNOWN BUGS. Each asserts the CORRECT behaviour, so it
//                        currently fails, which vitest reports as an expected
//                        failure. When a fix lands, the test starts passing,
//                        vitest flags it, and the fix commit flips it to `it`.
//                        The register can't silently go stale.
//
// Senders are built through the real metadata → senderModel pipeline (see
// src/test/mailFixtures.ts), so classification and threat scoring run exactly
// as they do in a scan.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DAY, NOW, authResults, bySender, many, meta, senders } from "../test/mailFixtures";
import { classifyMessageKind } from "./messageKind";
import { protectionDecision, buildSenderCleanupPlan, emptyProtectionContext } from "./protectionPolicy";
import { scoreMessageForThreats, senderRiskScore, riskTier } from "./threatSignals";
import { buildDomainGroups } from "./domainGrouping";
import { buildExpiryBuckets, mergeExpiryBuckets } from "./expiryTriage";
import { keepNewestExcess } from "./keepNewest";
import { neverReadSenders } from "./neverRead";
import { SMART_VIEWS, evaluateSmartViewForTrash } from "./smartViews";
import { buildSubscriptionCandidates } from "./subscriptionSignals";
import { parseListUnsubscribe } from "./unsubscribe";
import { matchRule, type ClusterRule } from "./rules";
import { inboxHealthScore } from "./inboxHealth";
import type { MessageRecord } from "./senderModel";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

const record = (over: Partial<MessageRecord>): MessageRecord => ({
  id: "r1",
  receivedAt: NOW - 40 * DAY,
  kind: "newsletter",
  isProtected: false,
  unread: true,
  sizeBytes: 1000,
  providerMarkedPersonal: false,
  looksAutomated: true,
  ...over,
});

const threats = (over: Parameters<typeof meta>[0]) => scoreMessageForThreats(meta(over));
const tierOf = (over: Parameters<typeof meta>[0]) => riskTier(senderRiskScore(threats(over)));

// ─────────────────────────────────────────────────────────────────────────
describe("safety invariant: nothing protected is ever offered for deletion", () => {
  // A mixed mailbox where every sender has at least one protected message:
  // starred, Gmail-Important, a receipt, a sensitive subject, a known
  // correspondent, and a plain human message with no bulk signal.
  async function mixedMailbox() {
    return senders([
      ...many(4, { fromAddress: "deals@shop.example", receivedAt: NOW - 400 * DAY }),
      meta({ fromAddress: "deals@shop.example", isProtected: true, receivedAt: NOW - 400 * DAY }),
      ...many(3, { fromAddress: "news@paper.example", receivedAt: NOW - 60 * DAY }),
      meta({ fromAddress: "news@paper.example", providerMarkedPersonal: true, receivedAt: NOW - 60 * DAY }),
      meta({ fromAddress: "orders@store.example", subject: "Your receipt for order 1234", receivedAt: NOW - 90 * DAY }),
      meta({ fromAddress: "orders@store.example", subject: "Password reset requested", receivedAt: NOW - 90 * DAY }),
      ...many(3, { fromAddress: "friend@personal.example", unsubscribe: {}, subject: "dinner?" }),
      ...many(3, { fromAddress: "colleague@work.example", receivedAt: NOW - 50 * DAY }),
    ]);
  }
  const ctx = { knownSenders: new Set(["colleague@work.example"]) };

  async function protectedIds() {
    const list = await mixedMailbox();
    const ids = new Set<string>();
    for (const s of list)
      for (const m of s.messages) if (protectionDecision(m, s.address, ctx).protected) ids.add(m.id);
    return { list, ids };
  }
  const flat = (m: Map<string, string[]>) => [...m.values()].flat();

  it("the fixture really contains protected messages of every kind", async () => {
    const { ids } = await protectedIds();
    expect(ids.size).toBeGreaterThanOrEqual(8);
  });

  it("By domain: deletable ids exclude every protected message", async () => {
    const { list, ids } = await protectedIds();
    for (const g of buildDomainGroups(list, ctx)) {
      for (const id of flat(g.deletableMessageIds)) expect(ids.has(id)).toBe(false);
    }
  });

  it("Ready to clean up (expiry): never includes a protected message", async () => {
    const { list, ids } = await protectedIds();
    for (const id of flat(mergeExpiryBuckets(buildExpiryBuckets(list, ctx)))) expect(ids.has(id)).toBe(false);
  });

  it("Trim to newest: never trims a protected message", async () => {
    const { list, ids } = await protectedIds();
    for (const id of flat(keepNewestExcess(list, 1, ctx))) expect(ids.has(id)).toBe(false);
  });

  it("Smart views (trash variant): never include a protected message", async () => {
    const { list, ids } = await protectedIds();
    for (const view of SMART_VIEWS) {
      for (const id of flat(evaluateSmartViewForTrash(view, list, ctx))) expect(ids.has(id)).toBe(false);
    }
  });

  it("Unsubscribe + clean: the cleanup plan never includes a protected message", async () => {
    const { list, ids } = await protectedIds();
    for (const s of list) for (const id of buildSenderCleanupPlan(s, ctx).safeNewsletterIds) expect(ids.has(id)).toBe(false);
  });

  it("Never opened: a known correspondent is never listed", async () => {
    const { list } = await protectedIds();
    expect(neverReadSenders(list, ctx).map((s) => s.address)).not.toContain("colleague@work.example");
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("message-kind classifier", () => {
  it("classifies the obvious cases", () => {
    expect(classifyMessageKind("Your verification code is 482913", false)).toBe("otp");
    expect(classifyMessageKind("Your package has shipped", true)).toBe("shipping");
    expect(classifyMessageKind("Your receipt from Apple", false)).toBe("receipt");
    expect(classifyMessageKind("Priya commented on your post", true)).toBe("social");
    expect(classifyMessageKind("Deals picked for you", true)).toBe("newsletter");
    expect(classifyMessageKind("dinner?", false)).toBe("other");
  });

  // Each of these flips a promo/newsletter into a protected kind
  // (transactional), so it can never be cleaned up.
  it.fails("KNOWN BUG: 'Free delivery' promo copy is classified as shipping", () => {
    expect(classifyMessageKind("Free delivery on all orders this weekend", true)).toBe("newsletter");
  });
  it.fails("KNOWN BUG: 'tracking' in a newsletter subject is classified as shipping", () => {
    expect(classifyMessageKind("Tracking your 2026 fitness goals", true)).toBe("newsletter");
  });
  it.fails("KNOWN BUG: 'statement' in a newsletter subject is classified as a receipt", () => {
    expect(classifyMessageKind("Our statement on today's outage", true)).toBe("newsletter");
  });
  it.fails("KNOWN GAP: 'Please verify your device' is not recognised as a one-time code", () => {
    expect(classifyMessageKind("[GitHub] Please verify your device", false)).toBe("otp");
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("protection policy precision", () => {
  it("protects real windows the user may still need", () => {
    for (const subject of ["Return window closes Friday", "Redeem by Oct 31", "Valid through 12/31"]) {
      expect(protectionDecision(record({ subject }))).toMatchObject({ protected: true, reason: "active-offer-or-window" });
    }
  });

  it.fails("KNOWN BUG: ordinary 'ends tonight' promo copy is treated as an active offer and becomes undeletable", () => {
    expect(protectionDecision(record({ subject: "Flash sale ends tonight — 40% off" })).protected).toBe(false);
  });

  it("protects a singular 'ticket' subject", () => {
    expect(protectionDecision(record({ subject: "Your ticket for Saturday" })).protected).toBe(true);
  });
  it.fails("KNOWN BUG: plural 'tickets' from a bulk sender is not protected (e-tickets become deletable)", () => {
    expect(protectionDecision(record({ subject: "Your tickets for Taylor Swift | The Eras Tour" })).protected).toBe(true);
  });
  it.fails("KNOWN BUG: plural 'reservations' is not protected", () => {
    expect(protectionDecision(record({ subject: "Your reservations in Lisbon are confirmed" })).protected).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("phishing / threat scoring", () => {
  // Regression locks for what works.
  it("flags a brand display name on an unrelated domain that fails DMARC as high risk", () => {
    expect(
      tierOf({ fromAddress: "service@paypa1-secure.com", fromDisplayName: "PayPal Security", authenticationResults: authResults("paypa1-secure.com", false) }),
    ).toBe("high");
  });
  it("flags a homoglyph lookalike of a brand domain", () => {
    expect(threats({ fromAddress: "billing@paypa1.com", fromDisplayName: "Billing" }).map((s) => s.kind)).toContain("lookalike-domain");
  });
  it("flags a brand claim from free-mail as high risk", () => {
    expect(tierOf({ fromAddress: "paypal.help.desk@yahoo.com", fromDisplayName: "PayPal Support" })).toBe("high");
  });
  it("does not flag the brand's own domain or its subdomains", () => {
    expect(threats({ fromAddress: "service@paypal.com", fromDisplayName: "PayPal" })).toEqual([]);
    expect(threats({ fromAddress: "no-reply@email.amazon.com", fromDisplayName: "Amazon.com" })).toEqual([]);
  });

  // False positives.
  it.fails("KNOWN BUG: real Facebook mail (facebookmail.com, DMARC pass) is flagged as impersonation", () => {
    expect(threats({ fromAddress: "notification@facebookmail.com", fromDisplayName: "Facebook" })).toEqual([]);
  });
  it.fails("KNOWN BUG: a person named Chase on gmail.com is scored HIGH risk as a Chase-bank claim", () => {
    expect(tierOf({ fromAddress: "chase.miller@gmail.com", fromDisplayName: "Chase Miller", unsubscribe: {} })).not.toBe("high");
  });
  it.fails("KNOWN BUG: chess.com is flagged as a lookalike of chase.com", () => {
    expect(threats({ fromAddress: "hello@chess.com", fromDisplayName: "Chess.com" })).toEqual([]);
  });
  it.fails("KNOWN BUG: 'Start-Ups Weekly' matches the UPS brand", () => {
    expect(threats({ fromAddress: "editor@startupsweekly.example", fromDisplayName: "Start-Ups Weekly" })).toEqual([]);
  });

  // False negatives: free-mail domains listed as the brand's own.
  it.fails("KNOWN BUG: 'Microsoft Account Team' sending from an outlook.com mailbox is not flagged", () => {
    expect(threats({ fromAddress: "ms.account.recovery@outlook.com", fromDisplayName: "Microsoft Account Team" })).not.toEqual([]);
  });
  it.fails("KNOWN BUG: 'Google Security' sending from a gmail.com mailbox is not flagged", () => {
    expect(threats({ fromAddress: "google.security.alerts@gmail.com", fromDisplayName: "Google Security" })).not.toEqual([]);
  });
  it.fails("KNOWN BUG: 'Apple Support' sending from an icloud.com mailbox is not flagged", () => {
    expect(threats({ fromAddress: "appleid.support.team@icloud.com", fromDisplayName: "Apple Support" })).not.toEqual([]);
  });

  it("a Reply-To redirected to free-mail is a signal; a non-free-mail redirect is not (design limit)", () => {
    const kinds = (replyToAddress: string) =>
      threats({ fromAddress: "billing@vendor.example", fromDisplayName: "Billing", replyToAddress }).map((s) => s.kind);
    expect(kinds("recovery@gmail.com")).toContain("reply-to-mismatch");
    expect(kinds("recovery@vendor-help.top")).not.toContain("reply-to-mismatch");
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("scan pipeline robustness", () => {
  it("groups by sender and counts every message", async () => {
    const list = await senders([...many(3, { fromAddress: "a@x.example" }), ...many(2, { fromAddress: "b@y.example" })]);
    expect(bySender(list, "a@x.example").count).toBe(3);
    expect(list[0].address).toBe("a@x.example"); // sorted by volume
  });

  it.fails("KNOWN BUG: one message deleted mid-scan (404) fails the entire scan", async () => {
    const metas = [...many(5, { fromAddress: "a@x.example" })];
    const list = await senders(metas, new Set([metas[2].id]));
    expect(bySender(list, "a@x.example").count).toBe(4);
  });

  it("a sender who sometimes uses a brand display name still gets the brand signal", async () => {
    const list = await senders([
      meta({ fromAddress: "x@phish.example", fromDisplayName: "Jane" }),
      meta({ fromAddress: "x@phish.example", fromDisplayName: "PayPal" }),
    ]);
    expect(bySender(list, "x@phish.example").threatSignals.map((s) => s.kind)).toContain("brand-impersonation");
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("domain grouping", () => {
  it("free-mail senders are grouped per address, never by domain", async () => {
    const list = await senders([...many(2, { fromAddress: "mom@gmail.com" }), ...many(2, { fromAddress: "dad@gmail.com" })]);
    expect(buildDomainGroups(list).filter((g) => g.domain === "gmail.com")).toHaveLength(2);
  });

  it.fails("KNOWN BUG: independent newsletters on a shared platform collapse into one deletable domain", async () => {
    const list = await senders([
      ...many(3, { fromAddress: "lenny@substack.com", unread: false }),
      ...many(3, { fromAddress: "spammy@substack.com" }),
    ]);
    expect(buildDomainGroups(list).filter((g) => g.domain === "substack.com")).toHaveLength(2);
  });

  it.fails("KNOWN GAP: proton.me / me.com personal senders are grouped by domain", async () => {
    const list = await senders([...many(2, { fromAddress: "a@proton.me" }), ...many(2, { fromAddress: "b@proton.me" })]);
    expect(buildDomainGroups(list).filter((g) => g.domain === "proton.me")).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("subscriptions", () => {
  const signalFor = async (fromAddress: string, subject: string) =>
    buildSubscriptionCandidates(await senders([meta({ fromAddress, subject })]))[0]?.signal;

  it("trial-ending and 'renews on' wording are detected", async () => {
    expect(await signalFor("no-reply@spotify.com", "Your free trial ends in 3 days")).toBe("trial-ending");
    expect(await signalFor("billing@service.example", "Your plan renews on Nov 2")).toBe("renewal");
  });

  it.fails("KNOWN BUG: 'will renew on' (Netflix's wording) is not recognised as a renewal", async () => {
    expect(await signalFor("info@account.netflix.com", "Your membership will renew on Oct 12")).toBe("renewal");
  });
  it.fails("KNOWN BUG: 'is renewing soon' (Apple's wording) is not recognised as a renewal", async () => {
    expect(await signalFor("no_reply@email.apple.com", "Your subscription is renewing soon")).toBe("renewal");
  });

  it.fails("KNOWN BUG: marketing mail from a known subscription domain is listed as a paid subscription", async () => {
    const list = await senders([meta({ fromAddress: "store-news@amazon.com", subject: "Deals picked for you" })]);
    expect(buildSubscriptionCandidates(list)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("List-Unsubscribe parsing", () => {
  it("reads https + mailto entries and ignores plain http", () => {
    expect(parseListUnsubscribe("<http://x.example/u>, <https://x.example/u>, <mailto:u@x.example>", undefined)).toEqual({
      httpUrl: "https://x.example/u",
      mailto: "mailto:u@x.example",
    });
  });
  it.fails("KNOWN BUG: a comma inside a URL drops the https unsubscribe link", () => {
    expect(parseListUnsubscribe("<https://x.example/u?lists=a,b&id=9>", undefined).httpUrl).toBe(
      "https://x.example/u?lists=a,b&id=9",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("rules", () => {
  const trashShoppingOld: ClusterRule = {
    id: "r",
    name: "Old shopping",
    enabled: true,
    conditions: { fromDomain: "store.example", olderThanDays: 30 },
    action: "trash",
  };

  it("never matches a starred message", async () => {
    const list = await senders([meta({ fromAddress: "orders@store.example", isProtected: true, receivedAt: NOW - 60 * DAY })]);
    expect([...matchRule(trashShoppingOld, list).values()].flat()).toEqual([]);
  });

  it.fails("KNOWN BUG: a Trash rule matches receipts the central protection policy protects", async () => {
    const list = await senders([
      meta({ fromAddress: "orders@store.example", subject: "Your receipt for order 1234", receivedAt: NOW - 60 * DAY }),
    ]);
    expect([...matchRule(trashShoppingOld, list).values()].flat()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("inbox health score", () => {
  it("is bounded 0..100 and worse for an all-unread bulk inbox than a read one", async () => {
    const unread = await senders(many(10, { fromAddress: "a@x.example" }));
    const read = await senders(many(10, { fromAddress: "a@x.example", unread: false }));
    const [u, r] = [inboxHealthScore(unread), inboxHealthScore(read)];
    expect(u).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(100);
    expect(u).toBeLessThan(r);
  });

  it.fails("KNOWN BUG: the same inbox scores differently just because the scan sampled more of it", async () => {
    const mailbox = (k: number) =>
      Array.from({ length: 10 * k }, (_, i) => many(4, { fromAddress: `list${i}@x${i}.example`, unread: i % 2 === 0 })).flat();
    expect(inboxHealthScore(await senders(mailbox(2)))).toBe(inboxHealthScore(await senders(mailbox(1))));
  });
});

// Keep the ProtectionContext import honest for readers: the default context is empty.
it("default protection context knows no correspondents", () => {
  expect(emptyProtectionContext().knownSenders.size).toBe(0);
});
