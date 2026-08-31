import type { ProviderId } from "./providers/emailProvider";
import { ruleActions, type ClusterRule } from "./rules";
import { withStorageLock } from "./storageLock";

const STORAGE_KEY = "clusterRuleCompletionLedger";
export const RULE_COMPLETION_TTL_MS = 180 * 24 * 60 * 60 * 1_000;
export const MAX_RULE_COMPLETION_RECEIPTS = 10_000;

export interface RuleCompletionReceipt {
  key: string;
  completedAt: number;
}

export interface CompletedRuleMessages {
  rule: ClusterRule;
  idsByProvider: Map<ProviderId, string[]>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

// Two independent 32-bit accumulators keep storage keys compact while making
// accidental signature collisions vanishingly unlikely. This is identity, not
// a security boundary.
function compactHash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

/** Changes only when matching conditions, exceptions, or ordered actions change. */
export function ruleExecutionSignature(rule: ClusterRule): string {
  return compactHash(
    JSON.stringify(
      canonicalize({
        conditions: rule.conditions,
        exceptions: rule.exceptions,
        actions: ruleActions(rule),
      }),
    ),
  );
}

export function ruleCompletionKey(rule: ClusterRule, provider: ProviderId, messageId: string): string {
  return JSON.stringify([rule.id, ruleExecutionSignature(rule), provider, messageId]);
}

export function pruneRuleCompletionReceipts(
  receipts: RuleCompletionReceipt[],
  now = Date.now(),
): RuleCompletionReceipt[] {
  const cutoff = now - RULE_COMPLETION_TTL_MS;
  const newestByKey = new Map<string, RuleCompletionReceipt>();
  for (const receipt of receipts) {
    if (!receipt || typeof receipt.key !== "string" || !Number.isFinite(receipt.completedAt)) continue;
    if (receipt.completedAt < cutoff || receipt.completedAt > now) continue;
    const previous = newestByKey.get(receipt.key);
    if (!previous || previous.completedAt < receipt.completedAt) newestByKey.set(receipt.key, receipt);
  }
  return [...newestByKey.values()]
    .sort((a, b) => a.completedAt - b.completedAt)
    .slice(-MAX_RULE_COMPLETION_RECEIPTS);
}

async function readReceipts(): Promise<RuleCompletionReceipt[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(data[STORAGE_KEY]) ? (data[STORAGE_KEY] as RuleCompletionReceipt[]) : [];
}

export async function getRuleCompletionKeys(now = Date.now()): Promise<Set<string>> {
  return withStorageLock(STORAGE_KEY, async () => {
    const stored = await readReceipts();
    const current = pruneRuleCompletionReceipts(stored, now);
    if (current.length !== stored.length) await chrome.storage.local.set({ [STORAGE_KEY]: current });
    return new Set(current.map(({ key }) => key));
  });
}

export async function recordRuleCompletions(
  completions: CompletedRuleMessages[],
  now = Date.now(),
): Promise<void> {
  const incoming: RuleCompletionReceipt[] = completions.flatMap(({ rule, idsByProvider }) =>
    [...idsByProvider].flatMap(([provider, ids]) =>
      ids.map((id) => ({ key: ruleCompletionKey(rule, provider, id), completedAt: now })),
    ),
  );
  if (incoming.length === 0) return;
  await withStorageLock(STORAGE_KEY, async () => {
    const next = pruneRuleCompletionReceipts([...(await readReceipts()), ...incoming], now);
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  });
}
