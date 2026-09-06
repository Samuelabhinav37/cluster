# OAuth scope justification

For Google's OAuth verification review. One row per scope Cluster requests,
the user-facing features that require it, and why nothing narrower works.

Cluster is a Manifest V3 Chrome extension. **There is no Cluster server.** All
processing happens in the extension, in the user's browser, under their own
Google sign-in via `chrome.identity`. No Gmail data — restricted or otherwise —
is transmitted to or stored on any Cluster-operated system. See `SECURITY.md`
for the full data-flow.

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
| Deep scan (manual, one message) | `users.messages.get` (`format=full`) for that one message | Extract links from the body to check for target/text mismatch. The body is discarded immediately and never stored or transmitted. |

### Why nothing narrower works

- `gmail.readonly` / `gmail.metadata` would cover the scan but not the Trash,
  label, and inbox-filing actions that are the point of the product.
- `gmail.labels` covers label CRUD but not `batchModify` on messages or Trash.
- The scan itself uses **only** the metadata format
  (`From`, `Reply-To`, `Subject`, `List-Unsubscribe`, `List-Unsubscribe-Post`,
  `Authentication-Results`, `DKIM-Signature`) plus label IDs, internal date, and
  size estimate. It never requests `format=full` except for the manual,
  one-message-at-a-time Deep scan.

### Data handling

Message metadata is held in memory for the duration of one scan and then
discarded. It is never written to disk and never leaves the browser. Settings,
rules, and the action log persist in `chrome.storage.local` (this browser only)
and contain sender addresses, domains, counts, timestamps, and bounded message
IDs — never subjects or bodies.

---

## `https://www.googleapis.com/auth/gmail.settings.basic` — restricted

**Requested at install.** (A future release may move this to incremental
authorization, requested the first time a filter-backed feature is used.)

### Features that require it

| Feature | Gmail API calls | Why |
|---|---|---|
| Keep sorted | `users.settings.filters.create` | Create a standing `from:` filter so future mail from that sender is auto-labelled and filed. |
| Mute (local BlackHole) | `users.settings.filters.create` / `.delete` | A standing filter that hides all future mail from an address; reversible. |
| Screener | `users.settings.filters.create` / `.delete`, `users.settings.filters.list` | Hold future mail from unknown senders under a label; release reverses the filter. |
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
on or transmitted through a server. Cluster's no-server architecture avoids that
data path entirely — restricted data never leaves the user's browser — but the
extension is still subject to OAuth verification for the restricted scopes above.
The `src/lib/networkEgress.test.ts` invariant fails the build if any new network
call site or off-origin asset reference is introduced under `src/`.
