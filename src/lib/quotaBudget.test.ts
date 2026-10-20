// Quota budget for a first build, measured with the Gmail quota simulator
// (src/test/quotaSim.ts). Same ratchet as evaluation.test.ts: the ceilings
// are today's cost (rounded up), so a change that spends more fails here,
// and a change that spends less lowers its ceiling in the same commit.
// `npm run bench:quota` prints the full table, including 100k.
import { describe, expect, it } from "vitest";
import { formatReport, SHAPES, simulateFirstBuild } from "../test/quotaSim";

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

const CEILINGS: Record<string, { units: number; firstScreen: number }> = {
  "5k": { units: 126_000, firstScreen: 3_100 },
  "20k": { units: 510_000, firstScreen: 3_100 },
};

describe("first-build quota budget", () => {
  for (const [name, ceiling] of Object.entries(CEILINGS)) {
    it(`${name} mailbox stays within its unit ceiling`, async () => {
      const report = await simulateFirstBuild(SHAPES[name]);
      expect(report.units).toBeLessThanOrEqual(ceiling.units);
      expect(report.unitsToFirstScreen).toBeLessThanOrEqual(ceiling.firstScreen);
    });
  }

  it.runIf(env.CLUSTER_BENCH)(
    "prints the table",
    async () => {
      const lines: string[] = [];
      for (const [name, shape] of Object.entries(SHAPES))
        lines.push(formatReport(name, await simulateFirstBuild(shape)));
      console.log(`\n${lines.join("\n")}\n`);
    },
    120_000,
  );
});
