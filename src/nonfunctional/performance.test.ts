// Non-functional: CPU cost of the hot paths at "widened scan" scale.
//
// The default scan is 150 messages; Settings allows 5,000. These run the real
// pipeline at the 5,000-message ceiling with ~1,000 distinct senders (the
// worst case for per-sender threat scoring, which edit-distances every sender
// domain against every brand domain). Budgets carry ~10× headroom over the
// measured times on a dev laptop (see the audit doc), so they catch an
// accidental O(n²), not a slow CI machine.
import { describe, expect, it } from "vitest";
import { DAY, NOW, meta, senders } from "../test/mailFixtures";
import type { NormalizedMessageMetadata } from "../lib/providers/emailProvider";
import { buildDomainGroups } from "../lib/domainGrouping";
import { buildExpiryBuckets } from "../lib/expiryTriage";
import { neverReadSenders } from "../lib/neverRead";
import { buildSenderCleanupPlan } from "../lib/protectionPolicy";
import { inboxHealthScore } from "../lib/inboxHealth";
import { scoreMessageForThreats } from "../lib/threatSignals";
import { isSpamDomain } from "../lib/spamList";
import { updateEngagementObservations, buildEngagementSuggestions } from "../lib/engagementModel";

const SUBJECTS = [
  "Deals picked for you",
  "Your package has shipped",
  "Your receipt for order 1234",
  "Weekly digest",
  "Your verification code is 123456",
  "Priya commented on your post",
  "Flash sale ends tonight",
  "Re: notes from today",
];

function bigMailbox(messages: number, distinctSenders: number): NormalizedMessageMetadata[] {
  return Array.from({ length: messages }, (_, i) => {
    const s = i % distinctSenders;
    return meta({
      fromAddress: `list${s}@sender${s}.example`,
      fromDisplayName: s % 50 === 0 ? "PayPal Service" : `Sender ${s}`,
      subject: SUBJECTS[i % SUBJECTS.length],
      unread: i % 3 !== 0,
      receivedAt: NOW - (i % 400) * DAY,
      isProtected: i % 97 === 0,
    });
  });
}

function time<T>(fn: () => T): { result: T; ms: number } {
  const t0 = performance.now();
  const result = fn();
  return { result, ms: performance.now() - t0 };
}

async function timeAsync<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = performance.now();
  const result = await fn();
  return { result, ms: performance.now() - t0 };
}

describe("performance budgets at the 5,000-message scan ceiling", () => {
  const mailbox = bigMailbox(5_000, 1_000);

  it("metadata → senders (classification + threat scoring) stays under 2 s", async () => {
    const { result, ms } = await timeAsync(() => senders(mailbox));
    expect(result).toHaveLength(1_000);
    expect(ms, `took ${ms.toFixed(0)} ms`).toBeLessThan(2_000);
  });

  it("every screen's derivations over 1,000 senders stay under 500 ms combined", async () => {
    const list = await senders(mailbox);
    const { ms } = time(() => {
      buildDomainGroups(list);
      buildExpiryBuckets(list);
      neverReadSenders(list);
      for (const s of list) buildSenderCleanupPlan(s);
      inboxHealthScore(list);
    });
    expect(ms, `took ${ms.toFixed(0)} ms`).toBeLessThan(500);
  });

  it("engagement update + suggestions over 1,000 senders stay under 300 ms", async () => {
    const list = await senders(mailbox);
    const { ms } = time(() => {
      const obs = updateEngagementObservations({}, list, NOW);
      buildEngagementSuggestions(list, updateEngagementObservations(obs, list, NOW + DAY), undefined, NOW + DAY);
    });
    expect(ms, `took ${ms.toFixed(0)} ms`).toBeLessThan(300);
  });

  const scoreUnseenDomains = () =>
    time(() => {
      for (let i = 0; i < 2_000; i++) {
        scoreMessageForThreats(meta({ fromAddress: `x@brandlike-${i}-paypal-secure.com`, fromDisplayName: `Account ${i}` }));
      }
    }).ms;

  it("per-message threat scoring of 2,000 unseen long domains stays under 10 s (catastrophic-regression guard)", () => {
    const ms = scoreUnseenDomains();
    expect(ms, `took ${ms.toFixed(0)} ms`).toBeLessThan(10_000);
  });

  // Was a known perf issue: findLookalikeBrand ran a full edit-distance matrix
  // against every brand domain. editDistanceWithin now skips pairs whose
  // lengths differ by more than the allowed distance.
  it("threat scoring of 2,000 unseen long domains under 1.5 s", () => {
    const ms = scoreUnseenDomains();
    expect(ms, `took ${ms.toFixed(0)} ms`).toBeLessThan(1_500);
  });

  it("spam-domain lookup is effectively O(1): 100,000 lookups under 1.5 s", () => {
    const { ms } = time(() => {
      for (let i = 0; i < 100_000; i++) isSpamDomain(`mail.sub${i}.example.com`);
    });
    expect(ms, `took ${ms.toFixed(0)} ms`).toBeLessThan(1_500);
  });
});
