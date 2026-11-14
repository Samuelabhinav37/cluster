# Open source code research: inbox-zero, Zero, spam filters, Gmail API (2026-11-14)

Status: research only. Nothing built. Companion to `2026-11-14-classify-learn-onboard-research.md` (product behaviour from help pages) and `2026-11-14-scan-pipeline-audit.md` (Cluster's own bugs). This file reads source code instead of marketing pages.

Rules used: every claim names a file and line range or a URL. inbox-zero links are pinned to commit `298a21f72bdf298ca7b95cef623165c7fa9f59d3` (HEAD on 2026-11-14), written below as `IZ/` = `https://github.com/elie222/inbox-zero/blob/298a21f72bdf298ca7b95cef623165c7fa9f59d3/`. Anything I could not confirm in code or docs is marked **unverified**.

## 1. inbox-zero (elie222/inbox-zero)

A Next.js server app. It reads mail on its server and uses an LLM for most judgement calls. Cluster is on-device with no LLM, so the useful parts are the deterministic guards that sit in front of the AI, the thresholds, and the learning rules.

### 1.1 Categorising senders and emails

**Two layers.** Per-email "rules" (system rules like Newsletter, Marketing, Receipt) label each message. Separately, "sender categories" give each sender one category for Bulk Archive.

**Sender categories.** Five defaults: Other, Newsletter, Marketing, Receipt, Notification (`IZ/apps/web/utils/categories.ts#L1-L48`). A comment says secondary categories (Banking, Personal, Work, Travel and so on) are planned but off (`#L31-L47`).

**Static pass before AI.** `preCategorizeSendersWithStaticRules` runs first and only sets a category the user still has (`IZ/apps/web/utils/categorize/senders/categorize.ts#L141-L165`). The static rules are thin:
- Newsletter: the address contains "newsletter", or the domain is substack.com, mail.beehiiv.com or ghost.io (`IZ/apps/web/utils/ai/group/find-newsletters.ts#L1-L8`).
- Receipt: the address contains `receipt@`, `invoice@`, `billing@` or `invoice+statements` (`IZ/apps/web/utils/ai/group/find-receipts.ts#L4-L9`, `#L43-L45`). A longer subject list ("Invoice #", "Your receipt from", "Payment received" and about 17 more) exists for per-message checks (`#L10-L31`, `isReceipt` `#L54-L59`).

Cluster's own domain and header lists are already far larger than this. Nothing to copy here beyond the idea.

**AI pass.** Senders the static pass missed go to the LLM in bulk with their address plus recent subjects and snippets (`IZ/apps/web/utils/ai/categorize-sender/ai-categorize-senders.ts#L89-L134`). The prompt says "Accuracy is more important than completeness" and "Respond with Other if unsure" (`#L129-L134`). If the model abstains, the sender becomes Other (`IZ/apps/web/utils/categorize/senders/categorize.ts#L41-L73`). Single-sender categorising reads the sender's last 3 threads (`#L29-L32`).

**Caps.** Bulk categorising pages senders 100 at a time and stops at 2,000 senders and 20 sync passes (`IZ/apps/web/utils/categorize/senders/start-bulk-categorization.ts#L20-L22`, `#L121-L133`).

**System rules (per email).** Defaults: To Reply, Awaiting Reply, FYI, Actioned, Newsletter, Marketing, Calendar, Receipt, Notification, Cold Email, plus opt-in OTP (`IZ/apps/web/utils/rule/consts.ts#L7-L23`, `#L45-L166`). Each is a one-line natural-language definition. Two have useful exclusions that Cluster's rules should copy in spirit:
- Marketing: "Exclude emails whose main purpose is account access, a transaction, or a service update, even if they include promotional content." (`#L106-L111`)
- Notification: "A message a person wrote and sent to me, like a colleague's status update, is not a notification." (`#L138-L146`)

The bulk kinds (Newsletter, Marketing, Calendar, Receipt, Notification, OTP, Cold Email) have `runOnThreads: false`; the conversation kinds have `true` (same lines). So a reply inside a newsletter thread is not labelled Newsletter by default.

**Match order.** `findPotentialMatchingRules` checks, per rule: the `runOnThreads` guard first, then learned patterns (an exclusion skips the rule; an inclusion matches and skips other checks), then static conditions, then AI (`IZ/apps/web/utils/ai/choose-rule/match-rules.ts#L312-L402`). If any learned pattern matched, it returns without running AI at all (`#L471-L472`). Cold email is decided separately before rule selection (`#L103-L125`).

**Bulk Archive confidence.** Archive candidates are graded only by category name: marketing, promotion, newsletter, sale = high; notification, alert, receipt, update = medium; everything else low (`IZ/apps/web/utils/bulk-archive/get-archive-candidates.ts#L18-L65`). Receipts are medium, not high. That matches Cluster keeping receipts out of the trash-first list.

**Person vs automated.** I found no header-based person detector. "Person" comes from the To Reply / FYI AI rules and the prior-contact check below. The organisation check treats same company domain as internal but public providers (gmail.com etc.) compare by full address (`IZ/apps/web/utils/email.ts#L325-L343`).

### 1.2 Cold email blocker

`checkColdEmailGuards` runs deterministic checks in this order before any AI (`IZ/apps/web/utils/cold-email/is-cold-email.ts#L50-L161`):
1. App senders on a whitelist are never cold (`#L63-L69`).
2. Same organisation is never cold (`#L71-L76`).
3. A learned "not cold" exclusion wins over a "cold" pattern if both exist (`#L95-L113`).
4. A learned "cold" pattern is overridden if the user has ever sent mail to that address (`#L115-L145`). `hasUserSentEmail` pages Sent threads to that address, at most 3 pages of 10, and ignores messages Inbox Zero itself wrote (`IZ/apps/web/utils/cold-email/has-user-sent-email.ts#L5-L58`).
5. Prior contact: Gmail search `(from:X OR to:X) before:<this mail's time>`, `maxResults: 4`, ignoring the current message (`IZ/apps/web/utils/gmail/message.ts#L196-L238`). X is the whole domain for company domains and the full address for public providers (`IZ/apps/web/utils/email.ts#L325-L332`).

**Fail safe toward "not cold".** If the date, id or sender is missing, or the search throws, it assumes prior contact (`IZ/apps/web/utils/cold-email/has-prior-contact.ts#L4-L53`). The comment gives the reason: blocking compounds (label, archive, maybe a reply to the sender) while a missed cold email "costs one email in the inbox".

**Replying clears the block.** When the user sends mail, any learned cold pattern for those recipients (and for the sender of the In-Reply-To message) is turned into an exclusion with reason "you replied to this sender" (`IZ/apps/web/utils/cold-email/exclude-replied-sender.ts#L11-L105`). The thread keeps its label; the "Not a cold email" button undoes that.

**Default prompt.** Signing up for a service counts as a relationship, so onboarding, trial and account mail are not cold. Newsletters, receipts, promotions, alerts, password resets and calendar invites are listed as not cold (`IZ/apps/web/utils/cold-email/prompt.ts#L1-L28`). A comment says the cheaper decision model is off by default because it "could not separate personalized pitches from legitimate outreach" in evals (`IZ/apps/web/utils/cold-email/is-cold-email.ts#L183-L193`).

**Learning cold from Spam.** When the user marks mail as spam, the sender becomes a learned cold pattern only if: not same org, no existing pattern, every message in the thread is from that one sender ("Junking a conversation is not a claim about everyone who replied in it"), and no prior contact (`IZ/apps/web/utils/webhook/google/process-label-added-event.ts#L123-L216`).

### 1.3 Bulk Unsubscribe and Bulk Archive

**Signals per sender.** The newsletter stats route returns, per sender: total count (`value`), `inboxEmails`, `readEmails`, `lastEmailAt`, `unsubscribeLink`, whether a Gmail filter already auto-archives the sender, any label filters, and the user's status (unsubscribed, auto-archived, approved) (`IZ/apps/web/app/api/user/stats/newsletters/route.ts#L77-L100`). Filters offered are read / unread / archived / unarchived and unhandled / autoArchived / unsubscribed / approved (`#L30-L38`). The counts come from inbox-zero's own synced copy of message headers, not live Gmail search (`getSenderEmailStats`, `#L58-L72`).

**What gets suggested.** The whole rule is a few lines (`IZ/apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/suggestions.ts#L7-L39`):
- the sender has no status yet and is not already auto-archived,
- at least 3 emails (`SUGGESTION_MIN_EMAILS`, comment: "Require enough emails that a low read rate is signal, not noise"),
- has an unsubscribe link,
- read rate under 20% (`SUGGESTION_READ_RATE_THRESHOLD`),
- sorted by count, largest first.

An option narrows it to senders with an automatic (HTTP) unsubscribe link (`#L27-L38`, `#L49-L55`).

**Actions and fallbacks.** Unsubscribe with no usable link falls back to "block sender": a filter archives future mail, toast "Sender blocked. Future emails will be archived." (`IZ/apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks.ts#L357-L373`). If the automatic unsubscribe fails, the error toast carries an "Open page" button to the user-facing link (`#L330-L341`, `#L388-L393`). Archiving existing mail on unsubscribe is a setting (`archiveExisting`, `#L375-L383`). Auto archive is the same block filter, optionally with a label (`#L561-L590`). "Keep" sets the sender to APPROVED so it drops out of suggestions, with an optimistic "Sender kept" toast (`#L781-L880`). Already unsubscribed senders can be reset to no status (`#L351-L357`); a `ResubscribeDialog.tsx` exists in the same folder (not read).

**Confirm and undo.** Bulk archive and delete show a loading, success and error toast (`toast.promise`) and no Undo button (`#L960-L1050`). Delete fetches every thread from the sender and queues a trash batch by thread (`#L1017-L1031`). So inbox-zero relies on Gmail Trash for recovery, not an in-app undo. I did not find an undo for these in the files read (**unverified** that none exists elsewhere).

**Bulk Archive by category.** `BulkArchive.tsx` groups senders by their sender category and uses the high / medium / low confidence above (`IZ/apps/web/utils/bulk-archive/get-archive-candidates.ts#L18-L65`).

### 1.4 Learning from corrections

inbox-zero has three layers, from weakest to strongest.

**a. Feedback rows (soft hint).** Every label added or removed by the user on a message that a rule labelled is saved as a `classificationFeedback` row keyed by sender, rule, message and event, deduplicated by a unique key (`IZ/apps/web/utils/rule/classification-feedback.ts#L19-L94`). The newest few rows for a sender are fed back into the AI prompt with the message subject (`#L96-L136`). Labels Inbox Zero applied itself are skipped (`IZ/apps/web/utils/webhook/google/process-label-added-event.ts#L240`).

**b. Learned patterns (hard rule per sender).** A learned pattern is a `FROM` row in a group tied to a rule, with `exclude`, `reason`, `source` (USER, AI, LABEL_ADDED, LABEL_REMOVED), and the message and thread that caused it (`IZ/apps/web/utils/rule/learned-patterns.ts#L11-L65`). Matching a learned pattern skips the AI (`IZ/apps/web/utils/ai/choose-rule/match-rules.ts#L343-L381`, `#L471-L472`).

**c. When a label removal becomes a rule.** `recordLabelRemovalLearning` (`IZ/apps/web/utils/rule/record-label-removal-learning.ts#L25-L145`):
- Removing a custom rule's label deletes only an AI-inferred inclusion for that sender. It does not create an exclusion (`#L56-L65`, and `removeAiLearnedPattern` keeps user-made rows, `IZ/apps/web/utils/rule/learned-patterns.ts#L67-L91`).
- The first removal is saved as feedback only (`#L122-L127`).
- A second removal for the same sender and rule, earlier than 15 minutes ago, writes an exclusion with source LABEL_REMOVED (`#L110-L144`).
- Sweeps are ignored. If 10 or more removals of that rule happened in the last 15 minutes, no exclusion is learned (`#L19-L23`, `#L86-L108`). One Gmail history batch with 10 or more messages losing the same label is also marked bulk up front (`getBulkRemovedLabelIds`, `#L147-L173`). The comment says why: stripping a label from many emails means "stop labeling this", not a per-sender correction.

**d. AI-inferred patterns, with a consistency check.** After a sender has 3 or more threads (`THRESHOLD_THREADS = 3`, reads up to 10), inbox-zero checks rule history for that sender. Only if every past match went to one rule (`ruleMatches.size === 1`) does it ask the AI, and it saves the pattern only if the AI picks that same rule (`IZ/apps/web/app/api/ai/analyze-sender-pattern/route.ts#L22-L23`, `#L127-L203`; `IZ/apps/web/utils/rule/check-sender-rule-history.ts#L83-L97`). Any thread with a second sender means "conversation" and the sender is skipped for good (`route.ts#L277-L301`). Each sender is checked once (`patternAnalyzed` flag, `#L80-L91`).

**Re-running on past mail.** "Bulk run" processes inbox threads in a date range, 25 per page, unread only unless "include read" is set, with a `rerun` flag, and a retrier that waits on `Retry-After` and slows the queue when rate limited (`IZ/apps/web/app/(app)/[emailAccountId]/assistant/bulk-run.ts#L24-L101`).

**Rule history.** Every rule change is versioned with a trigger such as created, conditions_updated, instructions_updated, enabled_updated (`IZ/apps/web/utils/rule/rule-history.ts#L8-L16`, `#L25-L60`). This is an audit trail, not a learning signal.

### 1.5 Gmail sync

**Push watch.** `users.watch` on labels INBOX and SENT with `labelFilterBehavior: "include"` (`IZ/apps/web/utils/gmail/watch.ts#L33-L54`). If Gmail says a push client already exists, it calls `users.stop` and watches again (`#L11-L27`). A cron renews watches; accounts are sorted by expiry with nulls first, and an expired date triggers renewal (`IZ/apps/web/utils/email/watch-manager.ts#L55-L92`, `#L151-L166`). Cluster cannot receive Pub/Sub in an extension, so only the history logic below transfers.

**history.list.** One call shape: `historyTypes: ["messageAdded", "labelAdded", "labelRemoved"]`, page size 500, follow `nextPageToken` until done, 5 retries per page (`IZ/apps/web/utils/webhook/google/process-history.ts#L44`, `#L527-L556`; `IZ/apps/web/utils/gmail/history.ts#L5-L29`). New messages are kept only if they carry INBOX or SENT (`process-history.ts#L311-L322`). Events are deduplicated by type plus message id per history record (`#L332-L335`).

**Gap cap.** If the stored cursor is far behind the pushed historyId, it starts at `newHistoryId - 3000` instead and logs the skipped range (`MAX_GMAIL_HISTORY_ID_GAP = 3000`, `#L40`, `#L488-L513`). After a rate-limit pause the window widens to 30,000 (`#L41-L43`, `#L157-L163`). History ids are not message counts, so this is a heuristic.

**404 expired history.** A 404 from history.list is treated as expired (`#L436-L445`, comment "Gmail history IDs are typically valid for ~1 week", `#L567-L576`). The handler then writes the new historyId as the cursor and returns 200 (`#L174-L187`). It does **not** do a full resync. Mail between the old cursor and now is simply skipped. An empty window also advances the cursor, because otherwise "we can get into a loop with never receiving history" (`#L221-L238`). The handler returns 200 on errors too so Pub/Sub does not redeliver forever (`#L279`).

**Cursor writes.** The cursor is saved after each processed history record, so a timeout keeps progress (`#L375-L378`). The write is monotonic: SQL only sets it when the new id is larger, so a slow worker cannot roll it back (`#L393-L416`).

**Stopping on errors.** A rate-limit error on one item stops the loop before the cursor passes it, so the catch-up after the pause re-reads it. A "needs reconnect" error stops too, instead of failing every remaining item (`#L344-L360`).

**Batch.** Raw multipart batch with `BATCH_LIMIT = 100` (`IZ/apps/web/utils/gmail/batch.ts#L7-L36`), but real use goes through `batch-with-retry` at 25 per batch, 10 when retrying after a rate limit, 3 retries, exponential delay capped at 10 s plus up to 1 s jitter. Only failed items are retried, and non-retryable items are skipped (`IZ/apps/web/utils/gmail/batch-with-retry.ts#L8-L14`, `#L95-L160`). The comment: "Gmail counts each subrequest toward per-user concurrency. Leave headroom for other account activity" (`#L13-L14`).

**Retry policy.** Rate limit = HTTP 429, or 403 with reason `rateLimitExceeded`, `userRateLimitExceeded` or `quotaExceeded` (`IZ/apps/web/utils/gmail/retry.ts#L159-L170`). Delay order: retry time parsed from the error message, then the `Retry-After` header, then fallback backoff: server errors 5, 10, 20, 40, 80 s; rate limits 1 s doubling to 10 s; other retryable 1 s doubling to 16 s (`#L225-L258`). Blocking retries cap at 10 s (`#L11`). "Gmail is disabled for the account" is not retried (`#L183`).

**Account rate-limit mode.** On a provider rate limit the account is put into a stored "rate limited until" state (default 30 s, plus a 5 s buffer), and every call checks it first (`IZ/apps/web/utils/email/rate-limit.ts#L27-L28`, `#L56-L210`). A comment warns not to record the guard's own error, or "the mode never expires" (`#L295-L296`).

**Thread vs message.** Archive, label and mark read all use `threads.modify` on the whole thread (`IZ/apps/web/utils/gmail/label.ts#L54-L75`, `#L130-L184`, `#L222-L230`). Only `labelMessage` uses `messages.modify` (`#L202-L214`). Bulk delete gathers threads and trashes by thread (`IZ/apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks.ts#L1004-L1031`). This is the opposite of Cluster today, where moves are per message (see H5 in the audit). Labels are created under an "Inbox Zero" parent label, with nested parents created as needed (`IZ/apps/web/utils/gmail/label.ts#L319-L408`).

### 1.6 Onboarding

Order for the AI-assistant path (`IZ/apps/web/app/(app)/[emailAccountId]/onboarding/onboardingFlow.ts#L30-L87`): survey (who, company size, how you heard; skipped when self-hosted), intent, then Emails sorted, Chat, Draft replies, Bulk unsubscribe, Labels, Draft, Custom rules, Invite team, Inbox processed. Mail-client users get one step instead (`#L49`, `#L80-L81`).

- **First feature screen** is an illustration with "Your inbox, automatically sorted" and "Every email gets a label like "To Reply", "Newsletter", or "Cold Email"." (`IZ/apps/web/app/(app)/[emailAccountId]/onboarding/StepEmailsSorted.tsx#L7-L18`). No real data yet.
- **Bulk unsubscribe step** is the first screen with the user's real mail. It loads the last 90 days, top 50 senders by count with no status, applies the 20% read / 3 mail rule, and shows the top 5 pre-checked: "We found N senders you rarely read. We'll unsubscribe and archive these for you. Uncheck any you want to keep." with Unsubscribe from N, Continue and Skip for now (`IZ/apps/web/app/(app)/[emailAccountId]/onboarding/StepBulkUnsubscribe.tsx#L31`, `#L45-L81`, `#L195-L258`).
- **Labels step** asks "How do you want your inbox organized?" (`StepLabels.tsx#L30-L36`).
- **Last step** shows what it did on real mail: it labels the last 20 emails (`ONBOARDING_PROCESS_EMAILS_COUNT = 20`, `IZ/apps/web/utils/config.ts#L36`) and lists them with "We labeled your last 20 emails. Nothing was archived." (`StepInboxProcessed.tsx#L100-L109`). The preview swallows provider errors so onboarding never breaks (`IZ/apps/web/app/api/user/onboarding/processed-emails/route.ts#L67-L69`).

So inbox-zero shows value on a small real sample (20 mails, 5 senders) and says plainly that nothing was archived. Archiving is opt-in later.

## 2. Mail-0/Zero (brief)

Pinned to commit `36132735ca3b734b23f48127f9271c80d1ba76e7`, written as `Z/` = `https://github.com/Mail-0/Zero/blob/36132735ca3b734b23f48127f9271c80d1ba76e7/`.

**Header-only categories (the most reusable code in this file).** For IMAP mail Zero sorts into personal, promotions or updates from headers alone, with no AI (`Z/apps/server/src/lib/imap/categorize.ts#L1-L82`). It reads From, To, Cc, List-Id, List-Unsubscribe, Precedence, Auto-Submitted, Feedback-ID, X-Auto-Response-Suppress, X-Campaign (`#L18-L20`). Order of checks in `classifyMessage` (`#L52-L82`):
1. A known contact (someone the user wrote to) with no List-Unsubscribe and no bulk Precedence is personal.
2. `Precedence: list` with no campaign marker and no marketing-looking address is updates (mailing lists).
3. List-Unsubscribe or `Precedence: bulk/junk`: promotions, unless it is an automated sender address with no campaign marker, then updates. Comment: "Transactional mail sometimes carries List-Unsubscribe".
4. List-Id alone, Auto-Submitted not "no", or X-Auto-Response-Suppress: updates.
5. An automated local part (no-reply, notifications, alerts, billing, receipts, orders and similar, `#L22-L24`): updates.
6. Feedback-ID or X-Campaign (ESP campaign markers): promotions.
7. Otherwise personal. Comment: "A marketing-looking address alone (info@, hello@) is often a real person; only ESP campaign markers make unlisted mail a promotion." (`#L78-L80`). The marketing local-part list is `#L26-L28`.

**Quota budgeting.** Zero keeps a cost table per Gmail method (`Z/apps/server/src/lib/gmail-quota-cost.ts#L1-L35`) and a rolling per-second ledger. Default limits are 4,800 units a minute per mailbox and 960,000 per project, which is 80% of Google's 6,000 and 1,200,000 (`Z/apps/server/src/lib/gmail-quota-store.ts#L7`). Each request has a priority: foreground gets 100% of that budget, sync 90%, backfill 70% (`#L3`, `#L8`). Concurrent leases per mailbox: 8 foreground, 6 sync, 4 backfill (`#L55-L56`). When over budget it computes the exact time the oldest bucket rolls off and waits until then (`#L85-L97`). The window is rolling, "not a fixed minute reset that permits a double burst at its boundary" (`#L165-L166`).

**Backoff.** Rate limited (429, or reasons rateLimitExceeded, userRateLimitExceeded, quotaExceeded, dailyLimitExceeded): start at 60 s, doubling, cap 1 hour. Other transient errors: 2 s doubling, cap 60 s. Retry-After wins when present. 401 or `invalid_grant` means reauth, and other 4xx are treated as permanent (`Z/apps/server/src/lib/gmail-delivery-failure.ts#L3-L60`).

**History sync and 404.** `listHistory` pages history.list with no type filter and stores the response's own `historyId` as the next cursor (`Z/apps/server/src/lib/driver/google.ts#L83-L107`). On 404, or a 400 during a snapshot, it starts a snapshot: first it saves the mailbox's current historyId from `users.getProfile` as the new baseline, then it lists all thread ids 500 a page at backfill priority, then queues each thread for a "verify" pass (`Z/apps/server/src/routes/agent/index.ts#L751-L767`, `#L837-L838`; `getMailboxHistoryId` and `threads.list maxResults: 500` in `driver/google.ts#L152-L164`). Taking the baseline before the re-list means nothing that changes during the re-list is lost. This is the recovery inbox-zero skips.

**Label changes.** labelsAdded, labelsRemoved and messagesDeleted are applied to a local label store per message, then each touched thread's labels are refreshed (`Z/apps/server/src/routes/agent/index.ts#L772-L827`). Gmail removes INBOX implicitly when mail goes to Trash or Spam, and Zero writes that removal into its local state too "so a later restore cannot be mistaken for a local no-op" (`Z/apps/server/src/lib/mail-label-policy.ts#L26-L30`).

**Push.** Pub/Sub push JWTs are verified against Google's keys, issuer and service-account email (`Z/apps/server/src/lib/gmail-push.ts#L5-L15`). Not usable in an extension.

## 3. Spam filters: ideas Cluster can run on-device

### 3.1 Thunderbird junk filter (Bayesian, trained per user)

Source: `nsBayesianFilter.cpp` in comm-central, pinned at `https://github.com/mozilla/releases-comm-central/blob/08fc1e36cecdc5a7aa13517b43a6fb4b52526879/mailnews/extensions/bayesian-spam-filter/nsBayesianFilter.cpp` (written `TB` below).

- **Tokens.** Words of 3 to 12 characters (`TB#L59-L64`), split on space, tab, newline and "." (`#L58`). Headers are tokenised with the header name as a prefix. The Subject is tokenised (`#L478-L482`). The sender field is deliberately left out as "Too strong of an indicator" (`#L486`). Reply-To is left out too (`#L478`). X-Mailer and User-Agent are kept whole, not split (`#L488-L494`).
- **Per-token probability** with smoothing toward 0.5 for rare tokens: `prob = (0.225 + n * prob) / (0.45 + n)`, where n is how often the token was seen. Tokens closer than 0.1 to 0.5 are ignored (`#L1455-L1465`).
- **Combine.** Only the 150 tokens farthest from 0.5 are used (`kMaxTokens = 150`, `#L1481-L1491`). They are combined with Robinson-Fisher chi-squared, final score `(S - H + 1) / 2` (`#L1497-L1545`). The code says it is "similar to the Graham algorithm with some adjustments" (`#L1347`).
- **Threshold.** Junk at 0.99 by default, overridable by a pref (`#L57`, `#L1119-L1124`).
- **Training from corrections.** `SetMessageClassification(old, new)` first forgets the message's tokens under the old class, then remembers them under the new one (`#L1917-L1931`, `forgetTokens` / `rememberTokens` at `#L1848-L1860`). So a correction moves a message rather than adding a second vote. Training data can be reset (`ResetTrainingData`, `#L1945`).
- **More than two classes.** The filter is written for any number of "traits", each a pro and anti pair (`#L1333`, `#L1380-L1442`). Thunderbird itself only ships junk vs good. This is the shape Cluster would need for per-label training.

### 3.2 rspamd replies module

Source: `https://github.com/rspamd/rspamd/blob/4fca4b670f835e8305327558fd99c8ba399ab164/src/plugins/lua/replies.lua`.

When the user sends a message, its Message-ID is stored as a hash. An incoming message whose In-Reply-To matches a stored id gets the symbol `REPLY` with score −4 (a strong "not spam") (`#L32-L55`, `#L222-L245`). It also keeps, per sender, a set of the recipients that sender has written to (`#L164-L194`). The stored ids expire after 1 day by default (`expire = 86400`, `#L34`). Message-IDs of 2 characters or less are ignored (`#L51`, `#L261`).

For Cluster: a reply to a message the user sent is a person conversation by definition. Cluster can check In-Reply-To or References against Message-IDs it saw in Sent, with no extra API call if Sent headers are already indexed.

### 3.3 SpamAssassin TxRep (sender reputation)

Source: `https://github.com/apache/spamassassin/blob/60c83122137535ab64bd6dbe1709f73bae577c76/lib/Mail/SpamAssassin/Plugin/TxRep.pm`.

TxRep stores, per sender, a running total score and a message count, and pulls each new message's score toward that sender's long-term mean by `txrep_factor` (default 0.5) (`#L274-L290`). Old records are "diluted" by `txrep_dilution_factor` (default 0.98) at each new message from the sender, so recent behaviour counts more (`#L308-L318`). Keys are weighted: email address alone 3, email plus IP 10, domain 2, IP 4, HELO 0.5 (`#L800-L935`). The doc warns that an address alone "can be easily spoofed" (`#L803-L810`).

For Cluster: keep a per-sender running mean of "kept vs trashed" and "read vs not", decayed per new message. Weight address plus authenticated domain higher than display name. Cluster already has DMARC results, which play the role of TxRep's IP binding.

## 4. Gmail API facts (official docs)

| Fact | Value | Source |
|---|---|---|
| History retention | "typically available for at least one week and often longer" | https://developers.google.com/workspace/gmail/api/guides/sync |
| Expired `startHistoryId` | "the Gmail API returns an HTTP 404 error response"; the guide says to do a full sync | same |
| Full sync steps | `messages.list`, then batch `messages.get`; store the historyId of the newest message. For cached messages use `format=minimal`, "as only the labelIds might change" | same |
| Watch renewal | "at least once every 7 days"; "We recommend calling watch once per day" | https://developers.google.com/workspace/gmail/api/guides/push |
| Watch response | returns the mailbox's current `historyId` and an `expiration` | same |
| Push rate | "maximum notification rate of one event per second"; above that, notifications are dropped. Docs suggest falling back to polling `history.list` after a quiet period | same |
| Quota | 1,200,000 units per minute per project; 6,000 per minute per user per project | https://developers.google.com/workspace/gmail/api/reference/quota |
| Unit costs | getProfile 1, history.list 2, labels.list 1, messages.list 5, messages.get 20 (60 for full, raw or html), messages.modify 5, messages.batchModify 50, messages.trash 20, threads.list 10, threads.get 40 (120 full), threads.modify 10, threads.trash 20, settings.filters.create 5, watch 100, stop 50 | same |
| Batch size | "limited to 100 calls in a single batch request"; "We recommend sending batches of no more than 50 requests"; "Larger batch sizes are likely to trigger rate limiting" | https://developers.google.com/workspace/gmail/api/guides/batch |
| Batch quota | "A set of n requests batched together counts toward your usage limit as n requests, not as one request" | same |
| Concurrency | "The Gmail API enforces a per-user concurrent request limit (in addition to the per-user rate limit)", shared by all API clients on the mailbox. 429 can come from it | https://developers.google.com/workspace/gmail/api/guides/handle-errors |
| Rate-limit errors | 403 `userRateLimitExceeded` / `rateLimitExceeded`, 429 "Too many requests", 500 `backendError`: all "use exponential backoff" | same |

Zero's cost table (`Z/apps/server/src/lib/gmail-quota-cost.ts#L1-L35`) matches the quota page on every entry I checked.

Not checked: whether `batchModify` has its own id limit in the reference page (the reference for `messages.batchModify` was not fetched; Cluster's existing notes say 1,000 ids, treat as **unverified** here).

## What Cluster should take

I checked Cluster's code only enough to avoid repeating what exists. Cluster already flags replies to your own sent Message-IDs (`src/lib/correspondents.ts:67-80`, the rspamd idea), already learns a sender after two Gmail label swaps (`src/lib/learnFromMoves.ts:34-50`, `src/lib/inboxTimeLimitsRunner.ts:439-466`), and already reads Precedence, Auto-Submitted and Feedback-ID headers (`src/lib/messageKind.ts`, `src/lib/mailIndex.ts:21`).

1. **Recover from a 404 the way Zero does, not the way inbox-zero does.** On history.list 404: call `users.getProfile` (1 unit) and save its historyId as the new cursor first. Then re-list ids (`messages.list`, 5 units per 500), read only ids the index lacks, and mark the index complete. Never just jump the cursor forward like inbox-zero (`IZ/apps/web/utils/webhook/google/process-history.ts#L174-L187`), which silently drops the gap. Source: `Z/apps/server/src/routes/agent/index.ts#L751-L767`, `#L837-L838`; Gmail sync guide. Stage: **sync reliability** (fixes audit H2).

2. **Use the history.list response's own `historyId` as the next cursor**, and write the cursor monotonically (only if larger). Source: `Z/apps/server/src/lib/driver/google.ts#L83-L107`; `IZ/apps/web/utils/webhook/google/process-history.ts#L393-L416`. Stage: **sync reliability** (helps audit M1 overlap).

3. **Add a sweep guard and a time gap to learning from label swaps.** Today `tallyMoves` counts every swap it is handed. Two swaps in one Gmail history batch can teach a sender at once, and a select-all relabel teaches every sender in it. Copy inbox-zero: ignore a batch where 10 or more messages lose or gain the same Cluster label. Require the two votes to be on different messages at least 15 minutes apart. Source: `IZ/apps/web/utils/rule/record-label-removal-learning.ts#L19-L23`, `#L86-L127`, `#L147-L173`. Stage: **learning**.

4. **Keep a soft feedback record for every single correction**, not only the learned rule. Store sender, from label, to label, message id and time. Use it to show "you moved 1 of 6 from this sender" in review, and as the vote store for item 3. Source: `IZ/apps/web/utils/rule/classification-feedback.ts#L19-L136`. Stage: **learning**, **review**.

5. **Never auto-learn a sender from a thread with more than one sender.** inbox-zero skips pattern learning and spam learning when any message in the thread is from someone else ("Junking a conversation is not a claim about everyone who replied in it"). Cluster's index rows have threadId, so this is a local check. Source: `IZ/apps/web/app/api/ai/analyze-sender-pattern/route.ts#L277-L301`; `IZ/apps/web/utils/webhook/google/process-label-added-event.ts#L171-L179`. Stage: **learning**, **quick scan**.

6. **Pin "this sender always goes to label X" only when history agrees.** After a sender has 3 or more threads that all landed in one label with no correction, pin it so later mail skips the heavier checks. Any disagreement means no pin. Source: `IZ/apps/web/utils/rule/check-sender-rule-history.ts#L83-L97`; `IZ/apps/web/app/api/ai/analyze-sender-pattern/route.ts#L22`, `#L127-L203`. Stage: **full scan**, **learning**.

7. **Use Zero's header-only classifier order as a cross-check on Cluster's message kinds.** Two rules are worth copying exactly. A known contact without List-Unsubscribe or bulk Precedence stays personal. And info@ or hello@ alone is not marketing without an ESP marker (Feedback-ID or X-Campaign). Add `X-Campaign` and `X-Auto-Response-Suppress`; a grep of `src/lib` found no `x-campaign`. Source: `Z/apps/server/src/lib/imap/categorize.ts#L18-L82`. Stage: **quick scan**, **full scan**.

8. **Fail toward "keep" whenever a check cannot run.** If a sender, date or id is missing, or a prior-contact search fails, treat the sender as known. The code comment gives the cost asymmetry: a wrong block compounds, a missed one costs one email. Apply this to Screener holds and scam holds. Source: `IZ/apps/web/utils/cold-email/has-prior-contact.ts#L4-L53`. Stage: **cleanup**, **findings**.

9. **Prior-contact search: by domain for company senders, by address for free mail.** `(from:X OR to:X) before:<date>` with `maxResults: 4` costs 5 units. It answers "have we talked before" without the full index, so the quick scan can use it before the index exists. Source: `IZ/apps/web/utils/gmail/message.ts#L196-L238`; `IZ/apps/web/utils/email.ts#L325-L343`. Stage: **quick scan**.

10. **Clear a block when the user replies.** If the user sends mail to a sender Cluster has muted, held or put in Screener, turn that into an allow entry and log it. Source: `IZ/apps/web/utils/cold-email/exclude-replied-sender.ts#L11-L105`. Stage: **learning**, **sync reliability** (needs SENT in the history read).

11. **Unsubscribe suggestion rule: at least 3 mails, read rate under 20%, has an unsubscribe link, no decision yet, sorted by count.** It is small and easy to explain. Offer the "only one-click links" filter too. Source: `IZ/apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/suggestions.ts#L7-L39`. Stage: **cleanup**, **findings**.

12. **With no unsubscribe link, offer "archive future mail" (a Gmail filter) instead of a dead button.** When one-click fails, show an "Open page" action. Source: `IZ/apps/web/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks.ts#L330-L373`. Stage: **cleanup**.

13. **Grade cleanup confidence by kind.** Marketing and newsletters high, notifications and receipts medium, everything else low. Pre-select only high. Source: `IZ/apps/web/utils/bulk-archive/get-archive-candidates.ts#L18-L65`. Stage: **cleanup**.

14. **Archive and trash by thread when every INBOX message in the thread is due.** inbox-zero always uses `threads.modify` (10 units) to archive and label. Cluster should do it only when all INBOX messages in the thread qualify. Otherwise count the thread as "kept by a reply". Source: `IZ/apps/web/utils/gmail/label.ts#L130-L184`; quota page. Stage: **cleanup**, **sync reliability** (fixes audit H5).

15. **Budget Gmail units with priorities, like Zero.** Plan at 80% of 6,000 units a minute (4,800). Give user clicks 100% of that, background sync 90%, first-read backfill 70%. Use a rolling window and wait until the oldest bucket rolls off. Cap concurrent requests at 4 to 8. Cluster has `src/lib/gmailQuotaLedger.ts`; check it against these numbers (not read). Source: `Z/apps/server/src/lib/gmail-quota-store.ts#L3-L97`, `#L165-L166`. Stage: **full scan**, **sync reliability** (helps audit M2).

16. **Batch at 25 to 50, retry only failed items, and drop to 10 per batch after a rate limit.** Google says no more than 50 and counts each item. Backoff: honour Retry-After, else 1 s doubling to 10 s. Use a longer floor for repeated 429s (Zero starts at 60 s and caps at 1 h). Treat 401 and `invalid_grant` as "sign in again", not as a retry. Sources: `IZ/apps/web/utils/gmail/batch-with-retry.ts#L8-L14`, `#L95-L160`; `IZ/apps/web/utils/gmail/retry.ts#L159-L258`; `Z/apps/server/src/lib/gmail-delivery-failure.ts#L27-L60`; Gmail batch guide. Stage: **full scan**, **sync reliability** (helps audit M3).

17. **Onboarding: show 5 real senders and the last 20 labelled emails, and say "Nothing was archived."** inbox-zero's first real-data screen is a pre-checked list of 5 rarely-read senders from the last 90 days, with Skip. Its last screen lists the 20 newest emails with the labels it gave them. Source: `IZ/apps/web/app/(app)/[emailAccountId]/onboarding/StepBulkUnsubscribe.tsx#L31-L81`, `#L195-L258`; `StepInboxProcessed.tsx#L100-L109`; `IZ/apps/web/utils/config.ts#L36`. Stage: **setup**, **quick scan**, **review**.

18. **Optional, later: a small on-device Bayesian scorer per Cluster label**, trained only from user corrections. Use Thunderbird's recipe. Tokens are subject and selected header words of 3 to 12 characters. Smooth with `(0.225 + n p) / (0.45 + n)`, keep the top 150 tokens, and combine with Fisher. On a correction, forget the tokens under the old label and remember them under the new one. Leave the sender out as a token, since Cluster already learns senders directly. Source: `TB#L58-L64`, `#L486`, `#L1455-L1545`, `#L1917-L1931`. Stage: **learning**. Risk: storage and the 8 KB sync limit (audit H3), so keep it in `chrome.storage.local`.

19. **Optional: a decayed reputation per sender.** Keep a running mean of kept vs trashed and read vs unread per sender. Multiply old weight by 0.98 at each new message. Weight address plus DMARC-aligned domain above address alone. Source: SpamAssassin TxRep `#L275-L318`, `#L800-L935`. Stage: **findings**, **cleanup**.

20. **Add two exclusions to Cluster's kind rules.** Marketing must not include mail whose main purpose is account access, a transaction or a service update. Notification must not include something a person wrote. Source: `IZ/apps/web/utils/rule/consts.ts#L106-L146`. Stage: **quick scan**, **full scan**.

## Dead ends and gaps

- inbox-zero's `ResubscribeDialog.tsx`, the internals of `BulkArchive.tsx`, and the Pub/Sub webhook route body were not read in full.
- I found no in-app Undo for inbox-zero's bulk archive or delete in the files read. **Unverified** that none exists.
- Zero's AI labelling workflow (`apps/server/src/thread-workflow-utils/`) was not read. Only its header classifier and sync were.
- rspamd's Bayes and neural modules and SpamAssassin's bulk rules were not read. Only `replies.lua` and TxRep.
- Cluster's `gmailQuotaLedger.ts`, `httpRetry.ts` and `engagementModel.ts` were not read, so items 15, 16 and 19 may overlap with what exists.
