// What the Gmail filters label on arrival, scored against the same mailboxes
// as realisticMailbox.test.ts. The filters run first and Cluster's own pass
// skips mail that already has a label, so a filter mistake is what the user
// sees until the daily relabel fixes it (and never, for senders it skips).
import { describe, expect, it } from "vitest";
import { categoryQueries } from "./categoryQueries";
import { ALL_SORT_BUCKETS, type SortBucket } from "./sortTaxonomy";
import { build, type Template } from "../test/mailboxGen";
import { queryMatches } from "../test/gmailQuery";
import { HELD_OUT, HELD_OUT_SEED } from "../test/heldOutMailbox";
import { HELD_OUT_B, HELD_OUT_B_SEED } from "../test/heldOutMailboxB";
import { HELD_OUT_C, HELD_OUT_C_SEED } from "../test/heldOutMailboxC";
import { HELD_OUT_D, HELD_OUT_D_SEED } from "../test/heldOutMailboxD";
import { out, sortMailbox } from "../test/sortHarness";
import { CONTACTS, TUNED, TUNED_SEED } from "../test/tunedMailbox";

const QUERIES = ALL_SORT_BUCKETS.flatMap((b) => categoryQueries(b).map((q) => [b, q] as const));

function filterLabels(meta: Parameters<typeof queryMatches>[1]): SortBucket[] {
  return [...new Set(QUERIES.filter(([, q]) => queryMatches(q, meta)).map(([b]) => b))];
}

async function score(name: string, templates: Template[], seed: number) {
  const { cases, sent } = build(templates, seed);
  const where = await sortMailbox(cases.map((c) => c.meta), { contacts: CONTACTS, sent, now: Date.UTC(2026, 10, 15, 12) });
  let labelled = 0;
  let wrong = 0;
  let twoLabels = 0;
  let disagree = 0;
  let onPeople = 0;
  let onScams = 0;
  const examples = new Map<string, number>();
  for (const c of cases) {
    const got = filterLabels(c.meta);
    if (got.length === 0) continue;
    labelled++;
    if (got.length > 1) twoLabels++;
    const client = where.get(c.meta.id);
    if (!got.some((b) => c.t.accept.includes(b))) {
      wrong++;
      const key = `${c.t.group}: filter ${got.join("+")}, want ${c.t.accept[0]}`;
      examples.set(key, (examples.get(key) ?? 0) + 1);
    }
    if (client !== undefined && !got.includes(client as SortBucket)) disagree++;
    if (c.t.accept[0] === "personal") onPeople++;
    if (c.t.accept[0] === "spam") onScams++;
  }
  const pct = (n: number, d: number) => `${d ? ((100 * n) / d).toFixed(1) : "0.0"}%`;
  const top = [...examples].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `  ${n}x ${k}`);
  out(
    `\n=== Filters: ${name} ===\n` +
      `Filters label ${labelled}/${cases.length} (${pct(labelled, cases.length)}); wrong ${wrong} (${pct(wrong, labelled)} of those); ` +
      `two+ labels ${twoLabels}; disagree with Cluster's own pass ${disagree} (${pct(disagree, labelled)}); ` +
      `people labelled ${onPeople}; scams labelled ${onScams}\n${top.join("\n")}\n`,
  );
  return { labelled, wrong, onPeople, onScams };
}

describe("Gmail filters against the realistic mailboxes", () => {
  it.each([
    ["Tuned", TUNED, TUNED_SEED],
    ["Held-out A", HELD_OUT, HELD_OUT_SEED],
    ["Held-out B", HELD_OUT_B, HELD_OUT_B_SEED],
    ["Held-out C", HELD_OUT_C, HELD_OUT_C_SEED],
    ["Held-out D", HELD_OUT_D, HELD_OUT_D_SEED],
  ] as const)("%s", async (name, templates, seed) => {
    const r = await score(name, templates as Template[], seed);
    expect(r.labelled).toBeGreaterThan(0);
    // Floors (audit B6): a filter never labels a person or a scam, and held-out
    // mail is near-certain. Tuned's ceiling is mostly newsletters in the
    // Promotions tab (see categoryQueries); lower it as that improves.
    expect(r.onPeople, "people labelled").toBe(0);
    expect(r.onScams, "scams labelled").toBe(0);
    expect(r.wrong / r.labelled, "wrong share").toBeLessThanOrEqual(name === "Tuned" ? 0.1 : 0.01);
  });
});

describe("gmailQuery (the test evaluator itself)", () => {
  const m = (subject: string, fromAddress: string, labelIds: string[] = []) => ({ subject, fromAddress, labelIds }) as never;
  it("matches the grammar categoryQueries writes", () => {
    expect(queryMatches('subject:(receipt OR "your bill") -from:(gmail.com)', m("Your bill is ready", "a@bank.com"))).toBe(true);
    expect(queryMatches('subject:(receipt OR "your bill") -from:(gmail.com)', m("Your bill is ready", "a@gmail.com"))).toBe(false);
    expect(queryMatches("{subject:(shipped) from:(ups.com)} -category:promotions", m("Hi", "x@mail.ups.com"))).toBe(true);
    expect(queryMatches("{subject:(shipped) from:(ups.com)} -category:promotions", m("Hi", "x@mail.ups.com", ["CATEGORY_PROMOTIONS"]))).toBe(false);
    expect(queryMatches("-(from:a@x.com subject:(receipt))", m("Receipt", "a@x.com"))).toBe(false);
    expect(queryMatches("-(from:a@x.com subject:(receipt))", m("Hello", "a@x.com"))).toBe(true);
    expect(queryMatches("subject:(receipt)", m("Receipts policy", "a@x.com"))).toBe(false);
  });
});
