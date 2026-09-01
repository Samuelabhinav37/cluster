# Cluster — inbox auto-sorting, label naming, and "make it nice" UX

_2026-08-31. Companion to `research/2026-08-29-competitive-and-security-review.md` (read that first for
the competitive landscape and Cluster's shape). This doc is narrower: (1) how the incumbents actually
categorise mail and what they **name** the folders/labels, (2) the Gmail/Graph API facts that
constrain the design, (3) whether the `Cluster/` label prefix should stay, (4) concrete UX upgrades
for "Sort my inbox". Every mechanism/naming claim is cited to a first-party source; anything
inferred or secondary is marked **[inferred]** / **[secondary]**._

---

## Executive summary

**1. Drop the *nested* `Cluster/` prefix, but keep a namespace — as a flat, user-editable prefix
plus a shared colour, not a parent folder.** Nesting (`Cluster/Shopping`) is what produces the
collapsible "Cluster" parent node the user dislikes. But a bare `Shopping` / `Promotions` label is a
real problem: Cluster's `getOrCreateLabel` matches by name, so a flat `Shopping` **silently merges
into the user's own existing "Shopping" label**, and `Promotions` / `Updates` / `Social` / `Forums`
collide conceptually with Gmail's category *tabs* of the same name (they are different objects —
`label:promotions` ≠ `category:promotions` — which is genuinely confusing). Recommended default:
flat labels with a short prefix the user picks in onboarding (default `Cluster · Shopping` with a
middle dot, or an emoji like `📥 Shopping`), **all painted one Gmail label colour / one Outlook
category colour** so they read as a group and can be found and bulk-removed in one place without
nesting. Offer three modes in settings — `Nested (Cluster/Shopping)` · `Prefixed flat (Cluster ·
Shopping)` · `Plain names (Shopping)` — and on the plain-names mode, detect an existing same-named
user label and ask "reuse your **Shopping** label, or make **Shopping (Cluster)**?". Never emit a
label literally named `Promotions`/`Updates`/`Social`/`Forums`; use `Deals`, `Newsletters`, etc.
Rename `Productivity` etc. buckets are already friendly; make `SORT_BUCKET_LABELS` user-overridable.

**2. Add a non-destructive preview before the first sort, and a "what got filed" digest with one
undo, after.** This is the single biggest "nice" upgrade and it costs nothing in the privacy model —
`buildSortPlan` already produces the exact per-bucket message-id lists. Superhuman shows a live
match-preview pane; Notion Mail shows a sample-confirmation ("check the ones that fit, cross out the
ones that don't") *before* it ever applies a label. Cluster should show the plan grouped by bucket
with expandable sender rows and per-sender / per-message opt-out, then after applying, a summary
("Filed 213 messages — 88 Newsletters, 60 Shopping, …") that is one reversible action in *Recently
done*.

**3. For "keep it sorted", push a real Gmail filter / Outlook inbox rule per stable bucket instead of
relying only on the 6-hour client alarm.** Gmail `Users.settings.filters` (criteria: `from`, `to`,
`subject`, `query`, `hasAttachment`, `size`; actions: add/remove label ids; 1,000-filter cap) and
Graph `messageRules` on the Inbox (conditions incl. `senderContains`, `subjectContains`,
`headerContains`; actions `moveToFolder`, `assignCategories`, `markAsRead`, `stopProcessingRules`)
are both **header/query-only, server-side, zero-body** — a perfect fit for Cluster's stance. A
domain-category bucket becomes one filter (`from:(amazon.com OR walmart.com OR …) → apply label,
skip Inbox`). Benefits: sorting continues with the browser closed, applies at delivery instead of up
to 6h late, and the filters are visible and removable by the user in Gmail/Outlook settings (good
for trust). Keep the client-side pass for the one-time backlog and for the subject-regex buckets
that a filter can't express well. This also starts closing the "Outlook is second-class" gap.

**4. Learn from corrections with a local per-sender override map, and seed onboarding from the
user's existing labels/filters.** Every competitor that people call "smart" (SaneBox, Spark, Notion
Mail, Gmail categories) is really just *"we remember when you moved this sender's mail somewhere
else."* Cluster can do the metadata-only version: a local `Map<sender|domain, bucket|"never">` that
`classifySortBucket` consults first, populated from an explicit "wrong bucket? fix it" control in
the digest/preview. And on first run, read `Users.labels.list` + `Users.settings.filters.list`
(both metadata) so Cluster can say "you already file `@stripe.com` yourself — leave those alone?"
and reuse an existing `Shopping` label instead of creating its own.

---

## A. How competitors auto-categorise mail (mechanism)

| Product | Signal | Where it runs | Body read? | Learns per-user? |
|---|---|---|---|---|
| **SaneBox** | Headers only (sender, subject, etc.) + your actions (which folder you drag mail to; moving back to Inbox retrains). Analyses 4–6 weeks of history on setup. | Server-side service, IMAP IDLE against your provider | No (states "based on headers (sender, subject, etc.)") | Yes — core of the product |
| **Clean Email** | Rules + curated sender/type parameters ("Automated messages", "Finance", "Top senders"). "Smart Folders" are computed views. | Server-side (web app + apps), provider API/IMAP | Not stated for Smart Folders; Auto Clean matches "almost any criteria" | Weak — mostly static rules you configure |
| **Gmail categories / tabs** | Google's classifier → `CATEGORY_PERSONAL/SOCIAL/PROMOTIONS/UPDATES/FORUMS`; drag-to-retrain. Mechanism undocumented (ML **[inferred]**). | Server-side (Google) | Yes **[inferred]** | Yes — "over time this helps Gmail learn your preferences" |
| **Outlook Focused Inbox / Sweep / Categories** | Focused Inbox = Microsoft classifier + your move-to-Focused/Other signals. Sweep = bulk rule on a sender. Categories = user-defined coloured tags. | Server-side (Exchange Online) | Yes **[inferred]** for Focused | Yes for Focused Inbox |
| **Superhuman Split Inbox / Auto Labels** | "Superhuman AI … based on content, subject, sender, and recipients." Built-ins: `Marketing`, `Pitch`, `Social`, `News`. Custom labels via a plain-English AI prompt. Applies to new mail + last 14 days. | Server-side; "custom instructions" sent to AI subprocessors, "never email data" logged | Yes — content is a signal | Not at launch — "you can't edit the prompts"; make a new one instead |
| **Shortwave AI labels / bundles** | Plain-English AI filters that "automatically label, star, archive"; built-ins like `Marketing`, `Social`. Multi-LLM pipeline (GPT-4, Claude) **[secondary]**. | Server-side | Yes | Via re-prompting; also RAG over your mail **[secondary]** |
| **Spark Smart Inbox / Gatekeeper** | Smart Inbox buckets: `Personal`, `Newsletters`, `Notifications`; "learns from your behavior." Gatekeeper = accept/block first-time senders (paid). | Server-side (Readdle) | Not stated | Yes — "the more you use it, the better it becomes" |
| **Leave Me Alone** | Header/metadata to find `List-Unsubscribe`; falls back to scraping the body **only when you click unsubscribe**. Never stores body. | Server-side | Only on unsubscribe action | No (not a classifier) |
| **Mailstrom** | Header/metadata only — sender, subject, date, size, mailing-list membership. **"does not use AI to guess."** Dynamic bundles you act on in bulk. | Server-side | No — "never reads the body content" | No — deliberate manual control |
| **Notion Mail auto-labeling** | Notion AI on email **content**; also "label emails from specific domains" and "who's important to you." Sample-confirmation before applying. Learns from manual tag/untag. | Server-side | Yes | Yes — "you're teaching the system" |

**Does anyone do purely metadata/header classification like Cluster?** Yes, and it is the norm at the
privacy end: **SaneBox** ("based on headers (sender, subject, etc.)"), **Mailstrom** ("accesses only
your email headers and metadata … never reads the body"), and **Leave Me Alone** (metadata first,
body only on an explicit unsubscribe click). SaneBox's headers-only classifier is reported by SaneBox
to reach "95–98% accuracy during its initial learning phase" **[secondary — SaneBox marketing/review
copy, not a primary metric]**. The differentiator for all three is not the signal richness — it is
the **per-user learning loop layered on top of the metadata** (SaneBox retrains on every drag).
Cluster's subject-regex + curated-domain approach with **no learning loop** is the thin version of
this; adding the loop (recommendation 4) is what would make it feel "smart" without touching bodies.

Citations:
- SaneBox mechanism / headers-only / IMAP / retraining / 4–6 weeks: https://www.sanebox.com/help/155-how-does-sanebox-work , https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox , https://www.sanebox.com/help/138-beyond-sanelater-more-sane-folder-choices
- Clean Email Smart Folders are computed views, examples: https://clean.email/help/basics/smart-folders ; Auto Clean "almost any action / any criteria": https://clean.email/help/tools/auto-clean
- Gmail categories, drag-to-retrain, "helps Gmail learn": https://support.google.com/mail/answer/3094499 ; category label ids: https://developers.google.com/workspace/gmail/api/guides/labels
- Superhuman Auto Labels names / AI / content-subject-sender-recipients / 14 days / can't edit prompts: https://superhuman.com/ai , https://blog.superhuman.com/superhuman-ai-feature-showcase/ (help-center articles `help.superhuman.com/.../Auto-Labels` and `/Organize-with-AI` return HTTP 403 to automated fetch — **couldn't verify directly**, see open questions)
- Superhuman "custom instructions to AI subprocessors (never email data)": https://superhuman.com/ai
- Shortwave AI assistant / multi-LLM pipeline: https://www.shortwave.com/docs/guides/ai-assistant/ ; label/bundle specifics: **[secondary]** https://zapier.com/blog/shortwave-vs-superhuman/
- Spark Smart Inbox categories + learning + Gatekeeper: https://sparkmailapp.com/features/smart_inbox , https://support.readdle.com/spark/personalization/customize-your-smart-inbox
- Leave Me Alone metadata-first / no body storage: https://help.leavemealone.com/en/unsubscriber/what-happens-after-i-click-unsubscribe , https://leavemealone.com/security/
- Mailstrom headers-only / no AI / bundles / bulk actions: https://mailstrom.co/ , https://mailstrom.co/faq
- Notion Mail auto-labeling on content + domains + important people, learns from corrections, sample-confirm: https://www.notion.com/help/guides/organize-your-inbox-with-notion-ai-auto-labeling

---

## B. What competitors NAME the folders/labels (exact strings)

### SaneBox — flat, `@`-prefixed, user-toggled, not a slash namespace
First-party folder names: **`@SaneLater`**, **`@SaneNews`**, **`@SaneBlackHole`**, **`@SaneCC`**,
plus snooze folders **`@SaneTomorrow`**, **`@SaneNextWeek`** (and user-created custom training
folders). The `@` is a deliberate sort hack — it floats the folders to the top of an
alphabetically-ordered IMAP folder list. They are **flat top-level folders, not nested under a
"Sane" parent**. The user chooses which are active on the SaneBox *Folders* page (activation lag
5–30 min). Docs do not offer renaming. On Gmail these appear as labels/folders like any IMAP folder.
- https://www.sanebox.com/help/138-beyond-sanelater-more-sane-folder-choices
- https://www.sanebox.com/help/224-sanenews-what-do-i-do-with-my-sanenews-folder
- https://www.sanebox.com/help/235-saneblackhole-what-do-i-do-with-my-saneblackhole-folder
- https://www.sanebox.com/help/203-what-is-sanecc

### Gmail categories — system label ids, not user-creatable, name ≠ id
Ids: **`CATEGORY_PERSONAL`**, **`CATEGORY_SOCIAL`**, **`CATEGORY_PROMOTIONS`**, **`CATEGORY_UPDATES`**,
**`CATEGORY_FORUMS`**; `type: "system"`. They map to the Primary/Social/Promotions/Updates/Forums
tabs and "can be manually applied." Removing `CATEGORY_PROMOTIONS` from a message moves it to Primary
(a side-effect, not a plain label removal). Users **cannot create custom categories** ("you can use
labels" instead). So the user-visible word "Promotions" is the *tab*; the API object is
`CATEGORY_PROMOTIONS`. A user label named `Promotions` is a **separate object** — this is the
collision to avoid.
- https://developers.google.com/workspace/gmail/api/guides/labels
- https://support.google.com/mail/answer/3094499

### Gmail user labels — `/` nests, name-unique, colours from a fixed palette
- `type: "user"`, generated ids (`Label_123`); the `name` field is the display string.
- Nesting: Gmail's *Create label* UI has a "Nest label under" option, which stores the name as
  `Parent/Child`; the `/` convention is a Gmail UI / IMAP behaviour, **the API reference page does
  not itself document `/` semantics** — it just stores whatever `name` you send. (So `Cluster/Shopping`
  via the API renders as a nested label in Gmail.)
  https://support.google.com/mail/answer/118708 , https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels
- Cannot reuse a **SYSTEM** label name → `HTTP 400 - Invalid label name`. The guide says this about
  SYSTEM labels generally; it does **not** explicitly say whether `Promotions` (a category's
  human name, distinct from the id `CATEGORY_PROMOTIONS`) is rejected — **unverified, needs a live
  create test** (open question).
  https://developers.google.com/workspace/gmail/api/guides/labels
- `labelListVisibility`: `labelShow` | `labelShowIfUnread` | `labelHide`. `messageListVisibility`:
  `show` | `hide`. `color`: `{ textColor, backgroundColor }`, **user labels only**, hex values from a
  fixed palette (~80 combos in the API; Gmail UI says "up to 100 custom colors").
  https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels , https://support.google.com/mail/answer/118708
- Label count limit: **discrepancy** — Google support says "up to 5,000 labels"
  (https://support.google.com/mail/answer/118708); the REST reference text returned "maximum number
  of labels … is 10,000". Moot for Cluster (~10–12 labels) but flag it.

### Outlook — Categories (flat, coloured) vs folders (nestable)
- **Categories** (`outlookCategory`, master list at `/me/outlook/masterCategories`): `displayName`
  (unique, **immutable after creation**) + `color` = a preset constant `None`, `preset0`…`preset24`
  (Red, Orange, Brown, … DarkCranberry). **Max 25 colours** mapped across the master list. Categories
  are **flat** — no nesting — and are applied by writing the `displayName` string into a message's
  `categories` array. https://learn.microsoft.com/en-us/graph/api/resources/outlookcategory?view=graph-rest-1.0
- **Folders** (`mailFolder`): create under root or under `childFolders` (nestable); well-known names
  `inbox`, `archive`, `junkemail`, `clutter`, `deleteditems`, `drafts`, `sentitems`, etc.; `isHidden`
  settable once at creation. https://learn.microsoft.com/en-us/graph/api/resources/mailfolder?view=graph-rest-1.0
- **Sweep** is a UI feature (bulk rule on one sender); programmatically the equivalent is a
  `messageRule` — see §C.

### Superhuman / Shortwave / Spark / Clean Email / Notion Mail — what the auto-labels are called
- **Superhuman** built-in Auto Labels: **`Marketing`**, **`Pitch`**, **`News`**, **`Social`**
  (marketing / cold pitches / social-network updates), routed to the **`Other`** split by default;
  custom ones are whatever you name your prompt ("job applications"). Whether these are written back
  as Gmail labels: Superhuman's Split Inbox is historically implemented on Gmail labels **[inferred;
  first-party help article inaccessible]**. https://superhuman.com/ai , https://blog.superhuman.com/superhuman-ai-feature-showcase/
- **Shortwave**: AI labels such as **`Marketing`**, **`Social`**; Shortwave is a Gmail client and
  uses Gmail labels natively. Mechanism/name detail **[secondary]**. https://www.shortwave.com/
- **Spark Smart Inbox**: **`Personal`**, **`Newsletters`**, **`Notifications`** — in-app groupings,
  not mailbox labels. https://sparkmailapp.com/features/smart_inbox
- **Clean Email Smart Folders**: **`Top senders`**, **`Automated messages`**, **`Finance`**,
  **`Misc notifications`**, **`You are CC-ed`**, … — **app-only computed views, not labels/folders in
  the mailbox**. Actual labels/folders are created only when *you* run a Move/Label action or an Auto
  Clean rule with a label action. https://clean.email/help/basics/smart-folders
- **Notion Mail**: auto-labels create **Notion Mail views** in the sidebar; content is analysed and
  the user confirms a sample first. In-app, not Gmail labels. https://www.notion.com/help/guides/organize-your-inbox-with-notion-ai-auto-labeling

### Is a nested `Prefix/Name` label common, or an anti-pattern?

**It's a legitimate Gmail-native pattern but the wrong tool for a namespace.** Findings:

- **Nobody in this set uses slash-nesting as a namespace.** SaneBox uses a **prefix** (`Sane*`) but
  keeps folders **flat** and pins them with `@`. Superhuman / Shortwave / Spark / Notion / Gmail
  categories all use **flat, single-word** names and rely on the *app UI* (a split, a sidebar view,
  a tab) to group them — not folder hierarchy.
- **The argument for a namespace is real and worth keeping**: (a) *findability* — the user can see at
  a glance which labels the tool made; (b) *bulk removal / clean uninstall* — "delete everything the
  extension created" is one obvious gesture; (c) *provenance / trust* — "these are Cluster's, your
  own labels are untouched." This is exactly why SaneBox prefixes.
- **The argument for flat names**: cleaner sidebar, no parent node, reads like the user's own labels.
- **The cost of flat *plain* names specifically**: collision. Cluster's `getOrCreateLabel` resolves
  by name, so a flat `Shopping` will **attach to the user's pre-existing `Shopping` label** and mix
  Cluster-filed mail into it irreversibly-by-name. And `Promotions`/`Updates`/`Social`/`Forums`
  duplicate the words Gmail uses for category tabs, so the user now has two unrelated "Promotions"
  things and `label:promotions` vs `category:promotions` behave differently.

**Recommendation (the label-naming answer):** keep a namespace, drop the nesting.
1. Default to **flat + short prefix**: `Cluster · Shopping` (middle dot U+00B7) or an emoji tag
   `📥 Shopping`. Flat in the sidebar, still greppable, still one-gesture removable, no parent node.
2. **Colour every Cluster-made label identically** (one Gmail `color` pair; one Outlook `preset`),
   so they're visually a group regardless of name — this is the findability win without hierarchy.
3. Settings toggle: `Nested (Cluster/Shopping)` · `Prefixed flat (Cluster · Shopping)` · `Plain
   names (Shopping)`, defaulting to prefixed-flat. On *Plain names*, before creating, check
   `Users.labels.list` for a same-named user label and prompt: reuse it, or create `Shopping
   (Cluster)`.
4. **Never** emit `Promotions` / `Updates` / `Social` / `Forums` as label names — use `Deals`,
   `Newsletters`, `Social updates`, `Forums & groups` (or keep the current friendly
   `SORT_BUCKET_LABELS` strings, which already avoid this except `Social`).
5. Make `SORT_BUCKET_LABELS` and the prefix **user-editable** (Superhuman/Notion/SaneBox all let you
   name your own buckets).

---

## C. Gmail / Outlook API facts that constrain the design

### Gmail `Users.labels`
| Fact | Value | Source |
|---|---|---|
| Label `type` | `"system"` (Gmail-created, e.g. `INBOX`, `SPAM`, `TRASH`, `UNREAD`, `STARRED`, `IMPORTANT`, `SENT`, `DRAFT`, `CATEGORY_*`) vs `"user"` (app/user-created, ids like `Label_123`) | https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels , https://developers.google.com/workspace/gmail/api/guides/labels |
| Category label ids | `CATEGORY_PERSONAL`, `CATEGORY_SOCIAL`, `CATEGORY_PROMOTIONS`, `CATEGORY_UPDATES`, `CATEGORY_FORUMS` — system, manually appl-able, map to tabs; removing `CATEGORY_PROMOTIONS` moves msg to Primary | labels guide (above) |
| Can a user label share a name with a category? | System label **names** are reserved → `HTTP 400 Invalid label name`. Whether the *word* `Promotions` (vs id `CATEGORY_PROMOTIONS`) is treated as reserved is **not stated — needs a live test** | labels guide (above) |
| `/` nesting | Gmail UI "Nest label under" stores `Parent/Child`; renders nested. API stores the `name` verbatim — `/` semantics are a UI/IMAP convention, not spelled out in the API reference | https://support.google.com/mail/answer/118708 |
| `labelListVisibility` | `labelShow` \| `labelShowIfUnread` \| `labelHide` | users.labels reference |
| `messageListVisibility` | `show` \| `hide` | users.labels reference |
| Label colour | `color: { textColor, backgroundColor }`, **`type:user` only**, hex from a fixed palette (~80 combos API-side; Gmail UI "up to 100 custom colors") | users.labels reference , https://support.google.com/mail/answer/118708 |
| Max labels | Google support: **5,000**. REST reference text as fetched: 10,000. **Discrepancy — flag.** Cluster needs ~12, so moot | https://support.google.com/mail/answer/118708 |

### Gmail `Users.settings.filters` (server-side "keep sorting")
- **Criteria**: `from`, `to` (incl. cc/bcc), `subject` (case-insensitive phrase), `query` (full Gmail
  search syntax), `negatedQuery`, `hasAttachment`, `excludeChats`, `size`, `sizeComparison`
  (`smaller`/`larger`). **No body-content criterion beyond what `query` can express** (and `query`
  can search body text — so a filter *can* reach into bodies if you write `query:"..."`; Cluster
  would simply not do that).
- **Actions**: `addLabelIds[]`, `removeLabelIds[]`, `forward` (to a pre-verified address). That's
  the whole list.
- **Everything else is done via label add/remove** and is **not spelled out in the reference**
  **[inferred from the Gmail label model]**: archive = `removeLabelIds:["INBOX"]`; mark read =
  `removeLabelIds:["UNREAD"]`; star = `addLabelIds:["STARRED"]`; mark important =
  `addLabelIds:["IMPORTANT"]`; trash = `addLabelIds:["TRASH"]`; keep out of a category tab =
  `removeLabelIds:["CATEGORY_PROMOTIONS"]`.
- **Limit: 1,000 filters per account** (stated on the `filters.create` method page).
- Filters act on **incoming mail going forward**, not retroactively — so Cluster still needs its
  one-time client pass for the backlog.
- Sources: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.filters ,
  https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.filters/create

### Microsoft Graph
| Object | Capability | Limits / notes | Source |
|---|---|---|---|
| `mailFolder` / `childFolders` | Create folders under root or any folder; nestable; `displayName`, `parentFolderId`, `isHidden` (set once at create), `totalItemCount`/`unreadItemCount`. Well-known names: `inbox`, `archive`, `junkemail`, `clutter`, `deleteditems`, … | No documented folder-count or nesting-depth cap | https://learn.microsoft.com/en-us/graph/api/resources/mailfolder?view=graph-rest-1.0 |
| `outlookCategory` (`/me/outlook/masterCategories`) | Coloured tag; `displayName` unique & **immutable after create**; `color` = `None`/`preset0..preset24`. Applied by writing `displayName` into a message's `categories[]`. **Flat — no nesting.** | Up to **25 colours** across the master list; multiple categories may share a colour | https://learn.microsoft.com/en-us/graph/api/resources/outlookcategory?view=graph-rest-1.0 |
| `messageRule` (Inbox only, `mailFolder('inbox')/messageRules`) | `displayName`, `sequence` (order), `isEnabled`, `isReadOnly`, `hasError`, plus `conditions`/`exceptions` (`messageRulePredicates`) and `actions` (`messageRuleActions`) | Rules apply to **the Inbox folder**. No documented max-rules count on these pages | https://learn.microsoft.com/en-us/graph/api/resources/messagerule?view=graph-rest-1.0 |
| `messageRulePredicates` (conditions) | `senderContains`, `fromAddresses`, `subjectContains`, `bodyContains`, `bodyOrSubjectContains`, `headerContains`, `categories`, `hasAttachments`, `importance`, `sensitivity`, `withinSizeRange`, `sentToMe`, `sentOnlyToMe`, `sentCcMe`, `sentToOrCcMe`, `notSentToMe`, `recipientContains`, `sentToAddresses`, and many `is*` type flags (`isAutomaticReply`, `isMeetingRequest`, `isVoicemail`, …) | `bodyContains` / `bodyOrSubjectContains` exist but Cluster would not use them | https://learn.microsoft.com/en-us/graph/api/resources/messagerulepredicates?view=graph-rest-1.0 |
| `messageRuleActions` | `moveToFolder`, `copyToFolder`, `assignCategories[]`, `markAsRead`, `markImportance` (`low`/`normal`/`high`), `forwardTo`, `forwardAsAttachmentTo`, `redirectTo`, `delete` (→ Deleted Items), `permanentDelete`, `stopProcessingRules` | No "archive" action — closest is `moveToFolder: <archive folder id>` | https://learn.microsoft.com/en-us/graph/api/resources/messageruleactions?view=graph-rest-1.0 |

**Design implication:** the metadata-only "keep sorting" engine can be pushed server-side on **both**
providers — Gmail via one filter per bucket (`from:(domain OR domain …)` → add label, remove `INBOX`),
Outlook via one `messageRule` per bucket (`senderContains`/`headerContains` → `assignCategories` or
`moveToFolder`, `stopProcessingRules`). Both stay entirely within header/query signals.

---

## D. UX ideas to make "Sort my inbox" nice and useful

Each row: what it is, who does it (cited), and whether it fits Cluster's metadata-only / no-server /
MV3 constraints.

| Idea | Who does it (primary source) | Fit for Cluster |
|---|---|---|
| **Non-destructive preview / dry-run before applying** — show the full plan grouped by bucket, expandable to sender then message, with per-row "don't sort this". | Superhuman shows a live match-preview pane while you define a label (`superhuman.com/ai`); Notion Mail shows a sample and you "check the ones that fit, cross out the ones that don't" *before* applying (`notion.com/help/guides/organize-your-inbox-with-notion-ai-auto-labeling`); Clean Email/Mailstrom are preview-first by design (`mailstrom.co/faq`). | **Yes, cheap.** `buildSortPlan` already returns exact ids per bucket. Pure render. Highest value-per-effort. |
| **Sample-confirmation per bucket** — "here are 12 of the 88 we'd call Newsletters — all correct?" before the bucket is applied. | Notion Mail "Auto label similar" flow (same URL). | **Yes.** Slice `idsByProvider`. |
| **"What got filed" digest after sorting**, with counts per bucket and one undo. | SaneBox sends a periodic digest of what it moved (`sanebox.com/help/155…`). | **Yes.** Cluster has `actionLog` + *Recently done*; add a single reversible "Sorted N messages" entry. |
| **Learn from corrections (per-sender override)** — user re-files one message, Cluster remembers "this sender → that bucket / never sort". | SaneBox drag-to-retrain (`sanebox.com/help/140…`); Gmail categories drag-to-retrain (`support.google.com/mail/answer/3094499`); Notion "you're teaching the system" (same URL); Spark "learns from your behavior" (`sparkmailapp.com/features/smart_inbox`). | **Yes, metadata-only.** Local `Map<address\|domain, bucket\|"never">`, consulted first in `classifySortBucket`. Populate from an explicit "wrong bucket?" control (MV3 can't observe a manual move without polling, so make it an explicit action in the digest/preview). |
| **Seed onboarding from existing labels + filters** — read `Users.labels.list` and `Users.settings.filters.list`; reuse an existing `Shopping` label; skip senders the user already filters. | No competitor does exactly this; it's the metadata-only analogue of SaneBox's "analyse 4–6 weeks of history" cold-start (`sanebox.com/help/155…`). | **Yes.** Both list calls are metadata. Strong trust + "it already understands my inbox" moment. |
| **Server-side "keep sorting"** via Gmail filters / Outlook rules instead of only the 6h alarm. | SaneBox/Clean Email keep working with no client running (server services). Gmail filters + Graph `messageRules` are the first-party mechanisms (§C). | **Yes, and better-aligned than the alarm.** Header/query only. Cap 1,000 Gmail filters — collapse each domain-category bucket into one `from:(a OR b OR …)` filter. Also advances Outlook parity. |
| **Review mode vs auto-file, per bucket** — "label in place, leave in inbox until I confirm" vs "file out of inbox now". | SaneBox keeps some folders in-inbox-adjacent; Spark Gatekeeper holds first-time senders for accept/block (`appleinsider`/Readdle); Clean Email Screener. | **Yes — mostly already there.** `DEFAULT_FILE_OUT_OF_INBOX` + per-bucket override. Expose it as an explicit 3-way: *label + keep in inbox* / *label + skip inbox* / *don't label, just leave*. |
| **Undo as one action** — un-label + restore `INBOX` for the whole sort. | SaneBox/Clean Email/Mailstrom all reversible; Cluster's own `actionLog` design principle. | **Yes — partially there.** Ensure the sort writes one `actionLog` entry with all ids, not one per bucket, so a single Undo reverses everything. |
| **Recurring vs one-shot, offered explicitly after the first sort** — "keep Shopping sorted from now on?" per bucket. | Superhuman applies to "new emails + last 14 days" (`superhuman.com/ai`); SaneBox is always-on. | **Yes — exists as the "keep sorting" rules; surface it in the post-sort digest** as a per-bucket toggle instead of a separate Rules tab task. |
| **Non-destructive "bundled inbox" view inside the dashboard** — group the current inbox by bucket for reading, without writing anything to the mailbox. | Clean Email Smart Folders (`clean.email/help/basics/smart-folders`), Mailstrom bundles (`mailstrom.co`), Gmail bundles, Shortwave bundles. | **Yes, and maximally private** — zero mailbox writes. Good "try before you commit" surface; reuses `buildSortPlan`. |
| **Renameable buckets + choose label / category / folder / colour per bucket** | Superhuman custom Auto Labels (`superhuman.com/ai`); Notion custom labels (same URL); SaneBox custom training folders (`sanebox.com/help/138…`); Outlook categories are user-named & coloured (`learn.microsoft.com/.../outlookcategory`). | **Yes.** Make `SORT_BUCKET_LABELS` + prefix editable; add a per-bucket colour; on Outlook map buckets to `masterCategories` (coloured, flat) as the natural fit. |
| **Coloured labels so the Cluster set reads as a group** (removes the *need* for nesting). | Gmail label `color` (`users.labels` ref); Outlook category `preset0..24` (`outlookcategory` ref). | **Yes.** One colour for all Cluster labels. |
| **Keyboard triage over the preview list** (j/k, number keys to re-bucket). | Superhuman's core interaction model. | **Partial fit.** Nice-to-have in the dashboard preview; not core. |
| **LLM / semantic classification** ("looks like a sales pitch"). | Superhuman, Shortwave, Notion Mail. | **Not within constraints** unless via Chrome's on-device `Summarizer`/`Prompt` API (gated, already used for the digest). Server LLM = out. |
| **Crowd / aggregate sender reputation** (a shared domain→category service). | SaneBox-style network effects **[inferred]**. | **Not within constraints** — needs a server + data egress. The curated `domainCategories.ts` map is the static substitute; consider shipping periodic map updates in the extension bundle rather than a runtime call. |
| **Real-time hold on newly-arrived unknown senders** | Spark Gatekeeper, Clean Email/SaneBox screeners. | **Not fully** — MV3 can't intercept delivery. A tighter alarm + `firstSeenAt` ledger (already recommended in the 08-29 doc) is the closest. |

---

## Open questions / couldn't verify

1. **Does the Gmail API reject a user label literally named `Promotions` / `Updates` / `Social` /
   `Forums`?** The guide says SYSTEM label *names* are reserved (→ `HTTP 400 Invalid label name`) but
   the category objects' names are `CATEGORY_PROMOTIONS` etc., not the bare words. Needs a live
   `users.labels.create` test on a throwaway account. Recommendation stands regardless (avoid those
   words for clarity, not just legality).
2. **Gmail max user-label count: 5,000 or 10,000?** Google support page says 5,000; the REST
   reference text returned "10,000". Not load-bearing for Cluster (~12 labels). Worth a 30-second
   re-read of the live `users.labels` reference.
3. **Do Superhuman Auto Labels and Shortwave AI labels write back as real Gmail labels, or stay
   in-app?** `help.superhuman.com` articles return HTTP 403 to automated fetch; `superhuman.com/ai`
   and the Superhuman blog describe the feature but not the Gmail-sync detail. Superhuman's Split
   Inbox is historically Gmail-label-backed **[inferred]**. Shortwave is a Gmail client and uses
   Gmail labels natively, but the AI-label naming/mechanism detail came from a **secondary** source
   (Zapier). A logged-in check of each app would confirm.
4. **SaneBox's "95–98% accuracy" and "4–6 weeks of history"** are from SaneBox's own marketing and
   third-party review write-ups, not an independent measurement — treat as vendor claims
   **[secondary]**. The headers-only and IMAP-IDLE architecture claims ARE first-party
   (`sanebox.com/help/155`).
5. **Gmail's and Outlook Focused Inbox's actual classifier** (ML? which features? body?) is not
   documented by Google/Microsoft; "learns from your corrections" is stated, the rest is inference.
6. **Clean Email Auto Clean exact action list and whether it previews** — the overview page
   (`clean.email/help/tools/auto-clean`) confirms "almost any action / any criteria" and links three
   detail articles, but `clean.email/help/tools/actions` 404'd on fetch. The specific action
   vocabulary (archive/label/move/star/mark-read) is drawn from the Smart Folders page and general
   site copy, not a single enumerated first-party list.
7. **Graph max `messageRules` per mailbox** — not stated on the `messageRule` reference pages;
   Exchange has historically imposed a rules *size* quota (KB), not a simple count. Needs the
   Exchange Online limits doc if Cluster leans on per-bucket rules heavily.
8. **Whether Cluster's `getOrCreateLabel` currently name-matches case-insensitively** (so `shopping`
   vs `Shopping`) — a code question, not researched here, but it affects the collision behaviour in
   recommendation 1.

---

### Sources (primary unless marked)

- Gmail API — Manage labels guide: https://developers.google.com/workspace/gmail/api/guides/labels
- Gmail API — `users.labels` reference: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels
- Gmail API — `users.settings.filters` reference: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.filters
- Gmail API — `users.settings.filters.create` (1,000-filter limit): https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.filters/create
- Gmail Help — labels, nesting, 5,000 labels, 100 colours: https://support.google.com/mail/answer/118708
- Gmail Help — categories/tabs, drag-to-retrain: https://support.google.com/mail/answer/3094499
- Microsoft Graph — `mailFolder`: https://learn.microsoft.com/en-us/graph/api/resources/mailfolder?view=graph-rest-1.0
- Microsoft Graph — `outlookCategory` (preset colours, flat, 25-colour cap): https://learn.microsoft.com/en-us/graph/api/resources/outlookcategory?view=graph-rest-1.0
- Microsoft Graph — `messageRule`: https://learn.microsoft.com/en-us/graph/api/resources/messagerule?view=graph-rest-1.0
- Microsoft Graph — `messageRulePredicates`: https://learn.microsoft.com/en-us/graph/api/resources/messagerulepredicates?view=graph-rest-1.0
- Microsoft Graph — `messageRuleActions`: https://learn.microsoft.com/en-us/graph/api/resources/messageruleactions?view=graph-rest-1.0
- SaneBox — How does SaneBox work (headers-only, IMAP IDLE): https://www.sanebox.com/help/155-how-does-sanebox-work
- SaneBox — How do I train SaneBox: https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox
- SaneBox — Beyond SaneLater / more folder choices: https://www.sanebox.com/help/138-beyond-sanelater-more-sane-folder-choices
- SaneBox — @SaneNews / @SaneBlackHole / @SaneCC: https://www.sanebox.com/help/224-sanenews-what-do-i-do-with-my-sanenews-folder , https://www.sanebox.com/help/235-saneblackhole-what-do-i-do-with-my-saneblackhole-folder , https://www.sanebox.com/help/203-what-is-sanecc
- Clean Email — Smart Folders (app-only views): https://clean.email/help/basics/smart-folders
- Clean Email — Auto Clean: https://clean.email/help/tools/auto-clean
- Superhuman — AI / Auto Labels / Split Inbox: https://superhuman.com/ai
- Superhuman — AI feature showcase (blog): https://blog.superhuman.com/superhuman-ai-feature-showcase/
- Shortwave — AI assistant pipeline: https://www.shortwave.com/docs/guides/ai-assistant/ ; home: https://www.shortwave.com/
- Spark — Smart Inbox: https://sparkmailapp.com/features/smart_inbox ; customise Smart Inbox: https://support.readdle.com/spark/personalization/customize-your-smart-inbox
- Leave Me Alone — what happens after unsubscribe / security: https://help.leavemealone.com/en/unsubscriber/what-happens-after-i-click-unsubscribe , https://leavemealone.com/security/
- Mailstrom — site + FAQ (headers-only, bundles, no AI): https://mailstrom.co/ , https://mailstrom.co/faq
- Notion Mail — organise your inbox with Notion AI auto-labeling: https://www.notion.com/help/guides/organize-your-inbox-with-notion-ai-auto-labeling
- **[secondary]** Shortwave vs Superhuman (label/bundle detail): https://zapier.com/blog/shortwave-vs-superhuman/
- **[secondary]** SaneBox accuracy / training-window figures: https://geekflare.com/software/sanebox-review/ , https://www.fahimai.com/how-to-use-sanebox
