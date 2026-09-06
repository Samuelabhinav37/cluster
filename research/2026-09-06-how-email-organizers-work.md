# How email filtering & organizing tools actually work

**Date:** 2026-09-06
**Scope:** the *mechanisms* — where the work runs, what data it reads, how a
decision is made and how it's made to stick — across the main approaches, and
where Cluster sits against each.

---

## The six mechanisms

### 1. Server-side per-user ML, scored at delivery — *Gmail tabs / Priority Inbox*

Every incoming message is classified the moment it arrives by a **per-user
model**, and dropped into the tab (Primary / Promotions / Social / Updates /
Forums) the model predicts you most want.

From Google's own paper *The Learning Behind Gmail Priority Inbox* (Aberdeen,
Pacovsky, Slater):

- **Model:** linear **logistic regression**. Final score is the **sum of a
  global model's log-odds and a per-user model's log-odds** (a cheap transfer-
  learning trick) — the user model only encodes *how you differ* from the global
  average, so it stays small and adapts instantly when Google adds a feature.
- **Features (hundreds), four families:**
  - *social* — sender↔recipient interaction rate (e.g. % of this sender's mail
    you've read),
  - *content* — headers and "recent terms" that correlate with you acting,
  - *thread* — did you start the thread, have you replied,
  - *label* — what your own filters label this kind of mail.
- **Ground truth is implicit:** did you open / reply / manually re-file within
  a window (`Tmin` < 24 h, `Tmax` measured in days). No explicit labelling —
  it works out of the box.
- **Updates:** online **passive-aggressive (PA-II)** per message, once for the
  global model and once for your model; a **manual correction is weighted
  higher** (higher confidence `C`).
- **The threshold is the hard part.** Users don't agree on the cost of a false
  positive, so the important/not cut-off is **hand-nudged**: "when a user marks
  messages in a consistent direction, we do a real-time increment to their
  threshold." Personal model + personal threshold cut error from 45% → 31% on
  user-marked mail; overall ~80% accuracy, with false negatives deliberately
  3–4× false positives (a wrongly-demoted "important" mail is worse than a
  wrongly-kept one).

The 2026 category system is the same idea, now with more signals and Google's
line that **"user direct input is the most important signal"** — drag a message
between tabs and it learns for that sender/pattern.

### 2. Server-side deterministic rules — *Gmail filters, Sieve*

- **Sieve (RFC 5228)** is a real filtering *language* that runs at the mail
  server before any client sees the message: a script is a list of
  `test → action` pairs (`fileinto`, `discard`, `redirect`, `reject`, `stop`,
  `keep`). Fastmail's rules GUI **compiles to Sieve** behind the scenes.
- **Gmail filters** are the same shape with a friendlier surface: criteria are
  **AND-combined**, but the "Has the words" field accepts **search operators**
  (including uppercase `OR`), so one filter can express `from:(a OR b) filename:pdf`.
  Actions **stack** (label + skip inbox + mark read in one filter). Server-side,
  so they apply on every device; **500 filters/account**, web-only creation.

This is the lineage Cluster's "keep sorting" plugs into — see §"Where Cluster sits".

### 3. IMAP overlay + folder-move training — *SaneBox*

- **Not a client, not an extension.** It authenticates over **IMAP** and
  watches new mail with **IMAP IDLE**.
- **Header / metadata only** — sender, subject, timestamps, recipient patterns.
  It explicitly never reads the body. That's the privacy pitch.
- **Training is a folder move.** SaneBox creates server-side folders
  (`SaneLater`, `SaneNews`, `SaneNoReplies`, `SaneBlackHole`, …). Dragging a
  message from `SaneLater` back to the Inbox *is* the correction — the IMAP move
  is the only signal it needs. Reaches useful accuracy in ~3–5 days; starts from
  generic patterns.
- **`SaneBlackHole`** is a folder-triggered rule: drop a sender in once and
  their future mail is auto-trashed.

### 4. OAuth API + bulk grouping + a rules engine — *Clean Email*

- Connects via **OAuth** (Gmail API / MS Graph / IMAP), reads **headers +
  metadata**.
- **Grouping is the product.** It folds the mailbox into Smart Folders /
  predefined buckets (Social, Finance, Shopping, Travel, "old mail", …) so you
  act on **thousands at once** instead of message-by-message.
- **Auto Clean** is the rules engine: conditions (sender, domain, age, status)
  → actions (move, star, mark, delete, archive). Runs on incoming mail **after**
  per-sender / mailing-list settings are applied.
- **Screener** holds mail from unknown senders for review.

### 5. Permission-based greylisting on an owned server — *HEY*

- 37signals runs the mail server, so this isn't an overlay.
- **The Screener:** the first message from any new address is quarantined. **Yes
  → in forever, No → blocked forever.** A binary allow/block list keyed by
  address, decided by a human, applied at the source — no filtering after the
  fact.
- After "Yes", you pick that sender's lane once — **Imbox** / **The Feed**
  (newsletters, rendered as a scrollable feed) / **Paper Trail** (receipts) —
  and it's sticky per sender. **No ML at all**; just remembered human decisions.

### 6. Subscription managers & unsubscribe — *Unroll.me, Leave Me Alone*

- **Detection signals:** `List-Unsubscribe` and `List-ID` headers, common
  unsubscribe footers, `mailto:unsubscribe@…`, high-volume sender fingerprints.
- **Unroll.me "Block":** creates an **inbox filter** routing the sender to an
  `Unroll.Me/Unsubscribed` folder, then **24 h later** attempts a real
  unsubscribe — sending a mail from your address, or following the link.
- **"Rollup":** a filter that diverts chosen senders into a once-a-day digest
  email it compiles.
- **Cost:** Unroll.me needs **full Gmail access** (read/send/modify/delete) and
  is funded by scanning your commercial mail (receipts, shipping, renewals) and
  selling anonymised purchase data (Slice → Rakuten Intelligence → NielsenIQ).
  Leave Me Alone is the metadata-only, GDPR, doesn't-sell-data counter-position
  with the same feature set (subscription list, one-click remove, Rollups).
- **RFC 8058 one-click** is the only *verifiable* unsubscribe: a message with an
  HTTPS `List-Unsubscribe` URL **and** `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  can be unsubscribed by a **single HTTP POST** (body `List-Unsubscribe=One-Click`),
  no browser, immediate suppression. Everything else (link-follow, mailto) is
  best-effort with no confirmable outcome.

### 7. LLM semantic triage — *Shortwave, Superhuman, Spark, newer tools*

- **Split inbox / bundles** with AI labels ("Marketing", "Travel reservations",
  "Social").
- **AI filters:** you write a **natural-language condition** ("any email with a
  coupon inside", "looks like a sales pitch") and an **LLM evaluates each
  incoming message** against it and takes the action. The leap over Sieve/Gmail
  filters is **semantic** conditions instead of keyword/regex.
- Runs on the vendor's backend (their servers call the LLM over your message
  content); model tier is often selectable (speed vs reasoning).
- **Drag two emails together → a new bundle** — cheap few-shot category creation.

---

## Cross-cutting: the four axes that actually differ

| Axis | Options seen in the wild |
|---|---|
| **Where it runs** | provider server at delivery (Gmail, HEY, Sieve) · third-party server over IMAP-IDLE / API polling (SaneBox, Clean Email, Unroll.me) · vendor backend calling an LLM (Shortwave) · **the user's own browser, no server (Cluster)** |
| **What it reads** | headers/metadata only (SaneBox, Leave Me Alone, **Cluster**) · full body (Gmail ML, Unroll.me, all LLM tools). Body access is what unlocks semantic classification — and is the whole privacy exposure. |
| **How a decision persists** | a learned per-user model (Gmail) · provider-native filters + folders/labels (Sieve, Gmail filters, SaneBox folders, Unroll.me, **Cluster keep-sorting**) · an address-keyed allow/block list (HEY Screener, **Cluster Screener**) · nothing, re-decided each run (pure bulk cleaners) |
| **Training signal** | explicit ML labels are rare. Almost everyone uses **implicit behaviour** (open/reply/archive) plus **folder moves as corrections**. Gmail formalises it into a model; SaneBox reads it off IMAP moves; HEY reduces it to one Yes/No. |

**The rules-engine lineage is one line:** Sieve (2001) → Gmail filters
(search-operator criteria) → Clean Email Auto Clean (GUI conditions) →
Shortwave/Superhuman AI filters (NL conditions, LLM-evaluated). Same
`condition → action` skeleton every time; only the expressiveness of the
condition grows.

---

## Where Cluster sits

- **Runtime:** the outlier — everything runs **in the browser, no server**.
  Closest neighbour in spirit is a client-side extension, but organizers almost
  never work that way (extensions are usually for *sending*).
- **Data:** header/metadata-only, like SaneBox and Leave Me Alone — which rules
  out the Gmail-ML / LLM style of semantic classification by construction.
- **Persistence:** it **reuses the provider's own primitives** rather than
  maintaining an overlay. "Keep sorting" compiles a domain-category bucket into
  a **real Gmail filter** (`from:(d1 OR d2 …)` → label + skip inbox) — exactly
  how Fastmail's GUI compiles to Sieve. The Screener is **HEY's mechanism
  reimplemented on Gmail**: a standing `from:` filter + a `Screener` label +
  an address allowlist. Labels are real Gmail labels, not `SaneLater`-style
  private folders.
- **Classification:** deterministic — a curated domain→category map + subject-
  regex message-kind + age-based retention. This is the Sieve/Gmail-filter
  school, not the ML school. Fine for "Amazon → Shopping"; no notion of
  "important to *me*".
- **Unsubscribe:** only the RFC 8058 one-click POST path is treated as done;
  mailto/link are surfaced but not claimed — stricter than Unroll.me's
  "best-effort and call it unsubscribed".
- **Threat detection:** nothing else in this list does it — that's spam-vendor
  / security territory, bolted on here because header access is already paid for.
- **The visible gap (already flagged in prior competitive notes):** Cluster
  collects exactly the raw signal SaneBox and Priority Inbox learn from —
  `unread`, `neverRead`, the action log, unsubscribe outcomes — but builds **no
  per-user model**. It has the training data and no learner. Everyone successful
  in category #1 and #3 closed that loop; Cluster's `engagementModel.ts` is the
  stub where it would go.

---

## Sources

- Google Research — *The Learning Behind Gmail Priority Inbox* (Aberdeen,
  Pacovsky, Slater): <https://research.google/pubs/pub36955/>
- Google Workspace — how Gmail sorts mail:
  <https://workspace.google.com/blog/productivity-collaboration/how-gmail-sorts-your-email-based-on-your-preferences>
- SaneBox Help — how training works:
  <https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox>
- Clean Email — Auto Clean overview: <https://clean.email/help/auto-clean/overview>
- HEY — how it works / the Imbox / Paper Trail: <https://www.hey.com/how-it-works/>,
  <https://www.hey.com/features/the-imbox/>, <https://www.hey.com/features/paper-trail/>
- Leave Me Alone — *How does Unroll.me work?*:
  <https://leavemealone.com/blog/how-does-unroll-me-work/>
- Gizmodo — Unroll.me / Slice data selling:
  <https://gizmodo.com/how-did-unroll-me-get-users-to-allow-it-to-sell-their-i-1794603555>
- Mailgun — *What is RFC 8058?*:
  <https://www.mailgun.com/blog/deliverability/what-is-rfc-8058/>
- RFC 5228 — Sieve: <https://datatracker.ietf.org/doc/html/rfc5228>;
  Fastmail — using Sieve:
  <https://www.fastmail.help/hc/en-us/articles/1500000280481-Using-Sieve-scripts-in-Fastmail>
- Zapier — Shortwave vs Superhuman (AI filters / bundles):
  <https://zapier.com/blog/shortwave-vs-superhuman/>;
  Shortwave AI Assistant docs: <https://www.shortwave.com/docs/guides/ai-assistant/>
