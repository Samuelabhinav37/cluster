// Safety limits for the weekly list refresh (plan step 3.5). A refreshed list
// is committed only if it passes every check here; otherwise the workflow opens
// an issue and the old list stays. Guards against a source that broke (a list
// that shrank by half) or was poisoned (gmail.com on the spam list).
//
//   node scripts/dataset-guard.mjs      compares the working tree with HEAD

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** A list may lose at most this share of its entries in one refresh. */
export const MAX_SHRINK = 0.2;

/**
 * Problems with a refresh, empty when it's safe to commit.
 * `lists`: name -> { before, after } domain arrays.
 * `protectedDomains`: domains that must never be on a block list.
 */
export function guardProblems(lists, protectedDomains) {
  const problems = [];
  const keep = new Set(protectedDomains.map((d) => d.toLowerCase()));
  for (const [name, { before, after, block }] of Object.entries(lists)) {
    if (after.length < before.length * (1 - MAX_SHRINK)) {
      problems.push(`${name} shrank from ${before.length} to ${after.length} (more than ${MAX_SHRINK * 100}%)`);
    }
    if (!block) continue;
    // An entry blocks itself and its subdomains (spamList walks parents), so
    // it's bad when it is a protected domain or a parent of one. agent.qq.com
    // listed doesn't touch qq.com.
    const bad = after.filter((d) => {
      const entry = d.toLowerCase();
      return keep.has(entry) || [...keep].some((k) => k.endsWith(`.${entry}`));
    });
    if (bad.length > 0) problems.push(`${name} would block known-good domains: ${bad.slice(0, 10).join(", ")}`);
  }
  return problems;
}

const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const atHead = (file) => {
  try {
    return JSON.parse(execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  } catch {
    return undefined;
  }
};
const registryDomains = (r) => (r?.companies ?? []).flatMap((c) => c.domains);

function freeMailDomains() {
  const src = readFileSync("src/lib/freeMail.ts", "utf8");
  const block = src.slice(src.indexOf("FREE_MAIL_DOMAINS"), src.indexOf("]);", src.indexOf("FREE_MAIL_DOMAINS")));
  return [...block.matchAll(/"([a-z0-9.-]+\.[a-z]{2,})"/g)].map((m) => m[1]);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/").replace(/^(?=[A-Z]:)/, "/")}`) {
  const files = {
    "Spam list": ["src/lib/data/spamDomains.generated.json", (j) => j.domains, true],
    "Malware list": ["src/lib/data/malwareDomains.generated.json", (j) => j.domains, true],
    "Brand registry": ["public/data/brand-registry.json", registryDomains, false],
  };
  const lists = Object.fromEntries(
    Object.entries(files).map(([name, [file, get, block]]) => {
      const before = atHead(file);
      return [name, { before: before ? get(before) : [], after: get(read(file)), block }];
    }),
  );
  const hand = Object.values(read("src/lib/data/brandDomains.json")).flat();
  const problems = guardProblems(lists, [...hand, ...freeMailDomains(), ...lists["Brand registry"].after]);
  for (const [name, { before, after }] of Object.entries(lists)) console.log(`${name}: ${before.length} -> ${after.length}`);
  if (problems.length > 0) {
    console.log(`\nNot safe to commit:\n${problems.map((p) => `- ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}
