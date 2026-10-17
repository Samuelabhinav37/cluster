// Dev-only tool. Refreshes public/data/public-suffix.json from the Public
// Suffix List (publicsuffix.org, MPL-2.0), the list browsers use to tell a
// registrable domain (example.co.uk) from a public suffix (co.uk).
//
// Not part of the build. Run it by hand, review the diff, commit:
//
//   npm run refresh:psl
//
// The file ships inside the extension as a data asset, not inside the JS
// bundle, and src/lib/publicSuffix.ts loads it once at startup. Rules are
// stored in ASCII (punycode) form because that is how domains arrive in mail
// headers, grouped by their last label to keep the file small. Both the ICANN
// and private sections are kept, so evil.github.io is its own site.
import { writeFile } from "node:fs/promises";
import { domainToASCII, fileURLToPath } from "node:url";
import path from "node:path";

const SOURCE = "https://publicsuffix.org/list/public_suffix_list.dat";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "public-suffix.json");

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`${SOURCE}: ${response.status}`);
const text = await response.text();

/** "*.ck" and "!www.ck" keep their marker; the rest of the rule is punycoded. */
function toAscii(rule) {
  const marker = rule.startsWith("!") ? "!" : "";
  const body = marker ? rule.slice(1) : rule;
  const wildcard = body.startsWith("*.") ? "*." : "";
  const name = wildcard ? body.slice(2) : body;
  const ascii = domainToASCII(name);
  if (!ascii) throw new Error(`can't convert rule ${rule}`);
  return marker + wildcard + ascii;
}

const byLastLabel = {};
let count = 0;
for (const line of text.split("\n")) {
  const rule = line.trim().split(/\s/)[0];
  if (!rule || rule.startsWith("//")) continue;
  const ascii = toAscii(rule.toLowerCase());
  const lastLabel = ascii.slice(ascii.lastIndexOf(".") + 1);
  (byLastLabel[lastLabel] ??= []).push(ascii);
  count++;
}
if (count < 5000) throw new Error(`only ${count} rules, the download looks truncated`);

const rules = Object.fromEntries(
  Object.entries(byLastLabel)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, list]) => [label, [...new Set(list)].sort().join(",")]),
);
const out = {
  source: SOURCE,
  license: "MPL-2.0 (Public Suffix List, Mozilla Foundation)",
  fetchedAt: new Date().toISOString().slice(0, 10),
  ruleCount: count,
  rules,
};
await writeFile(OUT, JSON.stringify(out) + "\n");
console.log(`wrote ${count} rules to ${path.relative(process.cwd(), OUT)}`);
