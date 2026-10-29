# OAuth scope justification

For Google's OAuth verification review. One row per scope Cluster requests,
the user-facing features that require it, and why nothing narrower works.

Cluster is a Manifest V3 Chrome extension. All processing happens in the
extension, in the user's browser. Google sign-in uses `launchWebAuthFlow` with
PKCE; a small Cluster sign-in helper (`auth-worker/`) adds the client secret to
the code and refresh-token swaps and stores nothing. No Gmail data — restricted
or otherwise — is transmitted to or stored on any Cluster-operated system. See
`SECURITY.md` for the full data-flow.

---

## `https://www.googleapis.com/auth/gmail.modify` — restricted

**Requested at install.**

### Features that require it

| Feature | Gmail API calls | Why |
|---|---|---|
| Inbox scan | `users.messages.list`, `users.messages.get` (`format=metadata`) | Read the headers and label IDs the whole product is built on. |
| Clean up / Ready to clean up / Suggested spam / Smart Views / Trim to newest | `users.messages.batchModify` (add `TRASH`, remove `INBOX`) | Move mail the user selected to Trash. Always reversible; never permanent. |
| Undo | `users.messages.batchModify` (remove `TRASH` / restore `INBOX`) | Reverse a Trash or Archive the user just did. |
| Rules, "Sort my inbox", Read Later, Snooze, auto-quarantine | `users.messages.batchModify` (add/remove user labels and `INBOX`/`UNREAD`), `users.labels.list`, `users.labels.create` | Apply and remove labels; file mail out of and back into the inbox; mark read. |
| Unsubscribe by email | `users.messages.send` | When a sender only accepts unsubscribe requests by email, send the email the sender's List-Unsubscribe header asks for, from the user's account, after the user reviews it in full and presses Send. Never automatic, never to an address the sender didn't sign. |
| Link check on already-flagged mail (automatic, at most 20 a scan, in the open dashboard) and Deep scan (manual, one message) | `users.messages.get` (`format=full`) for that message | Extract links from the body to check for target/text mismatch and known-bad sites. Only two counts are kept; the body is discarded immediately and never stored or transmitted. |

### Why nothing narrower works

- `gmail.readonly` / `gmail.metadata` would cover the scan but not the Trash,
  label, and inbox-filing actions that are the point of the product.
- `gmail.labels` covers label CRUD but not `batchModify` on messages or Trash.
- The scan itself uses **only** the metadata format
  (`From`, `Reply-To`, `Subject`, `List-Unsubscribe`, `List-Unsubscribe-Post`,
  `Authentication-Results`, `DKIM-Signature`, `Precedence`, `Auto-Submitted`,
  `To`, `Cc`, `Message-ID`, `In-Reply-To`, `References`, `List-Id`,
  `Return-Path`, `Feedback-ID`, `Sender`, `Content-Type`, `List-Post`,
  `X-Auto-Response-Suppress`, `Date`; for sent mail `To`, `Cc`, `Bcc`) plus
  label IDs, thread ID, internal date, and size estimate, with a field mask so
  no `snippet` is returned. It requests `format=full` only for the link check on
  already-flagged mail described above.

### Data handling

Message metadata is held in memory for the duration of one scan and then
discarded. It is never written to disk and never leaves the browser. Settings,
rules, and the action log persist in `chrome.storage.local` (this browser only)
and contain sender addresses, domains, counts, timestamps, and bounded message
IDs — never subjects or bodies.

---

## `https://www.googleapis.com/auth/gmail.settings.basic` — restricted

**Requested the first time a filter-backed feature is used** (incremental
authorization). Install asks only for `gmail.modify`. If the user unticks this
scope, the filter feature says so and asks again next time.

### Features that require it

| Feature | Gmail API calls | Why |
|---|---|---|
| Keep sorted | `users.settings.filters.create` | Create a standing `from:` filter so future mail from that sender is auto-labelled and filed. |
| Mute (local BlackHole) | `users.settings.filters.create` / `.delete` | A standing filter that hides all future mail from an address; reversible. |
| Screener | `users.settings.filters.create` / `.delete`, `users.settings.filters.list` | Hold future mail from unknown senders under a label; release reverses the filter. |
| Unsubscribe by email | `users.settings.sendAs.list` | Find which of the user's own addresses a list was sent to, so the unsubscribe email goes from that address. |
| "Sort my inbox" → keep sorting | `users.settings.filters.create` / `.list` / `.delete` | One standing filter per domain-category bucket so the background sweep keeps sorting new mail server-side. |

### Why nothing narrower works

There is no narrower scope for the Gmail Settings filters API.
`gmail.settings.basic` is the minimum. Cluster uses only the **filters**
sub-resource — never forwarding addresses, send-as aliases, vacation responder,
IMAP/POP, or language settings.

Cluster creates at most one filter per muted/screened sender and one per
domain-category bucket (≤7). Every filter it creates is torn down when the user
disables the corresponding feature.

### Data handling

Filter definitions live in the user's own Gmail account. Cluster stores the
filter IDs it created in `chrome.storage.local` so it can remove exactly the
ones it made and no others.

---

## `https://mail.google.com/` — restricted

**Opt-in only. Never requested at install.** Requested via incremental
authorization the moment the user enables "Fast permanent delete for Gmail" in
Settings, and only then.

### Feature that requires it

| Feature | Gmail API call | Why |
|---|---|---|
| Fast permanent delete (bulk flows only) | `users.messages.batchDelete` | Delete without going through Trash, for users who have explicitly opted in. |

### Why nothing narrower works

`users.messages.batchDelete` requires the full-access `https://mail.google.com/`
scope; `gmail.modify` cannot bypass Trash. Because this is genuinely broad, it
is gated behind an off-by-default toggle and an incremental consent prompt, so a
user who never enables it never grants it. If the elevated grant is denied or
later fails, every affected flow falls back to a reversible Trash.

---

## Not requested

Cluster does **not** request `gmail.send`, `gmail.compose`, `gmail.insert`,
`gmail.settings.sharing`, Google account profile scopes beyond the implicit
sign-in, Drive, Calendar, Contacts, or any other Google API scope.

## Third-party security assessment (CASA)

A CASA assessment is additionally required when restricted Gmail data is stored
on or transmitted through a server. Cluster's architecture keeps Gmail data off
its servers entirely — restricted data never leaves the user's browser; only
sign-in tokens pass through the sign-in helper — but the
extension is still subject to OAuth verification for the restricted scopes above.
The `src/lib/networkEgress.test.ts` invariant fails the build if any new network
call site or off-origin asset reference is introduced under `src/`.
