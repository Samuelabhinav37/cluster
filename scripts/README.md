# scripts/

Dev-only utilities. **None run during `npm run build`** — the extension ships
only what's committed. Run them by hand when you need to.

| Script | How to run | What it does |
|---|---|---|
| `refresh-blocklist.mjs` | `npm run refresh:blocklist` | Regenerates `src/lib/data/malwareDomains.generated.json` from URLhaus (abuse.ch, CC0). May need `URLHAUS_AUTH_KEY=…` — see the file header. |
| `refresh-spam-domains.mjs` | `npm run refresh:spam` | Regenerates `src/lib/data/spamDomains.generated.json` from `disposable-email-domains` (CC0) + StopForumSpam toxic-domains. |
| `gen-logo.mjs` | `npm i -D sharp` then `node scripts/gen-logo.mjs` | Regenerates the logo SVGs + `public/icons/icon-*.png`. `sharp` is deliberately **not** a kept devDependency (heavy native dep); the generated PNGs are committed instead. |
| `bench-pipeline.mts` | `npx tsx scripts/bench-pipeline.mts` | Throwaway CPU/heap bench for the pure in-memory pipeline (no network). Context: `research/2026-09-06-gmail-quota-403-audit.md`. |

The committed JSON slices are the source of truth the extension bundles; the
refresh scripts only update them.
