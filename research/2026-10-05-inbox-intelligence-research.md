# Cluster: inbox intelligence (analytics, transactional lifecycle, vault, protection)

_2026-10-05. Branch `redesign/apple-glass-v3` at `efeeb95`. Builds on
`2026-10-05-end-to-end-walkthrough-and-roadmap.md` (the "earlier roadmap note") and does not
repeat its Phase 0/1 findings. Research only. No source code was changed._

Conventions used below:

- **Verified** claims carry an inline link to the source that owns them.
- **(Inference)** marks my own reasoning or design suggestions.
- **Not reached** marks a source I tried and could not read. I say so rather than guess.
- Code references are `path:line` on this branch.

## TL;DR

1. **Most of what users want is computable from headers plus Gmail search, inside today's
   scopes.** `gmail.modify` already permits `messages.list q=` queries (`larger:`, `has:attachment`,
   `filename:`, `older_than:`, `category:`). These return ids and a `resultSizeEstimate` for
   5 quota units per page. That is the cheap engine for analytics, storage reclaim and the vault.
2. **"Block sender" does not block.** It only labels the messages already scanned
   (`src/dashboard/securityTab.ts:299` → `gmailProvider.ts:228`). Future mail still lands in the
   inbox. Making it a standing Gmail filter / Outlook rule is the cheapest high-impact fix.
3. **One-time codes are under-detected and expire too slowly.** `OTP_RE` (`messageKind.ts:7`)
   misses "123456 is your code", "Your sign-in link", "magic link". Retention is 2 days and only
   runs on the 6-hour alarm. Apple already auto-trashes used codes in Mail.
4. **Order chains (confirmed → shipped → out for delivery → delivered) can be collapsed
   metadata-only** when the order number is in the subject, falling back to `threadId` plus a
   time window. Keep the confirmation and the latest status. Archive the middle.
5. **A Vault is the missing counterweight to cleanup.** Receipts, travel, statements, tax forms
   and contracts get a `Vault/…` label and become untouchable by every bulk path. Detection is
   subject keywords + domain category + `has:attachment filename:pdf` search. No new scope.
6. **Gmail filters can do more than Cluster assumes.** `criteria.query` takes full Gmail search
   syntax, so subject-keyword buckets (OTP, shipping) *can* be server-side filters.
   `serverSort.ts:6` says they can't. They just can't use regex.
7. **Privacy hardening, near-zero cost:** add a `fields=` mask to `messages.get` so the response
   omits `snippet` (a slice of body text that `format=metadata` is widely reported to include).
   That makes "headers only" true on the wire, not just in code.
8. **CASA may not apply to Cluster.** Google's restricted-scope page ties the security
   assessment to apps that "store or transmit restricted scope data on servers". Cluster has no
   server. Verification is still required. This contradicts the earlier roadmap's Phase 4 and is
   worth confirming with Google before budgeting for an assessment.
9. **Don't build what Gmail now gives away.** Gmail has Manage subscriptions, Purchases,
   package tracking and summary cards. Cluster should beat them on *cleanup* of those chains and
   on privacy, not on display.
10. **Tracking-pixel blocking is a non-goal.** It needs bodies, Gmail's image proxy already hides
    IP, and Cluster isn't the mail renderer. Say so honestly in the UI.

## What Cluster already does

This is the baseline. Recommendations below are deltas against it.

| Area | Existing behaviour | Where |
|---|---|---|
| Scan | `messages.list` with a category/inbox query, then `messages.get format=metadata` for From, Reply-To, Subject, List-Unsubscribe(-Post), Authentication-Results, DKIM-Signature, Precedence, Auto-Submitted. Also `labelIds`, `internalDate`, `sizeEstimate`. Default sample: newest 150. | `src/lib/gmailApi.ts:286-320`, `src/lib/providers/gmailProvider.ts:42`, `src/lib/settingsStore.ts:132` |
| Quota model | Ledger with per-method costs (get 20, list 5, batchModify 50, history 2). Matches Google's table. | `src/lib/gmailApi.ts:30-45`; [Gmail quota](https://developers.google.com/workspace/gmail/api/reference/quota) |
| Message kind | Subject regex → `otp / shipping / receipt / social / newsletter / other`. On-device Prompt API second opinion only for `other`. | `src/lib/messageKind.ts:5-22`, `src/lib/aiMessageKind.ts` |
| Bulk/automated signal | List-Unsubscribe, `Precedence: bulk/list/junk`, `Auto-Submitted: auto-*` (RFC 3834). | `src/lib/messageKind.ts:24-45` |
| Sort buckets | Kind ∪ curated domain category, flat labels ("Shopping", "One-time codes"). | `src/lib/sortTaxonomy.ts` |
| Server-side sort | Gmail filters for the 7 domain-category buckets only. | `src/lib/serverSort.ts` |
| Protection gate | Starred, provider-important, known correspondent, active-offer wording, receipt/shipping kind, sensitive subject (tax, W-2, 1099, ticket, boarding pass…), unclassified-with-no-bulk-header. Used by every delete path. | `src/lib/protectionPolicy.ts:44-84` |
| Retention | OTP 2 days, newsletter 30, social 30. Receipt/shipping/other never auto-suggested. | `src/lib/retentionPolicy.ts`, `src/lib/expiryTriage.ts` |
| Smart views | Older than 1 year, > 2 MB, Promotions, OTP, Order & shipping. | `src/lib/smartViews.ts` |
| Keep newest N | Per sender, protection-aware. | `src/lib/keepNewest.ts` |
| Never read | Sender with ≥3 unprotected messages, all unread. | `src/lib/neverRead.ts` |
| Engagement learning | EMA of unread ratio + accept/dismiss/undo counts, aggregate only. | `src/lib/engagementModel.ts` |
| Subscriptions | Trial/renewal subject regex, else curated domain match ("Seen"). | `src/lib/subscriptionSignals.ts` |
| Rules | Conditions: domain, category, address, olderThanDays, hasUnsubscribe, kind, unread. Actions: label/archive/trash/markRead. Never permanent delete. | `src/lib/rules.ts:17-45`, `src/lib/ruleRunner.ts` |
| Mute / Screener | Standing `from:<address>` Gmail filter → label, skip inbox. Outlook `messageRules`. | `src/lib/gmailApi.ts:376-450`, `src/lib/providers/outlookProvider.ts:395-412` |
| Phishing | Trusted Authentication-Results selection (authserv-id `mx.google.com`), SPF/DKIM/DMARC verdicts, brand display-name claim, freemail brand claim, edit-distance + homoglyph lookalike, punycode, blocklist, Reply-To→freemail mismatch, subject lure language, risky attachment names, first-contact ledger, opt-in auto-quarantine with review loop. | `src/lib/emailAuth.ts`, `src/lib/threatSignals.ts`, `src/lib/riskyAttachments.ts`, `src/lib/firstContact.ts`, `src/lib/quarantineReview.ts` |
| "Block sender" | Labels the scanned messages "Possible Phishing" and removes INBOX. **No standing filter.** | `src/dashboard/securityTab.ts:299-317`, `src/lib/providers/gmailProvider.ts:228` |
| Verified unsubscribe | RFC 8058 only when a DKIM signature that passed covers both headers. | `src/lib/unsubscribe.ts`, `src/lib/unsubscribeOutcome.ts` |
| Health | Overview metrics and weekly score history. | `src/lib/inboxHealth.ts`, `src/lib/settingsStore.ts:114` |
| Action log + undo | Every action path writes a capped log with undo. | `src/lib/actionLog.ts` |
| Outlook | `Mail.ReadBasic Mail.ReadWrite`; per-message `$select` incl. `inferenceClassification`, `$expand=attachments($select=name)`. | `src/lib/providers/msalAuth.ts:5`, `src/lib/providers/outlookProvider.ts:138` |
| Scopes | `gmail.modify`, `gmail.settings.basic`. `mail.google.com` only for opt-in permanent delete. | `manifest.json`, `src/lib/gmailApi.ts:487-505` |

Two small inconsistencies found while reading (not fixes, just notes):

- The "Ready to clean up" hint says "stale shipping" (`inboxHealth.ts:76`), but shipping has no
  retention entry (`retentionPolicy.ts:9`), so shipping mail never appears in that number.
- `serverSort.ts:6-8` says subject buckets can't be Gmail filters. Filters accept `subject` and a
  full search `query` ([filters resource](https://developers.google.com/gmail/api/reference/rest/v1/users.settings.filters)).
  Keyword-based subject filters are possible. Regex is not.

## Platform facts that shape every section

- **Scope classes.** Google lists `gmail.modify`, `gmail.readonly`, `gmail.metadata`,
  `gmail.settings.basic` and `mail.google.com/` as **restricted**. `gmail.labels` is
  non-sensitive. ([Gmail scopes](https://developers.google.com/gmail/api/auth/scopes))
- **`gmail.metadata` is not a viable narrower scope.** `messages.list`'s `q` "cannot be used when
  accessing the api using the gmail.metadata scope".
  ([messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list))
  Cluster's whole sizing strategy depends on `q`.
- **Body access needs no new scope.** `gmail.modify` already allows `format=full` and `raw`
  ([Format](https://developers.google.com/workspace/gmail/api/reference/rest/v1/Format)). Reading
  bodies is a **policy and trust** decision, not an OAuth one. Every "needs body" item below is
  flagged as a privacy-posture change, not a scope change.
- **`format=metadata` returns "only email message ID, labels, and email headers"** per the
  Format docs. Multiple client examples show it also returns `snippet` ("A short part of the
  message text", [Message resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages)).
  I could not find a Google statement either way. (Inference) Treat snippet as present until a
  live response proves otherwise.
- **Quota.** 6,000 units per user per minute. `messages.get` 20, `messages.list` 5,
  `threads.get` 40, `history.list` 2, `batchModify` 50.
  ([quota](https://developers.google.com/workspace/gmail/api/reference/quota))
- **Filters.** Criteria: `from`, `to`, `subject`, `query`, `negatedQuery`, `hasAttachment`,
  `size`, `sizeComparison`. Actions: `addLabelIds`, `removeLabelIds`, `forward`
  ([filters](https://developers.google.com/gmail/api/reference/rest/v1/users.settings.filters)).
  Max 1,000 filters, requires `gmail.settings.basic`
  ([filters.create](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.filters/create)).
  (Inference) Filters act at delivery, so "older than N days" can't be a filter. That stays a
  client sweep.
- **Outlook rules are richer than Gmail filters.** Predicates include `subjectContains`,
  `headerContains`, `senderContains`, `hasAttachments`, `withinSizeRange`, `isAutomaticReply`.
  Actions include `delete`, `moveToFolder`, `permanentDelete`, `markAsRead`, `assignCategories`,
  `stopProcessingRules`.
  ([predicates](https://learn.microsoft.com/en-us/graph/api/resources/messagerulepredicates),
  [actions](https://learn.microsoft.com/en-us/graph/api/resources/messageruleactions))
- **Outlook body access.** `Mail.ReadBasic` excludes "body, bodyPreview, uniqueBody, attachments,
  and extended properties". `Mail.ReadWrite` (which Cluster also requests) does not.
  ([Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-reference))
- **On-device AI.** Summarizer, Translator, Language Detector are stable from Chrome 138. The
  Prompt API is stable in Chrome 138 for extensions only.
  ([Chrome built-in AI](https://developer.chrome.com/docs/ai/built-in-apis))

---

## 1. Inbox analytics

### What competitors and platforms offer

| Product | Analytics it actually documents | Source |
|---|---|---|
| Gmail | Manage subscriptions: senders with "the number of emails sent recently" and one Unsubscribe each. | [Gmail Help](https://support.google.com/mail/answer/15621070) |
| Google One | Storage manager: "Clean up suggested items", "Clean up by service". Shared 15 GB. | [Google One Help](https://support.google.com/googleone/answer/9776477), [storage](https://support.google.com/googleone/answer/9312312) |
| iCloud Mail | Mail Cleanup: promotions/updates and old-message recommendations with action, status and age. | [iCloud guide](https://support.apple.com/guide/icloud/mma3d15ee93e) |
| Outlook.com | Sweep: delete all from a sender, keep only the latest, or delete older than 10 days. | [Microsoft Support](https://support.microsoft.com/en-us/office/organize-your-inbox-with-archive-sweep-and-other-tools-in-outlook-on-the-web-49b26f63-6399-4b4a-a580-14b9b1efe96d) |
| SaneBox | Digest of unopened mail, SaneLater, SaneBlackHole, Deep Clean. No analytics dashboard documented on its features page. | [SaneBox learn](https://www.sanebox.com/learn) |
| Clean Email | Group by date, size, senders, recipients; activity logs and "Activity Summaries". | [Clean Email features](https://clean.email/features) |
| Mailstrom | Plans capped by mailbox size; "Chill, Expire & Block". Analytics not documented on pricing page. | [Mailstrom pricing](https://mailstrom.co/pricing) |
| Leave Me Alone | Unsubscriber, Rollups, Screener. States it keeps "completely anonymous data" for statistics. | [LMA pricing](https://leavemealone.com/pricing) |
| Superhuman / Shortwave | Auto Labels / bundles. Neither documents a mailbox-analytics view. | [Superhuman](https://superhuman.com/mail/features/ai-native-email-client), [Shortwave](https://www.shortwave.com/) |

Takeaway (inference): nobody ships a good *personal* inbox report. The market offers sender
lists and storage cleaners. A calm, honest "here is your mail, here is what changed" view is open.

### What is computable, and at what cost

| Metric | How | Data needed | Cost |
|---|---|---|---|
| Volume by sender over time | Sample discovers senders. Then `q=from:<addr> after:<d1> before:<d2>` per month, read `resultSizeEstimate`. | ids only | 5 units/query |
| Volume by kind over time | Same, with subject-keyword queries per kind (`subject:("verification code" OR "one-time")`). | ids only | 5/query |
| Storage hogs by attachment | `larger:10M`, `has:attachment larger:5M older_than:1y`, `filename:(mp4 OR mov OR zip)`. Sum `sizeEstimate` only for the top results. | ids + `sizeEstimate` | 5 per list, 20 per get |
| Storage hogs by sender | Exact needs `sizeEstimate` per message (20 units each). (Inference) Show sample-based estimate, clearly labelled, plus exact totals only for the top 10 senders on demand. | metadata | high |
| Unread debt | `is:unread` counts per category (`category:promotions is:unread`) and per top sender. | ids | 5/query |
| Newsletter read rate | Already in `engagementModel.ts` (unread-ratio EMA). Promote it to the report. | labels | free |
| Response latency (mine) | Sent mail: `In-Reply-To` / `References` + `internalDate`, matched to the inbound `Message-ID` via `rfc822msgid:` ([Gmail operators](https://support.google.com/mail/answer/7190)). | headers (adds Message-ID, In-Reply-To) | 20/message. Expensive. |
| Subscription cost | Price lives in the body (or snippet). Subject rarely has it. | **body/snippet** | policy change |
| Renewal dates | Subject wording ("renews on…") sometimes has a date. Reliable dates need body. | subject, else body | partial |
| "Time saved" | Count of actions in `actionLog` × an assumed seconds-per-message. | local | free, but an estimate |

Points to be honest about:

- `resultSizeEstimate` is documented only as "Estimated total number of results"
  ([messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)).
  (Inference) Label counts "about". For exact counts, page through ids (still 5 units per 500).
- Google exposes no Gmail quota number through the Gmail API. Storage usage needs a Drive API
  scope. (Inference) Don't add a scope for a percentage bar. Show "reclaimable ≈ X MB" instead.
- "Time saved" is a made-up number unless the assumption is shown. If shown, say "≈ 3 s per
  message you didn't have to open" and let the user see the maths.

### Recommendation shape (inference)

An **Inbox report** screen, monthly, from list queries only:

1. Mail received per month, split by kind (stacked bars, 6 months).
2. Top 10 senders by volume, with read rate and trend arrow.
3. Unread debt by category.
4. Reclaimable storage: large attachments, old promotions, old OTPs.
5. What Cluster did this month (from `actionLog`), with an honest time estimate.

Budget: about 6 months × 6 kinds + 10 senders × 6 months + 6 storage queries ≈ 100 list calls ≈
500 units. Under 10% of one minute's quota. This is also the same machinery Phase 2.1 of the
earlier roadmap needs, so build it once.

---

## 2. Ephemeral and transactional mail lifecycle

### Why it matters

- Shipping chains are a real complaint. Amazon's own forum: users get "4-5 emails about a single
  order", and shipment notifications "cannot be modified" in account settings
  ([Amazon forum](https://www.amazonforum.com/s/question/0D56Q0000Cd8t88SQA/how-to-stop-all-delivery-notifications-via-email);
  a user forum, so treat as anecdotal).
- Platforms already treat codes as disposable. Google Messages can "auto-delete OTPs after 24
  hours" for SMS ([Android Central](https://www.androidcentral.com/apps-software/how-to-automatically-delete-otps-google-messages)).
  Apple's "Delete After Use" moves used verification codes in **Mail** to Trash, but only when
  AutoFill was used ([iDownloadBlog](https://www.idownloadblog.com/2023/06/29/how-to-auto-delete-sms-and-email-codes-on-iphone-mac/);
  Apple's own page was not reached).
- Gmail already shows a Purchases view with "order, shipping, and delivery confirmations in one
  place" (personal accounts only) and package tracking that uses tracking numbers in order
  email. ([Purchases](https://support.google.com/mail/answer/16624561),
  [package tracking](https://support.google.com/mail/answer/13073650)) Gmail displays chains.
  It does not clean them up.

### Detection signals

| Signal | Metadata-only? | Notes |
|---|---|---|
| Subject keywords | Yes | Current `OTP_RE` misses common shapes. Add: `\b\d{4,8}\b` together with `code\|pin\|otp`; "is your … code"; "sign-in link"; "magic link"; "log in to"; "verify your email"; "confirm your email address". |
| Sender local part | Yes | `no-reply`, `noreply`, `verify`, `security`, `account`, `auth`, `login`. A supporting signal only. |
| `Auto-Submitted: auto-generated` | Yes (already fetched) | RFC 3834 says this value "SHOULD be used on messages generated by automatic (often periodic) processes" ([RFC 3834](https://www.rfc-editor.org/rfc/rfc3834)). Good "machine-sent" corroboration. |
| No `List-Unsubscribe` | Yes | Google exempts transactional mail from one-click unsubscribe: "Transactional messages are excluded" ([sender FAQ](https://support.google.com/a/answer/14229414)). (Inference) OTPs and shipping updates usually lack it. Absence plus keywords raises confidence. |
| `CATEGORY_UPDATES` label | Yes (`labelIds`) | Gmail's own bucket. |
| `threadId` | Yes (free on list) | Some merchants thread a whole order. Many don't. |
| Order number in subject | Yes | Patterns: `#\d{3}-\d{7}-\d{7}` (Amazon-style), `order\s*#?\s*[A-Z0-9-]{5,}`. |
| Status words in subject | Yes | confirmed / shipped / out for delivery / delivered / refunded / cancelled. |
| schema.org `Order`, `ParcelDelivery` | **No.** Markup sits in the HTML body. | `ParcelDelivery` requires `expectedArrivalUntil` and `partOfOrder`; `Order` requires `orderNumber`, `merchant`, `price` ([Order](https://developers.google.com/gmail/markup/reference/order), [ParcelDelivery](https://developers.google.com/gmail/markup/reference/parcel-delivery)). Senders must register with Google and have DKIM/SPF ([registering](https://developers.google.com/gmail/markup/registering-with-google)). Reading it needs a body fetch. |
| Snippet | Body-derived | Often contains "Your code is 123456". Must never be persisted. |

### Lifecycle design (inference)

**OTPs and magic links**

- Default rule offered on first run: "Trash one-time codes after 24 hours" (user-adjustable 1h–7d).
- Run it on the existing 5-minute jobs alarm (`background.ts:57`) using `history.list`
  (2 units) to find new INBOX mail since the last cursor (`incrementalSync.ts` already does
  this). Then one metadata get per new message.
- Never store the subject of an OTP message. Store only `{id, receivedAt}` until expiry.
  The action log should say "Trashed 3 one-time codes", never the subject line.
- Keep security notices out. "New sign-in", "password reset", "security alert" are already
  protected by `SENSITIVE_SUBJECT` (`protectionPolicy.ts:44`). Keep that precedence: a security
  notice is not an OTP even if it contains a code.
- Server-side option: a Gmail filter with
  `query: subject:("verification code" OR "one-time code" OR "sign-in code" OR "login code")`
  → label "One-time codes", skip inbox. Expiry still runs client-side.

**Order chains**

1. Group key: registrable domain of sender + extracted order number. Fallback: `threadId`.
   Second fallback: same sender, status words, within 21 days.
2. Status rank: confirmed < shipped < out for delivery < delivered. Refund/cancel/return are
   terminal and **always kept**.
3. Keep: the confirmation (it is the receipt) and the newest status.
4. After "delivered" + N days (default 14), archive the middle messages. Never trash by
   default. A return window can outlast that, which is why `retentionPolicy.ts:3-8` deliberately
   gives shipping no default. Archiving respects that.
5. Leave anything with "return", "refund", "exchange" in any message of the chain alone
   (`ACTIVE_OFFER_OR_WINDOW_RE` already covers "return by / return window").

What needs a body: exact delivery dates, carrier tracking numbers, line items. None are needed
to collapse a chain.

### Privacy pitfalls

- An OTP subject can itself be the secret ("482913 is your code"). The AI classifier cache keys
  on subject text (`aiMessageKind.ts:69`). It is in-memory only, which is fine. Any new OTP code
  path must hold to the same rule and never write subjects to `chrome.storage`.
- Magic links are bearer credentials. Deep scan fetches bodies and does link checks
  (`linkMismatch.ts`). (Inference) Deep scan should refuse to fetch or follow links on messages
  classified `otp`. A HEAD/GET to a magic link can consume it, or sign the user in somewhere.

---

## 3. Important-documents vault

### Retention guidance (official)

IRS: keep records 3 years in general. 6 years if unreported income exceeds 25% of gross. 7 years
for worthless securities or bad-debt deductions. 4 years for employment tax records. Property
records until the limitation period ends for the year of disposal. Indefinitely if no return or
a fraudulent return was filed. Keep copies of filed returns.
([IRS](https://www.irs.gov/businesses/small-businesses-self-employed/how-long-should-i-keep-records))
Other countries differ. (Inference) Show the IRS defaults as a US example with a "your country
may differ" note. Don't present it as advice.

### Label taxonomy (inference)

Nested under one parent so it is easy to find and easy to protect:

```
Vault/Receipts
Vault/Travel
Vault/Statements
Vault/Tax/2026
Vault/Contracts & warranties
Vault/IDs & accounts
```

The existing sort labels are flat on purpose (`sortTaxonomy.ts:34-41`). The Vault should be
nested on purpose: one prefix makes "never delete anything under Vault/" a single rule.

### Detection

| Doc type | Metadata signals | Search-only signals |
|---|---|---|
| Receipts / invoices | `kind = receipt`; subject "receipt", "invoice", "order confirmation" | `has:attachment filename:pdf` from that sender |
| Travel | domain category travel; subject "boarding pass", "e-ticket", "itinerary", "booking confirmation", "reservation" | `filename:pkpass OR filename:pdf` |
| Statements | domain category finance; subject "statement is ready", "e-statement" | `filename:pdf` |
| Tax | subject "W-2", "1099", "1098", "tax document", "tax form" (already in `SENSITIVE_SUBJECT`) | `filename:pdf after:<Jan 1>` |
| Contracts / warranties | subject "agreement", "contract", "warranty", "policy document", "signed" (DocuSign-style senders) | `filename:pdf` |

Gmail's `filename:` operator runs server-side ([Gmail operators](https://support.google.com/mail/answer/7190)),
the same trick `riskyAttachments.ts` already uses. So attachment shape is available without
`format=full`. On Gmail, `format=metadata` excludes `payload.parts`, so filenames otherwise need
a `format=full` fetch, which pulls body text too. Outlook gets names for free via
`$expand=attachments($select=name)` (`outlookProvider.ts:138`).

schema.org `Invoice`, `FlightReservation` and similar markup would be precise
([FlightReservation](https://developers.google.com/gmail/markup/reference/flight-reservation)),
but it lives in the body. Not worth a posture change for a vault.

### Protection

- Add `Vault/*` labels to `protectionDecision` as the strongest reason, above starred. That needs
  `labelIds` on `MessageRecord` (today only `isProtected` and `providerMarkedPersonal` are
  derived from them, `senderModel.ts:19-34`).
- Rules must skip Vault mail, the same way they skip starred (`rules.ts:13-16`).
- Server-side: a filter per vault class adds the label at delivery, so protection holds even
  if the extension never runs.

### Find-later UX (inference)

A Vault screen with year and type chips. Every row opens Gmail at
`#search/label:vault-tax-2026` rather than rendering the message. Cluster never needs the body
to *find* a document. Gmail shows it.

### Scope and verification implications

- Everything above fits `gmail.modify` + `gmail.settings.basic`. No new scope.
- If a future version wants attachment bytes (OCR, export to Drive), that needs a body/attachment
  fetch and probably a Drive scope. Drive scopes have their own classes.
  (Inference) Out of scope for Cluster's positioning.
- **CASA finding.** Google: "Every app that requests access to Google users' restricted data and
  has the ability to access data from or through a third-party server must go through a security
  assessment" and "If you store or transmit restricted scope data on servers, then you need to
  complete a security assessment."
  ([restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification))
  Cluster has no server. (Inference) It may need verification but not CASA. Caveats: Deep scan
  sends a URL taken from a message body to a third party, and RFC 8058 POSTs go to the sender's
  URL. A reviewer could count either as "transmitting". Ask Google before budgeting. The
  annual-assessment language in the Limited Use policy still applies to apps that do need one
  ([User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)).

---

## 4. Protection

### 4a. Phishing

**Standards status (verified)**

- DMARC is now **RFC 9989** (Proposed Standard, 2026), obsoleting RFC 7489 and RFC 9091
  ([RFC 9989](https://www.rfc-editor.org/info/rfc9989)). Code comments citing RFC 7489 should
  move to 9989. Alignment concepts are unchanged for Cluster's purposes (inference: I did not do
  a line-by-line diff).
- ARC (RFC 8617) is **Experimental**. It "authenticates the identity of some email-handling
  actors" but "does not make any assessment of their trustworthiness"
  ([RFC 8617](https://www.rfc-editor.org/rfc/rfc8617)). (Inference) Don't treat an ARC pass as
  a trust signal. At most, use it to explain why a forwarded message failed SPF.
- RFC 8601: Cluster already trusts only the provider's own authserv-id (`emailAuth.ts:22-41`).
  The RFC text itself was **not reached** (connection reset twice). The behaviour matches the
  well-known guidance.
- RFC 8058 receivers "MUST NOT perform a POST on the HTTPS URI without user consent" and "SHOULD
  NOT offer a one-click unsubscribe" without the required DKIM signature
  ([RFC 8058](https://www.rfc-editor.org/rfc/rfc8058)). Cluster's verified-only behaviour is
  correct.
- BIMI in Gmail needs a VMC or CMC and DMARC at `p=quarantine` or `reject` with `pct=100`. The
  checkmark shows for VMC senders ([BIMI](https://support.google.com/a/answer/10911320)).
  (Inference) Gmail does not expose "verified checkmark" in the API. Not a usable signal.
- Unicode TR39: "X and Y are confusable if and only if skeleton(X) = skeleton(Y)". It defines
  mixed-script and whole-script confusables and restriction levels
  ([UTS #39](https://www.unicode.org/reports/tr39/)). Cluster's homoglyph map is a small hand
  subset (`threatSignals.ts`, `asciiSkeleton`).

**Context (verified)**

- APWG counted 853,244 phishing attacks in Q4 2025
  ([APWG Q4 2025 PDF](https://docs.apwg.org/reports/apwg_trends_report_q4_2025.pdf), figure via
  search summary; the Q1 2026 PDF downloaded but could not be parsed here, so its 971,181 figure
  is **unverified**).
- Verizon 2025 DBIR: human element in about 60% of breaches
  ([DBIR 2025](https://www.verizon.com/business/resources/reports/2025-dbir-data-breach-investigations-report.pdf);
  figure from secondary summaries, PDF not parsed).
- Microsoft's first-contact safety tip ("You don't often get email from…") is a shipped,
  recommended control ([Microsoft Learn](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about)).
  Cluster's first-contact ledger is the same idea.

**Deltas beyond the earlier roadmap's Phase 1.1** (brand aliases, DMARC-aligned discount,
softfail, Reply-To reason are already planned there):

1. **Reply-To mismatch to any unrelated registrable domain**, not just freemail
   (`threatSignals.ts:167` returns null unless Reply-To is freemail). Weight it low unless
   combined with a brand claim or first contact. Known false positives: ESPs and helpdesks
   (Zendesk, Freshdesk) legitimately set Reply-To. Needs an allow-list.
2. **Display name containing an email address** whose domain differs from the real From
   ("support@paypal.com" <x@evil.tld>). Classic display-name spoof. Header-only.
3. **Confusables from the real TR39 data.** Vendor the `confusables.txt` subset for
   Latin/Cyrillic/Greek at build time, as the blocklist is vendored. Plus the TR39 mixed-script
   check on IDN labels after punycode decode.
4. **Combine signals, don't stack them.** First contact + brand claim + DMARC not pass is far
   stronger than any one. (Inference) A small explicit rule table beats additive weights for
   explainability.
5. **Never deep-scan OTP or magic-link mail** (see §2).

**Known false-positive causes** to design against (mostly inference from the earlier live test
and common ESP practice): brand mail domains not in the alias list (`facebookmail.com`); ESP
subdomains (`em.`, `e.`, `mail.`); forwarding and mailing lists breaking SPF/DKIM (ARC's reason
to exist, per RFC 8617); helpdesk Reply-To; shared platforms (substack.com, medium.com).

### 4b. Heavy ad/marketing mail

**Costs and risks (verified)**

- 15 GB shared across Gmail, Drive and Photos. Over quota, "your ability to send and receive
  email in Gmail can be impacted", and after 2 years over quota Google may delete content
  ([Google storage](https://support.google.com/googleone/answer/9312312)).
- Trash keeps mail 30 days, then deletes permanently
  ([Gmail Help](https://support.google.com/mail/answer/7401)). That gives a free undo window for
  trash-based cleanup.
- Tracking: a Princeton study found 85% of emails embed third-party content and 29% leak the
  recipient's address to third parties ([CITP](https://blog.citp.princeton.edu/2017/09/28/i-never-signed-up-for-this-privacy-implications-of-email-tracking/),
  PETS 2018). Gmail proxies images and scans them, but "senders may know whether you've opened
  an email that has an image". "Ask before displaying external images" is the user's control
  ([Gmail Help](https://support.google.com/mail/answer/145919)). Apple MPP downloads remote content
  "privately in the background" and hides IP and opens
  ([Apple](https://support.apple.com/guide/iphone/use-mail-privacy-protection-iphf084865c7/ios)).
- Sender rules: since 1 Feb 2024 bulk senders (≈5,000+/day to Gmail) must have SPF, DKIM, DMARC
  with alignment, and one-click unsubscribe. Google recommends fulfilling unsubscribes within 48
  hours, and from November 2025 is "ramping up its enforcement" with rejections
  ([guidelines](https://support.google.com/a/answer/81126),
  [FAQ](https://support.google.com/a/answer/14229414)). Yahoo: "Honor unsubscribes within 2 days"
  ([Yahoo](https://senders.yahooinc.com/best-practices/)). (Inference) After 2 days, a sender that
  still mails you is non-compliant. `unsubscribeOutcome.ts` could say so.
- Gmail's native Block sends future mail to Spam ([Gmail Help](https://support.google.com/mail/answer/8151)).
  (Inference) Spam is a reputation signal to Google. Cluster's block should use a label, not
  Spam, unless the user picks "Report as spam".

**Making blocking "more powerful" (inference, all within current scopes)**

| Capability | Gmail | Outlook |
|---|---|---|
| Address block | filter `from:addr` → label "Blocked", remove INBOX | rule `fromAddresses` → `moveToFolder` |
| Registrable-domain block | filter `from:(@example.com)` (Gmail matches subdomains in `from:` search; verify in live test) | `senderContains: ["@example.com", ".example.com"]` |
| Pattern block | `query: from:(@*.example.com) subject:(…)`; `negatedQuery` for exceptions | `subjectContains`, `headerContains` + exceptions |
| Works with extension closed | Yes, filters are server-side | Yes, rules are server-side |
| Quarantine then delete | Filter → "Blocked" label. Background sweep trashes "Blocked" older than N days. Trash adds 30 more. | Rule → folder. Sweep → `delete` (Deleted Items). |
| Undo | Delete filter + move back. Action log already supports `unmute`-style undo. | Delete rule + move back. |
| Shared-platform guard | Never offer domain block for substack.com, gmail.com, etc. (earlier roadmap 1.4) | Same |

The registrable-domain helper (`registrableDomain.ts:35-47`) walks labels without a Public
Suffix List, so `example.co.uk` yields `co.uk` as a candidate. For *blocking* a domain that
matters. (Inference) Vendor the PSL at build time before shipping domain blocks.

Auto-delete older-than-N already exists as a rule shape (`rules.ts` `olderThanDays` + `trash`).
What's missing is presets: "Promotions older than 30 days → Trash", "Social older than 30 days".

---

## 5. What users complain about most

**Not reached:** Reddit (r/GMail, r/productivity, r/privacy). The search tool refuses
reddit.com for this agent. Nothing below is drawn from Reddit.

| Pain point | Evidence |
|---|---|
| Too much marketing mail, too often | Adobe 2019: "Frequency of brand email communications is the leading annoyance for both work and personal emails"; about 5 hours a day on email ([Adobe](https://blog.adobe.com/en/publish/2019/09/08/if-you-think-email-is-dead-think-again)). Old (2019) but the only first-party survey I could read. |
| Volume keeps growing | Radicati: 361.6 billion emails/day in 2024, 424.2 billion by 2028 (via search summary; [Radicati PDF](https://www.radicati.com/wp/wp-content/uploads/2024/10/Email-Statistics-Report-2024-2028-Executive-Summary.pdf) **not reached**, DNS failure). |
| Unsubscribe doesn't stick | Gmail itself warns "It can take a few days for the sender to unsubscribe you" ([Gmail Help](https://support.google.com/mail/answer/15621070)). Unroll.me reviews: "doesn't unsubscribe anything. It sticks certain emails into a separate folder" ([Trustpilot](https://www.trustpilot.com/review/unroll.me)). |
| Fake unsubscribe (filter to trash) | InboxPurge "creates a filter in Gmail that sends emails directly to your Trash folder, but it doesn't actually unsubscribe" ([Clean Email's comparison](https://clean.email/blog/clean-email-alternatives/best-inboxpurge-alternative), a competitor, so biased). |
| Storage full | Gmail sending/receiving can be impacted over quota ([Google](https://support.google.com/googleone/answer/9312312)). |
| Shipping email spam | 4-5 emails per order, can't be turned off ([Amazon forum](https://www.amazonforum.com/s/question/0D56Q0000Cd8t88SQA/how-to-stop-all-delivery-notifications-via-email)). |
| Cleanup tools deleting the wrong thing | Clean Email review: the app deleted "messages from personal folders and emails the user had sent to themselves" ([Trustpilot](https://www.trustpilot.com/review/clean.email)). |
| Billing and paywalls | Clean Email: auto-renewal complaints, refunds denied ([Trustpilot](https://www.trustpilot.com/review/clean.email)). InboxPurge: free credits "run out during the very first real cleanup" (via search summary of Chrome Web Store reviews; store page not read directly). |
| Privacy fear | Unroll.me reviewers: "THEY SELL YOUR EMAIL" ([Trustpilot](https://www.trustpilot.com/review/unroll.me)). See the FTC case in §6. |
| Setup / training effort | SaneBox: the initial setup and training felt tedious; support access limited ([Trustpilot](https://www.trustpilot.com/review/sanebox.com)). |

Trustpilot samples are small (Unroll.me has 13 reviews) and self-selected. Treat them as
direction, not measurement.

(Inference) The complaints line up with Cluster's strengths: honest unsubscribe, protection
gate, no server, no billing. The gaps are the first-run experience (earlier roadmap) and
"it keeps coming back" (blocking that persists, §4b).

---

## 6. Competitor feature matrix

✓ = documented. — = not documented in the source read (may still exist). "Server" means mail
data is processed on the vendor's servers.

| | Analytics | OTP / transactional lifecycle | Vault / docs | Phishing | Persistent block | Verified unsubscribe | Runs where | Privacy posture |
|---|---|---|---|---|---|---|---|---|
| **Cluster** | Health score, never-read, sample-based | OTP 2-day expiry, order view | Protection only | Header-based, explainable | **No** (label only) | ✓ RFC 8058 | Browser | No server |
| Gmail | Manage subscriptions | Purchases, package tracking, summary cards | — | Gmail's own | Block → Spam | Sends request | Google | Google |
| Outlook.com | — | Sweep: keep latest / older than 10 days | — | First-contact tip (M365) | Rules, Sweep | — | Microsoft | Microsoft |
| iCloud Mail | Cleanup recommendations | "Archive old transactions" | — | — | Unsubscribed senders → Trash | Bulk unsubscribe | Apple | Apple |
| SaneBox | Digest | — | — | — | SaneBlackHole | — | Server ("stays on your email server") | Server-side ([help](https://www.sanebox.com/help)) |
| Clean Email | Group by size/date/sender, activity log | Keep Newest, Smart Folders (shopping, rideshare) | — | Privacy Monitor (breach checks) | Block, Mute | Partial | Server | Says headers only, index deleted 45 days after last login ([privacy](https://clean.email/privacy)) |
| Mailstrom | — | Expire (auto-delete by sender after time) | — | — | Block | — | Server | — |
| Leave Me Alone | Anonymous stats | Rollups | — | Spam/cold-outreach blocker | ✓ | ✓ | Server | No content stored "unless we need it to create your Rollups"; no data sale ([pricing](https://leavemealone.com/pricing)) |
| InboxPurge | — | — | — | — | Filter → Trash | No (per competitor) | Browser extension | Local, OAuth-verified ([site](https://www.inboxpurge.com/)) |
| Shortwave | — | Bundles, auto-labels | — | — | One-click block | — | Server + AI providers | Sends content to third-party AI per reviews ([search summary](https://www.stork.ai/en/shortwave-ai)); privacy page **not reached** (404) |
| Superhuman | — | Auto Labels (Marketing, Pitch, Social, News), Auto Archive | — | — | — | — | Server | — |
| Unroll.me | — | Rollup | — | — | — | — | Server | **FTC 2019**: told users it would not "touch" personal email, while sharing e-receipts with parent Slice, which sold anonymized purchase data in market-research products. Order requires deletion of e-receipts without consent ([FTC](https://www.ftc.gov/news-events/news/press-releases/2019/12/ftc-finalizes-settlement-company-misled-consumers-about-how-it-accesses-uses-their-email)). |

**Correction to earlier notes.** The earlier roadmap described Clean Email as "processes full
content". Its privacy page says "We only access the envelope and header information… The actual
bodies of your emails are never downloaded or accessed", with server-side indexing deleted 45
days after the last login ([Clean Email privacy](https://clean.email/privacy)). The real
difference from Cluster is *where*: Clean Email indexes on its servers, Cluster in the browser.

**Positioning (inference).** Only browser-only tools (Cluster, InboxPurge) can say "no server".
Unroll.me is the cautionary tale that makes that claim worth money: receipts are exactly the
data a vault touches. Cluster's vault must stay label-based and never extract or export receipt
content.

---

## Prioritized recommendations

Ordered by impact ÷ effort. S = days, M = 1–2 weeks, L = weeks. **No item requires a new OAuth
scope.** Items marked ⚠ change the privacy posture (body or snippet use) without a scope change.

| # | Feature | User problem | Detection approach | Scope needed (current vs new) | Effort | Risk | Maps to file(s) |
|---|---|---|---|---|---|---|---|
| 1 | **Persistent Block** (address, then domain), quarantine label, sweep-to-trash after N days, undo | "I blocked them and they're back" | Gmail filter `from:` → "Blocked" + remove INBOX. Outlook rule `fromAddresses` → folder. Background sweep. | Current (`gmail.settings.basic`, `Mail.ReadWrite`) | S | Low. Filter cap 1,000; batch per domain. | `src/dashboard/securityTab.ts:299`, `src/lib/gmailApi.ts:376-450`, `src/lib/providers/outlookProvider.ts:395`, `src/background.ts` |
| 2 | **`fields=` mask on metadata gets** | "Headers only" should be true on the wire | `fields=id,threadId,labelIds,internalDate,sizeEstimate,payload/headers` | Current | S | Very low. Verify in live test that `snippet` disappears. | `src/lib/gmailApi.ts:286-301, 415-421` |
| 3 | **OTP detection + fast expiry** (default 24 h, opt-in) | Codes pile up; codes are secrets | Wider subject regex (digits + "code", magic/sign-in link, verify email), `Auto-Submitted`, no List-Unsubscribe; 5-min alarm via `history.list` | Current | S | Medium: false positives on security notices. Keep `SENSITIVE_SUBJECT` precedence; trash, not delete. | `src/lib/messageKind.ts:7`, `src/lib/retentionPolicy.ts`, `src/lib/incrementalSync.ts`, `src/background.ts:57` |
| 4 | **Deep scan refuses OTP / magic-link mail** | Following a magic link can sign in or burn it | `kind === "otp"` or subject "sign-in link" | Current | S | Very low | `src/lib/linkMismatch.ts`, `src/dashboard/securityTab.ts` |
| 5 | **Vault labels + protection** (`Vault/Receipts`, `/Travel`, `/Statements`, `/Tax/<year>`, `/Contracts & warranties`) | "I'm scared cleanup will delete my tax form" | Kind + domain category + subject keywords + `has:attachment filename:pdf` searches; server filters for new mail | Current | M | Low. Needs `labelIds` on `MessageRecord`. | `src/lib/protectionPolicy.ts`, `src/lib/senderModel.ts:19`, `src/lib/sortTaxonomy.ts`, `src/lib/serverSort.ts`, `src/lib/rules.ts` |
| 6 | **Storage reclaim view** | Quota full; Gmail may stop receiving | `larger:`, `has:attachment larger:5M older_than:1y`, `category:promotions older_than:1y`, `resultSizeEstimate` + top-N `sizeEstimate` | Current | M | Low. Label counts "about". No % of quota (would need Drive scope). | `src/lib/smartViews.ts`, new `src/lib/storageReclaim.ts`, `src/lib/gmailApi.ts` |
| 7 | **Order-chain collapse** (keep confirmation + latest, archive middle after delivered + 14 d) | 4-5 emails per order | Order-number regex in subject, status rank, `threadId` fallback, 21-day window | Current | M | Medium: split shipments, returns. Archive only; keep refund/return chains. | `src/lib/messageKind.ts`, new `src/lib/orderChains.ts`, `src/lib/keepNewest.ts` (pattern), `src/lib/smartViews.ts` |
| 8 | **Server-side subject filters for OTP/shipping/receipts** | Sorting only happens every 6 h with browser open | `criteria.query: subject:("…" OR "…")` | Current | S | Low. Keyword lists, no regex; English-only. | `src/lib/serverSort.ts:6-30` |
| 9 | **Inbox report** (monthly volume by kind/sender, unread debt, read rate, actions taken) | "Is it getting better?" | List-query counts per month; `engagementModel` read rate; `actionLog` | Current | M | Low. Shares engine with roadmap 2.1. | `src/lib/inboxHealth.ts`, `src/lib/engagementModel.ts`, `src/lib/actionLog.ts`, new `src/lib/inboxReport.ts` |
| 10 | **Cleanup presets** (Promotions > 30 d → Trash, Social > 30 d, OTP > 1 d) | Users don't want to author rules | Existing rule conditions | Current | S | Low | `src/lib/rules.ts`, `src/dashboard/rulesTab.ts` |
| 11 | **Phishing deltas**: any-domain Reply-To mismatch (with ESP allow-list), address-in-display-name, TR39 confusables data, rule-table combos, RFC 9989 refs | Missed spoofs; noisy red flags | Header-only | Current | M | Medium: helpdesk Reply-To FPs | `src/lib/threatSignals.ts:157-170`, `src/lib/emailAuth.ts` |
| 12 | **PSL-backed registrable domain** | Domain block on `co.uk`-style suffixes | Vendored Public Suffix List at build time | Current | S | Low; bundle size | `src/lib/registrableDomain.ts` |
| 13 | **Unsubscribe follow-up**: "still mailing after 2 days" | "Unsubscribe doesn't work" | Compare `unsubscribeRequests[at]` to later messages | Current | S | Low | `src/lib/unsubscribeOutcome.ts`, `src/lib/settingsStore.ts:16` |
| 14 | ⚠ **Subscription cost / renewal date from snippet**, on-device, opt-in, never persisted | "What am I paying for?" | Snippet → Prompt API structured extraction | Current scope; **posture change** (snippet is body text) | M | High trust risk; English bias; Unroll.me optics | `src/lib/subscriptionSignals.ts`, `src/lib/aiMessageKind.ts` |
| 15 | ⚠ Tracking-pixel count per sender | "Who is tracking me?" | Requires `format=full` | Current scope; **posture change** | M | High cost (20 units/msg), low value given Gmail proxy | Not recommended |

Nothing here needs `mail.google.com/`, `gmail.readonly`, a Drive scope, or new Graph
permissions. If any later item does, it falls under the restricted-scope rules in §3.

## Suggested phased roadmap

Slots after the earlier note's **Phase 1 (trust and accuracy)**. Phase 2 of that note (whole-
mailbox sizing) shares machinery with B and C below, so they are interleaved.

### Phase 1b: protection that persists (S, ~1 week)
- 1 Persistent Block with quarantine and undo.
- 2 `fields=` mask.
- 4 Deep scan refuses OTP mail.
- 12 PSL vendoring (prerequisite for domain block).
- 13 Unsubscribe "still mailing" follow-up.

### Phase 2 (existing): whole-mailbox sizing via list queries
Build the list-query counter as a shared module. It powers Phase 2.1, the report and storage.

### Phase 2b: ephemeral mail (S–M)
- 3 OTP detection and fast expiry.
- 8 Server-side subject filters.
- 10 Cleanup presets.
- 7 Order-chain collapse (M), after a live-inbox check of real subject shapes.

### Phase 2c: keep what matters (M)
- 5 Vault labels, detection, protection, server filters.
- 6 Storage reclaim view (uses the Phase 2 counter).

### Phase 3 (existing): UI calm-down
Fold the Vault and storage views into the calmer layout instead of adding tabs.

### Phase 3b: insight (M)
- 9 Inbox report.
- 11 Phishing deltas.

### Later / only with explicit opt-in
- 14 Snippet-based cost and renewal extraction. Ship only if users ask, behind a clearly worded
  switch, and never persist the extracted text.

## Open questions for the user

1. **Block semantics.** Should "Block" file to a "Blocked" label (reversible, private) or to
   Spam (also trains Google's filter)? Gmail's native Block uses Spam.
2. **OTP expiry default.** Off by default with a one-tap offer, or on at 24 hours? Apple only
   deletes codes it knows were used. Cluster can't know that.
3. **Order chains: archive or trash** the middle messages? This note recommends archive.
4. **Vault label style.** Nested `Vault/…` breaks with the flat style of the sort labels. OK?
5. **Snippet.** Are you willing to use snippet text at all (item 14), even on-device and
   unstored? It weakens the "headers only" line in `docs/privacy.md`.
6. **CASA.** Do you want to ask Google whether a no-server extension needs the security
   assessment, before the earlier roadmap's Phase 4 budgets for one? Deep scan's outbound link
   check is the part most likely to be questioned.
7. **Countries.** Should vault retention show only IRS guidance, or should it be locale-aware
   (UK HMRC, India ITD, etc.)? I only verified the IRS page.
8. **Reddit evidence.** Reddit was unreachable from this agent. If user-voice evidence matters
   for prioritisation, it needs a manual pass.
