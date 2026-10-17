// One-off: generates the Ed25519 keypair that signs the published datasets.
// Prints, never writes into the repo. Do this once, then:
//
//   1. Put the PRIVATE key PEM in a GitHub Actions secret named
//      CLUSTER_DATASET_SIGNING_KEY (Settings -> Secrets and variables ->
//      Actions). Keep an offline copy somewhere safe.
//   2. Paste the PUBLIC key (raw base64, 44 chars) into
//      src/lib/datasetSigningKey.ts as DATASET_PUBLIC_KEY.
//   3. Run the "Publish public datasets" workflow, then ship the extension
//      update that carries the new public key.
//
// Same scheme as Moat's scripts/gen-live-signing-key.mjs. A leaked key is
// revoked by shipping an extension update with a new public key.
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
// SPKI DER for Ed25519 is a fixed 12-byte header + the 32-byte raw key.
const rawPublic = publicKey.export({ type: "spki", format: "der" }).subarray(12);

console.log("=== PRIVATE KEY (secret CLUSTER_DATASET_SIGNING_KEY, never commit) ===\n");
console.log(privatePem.trimEnd());
console.log("\n=== PUBLIC KEY (raw base64 -> src/lib/datasetSigningKey.ts) ===\n");
console.log(rawPublic.toString("base64"));
