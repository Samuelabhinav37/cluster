import { describe, expect, it } from "vitest";
import { accuracyNumbers, addFixes, FIX_DAYS, filedIn, fixesIn, fixesPer100, MIN_FILED } from "./correctionRate";
import { fixedEmails, movedTo, SWEEP_SENDERS, type LabelMove } from "./learnFromMoves";
import type { EmailDecision } from "./mailEngine";
import type { SenderSummary } from "./senderModel";

const NOW = new Date(2026, 10, 18, 12).getTime();
const DAY = 86_400_000;

describe("correction rate", () => {
  it("adds today's fixes, keeps 8 weeks, and counts the last 7 days", () => {
    let log = addFixes({}, 2, NOW - 10 * DAY);
    log = addFixes(log, 3, NOW - DAY);
    log = addFixes(log, 1, NOW);
    log = addFixes(log, 1, NOW);
    expect(fixesIn(log, NOW)).toBe(5);
    expect(fixesIn(log, NOW, 14)).toBe(7);
    expect(Object.keys(addFixes(log, 0, NOW + FIX_DAYS * DAY))).toEqual([]);
    expect(addFixes({ "2026-11-18": Number.NaN, "2026-11-17": -1 }, 0, NOW)).toEqual({});
  });

  it("counts filed mail from the engine: this week, not Spam, not left in the inbox", () => {
    const m = (id: string, ago: number) => ({ id, receivedAt: NOW - ago * DAY });
    const senders = [{ messages: [m("a", 1), m("b", 2), m("c", 3), m("d", 9), m("e", 1)] }] as unknown as SenderSummary[];
    const d = (place: EmailDecision["place"]) => ({ kind: "other", place, risk: "none" }) as EmailDecision;
    const decided = new Map([["a", d("receipt")], ["b", d("personal")], ["c", d("spam")], ["d", d("receipt")], ["e", d(null)]]);
    expect(filedIn(senders, decided, NOW)).toBe(2);
  });

  it("gives a rate per 100 once enough was filed", () => {
    expect(fixesPer100(3, MIN_FILED - 1)).toBeNull();
    expect(fixesPer100(3, 200)).toBe(1.5);
    expect(fixesPer100(1, 30)).toBe(3.3);
  });

  it("every re-filed email counts, sweeps too, while learning still ignores sweeps", () => {
    const bucketOf = new Map([["L_news", "newsletter" as const], ["L_promo", "promotions" as const]]);
    const from = new Set(bucketOf.keys());
    const swap = (address: string): LabelMove => ({ address, added: ["L_news"], removed: ["L_promo"] });
    const sweep = Array.from({ length: SWEEP_SENDERS }, (_, i) => swap(`s${i}@x.example`));
    expect(fixedEmails(sweep, bucketOf, from)).toBe(SWEEP_SENDERS);
    expect(movedTo(sweep, bucketOf, from)).toEqual([]);
    // Adding alone (Cluster labelling) or removing alone (tidying) isn't a fix.
    expect(fixedEmails([{ address: "a@x.example", added: ["L_news"], removed: [] }, { address: "a@x.example", added: [], removed: ["L_promo"] }], bucketOf, from)).toBe(0);
    // A non-Cluster label added isn't one either.
    expect(fixedEmails([{ address: "a@x.example", added: ["Work"], removed: ["L_promo"] }], bucketOf, from)).toBe(0);
  });

  it("gives the three accuracy numbers: fixes, false holds, Screener share", () => {
    const msgs = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, receivedAt: NOW - DAY }));
    const senders = [{ messages: msgs }] as unknown as SenderSummary[];
    const d = (place: EmailDecision["place"]) => ({ kind: "other", place, risk: "none" }) as EmailDecision;
    const decided = new Map(msgs.map((m, i) => [m.id, d(i < 4 ? "screener" : "receipt")] as const));
    const got = accuracyNumbers(senders, decided, addFixes({}, 2, NOW), { reviewed: 10, confirmed: 9 }, NOW);
    expect(got).toEqual({ fixesPer100: 5, releasedPer100: 10, screenerShare: 10 });
    expect(accuracyNumbers([], new Map(), {}, { reviewed: 0, confirmed: 0 }, NOW)).toEqual({ fixesPer100: null, releasedPer100: null, screenerShare: null });
  });
});
