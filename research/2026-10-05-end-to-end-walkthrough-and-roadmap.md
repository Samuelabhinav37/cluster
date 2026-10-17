# Cluster: end-to-end walkthrough, competitor check, and roadmap

_2026-10-05. Branch `redesign/apple-glass-v3` at `359861f`. Builds on the earlier research docs
and does not repeat them. The competitor landscape lives in `2026-09-01-state-of-cluster-and-competitors.md`
and `2026-09-09-competitor-ux-decision-fatigue-patterns.md`._

## How this was tested

The browser automation tool cannot open `chrome://extensions` or `chrome-extension://` pages,
so it could not drive the installed copy. Instead the real built bundle (`dist/`) was served on
localhost with two stand-ins:

- a stub `chrome.*` API (storage, identity, permissions, alarms), and
- a fake Gmail backend answering the same REST endpoints the code calls.

The fake inbox has 43 senders and about 330 messages. It covers shops, newsletters, social
notifications, banks, one-time codes, shipping, receipts, travel, paid plans with trial and
renewal wording, family and work contacts, two cold-outreach strangers, and three brand
lookalike phishing senders with failed DMARC. Everything below the OAuth popup is the real UI
code running against that data. The Google consent screen itself was simulated, so its wording
comes from the scopes in `manifest.json`.

The harness is now committed as `npm run preview:ui` (`scripts/preview/`, documented in
`docs/testing.md`).

> **Correction (same day).** An earlier draft of this doc reported a broken light theme and
> blamed Chrome's Auto Dark Mode. Wrong: the user's **Dark Reader** extension was re-tinting
> the localhost preview. Dark Reader can't inject into another extension's
> `chrome-extension://` page, so the installed Cluster was never affected, and the light theme
> renders correctly. The "half-styled" look of the cancelled-sign-in screenshot was the same
> artifact. The preview server now sends `<meta name="darkreader-lock">`.

## 1. The journey, step by step

### Install
`chrome.runtime.onInstalled` only registers alarms (`src/background.ts:52`). **Nothing opens.**
A new user installs, sees no page, and has to find an unpinned icon in the puzzle menu. Every
competitor opens a welcome tab here.

### First click → sign-in
`main()` calls `gmailProvider.getAuthToken(true)` straight away (`dashboard.ts:365`). Google's
popup appears over a page that still says "Connecting…". The trust banner ("never message
bodies, nothing deleted without you confirming") sits behind the popup at the exact moment the
user needs to read it. There is no "Connect Gmail" step and no explanation of why
`gmail.modify` is needed. While the OAuth app is in Testing, the real popup also shows
"Google hasn't verified this app", so the first impression is a warning with no context.

### Cancelled sign-in
Clicking Cancel leaves **"Something went wrong (unknown error). Reload"**. The reason it says
"unknown error": `getAuthToken` rejects with `chrome.runtime.lastError`, which is a plain
object, not an `Error` (`gmailApi.ts:58`). `main().catch` only reads `.message` from real
`Error`s (`dashboard.ts:2900`). Reload fires the popup again. The header still shows "Connect Outlook". There is no way
forward except trying again.

### First scan
The status line shows real progress ("Scanning recent mail… 141/150 messages"). The page
behind it is empty, with no skeletons (P3.1). In the harness this took a couple of seconds.
On a real mailbox the earlier live test measured 30 to 45 seconds.

### Overview
Clear, calm, good hierarchy. "29 messages across 1 group", "Start cleanup", inbox health 57,
one "Needs a person" card. Problems:

- **The sample is tiny and the headline is built on it.** The default is the newest 150
  messages (`settingsStore.ts:132`). For anyone getting 50+ mails a day that is two or three
  days of mail, yet labels read "180 days" and "Count (180D)". The honesty note exists, but
  the numbers still under-sell the product on first run ("29 messages" feels trivial).
- **Wrong copy on the phishing card.** "4 senders may be impersonating people you know /
  display name matches a known contact" (`dashboard.ts:851`). All four were brand lookalikes
  (Netflix, PayPal, Apple, Facebook), not contacts.
- The onboarding banner spans the full width while content is capped near 850px, so it reads
  as a different layer. It also sits above the page title on every screen until dismissed.
- The sidebar scrolls away with the page. It should be sticky.

### Delete
Good structure: one recommended plan, the rest folded. Problems:

- The plan card on the **Delete** screen recommends **"Mute all"**, and its copy says
  "muting files them out without deleting". That breaks the screen's own promise
  ("everything here ends in Trash").
- "By domain" says "grouped by base domain" but shows `t.delta.com`, `mail.adobe.com`,
  `accountprotection.microsoft.com` as separate rows. That is roadmap item #1 from the 09-01
  doc (registrable-domain helper), still open.
- **Shared-platform domains are dangerous here.** `substack.com` is one row, so "Delete
  domain…" would trash Lenny's Newsletter (90% read) along with every other Substack. The same
  applies to `medium.com`, `beehiiv.com`, `gmail.com` and similar. These need per-sender rows.

### Organize
The decision list ranks well (never-opened first). Problems:

- Every row renders its full options strip (Unsubscribe / Keep sorted / Mute / 1 week /
  Snooze / Not useful) underneath the primary button. Eight rows means about 50 visible
  controls, the exact decision-fatigue pattern the 09-09 doc warned about.
- "Uber Receipts: nothing opened of 5 → Mute". Receipts are meant to go unread, so "never
  opened" is not a signal for transactional mail. The Delete screen marks Uber as
  "5 protected" while Organize suggests muting it. The two screens disagree about one sender.
- Smart view "One-time codes (0)" although the fake inbox has Google and Microsoft codes.
  Possibly a sampling effect. Worth checking against a real inbox before treating it as a bug.

### Subscriptions
- **Every newsletter is labelled "Monthly"** (0 daily, 0 weekly, 18 monthly). Medium sends
  about 1.6 a week. Cause: `cadenceLabel` divides the sampled count by `scanWindowDays/7`
  (180 days) (`subscriptionsTab.ts:34`), but the sample only covers the last 150 messages.
  The denominator should be the span the sample actually covers.
- **"Paid subscriptions & trials" is mostly false positives.** Amazon (twice), GitHub, Apple,
  Adobe and Lenny's Newsletter show up, all labelled "Seen". A domain match alone creates a
  paid-subscription row (`subscriptionSignals.ts:85`, `"domain-match": "Seen"`). Amazon
  marketing and a free Substack are not paid plans. The real trial ("Spotify: free trial ends
  in 3 days") and renewal (Netflix) were missing from this sample.
- Row actions read "Email / Read later… / Keep". "Email" is how a mailto unsubscribe is
  shown. The word "Unsubscribe" does not appear on the row.
- "0 of 0 selected" with a checkbox shows when nothing qualifies for one-click. Hide it.

### Phishing
The strongest screen. "Claims to be" next to "Actually sent from" with SPF/DKIM/DMARC marks,
a plain reason list, and "treat this as a prompt to look, not a verdict". Problems:

- **False positive on real Facebook.** `notification@facebookmail.com` with SPF ✓ DKIM ✓
  DMARC ✓ is flagged "claims to be facebook, domain doesn't match", in red. `brandDomains.json`
  has `facebook: [facebook.com, fb.com, meta.com]`, so `facebookmail.com` is missing. A fully
  aligned DMARC pass on a domain that big brands use for mail should never land in red. This
  is the kind of error that teaches users to ignore the screen.
- SPF shows "—" when the header says `softfail`. The parser appears to drop softfail.
- A Reply-To on a different domain (the classic credential-phish tell) was present on all
  three fakes and never listed as a reason.
- `google: [google.com, gmail.com]` lists gmail.com as a Google brand domain. Check that
  "Google Security <anything@gmail.com>" still gets flagged. The freemail-claim path in
  `threatSignals.ts` may cover it, but no test proves it.

### Screener, Rules, All senders, Recently done
Clean and clear. The Screener off-state could preview its value ("2 senders would have been
held this month") rather than just saying "Screener is off." The Rules natural-language drafter
with example chips is good.

### Theme
Light and dark both render correctly. See the correction near the top: the apparent breakage
was Dark Reader acting on the localhost preview.

### What worked well
No console errors across every screen. 150 metadata reads plus 5 list/label/filter calls per
cold scan, which is efficient. The account pill, nav counts, warm cache path and Got-it
persistence all behaved. The visual design is calm, the type is good, and copy is mostly
honest and specific.

## 2. How it compares (Oct 2026)

What changed since the 09-01 doc:

- **Gmail's native "Manage subscriptions"** (rolled out from July 2025) lists senders by
  frequency with one Unsubscribe button each.
  [TechCrunch](https://techcrunch.com/2025/07/08/gmails-new-manage-subscriptions-tool-will-help-declutter-your-inbox/)
  Plain unsubscribing is now free and built in. Cluster's Subscriptions screen has to beat it
  on accuracy (correct cadence, verified result, "unsubscribe + clean") or it is redundant.
- **Gemini inbox cleanup** lets you ask in plain language to delete or archive a batch and
  approve it in one click.
  [Android Authority](https://www.androidauthority.com/google-gemini-gmail-inbox-cleanup-3559419/)
  Reviewers note it only runs inside a session and does not make standing rules.
  [Carly](https://www.usecarly.com/blog/can-gemini-manage-my-inbox/) Rules, background sorting
  and the Screener are where Cluster can stay ahead.
- **InboxPurge** is the closest analogue: a local-only Chrome extension on the Gmail API,
  4.6★ from 600+ reviews, 20k+ users, OAuth-verified, and it **lives in a Gmail sidebar**.
  [InboxPurge](https://www.inboxpurge.com/) Reviewers fault it for having no automation and no
  verified unsubscribe. [Clean Email review](https://clean.email/blog/clean-email-alternatives/best-inboxpurge-alternative)
  (a competitor's blog, so biased).
- **Mailstrom** (metadata-only, $59.99/yr), **Clean Email** (33 smart views, cross-platform,
  processes full content), **SaneBox** (background filtering, training loop) and **Leave Me
  Alone** (privacy-first unsubscribe) round out the field.
  [Mailstrom's comparison](https://mailstrom.co/articles/best-email-cleanup-tools-2026/)
  (also a vendor source).

| | Cluster | InboxPurge | Clean Email | Gmail native + Gemini |
|---|---|---|---|---|
| Where it runs | Separate tab | Gmail sidebar | Web/apps | Inside Gmail |
| Data leaves device | No | No | Yes (servers) | Google |
| Mailbox coverage | **Newest 150 msgs** | Whole mailbox | Whole mailbox | Whole mailbox |
| Verified unsubscribe | **Yes (RFC 8058 only)** | No | Partial | Sends request |
| Standing rules / background | Yes (filters + 6h pass) | No | Yes | No |
| Phishing evidence | **Yes, header-based** | No | No | Gmail's own |
| Screener | Yes | No | Yes | No |
| OAuth verified | **No (Testing, 100 users, 7-day tokens)** | Yes | Yes | n/a |
| Onboarding | **None** | Guided | Guided | n/a |

**Where Cluster wins:** honesty (verified unsubscribe, metadata-only, nothing hidden), the
phishing screen, local rules plus server-side filters, and the Screener. No competitor in the
local-only tier has all four.

**Where it loses:** onboarding, coverage (150 messages vs whole mailbox), unverified OAuth,
and living outside Gmail. These are exactly what a new user meets in the first 60 seconds.

## 3. Algorithm and "under the hood"

1. **Coverage is the root problem.** Each `messages.get` costs 20 quota units, so fetching the
   whole mailbox is expensive. Cheaper approach:
   - **Discover** senders from a metadata sample (today's pass).
   - **Size** each sender with `messages.list q=from:<addr>`. That costs 5 units per page and
     returns ids, so you get real counts across the full mailbox (`resultSizeEstimate` or
     paged ids) for about a quarter of the cost.
   - **Age buckets** per sender with `older_than:` queries the same way.

   This turns "29 messages" into the real number (often thousands) and fixes cadence,
   "never opened", the domain table and inbox health in one go. Opened/unread per sender can
   use `from:x is:unread` counts.
2. **Cadence from observed span**, not the scan window. Fold this into (1).
3. **Message-kind awareness in engagement.** "Never opened" should not count against
   receipts, shipping, OTPs or bank alerts. `messageKind.ts` already classifies these, so
   feed it into the decision ranker and make the "protected" policy shared by both Delete
   and Organize.
4. **Shared-platform senders.** Keep a list (substack.com, medium.com, beehiiv.com,
   mailchimp sending domains, gmail.com, outlook.com…) where grouping is by address, never by
   domain.
5. **Brand aliases plus a DMARC-aligned discount.** Add mail-sending aliases
   (`facebookmail.com`, `mail.instagram.com`, `x.com`/`twitter.com`, `amazonses`-signed,
   `paypal.co.uk`…). When the From domain passes DMARC with alignment, and it is on the brand's
   alias list *or* has strong history in this mailbox, demote it below red. Add Reply-To
   domain mismatch and SPF softfail as reasons.
6. **Paid-subscription signal:** require billing wording (receipt, invoice, charged, renews,
   trial, plan, membership) for a row. Domain-only matches become a quiet "possible" footnote
   at most.
7. **Correction loop.** "Not useful", Keep, Allow and "This is genuinely them" should write
   per-sender weights (09-01 doc item 3). Still not built.

## 4. Roadmap

Ordered by what a new user hits first. S = days, M = 1–2 weeks, L = weeks.

### Phase 0: first-run fixes (do before more P2 refactoring) — 0.1, 0.2, 0.4 done 2026-10-05
- **0.1 Welcome flow (M).** `onInstalled` opens the dashboard with `?welcome`. Step 1 is a
  one-screen explainer (what is read, what is never read, nothing deleted without you) with a
  single "Connect Gmail" button. Only that button calls `getAuthToken(true)`. Step 2 is the
  scan with skeletons. Step 3 lands on Overview with one highlighted next step. Prompt the
  user to pin the icon.
- **0.2 Cancelled consent (S).** Normalise `lastError` into an `Error`. Show "Cluster needs
  Gmail access to work. [Connect Gmail]" rather than "unknown error". Hide the avatar and
  Outlook button until connected.
- ~~0.3 Color-scheme meta.~~ Dropped: based on the Dark Reader misdiagnosis above.
- **0.4 Commit the preview harness (S).** `scripts/preview/` plus `npm run preview:ui`, with
  query flags for first-run, denied and offline states. Every UI change can then be checked
  visually without reload-unpacked or OAuth.

### Phase 1: trust and accuracy
- **1.1 Phishing false positives (S):** brand aliases, DMARC-aligned discount, softfail,
  Reply-To reason, fix the "people you know" copy, and add a test for "Google <x@gmail.com>".
- **1.2 Paid-subscription signal (S):** billing wording required.
- **1.3 Cadence from observed span (S).**
- **1.4 Shared-platform domains (S)** in the domain table and bulk delete.
- **1.5 Kind-aware engagement + one protection policy (M)** across Delete and Organize.
- **1.6 "Mute all" off the Delete screen (S).** Move it to Organize, or relabel the plan.

### Phase 2: coverage (the big one)
- **2.1 Whole-mailbox sizing via cheap list queries (L).** See §3.1. Change the default from
  "newest 150" to "discover from sample, size from list". Update every "(180D)" label to
  describe what was actually counted.

### Phase 3: UI calm-down (overlaps the redesign plan's P2/P3)
- Collapse per-row option strips behind the "…" menu. One primary action per row.
- Sticky sidebar, banner width aligned to content, skeletons (P3.1).
- Rename "Email" to "Unsubscribe (email)". Hide "0 of 0 selected".
- Screener off-state shows a preview count.

### Phase 4: reach
- **OAuth verification.** `gmail.modify` is a restricted scope, so leaving Testing needs
  Google's verification plus a CASA assessment. Until then: a 100-user cap, 7-day token
  expiry, and the "unverified app" warning. Budget for it now, since it gates any public
  launch. See `docs/oauth-scope-justification.md`.
- **In-Gmail presence.** A small content-script entry point in Gmail ("Clean up 312 from
  Groupon") that deep-links into the dashboard. This is where InboxPurge and Gmail's native
  tools meet users. Adds a host permission, so weigh it against the privacy story.
- Then the redesign plan's Phases 4–5 (confidence, retention, account switching).

### Keep doing
The live-test checklist still has to be run in real Chrome against the real inbox. The
harness proves the UI. It cannot prove Gmail's real quota, real headers or the real consent
screen.
