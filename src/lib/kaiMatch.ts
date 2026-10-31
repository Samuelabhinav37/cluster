// Kai's typed questions: BM25 word matching over each answer's question and
// example phrasings, with synonyms, plus what this person picked before.
// Everything stays on this computer; there is no model and no network.

export interface KaiDoc {
  id: string;
  /** The question as Kai lists it, plus other ways people say it. */
  texts: string[];
}

/** Word → answer id → how often it was picked, and when last. */
export type KaiLearned = Record<string, Record<string, { n: number; at: number }>>;

const STOP = new Set(
  "a an the i me my to do does is are am be can could will would should how what why where when who which it its this that these those of for in on at by with from and or not no yes you your we our us please there".split(" "),
);

// Words people use for the same thing, folded to one.
const SYNONYMS: Record<string, string> = {
  delete: "trash", remove: "trash", bin: "trash", erase: "trash", clear: "trash", clean: "trash", cleanup: "trash", junk: "spam",
  unsubscribe: "unsub", subscription: "unsub", newsletter: "unsub", list: "unsub", leave: "unsub", stop: "unsub",
  filter: "rule", automatic: "rule", automatically: "rule", auto: "rule",
  phishing: "scam", fraud: "scam", fake: "scam", suspicious: "scam", flagged: "scam", flag: "scam", hacker: "scam",
  label: "sort", folder: "sort", organize: "sort", organise: "sort", file: "sort", tidy: "sort", categorize: "sort",
  restore: "undo", revert: "undo", back: "undo", mistake: "undo", recover: "undo", wrong: "undo", accident: "undo",
  disappear: "missing", gone: "missing", vanish: "missing", lost: "missing",
  privacy: "read", private: "read", safe: "read", data: "read", spy: "read",
  key: "shortcut", keyboard: "shortcut", hotkey: "shortcut",
  find: "search", look: "search", seek: "search",
  people: "contact", person: "contact", sender: "contact", senders: "contact",
  hold: "held", quarantine: "held", block: "held",
  star: "starred", important: "starred",
};

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    // "quarantined" stems to "quarantin"; try it with its e back too.
    .map((w) => SYNONYMS[w] ?? SYNONYMS[stem(w)] ?? SYNONYMS[`${stem(w)}e`] ?? stem(w));
}

const K1 = 1.2;
const B = 0.75;
const HALF_LIFE_MS = 60 * 86_400_000;
/** Below this, Kai says it doesn't know rather than guess. */
export const MIN_SCORE = 1.2;

/** Answers for `text`, best first, each with its score. Empty when nothing is close. */
export function matchKai(
  text: string,
  docs: readonly KaiDoc[],
  learned: KaiLearned = {},
  now = Date.now(),
): { id: string; score: number }[] {
  const q = [...new Set(words(text))];
  if (q.length === 0) return [];
  const bags = docs.map((d) => words(d.texts.join(" ")));
  const avg = bags.reduce((n, b) => n + b.length, 0) / Math.max(1, bags.length);
  const df = new Map<string, number>();
  for (const bag of bags) for (const w of new Set(bag)) df.set(w, (df.get(w) ?? 0) + 1);
  return docs
    .map((d, i) => {
      const bag = bags[i];
      let score = 0;
      for (const w of q) {
        const tf = bag.filter((x) => x === w).length;
        if (tf > 0) {
          const idf = Math.log(1 + (docs.length - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
          score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * bag.length) / avg)));
        }
        // What this person picked for this word before, fading over 60 days.
        const seen = learned[w]?.[d.id];
        if (seen) score += Math.log1p(seen.n * 0.5 ** ((now - seen.at) / HALF_LIFE_MS));
      }
      return { id: d.id, score };
    })
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
}

/** Links the words of `text` to the answer picked for it. */
export function learnPick(learned: KaiLearned, text: string, id: string, now = Date.now()): KaiLearned {
  const next: KaiLearned = { ...learned };
  for (const w of new Set(words(text))) {
    const prev = next[w]?.[id];
    const n = prev ? prev.n * 0.5 ** ((now - prev.at) / HALF_LIFE_MS) : 0;
    next[w] = { ...next[w], [id]: { n: n + 1, at: now } };
  }
  return next;
}

/** Questions Kai couldn't answer, newest first, at most 50. */
export function rememberMiss(misses: readonly { q: string; at: number }[], q: string, now = Date.now()) {
  return [{ q, at: now }, ...misses.filter((m) => m.q !== q)].slice(0, 50);
}
