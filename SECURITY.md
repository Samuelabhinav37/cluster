# Security & data handling

Cluster is a Manifest V3 Chrome extension. **There is no Cluster
server.** Everything runs in the extension, in your browser, under your own OAuth
sign-in. Nothing you do in the extension is sent to us, because there is no "us"
to send it to.

## What data is touched, and where it goes

| Data | Read from | Stored where | Sent where |
|---|---|---|---|
| Message headers (see below) | Gmail / Microsoft Graph API | not persisted — held in memory for the current scan only | nowhere |
| Message labels / flags, received date, size estimate | same | same | nowhere |
| Your settings, rules, action log | you, in the dashboard | `chrome.storage.local` (this browser only) | nowhere |
| Incremental sync checkpoints, durable job receipts, and background-rule completion receipts | Gmail / Microsoft Graph operations | `chrome.storage.local` (opaque cursors, bounded message IDs, status/timestamps only) | nowhere |
| Outlook access token | Microsoft sign-in | `chrome.storage.session` (memory-backed; trusted extension contexts only) | Microsoft Graph |
| Outlook refresh token | Microsoft sign-in | `chrome.storage.local` (trusted extension contexts only) | only to `login.microsoftonline.com` to refresh |
| Gmail OAuth token | Chrome | custodied by Chrome's `chrome.identity`, not by us | only to `gmail.googleapis.com` |

### Headers the scan reads

Only these, via the API's metadata format — **never the message body**:

- `From`
- `Reply-To`
- `Subject`
- `List-Unsubscribe`, `List-Unsubscribe-Post`
- `Authentication-Results`
- `DKIM-Signature` (only to verify RFC 8058 one-click header coverage)

Plus non-header metadata the same API call returns: label IDs (e.g. `STARRED`,
`UNREAD`, `INBOX`), the internal received timestamp, and the size estimate.

### The one exception: "Deep scan"

The **Deep scan** button on a flagged sender fetches that **one** message's full
body, extracts its links, checks them for target/text mismatch and against the
bundled known-bad-domain list, then discards the body. It is manual, one message
at a time, and never part of the automatic background pass. The body is never
stored and never transmitted.

### On-device rule drafting

The natural-language rule builder sends only the instruction typed into that
field to Chrome's on-device Prompt API. It does not send message headers,
subjects, bodies, IDs, or scan results. Model output is constrained to Cluster's
rule schema, validated again in deterministic TypeScript, previewed against the
current scan, and cannot call mailbox APIs. Saving and applying remain separate
user actions. When the API is unavailable, a deterministic local parser handles
the supported rule phrases.

## OAuth scopes

| Scope | Why | Restricted? |
|---|---|---|
| `https://www.googleapis.com/auth/gmail.modify` | read message metadata; add/remove labels; trash/untrash; snooze | **yes — restricted** |
| `https://www.googleapis.com/auth/gmail.settings.basic` | **incremental, not at install.** Requested the first time you use a filter-backed feature — "Keep sorted", "Mute", the Screener, or "Sort my inbox" with keep-sorting on. Creates the standing `from:` filters those features need. Declining cancels just that action. | **yes — restricted** |
| `https://mail.google.com/` | **opt-in only.** Requested at the moment you enable "Fast permanent delete", never at install. Powers `batchDelete` (skip Trash). Declining it falls back to Trash. | **yes — restricted**; request only when bypassing Trash is essential |
| Microsoft Graph `Mail.ReadBasic`, `Mail.ReadWrite`, `offline_access` | read Outlook message metadata; move to Deleted Items; refresh the token | n/a |

The only Gmail scope requested at install is `gmail.modify`;
`gmail.settings.basic` and `https://mail.google.com/` are both incremental.
Host permissions at install are limited to the three API hosts above. Access to
an unsubscribe link's own domain is requested **per origin, at the moment you
click unsubscribe** (`optional_host_permissions` + `chrome.permissions.request`),
and only for HTTPS.

Public distribution using Gmail restricted scopes requires Google's OAuth
verification. A third-party security assessment is additionally required when
restricted Gmail data is stored on or transmitted through a server; Cluster's
default no-server architecture avoids that server-data path but not verification.

Per-scope justification — the features each scope powers and why nothing
narrower works — is in [`docs/oauth-scope-justification.md`](docs/oauth-scope-justification.md).

## Host permissions

At install, host access is limited to the three API hosts the extension talks
to: `gmail.googleapis.com`, `graph.microsoft.com`, and `login.microsoftonline.com`.

`optional_host_permissions` lists `https://*/*`. This is **not** granted at
install and is never requested wholesale. When the user fires a verified
one-click unsubscribe, the extension requests access to that **one** sender's
origin (`chrome.permissions.request({ origins: ["https://that-host/*"] })`),
HTTPS only, at the moment of the click. The wildcard is unavoidable because an
unsubscribe endpoint can be on any domain and MV3 requires the pattern to be
declared in the manifest before it can be requested; the effective grant is
always a single concrete origin the user just acted on. `src/lib/netGuard.ts`
additionally rejects loopback, link-local, and private-range hosts before any
such request is made.

## Content Security Policy

`manifest.json` sets an explicit `content_security_policy.extension_pages` of
`script-src 'self'; object-src 'self'; base-uri 'none'`. All scripts are bundled
and same-origin; there is no remote script, no `eval`, and no inline event
handlers. The dashboard renders exclusively via `createElement` +
`textContent` — every `innerHTML` write in the codebase clears an element
(`= ""`), never injects markup.

## Data retention, deletion, and revocation

- **Message metadata** from a scan is held in memory only and discarded when the
  scan completes. It is never written to disk.
- **Settings, rules, action log, sync checkpoints, engagement counts** persist in
  `chrome.storage.local` for this browser only. Uninstalling the extension, or
  clearing its site data in `chrome://extensions`, removes all of it. There is
  nothing to delete server-side because nothing is stored server-side.
- **Gmail access** can be revoked at any time at
  <https://myaccount.google.com/permissions>; the extension then simply stops
  working until re-authorized.
- **Outlook access** can be revoked at
  <https://account.microsoft.com/privacy/app-access>. The refresh token in
  `chrome.storage.local` becomes inert once revoked.
- **Filters and labels** Cluster created in the user's mailbox are removed when
  the user disables the corresponding feature, and can also be deleted by hand
  in Gmail/Outlook like any other filter or label.

### Token storage tradeoff

The Outlook refresh token sits unencrypted in `chrome.storage.local`, restricted
to trusted extension contexts (`setAccessLevel("TRUSTED_CONTEXTS")`). This is
the standard MV3 pattern — there is no extension-local key store to encrypt it
with that wouldn't itself live in the same place — and it is the same trust
boundary Chrome applies to the Gmail token it custodies via `chrome.identity`.
The access token stays in memory-backed `chrome.storage.session`.

## Sub-processors

None. Cluster operates no servers and uses no analytics, error-reporting, or
third-party SDKs. The only network destinations are the Gmail API, the Microsoft
Graph / sign-in endpoints, a per-click user-approved unsubscribe origin, and —
only under enterprise managed policy — the organization's own Athena endpoint.

## Optional enterprise telemetry ("Athena")

Dormant unless an administrator provisions it through Chrome **managed policy**
(`chrome.storage.managed`, which the extension can only read). When configured
and after the user explicitly grants the connection, the extension sends
**minimized security events only** — rule ID, severity, a sender *domain* as the
indicator, and small evidence counts. Never subjects, bodies, message IDs, or
recipient addresses. The endpoint must be HTTPS. See `src/lib/athenaIntegration.ts`.

## Enforced invariants

- `src/lib/networkEgress.test.ts` fails the build if any new `fetch` call site or
  any new remote host literal appears under `src/`.
- Every destructive action is behind a confirm step; starred/flagged mail is
  always excluded; rules and the Screener label/archive/trash only — never
  permanent-delete — and are always reviewable and reversible.
- "Suggested spam" matches scanned senders against two bundled, in-repo domain
  lists (`src/lib/data/spamDomains.generated.json` from disposable-email-domains
  + StopForumSpam, plus `src/lib/blocklist.ts`) — no runtime fetch. It only
  surfaces suggestions; deletion is user-selected, confirm-gated, Trash-only,
  and undoable, and it never runs in the background.
- Threat detection is header-only (`threatSignals.ts`): brand / lookalike /
  punycode sender domains, DMARC fail (or SPF+DKIM both failing), a redirected
  Reply-To, and an urgency-lure lexicon over the **subject line only** — never
  the body. "Auto-quarantine high-risk senders" (Security tab, **off by
  default**) is the one background protective action: it labels HIGH-tier mail
  `Cluster/Possible Phishing` and files it out of the inbox, Gmail-only, never
  deletes, and every batch is reversible from Recently done.
- Authentication results are used only when their `authserv-id` belongs to the
  connected provider; sender-injected copies are ignored. Automatic one-click
  unsubscribe additionally requires a passing aligned DKIM signature covering
  both RFC 8058 headers, uses a credential-free POST, and rejects redirects.
- "New since Cluster started tracking" is judged against a local provider +
  address ledger (`settingsStore.knownSenders`). The first scan seeds the
  baseline without labeling every existing sender as new.

## Reporting a vulnerability

Open a private GitHub security advisory on
<https://github.com/Samuelabhinav37/cluster/security/advisories/new>. If that
is not available to you, open a regular issue that describes the **class** of
problem only, and a maintainer will follow up privately. Please do not post a
working exploit or a step-by-step extraction path in a public issue.

Expect an initial acknowledgement within a few days. Because Cluster runs
entirely client-side with no server to patch, a fix ships as a new extension
version through the normal release channel.
