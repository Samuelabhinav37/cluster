# Cluster — state of the product, 2025-2026 competitive delta, and a "make what's here better" review

_2026-09-01. Fourth research doc. Read the earlier three first — this one does **not**
re-derive them:_

- `research/2026-08-29-competitive-and-security-review.md` — the incumbent landscape, why
  they win, the security-feature backlog (Tier 1/2/3), the code audit.
- `research/2026-08-30-automation-ai-security-roadmap.md` — the P0-P3 delivery plan, durable
  jobs, incremental sync, RFC 8058 correctness, Outlook batch correctness, HIBP trade-off.
- `research/2026-08-31-inbox-sorting-and-labels.md` — label naming, Gmail/Graph API limits for
  "keep sorting", the sort-my-inbox UX backlog, competitor categorisation mechanisms.

This doc adds three things those don't have: (1) a **holistic per-feature review of the code as
it stands today** with the single highest-leverage change for each area, (2) **what changed in
the competitor set during 2025-2026** (Gemini 3 in Gmail, agentic Copilot in Outlook, the
Grammarly→Superhuman rebrand, Shortwave Tasklet, Chrome built-in AI going stable), and (3) a
firm verdict on **whether Chrome's on-device Prompt API can replace the regex classifiers**.

Primary sources are cited inline. Anything secondary or inferred is marked **[secondary]** /
**[inferred]**.

---

## (a) Executive summary — the highest-leverage improvements, ranked

Each is scoped S (days) / M (1-2 weeks) / L (weeks+). "Why now" is the 2025-2026 change that
makes it urgent, not just nice.

### 1. Parent-domain fallback in `categorizeDomain` + a bundled registrable-domain (eTLD+1) helper — **S**
`domainCategories.ts` does an **exact `Map.get(domain)`** (line 72). `blocklist.ts` already
walks parent labels (lines 33-38) so `mail.evil.example` matches `evil.example`; the sort
taxonomy does not, so `email.amazon.com`, `e.delta.com`, `marketing.nike.com`,
`account.chase.com` all fall through to "other" and never get sorted. This is the biggest
single accuracy hole in "Sort my inbox" and the fix is to lift the parent-walk from
`blocklist.ts` into a shared `registrableDomain()` / `domainMatchesList()` util and call it
from `categorizeDomain`, `threatSignals` (`BRAND_DOMAINS` / `findLookalikeBrand` have the same
exact-match assumption), and `rules.ts` (`fromDomain` condition). **Why now:** every AI
competitor (§c) resolves the sending domain to its brand; Cluster's static map is its whole
classifier and it silently misses the most common bulk-mail subdomain pattern.

### 2. Ship the sort **preview + post-sort digest + per-sender correction map** — **M**
Already the #2 recommendation in the 08-31 doc; restating it here because it is the highest
value-per-effort item in the codebase and nothing has been built. `buildSortPlan` already
returns exact per-bucket id lists and a `messages[]` with `sensitiveWhenFiled` flags — the
preview is pure rendering. The correction map is a local `Record<address|domain, SortOverride>`
that `effectiveBucket` **already consults** (`sortTaxonomy.ts` line 99-109) — it is just never
populated from the UI. **Why now:** Notion Mail, Superhuman and Gemini-in-Gmail all now show a
confirmation sample and apply a 60-second undo before touching mail
([Gmail Gemini organize](https://support.google.com/mail/answer/14355636)); a one-shot sort
with no preview is now visibly behind the norm.

### 3. Engagement model v2: fold in the provider's own priority signal + explicit corrections — **M**
`engagementModel.ts` is a per-sender unread-ratio EMA and nothing else. Two cheap, no-new-
storage upgrades: (a) read Gmail's `IMPORTANT` system label and Outlook's
`inferenceClassification` (`focused`/`other`) — both come back in the metadata you already
fetch — and use "provider thinks this matters" as a strong negative weight against an
unsubscribe/mute suggestion; (b) treat every `keepSorted`, `Allow`, `undo`, and "wrong bucket"
correction as a labelled training row for the same per-sender record. Keep it a transparent
weighted score, not a model. **Why now:** SaneBox's entire moat is the correction loop
([SaneBox training](https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox)); Outlook's
agentic Copilot now assigns every message a priority with a reason
([Copilot agentic Outlook, techcommunity](https://techcommunity.microsoft.com/blog/outlook/copilot-in-outlook-new-agentic-experiences-for-email-and-calendar/4514601))
— an inbox tool with *no* per-user signal reads as static in 2026.

### 4. Server-side "keep sorting" via Gmail filters / Outlook `messageRules` for stable buckets — **M**
The 6-hour alarm is the only thing keeping mail sorted today; it stops when Chrome is closed
and runs up to 6 h late. Per the 08-31 doc §C, a domain-category bucket compiles to **one**
Gmail filter (`from:(amazon.com OR walmart.com OR …)` → add label id, remove `INBOX`) or one
Graph `messageRule` (`senderContains` → `assignCategories` / `moveToFolder` +
`stopProcessingRules`). Header/query-only, server-side, visible and removable by the user in
their own mail settings. **Why now:** this is also the cleanest first big step on Outlook
parity, and Microsoft just shipped Copilot-authored NL inbox rules
([Copilot Outlook rules, MS Support](https://support.microsoft.com/en-us/outlook/create-and-view-outlook-rules-with-microsoft-365-copilot))
— `messageRules` is clearly a supported, first-class surface.

### 5. Split `dashboard.ts` (now **3,185 LOC**, up from 2,227 at the 08-29 audit) — **M**
It has grown ~950 lines in three days across six tabs. It is the single biggest agent-
navigation and regression risk in the repo. Split per tab behind a small shared
`section`/`confirmStep` helper module (`dashboard/tabs/*.ts`). **Why now:** every feature below
adds UI to this file; the cost of not splitting compounds each pass.

### 6. A deterministic **inbox-health overview** (no AI) as the dashboard's front door — **M**
Six tabs, no screen that says "N subscriptions, M never-opened senders, X flagged senders, Y
MB recoverable, here's the 30-day trend." The numbers already exist in `senderModel`,
`expiryTriage`, `engagementModel`, `threatSignals`, `unsubscribeOutcome`. **Why now:** Gmail
("AI Inbox"), Outlook ("Copilot prioritises your inbox"), and Clean Email's dashboard all now
lead with a single triaged overview; Cluster's value is spread across tabs with no narrative.
Render it from deterministic counts; layer the `Summarizer` prose on top only when available.

### 7. Threat subsystem: **auto-quarantine review loop** + Reply-To/attachment-shape signals + per-user decay — **M**
The Security tab is advisory plus a manual per-occurrence action. Add the opt-in "file HIGH-
tier senders to `Possible Phishing`, always reversible" loop (08-29 §4.12) and a **review
queue** so the user confirms/releases and those verdicts decay the risk score. The header set
already carries `Reply-To` (signal exists) — add the metadata **attachment-shape** signal
(`.html`/`.iso`/double-extension from unauthenticated senders, 08-29 §4.6). **Why now:** Gmail
enforced auth for bulk senders in **November 2025**
([multiple; e.g. PowerDMARC](https://powerdmarc.com/gmail-blue-verified-checkmark/) **[secondary]**),
so `dmarc=fail` in delivered promotional mail is now rarer still — the value shifts to the
**transparency panel** and the protective loop, not raw detection.

### 8. Sender-authentication **transparency panel** in plain language — **S/M**
`emailAuth.ts` already parses `Authentication-Results`. Surface per sender: "SPF pass · DKIM
pass · DMARC none", a colour, and a "first email from this sender" badge from the
`firstContact` ledger. **Why now:** Proton ships an "Official" badge and a bright-red
domain-authentication-failure banner to *consumers* today
([Proton Official badge](https://proton.me/support/what-does-official-in-proton-emails-mean),
[Proton auth-failure warning](https://proton.me/support/email-has-failed-its-domains-authentication-requirements-warning));
Gmail shows BIMI blue-check logos. A metadata-only extension surfacing the same headers Gmail
hides is a concrete, cheap trust differentiator — and it is the honest, non-alarmist version
of what the incumbents do.

**Not on the ranked list but still worth doing:** publish the non-engineer privacy page +
Chrome Web Store listing (08-29 §6.4 — the strongest privacy story in the category is still
invisible); `keepSorted`/`mute`/`snooze` Outlook parity via `messageRules` + folder moves;
i18n of the subject regexes (English-only today).

---

## (b) Per-feature-area review

### Sort my inbox — `autoSort.ts`, `sortTaxonomy.ts`, `messageKind.ts`, `domainCategories.ts`

**State:** `buildSortPlan` → per-bucket `SortPlanEntry` with `idsByProvider`, `messages[]`,
`fileOut`. 10 buckets. Kind (from subject regex) wins over domain category. Overrides map is
plumbed through `effectiveBucket` but never written. `resolvePlanLabels` handles the
user-label-collision case. Outlook maps buckets to a flat category.

**Weaknesses, confirmed in code:**
- **Exact-domain match only** (`domainCategories.ts:72`) — see exec #1. `blocklist.ts` already
  has the parent-walk to copy.
- **~150-domain hand map, US-centric.** No `amazon.de`/`.co.jp`, no non-US banks, no non-US
  retail/telecom. `domainsForCategory` (used to compile the "keep sorting" filter) inherits
  the gap.
- **Four English-only subject regexes** in `messageKind.ts` (`OTP_RE`, `SHIPPING_RE`,
  `RECEIPT_RE`, `SOCIAL_RE`). No German/French/Spanish/Portuguese/Japanese stems. `newsletter`
  is inferred from `List-Unsubscribe` presence, which is language-neutral and the one robust
  signal here.
- **Narrow Gmail scan query** (`category:promotions OR category:updates`, unparenthesised —
  08-30 P0). Primary-tab newsletters and anything Gmail tabbed as Forums/Social are invisible
  to the sort.

**Highest-leverage improvement:** exec #1 (parent-domain fallback) then exec #2 (preview +
correction loop). Together these move the classifier from "static list that misses subdomains
and never learns" to "static list + eTLD+1 + per-user overrides that stick" — which is
functionally what SaneBox/Spark/Notion Mail are ("we remember where you filed this sender",
[08-31 doc §A]). Feasible entirely within metadata-only/no-server/MV3. Size: S + M.

**Second:** make `SORT_BUCKET_LABELS` and a label prefix user-editable, one shared label
colour, three naming modes (08-31 doc rec 1). Size: S.

**Third — i18n:** ship per-language subject-stem sets behind the user's Chrome UI locale, or
(better, see §d) let the on-device Prompt API do kind classification where available and keep
the regexes as the always-on fallback. Size: M.

**On the domain map's US-centricity:** a metadata-only tool cannot call a domain-reputation
API. The realistic fix is (a) eTLD+1 fallback so `amazon.*` / `*.amazon.com` all resolve
without new entries, (b) accept community PRs to the map, (c) ship map updates in the
extension bundle on a cadence rather than a runtime fetch (08-31 doc §D last row).

### Rules engine — `rules.ts`, `ruleRunner.ts`, `ruleDryRun.ts`, `ruleCompletionLedger.ts`

**State:** already **Rules v2** — `priority`, `exceptions`, ordered `actions[]`,
`stopProcessing`, per-run cap (100 default / 500 max) with deferred-match reporting,
`findRuleConflicts`, a no-side-effect dry run, a 180-day/10k completion ledger keyed by
rule-behaviour+provider+message-id. `fromDomainCategory` condition exists to back the "keep
sorting" rules. This area is in good shape and matches the 08-30 A4 spec closely.

**Gaps:**
- **AND-only conditions.** No nested `any`/`all`/`not` (08-30 A4 asks for it). In practice the
  `exceptions` object covers the common "except from my bank" case; full boolean nesting is a
  large parser/UI change for modest real-world gain. **Recommendation: defer**, add 2-3 more
  flat conditions instead (`subjectContains` — a header, still metadata; `largerThanMB`;
  `isFirstContact`).
- **No per-rule schedule** ("Fridays only"). Low value for a cleanup tool; the NL draft schema
  doesn't even expose it. Defer.
- **`fromDomain` is exact-match** — same bug as the sort taxonomy (`rules.ts:109`). Fix with
  the shared `registrableDomain()` helper from exec #1 so a `@amazon.com` rule also catches
  `@email.amazon.com`. Size: S. This is the highest-leverage rules change.
- **No server-side compilation.** Rules only ever run in-client on the 6-hour alarm. Compile
  the deterministic subset (from-domain / from-address / has-unsubscribe / kind→query) to a
  Gmail filter or Graph `messageRule` so simple rules keep working with Chrome closed (08-30
  A4, 08-31 §C). Size: M. Re-check locally before acting; keep local execution for rules a
  filter can't express (age + unread combos).

### Engagement learning — `engagementModel.ts`

**State:** per-sender record = `unreadRatioEma` (0.35 current weight), `samples` (capped 100),
last-observed counts/timestamps, `acceptedActions`/`dismissedSuggestions`/`undoneActions`,
optional `snoozedUntil`. Snapshot counted only when aggregate state changes. Suggestions gate
on `messages.length ≥ 3`, `currentRatio ≥ 2/3`, `unreadRatioEma ≥ 0.7`, `score ≥ 70`. 1,000-
record cap, 365-day TTL. Feedback already nudges the score (`-8` dismiss, `-25` undo). This is
a genuinely careful, privacy-preserving design.

**Why it's not yet "useful":** unread-ratio alone conflates "I don't care about this sender"
with "I read this in the Gmail app / on my phone, so the extension's snapshot still shows
unread." It only ever produces *unsubscribe/mute/review* — a one-directional "this is noise"
verdict. It has no positive signal ("you always open this within an hour → protect it").

**Highest-leverage improvement (no new storage):**
1. **Add the provider's own verdict as a feature.** Gmail `IMPORTANT` label and Outlook
   `inferenceClassification` arrive in metadata you already fetch (or one cheap field to add).
   `important && focused` → suppress any unsubscribe/mute suggestion for that sender outright;
   this kills the most embarrassing false positives for near-zero cost. (08-30 B1 makes the
   same point and cites [Gmail labels guide](https://developers.google.com/workspace/gmail/api/guides/labels)
   and [Graph inferenceClassification](https://learn.microsoft.com/en-us/graph/api/resources/manage-focused-inbox?view=graph-rest-1.0).)
2. **Widen the feedback vocabulary.** Today only accept/dismiss/undo on a *suggestion* feed the
   record. Also feed: a "wrong bucket" sort correction (weak negative for "noise"), a
   `keepSorted`/`Allow`/star (strong positive — never suggest unsub), a manual `mute`/`trash`
   of the whole sender (strong positive for "noise", pre-confirms the next suggestion).
3. **Expose the score as a reason string everywhere it's used** — "You never open these",
   Screener ranking, Suggested spam ordering — not just the dedicated suggestions list. This
   is the SaneBox "one model, many surfaces" pattern.

Do **not** add per-message history, subjects, or a generative step. The Workspace user-data
policy requires per-user-only models
([Workspace API user-data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)) —
the current local, account-scoped design is already the compliant one.

### Threat detection — `threatSignals.ts`, `emailAuth.ts`, `linkMismatch.ts`, `blocklist.ts`, `spamList.ts`, `firstContact.ts`

**State:** nine signal kinds (`blocklisted-domain` 6, `freemail-brand-claim` 5,
`lookalike-domain`/`link-mismatch` 4, `failed-authentication`/`brand-impersonation`/
`reply-to-mismatch` 3, `punycode-domain` 2, `lure-language` 2), summed to a risk score with
high/elevated/low tiers. Homoglyph skeleton + Levenshtein lookalike. ~35 brands in
`BRAND_DOMAINS`. Two vendored lists (URLhaus, spam/disposable). `firstContact` ledger keyed
`provider:address`. Opt-in Gmail auto-quarantine. This is already **well ahead** of typical
consumer anti-phishing extensions, which POST URLs to VirusTotal (08-29 §4).

**Gaps / improvements:**
- **`BRAND_DOMAINS` and the freemail/lookalike checks are exact/subdomain match only, and the
  brand list is small and US-centric.** Same shared-helper fix as exec #1 for the domain
  comparisons. Expanding the brand list is manual-but-cheap; prioritise the top targeted
  brands globally (Microsoft/Apple/Google/Amazon/PayPal are already there; add regional banks
  and the big couriers per locale).
- **No attachment-shape signal** though Gmail metadata exposes part filenames/MIME types
  without the body (08-29 §4.6). Highest-leverage *new* signal: `.html`/`.htm`/`.iso`/`.img`/
  double-extension/macro-Office from an unauthenticated sender. Size: S-M (one metadata field
  + a lexer).
- **`failed-authentication` may rarely fire.** Since Gmail's Nov-2025 bulk-sender enforcement,
  `dmarc=fail` mail is spam-foldered even more reliably before it reaches the scanned lanes.
  Broaden the medium case to `dmarc=none` **+** a brand-name display claim (08-29 §5.9), and
  invest the freed attention in the transparency panel (exec #8).
- **Advisory-only.** Add the quarantine review loop (exec #7): opt-in file-out, a confirm/
  release queue, and let "user said safe" / "user deleted" decay the per-sender score
  (requires the engagement record as the store — no new structure).
- **`link-mismatch` / blocklist link check need Deep scan** (a full-body fetch). Keep it
  strictly manual and per-message, as designed. The 08-30 C1 hardening (no redirect follow,
  no credentials, private-IP reject) is already implemented in `unsubscribe.ts`'s
  `isAllowedOneClickUrl` — reuse that guard for any Deep-scan URL resolution.

**Feasible within constraints?** Yes — every item above is header/metadata only except the
existing opt-in Deep scan.

### Screener — `screener.ts`

**State:** tiny and clean — `pendingScreenerSenders` filters Gmail senders not in
`knownSenderSet` (allowlist ∪ sent-correspondents, 7-day TTL). Gmail-only (needs the filters
API to hold mail).

**Gaps:** it's a periodic re-derivation over the last scan window, not a hold on genuinely
*new* senders (08-29 §3). The `firstContact` ledger already records first-seen per
`provider:address` — **wire the Screener to the ledger** so a sender is screened on the sweep
immediately after their first message, and only once. Tighten the background alarm from 6 h to
~15-30 min while Chrome is active (08-30 A2 — Chrome alarms fire as low as 30 s but 5-15 min
is the responsible floor;
[Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)). Add the
allow-all / block-all modes Leave Me Alone's Inbox Shield offers
([LMA Inbox Shield](https://help.leavemealone.com/en/start-here/the-basics/how-to-block-emails-with-inbox-shield)).
Size: S-M. Outlook: a `messageRule` moving unknown senders to a `Screener` folder is the
parity path.

### Subscriptions / unsubscribe — `unsubscribe.ts`, `unsubscribeOutcome.ts`

**State:** `hasVerifiedOneClickSignature` now does the real RFC 8058 check — trusted
provider `Authentication-Results` id, `dkim=pass`, signing domain aligned with From, `h=`
covers **both** `List-Unsubscribe` and `List-Unsubscribe-Post`. `isAllowedOneClickUrl` rejects
non-HTTPS, credentials, non-443 ports, localhost, private/link-local IPs. `fireOneClickUnsubscribe`
uses `credentials:"omit"`, `redirect:"error"`, `referrerPolicy:"no-referrer"`, 10 s abort.
Plain `http://` links are dropped. This directly implements 08-30 C1 and is in good shape.

**Gaps:**
- `httpUrl` (GET-only RFC 2369 links) still opens a page the user must complete manually —
  fine, but the UI should say "opens a page" vs "one-click verified" clearly.
- **Outcome tracking is scan-scoped** ("quiet" ≠ "stopped", already disclosed in README).
  Improvement: after the 14-day window, if still-sending, offer to *promote to a mute/rule* in
  one click — closing the loop the way Leave Me Alone's persistent block does.
- **Data-deletion request assistant** (AgainstData's wedge, 08-29 §Tier "Later", 08-30 P3) —
  a locally generated, user-reviewed GDPR/CCPA deletion email. Natural extension of the
  honest-unsubscribe identity. Size: M, and needs careful "no legal guarantee" framing.

### Reliability — `httpRetry.ts`, `durableJobs.ts`, `incrementalSync.ts`, `storageLock.ts`, settings schema

**State — much improved since 08-30:**
- `httpRetry.ts` now has **randomised exponential backoff** (`baseDelayMs * 2**attempt *
  (0.5 + random())`) and **HTTP-date `Retry-After`** parsing (`parseRetryAfterMs` handles both
  numeric seconds and `Date.parse`). This closes 08-30's "no jitter, numeric-only" finding.
- `incrementalSync.ts` — Gmail history / Graph delta via `listIncrementalMessages`, cursors
  deliberately **not** persisted until downstream processing succeeds; `reset` flag on cursor
  expiry. Matches 08-30 A2.
- `durableJobs.ts` (191 LOC) exists — resumable local jobs with per-message receipts (README
  confirms `planned → running → partial/complete`).
- **Settings schema versioning is real** — `CURRENT_SETTINGS_SCHEMA_VERSION = 5`, sequential
  `migrateSettings` with a guard that throws if stored version is newer than the build.
  Closes 08-30 D2.

**Still open (from 08-30 D1, unverified as fixed):**
- **`storageLock.ts` is 28 LOC** — check whether it's still a module-level `Map` of promise
  chains (which cannot coordinate the dashboard page and the service worker, separate JS
  contexts). If so, move to `navigator.locks` (Web Locks — coordinates across same-origin
  workers/pages, [W3C Web Locks](https://www.w3.org/TR/web-locks/)) or IndexedDB revision
  checks. **This is the top remaining reliability item.** Size: S-M.
- `httpRetry` still only retries on `429 || >=500` — a network throw is retried in
  `fetchWithRetry`'s catch, good, but there's no per-item retry budget surfaced to durable
  jobs. Confirm `durableJobs` records and re-attempts individual failed ids (08-30 A3).
- **Graph `$batch` inner-status parsing** (08-30 C3 / P0.3) — verify `outlookProvider.ts`
  reads each sub-response status, not just the outer 200, and uses `Prefer:
  IdType="ImmutableId"`. Not re-verified in this pass.

### AI — `aiDigest.ts` (Summarizer), `aiRuleDraft.ts` (Prompt API → rule)

**State:** `aiDigest.ts` builds a metadata-only string (category counts, top 5 senders, expiry
buckets) and calls `Summarizer.create({type:"tldr"})`; returns unavailable cleanly. No
deterministic fallback digest — if `Summarizer` is absent the feature is just hidden.
`aiRuleDraft.ts` uses `LanguageModel` (Prompt API) with a `responseConstraint` JSON schema
(`RULE_DRAFT_SCHEMA`), a hard `validateDraft` that re-checks every field, and a
`deterministicDraft` regex parser as the always-available fallback. The system prompt forbids
adding unrequested actions; permanent-delete/send are not in the schema. This is a textbook
safe use of on-device AI.

**Improvements:**
- **Deterministic digest first** (08-30 B3): always render the counts/trends; add the prose
  layer only when `Summarizer.availability()` is `available`. Right now a large fraction of
  users (no supported hardware, mobile, or model not downloaded) see nothing.
- `aiRuleDraft` — expose the new `subjectContains` / `isFirstContact` conditions in the schema
  once they exist; keep the schema and the deterministic parser in lockstep.
- Treat any future subject/body-reading AI as adversarial input — one-shot isolated sessions,
  structured output, model disconnected from mutation APIs (08-30 B4;
  [Chrome built-in AI dos/don'ts](https://developer.chrome.com/docs/ai/built-in-ai-dos-donts),
  [OWASP LLM01 prompt injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)).

### Outlook parity

**State (README):** Outlook supports scan, trash/untrash, archive/unarchive, mark-read,
unsubscribe, the rule engine's label/archive/mark-read/trash actions, and "Sort my inbox"
(bucket → flat Outlook category, Archive when filed out). **Not** supported: keep-sorted,
mute, Screener, snooze, auto-quarantine, "Label as suspicious", Deep scan.

**The parity path is `messageRules` + folder moves**, and it's now well-documented (08-31 §C
tables; [Graph messageRule](https://learn.microsoft.com/en-us/graph/api/resources/messagerule?view=graph-rest-1.0),
[predicates](https://learn.microsoft.com/en-us/graph/api/resources/messagerulepredicates?view=graph-rest-1.0),
[actions](https://learn.microsoft.com/en-us/graph/api/resources/messageruleactions?view=graph-rest-1.0)):
- **keep-sorted** → one `messageRule` per bucket (`senderContains`/`headerContains` →
  `assignCategories` or `moveToFolder`, `stopProcessingRules`).
- **mute** → `messageRule` (`senderContains` → `moveToFolder: <Muted folder>` or `delete`).
- **Screener** → `messageRule` moving unknown senders to a `Screener` folder + the local
  ledger.
- **snooze** → genuinely hard (no native primitive; a folder-move approximation goes stale).
  Leave Gmail-only and say so.
- **auto-quarantine / label-suspicious** → `moveToFolder` + `assignCategories`, reversible via
  recorded category delta (08-30 C3: read/merge existing `categories[]`, record exactly what
  Cluster added).
- **Deep scan** → Graph `$value` / body fetch is possible; keep it opt-in and Gmail-first.

Highest-leverage: keep-sorted + mute for Outlook (both one `messageRule` each). Size: M. Use
`Prefer: IdType="ImmutableId"` throughout (08-30 C3) or every Outlook undo risks a stale id.

### UX / dashboard — `dashboard.ts` (3,185 LOC), `protectionPolicy.ts`

**`protectionPolicy.ts`** is small and solid: `starred-or-flagged` → `transactional`
(receipt/shipping/otp) → `sensitive-subject` regex (tax/W-2/1099/boarding pass/password
reset/…). `buildSenderCleanupPlan` only ever lets *newsletters* be trashed on an unsubscribe
sweep. This central guard is the right design and is used by `autoSort` and the unsubscribe
cleanup.

**`dashboard.ts`** — see exec #5. Also: no live/E2E test exists (08-29 §5.8) — the whole
power-features + threat build is still unverified in a real browser per MEMORY. A single
Playwright pass that loads the unpacked extension and drives the six tabs should gate any
public listing.

**Highest-leverage UX change:** exec #6 (inbox-health overview as the front door) + exec #2
(sort preview). Both reuse existing computed data; neither needs new permissions.

### Distribution / trust

Unchanged since 08-29 and still the biggest strategic gap: unlisted, no landing page, no
non-engineer privacy page, no store listing, no reviews. Cluster's architecture (no server,
metadata-only, open source, on-device AI) is *the strongest possible version* of the category's
core trust claim and it is completely invisible. **Why now:** Clean Email leads its 2026
marketing with "no AI, we can't read your mail, every plan includes everything"
([Clean Email pricing 2026, mymarky](https://mymarky.com/blog/clean-email-pricing-2026-plans-compared) **[secondary]**);
Unroll.me is now EU-blocked over its data-sale history
([LMA comparison](https://leavemealone.com/blog/unroll-me-vs-clean-email/) **[secondary]**).
The trust lane is wide open and Cluster isn't standing in it. Size: S-M (mostly writing).

---

## (c) Competitive delta — what changed in 2025-2026 (primary sources)

The 08-29 and 08-31 docs already cover mechanism/pricing/naming for SaneBox, Clean Email,
Mailstrom, Unroll.me, Leave Me Alone, Superhuman, Shortwave, Spark, Notion Mail. Only the
**changes** are below.

### Gmail — the "Gemini era" (announced 2026, Gemini 3)
[Google blog: "Gmail is entering the Gemini era"](https://blog.google/products-and-platforms/products/gmail/gmail-is-entering-the-gemini-era/)
- **AI Overviews** — thread summarisation (free) + natural-language questions about the inbox
  (Google AI Pro/Ultra only).
- **"AI Inbox"** — "filters out the clutter … identifies VIPs and flags critical tasks."
  Limited trusted-tester now, broader rollout "in coming months." This is Gmail moving onto
  Cluster's turf (clutter filtering + importance), server-side, US/English first.
- **Gemini "help me organize" / "Ask Gemini"** in the inbox
  ([Gmail Help 14355636](https://support.google.com/mail/answer/14355636)): bulk **archive,
  delete, apply an existing label, mark read/unread, star** via NL, with a confirmation card
  and a **60-second undo**. Hard limits: **cannot create labels**, **cannot mark spam**, **no
  filter creation**, won't run if >10,000 threads match. **Availability: work accounts via
  Gemini Beta (org-enabled), personal accounts only via Workspace Experiments** — i.e. not
  broadly shipped to consumers yet. _Implication for Cluster:_ the "AI applies existing labels
  in bulk" UX is now the reference; Cluster's preview + one-undo sort should match its feel,
  and Cluster's ability to *create* the label set and push a standing filter is still a real
  gap Gemini doesn't fill.
- **Bulk-sender authentication enforcement** went mandatory **November 2025**
  ([PowerDMARC](https://powerdmarc.com/gmail-blue-verified-checkmark/) **[secondary]**,
  [Sectigo](https://www.sectigo.com/blog/gmail-blue-checkmark-bimi-requirements) **[secondary]**) —
  strengthens the case for a transparency panel over raw `dmarc=fail` detection.

### Outlook / New Outlook — agentic Copilot (2026)
[MS Techcommunity: "Copilot in Outlook: new agentic experiences"](https://techcommunity.microsoft.com/blog/outlook/copilot-in-outlook-new-agentic-experiences-for-email-and-calendar/4514601)
(page body did not render for automated fetch — details below are from the search snippet and
the MS Support pages, **[partially verified]**)
- Copilot "is now agentic" — reviews mail **as it arrives**, assigns a **priority
  (high/normal/low) with a stated reason**, triages, and surfaces what matters. This is a
  server-side per-user importance model with explanations — exactly the "engagement model +
  reasons" pattern the 08-30 doc recommends Cluster build locally.
- **Copilot-authored inbox rules in natural language** — create/view/update/delete Outlook
  `messageRules` by asking Copilot; **categories can now be rule conditions**; needs a Copilot
  license; rolled out **late Jan - early March 2026**, on by default
  ([MS Support: create/view Outlook rules with Copilot](https://support.microsoft.com/en-us/outlook/create-and-view-outlook-rules-with-microsoft-365-copilot),
  [MS Support FAQ Copilot in Outlook](https://support.microsoft.com/en-us/office/frequently-asked-questions-about-copilot-in-outlook-07420c70-099e-4552-8522-7d426712917b)).
  Confirms `messageRules` is a first-class, actively-invested surface — good news for Cluster's
  Outlook parity plan (exec #4).
- Focused Inbox and `inferenceClassification` (`focused`/`other`) remain the training/override
  primitive
  ([Graph manage-focused-inbox](https://learn.microsoft.com/en-us/graph/api/resources/manage-focused-inbox?view=graph-rest-1.0)).

### Superhuman — acquired by Grammarly (July 2025), parent renamed to "Superhuman"
[Grammarly blog: "Announcing company rebrand to Superhuman"](https://www.grammarly.com/blog/company/announcing-company-rebrand-to-superhuman/),
[Grammarly blog: "Becoming Superhuman"](https://www.grammarly.com/blog/company/introducing-new-superhuman/)
- Grammarly (30M+ users) rebranded the **company** to Superhuman; the email client is now the
  centrepiece of a "Superhuman Suite" + "Superhuman Go" agent platform.
- **Auto Labels + Auto Archive** — proactive, categorise-on-arrival, ML-driven Split Inbox
  auto-labels ([Superhuman AI](https://superhuman.com/ai)). Built-ins `Marketing` / `Pitch` /
  `News` / `Social` (08-31 doc §B). Server-side; custom-instruction text goes to AI
  subprocessors, "never email data logged" per their copy.
- Auto-drafts follow-ups "in your voice", answers NL inbox questions. This is the "AI runs
  your inbox" direction — full client, server LLM, drafting/sending authority. A different
  architecture from Cluster's and a useful contrast to draw in the privacy page.

### Shortwave — Tasklet agents + tiered AI Filters (2025-2026)
[Shortwave AI assistant docs](https://www.shortwave.com/docs/guides/ai-assistant/)
- **AI Filters** — plain-English standing rules ("mute anything from a recruiter unless it
  mentions salary") that label/star/archive/mute; **tiered by plan (3 / 10 / 50)**
  ([Shortwave review 2026, thisandthat.chat](https://www.thisandthat.chat/blog/shortwave-review/) **[secondary]** — Shortwave's own
  `/docs/guides/ai-filters/` 404'd on fetch; **couldn't verify first-party**).
- **Tasklet** (Jan 2026) — an AI agent layer for multi-step email workflows "without human
  intervention"; **MCP** integrations (May 2025). Server LLM, Gmail-only (MS/Exchange
  unsupported). Again: the opposite end of the autonomy/architecture spectrum from Cluster.

### Clean Email — no AI, flat packaging (2026)
[Clean Email pricing 2026 (mymarky)](https://mymarky.com/blog/clean-email-pricing-2026-plans-compared) **[secondary]**,
[Clean Email review 2026 (thebusinessdive)](https://thebusinessdive.com/clean-email-review) **[secondary]**
- Explicitly markets **"doesn't come with AI features … cannot understand content"** as a
  selling point. Free / Premium **$29.99-30/yr** / Pro **$99.99/yr**; **features are not gated
  by tier** — only the number of connected accounts (1 / 5 / 10). Auto Clean, Unsubscriber,
  Smart Views, Screener, Privacy Monitor all in every paid plan.
- Take-away for Cluster: "coherent breadth at one price, no AI hype, we can't read your mail"
  is a proven 2026 position, and Cluster can claim a *stronger* version of it (no server at
  all).

### Leave Me Alone — pricing (2026)
[LMA pricing](https://leavemealone.com/pricing/) **[secondary snapshot]**: free 10 unsubscribes;
**$19 one-time 7-day pass**; Casual Emailer **$9/mo or $54/yr** (4 accounts); Inbox Zero Hero
**$16/mo or $64/yr** (unlimited accounts). Rollups (digest of moved mail, originals retained)
and Inbox Shield (allow-all / block-all screening) unchanged
([LMA Rollups](https://help.leavemealone.com/en/rollups/what-is-a-rollup),
[LMA Inbox Shield](https://help.leavemealone.com/en/start-here/the-basics/how-to-block-emails-with-inbox-shield)).

### Unroll.me — unchanged, now EU-blocked
Still free, still monetised by selling panel data per its own privacy notice
([Unroll.me privacy](https://unroll.me/legal/privacy/)); now blocked in the EU
([LMA](https://leavemealone.com/blog/unroll-me-vs-clean-email/) **[secondary]**). The
cautionary tale is more useful to Cluster than ever.

### SaneBox — unchanged core
No 2026 mechanism change found. Still headers-only classification + the drag-to-retrain loop
([SaneBox how it works](https://www.sanebox.com/help/155-how-does-sanebox-work),
[training](https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox)); `@Sane*` flat
folders; SaneBlackHole's 7-day delayed trash
([SaneBlackHole](https://www.sanebox.com/help/235-saneblackhole-what-do-i-do-with-my-saneblackhole-folder)).
The correction loop remains the thing to copy.

### Consumer-facing sender authentication & first-contact — where the incumbents are now
- **Gmail:** BIMI blue-check verified-logo for senders with DMARC enforcement + a Verified
  Mark / Common Mark Certificate
  ([EncryptionConsulting: BIMI with VMC and CMC](https://www.encryptionconsulting.com/bimi-with-vmc-and-cmc/) **[secondary]**,
  [Validity](https://www.validity.com/blog/gmail-introduces-new-blue-verified-checkmarks-for-bimi-senders/) **[secondary]**).
  Gmail does **not** expose raw SPF/DKIM/DMARC verdicts to consumers in the UI — it hides them
  behind "show original".
- **Proton:** an **"Official" badge** on genuine Proton mail + **verified sender images** for
  "tens of thousands" of businesses
  ([Proton: what does Official mean](https://proton.me/support/what-does-official-in-proton-emails-mean),
  [Proton: sender verification](https://proton.me/support/digital-signature)); a **bright-red
  banner** — "This email has failed its domain's authentication requirements. It may be spoofed
  or improperly forwarded!" — on incoming mail that fails domain auth
  ([Proton auth-failure warning](https://proton.me/support/email-has-failed-its-domains-authentication-requirements-warning)).
  This is a consumer product surfacing a header-only phishing hint — the closest analogue to
  what Cluster's transparency panel would do.
- **Outlook:** first-contact "you don't often get email from…" safety tip (Exchange Online
  Protection), plus spoof/impersonation banners on server-side detections.
- **No consumer browser extension** found that does header-only phishing hints the way Cluster
  does — the extension space is writing assistants (Grammarly, Compose AI), full clients
  (Superhuman), and multi-model sidebars (Monica), not metadata security. Cluster's threat
  panel is genuinely differentiated. **[search-based, secondary — see open questions]**

### New browser-extension mail tools
Nothing new in the *metadata-cleanup* niche. 2026 "best AI email extension" roundups are
Superhuman, Grammarly, Compose AI, Monica — all writing/triage assistants, none privacy-
metadata-cleanup. **[secondary: various roundups; treat as "no strong new entrant found"]**

---

## (d) Chrome built-in AI: can it replace the regex classifiers?

**Verdict: use it as an *optional accuracy upgrade* for `messageKind` (and, later, sort-bucket)
classification where it's available — but it cannot *replace* the regexes / domain map. Keep
the deterministic path as the always-on default. This is exactly the pattern `aiRuleDraft.ts`
already uses, and it should be generalised, not deepened.**

### What's actually available now (primary: Chrome for Developers docs)

| API | Status for **extensions** | Notes |
|---|---|---|
| **Prompt API** (`LanguageModel`) | **Stable / GA in extensions** ([Chrome: AI in extensions](https://developer.chrome.com/docs/extensions/ai)); stable on web from Chrome 138 ([Prompt API](https://developer.chrome.com/docs/ai/prompt-api)) | Gemini Nano, on-device. `responseConstraint` takes a **JSON Schema** for structured output; the docs' own example is a **classification** ("respond `true`/`false` to classify if a message is about pottery"). Multimodal input (text/image/audio), text-only output. Session `contextWindow` / `contextUsage` exposed; old turns auto-dropped. Chrome 148 adds `topK`/`temperature` sampling (behind an OT on web; legacy params work in extensions). |
| **Summarizer** | **Stable** in extensions ([AI in extensions](https://developer.chrome.com/docs/extensions/ai)); web from Chrome 138 ([Summarizer API](https://developer.chrome.com/docs/ai/summarizer-api)) | `type: tldr|key-points|headline|teaser`. Already used by `aiDigest.ts`. |
| **Translator**, **Language Detector** | **Stable** in extensions | Could power i18n of the subject classifier — detect language, then either translate the subject to English for the existing regexes or route to a language-specific set. **Not available on mobile.** |
| **Writer / Rewriter** | **Origin trial** ([AI in extensions](https://developer.chrome.com/docs/extensions/ai)) | Not relevant to Cluster (drafting). |
| **Proofreader** | **Origin trial, Chrome 141-145** ([Proofreader API](https://developer.chrome.com/docs/ai/proofreader-api)) | Not relevant. |

### Hardware / availability reality (primary: [Chrome: get started with built-in AI](https://developer.chrome.com/docs/ai/get-started))
- Desktop only: **Windows 10/11, macOS 13+, Linux, ChromeOS on Chromebook Plus**. **No
  Android, no iOS, no regular ChromeOS.**
- **~22 GB free disk** on the Chrome-profile volume, **>4 GB VRAM** *or* **16 GB RAM + 4
  cores**, unmetered connection for the one-time model download.
- The model is **downloaded per origin on first use**; `availability()` can be
  `unavailable | downloadable | downloading | available`.

Net: on a large share of installs the Prompt API will be `unavailable` or `downloadable`
(not yet usable). A classifier that only works there is not a classifier you can depend on.

### Can it classify well enough?
- **Message kind from subject** (`otp` / `receipt` / `shipping` / `newsletter` / `social` /
  `other`): **yes, comfortably** — it's a short-input, 6-way, closed-set classification with a
  `responseConstraint` enum. It would fix the English-only limitation in one move (Gemini Nano
  is multilingual) and catch phrasings the regex misses ("your code is 449 201", "dein Paket
  ist unterwegs"). This is the single best fit.
- **Sort bucket end-to-end** (kind ∪ domain category): **partially** — it can guess a category
  from sender + subject when the domain isn't in the hand map, which directly attacks the
  US-centric-list weakness. But it will hallucinate a plausible-looking bucket for genuinely
  ambiguous senders, so gate it: only consult the model when the deterministic path returns
  `null`, only apply its answer above a confidence bar, and always run it through the preview
  (exec #2) so the user sees and can correct it. Never let it override a deterministic hit.
- **Threat lure-language**: the regex is deliberately a low-weight corroborating signal; a
  model could widen recall, but treating email text as model input on the security path raises
  the prompt-injection surface (08-30 B4). **Keep lure-language deterministic.**

### Constraints on doing it
1. **Must be a graceful enhancement.** `checkDigestAvailability`-style guard, deterministic
   result computed first and always, model result only merged when `available`. Non-negotiable
   — the docs say so ([built-in AI is not universal](https://developer.chrome.com/docs/ai/get-started)).
2. **Adversarial input.** Subjects are attacker-controlled. One-shot isolated sessions,
   `responseConstraint` enum output, model has no path to a mutation API, output rendered as
   an enum not as text ([Chrome dos/don'ts](https://developer.chrome.com/docs/ai/built-in-ai-dos-donts),
   [OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)).
3. **Batching / latency.** A scan can have hundreds of subjects. Classify only the ones the
   regex marks `other`, batch them into few prompts (schema = array of enums), cache by
   normalised-subject hash. Budget it so a cold model download never blocks a scan.
4. **Privacy note stays true.** Subjects are headers, already fetched, never leave the device
   (Gemini Nano is local). `SECURITY.md` should state explicitly that on-device AI sees
   subjects but nothing leaves the machine, and that it's off when unavailable.
5. **Determinism for tests.** The regex path stays the contract-tested one; the AI path gets
   its own availability-gated tests with a stubbed `LanguageModel` (as `aiRuleDraft.test.ts`
   already does).

**Bottom line:** the regexes and the domain map stay as the spec. The Prompt API is a
worth-adding second opinion for `messageKind` and for *only* the `null` cases of sort-bucket
classification, behind the same availability guard and preview the codebase already knows how
to build. Size: M for `messageKind`; the sort-bucket fallback is a small addition on top.

---

## (e) Open questions / couldn't verify

1. **`storageLock.ts` cross-context safety** — is it still a module-level `Map` (08-30 D1)? 28
   LOC, not read line-by-line this pass. If unchanged it cannot coordinate the dashboard and
   the service worker. Needs a look and probably `navigator.locks`.
2. **Graph `$batch` inner-status parsing + `ImmutableId`** (08-30 C3 / P0.3) — not re-verified
   in `outlookProvider.ts` this pass. Assumed still open.
3. **`durableJobs.ts` per-item retry** — file exists (191 LOC) but I didn't confirm it records
   and re-attempts individual failed message ids with a bounded budget (08-30 A3).
4. **Outlook agentic-Copilot detail** — the MS Techcommunity blog body did not render for
   automated fetch; priority-scoring / triage specifics are from the search snippet + MS
   Support pages only. **[partially verified]**
5. **Shortwave AI Filters first-party spec** — `shortwave.com/docs/guides/ai-filters/` 404'd;
   the per-plan caps (3/10/50) and behaviour are from a secondary review. The AI-assistant
   pipeline page is first-party.
6. **Gmail "AI Inbox" mechanism and consumer rollout date** — Google's blog states the
   feature and "coming months"; no dated GA, no mechanism detail.
7. **Superhuman "never email data logged"** — vendor copy on `superhuman.com/ai`, not
   independently verifiable; treat as a marketing claim.
8. **Does the Gmail API reject a user label literally named `Promotions`/`Updates`/`Social`/
   `Forums`?** Still unverified (08-31 open q1) — needs a live `users.labels.create` on a
   throwaway account. Recommendation (avoid those words) stands regardless.
9. **Whether any consumer browser extension does header-only phishing hints** — based on 2026
   "best extension" roundups (secondary) plus the absence of one in the earlier docs' research;
   not an exhaustive Web Store search.
10. **Chrome built-in AI exact stable-version history per API** — the overview page and
    get-started page don't publish a version table; per-API pages give partial info and one
    fetch returned a wrong release date ("Chrome 138 … November 2024" — Chrome 138 shipped
    mid-2025). Treat specific month claims as approximate; the *status* (Prompt/Summarizer/
    Translator/Language Detector stable in extensions; Writer/Rewriter/Proofreader in trial)
    is confirmed by [developer.chrome.com/docs/extensions/ai](https://developer.chrome.com/docs/extensions/ai).
11. **SaneBox / Clean Email / LMA exact 2026 prices** — from secondary review/aggregator pages
    (their own pricing pages are JS-rendered and didn't return figures to automated fetch).
    Directionally right; verify against the live pages before quoting in product copy.
