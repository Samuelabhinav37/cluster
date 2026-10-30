// One-tap check: is a domain that claims a brand really that company's?
//
// Looks up the domain's BIMI record over DNS-over-HTTPS, fetches the mark
// certificate it points to, and verifies the certificate in the browser
// against the issuing-CA keys pinned in the brand registry (see
// scripts/refresh-brands.mjs). A CA only issues one after checking the
// company's registered trademark, so a verified certificate names the legal
// owner of the domain. A home-made certificate fails the signature check.
//
// Runs only when the user taps Check. It shows the one domain name to the
// DNS service and to the certificate's host, never any mail.
import { certifiedCompaniesForBrand, registryIssuers } from "./brandRegistry";
import { isPublicHttpsUrl } from "./netGuard";
import { normalizeDomain, registrableDomain } from "./registrableDomain";

export type MarkCheckResult =
  /** Certified for the company behind the claimed brand. */
  | { verdict: "real"; company: string }
  /** Certified, but for a different company than the brand claimed. */
  | { verdict: "other-company"; company: string }
  | { verdict: "no-certificate" }
  /** The certificate's host doesn't allow cross-origin reads: ask for it, then check again. */
  | { verdict: "needs-permission"; origin: string }
  | { verdict: "failed"; reason: string };

const DOH = "https://cloudflare-dns.com/dns-query";
const BIMI_EKU = "1.3.6.1.5.5.7.3.31";
const OID_O = "2.5.4.10";
const OID_SAN = "2.5.29.17";
const OID_EKU = "2.5.29.37";
// shortcut: RSA only, every pinned issuer today is RSA-4096; add ECDSA if an EC issuer shows up in the registry.
const RSA_HASH: Record<string, string> = {
  "1.2.840.113549.1.1.11": "SHA-256",
  "1.2.840.113549.1.1.12": "SHA-384",
  "1.2.840.113549.1.1.13": "SHA-512",
};

// --- minimal DER reader ------------------------------------------------------

interface Tlv {
  tag: number;
  /** Whole element, header included. */
  raw: Uint8Array;
  body: Uint8Array;
}

function readTlv(bytes: Uint8Array, at = 0): Tlv & { end: number } {
  const tag = bytes[at];
  let len = bytes[at + 1];
  let header = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4) throw new Error("bad DER length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + bytes[at + 2 + i];
    header += n;
  }
  const end = at + header + len;
  if (tag === undefined || end > bytes.length) throw new Error("truncated DER");
  return { tag, raw: bytes.subarray(at, end), body: bytes.subarray(at + header, end), end };
}

function children(tlv: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let at = 0; at < tlv.body.length;) {
    const child = readTlv(tlv.body, at);
    out.push(child);
    at = child.end;
  }
  return out;
}

function oid(tlv: Tlv): string {
  const b = tlv.body;
  const parts = [Math.floor(b[0] / 40), b[0] % 40];
  for (let i = 1, v = 0; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f);
    if (!(b[i] & 0x80)) {
      parts.push(v);
      v = 0;
    }
  }
  return parts.join(".");
}

function time(tlv: Tlv): Date {
  const s = new TextDecoder().decode(tlv.body);
  // UTCTime YYMMDDhhmmssZ (years 1950-2049), GeneralizedTime YYYYMMDDhhmmssZ.
  const full = tlv.tag === 0x17 ? `${Number(s.slice(0, 2)) < 50 ? "20" : "19"}${s}` : s;
  return new Date(
    `${full.slice(0, 4)}-${full.slice(4, 6)}-${full.slice(6, 8)}T${full.slice(8, 10)}:${full.slice(10, 12)}:${full.slice(12, 14)}Z`,
  );
}

export interface ParsedMarkCertificate {
  tbs: Uint8Array;
  signatureOid: string;
  signature: Uint8Array;
  notBefore: Date;
  notAfter: Date;
  organization?: string;
  domains: string[];
  ekus: string[];
}

export function parseCertificate(der: Uint8Array): ParsedMarkCertificate {
  const [tbs, sigAlg, sigValue] = children(readTlv(der));
  const fields = children(tbs);
  const i = fields[0].tag === 0xa0 ? 1 : 0; // optional [0] version
  const [, , , validity, subject] = fields.slice(i);
  const [notBefore, notAfter] = children(validity).map(time);
  let organization: string | undefined;
  for (const rdn of children(subject)) {
    for (const atv of children(rdn)) {
      const [type, value] = children(atv);
      if (oid(type) === OID_O) organization = new TextDecoder().decode(value.body);
    }
  }
  const domains: string[] = [];
  const ekus: string[] = [];
  const extWrapper = fields.find((f) => f.tag === 0xa3);
  for (const ext of extWrapper ? children(children(extWrapper)[0]) : []) {
    const parts = children(ext);
    const id = oid(parts[0]);
    const inner = readTlv(parts[parts.length - 1].body); // OCTET STRING wraps the value
    if (id === OID_SAN) {
      for (const name of children(inner))
        if (name.tag === 0x82) domains.push(new TextDecoder().decode(name.body).toLowerCase());
    } else if (id === OID_EKU) {
      for (const purpose of children(inner)) ekus.push(oid(purpose));
    }
  }
  return {
    tbs: tbs.raw,
    signatureOid: oid(children(sigAlg)[0]),
    signature: sigValue.body.subarray(1), // BIT STRING: skip the unused-bits byte
    notBefore,
    notAfter,
    organization,
    domains,
    ekus,
  };
}

function pemToDer(pem: string): Uint8Array | undefined {
  const b64 = /-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/
    .exec(pem)?.[1]
    .replace(/\s+/g, "");
  return b64 ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) : undefined;
}

/** Signed by one of the pinned issuing CAs? */
async function signedByPinnedIssuer(cert: ParsedMarkCertificate): Promise<boolean> {
  const hash = RSA_HASH[cert.signatureOid];
  if (!hash) return false;
  for (const issuer of registryIssuers()) {
    const spki = Uint8Array.from(atob(issuer.spki), (c) => c.charCodeAt(0));
    const key = await crypto.subtle
      .importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash }, false, ["verify"])
      .catch(() => null);
    if (
      key &&
      (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, cert.signature.slice(), cert.tbs.slice()))
    )
      return true;
  }
  return false;
}

// --- the check -----------------------------------------------------------------

/** "v=BIMI1; l=...; a=..." → the a= certificate URL. */
export function bimiCertUrl(txt: string): string | undefined {
  if (!/^\s*v=BIMI1\s*(;|$)/i.test(txt)) return undefined;
  return /(?:^|;)\s*a=(https:\/\/[^;\s]+)/i.exec(txt)?.[1];
}

async function lookupCertUrl(name: string): Promise<string | undefined> {
  const response = await fetch(`${DOH}?name=default._bimi.${encodeURIComponent(name)}&type=TXT`, {
    headers: { accept: "application/dns-json" },
  });
  if (!response.ok) throw new Error(`DNS ${response.status}`);
  const answers =
    ((await response.json()) as { Answer?: Array<{ type: number; data: string }> }).Answer ?? [];
  // TXT data arrives quoted, long records split into "chunk" "chunk".
  return answers
    .filter((a) => a.type === 16)
    .map((a) => bimiCertUrl(a.data.replace(/"\s*"/g, "").replace(/^"|"$/g, "")))
    .find(Boolean);
}

export async function checkMark(domain: string, brand: string, now = new Date()): Promise<MarkCheckResult> {
  const sender = normalizeDomain(domain);
  try {
    // BIMI falls back to the organisational domain when a subdomain has no record.
    let lookup = sender;
    let url = await lookupCertUrl(sender);
    if (!url && registrableDomain(sender) !== sender) {
      lookup = registrableDomain(sender);
      url = await lookupCertUrl(lookup);
    }
    if (!url) return { verdict: "no-certificate" };
    if (!isPublicHttpsUrl(url))
      return { verdict: "failed", reason: "certificate address isn't a public https URL" };

    let pem: string;
    try {
      const response = await fetch(url);
      if (!response.ok) return { verdict: "failed", reason: `certificate ${response.status}` };
      pem = await response.text();
    } catch {
      // A blocked cross-origin read surfaces as a network TypeError.
      return { verdict: "needs-permission", origin: `${new URL(url).origin}/*` };
    }
    const der = pemToDer(pem);
    if (!der) return { verdict: "failed", reason: "no certificate in the file" };
    const cert = parseCertificate(der);
    if (now < cert.notBefore || now > cert.notAfter)
      return { verdict: "failed", reason: "certificate expired" };
    if (!cert.ekus.includes(BIMI_EKU)) return { verdict: "failed", reason: "not a mark certificate" };
    const covers = cert.domains.some(
      (d) => d === lookup || d.endsWith(`.${lookup}`) || sender === d || sender.endsWith(`.${d}`),
    );
    if (!covers) return { verdict: "failed", reason: "certificate is for another domain" };
    if (!(await signedByPinnedIssuer(cert)))
      return { verdict: "failed", reason: "certificate isn't from a trusted mark issuer" };

    const company = cert.organization ?? lookup;
    const owners = certifiedCompaniesForBrand(brand).map((c) => c.name);
    return owners.includes(company) ? { verdict: "real", company } : { verdict: "other-company", company };
  } catch (err) {
    return { verdict: "failed", reason: err instanceof Error ? err.message : String(err) };
  }
}
