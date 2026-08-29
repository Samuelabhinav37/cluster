// Hand-curated known-bad domains, edited directly in this file as you come
// across them. Kept separate from data/malwareDomains.generated.json -- the
// machine-refreshed URLhaus slice -- so `npm run refresh:blocklist` never
// touches anything you added by hand.
//
// This is the right place for lookalike / typosquat domains a phishing
// message pointed at: URLhaus is malware-distribution focused and won't
// carry most of them. One registrable domain per entry, lowercase, no
// scheme, no path, no leading "www.". A subdomain match is automatic --
// listing "evil.example" also blocks "login.evil.example".
export const BLOCKLIST_SEED: readonly string[] = [
  // "paypal-secure-login.example",
  // "account-verify-amazon.example",
];
