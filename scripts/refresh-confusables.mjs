// Dev-only tool. Refreshes src/lib/data/confusables.generated.json from the
// Unicode confusables table (UTS #39, unicode.org terms of use), the data
// browsers use to spot lookalike domains.
//
// Not part of the build. Run it by hand, review the diff, commit:
//
//   npm run refresh:confusables
//
// Only the part Cluster needs is kept: single characters that look like an
// ASCII letter or digit (Cyrillic а → a, fullwidth ｐ → p, 𝐏 → p), lowercased,
// since brand names and domains are matched in lowercase. src/lib/normalize.ts
// applies it after lowercasing, NFKC and stripping invisible characters.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SOURCE = "https://www.unicode.org/Public/security/latest/confusables.txt";
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "data",
  "confusables.generated.json",
);

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`${SOURCE}: ${response.status}`);
const text = await response.text();
const version = text.match(/^# Version: (\S+)/m)?.[1] ?? text.match(/^# Date: (.+)$/m)?.[1] ?? "unknown";

const fromHex = (hex) =>
  String.fromCodePoint(
    ...hex
      .trim()
      .split(/\s+/)
      .map((h) => parseInt(h, 16)),
  );
const map = {};
for (const line of text.split("\n")) {
  const [source, target] = line.split("#")[0].split(";");
  if (!source || !target) continue;
  const from = fromHex(source).toLowerCase();
  const to = fromHex(target).toLowerCase();
  // One character in, ASCII letters or digits out, and not a no-op.
  if ([...from].length !== 1 || !/^[a-z0-9]+$/.test(to) || from === to) continue;
  map[from] = to;
}
const count = Object.keys(map).length;
if (count < 1000) throw new Error(`only ${count} entries, the download looks wrong`);

// Grouped by target ({"a": "аɑα…"}) to keep the bundle small.
const byTarget = {};
for (const [from, to] of Object.entries(map).sort(([a], [b]) => a.codePointAt(0) - b.codePointAt(0))) {
  byTarget[to] = (byTarget[to] ?? "") + from;
}
const out = {
  source: SOURCE,
  license: "Unicode License v3 (https://www.unicode.org/terms_of_use.html)",
  version,
  fetchedAt: new Date().toISOString().slice(0, 10),
  byTarget: Object.fromEntries(Object.entries(byTarget).sort(([a], [b]) => a.localeCompare(b))),
};
await writeFile(OUT, JSON.stringify(out) + "\n");
console.log(`${count} confusables → ${OUT}`);
