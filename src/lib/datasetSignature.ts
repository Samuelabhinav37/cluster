// Ed25519 check for the datasets Cluster downloads (see remoteDataset.ts).
// Same key format and outcomes as Moat's live-manifest check
// (moat/src/background/liveSignature.ts), with a stricter trust rule: Cluster
// never falls back to unsigned data once a key is configured, and never takes
// an unsigned allow-list at all.
//
//   "ok"        -- key configured, signature supplied, and it verifies.
//   "bad"       -- key configured, signature supplied, but it doesn't verify.
//   "no-sig"    -- key configured, but no signature was served.
//   "no-key"    -- this build has no public key (signing not set up).
//   "no-engine" -- this browser's WebCrypto has no Ed25519.
import { DATASET_PUBLIC_KEY } from "./datasetSigningKey";

export type DatasetSigResult = "ok" | "bad" | "no-sig" | "no-key" | "no-engine";

/**
 * "allow": the data can make Cluster trust a sender (brand sending domains).
 *   A forged copy lowers protection, so only a verified signature counts.
 * "block": the data can only add warnings (malware and spam domains). Before
 *   signing is set up it is taken unsigned, as it always was. Once a key is
 *   configured it must verify too, because a forged block list could hold
 *   real mail by listing a domain like gmail.com.
 */
export type DatasetTrust = "allow" | "block";

export function isDatasetTrusted(result: DatasetSigResult, trust: DatasetTrust): boolean {
  if (result === "ok") return true;
  return trust === "block" && result === "no-key";
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Fixed 12-byte SPKI/DER prefix for an Ed25519 public key. "spki" import is
// accepted everywhere, "raw" for Ed25519 public keys is newer.
const ED25519_SPKI_PREFIX = new Uint8Array([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

function rawEd25519ToSpki(raw: Uint8Array): Uint8Array {
  const out = new Uint8Array(ED25519_SPKI_PREFIX.length + raw.length);
  out.set(ED25519_SPKI_PREFIX, 0);
  out.set(raw, ED25519_SPKI_PREFIX.length);
  return out;
}

export async function verifyDatasetSignature(
  bytes: ArrayBuffer,
  signatureB64: string | null,
  publicKeyB64: string = DATASET_PUBLIC_KEY,
): Promise<DatasetSigResult> {
  if (!publicKeyB64) return "no-key";
  if (!signatureB64) return "no-sig";

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "spki",
      rawEd25519ToSpki(base64ToBytes(publicKeyB64)) as BufferSource,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
  } catch {
    return "no-engine";
  }

  try {
    const ok = await crypto.subtle.verify("Ed25519", key, base64ToBytes(signatureB64.trim()) as BufferSource, bytes);
    return ok ? "ok" : "bad";
  } catch {
    return "bad";
  }
}
