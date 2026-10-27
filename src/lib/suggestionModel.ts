// Layer 3, first slice: learns which clean-up suggestions you take, from your
// own accept / dismiss / undo choices, and ranks suggestions by it. Naive
// Bayes over a small closed set of named sender features, so every weight is
// readable and nothing about a sender's address or subjects is stored. It only
// reorders what buildSuggestions already allows; it can never make mail
// deletable. Lives in chrome.storage.local, never sync.
// shortcut: one question (take the suggestion or not) and named features only;
// the kind model, hashed subject words, global priors and logistic regression
// past ~200 labels come in later Stage F slices (docs/algorithm-plan.md).
import type { SenderSummary } from "./senderModel";
import type { SenderProfile } from "./senderProfile";

export type ModelFeedback = "accept" | "dismiss" | "undo";

export interface SuggestionModel {
  v: 1;
  updatedAt: number;
  /** Decayed label weight for "took it" and "didn't". */
  accepted: number;
  rejected: number;
  /** Decayed per-feature weight under each label. */
  acceptedBy: Record<string, number>;
  rejectedBy: Record<string, number>;
}

const STORAGE_KEY = "suggestionModel";
const HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000;
// An undo says Cluster got it wrong, so it counts more than a dismissal.
const WEIGHT: Record<ModelFeedback, number> = { accept: 1, dismiss: 1, undo: 3 };
const MAX_FEATURES = 500;

export function emptySuggestionModel(now = Date.now()): SuggestionModel {
  return { v: 1, updatedAt: now, accepted: 0, rejected: 0, acceptedBy: {}, rejectedBy: {} };
}

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function bucket(value: number, edges: [number, string][], last: string): string {
  for (const [edge, name] of edges) if (value < edge) return name;
  return last;
}

const LOCAL_PART: [RegExp, string][] = [
  [/^(no-?reply|do-?not-?reply|donotreply)/, "noreply"],
  [/(news|digest|weekly|letter|update)/, "news"],
  [/(order|shop|store|receipt|purchase)/, "orders"],
  [/(bill|invoice|payment|account)/, "billing"],
  [/(notif|alert|info|hello|team|mail)/, "notify"],
  [/(support|help|service|care)/, "support"],
];

/** Named facts about a sender, readable as reasons. Never addresses or text. */
export function suggestionFeatures(sender: SenderSummary, profile: SenderProfile, action?: string): string[] {
  const local = sender.address.split("@")[0].toLowerCase();
  const u = sender.unsubscribe;
  const features = [
    `tier:${profile.tier}`,
    `kind:${profile.kind}`,
    `tab:${mostCommon(sender.messages.map((m) => m.tab ?? "none")) ?? "none"}`,
    `open:${profile.openRate === null ? "unknown" : bucket(profile.openRate, [[0.01, "none"], [0.1, "rare"], [0.4, "some"]], "often")}`,
    `rate:${bucket(profile.perMonth, [[1, "lt1"], [4, "1-4"], [15, "4-15"]], "15+")}`,
    `sending:${profile.stillSending ? "yes" : "stopped"}`,
    `list:${profile.listId ? "id" : "none"}`,
    `unsub:${u.postUrl ? "oneclick" : u.httpUrl || u.mailto ? "link" : "none"}`,
    `local:${LOCAL_PART.find(([re]) => re.test(local))?.[1] ?? "other"}`,
  ];
  if (action) features.push(`act:${action}`);
  return features;
}

function decayed(model: SuggestionModel, now: number): SuggestionModel {
  const f = Math.pow(0.5, Math.max(0, now - model.updatedAt) / HALF_LIFE_MS);
  if (f === 1) return model;
  const scale = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v * f]));
  return {
    v: 1,
    updatedAt: now,
    accepted: model.accepted * f,
    rejected: model.rejected * f,
    acceptedBy: scale(model.acceptedBy),
    rejectedBy: scale(model.rejectedBy),
  };
}

/** Adds one labelled example. Pure; the caller saves the result. */
export function learn(
  model: SuggestionModel,
  features: readonly string[],
  feedback: ModelFeedback,
  now = Date.now(),
): SuggestionModel {
  const next = decayed(model, now);
  const w = WEIGHT[feedback];
  const took = feedback === "accept";
  const by = { ...(took ? next.acceptedBy : next.rejectedBy) };
  for (const f of new Set(features)) by[f] = (by[f] ?? 0) + w;
  return took
    ? { ...next, updatedAt: now, accepted: next.accepted + w, acceptedBy: by }
    : { ...next, updatedAt: now, rejected: next.rejected + w, rejectedBy: by };
}

/** Chance you take a suggestion with these features. 0.5 with no history. */
export function acceptChance(model: SuggestionModel, features: readonly string[], now = Date.now()): number {
  const m = decayed(model, now);
  // Laplace smoothing: with no labels every term is log(1) = 0.
  let logOdds = Math.log((m.accepted + 1) / (m.rejected + 1));
  for (const f of new Set(features)) {
    const pa = ((m.acceptedBy[f] ?? 0) + 1) / (m.accepted + 2);
    const pr = ((m.rejectedBy[f] ?? 0) + 1) / (m.rejected + 2);
    logOdds += Math.log(pa / pr);
  }
  return 1 / (1 + Math.exp(-logOdds));
}

function cleanWeights(value: unknown): Record<string, number> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const entries = Object.entries(value).filter(
    ([k, v]) => k.length <= 40 && typeof v === "number" && Number.isFinite(v) && v >= 0,
  );
  return entries.length <= MAX_FEATURES ? Object.fromEntries(entries) : undefined;
}

/** A stored model, or an empty one if it's missing or doesn't look right. */
export function normalizeSuggestionModel(value: unknown, now = Date.now()): SuggestionModel {
  if (typeof value !== "object" || value === null) return emptySuggestionModel(now);
  const r = value as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  const acceptedBy = cleanWeights(r.acceptedBy);
  const rejectedBy = cleanWeights(r.rejectedBy);
  const accepted = num(r.accepted);
  const rejected = num(r.rejected);
  const updatedAt = num(r.updatedAt);
  if (r.v !== 1 || !acceptedBy || !rejectedBy || accepted === undefined || rejected === undefined || !updatedAt) {
    return emptySuggestionModel(now);
  }
  return { v: 1, updatedAt: Math.min(updatedAt, now), accepted, rejected, acceptedBy, rejectedBy };
}

export async function loadSuggestionModel(): Promise<SuggestionModel> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeSuggestionModel(data[STORAGE_KEY]);
}

export async function saveSuggestionModel(model: SuggestionModel): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: model });
}
