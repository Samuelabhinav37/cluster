# Cluster: Gmail headers, bodies and classification accuracy

_2026-10-26. Branch `master` at `150057c`. Research only. No source code was changed._

This note feeds the proposed five-layer classifier: layer 0 normalises text, layer 1 reads
header facts, layer 2 is a safety floor nothing can lower, layer 3 is a per-user model and
layer 4 is optional on-device Gemini Nano. It builds on two earlier notes and does not repeat
them. The first is `2026-10-05-algorithm-audit-and-upgrades.md` (the "audit"), especially Part B.
The second is `2026-10-05-inbox-intelligence-research.md` (the "intelligence note"), section
"Platform facts". Anything those notes settled is referenced, not re-derived. **New** marks
facts that change or add to them.

Conventions, same as the earlier notes:

- **Verified** claims carry an inline link to the primary source that owns them.
- **(Inference)** marks my own reasoning or design suggestions.
- **Not reached** marks a source I tried and could not read. A secondary write-up is never
  cited as if it were primary.
- Code references are `path:line` on `master`.

## TL;DR

1. **Reading a body now costs 3× a metadata read.** **New:** `messages.get` costs 20 units,
   "60 when format is full, raw, or html". The limit is still 6,000 units per user per minute
   ([quota](https://developers.google.com/workspace/gmail/api/reference/quota)). So a body scan
   tops out near 100 messages a minute, against 300 for metadata. Projects that used the API
   between Nov 2025 and Apr 2026 keep their old quotas. Batching saves no quota: n calls count
   as n ([batch](https://developers.google.com/workspace/gmail/api/guides/batch)).
2. **No new scope is needed for bodies.** `gmail.modify` already allows `full` and `raw`. Only
   `gmail.metadata` forbids them
   ([Format](https://developers.google.com/workspace/gmail/api/reference/rest/v1/Format)). CASA
   applies only when data passes "from or through a third-party server"
   ([restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)).
   So the real cost of reading bodies is trust and copy. The manifest promises
   "Metadata-only" (`manifest.json:5`).
3. **Google's policy explicitly allows a per-user model and bans a shared one.** **New:**
   Workspace data may not be used to "create, train, or improve a machine learning or
   artificial intelligence model beyond that specific user's personalized model"
   ([Workspace policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)).
   The proposed layer 3 fits that rule exactly. Federated or shared training would break it.
4. **Most headers that say "this is bulk" are written by the sender.** That includes List-Id,
   List-Unsubscribe, Precedence, Auto-Submitted, Feedback-ID, X-Mailer, BIMI-Selector, the
   Message-ID domain and every ESP `X-` header. They can push mail *towards* "keep" or
   "bulk". They must never lower a safety gate. Only Gmail's `mx.google.com`
   Authentication-Results, its labels, and DKIM domains that Gmail verified are
   provider facts (§2).
5. **Cheap headers to add now:** `Content-Type` (top level), `List-Post`,
   `X-Auto-Response-Suppress`, `Date` and `User-Agent`/`X-Mailer`. Each one is a few bytes in
   the 20-unit call Cluster already makes. On Outlook, parse BCL, CAT and SFV out of
   `X-Microsoft-Antispam` / `X-Forefront-Antispam-Report`. Cluster already fetches these via
   `internetMessageHeaders`. Do not add `Received` or `ARC-*`: they are big, and the
   attacker controls everything below Gmail's own hop (§2.3).
6. **schema.org markup is a strong "transactional" hint, but not a trust signal for
   Cluster.** Gmail renders markup only for registered senders with DKIM/SPF, high volume and
   low complaints
   ([registration](https://developers.google.com/workspace/gmail/markup/registering-with-google)).
   Cluster reads the raw JSON-LD, so it cannot tell a registered sender from a phisher who
   pasted an `Order` block. Let markup *add* "keep". Never let it lower a threat score (§3).
7. **Keep bodies out of the background scan.** Read a body only on demand (Deep scan, which
   already exists) and for messages already at warn or hold. Hold it in memory, keep only
   derived booleans, and never store text (§3.4).
8. **Copy Gmail Priority Inbox for layer 3.** It is a global logistic model plus a per-user
   model, summed in log-odds. Updates are confidence-weighted, so manual corrections count
   more. Each user gets their own threshold. Errors fell from 45% (global only) to 38% with
   user models, and to 31% with per-user thresholds
   ([Aberdeen et al.](https://research.google.com/pubs/archive/36955.pdf)). In Cluster, the
   static signed priors file plays the global model (§5).
9. **Per-install salting is Weinberger's personalised hashing.** Weinberger et al. appended a
   user id to each token before hashing. They got a 30% spam reduction at 2²² buckets
   ([arXiv 0902.2206](https://arxiv.org/abs/0902.2206)). The salt stops installs from being
   linked to each other. It does not stop someone holding the device from running a
   dictionary attack (§5.3).
10. **Measure cost, not accuracy.** Androutsopoulos et al. weighted a lost legitimate message
    as λ = 9 or 999 spam misses, and report a total cost ratio against doing nothing
    ([arXiv cs/0006013](https://arxiv.org/abs/cs/0006013)). Cluster should gate CI on two
    things. Zero protected-class deletions on the fixture set. And a cost-weighted error
    under a fixed budget (§6).

---

## How this was researched

- Read the earlier notes and these files: `src/lib/{threatSignals,emailAuth,messageKind,
  senderLedger,verdict,aiMessageKind,linkMismatch,headerFields,gmailApi,riskyAttachments}.ts`,
  `src/lib/providers/{gmailProvider,outlookProvider,emailProvider}.ts` and `manifest.json`.
- Fetched primary sources with curl and WebFetch. developers.google.com blocked WebFetch, but
  curl reached it, so every Google API fact below comes from the live page. DBLP refused
  connections (TLS reset, then HTTP 429), so I checked paper metadata with arXiv, Crossref
  and the publisher DOI instead.
- **Not reached:** the TREC 2007 corpus page (the NIST index links to
  `plg.uwaterloo.ca/~gvcormac/treccorpus07/`, which returns 404). Platt's 1999 paper itself
  (cited through Lin, Lin & Weng's note, which restates his formulation). Official Mailchimp
  and SendGrid header references (only blog and glossary pages turned up).

### What Cluster fetches today (baseline for everything below)

- `getMessageMetadata` (`src/lib/gmailApi.ts:376-399`) requests `format=metadata` with these
  headers: From, Reply-To, List-Unsubscribe, List-Unsubscribe-Post, Subject,
  Authentication-Results, DKIM-Signature, Precedence and Auto-Submitted. It adds
  `RELATIONSHIP_HEADERS` (`src/lib/headerFields.ts:78-88`): To, Cc, Message-ID, In-Reply-To,
  References, List-Id, Return-Path, Feedback-ID and Sender.
- Bodies are read only by `getMessageLinks` (`gmailApi.ts:831-836`, `format=full`), and only
  from the dashboard's Deep scan.
- Attachments on Gmail are found through a `filename:` search, not parts
  (`src/lib/riskyAttachments.ts:1-10`).
- Outlook reads `internetMessageHeaders` and `inferenceClassification`
  (`src/lib/providers/outlookProvider.ts:141`). It still `$select`s `sender`, not `from`
  (audit U2 is still open).
- Already done since the audit: Authentication-Results is now tokenised and has a trust
  boundary (`emailAuth.ts:1-8`, audit U1). There is a sender ledger for DKIM and Reply-To
  drift (`senderLedger.ts`). And the AI layer may only add protection
  (`aiMessageKind.ts:154-160`).
- Still open: display names are matched raw (`threatSignals.ts:173-178`). Confusables are a
  hand table of about 20 characters (`threatSignals.ts:188-195`). There is no NFKC and no
  stripping of default-ignorables, so the audit's zero-width and Cyrillic display-name
  evasions still apply.

---

## 1. What the Gmail API returns, and what it costs

### 1.1 Formats

| Format | Returns (verbatim from Google) | Body? | Allowed under `gmail.metadata`? |
|---|---|---|---|
| `minimal` | "only email message ID and labels; does not return the email headers, body, or payload" | no | yes |
| `metadata` | "only email message ID, labels, and email headers" | no (see snippet) | yes |
| `full` | "full email message data with body content parsed in the `payload` field" | yes | **no**: "Format cannot be used when accessing the api using the gmail.metadata scope" |
| `raw` | "full email message data with body content in the `raw` field as a base64url encoded string" | yes, plus every header | **no** (same sentence) |

Source: [Format enum](https://developers.google.com/workspace/gmail/api/reference/rest/v1/Format).
`metadataHeaders[]` means "When given and format is METADATA, only include headers specified"
([messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)).
`messages.get` accepts `mail.google.com`, `gmail.modify`, `gmail.readonly` and
`gmail.metadata` (same page).

Message fields ([Message resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages)):

- `snippet`: "A short part of the message text." Google does not say which formats include it.
  The intelligence note left this open, and it is **still unverified**. (Inference) It is
  body-derived text. If `format=metadata` returns it, Cluster already receives a slice of
  every body, and "Metadata-only" is imprecise. One live call with `fields=snippet` settles
  it. Do this before any copy promises "we never see the body".
- `internalDate`: "the time the message was originally accepted by Google, which is more
  reliable than the Date header" for SMTP mail. (Inference) Use `internalDate` for ordering and
  age. Use `Date − internalDate` only as a weak skew feature, because Date is sender-written.
- `sizeEstimate`: "Estimated size in bytes of the message."
- `payload.parts[].filename`: "Only present if this message part represents an attachment".
  `parts[]` "only applies to container MIME message parts". Gmail returns parts only with
  `full`, which is why Cluster uses the `filename:` search instead (`riskyAttachments.ts:1-10`).
- `classificationLabelValues`: Workspace-only Drive classification labels. Ignore them.

### 1.2 Labels Gmail exposes

Gmail's label guide lists system labels INBOX, SPAM, TRASH, UNREAD, STARRED, IMPORTANT, SENT
and DRAFT, plus CATEGORY_PERSONAL, CATEGORY_SOCIAL, CATEGORY_PROMOTIONS, CATEGORY_UPDATES and
CATEGORY_FORUMS. It notes "The preceding list isn't exhaustive"
([labels guide](https://developers.google.com/workspace/gmail/api/guides/labels)). Labels live
on messages. A thread's labels are the union of its messages' labels (same page).

What each label is worth as a feature:

- **IMPORTANT** is Gmail's per-user model output. It uses "Whom you email, and how often…
  Which emails you open… reply to… Keywords that are in emails you usually read… Which emails
  you star, archive, or delete"
  ([Gmail Help](https://support.google.com/mail/answer/186543)). It is a provider fact and
  the strongest single feature Cluster gets for free. (Inference) Gmail already folds deletes
  into importance, so Cluster's own "trash" label is partly correlated with it. Do not count
  both as independent evidence.
- **CATEGORY_\*** follows Gmail's tab definitions. Updates means "Automated confirmations,
  notifications, statements, and reminders". Forums means "online groups, discussion boards,
  and mailing lists". Users can move mail between tabs to train them
  ([Gmail Help](https://support.google.com/mail/answer/3094499)). (Inference) Category labels
  map almost one-to-one onto Cluster's kinds: Updates covers transactional mail, Social is
  social, Promotions is marketing and Forums is lists. Use them as strong layer-3 priors, not
  as ground truth. Users with tabs turned off may get no CATEGORY_\* labels at all. That is
  unverified, so treat a missing label as "unknown", not as "personal".
- **SPAM** is Gmail's verdict, and Cluster already reads it (`gmailProvider.ts:204`).

### 1.3 Quota and size

From the [usage limits page](https://developers.google.com/workspace/gmail/api/reference/quota),
read live today:

| Item | Value | Change vs the intelligence note |
|---|---|---|
| Per user per project | 6,000 units/min | same |
| Per project | 1,200,000 units/min | **new** |
| Daily billing threshold | 80,000,000 units/day/project; "Google will share full billing details later in 2026" | **new** |
| `messages.get` | 20 (**60** for `full`, `raw` or `html`) | **new 3× body cost** |
| `messages.list` | 5 | same |
| `threads.get` | 40 (**120** for `full`) | new |
| `threads.list` | 10 | n/a |
| `messages.attachments.get` | 20 | n/a |
| `history.list` | 2 | same |
| `batchModify` / `batchDelete` | 50 | same |

- The page says new limits apply "As of May 1, 2026". Projects that "made any use of this API
  between November 2025 and April 2026 will continue with their previously set usage quotas".
  (Inference) Cluster's existing project is probably grandfathered. Budget against the new
  table anyway, because a re-created project or a second client id would not be.
- The quota table mentions an `html` format that the Format enum does not list. (Inference)
  This is a doc mismatch. Don't build on `html`.
- Batch: "You're limited to 100 calls in a single batch request". Google recommends "no more
  than 50". "A set of n requests batched together counts toward your usage limit as n
  requests" ([batch guide](https://developers.google.com/workspace/gmail/api/guides/batch)).
  Batching saves round trips, not quota.
- `messages.list` `maxResults` is at most 500, and `q` "cannot be used… with the gmail.metadata
  scope" ([messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)).
- Size: Google documents no per-message size limit for `get`. A `full` response inlines
  part bodies, and `raw` carries the whole RFC 5322 message base64url-encoded. (Inference)
  A newsletter with inline HTML is often 50-200 KB. A 25 MB attachment in `raw` is 33 MB
  of base64. Never use `raw` for scanning.

### 1.4 Scopes, verification and CASA

- `gmail.modify` is described as "Read, compose, and send emails… does not allow immediate,
  permanent deletion". `gmail.metadata` is "labels and headers, but not the email body". Both
  are **restricted** ([scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)).
- `batchDelete` requires `https://mail.google.com/` only
  ([batchDelete](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/batchDelete)).
  Cluster calls it with an `elevatedToken` (`dashboard.ts:2613`). This is consistent and noted
  only for completeness.
- **Security assessment.** "Every app that requests access to Google users' restricted data and
  has the ability to access data from or through a third-party server must go through a
  security assessment" (CASA). It is annual, "at least every 12 months"
  ([restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)).
  (Inference) Cluster has no server and declares no non-Google host permission besides the
  static GitHub Pages dataset host. So restricted-scope verification applies (it already
  does, for `gmail.modify`), but CASA does not. Reading bodies does not change that. Adding
  *any* server that touches mail would.
- **Limited Use** covers "raw data… and data aggregated, anonymized, or derived from them". It
  says "Don't allow humans to read the data" without affirmative agreement
  ([User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)).
  (Inference) Hashed feature weights are "derived" data. They stay on the device and are used
  only for the user-facing feature, so they comply. Exporting them, for example in a support
  bundle, would be a "transfer" and needs explicit consent.
- **Per-user model clause.** The Workspace policy prohibits "using user data to create, train,
  or improve a machine learning or artificial intelligence model beyond that specific user's
  personalized model"
  ([Workspace policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)).
  Its approved Gmail use cases include apps that "enhance the email experience" and
  "reporting or monitoring services… that improve the email experience" (same page).
  (Inference) This is a direct policy basis for layer 3. It also rules out training the shipped
  priors on any user's mail, even with consent. The priors must come from public corpora and
  synthetic fixtures (§6).

### 1.5 Outlook parity (brief)

- Graph `bodyPreview` is "The first 255 characters of the message body". `internetMessageHeaders`
  "Requires $select to retrieve". `inferenceClassification` is "focused or other", "based on
  inferred relevance or importance, or on an explicit override"
  ([Graph message](https://learn.microsoft.com/en-us/graph/api/resources/message)).
- **New:** Microsoft stamps `X-Microsoft-Antispam` with **BCL**, the bulk complaint level. A
  value of 0 means "The message isn't from a bulk sender"
  ([BCL](https://learn.microsoft.com/en-us/defender-office-365/anti-spam-bulk-complaint-level-bcl-about)).
  It also stamps `X-Forefront-Antispam-Report` with **CAT** (BULK, PHSH, SPOOF, HPHSH, UIMP…)
  and **SFV** ([EOP headers](https://learn.microsoft.com/en-us/defender-office-365/message-headers-eop-mdo)).
  "As of July 2026, all messages identified as bulk that are promotional in nature… receive
  the Promotions tag" (BCL page). (Inference) These are Microsoft's equivalent of Gmail's
  CATEGORY_PROMOTIONS and SPAM. They are free in the headers Cluster already pulls. Confirm on
  one live inbound message that Exchange overwrites any sender-supplied copy before trusting
  it. Microsoft documents the stamping, but I found no statement that it strips forged copies.

---

## 2. Headers for classification: meaning and who controls them

"Controls" says who can write the value the user sees. **P** means the provider (Gmail or
Exchange) writes it at receipt, so it is trustworthy. **S-auth** means the sender writes it
and a passing, From-aligned DKIM signature covers it. It is then trustworthy as "this domain
said so", which is not the same as "this is safe". **S** means the sender or anyone else
writes it: attacker-controlled.

### 2.1 The table

| Header | What it reliably means | Controls | Fetched now? | Use in Cluster |
|---|---|---|---|---|
| `From` | Author mailbox(es): "the person(s) or system(s) responsible for the writing" ([RFC 5322 §3.6.2](https://www.rfc-editor.org/rfc/rfc5322)) | S, but DMARC binds the domain to SPF/DKIM ([RFC 9989](https://www.rfc-editor.org/rfc/rfc9989)) | yes | Identity key. Display name always S. |
| `Sender` | "the agent responsible for the actual transmission"; MUST appear when From has several mailboxes (RFC 5322 §3.6.2) | S | yes | `Sender ≠ From` is a weak bulk/delegation hint, not a threat by itself |
| `Reply-To` | Where replies go (RFC 5322 §3.6.2) | S | yes | Drift vs ledger baseline (already in `senderLedger.ts`). Mismatch is a threat input. |
| `Return-Path` | Envelope sender, a trace field written at final delivery ([RFC 5322 §3.6.7](https://www.rfc-editor.org/rfc/rfc5322)) | P writes it, S chooses its value | yes | Bounce domain = ESP fingerprint. SPF is checked on it. |
| `Authentication-Results` (authserv-id `mx.google.com`) | Gmail's verdicts. Forged copies exist, and consumers must select by authserv-id ([RFC 8601 §7.1](https://www.rfc-editor.org/rfc/rfc8601)) | **P** (only the trusted one) | yes | Safety floor input. Already tokenised (`emailAuth.ts`). |
| `ARC-Authentication-Results`, `ARC-Seal`, `ARC-Message-Signature` | Results from earlier hops. "ARC authenticates the identity of some email-handling actors. It does not make any assessment of their trustworthiness" ([RFC 8617 §9](https://www.rfc-editor.org/rfc/rfc8617)). Experimental. | S (any hop) | no | **Do not fetch.** Gmail's own AR already reflects its ARC evaluation. |
| `DKIM-Signature` `d=`, `s=` | `d=` is "The SDID claiming responsibility". `s=` is the key selector ([RFC 6376 §3.5](https://www.rfc-editor.org/rfc/rfc6376)) | S until verified | yes | Use only the `header.d` values Gmail's AR marks `dkim=pass` (`passingDkimDomains`). Raw `d=` is a claim. |
| DKIM `h=` / `l=` | Which headers are signed. `l=` "might allow display of fraudulent content" ([RFC 6376 §8.2](https://www.rfc-editor.org/rfc/rfc6376)) | S | yes (inside DKIM-Signature) | Treat header X as S-auth only if X is in `h=` of a passing, aligned signature. Flag `l=`. |
| `Received` chain | Trace. Each hop prepends one. | P for the topmost (Gmail) hop, S below it | no | **Do not fetch.** It is large, and the lower hops are attacker-written. |
| `List-Unsubscribe` | Unsubscribe method(s) ([RFC 2369](https://www.rfc-editor.org/rfc/rfc2369)) | S, S-auth when signed | yes | Bulk signal. Google requires it for marketing above 5,000/day ([sender guidelines](https://support.google.com/a/answer/81126)). |
| `List-Unsubscribe-Post` | One-click is valid only with "a valid DKIM signature that covers at least the List-Unsubscribe and List-Unsubscribe-Post headers"; otherwise the receiver "SHOULD NOT offer a one-click unsubscribe" ([RFC 8058 §3-4](https://www.rfc-editor.org/rfc/rfc8058)) | S-auth required | yes | Already enforced. As a feature, "valid one-click" is stronger than "has header". |
| `List-Id` | List identifier ([RFC 2919](https://www.rfc-editor.org/rfc/rfc2919)). "SHOULD NOT be used as an indication of the authenticity of the message" (§8) | S | yes | Grouping key (Substack, Google Groups). Forum vs newsletter. |
| `List-Post` | How to post. `NO` for "a list that does not allow posting (e.g., an announcements list)" ([RFC 2369 §3.4](https://www.rfc-editor.org/rfc/rfc2369)) | S | **no** | **Add.** `NO` = announcement/newsletter. A mailto = discussion list (forum). |
| `Precedence` | Non-standard. "its use and interpretation vary widely" ([RFC 3834 §2, §3.1.8](https://www.rfc-editor.org/rfc/rfc3834)) | S | yes | Weak bulk hint only. |
| `Auto-Submitted` | "originated by an automatic process, or an automatic responder, rather than by a human"; values `no`, `auto-generated`, `auto-replied` ([RFC 3834 §5](https://www.rfc-editor.org/rfc/rfc3834)) | S | yes | Machine-authored hint. `auto-replied` = out-of-office or bounce. |
| `X-Auto-Response-Suppress` | Exchange/Outlook client asks receivers not to send DR, NDR, RN, NRN, OOF or AutoReply; `All` = every bit ([MS-OXCMAIL](https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxcmail/ced68690-498a-4567-9d14-5c01f974d8b1)) | S | **no** | **Add.** (Inference) Outlook-generated system mail (calendar, notifications, ticketing) sets `All`. Weak machine hint. |
| `Feedback-ID` | Google FBL `a:b:c:SenderId`. SenderId is "Mandatory… 5–15 characters". To prevent spoofing the traffic "needs to be DKIM signed by a domain owned (or controlled) by the sender, after the addition of this header" ([Google FBL](https://support.google.com/a/answer/6254652)) | S-auth only if in `h=` | yes | Strong bulk/ESP signal. SES always adds one, with SenderId `AmazonSES` ([AWS](https://aws.amazon.com/about-aws/whats-new/2024/06/amazon-ses-custom-values-feedback-header/)). |
| `Message-ID` (right-hand side) | The host that generated the id; RECOMMENDED to hold "some domain identifier" ([RFC 5322 §3.6.4](https://www.rfc-editor.org/rfc/rfc5322)) | S | yes | ESP fingerprint: SES "overrides the header with its own value" ([SES header fields](https://docs.aws.amazon.com/ses/latest/dg/header-fields.html)). A mismatch with From is normal for bulk mail. |
| `In-Reply-To` / `References` | Parent Message-ID(s) (RFC 5322 §3.6.4) | S | yes | **Personal signal when a referenced id is one the user sent** (match against Sent Message-IDs). A bare `In-Reply-To` is forgeable ("Re:" scams). |
| `To` / `Cc` | Recipients | S | yes | User in To + few recipients = personal. User absent (Bcc or list) = bulk. |
| `Content-Type` (top level) | MIME structure: `text/plain`, `multipart/alternative`, `multipart/mixed`, `multipart/related`, `multipart/report` | S | **no** | **Add.** It is returned among the top-level headers. (Inference) `multipart/report` = bounce or DSN. `multipart/mixed` = attachment present. Plain text from a known person = personal. |
| `Date` | Sender clock | S | **no** | **Add** (cheap). Skew vs `internalDate` and send-hour regularity (bulk mail is scheduled). Weak. |
| `X-Mailer` / `User-Agent` | Sending software | S | **no** | Optional. (Inference) Desktop mail-client strings suggest a human, but they are trivially forged, so use them only toward "personal/keep". |
| ESP `X-` headers (`X-SG-EID`, `X-Mailgun-*`, `X-SES-Outgoing`, `X-MC-User`…) | ESP internal ids | S | no | **Skip.** Official ESP references not reached (§How this was researched). SendGrid documents only `X-Message-ID` as webhook metadata ([Twilio](https://www.twilio.com/docs/sendgrid/glossary/x-message-id)). Use generic fingerprints instead: verified DKIM `d=`, Return-Path domain, Message-ID domain, Feedback-ID SenderId. |
| `BIMI-Selector` | Sender picks which BIMI record to use ([BIMI draft-14 §5.1](https://datatracker.ietf.org/doc/html/draft-brand-indicators-for-message-identification)) | S | no | Skip. |
| `BIMI-Location` / `BIMI-Indicator` | Inserted by the receiving MTA after checks. Any existing copy "MUST be either removed or renamed" (draft-14 §5.2-5.3, §7.8) | P if the receiver implements BIMI | no | Skip until verified. Gmail shows a checkmark for VMC senders and requires DMARC ([Google BIMI](https://support.google.com/a/answer/10911320)), but I found no Google statement that Gmail *stamps* these headers. |
| Attachment filenames / MIME types | Part `filename` and `mimeType` (Message resource) | S | via `filename:` search | Keep the current search approach. Parts need `full` (60 units). |
| `X-Microsoft-Antispam` BCL, `X-Forefront-Antispam-Report` CAT/SFV (Outlook) | Microsoft verdicts (§1.5) | P (verify stripping) | yes (in `internetMessageHeaders`) | **Parse now.** |

### 2.2 The rule this table implies

(Inference, extending audit B.4.) Split the header features by who controls them:

- **May lower a safety gate (P only):** the trusted AR verdicts, Gmail's SPAM, IMPORTANT and
  CATEGORY labels, verified DKIM domains, the sender ledger built from those, and the
  user's own Sent mail.
- **May only add caution or add protection (S, S-auth):** everything else. Two examples of
  what that means. An attacker who adds `List-Unsubscribe` makes their mail *more* likely to
  be suggested for cleanup, which is harmless. An attacker who adds `In-Reply-To` must not
  gain "personal" status unless the referenced Message-ID is one the user really sent.
- **S-auth is not "safe".** A passing DKIM signature means the domain sent it. Phishers
  DKIM-sign their own lookalike domains. RFC 8617 says of passing authentication: it "is not
  an indication of message safety" (§9).

### 2.3 Headers to add to `metadataHeaders` now

(Inference) Each one is a few bytes in the existing 20-unit call, with no quota change:

1. `Content-Type`
2. `List-Post`
3. `X-Auto-Response-Suppress`
4. `Date`
5. `User-Agent` and `X-Mailer` (optional, keep-direction only)

Explicitly **not**: `Received`, `ARC-*`, `Received-SPF` (its content is already in the
trusted AR), `BIMI-*` (unverified on Gmail), and ESP `X-` headers.

On Outlook, change nothing in the fetch. Parse BCL, CAT, SFV and SCL out of the headers it
already pulls. Separately, fix `$select=from` (audit U2).

---

## 3. Body features

### 3.1 schema.org markup in Gmail

- Gmail uses markup for actions and "highlights": Order and parcel delivery, flight, hotel,
  event, invoice, restaurant, train, bus and car rental
  ([overview](https://developers.google.com/workspace/gmail/markup/overview)). Markup is
  JSON-LD in `<script type="application/ld+json">` or Microdata, with types such as `Order`,
  `ParcelDelivery`, `FlightReservation` and `Invoice`
  ([Order reference](https://developers.google.com/workspace/gmail/markup/reference/order)).
- Gmail honours markup only after registration. The requirements: "authenticated using DKIM
  or SPF"; the DKIM/SPF domain must match the From domain; "a static email address";
  "hundreds of emails a day minimum to Gmail) for at least a few weeks"; "A very low rate of
  spam complaints". Actions "shouldn't be used on promotional bulk mail"
  ([registration](https://developers.google.com/workspace/gmail/markup/registering-with-google)).
  Mail a user sends to themselves always renders, for testing (same page).
- Promotions-tab annotations use `PromotionCard` and `DiscountOffer` in the HTML head
  ([Promotions annotations](https://developers.google.com/workspace/gmail/promotab/overview)).
  This is a strong, sender-declared *marketing* signal.

(Inference) **Trust for Cluster.** Registration controls what *Gmail* renders. Cluster parses
the raw HTML, so it sees an `Order` block whether or not the sender is registered. A phisher
can paste one. So:

- `Order`, `ParcelDelivery`, `*Reservation` or `Invoice` together with DMARC pass, an aligned
  domain and a familiar sender in the ledger → strong transactional, protect.
- The same markup from an unfamiliar or unauthenticated sender → it may still *add* "keep"
  (deleting it is the costly error). It must never lower a threat score or justify releasing
  a hold.
- `PromotionCard` or `DiscountOffer` → marketing, even if the subject says "order".

### 3.2 Other body features: value against cost

| Feature | Signal | Prior work | Needs body? |
|---|---|---|---|
| HTML vs text ratio, `multipart/alternative` with tiny text part | Template or bulk mail | Grbovic et al. use body length and URL counts per sender ([arXiv 1606.09296](https://arxiv.org/abs/1606.09296)) | yes. **Top-level `Content-Type` is a cheap proxy (§2.3)** |
| Link count, distinct link domains | Bulk and marketing carry many. Phishing often carries 1-3. | URL counts as features (Grbovic) | yes |
| Tracking pixels (1×1 images, known tracker hosts) | Marketing. "About 30% of emails leak the recipient's email address to one or more" third parties when viewed ([Englehardt et al., PETS 2018](https://doi.org/10.1515/popets-2018-0006)) | same | yes |
| Link text ≠ href domain | Phishing | Already in `linkMismatch.ts` | yes (Deep scan) |
| URL shorteners in links | Phishing or evasion hint | (Inference) no primary rate found | yes |
| OTP code pattern in body | OTP | (Inference) subject already catches most (`messageKind.ts:30-39`) | subject first |
| Unsubscribe footer text | Marketing. Google requires "a clearly visible unsubscribe link in the message body" for marketing ([sender guidelines](https://support.google.com/a/answer/81126)) | Grbovic: "unsubscribe body feature" | yes. The header already covers most of it. |
| Quoted reply block (`>` lines, `gmail_quote`) | Personal thread | (Inference) Gmail's class names are undocumented. Prefer the References-to-Sent match (§2.1) | yes |

### 3.3 What reading bodies costs

- **Quota:** 60 units against 20 (§1.3). 100 messages a minute at most, shared with everything
  else.
- **Speed:** (Inference) A `full` response is often 10-100× the bytes of a metadata response.
  HTML parsing in an MV3 service worker has no DOM, so Cluster stays on regex extraction.
  `linkMismatch.ts:21-24` already accepts that trade-off.
- **Privacy and trust:** the manifest description says "Metadata-only" (`manifest.json:5`).
  Limited Use covers derived data (§1.4).
- **Attack surface:** bodies are fully attacker-written. Every body feature lives in the
  "may only add caution or protection" set.

### 3.4 Recommendation

(Inference)

1. **Never read bodies in the background scan.** Headers and labels carry most of the class
   signal (§4).
2. **Read bodies on demand only:** (a) Deep scan, which exists today; (b) automatically, but
   only for messages already at **warn or hold**, to add link-mismatch, shortener and markup
   evidence before the user sees the verdict, capped at about 20 a scan (1,200 units);
   (c) "Check this message" on a message the user opens in Cluster.
3. **Never store body text.** Extract features in memory, persist only booleans and counts
   keyed by message id (`hasOrderMarkup`, `linkMismatchCount`, `trackerCount`), then drop
   the string.
4. **Change the copy if (b) ships.** "Metadata-only" would need to become "headers only,
   except messages you ask us to check or that already look suspicious". The CWS listing and
   privacy policy need the same change.

---

## 4. Telling the classes apart

### 4.1 What the field found

- **Machine-generated mail dominates, so sort machine from human first.** Yahoo split
  "personal and machine-generated email" first, then found "6 'latent' categories (one for
  human- and the others for machine-generated messages)". Precision and recall were "close to
  90%" over 500 billion messages ([Grbovic et al., CIKM 2014](https://arxiv.org/abs/1606.09296),
  [DOI](https://doi.org/10.1145/2661829.2662018)). Their features:
  - **address** features: subdomains and the local part ("subname (e.g. billing, noreply)");
  - **behavioural** features: how often recipients "read, deleted, replied to, forwarded" a
    sender's mail;
  - **burst** features: a sender sending more than X an hour;
  - a rule: "we categorized all reply/forward messages as human".

  They found that aggregating by **sender** beats aggregating by domain. Domains suffer a
  "multiple businesses loss" (target.com sends orders, careers and payroll). Senders suffer
  only a small "machine-human mix" (a recruiter who sometimes writes personally).
- **Templates.** Google treats machine mail as instances of templates. Labels propagate over
  a template graph, reaching "more than 91% precision and 93% recall" and over 11% more
  coverage ([Wendt et al., WSDM 2016](https://doi.org/10.1145/2835776.2835780),
  [Google Research](https://research.google/pubs/hierarchical-label-propagation-and-discovery-for-machine-generated-email/)).
  (Inference) On the device, the cheap template key is (verified DKIM `d=`, From local part,
  subject with digits and names masked). That is enough to group "Your order #123 has
  shipped" across messages without reading a body.
- **Priority Inbox** features are social (sender-recipient interaction), content (headers and
  terms), thread (for example "if a user began a thread") and label features
  ([Aberdeen et al.](https://research.google.com/pubs/archive/36955.pdf)).
- **Gmail tabs and IMPORTANT** are provider outputs of the same idea (§1.2). **Outlook Focused
  Inbox** and BCL/CAT are Microsoft's (§1.5; Focused Inbox signals are in audit B.1).

### 4.2 Signal combinations Cluster can compute from headers

(Inference, built from §2 and §4.1. "+" means the signal is present, "−" means absent.)

| Class | Strong combination | Disqualifiers | Provider shortcut |
|---|---|---|---|
| **Personal** | References or In-Reply-To matches a Message-ID the user sent; **or** sender in Sent correspondents + DMARC pass + no List-\* + few recipients + user in To | List-Unsubscribe, Feedback-ID, local part `noreply\|no-reply\|notifications\|news\|marketing`, burst sender | IMPORTANT, CATEGORY_PERSONAL; Outlook `focused` |
| **Transactional** (receipt, shipping, booking, account) | Auth pass + aligned + local part `orders\|receipts\|billing\|booking\|shipment\|account` + no List-Post + (markup on demand) + subject kind | `PromotionCard`/`DiscountOffer`; Precedence bulk together with a promo subject | CATEGORY_UPDATES |
| **OTP / security code** | Subject code phrase + code token (`messageKind.ts:30-39`) + auth pass + short message (`sizeEstimate` small) + no List-Unsubscribe | Security-alert wording (`OTP_EXCLUDE_RE`) | CATEGORY_UPDATES |
| **Account security notice** | Auth pass + known brand domain + "new sign-in / password changed" wording | Unfamiliar sender → threat path, not "keep" | none. Safety floor keeps these. |
| **Newsletter** | List-Id + List-Post `NO` or absent + valid one-click + stable sender + regular cadence | none | CATEGORY_PROMOTIONS or UPDATES |
| **Marketing** | Valid one-click + Feedback-ID + ESP fingerprint + high link count or trackers (on demand) + `PromotionCard` | none | CATEGORY_PROMOTIONS; Outlook BCL ≥ 1 / CAT:BULK |
| **Forum / list** | List-Id + List-Post mailto + Sender ≠ From | none | CATEGORY_FORUMS |
| **Social / notification** | Auth pass + social-network domain + `notification` local part + Auto-Submitted | none | CATEGORY_SOCIAL |
| **Phishing / scam** | Existing `verdict.ts` rules: auth fail; brand claim from freemail; lookalike or combosquat; blocklist; Reply-To or DKIM drift from ledger; plus link mismatch on demand | Known correspondent suppresses impersonation only (Microsoft's model; `verdict.ts:9-13`) | SPAM; Outlook CAT:PHSH/SPOOF/UIMP |

### 4.3 Language independence

- Headers, labels, auth verdicts, structure and sender history do not depend on language.
  (Inference) They should carry most of the weight, which also fixes the audit's
  "English subject regex flips fate" problem by demoting subject regexes to one feature
  among many.
- For subject text, use character 3-grams on the TR39 skeleton plus word unigrams, both
  hashed (§5.3). (Inference) Character n-grams work across scripts without a tokenizer.
- Gemini Nano accepts input languages "en", "ja", "es", "de" and "fr" only
  ([Prompt API](https://developer.chrome.com/docs/ai/prompt-api)). Layer 4 is therefore a
  partial-coverage booster, never a dependency.

---

## 5. Learning privately on the device

### 5.1 Model choice with few labels

- **Ng & Jordan.** "while discriminative learning has lower asymptotic error, a generative
  classifier may also approach its (higher) asymptotic error much faster"
  ([NeurIPS 2001 proceedings](https://papers.nips.cc/paper_files/paper/2001/hash/7b7a53e239400a13bd6be6c91c4f6c4e-Abstract.html)).
  (Inference) With 0-50 user actions, naive Bayes wins. Past a few hundred, logistic
  regression wins. Ship NB first. Switch to LR, or blend them, once a user's label count
  passes a threshold such as 200, using the §6 metrics to choose.
- **Priority Inbox is the template** ([Aberdeen et al.](https://research.google.com/pubs/archive/36955.pdf)):
  - "simple linear logistic regression";
  - "the final prediction is the sum of the global model and the user model log odds";
  - online PA-II updates "to combat the high degree of noise";
  - "a manual correction by a user is given a higher value of C";
  - "new user models have higher values still to promote initial learning";
  - "a per user threshold", nudged when "a user marks messages in a consistent direction";
  - mistakes fell 45% → 38% → 31% (global → plus user models → plus thresholds);
  - accuracy was about "80 ± 5%" against an *implicit* importance label.

  (Inference) For Cluster: global = the static signed priors file; user = the local model;
  output = sigmoid(global log-odds + user log-odds).
- **Graham's per-user argument** (audit B.3) still holds.

### 5.2 Calibration

- Platt fits a sigmoid with smoothed targets, t₊ = (N₊+1)/(N₊+2) and t₋ = 1/(N₋+2), which
  regularises small samples. Lin, Lin & Weng give a convergent version with pseudo-code
  ([Lin et al., Machine Learning 2007](https://www.csie.ntu.edu.tw/~cjlin/papers/plattprob.pdf);
  Platt's original was not reached). Naive Bayes needs this most (audit B.3, Niculescu-Mizil
  & Caruana).
- (Inference) Fit Platt on held-out folds of the user's own labels. Below about 30 labels per
  class, skip calibration and show no probability, only reason codes. The decision threshold
  stays per user, as in Priority Inbox.

### 5.3 Feature hashing, salting and reason codes

- **Hashing.** Weinberger et al. built "a personalized hash function φu for user u" by
  concatenating "a unique user-id to each word in the email and then hash[ing]". Personalised
  spam filtering gave "a 30% spam reduction once the hash table is indexed by 22 bits"
  ([arXiv 0902.2206](https://arxiv.org/abs/0902.2206),
  [ICML 2009](https://doi.org/10.1145/1553374.1553516)). Their per-user plus global split is
  the same as Priority Inbox's.
- **The salt's limits.** (Inference) The salt lives next to the model in `chrome.storage.local`.
  Anyone with the profile can hash a dictionary with it and recover which subject words carry
  weight. The salt only (a) stops one install's weights being linked to another's and (b)
  defeats precomputed tables. Say exactly that in the privacy copy. Never call the weights
  "anonymous".
- **Hash only free text.** (Inference)
  - Structural features (`hdr:list-post=NO`, `auth:dmarc=pass`, `lbl:CATEGORY_UPDATES`,
    `local:noreply`) form a small, closed vocabulary. Store them named, with no hashing and
    no privacy cost, so reason codes can name them.
  - Hash subject tokens and sender or domain identifiers.
  - Reason codes for hashed features are rebuilt at explanation time. Re-tokenise the
    message in memory and look up each token's weight, so no reverse dictionary is ever
    stored.
  - Cap reason codes at four, per audit B.3 (Reg B).
- **Skeleton stability.** UTS #39 skeletons "are not stable across versions of Unicode… If
  they are stored, they must be recomputed when updating the version"
  ([UTS #39 v18.0.0, rev 34](https://www.unicode.org/reports/tr39/)). (Inference) Store the
  Unicode version alongside the model. Re-hash, or decay the old weights, when the bundled
  confusables data changes.

### 5.4 Labels from user actions, and their noise

- Classification under label noise is a field of its own
  ([Frénay & Verleysen, IEEE TNNLS 2014](https://doi.org/10.1109/TNNLS.2013.2292894)).
  Priority Inbox handles it by weighting update confidence per label (§5.1).
- (Inference) Mapping for Cluster:

| User action | Label | Weight | Never use it as |
|---|---|---|---|
| Undo of a Cluster action | Strong negative of what Cluster did | highest | n/a |
| "Not junk" / release from hold | keep + not-threat | high | n/a |
| Star, move back to inbox, reply | keep (personal or important) | high | n/a |
| Explicit "this is a receipt" chip | kind = receipt | high | n/a |
| Unsubscribe | unwanted bulk **for this sender** | medium | spam or phishing |
| Trash | unwanted *now* | low | **spam, or "not transactional"**. Users trash receipts they have filed. |
| Ignore (never opened) | none, or a very weak "low interest" | very low | anything protective |

- **Trash ≠ spam.** Threat weights must never learn from cleanup actions. Only explicit
  report or release decisions touch the threat layer (`quarantineReview.ts` already works
  this way).
- **No target leakage.** Sender-history features must be computed from actions *before* the
  message being labelled.

### 5.5 Cold start, asking the user, drift

- **Cold start.** (Inference) User log-odds start at 0, so output = priors + layer-2 rules.
  Priority Inbox's "new user models have higher [C]" means early corrections should move the
  model fast.
- **Uncertainty sampling.** Lewis & Gale's sequential method trains on the examples the
  current classifier is least sure about
  ([arXiv cmp-lg/9407020](https://arxiv.org/abs/cmp-lg/9407020)). (Inference) Show at most 2-3
  "Is this a receipt?" chips per screen, on rows nearest the threshold, and never on held
  messages.
- **Drift.** Concept drift is "when the relation between the input data and the target variable
  changes over time". The survey covers adaptation strategies and how to evaluate them
  ([Gama et al., ACM CSUR 2014](https://doi.org/10.1145/2523813)). (Inference) Use exponential
  decay of NB counts or LR weights toward the prior, with a half-life of about 90 days.
  Ledger baselines already use promotion delays (`senderLedger.ts:42`). Evaluate
  prequentially: predict, then score against the user's later action, on the device only.

### 5.6 Storage

- `storage.local` is "10 MB… but can be increased by requesting the 'unlimitedStorage'
  permission". `storage.sync` is 102,400 bytes total and 8,192 per item
  ([chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage)).
  Cluster already has `unlimitedStorage` (`manifest.json:31`).
- (Inference) Sizing:
  - 2¹⁶ hashed buckets × 7 classes as sparse float32 is under about 300 KB in practice.
  - NB counts as sparse maps are smaller still.
  - The named structural features add only a few KB.
  - Keep the model in `storage.local`, never `sync`. Sync would upload derived mail data to
    Google's sync servers, which is a transfer to think hard about under Limited Use.

### 5.7 Why not federated learning

"it is possible to obtain the private training data from the publicly shared gradients…
token-wise matching for texts" ([Zhu et al., Deep Leakage from Gradients, arXiv 1906.08935](https://arxiv.org/abs/1906.08935)).
Federated learning also needs a server (audit B.5). And Google's policy bars training beyond
"that specific user's personalized model" (§1.4). Three independent reasons. It stays out.

### 5.8 Layer 4: Gemini Nano

- The Prompt API is stable for extensions from Chrome 138 and on the web from Chrome 148
  ([Prompt API](https://developer.chrome.com/docs/ai/prompt-api), updated 2026-10-21).
- Requirements:
  - Windows 10/11, macOS 13+, Linux or ChromeOS (Chromebook Plus);
  - "At least 22 GB of free space";
  - more than 4 GB of VRAM, or 16 GB of RAM and 4 cores;
  - the model is removed if free space drops below 10 GB.
- `responseConstraint` takes a JSON Schema. `measureContextUsage()` reports how much of the
  context window a prompt will use.
- (Inference) Subjects and bodies are attacker text, so they are prompt-injection input.
  Keep the current rule (`aiVerdictAllowed`): the model's output is one vote, applied only in
  the protective direction. A model "phishing" vote may add warn-tier caution. A model
  "receipt" vote may add keep. A model vote never removes a hold or protection.

---

## 6. Measuring and improving accuracy

### 6.1 Public corpora and their terms

| Corpus | Contents | Terms (as published) | Fit for Cluster |
|---|---|---|---|
| Enron ([CMU](https://www.cs.cmu.edu/~enron/)) | About 0.5M messages from about 150 users, "organized into folders"; FERC-released | No licence named. Distributed "as a resource for researchers"; asks users to "be sensitive to the privacy of the people involved" | Personal and corporate mail from 2000-02. No modern bulk headers. Good for "personal" negatives. **Do not commit it to the repo.** |
| SpamAssassin public corpus ([readme](https://spamassassin.apache.org/old/publiccorpus/readme.html)) | spam, easy_ham, hard_ham ("closer… to typical spam"); "All headers are reproduced in full", addresses obfuscated | No licence named. "Copyright for the text in the messages remains with the original senders" | Full headers, but from 2002. Local benchmark only. |
| TREC 2005-07 spam ([NIST index](https://trec.nist.gov/data/spam.html)) | Public spam-track corpora | NIST page gives no terms. The corpus page was **not reached** (404) | Unknown. Do not plan on it. |
| Nazario phishing ([monkey.org](https://monkey.org/~jose/phishing/)) | Hand-classified phishing mboxes 2005-2025, with headers. Later years not anonymised | **CC-BY-4.0** ("enabling derivative works and commercial use but does require attribution") | **Best fit.** Real phishing headers. Small derived fixtures can be committed with attribution. |
| MeAJOR ([arXiv 2507.17978](https://arxiv.org/abs/2507.17978)) | 135,894 merged phishing and legitimate samples with engineered features | The arXiv *paper* is CC BY 4.0. The dataset merges other corpora with their own terms (inference) | Mostly body and features. Check headers before use. |
| PhishFuzzer ([arXiv 2511.21448](https://arxiv.org/abs/2511.21448)) | 23,100 LLM-generated variants, labelled Phishing / Spam / Valid, with URL and attachment metadata | Paper CC BY 4.0. "fully open-source framework and dataset" | Synthetic. Useful for robustness tests, not for calibrating priors. |
| Zenodo "Phishing validation emails" ([record 13474746](https://zenodo.org/records/13474746)) | 2,000 real and generated emails | **CC-BY-4.0** | Small, body-focused. |

(Inference) No public corpus has modern Gmail headers with Gmail labels. Cluster's main
evaluation set must therefore be **synthetic header fixtures**, hand-built from the §2 table.
Supplement them with Nazario-derived phishing header sets and an optional local run against
SpamAssassin or Enron. That local run stays out of git and out of CI.

### 6.2 The fixture set

(Inference)

- **Format.** One JSON per message: the `NormalizedMessageMetadata` shape plus `labelIds`,
  the expected `kind`, `protected: boolean`, the expected verdict tier, and a `why` string.
  Group them by class and adversarial family.
- **Coverage.** At least 30 per class per §4.2 row. Mix languages: en, de, es, fr, ja, hi, ar,
  zh for subjects.
- **Adversarial families** (each a fixture *transform* applied to clean fixtures):
  - zero-width and default-ignorable inserts in display names and subjects;
  - Cyrillic and Greek homoglyph swaps, plus full UTS #39 confusables;
  - bidi controls (U+202E, U+2066-2069);
  - combosquats (`paypal-secure-login.com`, `secure-chase-alerts.net`);
  - punycode domains;
  - forged `Authentication-Results` without the trusted authserv-id;
  - `"dmarc=pass"@evil` local parts (already in `emailAuth.test.ts`);
  - `In-Reply-To` pointing to an id the user never sent;
  - protection-buying subjects ("Your order… 50% off") from the audit;
  - schema.org `Order` markup in an unauthenticated message.

  Boucher et al. show that "a single imperceptible encoding injection" degrades models and
  that "three injections" break most of them
  ([arXiv 2106.09898](https://arxiv.org/abs/2106.09898)). Test 1, 2 and 3 injections.
- **Invariance tests.** For every clean fixture f and transform T, predicted(T(f)) must equal
  predicted(f) for kind, and must not be *less* cautious for the threat tier.

### 6.3 Metrics and the cost matrix

- Androutsopoulos et al. define the λ threshold, where blocking a legitimate message "is as bad
  as letting λ spam messages pass", and a total cost ratio against a no-filter baseline
  (TCR < 1 means the filter does harm). They conclude that NB needs "additional safety nets"
  ([arXiv cs/0006013](https://arxiv.org/abs/cs/0006013)).
- (Inference) Cluster's actions are asymmetric, so define a cost matrix C[true][action]:

| True class \ Cluster action | Leave | Suggest cleanup | Auto-sort / archive | Trash | Warn | Hold |
|---|---|---|---|---|---|---|
| Personal | 0 | 5 | 10 | **100** | 10 | 30 |
| Transactional (receipt, booking, security) | 0 | 5 | 2 | **100** | 10 | 30 |
| OTP (fresh) | 0 | 2 | 2 | 20 | 10 | 30 |
| Newsletter / marketing / social | 1 | 0 | 0 | 0 | 5 | 10 |
| Phishing | **50** | 50 | 40 | 5 | 1 | 0 |

- **Primary metric:** expected cost per 1,000 messages = 1000 · Σ C·n / N. Report it next to
  the "do nothing" baseline, as TCR = cost(leave all) / cost(Cluster).
- **Hard gates, independent of cost:**
  - zero fixtures in {personal, transactional} reach Trash, whether suggested or automatic;
  - zero adversarial transforms lower the threat tier;
  - zero model-only decisions remove protection.
- **Per-class reporting:** precision and recall for each kind, and a 7×7 confusion matrix,
  printed as a table in the vitest output.

### 6.4 In vitest and CI

(Inference) Sketch:

```ts
// src/lib/eval/classifier.eval.test.ts — fixtures under src/lib/eval/fixtures/*.json
const rows = loadFixtures();                       // synthetic + Nazario-derived
const cm = confusion(rows.map(r => [r.expected.kind, classify(r).kind]));
const cost = expectedCost(rows, COST);             // §6.3 matrix
console.table(cm);                                 // visible in CI logs
expect(rows.filter(r => r.protected && classify(r).action === "trash")).toEqual([]);
expect(cost).toBeLessThanOrEqual(BUDGET.cost);     // ratchet: lower when we improve
for (const k of KINDS) expect(recall(cm, k)).toBeGreaterThanOrEqual(BUDGET.recall[k]);
```

- Run it in the existing `ci.yml`. Store `BUDGET` in a committed JSON. A PR that improves the
  metrics lowers the budget (a ratchet). A PR that worsens them fails.
- Promote `algorithmAudit.test.ts`'s 21 `it.fails` cases to normal tests one by one as each
  fix lands. They become part of the gate.
- The per-user model is tested with **simulated users**: scripted action streams over the
  fixtures, such as "trashes all receipts after 30 days" or "stars one newsletter". Assert
  that the learned layer never takes a protected fixture to Trash and that its cost falls
  over the stream (prequential).

---

## 7. Recommendations for Cluster

Effort: S = days, M = 1-2 weeks, L = weeks. (Inference throughout, grounded in §1-6.)

### 7.1 Prioritised list

| # | Change | Why | Effort |
|---|---|---|---|
| R1 | **Layer 0 normaliser**: NFKC → strip Default_Ignorable and bidi controls → TR39 `internalSkeleton` with the full confusables data (build-time vendored, Unicode version stored). Apply to display names, subjects and domain labels before *every* match. Replace the 20-entry `CONFUSABLES` table. | Closes the audit's open evasions (zero-width, Cyrillic display names). Boucher. | S |
| R2 | **Add headers** `Content-Type`, `List-Post`, `X-Auto-Response-Suppress`, `Date`, `User-Agent`, `X-Mailer` to `getMessageMetadata`, with parsing in `headerFields.ts`. | Free features (§2.3) | S |
| R3 | **Outlook verdict parsing**: BCL, CAT, SFV, SCL from existing headers. Verify forged-copy stripping on one live message first. Add `from` to `$select`. | Free provider facts (§1.5); audit U2 | S |
| R4 | **"Signed header" helper**: `isSignedByAlignedDkim(headerName)` checks that the header is in `h=` of a DKIM signature whose `d=` passed in the trusted AR and aligns with From. Use it for List-Unsubscribe (exists), Feedback-ID and List-Id. | Turns S into S-auth (§2.1) | S |
| R5 | **Thread-reply personal signal**: store Message-IDs of Sent mail (already fetched in `getSentRecord`). Mark inbound mail whose References or In-Reply-To hits one as "reply to you". | Strongest header-only personal signal; resists forgery (§2.2) | S |
| R6 | **Settle `snippet`**: one live `format=metadata` call. If snippet is present, fix the "Metadata-only" copy or request `fields=` without snippet. | Honesty of the privacy claim (§1.1) | S |
| R7 | **Fixture set, cost matrix and CI gate** (§6). Must land *before* R9. | Without it the learned layer cannot be judged | M |
| R8 | **Layer 2 as one policy object**: the P-only facts list (§2.2) plus the existing `protectionPolicy`/`verdict` rules. The output says who may lower what. | One floor, many consumers (audit A.6, A.10) | M |
| R9 | **Layer 3 model**: NB to start, LR once there are about 200 labels. Global priors file + user log-odds (Priority Inbox). Hashed salted free-text features + named structural features. Confidence-weighted labels per §5.4. Platt once there are about 30 per class. ≤ 4 reason codes. 90-day decay. | §5 | L |
| R10 | **Body on demand for warn and hold** (§3.4 b), plus schema.org extraction in Deep scan. Copy change first. | Adds evidence where it matters, at 60 units | M |
| R11 | **Uncertainty chips**: 2-3 per screen, never on held mail | Cheapest labels (Lewis & Gale) | S, after R9 |

### 7.2 Layer-3 feature list

Named structural features (no hashing, readable in reason codes):

- **Auth:** `dmarc ∈ {pass, fail, none, unknown}`, `dkim_aligned`, `spf_pass`,
  `dkim_signs:{list-unsubscribe, feedback-id, list-id}`, `dkim_l_tag`.
- **Provider:** `lbl:IMPORTANT`, `lbl:CATEGORY_{PERSONAL, SOCIAL, PROMOTIONS, UPDATES, FORUMS}`,
  `lbl:STARRED`; Outlook `focused`, `bcl_bucket{0, 1-3, 4-7, 8-9}`, `cat:{BULK, PHSH, SPOOF, …}`.
- **List:** `has_list_unsub`, `one_click_valid`, `has_list_id`, `list_post ∈ {none, NO, mailto}`,
  `precedence ∈ {none, bulk, list, junk}`, `auto_submitted ∈ {none, generated, replied}`,
  `x_ars_all`, `has_feedback_id`.
- **Identity:** `sender_ne_from`, `replyto_ne_from_domain`, `msgid_domain_eq_from`,
  `returnpath_domain_eq_from`, `local_part_class ∈ {person-like, noreply, orders, billing,
  notifications, news, support, other}` (Grbovic's "subname").
- **Relationship:** `reply_to_my_message`, `in_sent_correspondents`, `user_in_to`,
  `user_in_cc`, `user_absent` (Bcc or list), `recipient_count_bucket`, `references_count_bucket`.
- **Structure:** `ctype ∈ {text/plain, multipart/alternative, multipart/mixed,
  multipart/related, multipart/report, text/html}`, `size_bucket`, `risky_attachment`,
  `date_skew_bucket`.
- **Sender history** (from the ledger, computed before this message): `sender_msgs_log2`,
  `sender_months_active`, `sender_burst_1h`, `sender_read_ratio_bucket`,
  `user_prior_{keep, trash, unsub, undo}_rate_bucket`, `familiar` (`isFamiliar`).
- **Threat signals** (as features of the *kind* model only, never fed back into the threat
  tier): `lookalike`, `combosquat`, `brand_claim_freemail`.
- **Body** (only when R10 fetched one, else missing): `markup:{Order, ParcelDelivery,
  Reservation, Invoice, PromotionCard, DiscountOffer}`, `link_count_bucket`,
  `tracker_count_bucket`, `link_mismatch`.

Hashed with the per-install salt, 2¹⁶ buckets:

- subject word unigrams on the skeleton, with digits masked to `#`;
- subject character 3-grams;
- the verified DKIM `d=`;
- the From registrable domain;
- the template key (`d=`, local-part class, masked subject).

Targets:

- **Head A, "kind"** (7 classes). Priors and rules carry most of it. Users correct it only via
  explicit chips.
- **Head B, "wanted"** (keep / don't-need). Learned from §5.4 actions.

Cluster suggests cleanup only when B says "don't-need" *and* layer 2 allows it.

### 7.3 What NOT to do

- Do not let any S or S-auth header, body feature, markup, model or LLM output **lower** a
  safety gate or release a hold (§2.2).
- Do not fetch `raw`, `Received` or `ARC-*` for classification. Do not batch hoping to save
  quota (§1.3).
- Do not read bodies in the background scan. Do not store body text or snippets.
- Do not train the threat layer from Trash, or treat Unsubscribe as spam (§5.4).
- Do not ship priors trained on any user's mail, even with consent (Workspace policy, §1.4).
  Do not add federated learning, gradient sharing or a server that touches mail (§5.7). It
  would also trigger CASA.
- Do not keep the model in `storage.sync`.
- Do not call hashed weights "anonymous". Describe the salt's real limits.
- Do not trust schema.org markup, List-Id, Feedback-ID or BIMI headers as authenticity on
  their own (RFC 2919 §8; §3.1).
- Do not make CI depend on corpora without a licence (Enron, SpamAssassin, TREC). Commit only
  synthetic and CC-BY-derived fixtures with attribution.

---

## Unverified and open

- Whether `format=metadata` returns `snippet` (§1.1, R6).
- Whether Gmail stamps `BIMI-Location`/`BIMI-Indicator`, and whether CATEGORY_\* labels exist
  when tabs are disabled.
- Whether Exchange strips sender-supplied `X-Microsoft-Antispam` / `X-Forefront-Antispam-Report`
  before stamping its own.
- The quota table's `html` format (not in the Format enum). Whether Cluster's project is
  grandfathered under the pre-May-2026 quotas.
- The official header references for Mailchimp, SendGrid and Mailgun, and the TREC 2007
  corpus terms (not reached).
