// Layer 0 of docs/algorithm-plan.md: make text comparable before any check
// reads it. One invisible character or one Cyrillic letter used to be enough
// to slip a brand name past every match (Boucher et al., "Bad Characters",
// IEEE S&P 2022).
//
// cleanText: NFKC (fullwidth and styled letters become plain ones), then
//   invisible and direction-control characters removed. For subjects.
// skeleton: cleanText, lowercased, then every character that looks like an
//   ASCII letter or digit replaced by it (UTS #39 confusables, vendored by
//   scripts/refresh-confusables.mjs). Some entries fold ASCII too (m → rn,
//   1 → l), so only ever compare a skeleton with another skeleton.
import confusables from "./data/confusables.generated.json";

const CONFUSABLES: Record<string, string> = {};
for (const [target, sources] of Object.entries(confusables.byTarget as Record<string, string>)) {
  for (const ch of sources) CONFUSABLES[ch] = target;
}
const INVISIBLE_RE = /[\p{Default_Ignorable_Code_Point}\p{Bidi_Control}]/gu;

export function cleanText(text: string): string {
  return text.normalize("NFKC").replace(INVISIBLE_RE, "");
}

export function skeleton(text: string): string {
  return [...cleanText(text).toLowerCase()].map((ch) => CONFUSABLES[ch] ?? ch).join("");
}
