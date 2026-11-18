// Refreshes src/lib/data/phishingHosts.generated.json from phishunt.io's feed
// (CC0 1.0, phishunt.io/tos). Plan step 3.8. Run weekly by refresh-datasets.yml:
//
//   npm run refresh:phishing
//
// The feed is a suspicion, not a verdict (its terms say so), so Cluster uses
// it only for links in mail you open in a check (bodyChecks.ts): a hit warns,
// and holds only together with another warning sign. Hosts under a brand,
// free-mail or registry domain are dropped, so a phishing page on
// sites.google.com can't flag every Google Sites link.
import { readFileSync, writeFileSync } from "node:fs";
import { freeMailDomains, registryDomains } from "./dataset-guard.mjs";

const FEED = "https://phishunt.io/feed.txt";
const MAX_HOSTS = 5000;
const OUT = new URL("../src/lib/data/phishingHosts.generated.json", import.meta.url);

const response = await fetch(FEED);
if (!response.ok) {
  console.error(`phishunt feed request failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}

const read = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), "utf8"));
const shared = new Set(
  [...Object.values(read("src/lib/data/brandDomains.json")).flat(), ...freeMailDomains(), ...registryDomains(read("public/data/brand-registry.json"))].map((d) => d.toLowerCase()),
);
const underShared = (host) => {
  const labels = host.split(".");
  return labels.some((_, i) => shared.has(labels.slice(i).join(".")));
};

const hosts = new Set();
let dropped = 0;
for (const line of (await response.text()).split("\n")) {
  let host;
  try {
    host = new URL(line.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    continue;
  }
  if (!host.includes(".") || /^\d+(\.\d+){3}$/.test(host)) continue;
  if (underShared(host)) {
    dropped += 1;
    continue;
  }
  hosts.add(host);
}

const domains = [...hosts].sort().slice(0, MAX_HOSTS);
writeFileSync(
  OUT,
  `${JSON.stringify({ source: FEED, license: "CC0-1.0 (phishunt.io)", generatedAt: new Date().toISOString(), count: domains.length, domains }, null, 2)}\n`,
);
console.log(`Wrote ${domains.length} phishing hosts (${dropped} dropped under brand or shared domains).`);
