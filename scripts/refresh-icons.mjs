// Builds public/data/sender-icons.json: a 64px icon for each company domain
// people commonly get mail from, so the dashboard can show sender icons
// without asking Google per sender on the user's computer. Run weekly by
// refresh-datasets.yml, or by hand:
//
//   npm run refresh:icons            (hand lists + Tranco top 1500)
//   npm run refresh:icons -- 3000    (a bigger slice)
//
// Domains come from Cluster's own lists (brand hand list, brand registry,
// category domains, brand colours) plus the Tranco top list. Icons are
// fetched here, on the build machine, from Google's favicon service. A site
// with no icon answers 404 and is left out; those senders get a monogram,
// or the runtime favicon fallback in senderTile.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { freeMailDomains, registryDomains } from "./dataset-guard.mjs";

const TOP_N = Number(process.argv[2] ?? 1500);
const OUT = new URL("../public/data/sender-icons.json", import.meta.url);
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const quotedDomains = (src) => [...src.matchAll(/"([a-z0-9-]+(?:\.[a-z0-9-]+)+)"/g)].map((m) => m[1]);

async function trancoTop(n) {
  try {
    const latest = await (await fetch("https://tranco-list.eu/api/lists/date/latest")).json();
    const csv = await (await fetch(`https://tranco-list.eu/download/${latest.list_id}/${n}`)).text();
    return csv.trim().split("\n").map((l) => l.split(",")[1].trim().toLowerCase());
  } catch (err) {
    console.error(`Tranco: ${err.message}, using Cluster's own lists only`);
    return [];
  }
}

const free = new Set(freeMailDomains());
const candidates = [
  ...new Set(
    [
      ...Object.values(JSON.parse(read("src/lib/data/brandDomains.json"))).flat(),
      ...registryDomains(JSON.parse(read("public/data/brand-registry.json"))),
      ...quotedDomains(read("src/lib/domainCategories.ts")),
      ...quotedDomains(read("src/lib/senderLogos.ts")),
      ...(await trancoTop(TOP_N)),
    ].map((d) => d.toLowerCase().replace(/^www\./, "")),
  ),
].filter((d) => !free.has(d));

/** The icon as base64 PNG, or undefined when the site has none. */
async function iconFor(domain) {
  const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`);
  if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/png")) return undefined;
  const png = Buffer.from(await res.arrayBuffer());
  // IHDR width at byte 16. A 16px answer is a site's tiny favicon blown up badly; a monogram reads better.
  if (png.length < 24 || png.readUInt32BE(16) <= 16) return undefined;
  return png.toString("base64");
}

const icons = {};
let next = 0;
let failed = 0;
async function worker() {
  while (next < candidates.length) {
    const domain = candidates[next++];
    try {
      const icon = await iconFor(domain);
      if (icon) icons[domain] = icon;
    } catch {
      failed += 1;
    }
  }
}
console.log(`fetching icons for ${candidates.length} domains…`);
await Promise.all(Array.from({ length: 8 }, worker));

const sorted = Object.fromEntries(Object.keys(icons).sort().map((d) => [d, icons[d]]));
writeFileSync(
  OUT,
  `${JSON.stringify({ source: "https://www.google.com/s2/favicons (64px)", generatedAt: new Date().toISOString(), count: Object.keys(sorted).length, icons: sorted })}\n`,
);
console.log(`Wrote ${Object.keys(sorted).length} icons (${candidates.length - Object.keys(sorted).length - failed} without one, ${failed} failed).`);
