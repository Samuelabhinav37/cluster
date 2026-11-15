// Two 2,000-email mailboxes run through Cluster's real sorting code: the one
// the rules were tuned on, and a held-out one whose senders are on no list
// (src/test/heldOutMailbox.ts). Each prints where every kind of mail landed,
// how many labels were wrong against how much went to the Screener, and the
// safety lines. Only the generator check and the safety rules fail the test.
import { describe, expect, it } from "vitest";
import { build, generatorProblems, report, voteReport, type Template } from "../test/mailboxGen";
import { HELD_OUT, HELD_OUT_SEED } from "../test/heldOutMailbox";
import { HELD_OUT_B, HELD_OUT_B_SEED } from "../test/heldOutMailboxB";
import { HELD_OUT_C, HELD_OUT_C_SEED } from "../test/heldOutMailboxC";
import { HELD_OUT_D, HELD_OUT_D_SEED } from "../test/heldOutMailboxD";
import { out, signalVotes, sortMailbox } from "../test/sortHarness";
import { CONTACTS, TUNED, TUNED_SEED } from "../test/tunedMailbox";

async function run(name: string, templates: Template[], seed: number, size = 2000) {
  const { cases, sent } = build(templates, seed);
  expect(cases).toHaveLength(size);
  expect(generatorProblems(cases)).toEqual([]);
  const where = await sortMailbox(cases.map((c) => c.meta), { contacts: CONTACTS, sent, now: Date.UTC(2026, 10, 15, 12) });
  const r = report(cases, where, templates);
  const votes = await signalVotes(cases.map((c) => c.meta), { contacts: CONTACTS, sent, now: Date.UTC(2026, 10, 15, 12) });
  out(`\n=== ${name} ===\n${r.text}\n${voteReport(cases, where, votes)}\n`);
  expect(r.personInSpam).toEqual([]);
  return r;
}

describe("2,000-email realistic mailboxes", () => {
  it("tuned mailbox", async () => {
    await run("Tuned mailbox (real brands)", TUNED, TUNED_SEED);
  });

  it("held-out mailbox (senders on no list)", async () => {
    await run("Held-out mailbox (unlisted senders)", HELD_OUT, HELD_OUT_SEED);
  });

  it("held-out mailbox B (cycle 2)", async () => {
    await run("Held-out mailbox B (cycle 2)", HELD_OUT_B, HELD_OUT_B_SEED);
  });

  it("held-out mailbox C (cycle 3)", async () => {
    await run("Held-out mailbox C (cycle 3)", HELD_OUT_C, HELD_OUT_C_SEED);
  });

  it("held-out mailbox D (3,000 emails, after screening strangers)", async () => {
    await run("Held-out mailbox D (3,000)", HELD_OUT_D, HELD_OUT_D_SEED, 3000);
  });
});
