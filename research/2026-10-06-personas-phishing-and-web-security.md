# Cluster: missing personas, faster phishing quarantine, learning without a server, and web security

_2026-10-06. Branch `fix/safety-r0`. Research only. No source code was changed._

Builds on, and does not repeat:
`2026-10-05-inbox-intelligence-research.md` (§4 Protection, §5 complaints, §6 competitors),
`2026-08-29-competitive-and-security-review.md` (§4 security tiers),
`2026-09-18-phishing-security-ux-separation.md`,
`2026-10-05-algorithm-audit-and-upgrades.md` (Part A.4/A.5 parser and scoring bugs, B.3/B.5 learning).
Where those notes already settled a point, this note links to them instead of re-deriving it.

Conventions:

- Inline links are the source for each claim.
- **(Inference)** marks my own reasoning or design.
- **[secondary]** marks a claim taken from a secondary source or a search summary.
- **Not reached** marks a source I could not read.
- Code references are `path:line` on this branch.

## TL;DR

1. **The biggest gap is timing.** Auto-quarantine only runs in the 6-hour triage (`src/background.ts:61`, `:337`). A 1-minute `history.list` alarm (2 quota units a call, 30-second alarm floor) cuts that to about a minute while Chrome is open.
2. **Push needs a server.** Gmail `users.watch` needs Cloud Pub/Sub and renewal every 7 days. Graph needs a public HTTPS endpoint. With Chrome closed only Gmail filters and Outlook rules act, so known-bad senders and user blocks should become delivery-time filters.
3. **Test Gmail's `header:` operator now.** If `header:Authentication-Results:dmarc=fail` works in a filter, DMARC-fail mail can be held at delivery. Google documents it only for custom headers.
4. **Five missing personas:** caregiver, job seeker, home buyer or renter, newcomer or non-native English reader, high-risk individual. Each maps to a cheap header-only signal Cluster lacks.
5. **Cross-user learning hits written policy.** Limited Use covers data "aggregated, anonymized, or derived" from Gmail scopes. The Workspace policy bars models "beyond that specific user's personalized model". Hashing doesn't escape that.
6. **Recommended:** on-device per-user learning, a signed download-only threat file shared with Moat, and one-tap reporting to Gmail, APWG and NCSC. No Cluster server.
7. **Web protection belongs in Moat.** It already has `<all_urls>`, DNR and signed phishing and scam lists. The single-purpose policy argues against adding it to Cluster.
8. **For the 80-year-old, the Gmail label name is the warning.** Hold, don't just warn. Explain in three plain reasons at most.

---

## 0. What Cluster does today (baseline for this note)

Only the parts relevant to timing and protection. The full feature matrix is in the
2026-10-05 inbox-intelligence note.

| Area | Today | Where |
|---|---|---|
| Scopes and permissions | `gmail.modify`, `gmail.settings.basic`. Permissions `identity storage unlimitedStorage tabs alarms`. Optional `https://*/*`. | `manifest.json:31-44` |
| Headers fetched | From, Reply-To, List-Unsubscribe(-Post), Subject, Authentication-Results, DKIM-Signature, Precedence, Auto-Submitted. No `fields=` mask, so `snippet` is probably also returned. | `src/lib/gmailApi.ts:291-305` |
| Security lane | Incremental Gmail `history.list` (messageAdded) from a stored cursor, capped at 100 messages and 30 days. | `src/lib/providers/gmailProvider.ts:95-121`, `src/lib/gmailApi.ts:235`, `src/background.ts:53-54`, `:299-307` |
| When it runs | Only inside `runBackgroundTriage`, on the 6-hour `cluster-triage` alarm. Other alarms: jobs 5 min, inbox limits 15 min, datasets daily. | `src/background.ts:60-91` |
| Signals and weights | blocklisted 6, freemail-brand-claim 5, lookalike 4, link-mismatch 4, failed-auth 3, brand 3, reply-to 3, risky-attachment 3, punycode 2, lure 2. High ≥ 6, elevated ≥ 3. | `src/lib/threatSignals.ts:403-432` |
| Auth parsing | Trusts only `mx.google.com` / Outlook authserv-ids. First `dmarc=` token wins (known bug, see algorithm note A.4). | `src/lib/emailAuth.ts:29-54` |
| Reply-To | Only fires when Reply-To is one of 7 free-mail domains. | `src/lib/threatSignals.ts:121`, `:299-312` |
| Lure words | English subject regex only. | `src/lib/threatSignals.ts:291-297` |
| Attachments | Gmail `filename:` search for html, htm, iso, img, docm, xlsm, pptm. | `src/lib/riskyAttachments.ts:17-37` |
| First contact | "Not seen since install", not "rarely seen". Changes copy only, adds no score. | `src/lib/firstContact.ts:197-216` |
| Auto-quarantine | Opt-in. High-tier senders not in `knownSenders` (unless auth failed) get the Cluster "suspicious" label and leave INBOX. Undo via action log. | `src/background.ts:191-267`, `src/lib/providers/gmailProvider.ts:40`, `:229-237` |
| Server-side filters | `from:` filters for 7 domain-category buckets. Screener and Mute use `from:<address>` filters. No security filters. | `src/lib/serverSort.ts:74-141`, `docs/oauth-scope-justification.md:56-72` |
| Blocklist data | Hand seed plus a URLhaus hostfile slice (max 6,000), plus a daily unsigned JSON from GitHub Pages that can only add. | `src/lib/blocklist.ts:1-63`, `scripts/refresh-blocklist.mjs:18-19`, `src/lib/remoteDataset.ts:10-83` |
| Link check | Manual "Deep scan" of one message body, checks text/href mismatch and blocklisted hosts. | `src/lib/linkMismatch.ts:1-99`, `docs/privacy.md:20-26` |
| Enterprise telemetry | Athena events go out only if an admin configures a managed endpoint. | `src/lib/athenaIntegration.ts:1-40`, `src/background.ts:118-141` |

Two observations that matter below:

- **The malware list is the wrong kind of list for senders.** URLhaus lists hosts that serve
  malware downloads, and its submission API only accepts threat type `malware_download`
  ([URLhaus API](https://urlhaus.abuse.ch/api/)). Phishing mail is usually sent from a different
  domain than the one hosting the payload. (Inference) Matching URLhaus hosts against `From`
  domains will rarely fire. Phishing and scam *domain* lists (what Moat already pulls) fit better,
  and fit link hosts best.
- **The dataset fetch is unsigned.** The algorithm note (A.5) already flagged that a bad publish
  could add `gmail.com` to the malware list. Moat already solved this with an Ed25519-signed
  manifest (`C:\Users\samue\projects\moat\src\background\liveSignature.ts:1-46`). Reuse it.

---

## A. Missing personas

Existing personas: (1) student flooded with promos, (2) multi-store owner with invoices and BEC
risk, (3) 80-year-old heavy-mail user who won't open the dashboard, (4) creator flooded with
pitches and fake sponsorships.

### Evidence base

| Source | Figure | Link |
|---|---|---|
| FBI IC3 2025 | 1,008,597 complaints, $20.877 billion lost | [IC3 2025 report](https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf), p.6 |
| IC3 2025, age 60+ | 201,266 complaints (+37%), $7.748 billion (+59%), average loss $38,500, 12,444 people lost over $100K | same, p.44 |
| IC3 2025, 60+ by count | Phishing/Spoofing is the top type (48,064), then Tech/Customer Support (21,333) | same, p.45. **Text layer is garbled. I rebuilt the column alignment from the alphabetical 3-year table.** |
| IC3 2025, losses by type (all ages) | Investment $8.65B, BEC $3.05B, Tech/Customer Support $2.13B, Government Impersonation $798M, Employment $363M, Real Estate $275M, Phishing/Spoofing $216M | same, p.26 (same alignment caveat) |
| IC3 2025, BEC for 60+ | $568M | same, p.46; matches [secondary](https://rexxfield.com/bec-by-the-numbers-2025-ic3-report/) |
| FTC 2025 | 3 million fraud reports, $15.9 billion lost. Imposter scams over 1 million reports, $3.5B. Investment $7.9B | [FTC JEC testimony, Mar 2026](https://www.ftc.gov/news-events/news/press-releases/2026/03/ftc-testifies-joint-economic-committee-agencys-efforts-combat-fraud) |
| FTC 2025 imposters | Business impersonation (mostly banks) about $1B, government about $920M. Lures include "a fake security alert, often from a bank" | [FTC, Jun 2026](https://www.ftc.gov/news-events/news/press-releases/2026/06/ftc-data-show-people-reported-losing-3-point-5-billion-imposter-scams-2025) |
| FTC 2024 contact method | "For the second consecutive year, email was the most common way that consumers reported being contacted by scammers." In 2025 text messages took the top spot [secondary, search summary of FTC data] | [FTC, Mar 2025](https://www.ftc.gov/news-events/news/press-releases/2025/03/new-ftc-data-show-big-jump-reported-losses-fraud-125-billion-2024) |
| FTC job scams | Losses rose from $90M (2020) to $501M (2024) | same |
| FTC older adults | Losses over $100K to impersonators: $55M (2020) to $445M (2024) | [FTC, Aug 2025](https://www.ftc.gov/news-events/news/press-releases/2025/08/ftc-data-show-more-four-fold-increase-reports-impersonation-scammers-stealing-tens-even-hundreds) |
| Age and clicking | Over 21 days, young users' susceptibility declined while older users' "remained stable"; older adults "reported lower susceptibility awareness" | [Lin et al., ACM TOCHI 2019](https://doi.org/10.1145/3336141) [secondary: abstract via search summary] |

### The five personas to add

**A1. The caregiver or trusted helper** (adult child managing a parent's Gmail; also the
recently bereaved settling an estate)

- *Inbox reality:* someone else's mailbox, checked weekly, often from a different device. Gmail
  lets a personal account add "up to 10 delegates" ([Gmail delegation](https://support.google.com/mail/answer/138350)).
- *Biggest risk:* the IC3 60+ numbers above. Tech-support and bank-impersonation lures start with
  a fake alert (FTC Aug 2025). The helper is not present when the scam lands.
- *What Cluster should do:* a "helper set-up" that turns on strict defaults once (auto-quarantine,
  Screener for unknown senders, delivery-time filters) on the parent's own Chrome. The held
  label is visible in Gmail on any device, so the helper can review it from their phone through
  delegation without Cluster. (Inference)
- *What's missing:* no remote alert is possible without a server or `gmail.send`. (Inference)
  The Gmail API acts on the mailbox that owns the token. I found no documented way for a
  consumer delegate's token to call the API on the delegator's mailbox. Treat "helper reviews in
  Gmail" as the design, not "helper gets a push".

**A2. The job seeker** (new graduate, laid off, career changer)

- *Inbox reality:* lots of first-contact mail that is wanted. Recruiters, applicant-tracking
  systems, interview scheduling. The Screener would hide exactly the mail they need.
- *Biggest risk:* fake recruiters and "task" scams. FTC: job-scam losses $90M → $501M
  (2020-2024). IC3 2025 Employment losses about $363M.
- *What Cluster should do:* exempt known ATS sending domains from Screener (Inference: build the
  list from the user's own past mail, plus a curated seed). Flag brand-name hiring claims from
  free-mail ("Amazon Recruiting" <x@gmail.com>). That is today's `freemail-brand-claim`
  (`src/lib/threatSignals.ts:245-265`) but only if the employer is in the 37-brand list. Add a
  job-lure subject set ("remote position", "data entry", "pay per task", "equipment check").
- *What's missing:* a "job search mode" switch that relaxes Screener and tightens brand-claim.

**A3. The home buyer, seller or renter mid-transaction**

- *Inbox reality:* weeks of mail with a title company, agent, lender and landlord. Then one email
  says the wire instructions changed.
- *Biggest risk:* real-estate wire fraud. IC3 2025 Real Estate losses about $275M, and the IC3
  Recovery Asset Team lists "BEC/Real Estate" as a combined category (IC3 2025 report, Recovery Asset Team section).
- *What Cluster should do:* let the user **pin** the domains of the people they are paying.
  Every pinned domain becomes a lookalike target, the same way `BRAND_DOMAINS` is today
  (`src/lib/threatSignals.ts:208-235`). A first-contact sender within edit distance 2 of a
  pinned domain, or a subject with "wire", "updated instructions", "new account details", goes
  straight to high. All header-only. (Inference)
- *What's missing:* user-defined lookalike targets. This also serves the store owner (suppliers)
  and the student (school domain).

**A4. The newcomer or non-native English reader** (immigrant, international student, older
reader whose first language is not English)

- *Inbox reality:* government and immigration mail they cannot afford to miss. Mail in two or
  more languages.
- *Biggest risk:* government impersonation (IC3 2025 about $798M). USCIS lists red flags
  including mail that ends in ".net, .org, .com, or .info" instead of ".gov", and says it will
  never take fees by Western Union, MoneyGram, PayPal, Venmo or gift cards
  ([USCIS Avoid Scams](https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams/common-scams)
  [secondary: search summary of this page]).
- *What Cluster should do:* a "government claim" rule. Display name or subject naming an agency
  (USCIS, IRS, SSA, HMRC, DVLA, CRA…) from a domain outside the government suffix list
  (`.gov`, `.gov.uk`, `.gc.ca`, `.gov.au`) is high. Lure words in more than English (the
  algorithm note A.5 probe shows Spanish lures score zero). Warnings in the user's language
  via Chrome's on-device Translator API (stable from Chrome 138 per the inbox-intelligence
  note's platform facts).
- *What's missing:* any non-English lexicon, and a government-domain allow-list.

**A5. The high-risk individual** (journalist, activist, campaign staff, election worker)

- *Inbox reality:* targeted spear-phishing, not bulk scams. Few messages, high stakes.
- *Biggest risk:* credential phishing and OAuth consent phishing. Google built the Advanced
  Protection Program for "users with high visibility and sensitive information". It "allows only
  Google apps and verified third-party apps to access your Google Account data"
  ([Advanced Protection](https://landing.google.com/advancedprotection/)).
- *What Cluster should do:* finish OAuth verification first. (Inference) An unverified Cluster
  simply cannot connect for this persona. Then offer a "strict mode": first contact plus any
  identity signal is high, display-name churn is surfaced (security review §4 Tier 1 item 3),
  and no outbound link checks at all. The no-server design is a selling point here.
- *What's missing:* strict mode, display-name churn, and OAuth grant review (needs a new scope,
  security review §4 Tier 2 item 10).

**Considered and folded in, not separate personas:**

- *Freelancer or remote worker on personal Gmail:* same invoice and payment-change risks as the
  store owner (persona 2). Pinned domains (A3) cover them.
- *Parents managing a child's account:* Google Family Link governs child accounts. I did not
  research it. Flagged as an open question.
- *Users with visual or cognitive impairments:* better treated as a design rule across all
  personas (see D.4) than as a persona. W3C's cognitive accessibility guidance has patterns
  "Use Clear Words" and "Help the user stay safe" ([W3C COGA](https://www.w3.org/TR/coga-usable/)).

---

## B. Reducing phishing and quarantining before the user touches it

### B.1 What headers alone can tell you

Gmail already blocks "more than 99.9% of spam, phishing and malware"
([Google, 2024](https://blog.google/products-and-platforms/products/gmail/gmail-holidays-2024-spam-scam/)),
and "might show a warning or move the email to Spam"
([Gmail Help](https://support.google.com/mail/answer/8253)). (Inference) Cluster only ever sees
the residue Gmail let through. So the useful signals are the ones Gmail weighs less: personal
context (who *you* deal with) and identity claims in the display name.

| Signal | What it catches | Reliability from headers | Cluster today | Gap |
|---|---|---|---|---|
| DMARC result in `Authentication-Results` | Spoofed `From:` of a real domain | High when it says fail. But Gmail spam-folders most of these, so it rarely fires (`threatSignals.ts:273`). A pass only proves the domain, not honesty: RFC 8601 §7.2, per the algorithm note B.2 | Parsed; trusted authserv-id only (`emailAuth.ts:29-41`) | Parser takes first `dmarc=` token (algorithm note A.4). Cite DMARC as RFC 9989 (per the 2026-10-05 note; I could not re-reach rfc-editor.org or datatracker this session, both reset). |
| SPF / DKIM alone | Weak forgery hints | Low. Forwarding and lists break both, which is why DMARC alignment exists ([RFC 7208](https://www.rfc-editor.org/rfc/rfc7208), [RFC 6376](https://www.rfc-editor.org/rfc/rfc6376)) | Both-fail = medium | Fine as is |
| ARC | Explains why forwarded mail failed | Experimental. Does not assess trustworthiness ([RFC 8617](https://www.rfc-editor.org/rfc/rfc8617)) | Not used | Use for explanation only |
| BIMI / VMC | Verified brand logo | Gmail needs VMC/CMC plus DMARC quarantine/reject ([Google](https://support.google.com/a/answer/10911320)). Not exposed as a verdict in the API (inbox-intelligence note §4a) | Not used | Skip |
| Reply-To ≠ From | Replies diverted to the attacker. Core BEC shape | Medium. Help desks and ESPs set Reply-To legitimately | Free-mail targets only (`threatSignals.ts:299-312`) | Any unrelated registrable domain, with an ESP allow-list (inbox note §4a item 1) |
| Return-Path ≠ From | Envelope mismatch | Low. ESP bounce domains differ by design | Not fetched | Skip |
| Display-name brand claim | "PayPal" from a non-PayPal domain | High from free-mail, medium otherwise | 37 brands (`threatSignals.ts:245-265`) | Unicode and zero-width evasions, combosquats (algorithm note A.5 probe) |
| Address inside display name | `"service@paypal.com" <x@evil>` | High | Not checked | Add (inbox note §4a item 2) |
| Lookalike / homoglyph domain | `paypa1.com`, Cyrillic `а` | High for long labels | Small hand map (`threatSignals.ts:179-190`) | Use [Unicode TR39](https://www.unicode.org/reports/tr39/) skeletons. Add **user-pinned** targets (A3) |
| Punycode `xn--` | IDN tricks | Medium | Flag only (`threatSignals.ts:326-330`) | Decode, then skeleton-compare |
| Newly registered domain | Throwaway phishing domains | High in the literature, but **not in any header** | Not available | Needs RDAP lookup per first-contact domain ([RFC 9083](https://www.rfc-editor.org/rfc/rfc9083), bootstrap at [IANA](https://data.iana.org/rdap/dns.json)). That is an outbound request naming the sender's domain. Opt-in only. (Inference) |
| First contact | New sender pretending to be known | Medium on its own, strong in combination | Since-install ledger, no score | Count-based "rarely seen", and use it as a multiplier (algorithm note B.1) |
| Risky attachment names | HTML smuggling, ISO, macro docs | Medium | 7 extensions via `filename:` | Add svg, lnk, one, msi, hta, xlam, zip, bidi-override names (algorithm note A.5) |
| Phone number or URL in subject | Callback tech-support and fake-invoice scams ("Call 1-8xx to cancel") | Medium. Rare in legitimate subjects (Inference) | Not checked | New subject regex. Very relevant to persona 3 |
| To/Cc not containing the user | Mass BCC blasts | Low-medium | `To` only fetched for sent mail (`gmailApi.ts:424-425`) | Fetch `To` on inbox metadata (still a header) |
| Invisible characters in subject or name | Evasion | High as an "evasion attempt" signal | Not checked | Strip default-ignorables and bidi controls first, then flag their presence (algorithm note B.4) |

**Most important point (Inference):** the attacks that hurt Cluster's personas most (BEC,
fake invoices, job and sponsorship offers) usually **pass DMARC** on an attacker-owned domain.
Authentication cannot catch them. What catches them is *context the user already has*: "this
is the first message from this domain", "this domain looks like my title company", "this
display name claims a brand or an agency". Cluster's edge is the on-device contact history,
which Gmail's global model weighs less.

### B.2 Timing: how fast can Cluster act?

**Facts**

| Mechanism | Fact | Source |
|---|---|---|
| `chrome.alarms` | "Chrome limits alarms to at most once every 30 seconds but may delay them an arbitrary amount more." Under 0.5 minutes is not honoured. Before Chrome 120 the floor was 1 minute [secondary] | [chrome.alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms), [Chrome 120 notes](https://developer.chrome.com/blog/chrome-120-beta-whats-new-for-extensions) [secondary: search summary] |
| Sleep | "Alarms continue to run while a device is sleeping. However, an alarm will not wake up a device." Missed repeating alarms fire once on wake | same |
| Chrome closed | Not addressed by the alarms doc. (Inference) The service worker cannot run without the browser process. The `background` permission "Makes Chrome start up early … and shut down late (even after its last window is closed, until the user explicitly quits Chrome)" | [Permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list) |
| Gmail push | `users.watch` needs a Cloud Pub/Sub topic with publish granted to `gmail-api-push@system.gserviceaccount.com`. "You must call the watch method at least once every 7 days." At most one event per second per user. Delivery is a webhook to "your server" or a pull subscription | [Gmail push](https://developers.google.com/workspace/gmail/api/guides/push) |
| Graph push | "You need to define a publicly accessible HTTPS-secured endpoint" | [Graph webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks) |
| Quota | 6,000 units per user per minute. `history.list` 2, `messages.get` 20 | inbox-intelligence note, platform facts |

**Can the extension use Gmail push without a server?** (Inference) A pull subscription still
lives in the developer's Google Cloud project. The extension would need credentials for that
project, or every user would need the Pub/Sub scope and IAM access to one shared subscription.
Shipping a service credential in a public extension is unsafe. Notifications for all users would
also land in one topic the owner controls. So push means a server, and it changes the privacy
story even though the payload is only an email address and a history id.

**Cost of fast polling (Inference):** one `history.list` per minute is 2 units, against a
6,000-unit per-minute budget. A typical burst of 5 new messages costs another 100 units. Even a
30-second poll is negligible. The binding constraint is the service worker waking every minute,
not Gmail quota.

### B.3 What can move into Gmail filters (works with Chrome closed)

Filter facts: criteria `from`, `to`, `subject`, `query`, `negatedQuery`, `hasAttachment`, size.
Actions add or remove labels, forward. "You can only create a maximum of 1,000 filters"
([filters.create](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.filters/create)).
Google does not document a maximum query length on the filter guide I read
([filter settings guide](https://developers.google.com/workspace/gmail/api/guides/filter_settings)).
**Treat query length as unknown and test it.** Gmail search operators include `from:`,
`subject:`, `filename:`, `has:`, `list:`, `deliveredto:`, and `header:`, documented as
"Search for emails with a specific custom header or header value"
([Gmail search operators](https://support.google.com/mail/answer/7190)).

| Filter idea | Query sketch | Confidence it works |
|---|---|---|
| Known-bad sender domains | `from:(@a.example OR @b.example …)` → held label, remove INBOX | High. Same shape as `serverSort.ts:123-141` |
| User "Block" (persistent) | `from:addr` → held label | High. Already the Mute shape (inbox note rec #1) |
| Risky attachment types from strangers | `filename:(iso OR img OR htm OR html OR one OR lnk)` | High for the match. Gmail filters cannot say "stranger", so add `negatedQuery` with the user's top correspondents (Inference) |
| Subject lures | `subject:("account suspended" OR "verify your account" OR "wire instructions")` | High for the match. Keyword only, no regex. Noisy alone, so label, don't remove INBOX |
| Display-name brand claim | `from:(paypal) -from:(@paypal.com)` | **Unknown.** (Inference) Gmail's `from:` often matches the display name. Needs a live test |
| DMARC fail at delivery | `header:Authentication-Results:dmarc=fail` | **Unknown.** Documented for "custom" headers. Needs a live test. If it works it is the single best delivery-time check |
| Phone number in subject | not expressible (no regex) | No |
| First contact, lookalike algorithm, scoring | not expressible | No. Client side only |

Outlook is easier: rules support `headerContains`, `senderContains`, `subjectContains`,
`hasAttachments` and more
([messageRulePredicates](https://learn.microsoft.com/en-us/graph/api/resources/messagerulepredicates)).
`headerContains: ["dmarc=fail"]` is a plausible delivery-time rule. (Inference) Test against a
forged copy of the header, since rules may match any header text, including attacker-added
copies.

Filter budget (Inference): the 1,000 cap is shared with the user's own filters and Cluster's
mute, Screener and sort filters (`docs/oauth-scope-justification.md:70-72`). Pack many domains
into one OR-query per filter, and keep a reserve.

### B.4 Layered design

| Layer | When | What runs | Acts how |
|---|---|---|---|
| **L0 Gmail itself** | At delivery | Gmail spam and phishing models | Spam folder, warning banners |
| **L1 Cluster filters** | At delivery, Chrome closed | Packed `from:` filters for the signed bad-domain list and user blocks; risky-attachment filter; optional subject-lure filter (label only); `header:` DMARC filter if the test passes | Add `Cluster/Held for safety`, remove INBOX. Lure filter only labels |
| **L2 Arrival lane** | Every 1 minute while Chrome runs | `history.list` from the security cursor (already built, `gmailProvider.ts:95-121`), metadata for new ids, full header scoring with the user's own context | High tier: hold. Elevated: label only, stays in inbox |
| **L3 Sweep** | Every 6 hours (today's triage) and on dashboard open | Re-score recent mail with fresh data, refresh filters from the latest list, expire held mail to Trash after N days | Label changes, filter sync |

Changes this needs (Inference):

1. Move `runQuarantine` (`background.ts:191`) out of the 6-hour triage into a new
   `cluster-arrival` alarm at `periodInMinutes: 1`, gated on quota headroom like
   `runInboxTimeLimitsIfQuota` (`background.ts:93-102`).
2. Score per message on arrival, not only per sender summary. A first-time sender has one
   message, so sender aggregation adds nothing there.
3. Make held mail visible without the dashboard. The Gmail label name is the warning
   (see B.6).
4. Optional and clearly worded: request the `background` permission so Chrome keeps running
   after the last window closes. Users may find a browser that won't quit surprising, so keep
   it off by default.

### B.5 Link checking without reading bodies

**From metadata alone, no.** Links live in the body. The only body-derived text in a metadata
response is probably `snippet` ("A short part of the message text",
[Message resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages)),
and the inbox note recommends masking it out with `fields=`. (Inference) A URL in the subject
line is the one header-visible link.

**Opt-in body reading.** `gmail.modify` already allows `format=full`. So this is a policy and
trust choice, not a scope choice (inbox note, platform facts). It contradicts `docs/privacy.md:16-18`
unless the user switches it on. A middle path (Inference): read the body **only for mail
already at elevated or high**, only on device, extract hosts, check them against a local list,
discard the body. That is Deep scan, automated for flagged mail only.

**Where to check the hosts**

| Option | Privacy | Terms | Fit |
|---|---|---|---|
| Local signed list (Moat's phishing, malicious-URL and scam domain lists: about 40k, 2k and 18k domains per `moat/src/shared/liveSecurity.ts:13-29`) | Best. Download only | Upstream list licences apply. Moat already vets them | **Recommended** |
| Google Safe Browsing v5, hash-prefix | Good. "only a 4-byte hash prefix of the URL hashed is in the request". An Oblivious HTTP gateway can hide the IP | "The Safe Browsing API is for non-commercial use only." Needs an API key, which would ship inside the extension (Inference: public and abusable). Must not treat a URL as unsafe on data older than 30 minutes, and must tell users accuracy "cannot be guaranteed". Google "may share submitted URLs … with third parties" | Only if Cluster stays non-commercial ([SB reference](https://developers.google.com/safe-browsing/reference), [SB terms](https://developers.google.com/safe-browsing/terms)) |
| Google Web Risk | Same mechanics | Commercial, paid | Needs billing and a proxy to hide the key (Inference) |
| PhishTank | Download only | App key for automated downloads; files "updated every hour on the hour". The page did not say whether new registrations are open | Possible feed source ([PhishTank developer info](https://phishtank.org/developer_info.php)) |
| OpenPhish Community | Download only | Free tier "12 hours" update; terms distinguish commercial use; premium is every 5 minutes | Weak freshness ([OpenPhish feeds](https://openphish.com/phishing_feeds.html)) |
| URLhaus | Download only | Free under "fair use"; Auth-Key now required; dumps every 5 minutes; malware download URLs only | Good for link hosts, not senders ([URLhaus API](https://urlhaus.abuse.ch/api/)) |

### B.6 Quarantine UX

| Destination | What happens | Use for |
|---|---|---|
| **Cluster label, out of INBOX** | Private. Reversible. Visible in Gmail on every device. No signal to Google | Default for everything Cluster decides on its own |
| **Spam** | "When you report spam or move an email into Spam, Google receives a copy of the email and may analyze it" ([Gmail Help](https://support.google.com/mail/answer/1366858)). Spam and Trash are deleted after 30 days [secondary: Gmail Help search summary](https://support.google.com/mail/answer/7015314). Whether adding the `SPAM` label through the API counts as a user report is **not documented** | Only when the user confirms "this is a scam" |
| **Trash** | Deleted after 30 days | Expiry of confirmed-bad held mail |
| **Report phishing** | Gmail UI only: "click More next to Reply, then Report phishing" ([Gmail Help](https://support.google.com/mail/answer/8253)). No API method that I could find | Cluster should open the message in Gmail and say which button to press |

Plain-words verdict for persona 3 (Inference, follows W3C COGA "Use Clear Words"):

- Label name, as seen in the Gmail sidebar: **"Held by Cluster – looks like a scam"**. The
  label *is* the message for someone who never opens the dashboard.
- One-line reason, at most one sentence per signal, at most three:
  - "This says it is from PayPal, but it was sent from a Gmail address."
  - "You have never had an email from this sender before."
  - "It asks you to call a phone number to cancel a payment."
- One instruction: "Don't call the number or click links. If you're worried, call PayPal using
  the number on your card or their website."
- Never "DMARC failed" or "risk score 7". Those stay in an expandable "details" area.

### B.7 Scam types per persona and the header signals that catch them

| Scam | Personas | Header and subject signals | Notes |
|---|---|---|---|
| BEC / bank-detail change | 2, A3, freelancer | Lookalike of a **pinned** supplier or title domain; Reply-To ≠ From; first contact; subject "updated bank details", "new account", "wire instructions" | IC3 2025 BEC $3.05B. Needs pinned domains. Lookalike vs the 37 brands won't help |
| Fake invoice / renewal (Norton, Geek Squad, PayPal invoices) | 3, 2 | Brand claim from free-mail; phone number in subject; subject "invoice", "renewal", "order #"; first contact | Callback scams often carry no link at all (Inference) |
| Delivery-fee scams | 1, 3 | Brand claim (USPS, Royal Mail, DHL) from a non-carrier domain; subject "delivery failed", "customs fee" | Mostly SMS today (Inference from FTC 2025 contact data) |
| Tech-support scams | 3 | Brand claim (Microsoft, Apple, McAfee); phone number in subject | IC3 2025 $2.13B. Chrome's on-device model targets the web page side (D.3) |
| Grandparent / family emergency | 3 | Little in headers. First contact plus urgency words ("arrested", "bail", "accident") | Mostly phone. Weak email coverage. Say so |
| Job offer / task scams | A2, 1 | Employer brand from free-mail; subject "remote job", "hiring", "pay per task"; first contact | Must not hold genuine ATS mail |
| Fake sponsorship with malware | 4 | First contact; risky attachments (zip, rar, scr, lnk); subject "collaboration", "sponsorship", "brand deal" plus attachment | Header can see attachment names via `filename:` (Gmail) or `$expand=attachments` (Outlook) |
| Government impersonation | A4, 3 | Agency name in display name or subject from a non-government suffix | IC3 2025 about $798M |
| Crypto / romance | 3, 1 | Weak in headers. First contact plus subject words ("investment", "returns", "crypto") | IC3 2025 Investment $8.65B. Mostly social and messaging. Be honest about coverage |
| Calendar-invite phishing | All | Google's June 2026 advisory: "fake renewal notices were added directly to Google Calendar invites" | Out of Gmail's inbox path. Not catchable by Cluster ([Google advisory](https://blog.google/innovation-and-ai/technology/safety-security/fraud-scams-advisory-june-2026/)) |

---

## C. Learning across users without breaking "no server"

The promise as written: "There is no Cluster-operated backend anywhere — nothing you do in the
extension is sent to us" (`docs/privacy.md:9-12`). The OAuth justification says "No Gmail data —
restricted or otherwise — is transmitted to or stored on any Cluster-operated system"
(`docs/oauth-scope-justification.md:6-10`).

### C.1 The policy lines that constrain this

| Policy | Exact line | Link |
|---|---|---|
| Google API Services User Data Policy, Limited Use | "These requirements apply to the raw data obtained from the scopes and data aggregated, anonymized, or derived from them." | [policy](https://developers.google.com/terms/api-services-user-data-policy) |
| same, allowed transfers | "To provide or improve your appropriate access or user-facing features that are visible and prominent in the requesting application's user interface and only with the user's consent"; "For security purposes (for example, investigating abuse)"; legal compliance; merger with consent | same |
| same, prohibited | Transfers to "advertising platforms, data brokers, or any information resellers"; ads; credit-worthiness | same |
| same, assessment | "Depending on the API being accessed and number of user grants or users, applications must pass an annual security assessment and obtain a Letter of Assessment from a Google-designated third party." | same |
| Workspace API User Data and Developer Policy, AI/ML | Prohibits "using user data to create, train, or improve a machine learning or artificial intelligence model beyond that specific user's personalized model for the appropriate use case or user-facing feature." | [Workspace policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy) |
| Chrome Web Store Limited Use | "Only transfer user data to third parties if necessary to providing or improving your single purpose; to comply with applicable laws; to protect against malware, spam, phishing, or other fraud or abuse…" Humans may read data that "is aggregated and anonymized and used for internal operations" | [CWS Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use) |

The 2026-10-05 note read Google's restricted-scope page as tying CASA to apps that store or
transmit data on servers. The general policy text above is less specific ("depending on the API
… and number of user grants or users"). (Inference) Running *any* server that receives
Gmail-derived data makes CASA much more likely. Staying serverless keeps the argument open.

### C.2 The five options

| # | Option | What "learns" | Privacy promise | Policy risk | Solo-dev effort | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Per-user, on-device** | Per-user weights from the user's own releases and confirms. Already sketched: naive Bayes or logistic regression over feature counts, calibrated, with reason codes (algorithm note B.3, B.5) | Unchanged | None. The Workspace AI rule explicitly allows "that specific user's personalized model" | M-L | **Yes** |
| 2 | **Opt-in hashed signals to a tiny server** (domain hash + verdict) | A global reputation table | **Broken.** "Nothing is sent to us" stops being true. A hashed domain is still "derived" data under Limited Use. Domain hashes are reversible by dictionary: the space of sending domains is small (Inference) | Allowed only as "security purposes" or a visible user-facing feature, with consent. Server raises CASA odds. Needs a privacy policy rewrite and store-listing changes | M to build, L to run safely (abuse, poisoning, retention, breach response) | **Not now** |
| 3 | **Federated learning / secure aggregation / DP** | A shared model from many devices | Better than #2 but still a server | FL needs a coordinating server; Bonawitz et al. describe secure aggregation of model updates across devices ([ePrint 2017/281](https://eprint.iacr.org/2017/281.pdf)); McMahan et al. leave data on device and aggregate updates ([arXiv 1602.05629](https://arxiv.org/abs/1602.05629)). RAPPOR collects client strings with local DP in Chrome ([arXiv 1407.6981](https://arxiv.org/abs/1407.6981)). Apple uses local DP for features like emoji suggestions ([Apple overview](https://www.apple.com/privacy/docs/Differential_Privacy_Overview.pdf)). Also, the Workspace AI rule bars a shared model trained on user data | L to XL. Local DP needs very large populations to be useful. With a small user base, the noise swamps the signal (Inference) | **No** |
| 4 | **Consume public feeds and contribute back** | The world's shared lists | Unchanged when the user files the report | User-initiated reporting is the user's own act | S | **Yes** |
| 5 | **Signed rule and blocklist file, download only** | The owner's curation, shipped to everyone | Unchanged. Already the model in `docs/privacy.md:56-63` | None | S (reuse Moat's signer) | **Yes** |

Details for #4 (where reports can go without a Cluster server):

- **Gmail Report phishing:** UI only. Google "receives a copy of the email" when a user reports
  or moves mail to Spam ([Gmail Help](https://support.google.com/mail/answer/1366858)). Best
  reach, since it trains the filter that protects every Gmail user.
- **Google Safe Browsing:** manual form at `safebrowsing.google.com/safebrowsing/report_phish/`
  [secondary: search summary; form not opened]. Takes a page URL, so it only applies when a
  link host is known.
- **APWG:** forward to `reportphishing@apwg.org`, "as an attachment when possible". Reports
  "can be processed by APWG members and re-lodged on the APWG's eCrime eXchange"
  ([APWG](https://apwg.org/reportphishing/)).
- **UK NCSC:** forward to `report@phishing.gov.uk`. Over 32 million reports since 2020 led to
  over 329,000 URLs removed, as of July 2024 [secondary: police press release](https://www.south-wales.police.uk/news/south-wales/news/2024/july/32m-suspicious-emails-reported-to-national-reporting-centre--resulting-in-hundreds-of-thousands-of-malicious-websites-being-removed/).
- **USCIS** (for A4): forward to `USCIS.Webmaster@uscis.dhs.gov` [secondary: search summary of USCIS].
- **PhishTank / URLhaus:** submission needs an account or Auth-Key. URLhaus accepts
  `malware_download` only. Not a fit for a one-tap consumer flow.

(Inference) Cluster has no `gmail.send` scope and should not add it for this. The flow is:
open the message in Gmail and show "Press More ⋮ → Report phishing". For APWG or NCSC, show the
address and the "Forward as attachment" step. The user sends it. Cluster never does.

### C.3 Recommendation

**Do 1 + 4 + 5. Do not run a server.** Reasons:

1. It is the only path that keeps `docs/privacy.md:9-12` literally true.
2. It sits inside the Workspace AI rule ("that specific user's personalized model").
3. Gmail's own model already learns from the whole population. Cluster's unique value is the
   *personal* context (contacts, pinned domains, the user's own releases). A global table would
   rebuild a weaker copy of what Google already has.
4. "Learn from every quarantine" can still help everyone through the owner. When users report
   to Gmail, APWG and NCSC, those reports flow into the lists that Moat and Cluster download
   back. The owner can also curate the signed file from public feeds and the owner's own mail.
5. The signed file closes today's unsigned-dataset risk (algorithm note A.5).

**The one opt-in that is defensible later (flag, not a recommendation):** a "Suggest this domain
to Cluster's list" button that opens a pre-filled public GitHub issue with *only* the sender
domain, which the user reviews and submits from their own GitHub account. It is user-initiated
and visible. It is arguably a "security purpose". But it still contradicts "nothing you do in
the extension is sent to us" in spirit. Only the owner can decide whether that wording changes.

---

## D. Cluster as a security-analytics and web-security product

### D.1 A personal security view, computed from headers

| Panel | How it's computed | Headers only? |
|---|---|---|
| Scams held over time (week, month) | Action log entries for holds and confirms (`src/lib/actionLog.ts`) | Yes |
| By scam type | Reason codes from B.7 (brand claim, government claim, job lure, payment change…) | Yes |
| Brands most impersonated at you | `claimedBrand` on held senders | Yes |
| Senders you trust, and their auth health | DMARC pass rate per known correspondent. A drop is a takeover or spoofing hint (Inference) | Yes |
| First-contact volume | Ledger counts | Yes |
| "Services you use that were breached" | Match the user's sender domains against HIBP's public breach list. `GET /breaches` needs no key and each breach has a `Domain` field ([HIBP API v3](https://haveibeenpwned.com/API/v3)). Download only. Attribution to HIBP required (CC BY 4.0, same page) | Yes, plus one download |
| "Is my address in a breach?" | HIBP email search needs a paid key: "Authorisation is required for all APIs that enable searching HIBP by email address". Email k-anonymity (6-char prefix) is for Pro and above (same page) | (Inference) Not possible without shipping a paid key or running a proxy. Skip, or let the user paste their own key |
| Held, released, confirmed (accuracy) | Quarantine review ledger (`src/lib/quarantineReview.ts`) | Yes. Also the per-user training signal for C.2 #1 |
| Protection coverage | "Delivery-time filters active: N. Last arrival check: 2 min ago." | Yes. Honest about Chrome-closed gaps |

(Inference) Keep this a quiet monthly view. The 2026-09-18 UX note's rule holds: findings are
loud, statistics are calm.

### D.2 Extending protection to the web

What it would need in Cluster: content scripts or `webNavigation` (warning text: "Read your
browsing history"), `declarativeNetRequest` ("Block content on any page"), and broad host access
([permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)).
Broad host patterns like `<all_urls>` "give extensions extensive access to the user's web
activity" and lengthen review
([CWS review process](https://developer.chrome.com/docs/webstore/review-process)).

The single-purpose rule: "An extension must have a single purpose that is narrow and easy to
understand. Don't create an extension that requires users to accept bundles of unrelated
functionality." Its own bad example is "Email notifiers combined with a news aggregator"
([CWS quality guidelines](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines)).

What Moat already does (checked in `C:\Users\samue\projects\moat`):

- Permissions `storage tabs webNavigation declarativeNetRequest declarativeNetRequestFeedback privacy`,
  host `<all_urls>` (`scripts/manifest.ts:77-91`).
- Daily phishing, malicious-URL and scam domain lists from malware-filter and
  jarelllama/Scam-Blocklist, applied as DNR block rules in a security band that pausing a site
  cannot override (`src/shared/liveSecurity.ts:1-29`, `src/background/liveSecurityRules.ts:1-25`).
- Ed25519 signature check on the live manifest (`src/background/liveSignature.ts:1-46`).
- Hijacked pop-up closing (`src/background/popupGuard.ts`), README "Closes hijacked pop-ups".
- HIBP Pwned Passwords k-anonymity check on password fields (`src/shared/hibp.ts:1-25`).

Overlap with Chrome itself: Chrome 137 Enhanced Protection gives Gemini Nano "the contents of
the page" to extract signals such as intent, and "LLM-summarized security signals are only sent
to Safe Browsing for users who have opted-in to the Enhanced Protection mode"
([Google](https://blog.google/security/using-ai-to-stop-tech-support-scams-in/)).

**Recommendation: web protection lives in Moat. Cluster stays email. Build a shared core.**

| Piece | Home | Why |
|---|---|---|
| Page and link blocking, lookalike-site warnings, fake shops, payment-page checks | **Moat** | It already holds the permissions, the DNR engine, the lists and the signing. Adding them to Cluster breaks single purpose and slows review |
| Signed threat-data package (phishing, scam, malware domains; brand domains; government suffixes; confusables) | **Shared** | One publisher, one key, two consumers. Cluster matches sender and link domains. Moat blocks navigation |
| Lookalike / TR39 skeleton / registrable-domain (PSL) library | **Shared** | Both need it. One test suite |
| Email-to-web hand-off: Cluster tells Moat "these domains appeared in mail you were warned about" so Moat warns if the user visits them | **Bridge** (Inference) | Local `chrome.runtime.sendMessage` between two known extension ids via `externally_connectable`. Nothing leaves the device. Optional |
| Header analysis, quarantine, Gmail filters | **Cluster** | Needs the Gmail scopes Moat must never hold |

(Inference) The bridge must be one-way, allow-listed by extension id, and carry only domains.
Each extension must keep working alone.

### D.3 Competitors and how they work

| Product | What it does | Where analysis runs | Source |
|---|---|---|---|
| Gmail | Filters >99.9% of spam, phishing, malware. Warnings, Spam folder | Google servers | [Google](https://blog.google/products-and-platforms/products/gmail/gmail-holidays-2024-spam-scam/) |
| Chrome Enhanced Protection | Gemini Nano page-intent signals for tech-support scams | On device; signals sent to Safe Browsing for Enhanced users | [Google](https://blog.google/security/using-ai-to-stop-tech-support-scams-in/) |
| Google Messages Scam Detection | Warns on conversational scams in SMS/RCS | On device; "does not store or have access to conversation data" [secondary: search summary of Google's announcement] | [Google blog](https://blog.google/security/new-ai-powered-scam-detection-features/) |
| Norton Genie / Safe Email | "Safe Email proactively scans emails to detect hidden scam patterns" | Cloud. Gen Digital runs Genie on AWS serverless [secondary] | [Norton](https://us.norton.com/blog/online-scams/norton-genie), [AWS case study](https://aws.amazon.com/solutions/case-studies/gen-digital-video-case-study/) [secondary] |
| Bitdefender Scamio | Chatbot. Paste text or links, or upload screenshots. Free | Not stated on the product page | [Bitdefender](https://www.bitdefender.com/en-us/consumer/scamio) |
| Malwarebytes Browser Guard | Reputation database, search-result ratings, "Scam Guard Lite" page analysis | Reputation via Malwarebytes database. Page analysis "on your device using a large language model" | [Malwarebytes, Sep 2026](https://www.malwarebytes.com/blog/product/2026/09/new-browser-guard-features-add-protection-before-and-after-you-click) |
| Guardio | Connect Gmail. Labels "Flagged by Guardio", lists it on a dashboard, mobile push. Premium | (Inference) Server-side, since it pushes to the phone with the browser closed | [Guardio help](https://help.guard.io/hc/en-us/articles/16222692346388-What-is-Email-Security) [secondary: search summary] |

(Inference) Guardio is the closest competitor to Cluster's protection story. It labels rather
than moves, and it needs a server for push. Cluster can beat it on privacy and on moving the
mail out of the inbox. It cannot beat it on Chrome-closed alerts without a server.

### D.4 Warning design for older adults

- **Active beats passive.** In a lab study, 79% of participants heeded active (interrupting)
  phishing warnings. Only one participant heeded the passive one
  ([Egelman, Cranor, Hong, CHI 2008](https://www.semanticscholar.org/paper/You've-been-warned:-an-empirical-study-of-the-of-Egelman-Cranor/114580bca9932bfc4e0018886646751adfac724f)
  [secondary: figures via search summary]).
- **Warnings can work at scale.** Across 25 million impressions, users clicked through about a
  tenth of Firefox and a quarter of Chrome malware/phishing warnings, versus 70.2% of Chrome SSL
  warnings. "The user experience of a warning can have a significant impact"
  ([Akhawe & Felt, USENIX Security 2013](https://www.usenix.org/conference/usenixsecurity13/technical-sessions/presentation/akhawe)).
- **Put the warning on the link.** Link-focused warnings lowered click-through compared with
  banners, and forcing attention to the real URL lowered it most
  ([Petelka, Zou, Schaub, CHI 2019](https://dblp.org/rec/conf/chi/PetelkaZS19.html)
  [secondary: abstract via search summary; ACM page 403]).
- **Older users don't learn from exposure the way younger ones do** (Lin et al. 2019 above).
  (Inference) So for persona 3, moving the mail is safer than teaching. Prevention over education.
- **Clear words and safety help** are explicit W3C cognitive-accessibility patterns
  ([W3C COGA](https://www.w3.org/TR/coga-usable/)).

Design rules this implies for Cluster (Inference):

1. Hold, don't warn, for high tier. A held message can't be clicked from the inbox.
2. Elevated tier stays in the inbox with a label. No dashboard needed.
3. Explain with the user's own context ("never emailed you before") and the claim versus the
   reality ("says PayPal, sent from Gmail"). Max three reasons, no jargon.
4. One safe action, named concretely: "Call them on the number on your card."
5. Large type and plain words on the dashboard's held-mail view. Never colour alone.

---

## E. Recommendations

### E.1 Ranked table

Personas: 1 student, 2 store owner, 3 eighty-year-old, 4 creator, A1 caregiver, A2 job seeker,
A3 home buyer/renter, A4 newcomer, A5 high-risk.
Privacy impact: **none** (no new data leaves or is read), **opt-in** (only when switched on),
**posture** (changes the written promise).

| # | Item | Personas | Layer | Privacy | New permission / scope | Effort | Risk |
|---|---|---|---|---|---|---|---|
| 1 | Fix the AR parser and the free-mail-in-brand-allow-list bug (algorithm note A.4, A.5) before speeding anything up | All | All | none | none | S | Low. Faster quarantine of wrong verdicts is worse than slow |
| 2 | **Arrival lane**: 1-minute alarm, `history.list`, per-message scoring, hold high tier | All, esp. 3, A1 | on-arrival | none | none | S | Medium: SW wake cost; false positives now act faster. Keep known-correspondent guard (`background.ts:201-207`) |
| 3 | **Signed shared threat file** (Ed25519, Moat's signer); switch sender matching to phishing and scam domain lists | All | filter, arrival, sweep | none | none | S-M | Low. Closes the unsigned-dataset risk |
| 4 | **Delivery-time filters**: packed `from:` for signed bad domains and user blocks; risky-attachment filter; label-only lure filter | All, esp. 3, A1 | filter-at-delivery | none | none (`gmail.settings.basic` held) | S-M | Medium: 1,000-filter cap; unknown query length; must reconcile on list updates |
| 5 | **Live test spike**: `header:Authentication-Results:dmarc=fail` and `from:(brand) -from:(@brand.com)` in filters; Outlook `headerContains` | All | filter-at-delivery | none | none | S | None. Decides whether #4 can include auth |
| 6 | **Plain-language held label and reasons** (B.6) | 3, A1, A4 | all | none | none | S | Low |
| 7 | **Pinned trusted domains** as lookalike targets + payment-change subject set | 2, A3, freelancer, 1 | arrival, sweep | none | none | M | Medium: UX for pinning; FPs on real domain moves |
| 8 | **Scam-type lexicons** (job, government, callback-phone, sponsorship), multilingual; government-suffix rule | A2, A4, 3, 4 | arrival, filter (keywords) | none | none | M | Medium: English bias; keep low weight alone |
| 9 | **Report-out flow** (open in Gmail → Report phishing; APWG/NCSC forward steps) | All | sweep / UI | none | none | S | Low |
| 10 | **Security view** (D.1) incl. HIBP breach-list domain match | All | sweep | none (one download host) | add HIBP host to `host_permissions` | M | Low. HIBP attribution required |
| 11 | **Opt-in auto link check** for elevated/high mail only, local signed list | 3, 4, A2 | arrival | **opt-in** (reads body) | none (scope held) | M | High trust cost. Must update `docs/privacy.md` |
| 12 | **Per-user learned layer** (algorithm note B.3) trained on releases and confirms | All | arrival, sweep | none | none | L | Medium: must never remove a protection by itself |
| 13 | **Helper set-up** (strict defaults, label review via delegation) | 3, A1 | config | none | none | M | Low. Can't notify the helper remotely |
| 14 | **Job-search and strict modes** | A2, A5 | config | none | none | S-M | Low |
| 15 | **Cluster ↔ Moat bridge** (domains from held mail → Moat warns on visit) | 3, A1, 4 | web | none (local only) | `externally_connectable` in both | M | Medium: cross-extension trust; both must work alone |
| 16 | Keep Chrome alive after windows close (`background` permission) | 3, A1 | on-arrival | none | `background` | S | Medium: user surprise. Off by default |
| 17 | Gmail push via Pub/Sub, or any cross-user telemetry server | All | on-arrival | **posture** | server + likely CASA | L | High. Not recommended now |
| 18 | Web blocking inside Cluster | — | web | posture | `<all_urls>`, `webNavigation`, DNR | L | High: single-purpose, review time, duplicates Moat. **Don't** |

### E.2 Phased roadmap

**Phase P0 (correctness, S).** #1 parser and brand bugs. #5 live filter test. These decide what
the later phases can promise.

**Phase P1 (fast and persistent, S-M).** #2 arrival lane. #3 signed shared file. #4 delivery
filters. #6 plain-language held label. Together these move protection from "every 6 hours while
Chrome is open" to "at delivery for known-bad, within a minute for the rest".

**Phase P2 (personal context, M).** #7 pinned domains. #8 scam lexicons. #9 report-out flow.
#14 modes. #13 helper set-up.

**Phase P3 (insight, M).** #10 security view. #12 learned layer (it needs the release/confirm
data P1-P2 generate).

**Phase P4 (only with explicit owner decisions).** #11 opt-in link check. #15 Moat bridge.
#16 background permission.

**Not planned.** #17 and #18.

### E.3 Open questions for the owner

1. **Any server, ever?** Push notifications, cross-user learning, HIBP email checks and
   remote caregiver alerts all need one. Each changes `docs/privacy.md:9-12` and raises CASA
   odds. This note recommends no.
2. **Is Cluster commercial?** If it is sold or monetised, Safe Browsing is off the table ("for
   non-commercial use only") and Web Risk costs money. OpenPhish and abuse.ch also treat
   commercial use differently.
3. **Where does web protection live?** This note says Moat, with a shared signed data package
   and library. Do you want the two extensions to talk to each other (#15) or stay fully separate?
4. **Default quarantine destination.** A Cluster label (private, reversible) or Spam (trains
   Google, deleted after 30 days)? And should auto-quarantine default to on for a "protect
   someone I care for" set-up?
5. **Body reading for links (#11).** Acceptable as an opt-in for already-flagged mail only?
6. **Keep Chrome running (#16).** Acceptable to ask for the `background` permission in helper set-up?
7. **A "Suggest to Cluster's list" GitHub-issue button (C.3)?** It is user-initiated, but it
   bends the "nothing is sent to us" wording.
8. **Family Link / child accounts.** Not researched. Do you want a persona for parents?

### Sources not reached or only partly read

- rfc-editor.org and datatracker.ietf.org reset the connection this session. RFC 9989 status is
  carried over from the 2026-10-05 note, not re-verified.
- IC3 2025 PDF: read through a text layer with broken column alignment. Totals and the 60+
  headline box are clean; per-type figures were rebuilt and are marked.
- ACM pages for Petelka 2019 returned 403. Egelman 2008 and Lin 2019 figures are from abstracts
  via search summaries.
- Google's restricted-scope help page did not include the security-assessment wording on fetch.
- Gmail filter query length limit: not found in Google's docs.
- Whether `SPAM` added through the API counts as a user report: not documented anywhere I found.
