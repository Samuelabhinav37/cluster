# Cluster: automation, AI, security, and engineering roadmap

_Research date: 2026-08-30. Local repositories reviewed: `cluster-inspect` and
`gmail-automation-inspect`. External claims use primary sources only: official
product documentation, platform/API documentation, standards, and security
guidance. Recommendations and feasibility judgments are explicitly identified as
analysis rather than sourced product claims._

## Executive conclusion

Cluster should **not merge the Python Gmail Automation project wholesale**. The
extension already has the better product architecture: Gmail and Outlook support,
metadata-first processing, reversible actions, explicit confirmations, a local
action log, deterministic rules, and no mandatory Cluster server.

The Python project still contributes three useful ideas:

1. make a dry-run preview and a human-readable reason first-class for every
   destructive operation;
2. push filtering into the provider, page through the full result set, checkpoint
   work, and operate in bounded batches with retry/backoff; and
3. offer one coherent **Unsubscribe + clean existing mail** workflow, while
   preserving receipts, tickets, invoices, tax documents, starred mail, and other
   transactional records.

The immediate priority is correctness, not feature count. Four current issues can
undermine user trust:

- Gmail security analysis scans the same Promotions/Updates lane as cleanup, so it
  can miss suspicious mail in Primary or other labels.
- The Gmail query is `category:promotions OR category:updates newer_than:...`
  without parentheses, so the time boundary is not safely expressed over both
  branches.
- Cluster labels a URL “verified one-click” from header presence alone, while RFC
  8058 also requires a valid DKIM signature that covers both unsubscribe headers.
- Microsoft Graph returns HTTP 200 for a syntactically valid `$batch` even when
  individual operations failed; Cluster currently ignores the inner statuses.

After those are fixed, Cluster’s strongest defensible direction is:

> **A private, local-first inbox control plane that explains, previews, executes,
> and reverses automation across Gmail and Outlook. AI proposes; deterministic
> code validates and acts.**

This is more differentiated than another bulk-unsubscribe screen because Gmail
already ships a native Manage subscriptions view sorted by frequent senders with
one-click unsubscribe ([Google announcement](https://blog.google/products-and-platforms/products/gmail/new-manage-subscriptions-unsubscribe/),
[Gmail Help](https://support.google.com/mail/answer/15621070)).

## 1. What Cluster has now

The current repository is a Manifest V3 Chrome extension with no required Cluster
backend. Normal scans fetch sender, subject, received time, size, read/starred
state, `Reply-To`, `List-Unsubscribe(-Post)`, and `Authentication-Results`.
Message bodies are fetched only for a manual, one-message Deep scan. Local code
already contains:

- grouped cleanup, retention buckets, Smart Views, keep-newest, never-read and
  spam suggestions;
- unsubscribe, Gmail sender filters/muting, snooze, rules, a first-seen ledger,
  Screener, and a rolling action log;
- header-based phishing signals, static bad-domain lists, manual Deep scan, and an
  opt-in reversible Gmail quarantine;
- Gmail batch modification in chunks of 1,000, Outlook JSON batching in groups of
  20, bounded concurrency, retry handling, and 212 unit/contract tests; and
- a metadata-only on-device digest using Chrome's Summarizer API.

Relevant implementation entry points are
[`emailProvider.ts`](../src/lib/providers/emailProvider.ts),
[`gmailProvider.ts`](../src/lib/providers/gmailProvider.ts),
[`outlookProvider.ts`](../src/lib/providers/outlookProvider.ts),
[`background.ts`](../src/background.ts), and
[`SECURITY.md`](../SECURITY.md).

Important terminology correction: “first contact” currently means **first seen by
Cluster's local ledger**, not necessarily the first message the user has ever
received from that sender. On the first scan, every observed sender initializes
the baseline. The UI and documentation should say “new since Cluster started
tracking” until a mailbox-history baseline has been built.

## 2. What Gmail Automation teaches Cluster

### Patterns worth porting

| Pattern in Gmail Automation | Value to Cluster | Recommended adaptation |
|---|---|---|
| Dry-run scanner prints `KEEP` / `FLAG_DELETE` and a matching reason | Makes risky automation understandable before it runs | Every cleanup/rule preview should show counts, a small sample, preservation reasons, and the exact rule that matched. Save a preview hash so execution can detect if the target set changed. |
| Preservation terms for receipts, invoices, tickets, payments, and tax records | Prevents sender-wide cleanup from destroying mixed transactional and promotional history | Implement a central `ProtectionPolicy`, combining starred/flagged status, transactional `MessageKind`, user pins, legal/financial keywords, and provider-native importance. Never let “unsubscribe + clean” silently override it. |
| Provider-side Gmail query narrowing | Reduces metadata calls and quota use | Compile deterministic rule subsets into Gmail search and Graph `$filter` where semantics match, then re-check locally before acting. |
| Pagination and 1,000-ID `batchModify` chunks | Scales beyond a small dashboard window | Keep Cluster's existing 1,000-ID chunking; add resumable pagination and durable checkpoints for scans larger than the current 500-message, 180-day default. Gmail officially limits `batchModify` to 1,000 IDs ([Gmail `batchModify`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/batchModify)). |
| Bounded producer/consumer pipeline | Separates discovery from mutation and provides progress | Model a cleanup as a durable job: `planned → confirmed → running → partial/complete/failed → undone`, with per-batch receipts and retryable failures. Do not copy Python threads into MV3; service workers are short-lived and state must be persisted ([Chrome service-worker guidance](https://developer.chrome.com/docs/extensions/get-started/tutorial/service-worker-events)). |
| Backoff with randomness on 429/5xx | Avoids synchronized retry storms | Cluster's current retry starts at 500 ms, has no jitter, and parses only numeric `Retry-After`; add randomized exponential backoff and HTTP-date support to the shared retry layer. Gmail recommends truncated exponential backoff with randomness ([Gmail quota guidance](https://developers.google.com/workspace/gmail/api/reference/quota)). |
| “Unsubscribe & Purge Selected” as one outcome | This is simpler than switching between tabs/actions | Add a single reviewed workflow with independent toggles: request unsubscribe, mute future non-compliant mail, trash existing promotional mail, and retain protected/transactional mail. Clean Email independently validates demand for an unsubscribe action that can also trash existing messages ([official Unsubscriber docs](https://clean.email/help/tools/unsubscriber)). |

### Patterns that must not be ported

The Python prototype is useful as an experiment, but it is not safe enough to
become Cluster's runtime:

- It follows an arbitrary HTTP(S) `List-Unsubscribe` URL with a GET. RFC 8058
  created POST-based one-click specifically because automatic GET fetching can
  cause accidental unsubscriptions. Receivers must use HTTPS POST, obtain user
  consent, send no cookies or HTTP authorization, and only offer one-click when
  the required DKIM conditions hold ([RFC 8058 §§3–4](https://www.rfc-editor.org/rfc/rfc8058.html)).
- It does not read `List-Unsubscribe-Post`, validate a DKIM pass, or establish that
  the DKIM signature covers both unsubscribe headers.
- The dashboard scans only the first 100 candidate messages and sender purge only
  the first 500. Gmail's list API is paginated and returns at most 500 per page
  ([Gmail list guide](https://developers.google.com/workspace/gmail/api/guides/list-messages)).
- It groups by display name rather than a stable provider + normalized-address
  identity. Two unrelated senders can share a display name.
- It trashes all mail from a sender after unsubscribing, even when that sender also
  sends receipts or security notices. Its separate preservation logic is not used
  by the dashboard purge.
- It keeps OAuth credentials in local files and exposes an unauthenticated local
  FastAPI mutation endpoint with global shared state. It also swallows several
  failures, so the UI can report completion without an accurate per-item result.

The lesson is to port the **workflow shape and scalable job semantics**, not the
Python service or its unsubscribe implementation.

## 3. Competitor signals and Cluster's opportunity

| Product / platform | First-party documented strength | What Cluster should learn | What Cluster should not copy |
|---|---|---|---|
| Gmail | Manage subscriptions groups active subscriptions, ranks frequent senders, and unsubscribes from one surface ([Google](https://blog.google/products-and-platforms/products/gmail/new-manage-subscriptions-unsubscribe/)). | Basic unsubscribe is now table stakes. Win on cross-provider automation, safety, explanation, undo, retention, and security. | Do not position Cluster as only a Gmail unsubscribe utility. |
| Outlook | Focused Inbox learns from interactions and supports sender overrides; Graph exposes `inferenceClassification` and training/overrides ([Microsoft](https://learn.microsoft.com/en-us/graph/api/resources/manage-focused-inbox?view=graph-rest-1.0)). | Consume provider-native importance as a protection/ranking feature instead of pretending unread status alone is intelligence. | Do not build a competing black-box priority model before using the signal Outlook already supplies. |
| Clean Email | Rich multi-condition Auto Clean rules and many actions ([rules](https://clean.email/help/auto-clean/create-rules)); Smart Folders and grouped cleanup ([folders](https://clean.email/help/basics/smart-folders)); first-sender quarantine ([Screener](https://clean.email/help/tools/screener)); sender settings such as Keep Newest and Trash After ([sender settings](https://clean.email/help/tools/sender-settings)); breach exposure monitoring ([Privacy Monitor](https://clean.email/help/tools/privacy-monitor)). | Expand Cluster rules, add sender-level policies and an inbox-health overview, and make recurring automation visible through a digest/history. | Avoid opaque server-side processing or claims that a heuristic is “AI” without evaluation. |
| SaneBox | Users train routing by moving mail; corrections take effect in the model, and the interactive digest is both review and training UI ([training](https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox), [digest](https://www.sanebox.com/help/170-daily-digest-how-to-guide)). SaneBlackHole delays trash for seven days, creating a recovery window ([SaneBlackHole](https://www.sanebox.com/help/235-saneblackhole-what-do-i-do-with-my-saneblackhole-folde)). | Build a per-user feedback loop and make “Recently done” an active review/training surface. Grace periods are safer than immediate permanent deletion. | Do not infer engagement from a single unread snapshot. |
| Leave Me Alone | Rollups move selected mail out of the inbox and deliver a scheduled daily/weekly digest while retaining originals ([Rollups](https://help.leavemealone.com/en/rollups/what-is-a-rollup)). Its AI summary uses subject lines rather than message content ([AI Rollup Summaries](https://help.leavemealone.com/en/rollups/ai-rollup-summaries)). Inbox Shield supports allow-all/block-all screening modes ([Shield](https://help.leavemealone.com/en/start-here/the-basics/how-to-block-emails-with-inbox-shield)). | Add a local “Read later / Digest” workflow and multiple screening policies. A subject-only summary aligns with Cluster's privacy stance. | A scheduled digest cannot be reliably delivered while Chrome is closed without a server; be honest about this constraint. |
| Shortwave | Custom splits, bundles and delivery schedules reduce interruptions; natural-language AI filters can label, archive, star, update todos, or delete and can be reapplied to examples for refinement ([Shortwave settings](https://www.shortwave.com/docs/guides/customize-your-shortwave-settings/)). Its assistant and Tasklet extend into drafting and external workflows ([AI Assistant](https://www.shortwave.com/docs/guides/ai-assistant/)). Microsoft 365/Exchange is unsupported and other non-Gmail providers generally route through Gmail ([provider support](https://www.shortwave.com/docs/how-tos/microsoft-outlook-exchange-other-sign-in-support/)). | Natural-language rule authoring and explainable test/reapply are high-value. Focused views and delivery windows are useful. Direct Gmail **and** Microsoft support is a meaningful Cluster differentiator. | Cloud AI reads message content and Tasklet's 24/7 integrations imply a backend and much larger threat surface; that is a different architecture. |
| Superhuman | AI Auto Labels/Archive, automatic reply reminders and drafts, Split Inbox, Ask AI, and MCP/AI-client integrations target active work, not just cleanup ([AI Beta](https://help.superhuman.com/hc/en-us/articles/39785225816979-Superhuman-AI-Beta), [Auto Reminders and Drafts](https://help.superhuman.com/hc/en-us/articles/46005658551053-Auto-Reminders-Auto-Drafts), [guides](https://help.superhuman.com/hc/en-us/articles/46005781623053-Guides)). | Add a “needs action / waiting for reply” layer only after cleanup reliability is solid. Read-only AI/agent integration could eventually expose safe queries. | Do not give an LLM autonomous delete/send authority. Drafting and sending also broaden Gmail scopes and product purpose. |
| AgainstData | Pairs sender decisions with bulk email deletion and formal personal-data deletion requests ([FAQ](https://againstdata.com/faqs), [product](https://againstdata.com/)). | A locally generated, user-reviewed data-rights request is a plausible privacy differentiator. | Legal templates vary by jurisdiction and company; do not claim guaranteed erasure or automate sending without review. |
| Unroll.Me | Its privacy notice states that panelist commercial-email data and derived information can be provided to customers and used for market intelligence and advertising models ([privacy notice](https://unroll.me/legal/privacy/)). | Cluster's no-server, no-sale, local-first design is a valuable trust differentiator and should be visible in onboarding and store copy. | Never monetize inbox-derived data or weaken the single-purpose privacy story. |

### Strategic gap

Competitors fall into two groups:

1. **server-based continuous assistants**, which can act while the user's browser is
   closed but must process or retain mailbox data; and
2. **native provider features**, which are always-on but provider-specific.

Cluster's opportunity is between them: use provider-native primitives where
possible, keep user modeling and orchestration local, show exactly why an action
is proposed, and make mailbox changes reversible. This is an inference from the
documented product capabilities above, not a competitor claim.

## 4. Recommended product roadmap

### A. Automation

#### A1. Split scanning into purpose-specific lanes

Today Gmail's `listCandidateMessages` query is shared by cleanup, security,
Screener, and rules. It is limited to Promotions/Updates, so the Security tab and
high-risk quarantine do not analyze the whole inbox. The missing parentheses also
make the intended age scope ambiguous.

Create independent scan plans:

- **cleanup:** Promotions/Updates plus explicit cleanup kinds, bounded by age;
- **security:** all recent Inbox mail, optionally Spam, with a shorter horizon;
- **rules:** provider-query pushdown compiled from each enabled rule;
- **screener:** only messages added since the last checkpoint; and
- **full audit:** manual, paginated, cancellable, and checkpointed.

This improves coverage and cuts quota usage. It also makes every dashboard count
explainable: “Security scanned 500 Inbox messages from the last 30 days,” rather
than implying whole-mailbox coverage.

#### A2. Replace repeated full scans with incremental synchronization

Persist a Gmail `historyId` and Outlook folder delta links, then process changes
since the last successful checkpoint. Gmail documents `history.list` for partial
sync and requires a full resync when the checkpoint is too old and returns 404
([Gmail synchronization](https://developers.google.com/workspace/gmail/api/guides/sync)).
Graph message delta tracks created, updated, and deleted changes and persists an
opaque `@odata.deltaLink` ([Graph message delta](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0)).

For the serverless extension, use a modest alarm-driven poll while Chrome is
running, plus an on-open catch-up. Chrome alarms can run as frequently as 30
seconds but may be delayed and do not wake a sleeping device
([Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms));
five to fifteen minutes is a more responsible initial interval.

True always-on push would change the architecture. Gmail push targets Cloud
Pub/Sub/backend systems and explicitly recommends polling for user-owned browsers
([Gmail push](https://developers.google.com/workspace/gmail/api/guides/push)). Graph
webhooks require a publicly accessible HTTPS endpoint
([Graph webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)).

#### A3. Introduce durable jobs and action receipts

MV3 service workers are terminated repeatedly, so an in-memory loop is not a
reliable transaction boundary. Persist:

- the immutable plan and preview summary;
- provider, operation, page/checkpoint, target IDs, and protected exclusions;
- per-batch attempted/succeeded/failed outcomes and retry time;
- remote response identifiers where available; and
- compensating/undo information.

Make execution idempotent. Reapplying “add label X/remove Inbox” is safe; sending
an unsubscribe POST is not necessarily safe to repeat, so record its request and
require an explicit retry. A partial job must display “317 of 500 completed,” not
“success.”

#### A4. Build rules v2 as a deterministic policy engine

Competitor evidence supports richer rules, but power without conflict semantics
will create surprises. Add:

- nested `all` / `any` / `not` conditions and exceptions;
- schedule/delivery-window conditions;
- multiple ordered actions;
- `stopProcessing`, explicit priority, and conflict diagnostics;
- a dry-run sample, exact match count, and “why matched” trace;
- per-rule last run, success/failure counts, and undo window; and
- provider capability validation before save.

Server-native rules are worth using for always-on behavior. Microsoft Graph
supports create/update/delete Inbox `messageRule` resources with conditions,
actions, exceptions, enablement, and sequence
([Graph `messageRule`](https://learn.microsoft.com/en-us/graph/api/resources/messagerule?view=graph-rest-1.0)).
Gmail filters already power Cluster's Gmail mute/sort behavior. When native
semantics do not match Cluster's rule exactly, retain local scheduled execution
rather than silently compiling an approximation.

#### A5. Add “unsubscribe + clean” safely

Provide four explicit choices in one confirmation:

1. send a standards-compliant unsubscribe request;
2. create a local/provider rule to suppress mail if the sender ignores it;
3. trash existing **subscription/promotional** messages; and
4. retain starred/flagged, receipts, invoices, tickets, tax, account-security,
   and user-pinned mail.

Show protected and affected counts separately. Do not copy Gmail Automation's
blanket `from:` purge. Gmail itself distinguishes subscription mail from password
resets, receipts, and OTPs in its sender guidance
([Gmail subscription guidelines](https://support.google.com/mail/answer/15263077)).

#### A6. Add a local Read Later / Digest lane

This is a better recurring-value feature than deleting everything. Move selected
newsletters into `Cluster/Read Later`, present an in-extension scheduled digest,
and optionally resurface the label on chosen days while Chrome is active. Keep the
original mail, strip/avoid remote image loading in Cluster's reader, and make the
browser-off limitation explicit.

### B. AI and personalization

#### B1. Build a local behavior model before a larger LLM feature

Cluster's current “never read” signal is a snapshot. Build a compact per-sender
feature record from data already available or caused by the user:

- message frequency and recency;
- fraction remaining unread over multiple observations;
- starred/flagged and provider-native importance;
- allow, block, unsubscribe, archive, trash, undo, and rule-correction events;
- whether the user has sent mail to the address/domain; and
- message-kind mix and authentication/security evidence.

Use Gmail's `IMPORTANT` system label ([Gmail labels](https://developers.google.com/workspace/gmail/api/guides/labels))
and Outlook's `inferenceClassification` (`focused` / `other`) as strong provider
signals. Start with a transparent weighted model or small local logistic model,
not a generative model. Output a ranking and reasons such as “24 messages, 23
still unread after 14 days; never replied; not starred.” Let undo/allow actions
be negative training examples.

Keep this model strictly per-user. Google's Workspace API policy prohibits using
Workspace user data to create, train, or improve an AI/ML model beyond that
specific user's personalized model for the approved user-facing feature
([Workspace API user-data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)).
This makes local, account-scoped personalization a policy-aligned design; pooling
mailbox-derived features into a general Cluster model is not.

Never convert the score directly into permanent deletion. Suggested actions need
confidence, reasons, and an abstain/review path. Track precision from user accepts,
rejects, and undos before describing the model as accurate.

#### B2. Natural-language rule builder, compiled to a safe DSL

This is the best near-term use of generative AI:

> “Every Friday, archive newsletters older than 14 days, except from my bank.”

Use Chrome's on-device Prompt API to produce a JSON object constrained to the
Cluster rule schema, validate it with normal TypeScript code, show the compiled
plain-language rule and preview matches, and require confirmation before saving.
The Prompt API is available to Chrome extensions and supports JSON Schema
`responseConstraint` structured output
([Prompt API](https://developer.chrome.com/docs/ai/prompt-api),
[structured output](https://developer.chrome.com/docs/ai/structured-output-for-prompt-api)).

The model must never call provider APIs or choose unbounded targets itself. It
only drafts a rule; the deterministic policy engine validates capability,
protection constraints, conflicts, and execution.

#### B3. Make the digest useful without AI, then enhance it locally

Always render a deterministic inbox-health digest: trends, top noisy senders,
subscriptions awaiting action, rules run, held senders, threats, failures, and
space recoverable. If Chrome's Summarizer is available, add a prose summary.

Chrome's built-in foundation-model APIs require supported desktop hardware,
substantial free storage/RAM, and an initial model download; they are not available
on mobile devices ([Chrome built-in AI requirements](https://developer.chrome.com/docs/ai/get-started)).
Therefore AI cannot be the only route to core functionality.

#### B4. Treat email as adversarial input

If future AI features read subjects or bodies, an email can contain indirect
instructions intended to manipulate the model. OWASP identifies indirect prompt
injection through external content as a core LLM risk
([OWASP Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)).
Use one-shot isolated sessions, minimize input, constrain output, render output as
text/sanitized content, and keep the model disconnected from mutation APIs.
Chrome likewise recommends minimal input, structured output, and treating model
output as untrusted ([Chrome AI do/don't](https://developer.chrome.com/docs/ai/built-in-ai-dos-donts)).
This is also a compliance requirement, not merely defense in depth: Google's
current Workspace policy requires restricted-scope apps to protect against prompt
injection ([Workspace API user-data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)).

### C. Security and privacy

#### C1. Correct one-click unsubscribe verification

Current `parseListUnsubscribe` sets `postUrl` when an HTTPS URL and a
`List-Unsubscribe-Post` value containing “one-click” are present. That is
necessary but not sufficient. RFC 8058 requires:

- exactly the one-click key/value signal;
- an HTTPS POST with the prescribed body;
- user consent;
- no cookies, authorization, or unrelated browser context; and
- a valid DKIM signature whose `h=` list covers both `List-Unsubscribe` and
  `List-Unsubscribe-Post`.

Cluster should fetch `DKIM-Signature` metadata, require a trusted provider-added
`Authentication-Results` DKIM pass, parse the signed-header list, and label any
other URL “manual/unverified.” Because receivers such as Gmail apply additional
eligibility checks before displaying their own one-click control
([Gmail sender FAQ](https://support.google.com/mail/answer/14229414)), Cluster
should avoid stronger “verified” claims than it can substantiate.

Also harden the network action:

- require HTTPS and reject credentials in the URL;
- reject localhost, literal private/link-local IPs, and non-default ports;
- do not follow the one-click POST's redirects; RFC 8058 says the receiver must
  not follow them;
- set `credentials: "omit"`, a short timeout, response-size/time limits, and a
  conservative concurrency cap; and
- show the destination origin before the user confirms.

Per-origin optional permissions are a good existing design. Chrome recommends
runtime optional permissions so users grant only what a feature needs
([Chrome permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)).

#### C2. Fix OAuth documentation and progressively request scopes

`SECURITY.md` currently says `gmail.modify` and `gmail.settings.basic` are not
restricted. Google's official scope table lists **both as restricted**, along
with `mail.google.com`
([Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)).
Correct this before any public release. Restricted-scope verification is required
unless an exception applies; a third-party annual assessment is triggered when
restricted data is accessed from or through a server
([Google verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)).

Keep the no-server architecture: it materially reduces assessment scope and data
exposure, although it does not make OAuth verification disappear. Use
`chrome.identity.getAuthToken({scopes})` to request `gmail.settings.basic` only
when a user enables native filters, rather than bundling it into the first
connection; Chrome documents that request scopes can override the manifest list
([Chrome Identity](https://developer.chrome.com/docs/extensions/reference/api/identity)).
Permanent delete should remain opt-in and is better removed from the product
unless there is strong measured demand.

#### C3. Repair Outlook action correctness before claiming parity

The current Outlook batch helper checks only the outer response. Microsoft says
an outer 200 does **not** mean individual requests succeeded; every inner response
has its own status, and throttled sub-requests must be retried separately
([Graph JSON batching](https://learn.microsoft.com/en-us/graph/json-batching),
[Graph throttling](https://learn.microsoft.com/en-us/graph/throttling)). Parse all
inner responses, map them back to message IDs, honor per-item `Retry-After`, and
report partial completion.

Use `Prefer: IdType="ImmutableId"` on every Outlook message request. Default
Outlook IDs change when an item moves; immutable IDs remain stable within the
mailbox ([Graph immutable IDs](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)).
Without this, undo records can point at stale IDs after trash/archive/move.

Finally, Outlook label application currently sends `categories: [labelName]`,
which replaces the message's existing categories, and undo sends an empty array.
Read/merge the existing collection and record exactly what Cluster added so undo
removes only Cluster's category.

#### C4. Be precise about threat coverage and confidence

Separate security scanning from cleanup as described above. Then:

- show the scanned label set, window, and last successful checkpoint;
- call the current summed weights a **risk score**, not a probability;
- maintain benign/malicious replay fixtures for each signal and track quarantine
  accepts, releases, and false positives;
- version and date static threat feeds in the UI; and
- never auto-delete security detections. Quarantine must remain opt-in, labeled,
  reviewable, and reversible.

#### C5. Treat breach monitoring as an architecture decision

Have I Been Pwned now supports privacy-preserving email range search: hash the
address locally, send six SHA-1 prefix characters, match suffixes locally, and
discard nonmatches. However, this endpoint is limited to paid Pro/High RPM tiers
and requires an API key
([HIBP email range API](https://haveibeenpwned.com/API/V3)). A shared key cannot
be safely embedded in a public extension. The options are user-supplied keys or a
Cluster broker/server, both of which complicate the product. Do not promise a
breach monitor until that trade-off is intentionally accepted.

### D. Software and engineering methods

#### D1. Replace the process-local storage lock

`storageLock.ts` stores promise chains in a module-level `Map`. The dashboard and
background service worker run in separate JavaScript contexts, so they do not
share that map. It cannot prevent a dashboard and background read-modify-write
from clobbering each other. Use a cross-context lock plus revision checks, or move
transactional state into IndexedDB. The Web Locks specification coordinates
exclusive locks across same-origin windows and workers
([W3C Web Locks](https://www.w3.org/TR/web-locks/)).

#### D2. Add versioned settings migrations

`getSettings()` shallow-merges stored data over current defaults. This cannot
migrate renamed fields or nested settings safely and may preserve invalid old
shapes. Store `schemaVersion`, write sequential pure migrations, validate the
result, and back up/recover from corrupt state. Chrome `storage.local` is limited
to 10 MB by default, so longitudinal model and job data must be compact and
bounded ([Chrome Storage](https://developer.chrome.com/docs/extensions/reference/api/storage)).

#### D3. Make provider capabilities explicit and test them as contracts

Replace optional-method discovery scattered through UI code with a capability
object that declares operation support, reversibility, native-vs-local execution,
required scope, maximum batch size, and ID stability. Generate the README/UI
parity matrix from it. Run the same provider contract fixtures against Gmail and
Outlook adapters, including partial failures and pagination.

#### D4. Add high-value test layers

Keep the strong unit suite, then add:

- property/fuzz tests for From, unsubscribe, DKIM, and authentication header
  parsers;
- saved provider-response replay fixtures for pagination, throttling, partial
  batches, ID changes, and malformed headers;
- rule conflict/idempotency tests and migration tests from every released schema;
- a service-worker interruption/resume test for durable jobs;
- browser E2E tests for OAuth-denied, partial-success, confirmation, and undo; and
- a release gate that renders the permission/privacy claims from the manifest and
  fails on drift.

Cluster's existing no-egress source test is valuable, but it checks literals and
call sites rather than runtime destinations. Complement it with runtime URL-policy
tests and a small explicit egress abstraction.

## 5. Platform feasibility summary

| Capability | Serverless MV3 feasibility | Constraint / recommendation |
|---|---|---|
| Near-real-time Gmail automation | **Yes, while Chrome is active** | Poll `history.list`; full resync on stale history. Gmail push is backend/Pub/Sub oriented and polling is recommended for browsers. |
| Near-real-time Outlook automation | **Yes, while Chrome is active** | Poll Graph delta. Webhook push requires a public HTTPS endpoint. |
| Always-on behavior while browser/device is off | **No** | Compile supported workflows to Gmail filters / Graph message rules, or consciously add a backend. |
| On-device digest and NL rule compilation | **Yes, supported desktop devices** | Prompt/Summarizer APIs are not universal and require a deterministic fallback. |
| Autonomous AI deletion/sending | **Technically possible, strategically unsafe** | Do not ship. Email is adversarial input; constrain AI to proposals and read-only summaries. |
| Full Outlook undo | **Yes, after adapter repair** | Use immutable IDs, parse per-item batch results, record move responses, and preserve categories. |
| RFC 8058 one-click | **Partially verifiable** | Require headers + DKIM pass + signed-header coverage; present ordinary links as manual. |
| HIBP breach monitor with no server | **Only with user-provided paid key** | Do not embed a shared secret; otherwise requires a broker and privacy-policy change. |
| Data-deletion request assistant | **Yes, user-reviewed** | Generate locally, require recipient/template review, send only after explicit confirmation, and avoid legal guarantees. |

## 6. Prioritized delivery plan

### P0 — trust and correctness (before new power features)

1. Split Gmail cleanup/security/screener scan lanes and parenthesize every composed
   Gmail query.
2. Downgrade “verified one-click” unless RFC 8058 DKIM and signed-header conditions
   are established; harden redirect/credential/private-network behavior.
3. Parse Graph batch sub-responses, retry failed items, use immutable IDs, and
   preserve Outlook categories.
4. Correct OAuth scope classifications and user-facing scan/first-contact claims.
5. Add settings schema migrations and replace the cross-context-unsafe lock.
6. Add provider contract and interruption/partial-failure tests.

### P1 — dependable automation

1. Incremental Gmail history and Outlook delta synchronization.
2. Durable jobs, per-batch receipts, resume/cancel, and truthful partial progress.
3. Safe Unsubscribe + suppress + clean-existing workflow with a central protection
   policy.
4. Provider-native importance signals and a generated provider capability matrix.
5. Deterministic inbox-health digest and recurring automation review.

### P2 — intelligence that stays under user control

1. Local sender engagement model with reasons, abstention, and correction feedback.
2. Rules v2 with priorities, exceptions, conflicts, schedules, and idempotency.
3. On-device natural-language rule builder constrained to the rule schema.
4. Read Later / scheduled digest lane with original-message retention.

### P3 — optional expansion

1. User-reviewed data-deletion request assistant.
2. “Needs action / waiting for reply” views, initially deterministic/read-only.
3. Decide explicitly whether HIBP or any always-on service justifies a backend.
4. Only then consider opt-in body-aware AI; keep it isolated from mutation tools.

## 7. Success measures

Measure power by reliable outcomes, not feature count:

- **Safety:** protected-message violations = 0; permanent AI actions = 0; undo
  success rate; partial failures surfaced rather than hidden.
- **Automation quality:** rules accepted vs. disabled/undone; repeat manual actions
  converted into reviewed rules; time from new mail to action while browser active.
- **Personalization quality:** suggestion acceptance, rejection, and undo rates by
  confidence band; percentage where the model abstains.
- **Provider parity:** supported/reversible operation count and contract-test pass
  rate for Gmail and Outlook.
- **Privacy:** number of network destinations, body fetches, remotely processed
  messages, and new scopes. The default target remains zero Cluster-server egress
  and zero automatic body fetches.

The practical north star is: **Cluster should become more powerful by being more
predictable.** The durable differentiator is not an autonomous AI that can delete
mail; it is a local system that understands enough to propose the right action,
shows its work, executes through constrained provider adapters, and can recover
when either the model, the network, or the user changes their mind.
