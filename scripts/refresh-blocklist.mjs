// Dev-only tool. Refreshes src/lib/data/malwareDomains.generated.json from
// URLhaus's hostfile feed (abuse.ch, CC0). Not part of the build -- run it
// by hand when you want a fresher slice:
//
//   npm run refresh:blocklist
//
// abuse.ch now gates some feed downloads behind a free account's Auth-Key.
// If the request 401s, create an account at https://auth.abuse.ch/, then:
//
//   URLHAUS_AUTH_KEY=xxxx npm run refresh:blocklist
//
// The committed JSON is the source of truth the extension bundles; this
// script only rewrites it. Review the diff before committing.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const FEED = "https://urlhaus.abuse.ch/downloads/hostfile/";
const MAX_DOMAINS = 6000; // keep the bundled slice bounded
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "data",
  "malwareDomains.generated.json",
);

const headers = {};
if (process.env.URLHAUS_AUTH_KEY) headers["Auth-Key"] = process.env.URLHAUS_AUTH_KEY;

const response = await fetch(FEED, { headers });
if (!response.ok) {
  console.error(`URLhaus feed request failed: ${response.status} ${response.statusText}`);
  if (response.status === 401) {
    console.error("Set URLHAUS_AUTH_KEY (free abuse.ch account) in the environment and retry.");
  }
  process.exit(1);
}

const text = await response.text();
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const domains = new Set();

for (const rawLine of text.split("\n")) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  // hostfile lines: "127.0.0.1\tbad.example" (occasionally just the host).
  const parts = line.split(/\s+/);
  const host = (parts[1] ?? parts[0]).toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!host || host === "localhost" || IPV4.test(host) || !host.includes(".")) continue;
  domains.add(host);
}

const sorted = [...domains].sort().slice(0, MAX_DOMAINS);
const payload = {
  source: FEED,
  license: "CC0-1.0 (abuse.ch URLhaus)",
  generatedAt: new Date().toISOString(),
  count: sorted.length,
  domains: sorted,
};

await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${sorted.length} domains to ${path.relative(process.cwd(), OUT)}`);
if (domains.size > MAX_DOMAINS) {
  console.log(`(feed had ${domains.size}; capped at MAX_DOMAINS=${MAX_DOMAINS})`);
}
