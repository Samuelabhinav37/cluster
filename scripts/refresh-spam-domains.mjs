// Dev-only tool. Refreshes src/lib/data/spamDomains.generated.json from two
// public, freely-redistributable domain lists:
//
//   - disposable-email-domains (github.com/disposable-email-domains) — CC0.
//     Throwaway / temporary mailbox providers.
//   - StopForumSpam "toxic domains" (stopforumspam.com) — free to use.
//     Domains repeatedly seen in spam/abuse.
//
// Not part of the build — run it by hand when you want a fresher slice:
//
//   npm run refresh:spam
//
// The committed JSON is the source of truth the extension bundles; this script
// only rewrites it. Review the diff before committing. See src/lib/spamList.ts
// for how a sender domain here becomes a "suggested spam" row, and
// src/lib/blocklist.ts for the separate malware/phishing list.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SOURCES = [
  {
    name: "disposable-email-domains",
    url: "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf",
    license: "CC0-1.0",
  },
  {
    name: "StopForumSpam toxic domains",
    url: "https://www.stopforumspam.com/downloads/toxic_domains_whole.txt",
    license: "free to use (stopforumspam.com)",
  },
];

// The disposable-mailbox list is high-precision and kept in full; the
// StopForumSpam list is far larger and noisier, so only a bounded slice of it
// is bundled. Order of SOURCES above therefore matters: earlier sources get
// their domains in first, before the cap bites.
const MAX_DOMAINS = 12000;
const PER_SOURCE_CAP = [Infinity, 2500]; // parallel to SOURCES
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "data",
  "spamDomains.generated.json",
);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const domains = new Set();
const used = [];

for (let i = 0; i < SOURCES.length; i++) {
  const source = SOURCES[i];
  const cap = PER_SOURCE_CAP[i] ?? Infinity;
  let text;
  try {
    const response = await fetch(source.url);
    if (!response.ok) {
      console.error(`${source.name}: ${response.status} ${response.statusText} — skipping`);
      continue;
    }
    text = await response.text();
  } catch (err) {
    console.error(`${source.name}: request failed (${err.message}) — skipping`);
    continue;
  }

  const hosts = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim().toLowerCase();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    // Occasionally a hostfile-style "0.0.0.0 bad.example" line; take the host.
    const parts = line.split(/\s+/);
    const host = (parts.length > 1 ? parts[1] : parts[0])
      .replace(/^\*\./, "")
      .replace(/^www\./, "")
      .replace(/\.$/, "");
    if (!host || host === "localhost" || IPV4.test(host) || !host.includes(".")) continue;
    hosts.push(host);
  }

  // If the source is bigger than its cap, sample it evenly rather than taking
  // an alphabetically-biased prefix.
  const budget = Math.min(cap, MAX_DOMAINS - domains.size);
  const stride = hosts.length > budget ? hosts.length / budget : 1;
  let added = 0;
  for (let j = 0; added < budget && Math.floor(j) < hosts.length; j += stride) {
    const host = hosts[Math.floor(j)];
    if (!domains.has(host)) {
      domains.add(host);
      added += 1;
    }
  }
  used.push({ name: source.name, url: source.url, license: source.license, added });
  console.log(`${source.name}: ${hosts.length} candidates, +${added} bundled`);
}

if (used.length === 0) {
  console.error("All sources failed; leaving spamDomains.generated.json untouched.");
  process.exit(1);
}

const sorted = [...domains].sort().slice(0, MAX_DOMAINS);
const payload = {
  note: "Vendored spam / throwaway-mailbox domain slice. Regenerate with `npm run refresh:spam`. Not fetched at runtime.",
  sources: used.map((s) => ({ name: s.name, url: s.url, license: s.license, bundled: s.added })),
  generatedAt: new Date().toISOString(),
  count: sorted.length,
  domains: sorted,
};

await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${sorted.length} domains to ${path.relative(process.cwd(), OUT)}`);
if (domains.size > MAX_DOMAINS) {
  console.log(`(merged ${domains.size}; capped at MAX_DOMAINS=${MAX_DOMAINS})`);
}
