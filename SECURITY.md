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
| Outlook OAuth tokens | Microsoft sign-in | `chrome.storage.local` (this browser only) | only back to `login.microsoftonline.com` to refresh |
| Gmail OAuth token | Chrome | custodied by Chrome's `chrome.identity`, not by us | only to `gmail.googleapis.com` |

### Headers the scan reads

Only these, via the API's metadata format — **never the message body**:

- `From`
- `Subject`
- `List-Unsubscribe`, `List-Unsubscribe-Post`
- `Authentication-Results`

Plus non-header metadata the same API call returns: label IDs (e.g. `STARRED`,
`UNREAD`, `INBOX`), the internal received timestamp, and the size estimate.

### The one exception: "Deep scan"

The **Deep scan** button on a flagged sender fetches that **one** message's full
body, extracts its links, checks them for target/text mismatch and against the
bundled known-bad-domain list, then discards the body. It is manual, one message
at a time, and never part of the automatic background pass. The body is never
stored and never transmitted.

## OAuth scopes

| Scope | Why | Restricted? |
|---|---|---|
| `https://www.googleapis.com/auth/gmail.modify` | read message metadata; add/remove labels; trash/untrash; create filters; snooze | no |
| `https://www.googleapis.com/auth/gmail.settings.basic` | create the filters behind "Keep sorted" / "Mute" | no |
| `https://mail.google.com/` | **opt-in only.** Requested at the moment you enable "Fast permanent delete", never at install. Powers `batchDelete` (skip Trash). Declining it falls back to Trash. | **yes** — triggers Google CASA review if the project is ever published beyond OAuth "Testing" |
| Microsoft Graph `Mail.ReadBasic`, `Mail.ReadWrite`, `offline_access` | read Outlook message metadata; move to Deleted Items; refresh the token | n/a |

Host permissions at install are limited to the three API hosts above. Access to
an unsubscribe link's own domain is requested **per origin, at the moment you
click unsubscribe** (`optional_host_permissions` + `chrome.permissions.request`),
and only for HTTPS.

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

## Reporting a vulnerability

Open a GitHub security advisory on
<https://github.com/Samuelabhinav37/cluster>, or a private issue. Please
describe the class of problem rather than posting a working exploit.
