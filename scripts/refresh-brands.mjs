// Dev-only tool. Builds the brand registry Cluster cross-checks senders
// against: company name, the email domains it really sends from, and its
// logo. Two sources, each tagged with how far it can be trusted:
//
//   - "certified": BIMI Verified Mark Certificates. A CA (DigiCert, GlobalSign,
//     SSL.com, Entrust) checked the company's registered trademark before
//     binding legal name + domains + logo in one signed certificate. Found via
//     the domain's default._bimi TXT record. The chain is verified here
//     against the pinned CA certificates below, so a domain can't vouch for
//     itself with a home-made certificate.
//   - "listed": Wikidata "official website" (P856), for brands in
//     src/lib/data/brandDomains.json with no certificate (Google, Microsoft,
//     Meta, ...). Anyone can edit Wikidata, so this never outranks the hand list.
//
// Candidates are every domain in brandDomains.json plus the Tranco top list.
// Not part of the build. Run it by hand, review the diff, commit:
//
//   npm run refresh:brands            (Tranco top 5000)
//   npm run refresh:brands -- 20000   (a bigger slice)
//
// Writes public/data/brand-registry.json and public/data/brand-logos.json.
// Both ship as data assets outside the JS bundle.
import { X509Certificate } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_REGISTRY = path.join(ROOT, "public", "data", "brand-registry.json");
const OUT_LOGOS = path.join(ROOT, "public", "data", "brand-logos.json");
const TOP_N = Number(process.argv[2] ?? 5000);
const CONCURRENCY = 24;
const UA = "Cluster brand registry refresh (github.com/Samuelabhinav37/cluster)";

// SHA-256 fingerprints of the Verified Mark CA certificates, each downloaded
// from the CA's own server (2026-10-30). Entrust's root has no public
// download link, so its intermediate (fetched from aia.entrust.net) is pinned.
const PINNED_CAS = {
  "50:43:86:C9:EE:89:32:FE:CC:95:FA:DE:42:7F:69:C3:E2:53:4B:73:10:48:9E:30:0F:EE:44:8E:33:C4:6B:42":
    "DigiCert", // cacerts.digicert.com/DigiCertVerifiedMarkRootCA.crt
  "CD:12:2C:B8:77:C6:92:8B:90:17:B0:F0:B8:0D:BD:50:81:96:30:0B:BD:03:CD:73:56:C3:BE:EF:52:4E:7E:0B":
    "GlobalSign", // secure.globalsign.com/cacert/gsverifiedmarkrootr42.crt
  "8F:9D:1B:76:98:88:67:82:A5:99:B4:85:10:65:1C:66:A1:AA:0C:5C:A3:19:20:97:BD:C6:85:34:15:4B:D3:0D":
    "SSL.com", // cert.ssl.com/SSL.com-VMC-Root-2024-RSA.cer
  "C2:69:50:4B:49:1D:BF:45:1A:69:5B:95:37:11:AD:C5:CD:70:97:5B:5F:CA:1E:18:1E:BB:D2:17:2C:B0:7E:0C":
    "Entrust", // aia.entrust.net/vmc2-chain.cer
};
const BIMI_EKU = "1.3.6.1.5.5.7.3.31";
// Subject attributes the BIMI Group defined for mark certificates.
const MARK_TYPE = "1.3.6.1.4.1.53087.1.13";
const TRADEMARK_COUNTRY = "1.3.6.1.4.1.53087.1.3";
const TRADEMARK_ID = "1.3.6.1.4.1.53087.1.4";

/** "v=BIMI1; l=...; a=..." (TXT chunks already joined) → the a= certificate URL. */
function bimiCertUrl(txt) {
  if (!/^\s*v=BIMI1\s*(;|$)/i.test(txt)) return undefined;
  const url = /(?:^|;)\s*a=(https:\/\/[^;\s]+)/i.exec(txt)?.[1];
  return url;
}

function subjectField(cert, key) {
  const line = cert.subject.split("\n").find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).replace(/\\,/g, ",");
}

function sanDomains(cert) {
  return (cert.subjectAltName ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("DNS:"))
    .map((s) => s.slice(4).toLowerCase().replace(/^\*\./, ""));
}

// The pinned CA certificates themselves, so a chain that omits its root still
// completes. Fingerprints above guard this file against edits.
const CA_CERTS = (
  (await readFile(path.join(ROOT, "scripts", "vmc-ca-certs.pem"), "utf8")).match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  ) ?? []
).map((p) => new X509Certificate(p));
if (
  CA_CERTS.length !== Object.keys(PINNED_CAS).length ||
  !CA_CERTS.every((c) => PINNED_CAS[c.fingerprint256])
) {
  throw new Error("scripts/vmc-ca-certs.pem doesn't match PINNED_CAS");
}

/** Walks leaf → pinned CA by signature. Returns the CA name and the leaf's
 * direct issuer, or throws. */
// shortcut: no revocation (OCSP/CRL) check, a revoked certificate stays listed until it expires; add OCSP if one ever matters.
function verifyChain(certs, now = new Date()) {
  const leaf = certs[0];
  if (now < new Date(leaf.validFrom) || now > new Date(leaf.validTo))
    throw new Error("expired or not yet valid");
  if (!(leaf.keyUsage ?? []).includes(BIMI_EKU)) throw new Error("not a BIMI certificate");
  const pool = [...certs, ...CA_CERTS];
  let cert = leaf;
  let leafIssuer;
  for (let hops = 0; hops < 5; hops++) {
    const pinned = PINNED_CAS[cert.fingerprint256];
    if (pinned && cert !== leaf) return { ca: pinned, issuer: leafIssuer };
    const issuer = pool.find((c) => c !== cert && cert.checkIssued(c) && cert.verify(c.publicKey));
    if (!issuer) throw new Error(`chain stops at ${subjectField(cert, "CN")}`);
    leafIssuer ??= issuer;
    cert = issuer;
  }
  throw new Error("chain too long");
}

/** The logo bound inside the certificate (RFC 3709 logotype, gzipped SVG). */
function embeddedLogo(leaf) {
  const m = /data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/.exec(leaf.raw.toString("latin1"));
  if (!m) return undefined;
  const bytes = Buffer.from(m[1], "base64");
  const svg = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString("utf8");
  // SVG Tiny PS forbids scripts and external refs; drop any logo that has them anyway.
  if (!/<svg[\s>]/i.test(svg) || /<script|\son\w+\s*=|href\s*=\s*["']?(?!#)/i.test(svg)) return undefined;
  return svg;
}

async function certifiedFor(domain) {
  let records;
  try {
    records = await resolveTxt(`default._bimi.${domain}`);
  } catch {
    return undefined; // NXDOMAIN / no record: the common case
  }
  const url = records
    .map((chunks) => chunks.join(""))
    .map(bimiCertUrl)
    .find(Boolean);
  if (!url) return undefined;
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`certificate ${response.status}`);
  const pems =
    (await response.text()).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  const certs = pems.map((p) => new X509Certificate(p));
  if (!certs.length) throw new Error("no certificate in PEM");
  const { ca, issuer } = verifyChain(certs);
  // The extension's one-tap check verifies a leaf against these keys only.
  issuers.set(issuer.fingerprint256, {
    ca,
    name: subjectField(issuer, "CN"),
    expires: new Date(issuer.validTo).toISOString().slice(0, 10),
    spki: issuer.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  });
  const leaf = certs[0];
  const domains = sanDomains(leaf);
  // eBay's certificate names reply.ebay.ca, not ebay.ca: a subdomain still ties it to this record.
  if (!domains.some((d) => d === domain || d.endsWith(`.${domain}`)))
    throw new Error(`certificate is for ${domains.join(" ")}`);
  const country = subjectField(leaf, TRADEMARK_COUNTRY);
  const id = subjectField(leaf, TRADEMARK_ID);
  return {
    name: subjectField(leaf, "O") ?? subjectField(leaf, "CN"),
    domains,
    ca,
    mark: subjectField(leaf, MARK_TYPE) ?? "Registered Mark",
    trademark: country && id ? `${country} ${id}` : undefined,
    expires: new Date(leaf.validTo).toISOString().slice(0, 10),
    logo: embeddedLogo(leaf),
  };
}

async function pool(items, fn) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) await fn(queue.shift());
    }),
  );
}

async function trancoTop(n) {
  try {
    const latest = await (await fetch("https://tranco-list.eu/api/lists/date/latest")).json();
    const csv = await (await fetch(`https://tranco-list.eu/download/${latest.list_id}/${n}`)).text();
    return {
      id: latest.list_id,
      domains: csv
        .trim()
        .split("\n")
        .map((l) => l.split(",")[1].trim().toLowerCase()),
    };
  } catch (err) {
    console.error(`Tranco: ${err.message}, scanning the hand list only`);
    return { id: undefined, domains: [] };
  }
}

/** Wikidata items whose official website is one of `domains` → { label, hosts }. */
async function wikidataListed(domains) {
  const urls = domains.flatMap((d) => [
    `https://www.${d}/`,
    `https://${d}/`,
    `https://www.${d}`,
    `https://${d}`,
    `http://www.${d}/`,
    `http://${d}/`,
  ]);
  const query = `SELECT ?item ?itemLabel ?site WHERE {
    VALUES ?match { ${urls.map((u) => `<${u}>`).join(" ")} }
    ?item wdt:P856 ?match; wdt:P856 ?site.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`;
  const response = await fetch("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/sparql-results+json",
      "user-agent": UA,
    },
    body: new URLSearchParams({ query }),
  });
  if (!response.ok) throw new Error(`Wikidata ${response.status}`);
  const items = new Map();
  for (const row of (await response.json()).results.bindings) {
    const entry = items.get(row.item.value) ?? {
      label: row.itemLabel.value,
      qid: row.item.value.split("/").pop(),
      hosts: new Set(),
    };
    try {
      entry.hosts.add(new URL(row.site.value).hostname.replace(/^www\./, ""));
    } catch {
      // Wikidata holds the odd malformed URL; skip it.
    }
    items.set(row.item.value, entry);
  }
  return [...items.values()];
}

// --- run -------------------------------------------------------------------

const handList = JSON.parse(
  await readFile(path.join(ROOT, "src", "lib", "data", "brandDomains.json"), "utf8"),
);
const tranco = await trancoTop(TOP_N);
const candidates = [...new Set([...Object.values(handList).flat(), ...tranco.domains])];
console.log(`checking ${candidates.length} domains for mark certificates…`);

const certified = new Map(); // legal name → company
const issuers = new Map(); // fingerprint → issuing CA that signed a certified leaf
const failures = [];
let done = 0;
await pool(candidates, async (domain) => {
  try {
    const hit = await certifiedFor(domain);
    if (hit) {
      const company = certified.get(hit.name) ?? { ...hit, domains: new Set(), trust: "certified" };
      for (const d of hit.domains) company.domains.add(d);
      company.logo ??= hit.logo;
      certified.set(hit.name, company);
    }
  } catch (err) {
    failures.push(`${domain}: ${err.message}`);
  }
  if (++done % 500 === 0) console.log(`  ${done}/${candidates.length}, ${certified.size} companies`);
});

// Hand-list brands none of whose domains got a certificate go to Wikidata.
const certifiedDomains = new Set([...certified.values()].flatMap((c) => [...c.domains]));
const uncertified = Object.entries(handList).filter(([, ds]) => !ds.some((d) => certifiedDomains.has(d)));
let listed = [];
try {
  listed = await wikidataListed([...new Set(uncertified.flatMap(([, ds]) => ds))]);
} catch (err) {
  console.error(`${err.message}, skipping listed entries`);
}

const companies = [];
const logos = {};
for (const c of [...certified.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const id = [...c.domains].sort()[0];
  if (c.logo) logos[id] = c.logo;
  companies.push({
    id,
    name: c.name,
    trust: "certified",
    domains: [...c.domains].sort(),
    ca: c.ca,
    mark: c.mark,
    trademark: c.trademark,
    expires: c.expires,
    logo: Boolean(c.logo),
  });
}
// One listed company per hand-list brand, from Wikidata items that share a
// domain with it AND carry its name ("FedEx Express" yes, a sports club whose
// website is instagram.com no).
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
for (const [brand, handDomains] of uncertified) {
  const items = listed.filter(
    (i) => [...i.hosts].some((h) => handDomains.includes(h)) && squash(i.label).includes(squash(brand)),
  );
  if (!items.length) continue;
  const best =
    items.find((i) => squash(i.label) === squash(brand)) ??
    items.reduce((a, b) => (a.label.length <= b.label.length ? a : b));
  const domains = [...new Set(items.flatMap((i) => [...i.hosts]))]
    .filter((d) => !certifiedDomains.has(d))
    .sort();
  if (domains.length)
    companies.push({ id: domains[0], name: best.label, brand, trust: "listed", domains, wikidata: best.qid });
}

// Self-check before writing: a known certified sender must come out right.
const chase = companies.find((c) => c.domains.includes("chase.com"));
if (chase?.trust !== "certified" || !/JPMorgan Chase/.test(chase.name))
  throw new Error("self-check failed: chase.com not certified as JPMorgan Chase");
if (
  bimiCertUrl("v=BIMI1; l=https://x/l.svg; a=https://x/c.pem") !== "https://x/c.pem" ||
  bimiCertUrl("v=spf1 -all")
)
  throw new Error("self-check failed: bimiCertUrl");

const generatedAt = new Date().toISOString();
await writeFile(
  OUT_REGISTRY,
  `${JSON.stringify(
    {
      sources: {
        certified: "BIMI Verified Mark Certificates (default._bimi TXT), chains verified to pinned CAs",
        listed: "Wikidata P856 official website (CC0)",
        candidates: tranco.id
          ? `src/lib/data/brandDomains.json + Tranco list ${tranco.id} top ${TOP_N}`
          : "src/lib/data/brandDomains.json",
      },
      generatedAt,
      issuers: [...issuers.values()].sort((a, b) => a.name.localeCompare(b.name)),
      companies,
    },
    null,
    2,
  )}\n`,
);
await writeFile(OUT_LOGOS, `${JSON.stringify({ generatedAt, logos })}\n`);

const certCount = companies.filter((c) => c.trust === "certified").length;
console.log(
  `wrote ${companies.length} companies (${certCount} certified, ${companies.length - certCount} listed), ${Object.keys(logos).length} logos`,
);
console.log(
  `hand-list brands still with neither: ${
    uncertified
      .filter(([, ds]) => !companies.some((c) => c.domains.some((d) => ds.includes(d))))
      .map(([b]) => b)
      .join(", ") || "none"
  }`,
);
if (failures.length) {
  const reasons = {};
  for (const f of failures) {
    const reason = f.slice(f.indexOf(": ") + 2).replace(/ (is for|stops at) .*/, " $1 …");
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  console.log(`${failures.length} certificates rejected:`, reasons);
  if (process.env.VERBOSE) console.log(`  ${failures.join("\n  ")}`);
}
