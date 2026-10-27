// Layer 3, second slice: learns what your receipts look like from your
// answers to "Receipts? Keep them" in Clear out. Naive Bayes, receipt-like or
// not, over named facts plus salted hashes of subject words. Its only power is
// to add protection: a sender you said yes to is kept whole, and once the model
// has enough answers both ways, a new sender's mail it is sure about (90%+) is
// kept too. A "no" only trains it; it never removes any protection.
// The salt sits next to the weights, so it stops linking one install's
// weights to another's, not someone with this browser profile from testing
// guesses. Lives in chrome.storage.local, never sync.
import { cleanText, skeleton } from "./normalize";
import type { MessageRecord, SenderSummary } from "./senderModel";
import { localPartClass } from "./suggestionModel";

export type KindAnswer = "yes" | "no";

export interface KindModel {
  v: 1;
  salt: string;
  /** Answers given, one per sender (each sender weighs one example). */
  yes: number;
  no: number;
  yesBy: Record<string, number>;
  noBy: Record<string, number>;
  /** Your answer per sender key. */
  answers: Record<string, KindAnswer>;
}

const STORAGE_KEY = "kindModel";
const BUCKETS = 1 << 16;
const MAX_WEIGHTS = 20_000;
const MAX_ANSWERS = 2_000;
const MESSAGES_PER_ANSWER = 20;
export const LEARNED_THRESHOLD = 0.9;
/** Answers needed each way before the model protects a sender on its own. */
export const MIN_ANSWERS_EACH_WAY = 3;

export function emptyKindModel(salt = newSalt()): KindModel {
  return { v: 1, salt, yes: 0, no: 0, yesBy: {}, noBy: {}, answers: {} };
}

function newSalt(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** FNV-1a over salt + word, folded into 2^16 buckets. */
function bucketOf(salt: string, word: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${salt}:${word}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return `w:${((h >>> 0) % BUCKETS).toString(36)}`;
}

/** Subject words, numbers folded to "#" (before the skeleton turns 1 into l),
 * look-alike letters mapped, at most 20. */
export function subjectWords(subject: string): string[] {
  const words = skeleton(cleanText(subject).replace(/\d+/g, "#"))
    .split(/[^\p{L}#]+/u)
    .filter((w) => w.length >= 2 && w.length <= 24);
  return [...new Set(words)].slice(0, 20);
}

export function messageFeatures(model: KindModel, message: MessageRecord, senderAddress: string): string[] {
  return [
    `local:${localPartClass(senderAddress)}`,
    `tab:${message.tab ?? "none"}`,
    `auto:${message.looksAutomated ? "yes" : "no"}`,
    `kind:${message.kind}`,
    ...subjectWords(message.subject ?? "").map((w) => bucketOf(model.salt, w)),
  ];
}

/** Records your answer for a sender and trains on up to 20 of its messages. */
export function answer(model: KindModel, sender: SenderSummary, value: KindAnswer): KindModel {
  if (model.answers[sender.key] || Object.keys(model.answers).length >= MAX_ANSWERS) return model;
  const sample = sender.messages.slice(0, MESSAGES_PER_ANSWER);
  if (sample.length === 0) return model;
  const yes = value === "yes";
  const by = { ...(yes ? model.yesBy : model.noBy) };
  for (const message of sample) {
    for (const f of new Set(messageFeatures(model, message, sender.address))) {
      by[f] = (by[f] ?? 0) + 1 / sample.length;
    }
  }
  const answers = { ...model.answers, [sender.key]: value };
  return yes
    ? { ...model, yes: model.yes + 1, yesBy: by, answers }
    : { ...model, no: model.no + 1, noBy: by, answers };
}

/** Chance this message is a receipt-like one you keep. 0.5 before answers. */
export function receiptChance(model: KindModel, message: MessageRecord, senderAddress: string): number {
  let logOdds = Math.log((model.yes + 1) / (model.no + 1));
  for (const f of new Set(messageFeatures(model, message, senderAddress))) {
    const py = ((model.yesBy[f] ?? 0) + 1) / (model.yes + 2);
    const pn = ((model.noBy[f] ?? 0) + 1) / (model.no + 2);
    logOdds += Math.log(py / pn);
  }
  return 1 / (1 + Math.exp(-logOdds));
}

export function modelIsTrained(model: KindModel): boolean {
  return model.yes >= MIN_ANSWERS_EACH_WAY && model.no >= MIN_ANSWERS_EACH_WAY;
}

/**
 * Sets learnedTransactional on mail from senders you said yes to and, once
 * trained, on mail the model is sure about. Never clears the flag.
 */
export function markLearnedTransactional(senders: readonly SenderSummary[], model: KindModel): void {
  const trained = modelIsTrained(model);
  for (const sender of senders) {
    const said = model.answers[sender.key];
    if (said === "no") continue;
    for (const message of sender.messages) {
      if (said === "yes") message.learnedTransactional = "you";
      else if (trained && !message.learnedTransactional && receiptChance(model, message, sender.address) >= LEARNED_THRESHOLD) {
        message.learnedTransactional = "model";
      }
    }
  }
}

/** Senders to ask about: unanswered, not flagged, not mostly Promotions
 * (rarely receipts, and asking would look silly), least certain first. */
export function sendersToAsk(model: KindModel, senders: readonly SenderSummary[], max = 3): SenderSummary[] {
  const scored = senders
    .filter((s) => !model.answers[s.key] && s.threatSignals.length === 0 && s.messages.length > 0)
    .map((s) => {
      const sample = s.messages.slice(0, MESSAGES_PER_ANSWER);
      const p = sample.reduce((sum, m) => sum + receiptChance(model, m, s.address), 0) / sample.length;
      const promo = sample.filter((m) => m.promotion).length / sample.length;
      return { s, doubt: Math.round(Math.abs(p - 0.5) * 20), promo };
    })
    .filter(({ promo }) => promo <= 0.5);
  scored.sort((a, b) => a.doubt - b.doubt || b.s.messages.length - a.s.messages.length);
  return scored.slice(0, max).map(({ s }) => s);
}

function cleanWeights(value: unknown): Record<string, number> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const entries = Object.entries(value).filter(
    ([k, v]) => k.length <= 40 && typeof v === "number" && Number.isFinite(v) && v >= 0,
  );
  return entries.length <= MAX_WEIGHTS ? Object.fromEntries(entries) : undefined;
}

/** A stored model, or a fresh one if it's missing or doesn't look right. */
export function normalizeKindModel(value: unknown): KindModel {
  if (typeof value !== "object" || value === null) return emptyKindModel();
  const r = value as Record<string, unknown>;
  const yesBy = cleanWeights(r.yesBy);
  const noBy = cleanWeights(r.noBy);
  const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  const yes = count(r.yes);
  const no = count(r.no);
  const salt = typeof r.salt === "string" && /^[0-9a-f]{16}$/.test(r.salt) ? r.salt : undefined;
  const answers =
    typeof r.answers === "object" && r.answers !== null
      ? Object.entries(r.answers).filter(([, v]) => v === "yes" || v === "no")
      : undefined;
  if (r.v !== 1 || !salt || !yesBy || !noBy || yes === undefined || no === undefined || !answers) {
    return emptyKindModel();
  }
  if (answers.length > MAX_ANSWERS) return emptyKindModel();
  return { v: 1, salt, yes, no, yesBy, noBy, answers: Object.fromEntries(answers) as Record<string, KindAnswer> };
}

export async function loadKindModel(): Promise<KindModel> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeKindModel(data[STORAGE_KEY]);
}

export async function saveKindModel(model: KindModel): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: model });
}
