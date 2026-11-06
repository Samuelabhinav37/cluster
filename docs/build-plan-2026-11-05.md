# Build plan, 2026-11-05 (streamline)

Source: `research/2026-11-05-how-cluster-works-and-ux-audit.md` section 6 (ranked fixes) and section 4 (audit).
Branch: `feat/streamline-2026-11` (on top of `feat/scan-2026-11`). One commit per step. Never push until told.

| Step | Fix | Status |
|---|---|---|
| 1 | Label by Gmail search first (filter queries + `in:inbox`, batchModify), before the read finishes | done |
| 2 | Setup Start and sign-in never wait on Gmail; work shows on the scan card | done |
| 3 | One number per fact: Cleanup badge = page, Overview Suspicious = Security | done |
| 4 | "Label as" in Details rows, with "always for this sender", applied to old mail | done |
| 5 | Learn from Gmail moves (Cluster label removed or swapped twice for a sender → correction) | done |
| 6 | One category system, hide empty labels | done |
| 7 | Overview: scan card plus 3 widgets | done (kept the category donut; it opens each kind in Details) |
| 8 | Words: Held, Never opened, no speed-limit line, Welcome on first visit, one setup wording | done |
| 9 | Get to zero: move older than N days out, keep unread/starred, undo | done (fixed 30 days; appears once older mail is read) |
| 10 | Labelled top-bar icons, "What Cluster learned" first in Settings | |

Check each step with `npx tsc --noEmit`, `npx vitest run <touched tests>`, and the preview
(`node scripts/preview/serve.mjs`, `/src/dashboard/index.html?reset&pinned&scale=11`).
