// Scores Cluster's classifiers against the labelled corpora in ./corpus.
// Test-only: evaluation.test.ts asserts floors on these numbers, and
// `npm run eval` prints them. Runs the real pipeline (metadata →
// senderModel → senderVerdict), so a number here is what a scan would do.
import { classifyMessageKind, looksAutomated, type MessageKind } from "../lib/messageKind";
import { protectionDecision } from "../lib/protectionPolicy";
import type { MessageRecord } from "../lib/senderModel";
import { senderVerdict, type VerdictTier } from "../lib/verdict";
import { meta, senders, DAY, NOW } from "./mailFixtures";
import { KIND_CORPUS } from "./corpus/kinds";
import { PROTECTION_CORPUS } from "./corpus/protection";
import { THREAT_CORPUS, type ThreatCase } from "./corpus/threats";

export interface Confusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export const precision = (c: Confusion): number => (c.tp + c.fp === 0 ? 1 : c.tp / (c.tp + c.fp));
export const recall = (c: Confusion): number => (c.tp + c.fn === 0 ? 1 : c.tp / (c.tp + c.fn));

function tally(rows: Array<{ predicted: boolean; actual: boolean }>): Confusion {
  const c: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const { predicted, actual } of rows) {
    if (predicted && actual) c.tp++;
    else if (predicted && !actual) c.fp++;
    else if (!predicted && actual) c.fn++;
    else c.tn++;
  }
  return c;
}

export interface ThreatResult {
  id: string;
  label: ThreatCase["label"];
  tags: string[];
  tier: VerdictTier;
}

export async function runThreatCorpus(corpus: ThreatCase[] = THREAT_CORPUS): Promise<ThreatResult[]> {
  const results: ThreatResult[] = [];
  for (const c of corpus) {
    const list = await senders(c.messages.map((m, i) => meta({ receivedAt: NOW - (i + 1) * DAY, ...m })));
    // One sender per case; the strongest tier wins if a case ever spans two.
    let tier: VerdictTier = "none";
    for (const s of list) {
      const v = senderVerdict(s, { knownCorrespondent: c.knownCorrespondent === true });
      if (v.tier === "hold" || (v.tier === "warn" && tier === "none")) tier = v.tier;
    }
    results.push({ id: c.id, label: c.label, tags: c.tags, tier });
  }
  return results;
}

export interface ThreatMetrics {
  /** Predicted positive = held. */
  hold: Confusion;
  /** Predicted positive = held or warned. */
  flag: Confusion;
  /** Per tag, flag confusion over the cases carrying it. */
  byTag: Record<string, Confusion>;
}

export function threatMetrics(results: ThreatResult[]): ThreatMetrics {
  const actual = (r: ThreatResult) => r.label === "malicious";
  const hold = tally(results.map((r) => ({ predicted: r.tier === "hold", actual: actual(r) })));
  const flag = tally(results.map((r) => ({ predicted: r.tier !== "none", actual: actual(r) })));
  const byTag: Record<string, Confusion> = {};
  for (const tag of new Set(results.flatMap((r) => r.tags))) {
    byTag[tag] = tally(
      results
        .filter((r) => r.tags.includes(tag))
        .map((r) => ({ predicted: r.tier !== "none", actual: actual(r) })),
    );
  }
  return { hold, flag, byTag };
}

export interface KindMetrics {
  accuracy: number;
  perKind: Record<MessageKind, Confusion>;
  misses: Array<{ subject: string; expected: MessageKind; got: MessageKind }>;
}

export function kindMetrics(): KindMetrics {
  const rows = KIND_CORPUS.map((c) => ({ ...c, got: classifyMessageKind(c.subject, c.hasListUnsubscribe) }));
  const kinds: MessageKind[] = ["otp", "receipt", "shipping", "newsletter", "social", "other"];
  const perKind = Object.fromEntries(
    kinds.map((k) => [k, tally(rows.map((r) => ({ predicted: r.got === k, actual: r.kind === k })))]),
  ) as Record<MessageKind, Confusion>;
  const misses = rows
    .filter((r) => r.got !== r.kind)
    .map((r) => ({ subject: r.subject, expected: r.kind, got: r.got }));
  return { accuracy: (rows.length - misses.length) / rows.length, perKind, misses };
}

export interface ProtectionMetrics {
  confusion: Confusion;
  misses: string[];
}

export function protectionMetrics(): ProtectionMetrics {
  const address = "sender@bulk.example";
  const rows = PROTECTION_CORPUS.map((c) => {
    const automated = c.record.looksAutomated ?? looksAutomated(true);
    const record: MessageRecord = {
      id: c.id,
      receivedAt: NOW - 40 * DAY,
      kind: c.record.kind ?? classifyMessageKind(c.record.subject ?? "", automated),
      isProtected: false,
      unread: true,
      sizeBytes: 1000,
      providerMarkedPersonal: false,
      looksAutomated: automated,
      ...c.record,
    };
    const ctx = { knownSenders: new Set(c.knownSender ? [address] : []) };
    return { id: c.id, actual: c.mustProtect, predicted: protectionDecision(record, address, ctx).protected };
  });
  return {
    confusion: tally(rows),
    misses: rows
      .filter((r) => r.predicted !== r.actual)
      .map((r) => `${r.id} (expected ${r.actual ? "protected" : "cleanable"})`),
  };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** A plain-text scorecard for `npm run eval`. */
export function formatScorecard(
  threat: ThreatMetrics,
  results: ThreatResult[],
  kind: KindMetrics,
  protection: ProtectionMetrics,
): string {
  const lines: string[] = [];
  lines.push(`Threat corpus: ${results.length} cases`);
  lines.push(`  hold:  precision ${pct(precision(threat.hold))}  recall ${pct(recall(threat.hold))}`);
  lines.push(`  flag:  precision ${pct(precision(threat.flag))}  recall ${pct(recall(threat.flag))}`);
  for (const [tag, c] of Object.entries(threat.byTag).sort()) {
    lines.push(`    ${tag.padEnd(18)} tp ${c.tp} fp ${c.fp} fn ${c.fn} tn ${c.tn}`);
  }
  const wrong = results.filter((r) => (r.label === "malicious") !== (r.tier !== "none"));
  if (wrong.length) lines.push(`  wrong: ${wrong.map((r) => `${r.id}[${r.tier}]`).join(", ")}`);
  lines.push(
    `Kind corpus: accuracy ${pct(kind.accuracy)}, otp precision ${pct(precision(kind.perKind.otp))}`,
  );
  for (const m of kind.misses) lines.push(`    "${m.subject}" expected ${m.expected}, got ${m.got}`);
  lines.push(
    `Protection corpus: recall ${pct(recall(protection.confusion))}, precision ${pct(precision(protection.confusion))}`,
  );
  for (const m of protection.misses) lines.push(`    ${m}`);
  return lines.join("\n");
}
