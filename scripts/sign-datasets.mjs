// Signs every .json file in a directory with Ed25519, writing a detached
// base64 signature to <file>.sig beside it. Run by publish-datasets.yml on
// the assembled GitHub Pages directory:
//
//   CLUSTER_DATASET_SIGNING_KEY="$(cat key.pem)" node scripts/sign-datasets.mjs dist-pages
//
// Each signature is checked against the public key in
// src/lib/datasetSigningKey.ts before the job goes on, so a wrong secret
// fails here instead of every install rejecting the files. With no public
// key in the source and no secret, it signs nothing and says so: the
// extension then still takes the block lists unsigned and skips the brand
// allow-list. With a public key but no secret it fails, because installs
// would reject everything this run publishes.
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/sign-datasets.mjs <directory>");
  process.exit(2);
}

const keySource = readFileSync(new URL("../src/lib/datasetSigningKey.ts", import.meta.url), "utf8");
const publicKeyB64 = /DATASET_PUBLIC_KEY\s*=\s*"([^"]*)"/.exec(keySource)?.[1] ?? "";
const privatePem = process.env.CLUSTER_DATASET_SIGNING_KEY ?? "";

if (!privatePem) {
  if (publicKeyB64) {
    console.error("DATASET_PUBLIC_KEY is set but CLUSTER_DATASET_SIGNING_KEY is missing. Refusing to publish unsigned files.");
    process.exit(1);
  }
  console.warn("Dataset signing is not set up (no public key, no secret). Publishing unsigned. See scripts/gen-dataset-signing-key.mjs.");
  process.exit(0);
}

const privateKey = createPrivateKey(privatePem);
const publicKey = publicKeyB64
  ? createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKeyB64, "base64")]),
      format: "der",
      type: "spki",
    })
  : createPublicKey(privateKey);
if (!publicKeyB64) {
  console.warn("Signing, but DATASET_PUBLIC_KEY is empty, so installs won't check these signatures yet.");
}

const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
for (const name of files) {
  const bytes = readFileSync(join(dir, name));
  const signature = sign(null, bytes, privateKey);
  if (!verify(null, bytes, publicKey, signature)) {
    console.error(`${name}: signature doesn't verify against DATASET_PUBLIC_KEY. Wrong secret?`);
    process.exit(1);
  }
  writeFileSync(join(dir, `${name}.sig`), signature.toString("base64"));
  console.log(`signed ${name}`);
}
