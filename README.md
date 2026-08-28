# Gmail Declutter (v0)

Chrome extension. Shows senders from your Promotions/Updates mail (last 180 days),
verified real unsubscribe (RFC 8058 one-click where the sender supports it,
mailto:/link fallback otherwise), and a "Keep sorted" action that creates a real
Gmail label + filter so future mail from that sender auto-files itself.

Nothing is stored server-side — everything runs in your browser, in your own
Gmail account, using your own OAuth token.

## One-time setup (you do this part — it's an external dashboard, not code)

1. Go to [Google Cloud Console](https://console.cloud.google.com/), create a new project.
2. **OAuth consent screen**: set User Type to "External", publishing status
   "Testing" (this avoids Google's full verification/CASA process while you're
   validating — capped at 100 test users you add by email).
   - Add yourself (and later testers) under "Test users".
   - Add scopes: `gmail.modify` and `gmail.settings.basic`.
3. Run `npm install && npm run dev` (or `npm run build`) first — you need the
   extension loaded once to get its ID.
4. Go to `chrome://extensions`, enable Developer Mode, "Load unpacked", select
   the `dist/` folder. Copy the extension ID Chrome assigns it.
5. Back in Cloud Console: **Credentials → Create Credentials → OAuth client ID**,
   application type **Chrome Extension**, paste the extension ID.
6. Copy the generated client ID into `manifest.json`'s `oauth2.client_id`,
   replacing the placeholder. Re-run `npm run build` and reload the extension.

## Dev

```
npm install
npm run dev     # or: npm run build, then load dist/ as unpacked
```

Click the toolbar icon to open the dashboard tab.

## What's deliberately not built yet

- No background sync / push notifications — you open it, it fetches fresh.
- No cross-device sync of "keep sorted" decisions beyond what Gmail filters
  themselves already do server-side.
- No confirmed-stopped tracking (checking whether mail from a sender actually
  stopped after N days) — status just shows "requested".
- Single account only.

These are the natural v1 additions once the core loop is validated on real use.
## Optional Athena integration

Clutter contains a dormant enterprise connection to Athena. It activates only when Chrome managed
policy provides the `athena` object declared by `managed_schema.json`; normal consumer installs do
not send Athena telemetry. The connection exchanges an enrollment credential for a short-lived
token held in `chrome.storage.session`, keeps at most 200 minimized events in memory, and retries
without delaying mailbox work.

**First rule-based detection: brand impersonation** (`src/lib/threatSignals.ts`). From the same
headers already fetched for the declutter feature (sender address, display name — never the
message body or subject), flags a sender whose display name claims to be a well-known brand
(PayPal, a major bank, Microsoft, IRS, a shipping carrier, ...) but whose actual mail domain isn't
that brand's real one — highest confidence when it's a consumer free-mail domain (`gmail.com`,
`outlook.com`, etc.) making the claim, since no real bank sends from one. Flagged senders surface
in a new, clearly separate "Possible impersonation" dashboard section — never blended into the
regular declutter view — and get reported as minimized `warned` events to Athena (when connected;
otherwise nothing happens beyond the dashboard section) via the background triage's existing
6-hourly alarm. Nothing is labeled, moved, or deleted automatically; this is detection and
reporting only, not action, matching the never-auto-delete rule below.

**Deliberately not built yet, and why** (see `threatSignals.ts`'s own header for the full
reasoning): SPF/DKIM/DMARC authentication-result checking, which needs a provider-layer change to
fetch the `Authentication-Results` header this feature doesn't request today; and cross-referencing
link domains against a real malicious/phishing domain list, which needs a real data-sourcing
decision first (a live fetch would contradict this project's own metadata-only, no-server-calls
stance, so it would have to be a build-time-vendored copy instead — new tooling, not a
`threatSignals.ts` change). Also not built: any actual label/quarantine *action* on a flagged
sender — today this only warns (dashboard + Athena event), consistent with the rule below that any
future action must never auto-delete mail.

Any future detection must call `queueAthenaSecurityEvent` only after a local warning or quarantine
action, must never include message bodies or subjects, and must never automatically delete mail.
