// Builds the published phishing-domain dataset (src/lib/phishingList.ts)
// from Phishing.Database's ACTIVE list (MIT, github.com/Phishing-Database/
// Phishing.Database). Run by publish-datasets.yml before signing:
//
//   node scripts/refresh-phishing-domains.mjs dist-pages/phishingDomains.json
//
// Optional: TOP_SITES_FILE=path/to/tranco.csv drops any domain on a
// top-sites list (rank,domain lines) as well.
//
// What it publishes, and why:
// - Registrable domains (PSL, public/data/public-suffix.json), except on
//   shared hosting: a registrable domain with SHARED_HOST_MIN or more listed
//   hosts (weebly.com, glitch.me, 000webhostapp.com) is a platform, so only
//   its exact listed hosts go in and its ordinary mail never matches.
// - Never a brand domain (src/lib/data/brandDomains.json), a free-mail
//   domain, or a top site: a feed error there would warn on real mail.
// - As a sorted Float64Array of cyrb53 hashes, base64: about a third of the
//   size of the names, and matched by binary search.
import { readFileSync, writeFileSync } from "node:fs";

const FEED =
  "https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-domains-ACTIVE.txt";
const SHARED_HOST_MIN = 20;
// Mirrors src/lib/freeMail.ts.
const FREE_MAIL = [
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "protonmail.com", "proton.me", "gmx.com", "mail.com",
];

// Same function as src/lib/domainHash.ts (pinned by domainHash.test.ts).
export function cyrb53(text, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function loadPsl() {
  const data = JSON.parse(readFileSync(new URL("../public/data/public-suffix.json", import.meta.url), "utf8"));
  return new Map(Object.entries(data.rules).map(([label, joined]) => [label, new Set(joined.split(",").filter(Boolean))]));
}

/** Same algorithm as src/lib/publicSuffix.ts registrableDomainOf. */
export function registrable(domain, psl) {
  const labels = domain.split(".").filter(Boolean);
  if (labels.length === 0) return null;
  const rules = psl.get(labels[labels.length - 1]);
  let longest = 1;
  if (rules) {
    for (let i = 0; i < labels.length; i++) {
      const candidate = labels.slice(i).join(".");
      const count = labels.length - i;
      if (rules.has(`!${candidate}`)) {
        longest = count - 1;
        break;
      }
      const parent = labels.slice(i + 1).join(".");
      if (rules.has(candidate) || (parent && rules.has(`*.${parent}`))) longest = Math.max(longest, count);
    }
  }
  return labels.length <= longest ? null : labels.slice(labels.length - longest - 1).join(".");
}

export function buildEntries(hosts, { psl, excluded }) {
  const byRegistrable = new Map();
  for (const host of hosts) {
    const reg = registrable(host, psl);
    if (!reg || excluded.has(reg)) continue;
    if (!byRegistrable.has(reg)) byRegistrable.set(reg, new Set());
    byRegistrable.get(reg).add(host);
  }
  const entries = new Set();
  for (const [reg, listed] of byRegistrable) {
    if (listed.size >= SHARED_HOST_MIN) for (const host of listed) entries.add(host);
    else entries.add(reg);
  }
  return entries;
}

export function encode(entries) {
  const hashes = new Float64Array([...entries].map((d) => cyrb53(d)).sort((a, b) => a - b));
  return Buffer.from(hashes.buffer).toString("base64");
}

async function main() {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: node scripts/refresh-phishing-domains.mjs <out.json>");
    process.exit(2);
  }
  const response = await fetch(FEED);
  if (!response.ok) {
    console.error(`Phishing.Database request failed: ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  const hosts = (await response.text())
    .split("\n")
    .map((line) => line.trim().toLowerCase().replace(/\.$/, ""))
    .filter((line) => line && !line.startsWith("#") && line.includes(".") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(line));

  const brands = JSON.parse(readFileSync(new URL("../src/lib/data/brandDomains.json", import.meta.url), "utf8"));
  const excluded = new Set([...FREE_MAIL, ...Object.values(brands).flat()]);
  if (process.env.TOP_SITES_FILE) {
    for (const line of readFileSync(process.env.TOP_SITES_FILE, "utf8").split("\n")) {
      const domain = line.split(",")[1]?.trim().toLowerCase();
      if (domain) excluded.add(domain);
    }
  }
  const psl = loadPsl();
  for (const domain of [...excluded]) {
    const reg = registrable(domain, psl);
    if (reg) excluded.add(reg);
  }

  const entries = buildEntries(hosts, { psl, excluded });
  const payload = { v: 1, hash: "cyrb53", count: entries.size, source: FEED, license: "MIT (Phishing.Database)", generatedAt: new Date().toISOString(), data: encode(entries) };
  writeFileSync(out, JSON.stringify(payload));
  console.log(`Wrote ${entries.size} phishing domains (${hosts.length} listed hosts) to ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
