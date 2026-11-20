// Research idea 4 (abstain by target): how often each label reason is wrong
// on the five test mailboxes. A reason that misses often is "not sure".
import { describe, expect, it } from "vitest";
import { build, type Template } from "../test/mailboxGen";
import { HELD_OUT, HELD_OUT_SEED } from "../test/heldOutMailbox";
import { HELD_OUT_B, HELD_OUT_B_SEED } from "../test/heldOutMailboxB";
import { HELD_OUT_C, HELD_OUT_C_SEED } from "../test/heldOutMailboxC";
import { HELD_OUT_D, HELD_OUT_D_SEED } from "../test/heldOutMailboxD";
import { out, sendersOf, sortMailbox } from "../test/sortHarness";
import { CONTACTS, TUNED, TUNED_SEED } from "../test/tunedMailbox";
import { domainOf } from "./domainGrouping";
import { labelReason, type SortBucket } from "./sortTaxonomy";

const BOXES: [string, Template[], number][] = [
  ["tuned", TUNED, TUNED_SEED],
  ["A", HELD_OUT, HELD_OUT_SEED],
  ["B", HELD_OUT_B, HELD_OUT_B_SEED],
  ["C", HELD_OUT_C, HELD_OUT_C_SEED],
  ["D", HELD_OUT_D, HELD_OUT_D_SEED],
];

describe("label reasons against the answer key", () => {
  it("prints the miss rate of each reason", async () => {
    const tally = new Map<string, { n: number; wrong: number }>();
    for (const [, templates, seed] of BOXES) {
      const { cases, sent } = build(templates, seed);
      const setup = { contacts: CONTACTS, sent, now: Date.UTC(2026, 10, 15, 12) };
      const metas = cases.map((c) => c.meta);
      const where = await sortMailbox(metas, setup);
      const { senders } = await sendersOf(metas, setup);
      const accept = new Map(cases.map((c) => [c.meta.id, c.t.accept] as const));
      for (const s of senders)
        for (const m of s.messages) {
          const w = where.get(m.id);
          if (!w || w === "inbox" || w === "spam" || w === "screener") continue;
          const why = labelReason(w as SortBucket | "personal", m.kind, domainOf(s.address), s.address, {}, m.promotion, m);
          const t = tally.get(why) ?? { n: 0, wrong: 0 };
          t.n++;
          if (!accept.get(m.id)?.includes(w)) t.wrong++;
          tally.set(why, t);
        }
    }
    const rows = [...tally].sort((a, b) => b[1].wrong / b[1].n - a[1].wrong / a[1].n);
    out(`\n=== Miss rate by label reason (5 mailboxes) ===\n${rows.map(([why, t]) => `${((100 * t.wrong) / t.n).toFixed(1).padStart(5)}%  ${String(t.wrong).padStart(4)}/${String(t.n).padEnd(5)} ${why}`).join("\n")}\n`);
    expect(rows.length).toBeGreaterThan(0);
  }, 120_000);
});
