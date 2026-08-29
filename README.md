# Gmail Declutter

Chrome (MV3) extension for Gmail + Outlook. Scans your Promotions/Updates mail
using only message **metadata** — sender, subject, date, size, read/starred
state, and a handful of headers — never the message body (one opt-in exception,
"Deep scan", below). Nothing is stored server-side; everything runs in your
browser under your own OAuth sign-in. See `SECURITY.md` for the full data /
scope breakdown.

## Dashboard tabs

Open with the toolbar icon.

- **Clean up** — senders and domains grouped by category; a retention "Ready to
  clean up" bucket (one-time codes, stale shipping, old newsletters, judged only
  by age); **Smart Views** (older-than-1-year, large mail, promotions, OTPs,
  shipping) that archive or trash the whole matched set behind one confirm;
  **Trim to newest N per sender**; and **"You never open these"** (senders whose
  every non-starred message is still unread) with Mute-all / Trash-all. Per-row:
  verified unsubscribe, Keep sorted (label + filter), **Mute** (a local
  BlackHole — a standing `from:` filter into `Declutter/Muted`), Snooze.
- **Subscriptions** — every unsubscribe-capable sender in the scan, ranked by
  volume, with per-row and bulk "unsubscribe all verified one-click". Request
  status ("Requested 3d ago") survives reloads.
- **Security** — "Possible impersonation" (see the detection section below).
- **Rules** — standing Auto-Clean rules: AND-ed conditions (from domain/address,
  older-than, kind, unread, has-unsubscribe) → one action (label / archive /
  trash / mark read). Applied on demand and by the 6-hourly background sweep.
  Starred mail is always excluded; rules never permanently delete.
- **Screener** — opt-in. Holds mail from senders you've never emailed under a
  `Declutter/Screener` label, out of the inbox, until you **Allow** (adds to the
  allow-list, restores the mail) or **Block** (mutes). Your Sent mail is the
  automatic allow-list.
- **Recently done** — every action Declutter took, newest first, with **Undo**
  where reversible (Gmail untrash / unarchive / unmute).

Every destructive action is behind a confirm; starred/flagged mail is always
skipped.

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

- **One account per provider.** `ProviderId` is a closed two-value union
  threaded through every data structure; multi-account is a large, independent
  change.
- **Outlook is scan + trash + unsubscribe only.** Keep-sorted, mute, rules
  (archive/label/mark-read), snooze, undo, and the Screener are Gmail-only —
  they need Gmail's filters/labels API. Outlook rows show "Not supported for
  this provider".
- **No confirmed-stopped tracking** — unsubscribe status shows "Requested Nd
  ago", not whether the sender actually stopped.
- **The `mail.google.com` restricted scope** (opt-in "Fast permanent delete")
  would trigger Google CASA review if the project is ever published past OAuth
  "Testing". Everything else uses non-restricted scopes.
## Optional Athena integration

Clutter contains a dormant enterprise connection to Athena. It activates only when Chrome managed
policy provides the `athena` object declared by `managed_schema.json`; normal consumer installs do
not send Athena telemetry. The connection exchanges an enrollment credential for a short-lived
token held in `chrome.storage.session`, keeps at most 200 minimized events in memory, and retries
without delaying mailbox work.

**Rule-based detection** (`src/lib/threatSignals.ts`), four kinds, all from headers already
fetched for the declutter feature (sender address, display name, and now `Authentication-Results`
— never the message body or subject, no new OAuth scope, no network call of its own):

- **Brand impersonation / freemail-brand-claim** — a display name claims a well-known brand
  (PayPal, a major bank, Microsoft, IRS, a shipping carrier, ...; ~35 brands across payments,
  shipping, tech, telecom, and government) but the actual mail domain isn't that brand's real one
  or a subdomain of it — highest confidence when a consumer free-mail domain (`gmail.com`,
  `outlook.com`, etc.) is making the claim, since no real bank sends from one.
- **Lookalike domain** — the sender's domain is a small edit distance (≤2, e.g. `paypa1.com`,
  `arnazon.com`) from a brand's real domain, fired independently of whether the display name names
  the brand at all — classic typosquatting.
- **Failed authentication** — the message's own `Authentication-Results` header shows a DMARC
  fail. This one applies to *any* sender, not just the curated brand list, since a forged sender
  doesn't have to impersonate a name on that list to be forged. Gmail already sent this header back
  for free once added to the existing `metadataHeaders` allowlist; Outlook was already fetching it
  in full via `internetMessageHeaders`, just unread until now.

Flagged senders surface in a clearly separate "Possible impersonation" dashboard section — never
blended into the regular declutter view — and get reported as minimized `warned` events to Athena
(when connected; otherwise nothing happens beyond the dashboard section) via the background
triage's existing 6-hourly alarm, deduplicated server-side by a deterministic per-sender-per-signal
id so repeat triage runs don't re-alert.

**One manual action, Gmail only: "Label as suspicious."** Applies a `Declutter/Possible Phishing`
label and archives the currently-flagged messages out of the inbox — never deletes. Deliberately a
one-click, per-occurrence action rather than a standing filter: a signal that fires today (a
lookalike domain, a DMARC fail) isn't guaranteed to still apply to whatever this sender sends next,
so nothing here creates a rule that keeps acting on future mail unreviewed.

**A second manual action, Gmail only: "Deep scan."** Everything above only ever reads headers
already fetched for the declutter feature. Deep scan is the one deliberate exception — a per-message,
opt-in fetch of the message's full HTML body (`gmailApi.ts`'s `getMessageLinks`, `format=full`, a
materially bigger and more sensitive request than the metadata-only fetch everything else here
uses) to check whether a link's visible text (`paypal.com` as the clickable text) points somewhere
other than where it claims (`linkMismatch.ts`), **and** whether any link points at a domain on the
blocklist (below). Never run automatically, never as part of the background triage — only when a
user clicks it for a specific flagged sender's most recent message. A finding reports the same
minimized `warned` event to Athena as every other signal.

**Known-bad domain list** (`blocklisted-domain`): a static, in-repo set — a hand-maintained seed
(`src/lib/blocklistSeed.ts`, edited directly) unioned with a build-time-vendored slice of
abuse.ch's URLhaus feed (`src/lib/data/malwareDomains.generated.json`, refreshed by
`npm run refresh:blocklist`). No live fetch at runtime, so it stays within the metadata-only,
no-server-calls stance. A sender whose domain (or a parent of it) is on the list gets a
high-confidence `blocklisted-domain` signal in the normal triage; Deep scan additionally checks
every link target against the same list. Refreshing the URLhaus slice is a manual dev step — review
the diff before committing; abuse.ch may require a free account's `URLHAUS_AUTH_KEY`.

The "Possible impersonation" section is ordered by a combined risk score (`senderRiskScore` in
`threatSignals.ts`): a confirmed blocklist hit outranks a freemail brand claim, which outranks a
lone lookalike or DMARC failure, and any two signals on one sender outrank a single one.

Any future detection must call `queueAthenaSecurityEvent` only after a local warning or quarantine
action, must never include message bodies or subjects, and must never automatically delete mail.
