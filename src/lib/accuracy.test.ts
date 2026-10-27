// Accuracy report and CI gate (docs/algorithm-plan.md, Stage A).
//
// Every fixture in src/test/corpus/fixtures.ts runs through the real
// pipeline: metadata → senderModel → verdict → protection policy. Each
// message ends in one of four outcomes:
//   hold / warn  the phishing verdict caught it
//   leave        protected: no cleanup path may delete it
//   trash        unprotected: a cleanup path (retention, Clear out, smart
//                views, rules) is allowed to delete it
// shortcut: "trash" means "deletable", not "suggested"; split it once
// suggestions are scored per message (Stage E).
//
// The cost of each outcome comes from COST (agreed 2026-10-26). The test
// fails on any new hard-gate violation, on cost going up, and also when a
// known violation is fixed or cost goes down without updating the baseline,
// so the baseline can't go stale. To accept an improvement:
//   npx vitest run src/lib/accuracy.test.ts -u
// The gates run first, so -u can't write a regression into the baseline.
import { describe, expect, it } from "vitest";
import baseline from "../test/corpus/accuracy-baseline.json";
import { FIXTURES, type Fixture, type TrueClass } from "../test/corpus/fixtures";
import { meta, senders } from "../test/mailFixtures";
import type { MessageKind } from "./messageKind";
import { protectionDecision, type ProtectionContext } from "./protectionPolicy";
import { senderVerdict, type VerdictTier } from "./verdict";

type Outcome = "leave" | "trash" | "warn" | "hold";

const COST: Record<TrueClass, Record<Outcome, number>> = {
  personal: { leave: 0, trash: 100, warn: 10, hold: 30 },
  transactional: { leave: 0, trash: 100, warn: 10, hold: 30 },
  // Stale codes (fixtures are 10 days old): deleting them is the goal.
  otp: { leave: 1, trash: 0, warn: 10, hold: 30 },
  bulk: { leave: 1, trash: 0, warn: 5, hold: 10 },
  social: { leave: 1, trash: 0, warn: 5, hold: 10 },
  phishing: { leave: 50, trash: 5, warn: 1, hold: 0 },
};
const CLASSES = Object.keys(COST) as TrueClass[];
const OUTCOMES: Outcome[] = ["leave", "trash", "warn", "hold"];
const KINDS: MessageKind[] = ["otp", "receipt", "shipping", "newsletter", "social", "other"];
const TIER_RANK: Record<VerdictTier, number> = { none: 0, warn: 1, hold: 2 };

interface Scored {
  fixture: Fixture;
  outcome: Outcome;
  tier: VerdictTier;
  kind: MessageKind;
  cost: number;
}

async function scoreCorpus(): Promise<Scored[]> {
  const addresses = FIXTURES.map((f) => f.msg.fromAddress.toLowerCase());
  expect(new Set(addresses).size, "fixture addresses must be unique").toBe(addresses.length);

  const metas = FIXTURES.map((f) => meta(f.msg));
  const list = await senders(metas);
  const ctx: ProtectionContext = {
    knownSenders: new Set(
      FIXTURES.filter((f) => f.correspondent).map((f) => f.msg.fromAddress.toLowerCase()),
    ),
  };

  return FIXTURES.map((fixture) => {
    const sender = list.find((s) => s.address === fixture.msg.fromAddress.toLowerCase());
    if (!sender) throw new Error(`no sender for ${fixture.id}`);
    const message = sender.messages[0];
    const verdict = senderVerdict(sender, { knownCorrespondent: Boolean(fixture.correspondent) });
    const outcome: Outcome = verdict.heldMessageIds.includes(message.id)
      ? "hold"
      : verdict.tier === "warn"
        ? "warn"
        : protectionDecision(message, sender.address, ctx).protected
          ? "leave"
          : "trash";
    return { fixture, outcome, tier: verdict.tier, kind: message.kind, cost: COST[fixture.cls][outcome] };
  });
}

function violations(scored: Scored[]): string[] {
  const tierOf = new Map(scored.map((s) => [s.fixture.id, s.tier]));
  const out: string[] = [];
  for (const s of scored) {
    if ((s.fixture.cls === "personal" || s.fixture.cls === "transactional") && s.outcome === "trash") {
      out.push(`deletable:${s.fixture.id}`);
    }
    const base = s.fixture.variantOf && tierOf.get(s.fixture.variantOf);
    if (base && TIER_RANK[s.tier] < TIER_RANK[base]) out.push(`evasion:${s.fixture.id}`);
  }
  return out.sort();
}

function report(scored: Scored[], costPer1000: number, tcr: number): string {
  const pad = (v: string | number, n: number) => String(v).padStart(n);
  const lines = [`Accuracy corpus: ${scored.length} messages`, ""];

  lines.push(`${"class".padEnd(14)}${OUTCOMES.map((o) => pad(o, 7)).join("")}   cost`);
  for (const cls of CLASSES) {
    const rows = scored.filter((s) => s.fixture.cls === cls);
    const counts = OUTCOMES.map((o) => pad(rows.filter((s) => s.outcome === o).length, 7)).join("");
    lines.push(`${cls.padEnd(14)}${counts}   ${rows.reduce((sum, s) => sum + s.cost, 0)}`);
  }

  lines.push("", `kind: expected ↓ / got →  ${KINDS.map((k) => pad(k.slice(0, 7), 8)).join("")}   recall`);
  for (const expected of KINDS) {
    const rows = scored.filter((s) => s.fixture.kind === expected);
    if (rows.length === 0) continue;
    const hits = rows.filter((s) => s.kind === expected).length;
    const cells = KINDS.map((got) => pad(rows.filter((s) => s.kind === got).length, 8)).join("");
    lines.push(`${expected.padEnd(26)}${cells}   ${pad(Math.round((100 * hits) / rows.length), 4)}%`);
  }

  lines.push(
    "",
    `cost per 1,000 messages: ${costPer1000.toFixed(1)}   (do-nothing ÷ Cluster: ${tcr.toFixed(2)})`,
  );
  const misses = scored.filter((s) => s.cost > 0).sort((a, b) => b.cost - a.cost);
  lines.push("", "costly outcomes:");
  for (const s of misses)
    lines.push(`  ${pad(s.cost, 3)}  ${s.fixture.id.padEnd(24)}${s.outcome.padEnd(7)}kind=${s.kind}`);
  return lines.join("\n");
}

describe("accuracy corpus", () => {
  it("meets the hard gates and the cost budget", async () => {
    const scored = await scoreCorpus();
    const total = scored.reduce((sum, s) => sum + s.cost, 0);
    const costPer1000 = (1000 * total) / scored.length;
    const doNothing = scored.reduce((sum, s) => sum + COST[s.fixture.cls].leave, 0);
    const tcr = total === 0 ? Infinity : doNothing / total;
    const found = violations(scored);
    console.log(report(scored, costPer1000, tcr));

    const current = { costPer1000: Number(costPer1000.toFixed(1)), violations: found };
    expect(
      found.filter((v) => !baseline.violations.includes(v)),
      "new hard-gate violations",
    ).toEqual([]);
    expect(current.costPer1000, "cost went up").toBeLessThanOrEqual(baseline.costPer1000);
    // Fails on any improvement too, until -u records it.
    await expect(`${JSON.stringify(current, null, 2)}\n`).toMatchFileSnapshot(
      "../test/corpus/accuracy-baseline.json",
    );
  });
});
