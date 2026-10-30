/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { checkMark, parseCertificate, type MarkCheckResult } from "./markCheck";
import { setBrandRegistry, type BrandRegistry } from "./brandRegistry";
import registryData from "../../public/data/brand-registry.json";
import publicSuffixData from "../../public/data/public-suffix.json";
// Chase's real, public mark certificate (vmc.digicert.com), leaf only.
import CHASE_PEM from "./testdata/chase-vmc.pem?raw";
import { setPublicSuffixRules } from "./publicSuffix";

const CERT_URL = "https://vmc.digicert.com/chase.pem";
const NOW = new Date("2026-10-30T00:00:00Z");

function derOf(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----|\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function pemOf(der: Uint8Array): string {
  return `-----BEGIN CERTIFICATE-----\n${btoa(String.fromCharCode(...der))}\n-----END CERTIFICATE-----\n`;
}

/** DNS answers BIMI for chase.com only; the certificate URL serves `pem`. */
function fakeNet(
  pem: string | Error,
  records: Record<string, string> = { "chase.com": `"v=BIMI1; l=https://x/l.svg; a=${CERT_URL}"` },
) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "cloudflare-dns.com") {
      const name = url.searchParams.get("name")!.replace(/^default\._bimi\./, "");
      const data = records[name];
      return new Response(JSON.stringify({ Answer: data ? [{ type: 16, data }] : [] }));
    }
    if (pem instanceof Error) throw pem;
    return new Response(pem);
  }) as unknown as typeof fetch;
}

function check(domain: string, brand: string, net: typeof fetch, now = NOW): Promise<MarkCheckResult> {
  vi.stubGlobal("fetch", net);
  return checkMark(domain, brand, now);
}

beforeAll(() => {
  setPublicSuffixRules(publicSuffixData);
  setBrandRegistry(registryData as unknown as BrandRegistry);
});
afterAll(() => setBrandRegistry(null));
afterEach(() => vi.unstubAllGlobals());

describe("parseCertificate", () => {
  it("reads the legal name, domains, purpose and dates", () => {
    const cert = parseCertificate(derOf(CHASE_PEM));
    expect(cert.organization).toBe("JPMorgan Chase & Co.");
    expect(cert.domains).toContain("chase.com");
    expect(cert.ekus).toContain("1.3.6.1.5.5.7.3.31");
    expect(cert.notAfter.toISOString()).toBe("2027-08-17T23:59:59.000Z");
  });
});

describe("checkMark", () => {
  it("a certified domain of the claimed brand is real, also for its subdomains", async () => {
    expect(await check("chase.com", "chase", fakeNet(CHASE_PEM))).toEqual({
      verdict: "real",
      company: "JPMorgan Chase & Co.",
    });
    expect(await check("alerts.chase.com", "chase", fakeNet(CHASE_PEM))).toEqual({
      verdict: "real",
      company: "JPMorgan Chase & Co.",
    });
  });

  it("names the real owner when the certificate belongs to another company", async () => {
    expect(await check("chase.com", "paypal", fakeNet(CHASE_PEM))).toEqual({
      verdict: "other-company",
      company: "JPMorgan Chase & Co.",
    });
  });

  it("a scam domain pointing at someone else's certificate fails", async () => {
    const net = fakeNet(CHASE_PEM, { "chase-secure.example": `"v=BIMI1; a=${CERT_URL}"` });
    expect(await check("chase-secure.example", "chase", net)).toEqual({
      verdict: "failed",
      reason: "certificate is for another domain",
    });
  });

  it("a tampered certificate fails the signature check", async () => {
    const der = derOf(CHASE_PEM);
    const at = new TextDecoder("latin1").decode(der).indexOf("JPMorgan");
    der[at] = "X".charCodeAt(0);
    expect(await check("chase.com", "chase", fakeNet(pemOf(der)))).toEqual({
      verdict: "failed",
      reason: "certificate isn't from a trusted mark issuer",
    });
  });

  it("an expired certificate fails", async () => {
    const result = await check("chase.com", "chase", fakeNet(CHASE_PEM), new Date("2028-01-01"));
    expect(result).toEqual({ verdict: "failed", reason: "certificate expired" });
  });

  it("no BIMI record means no certificate", async () => {
    expect(await check("example.org", "chase", fakeNet(CHASE_PEM))).toEqual({ verdict: "no-certificate" });
  });

  it("asks for the certificate host when the browser blocks the read", async () => {
    expect(await check("chase.com", "chase", fakeNet(new TypeError("Failed to fetch")))).toEqual({
      verdict: "needs-permission",
      origin: "https://vmc.digicert.com/*",
    });
  });
});
