import { ruleHasConditions, type ClusterRule, type RuleAction } from "./rules";
import type { MessageKind } from "./messageKind";

interface PromptSession {
  prompt(input: string, options?: { responseConstraint?: unknown }): Promise<string>;
  destroy(): void;
}

interface PromptApi {
  availability(): Promise<string>;
  create(options?: { systemPrompt?: string }): Promise<PromptSession>;
}

export interface RuleDraftResult {
  rule: ClusterRule;
  source: "on-device-ai" | "deterministic";
}

const ACTIONS: RuleAction[] = ["label", "archive", "trash", "markRead"];
const KINDS: MessageKind[] = ["otp", "receipt", "shipping", "newsletter", "social", "other"];

export const RULE_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "conditions", "action"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 80 },
    conditions: {
      type: "object",
      additionalProperties: false,
      properties: {
        fromDomain: { type: "string" },
        fromAddress: { type: "string" },
        olderThanDays: { type: "integer", minimum: 1, maximum: 3650 },
        hasUnsubscribe: { type: "boolean" },
        kind: { enum: KINDS },
        unread: { type: "boolean" },
      },
    },
    exceptions: {
      type: "object",
      additionalProperties: false,
      properties: {
        fromDomain: { type: "string" },
        fromAddress: { type: "string" },
        kind: { enum: KINDS },
      },
    },
    action: { enum: ACTIONS },
    labelName: { type: "string" },
    priority: { type: "integer", minimum: -100, maximum: 100 },
    stopProcessing: { type: "boolean" },
  },
} as const;

function promptApi(): PromptApi | undefined {
  return (globalThis as typeof globalThis & { LanguageModel?: PromptApi }).LanguageModel;
}

function normalizedDomain(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const domain = value.trim().toLowerCase().replace(/^@/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? domain : undefined;
}

function normalizedAddress(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const address = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : undefined;
}

function validateDraft(value: unknown): ClusterRule {
  if (!value || typeof value !== "object") throw new Error("Rule draft was not an object");
  const raw = value as Record<string, unknown>;
  const conditionsRaw = (raw.conditions ?? {}) as Record<string, unknown>;
  const exceptionsRaw = (raw.exceptions ?? {}) as Record<string, unknown>;
  const kind = KINDS.includes(conditionsRaw.kind as MessageKind)
    ? (conditionsRaw.kind as MessageKind)
    : undefined;
  const exceptionKind = KINDS.includes(exceptionsRaw.kind as MessageKind)
    ? (exceptionsRaw.kind as MessageKind)
    : undefined;
  const conditions = {
    fromDomain: normalizedDomain(conditionsRaw.fromDomain),
    fromAddress: normalizedAddress(conditionsRaw.fromAddress),
    olderThanDays:
      Number.isInteger(conditionsRaw.olderThanDays) &&
      Number(conditionsRaw.olderThanDays) >= 1 &&
      Number(conditionsRaw.olderThanDays) <= 3650
        ? Number(conditionsRaw.olderThanDays)
        : undefined,
    hasUnsubscribe:
      typeof conditionsRaw.hasUnsubscribe === "boolean" ? conditionsRaw.hasUnsubscribe : undefined,
    kind,
    unread: typeof conditionsRaw.unread === "boolean" ? conditionsRaw.unread : undefined,
  };
  if (!ruleHasConditions(conditions)) throw new Error("Draft needs at least one safe condition");
  const action = ACTIONS.includes(raw.action as RuleAction) ? (raw.action as RuleAction) : undefined;
  if (!action) throw new Error("Draft requested an unsupported action");
  const labelName =
    action === "label" && typeof raw.labelName === "string" ? raw.labelName.trim() : undefined;
  if (action === "label" && !labelName) throw new Error("A label draft needs a label name");
  const exceptions = {
    fromDomain: normalizedDomain(exceptionsRaw.fromDomain),
    fromAddress: normalizedAddress(exceptionsRaw.fromAddress),
    kind: exceptionKind,
  };
  return {
    id: crypto.randomUUID(),
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : "Drafted rule",
    enabled: false,
    conditions,
    exceptions: ruleHasConditions(exceptions) ? exceptions : undefined,
    action,
    labelName,
    priority: Number.isInteger(raw.priority) ? Math.max(-100, Math.min(100, Number(raw.priority))) : 0,
    stopProcessing: raw.stopProcessing === true,
  };
}

function deterministicDraft(instruction: string): ClusterRule {
  const text = instruction.trim();
  const lower = text.toLowerCase();
  const conditions: ClusterRule["conditions"] = {};
  const age = /older than\s+(\d+)\s+days?/.exec(lower)?.[1];
  if (age) conditions.olderThanDays = Math.max(1, Math.min(3650, Number(age)));
  if (/\bunread\b/.test(lower)) conditions.unread = true;
  if (/\b(read|already read)\b/.test(lower) && !/\bunread\b/.test(lower)) conditions.unread = false;
  if (/\b(newsletters?|mailing lists?)\b/.test(lower)) conditions.kind = "newsletter";
  else if (/\breceipts?\b/.test(lower)) conditions.kind = "receipt";
  else if (/\b(shipping|deliveries)\b/.test(lower)) conditions.kind = "shipping";
  else if (/\b(otp|one[- ]time codes?|verification codes?)\b/.test(lower)) conditions.kind = "otp";
  else if (/\bsocial\b/.test(lower)) conditions.kind = "social";
  if (/has (an )?unsubscribe|with (an )?unsubscribe/.test(lower)) conditions.hasUnsubscribe = true;

  const address = /\bfrom\s+([^\s,]+@[^\s,]+)/i.exec(text)?.[1];
  if (address) conditions.fromAddress = normalizedAddress(address);
  else {
    const domain = /\bfrom\s+@?([a-z0-9.-]+\.[a-z]{2,})\b/i.exec(text)?.[1];
    if (domain) conditions.fromDomain = normalizedDomain(domain);
  }
  if (!ruleHasConditions(conditions)) {
    throw new Error("Add a sender, age, kind, unread, or unsubscribe condition");
  }

  let action: RuleAction | undefined;
  if (/\barchive\b/.test(lower)) action = "archive";
  else if (/\b(trash|delete)\b/.test(lower)) action = "trash";
  else if (/\bmark (it |them )?read\b/.test(lower)) action = "markRead";
  else if (/\blabel\b/.test(lower)) action = "label";
  if (!action) throw new Error("Specify archive, Trash, mark read, or label");
  const labelName =
    action === "label"
      ? /\blabel(?: as)?\s+["']?([^"']+?)["']?(?:$|,|\bexcept\b)/i.exec(text)?.[1]?.trim()
      : undefined;
  if (action === "label" && !labelName) throw new Error("Specify a label name");

  return validateDraft({
    name: text.slice(0, 80),
    conditions,
    action,
    labelName,
    priority: 0,
    stopProcessing: /stop (processing|later rules)/.test(lower),
  });
}

export async function draftRuleFromNaturalLanguage(
  instruction: string,
  api: PromptApi | undefined = promptApi(),
): Promise<RuleDraftResult> {
  if (!instruction.trim()) throw new Error("Describe the rule first");
  if (!api || (await api.availability()) === "unavailable") {
    return { rule: deterministicDraft(instruction), source: "deterministic" };
  }
  const session = await api.create({
    systemPrompt:
      "Convert only the user's rule intent to the supplied JSON schema. Never add actions or conditions the user did not request. Permanent delete and sending mail are forbidden.",
  });
  try {
    const output = await session.prompt(instruction, { responseConstraint: RULE_DRAFT_SCHEMA });
    return { rule: validateDraft(JSON.parse(output)), source: "on-device-ai" };
  } finally {
    session.destroy();
  }
}
