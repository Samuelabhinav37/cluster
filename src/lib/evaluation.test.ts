// Precision/recall floors over the labelled corpora in src/test/corpus.
//
// The floors are a ratchet: each is what Cluster scores today (rounded
// down), so a change that makes any number worse fails here. When a change
// improves a number, raise its floor in the same commit. TARGETS are the
// goals from the 2026-10-05 audit; the scorecard prints both.
//
// `npm run eval` prints the full scorecard, including every case Cluster
// gets wrong.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NOW } from "../test/mailFixtures";
import {
  formatScorecard,
  kindMetrics,
  precision,
  protectionMetrics,
  recall,
  runThreatCorpus,
  threatMetrics,
  type ThreatResult,
} from "../test/evaluation";

const FLOORS = {
  holdPrecision: 1,
  flagPrecision: 1,
  flagRecall: 1,
  kindAccuracy: 0.94,
  // Of the kinds sure enough to act on without asking, how many are right.
  actedKindAccuracy: 1,
  otpPrecision: 1,
  protectionRecall: 1,
};

const TARGETS = {
  holdPrecision: 0.9,
  flagRecall: 0.9,
  otpPrecision: 0.95,
  protectionRecall: 0.99,
};

// No @types/node here; the shell environment is all this needs.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

let results: ThreatResult[] = [];

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  results = await runThreatCorpus();
});
afterAll(() => vi.useRealTimers());

describe("evaluation floors", () => {
  it.runIf(env.CLUSTER_EVAL)("prints the scorecard", () => {
    console.log(
      `\n${formatScorecard(threatMetrics(results), results, kindMetrics(), protectionMetrics())}\nTargets: ${JSON.stringify(TARGETS)}\n`,
    );
  });

  it("the threat corpus has both classes", () => {
    expect(results.filter((r) => r.label === "malicious").length).toBeGreaterThan(30);
    expect(results.filter((r) => r.label === "benign").length).toBeGreaterThan(30);
  });

  it("held mail is malicious (hold precision)", () => {
    expect(precision(threatMetrics(results).hold)).toBeGreaterThanOrEqual(FLOORS.holdPrecision);
  });

  it("flagged mail is mostly malicious (flag precision)", () => {
    expect(precision(threatMetrics(results).flag)).toBeGreaterThanOrEqual(FLOORS.flagPrecision);
  });

  it("malicious mail is flagged (flag recall)", () => {
    expect(recall(threatMetrics(results).flag)).toBeGreaterThanOrEqual(FLOORS.flagRecall);
  });

  it("message kinds are right", () => {
    const k = kindMetrics();
    expect(k.accuracy).toBeGreaterThanOrEqual(FLOORS.kindAccuracy);
    expect(k.actedAccuracy).toBeGreaterThanOrEqual(FLOORS.actedKindAccuracy);
    expect(precision(k.perKind.otp)).toBeGreaterThanOrEqual(FLOORS.otpPrecision);
  });

  it("mail a person needs is protected (protection recall)", () => {
    expect(recall(protectionMetrics().confusion)).toBeGreaterThanOrEqual(FLOORS.protectionRecall);
  });
});
