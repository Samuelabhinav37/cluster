// Ed25519 public key that signs the datasets published to GitHub Pages
// (brandDomains.json, malwareDomains.json, spamDomains.json), as raw base64
// (44 chars). Each file is served with a detached `<file>.sig` beside it.
//
// Empty string = signing not set up yet. Then the brand allow-list is never
// fetched (a forged copy could vouch for a scam domain) and the block lists
// fetch unsigned, as before. Fill this in with the public key printed by
// `node scripts/gen-dataset-signing-key.mjs`, after storing its private key
// in the CLUSTER_DATASET_SIGNING_KEY Actions secret.
//
// Rotation, if the private key ever leaks: paste a new public key here and
// ship an extension update. The shipped build is the trust anchor.
export const DATASET_PUBLIC_KEY = "";
