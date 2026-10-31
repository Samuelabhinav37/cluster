# Algorithms and Gmail functions for the redesign, 2026-10-31

This covers how each section's numbers are computed, which Gmail functions do the work, and what is new versus what already exists.
It goes with `research/2026-10-31-sections-research.md` (what to build) and `research/2026-10-31-sections-uiux.md` (how it looks).

---

## A. Gmail functions: what we use, what we add, what we can't

### Already used
| Function | Cost (units) | Used for |
|---|---|---|
| `messages.list` | 5 | Scans, plus the 2-day tagger |
| `messages.get` (metadata) | 5 (we budget 20) | Headers into the local index |
| `history.list` | 2 | Incremental sync (`incrementalSync.ts`, `mailSync.ts`) |
| `messages.batchModify` | 50 | Trash, archive, label, undo (`gmailApi.ts` 497-613) |
| `labels.*` | 1-5 | Cluster labels and colors |
| `settings.filters` | | Category filters (`categoryFilters.ts`) |
| One-click unsubscribe POST | | `fireOneClickUnsubscribe` |

Per-user quota: Google's page has shown both 15,000 and 6,000 units per minute per user. The lower figure is the safe one to plan around. A newer snapshot also mentions billing above the limits later in 2026 ([Google quota](https://developers.google.com/gmail/api/reference/quota), [Unipile](https://www.unipile.com/gmail-api-limits/)). Plan for 6,000.

### To add
1. **Exact counts from `labels.get`.**
   - Each label carries `messagesTotal`, `messagesUnread`, `threadsTotal` and `threadsUnread` ([label resource](https://googleapis.dev/nodejs/googleapis/latest/gmail/interfaces/Schema$Label.html)).
   - Organize's counts, and Home's inbox unread (label `INBOX`), become Gmail's own numbers. They can't drift from what Gmail shows.
   - Cost: 11 labels plus INBOX is about 60 units, read when the screen opens.
2. **Gmail filters for rules that act on arrival.**
   - Criteria: from, to, subject, query, negatedQuery, hasAttachment, size.
   - Actions: one user label per filter, plus system label changes. `removeLabelIds:["INBOX"]` skips the inbox, `UNREAD` marks read, `addLabelIds:["TRASH"]` deletes, `STARRED`, `IMPORTANT`, and never-spam ([Gmail filter guide](https://developers.google.com/workspace/gmail/api/guides/filter_settings?hl=ja)).
   - Filters run inside Gmail, so they work with Chrome closed. That is the main "seamless" win.
   - Limit: about 1,000 filters per user. This comes from a third-party page, not Google ([withone](https://www.withone.ai/knowledge/gmail/conn_mod_def%3A%3AGJ3ogSsF48E%3A%3A1HDxsOsIStOvuFtv9KZA1Q/md)). Rules are capped at 100 in Cluster to stay far below it.
3. **Exact preview of a rule.**
   - A filter's criteria use the same syntax as a Gmail search. So `messages.list?q=<the same criteria>` shows exactly the emails the rule will catch now.
   - "Also apply to N emails already here" is that list, followed by `batchModify`.
4. **"Open in Gmail".**
   - Every email row links to `https://mail.google.com/mail/u/0/#search/rfc822msgid:<Message-ID>`. The Message-ID header is already in the index.
   - This works without converting Gmail's internal thread IDs.
5. **Refresh right before acting.**
   - Call `history.list` from the stored cursor (2 units) just before any bulk action.
   - Then run `filterOutProtected` on the fresh rows. Mail starred or replied to a minute ago is never touched.

### What Gmail can't do, and the workaround
| Missing | Workaround |
|---|---|
| Push notifications (`watch`), which need a Pub/Sub server | Poll `history.list` every 5 minutes in the background, plus once when the dashboard opens. 2 units each. |
| Time-based filters ("trash codes after 2 days"), since filters only act on arrival | Cluster's 5-minute background run (`runInboxTimeLimits`). The UI says these need Chrome open. |
| API access to Gmail's Manage subscriptions or Snooze | We build our own from the index. |
| Rule order and exceptions | One "not" value per rule (`negatedQuery`). |
| Unsubscribe without one-click | `mailto` sends an email. A web-page link opens in a tab. Gmail requires one-click POST for senders of more than 5,000 a day since 2024 ([Mailgun](https://www.mailgun.com/blog/deliverability/what-is-rfc-8058/), [Suped](https://www.suped.com/email-deliverability/answers/who-supports-one-click-unsubscribe-and-what-are-the-gmail-one-click-unsubscribe-requirements-and)), so most big lists support it. |

---

## B. Clean up

**Problem today**
- "Past its date" counts newsletters older than 30 days (`RETENTION_DAYS` = otp 2, newsletter 30, social 30).
- Never opened counts senders you don't open.
- So one email can sit in both cards, and the totals overlap. That's why the card showed "Newsletters 133".

**Rule: every email belongs to at most one card, so the numbers add up.**
1. **Lists you can leave** (counted in *lists*, not emails). A sender qualifies when all of these hold:
   - It has a `List-Unsubscribe` header.
   - Its kind isn't receipt, shipping or code.
   - It isn't protected.
   - `openRate < 0.25` with at least 5 judged emails, or it sends ≥ 8 a month with `openRate < 0.5`.
   - Action: Unsubscribe (one-click when possible), then offer to trash what they already sent.
2. **You never open these** (emails): every email from a sender with `openRate < 0.1` and `judged ≥ 5`. This matches the existing `"ignored"` rule in `senderProfile.ts:266`. Action: Trash.
3. **Old codes and news** (emails): age-based mail that isn't already in card 2.
   - codes older than 2 days
   - social alerts older than 30 days
   - newsletters you *do* open, older than 30 days
   - Receipts and shipping never qualify (unchanged policy). Action: Trash.

**Heading change.** "Old codes and deliveries" from the last plan was wrong, because deliveries are deliberately never suggested. The new heading is **"Old codes and news"**.

**Accuracy**
- "Opened" means the UNREAD label is gone. Two things inflate it: "mark all as read" and the preview pane. That's why we judge only mail older than the grace period (`OPEN_GRACE_MS`, which already exists) and require at least 5 judged emails.
- People who mark everything read look like they open everything. Cluster then simply suggests less, which is the safe direction.
- Learning: `suggestionModel.acceptChance` already ranks by what the user accepted or undid. Keep it.

**Speed**
- Cards render from the local index with no network call.
- Acting costs one `history.list` plus one `batchModify` per 1,000 IDs.

**"Do this automatically" switches**
- Arrival-based ones become Gmail filters: "skip the inbox for lists you never open" (from:A OR from:B → remove INBOX).
- Time-based ones stay in the background run.

## C. Contacts (People / Companies / Subscriptions)

**People**
- `isPerson` stays the base rule.
- Free-mail list grows to about 60 domains.
- School domains: `.edu`, `.edu.xx`, `.ac.xx`.
- Role names never count: `^(no-?reply|do-?not-?reply|support|help|info|hello|hi|team|billing|accounts?|notifications?|alerts?|news|newsletter|updates|marketing|sales|admin|service|orders?|receipts?)@`.
- "You reply" comes from the sent index, which already exists.

**Subscriptions**

How often they send comes from `usualGap`, the median gap that already exists:

| Gap | Label |
|---|---|
| < 2 days | Daily |
| < 10 days | Weekly |
| < 45 days | Monthly |
| Anything else | Now and then |

- **"You pay"** is shown when the same company also sends receipts. `purchaseIds` already exists. This is the Rocket Money split between bills you pay and free lists.
- **Moving** a row between groups writes `personOverride` or a new `groupOverride`, which sticks.

## D. Organize

**Counts** come from `labels.get` (see A1). They show in the row as a muted number.

**Rules**

Stored shape:
```ts
interface Rule {
  id: string;
  when: { from?: string; to?: string; subject?: string; words?: string; not?: string; hasAttachment?: boolean };
  then: { label?: string; skipInbox?: boolean; markRead?: boolean; star?: boolean; trash?: boolean };
  filterId?: string;
}
```

How each rule turns into a Gmail filter:

| Rule field | Gmail filter field |
|---|---|
| `from`, `to`, `subject`, `hasAttachment` | Same name |
| `words` | `query` |
| `not` | `negatedQuery` |
| `label` | `addLabelIds` |
| `skipInbox` | `removeLabelIds: INBOX` |
| `markRead` | `removeLabelIds: UNREAD` |
| `star` | `STARRED` |
| `trash` | `TRASH` |

- **Sync** reuses `syncCategoryFilters`' fingerprint idea, so editing a rule replaces its filter.
- **Preview:**
  - `messages.list?q=` built from the same fields gives a live count (`resultSizeEstimate`) and the first 50 emails in Details.
  - We pause until typing stops for 400 ms, so typing doesn't spend quota: about 5 units per preview.
- **Starter rules:** pick the top 3 companies by volume that have no label yet, and propose "From X → their category label".

## E. Protect

The pipeline today is `threatSignals.ts`, then `verdict.ts`, which is already well structured. New signals:
1. **Name matches someone you know.**
   - The display name, normalized (lowercase, no accents, no punctuation), equals the name of someone in the sent index.
   - The address and the domain are both different.
   - Weight 3, medium confidence.
   - This mirrors Brown's banner rule from the earlier research.
2. **First contact.**
   - No earlier email from this address and none sent to it.
   - Weight 1, and it can't hold anything on its own (same rule as `lure-language`).

**Check before turning them on**
- Run the existing protect test fixtures plus new labeled cases.
- Target: no new holds on the fixture's real people (Alex Chen, Mom) or on certified companies.

**Scams per week**
- `scamHistory.ts` already keeps weekly counts. The page reads 8 weeks.

**Warning signs page**
- Group held and warned emails by `Reason.kind`, the strongest first.

**Duplicate list fix.** Doesn't match and High priority become one list of emails with `tier !== "none"`, sorted by score.

## F. Home

| Tile | Source |
|---|---|
| **Inbox** | `labels.get INBOX`. Store one `{date, unread, total}` snapshot per day locally (about 60 rows kept). The 7-day bar and "from last week" come from those snapshots. |
| **Clean up** | The sum of section B's cards, the same function, so the numbers always match. |
| **Security** | This week's held count from `scamHistory`, plus warnings. |

## G. Kai: answer or route, and learn locally

**Matching**
- A small BM25 score over each intent's phrases.
- `kaiGuide.ts` has the intents. Each gets 5-10 example phrasings and synonyms (trash = delete, remove; label = folder, tag).
- No new library: BM25 is about 40 lines.

**Learning, on this computer only**
- When the user picks an answer, add 1 to `clicks[token][intent]` for each word of the question.
- Halve all counts every 60 days.
- Final score = BM25 + 0.5 × log(1 + Σ clicks).
- Questions with no answer (score below a set cutoff) are saved, up to 50, to `chrome.storage.local`. The user can see and clear them in Settings.
- No question text leaves the device.

**Routing**
- Each intent has `{ screen, targetSelector }`. "Take me there" shows that screen and pulses the target.

**Tests:** a table of 40 typed questions, each with its expected intent. The test fails if top-1 accuracy drops below 90%.

## H. Search and Details

**Local search**
- An in-memory list of senders and companies (name, address, domain) plus email subjects from the index, built once per load.
- Match on word prefixes, ranked by volume, grouped as Companies, People, Emails.
- Fast enough for tens of thousands of rows without a library.

**Mail outside the index window.** The last result row is "Search all of Gmail for '…'", which runs `messages.list?q=` and shows the results in Details.

**Chips** map straight to Gmail search terms (`is:unread`, `older_than:1y`, `larger:2M`, `category:promotions`), so local search and Gmail search agree.

## I. Settings: editable shortcuts

**Stored shape:** `settings.keymap: Record<ActionId, string>`, where a value is either `"/"` or a sequence like `"g h"`.

**Recording a key:** the next keydown, ignoring keys pressed alone such as Shift or Ctrl.

**Clashes:** any other action with the same value is flagged, and the rows of both actions are marked.

**Single-key switch:** when it's off, only shortcuts that use Ctrl or Alt work (WCAG 2.1.4).

**Defaults**

| Key | Action |
|---|---|
| `/` | search |
| `Ctrl+K` | Kai |
| `g` then `h` / `s` / `c` / `o` / `p` | go to Home, Contacts (was Senders, keeps `s`), Clean up, Organize, Protect |
| `?` | list all shortcuts |
| `Esc` | close |
