# How others put mail into labels, and what Cluster should change (2026-11-18)

Research only. No code changed. This adds to the earlier notes and does not repeat them:
`2026-08-31-inbox-sorting-and-labels.md`, `2026-11-13-algorithm-vs-competitors.md`, `2026-11-14-classify-learn-onboard-research.md`, `2026-11-15-email-classification-papers.md`, `2026-11-15-sorting-mistakes-research.md`, `2026-11-15-competitor-sorting.md`.

Rules: primary sources only (vendor help pages, vendor blogs, papers, source code). Each claim has a URL. Anything I could not confirm from a primary source says **unconfirmed**.

## 1. Summary

- The Netflix scam got the Receipts label because the Gmail filter for subject kinds has no sender check at all. It matches "receipt" from any address, free mail included. The client rule "free mail never gets a label" does not exist on the server side. When the scam hold later moves the mail, it adds Suspicious and removes INBOX but leaves the Receipts label on. Both halves need fixing.
- Every large product runs safety before sorting, or hides strangers first (Gmail spam, HEY Screener). Cluster's server filters run before its own scam check. So the filters must only label senders whose identity is already settled.
- Gmail exposes two more of its own classifiers as search operators: `category:purchases` and `category:reservations`. Cluster reads the first on the client only and ignores the second. Both are Google's content-based verdicts that Cluster can use without reading a body.
- Apple Mail now sorts into four categories from metadata only on iCloud.com, and on device on iOS. That is the same promise Cluster makes, from the biggest player.
- Inbox Zero's open source shows careful learning rules Cluster lacks: a bulk sweep teaches nothing, one label removal is only a hint, and only a second removal at a different time becomes a rule.
- Nobody else solves multi-service companies by domain. They correct per sender address (Apple, Spark, HEY, Outlook, Shortwave), and the papers group by sender pattern plus subject template.

## 2. How each one does it

### Gmail (tabs, Purchases, Promotions, AI Inbox)

- Signals. Categories use Google's own model. Gmail only says it learns when you drag mail between tabs. https://support.google.com/mail/answer/3094499
- Search exposes seven categories: `category:primary`, `social`, `promotions`, `updates`, `forums`, `reservations`, `purchases`. https://support.google.com/mail/answer/7190
- Purchases view (September 2025, personal accounts). It lists "all purchase-related emails and package updates". Packages arriving within 24 hours still show at the top of the inbox. How mail is picked is not stated. https://blog.google/products-and-platforms/products/gmail/one-stop-purchase-tracking-in-gmail/
- Promotions can now sort by "most relevant", which favours "senders and brands" you engage with. "Most recent" stays as an option. Same source.
- AI Inbox (January 2026). It finds VIPs "based on signals like people you email frequently, those in your contacts list and relationships it can infer from message content". It does not move mail. https://blog.google/products-and-platforms/products/gmail/gmail-is-entering-the-gemini-era/
- Gemini creating or suggesting Gmail labels: **unconfirmed**. I found no Google page for it. Gemini labelling exists for Drive files, not Gmail. https://workspaceupdates.googleblog.com/2026/
- Scams. Spam and phishing filtering happen in Gmail before you see the tab. The order of spam check and user filters is not documented. **Unconfirmed.**
- Cold start. None needed. The model is global.

### Apple Mail (iOS 18.2+, macOS, iCloud.com)

- Four categories. Primary is "personal messages, direct communications, and time-sensitive information". Transactions is "confirmations, receipts, and shipping notices". Updates is "news, newsletters, and social updates". Promotions is "marketing, coupons, and sale messages". https://support.apple.com/guide/icloud/use-categories-mmafbebd3108/icloud
- Time-sensitive mail in another category is "also included in the Primary email list". You can say "Don't Show In Primary". Same source.
- Signals. "Apple processes certain email metadata ... This metadata does not include the body content of your emails." On iCloud.com it uses "senders and email header information". On iOS "categorization processing occurs entirely on-device". https://www.apple.com/legal/privacy/data/en/mail-categorization/
- Learning. Categorize a sender and "Your choice applies to all current and future messages from the sender". Reset removes every manual choice. https://support.apple.com/guide/icloud/use-categories-mmafbebd3108/icloud
- Multi-service companies. Correction is per sender address, so `orders@` and `deals@` at one company can differ. Same source.

### Outlook Focused Inbox

- Signals. "The system takes into account emails and contacts with whom you interact, and filters out noisy sources like automatically generated or bulk email." https://support.microsoft.com/en-gb/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978
- Learning. Two choices: "Move to Other" moves one message. "Always move to Other" applies to "all future messages from the sender". Same source.
- Admins can force mail past it with the header `X-MS-Exchange-Organization-BypassFocusedInbox` set by a transport rule. This is from an archived Microsoft page. https://technet.microsoft.com/en-us/library/dn957584(v=exchg.150).aspx

### Yahoo Mail Views

- Views: Subscriptions, Shopping, Receipts, Travel, plus Contacts, Photos and Documents. https://help.yahoo.com/kb/new-mail-for-desktop/navigate-emails-views-yahoo-desktop-sln36325.html
- The signals are not documented on the help page. The Yahoo Labs papers in the 2026-11-15 notes (CIKM 2014, AAAI 2022) describe the research system. Whether production Views use it is **unconfirmed**.
- Yahoo also threads machine mail by the action that caused it (an order, then its shipping notices), not by "Re:". The authors measured machine mail at over 60% of traffic. Ailon, Karnin, Liberty, Maarek, WSDM 2013, https://dblp.uni-trier.de/rec/conf/wsdm/AilonKLM13.html , patent US8856249 https://patents.google.com/patent/US8856249 . I read the abstract and patent summary only.

### HEY

- No model. Every first-time sender waits in the Screener. Contacts you add or import skip it, and so does anyone who puts your Speakeasy code in the subject. https://help.hey.com/article/722-the-screener
- Whole domains. You can screen in or out "@domain", but "large domains such as @gmail.com can't be screened out all at once". Same source.
- Paper Trail holds "receipts, order confirmations, and other transactional emails". It is set per contact. Moving one email does not change "where future emails from that sender go". https://help.hey.com/article/787-paper-trail
- Screening a sender back in shows their mail from the last 90 days. https://help.hey.com/article/722-the-screener

### SaneBox

- "Based on headers (sender, subject, etc.)". Moving mail between folders trains it. https://www.sanebox.com/help/155-how-does-sanebox-work
- The page does not say whether training is by sender or sender plus subject. The 2026-11-13 note said "services by sender and subject". I could not find that wording on a primary page today, so treat it as **unconfirmed**.

### Superhuman

- Help pages return 403 to automated reads. Earlier notes cover Auto Labels (Marketing, Pitch, Social, News) from search snippets and TechCrunch. Built-in labels sit under Settings, Auto Labels, and custom labels are tuned by editing the prompt with an example email. This comes from a search summary of https://help.superhuman.com/hc/en-us/articles/39785596906387 and is **unconfirmed**.

### Shortwave

- AI filters take "natural language descriptions, traditional search queries, or a combination of both". "Reapply filters" on chosen mail shows "exactly what actions the AI takes and why". https://www.shortwave.com/docs/guides/labels/
- Labels can be "automatically applied or removed on a per-sender basis". They sync with Gmail and can be "fine-tuned with Gmail filters". Same source.
- The page does not say corrections retrain the AI.

### Spark

- Smart Inbox cards: People, Notifications, Newsletters. A correction applies to "all future emails from this sender". Gatekeeper screens new senders on paid plans. https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox
- New Auto-Labels (beta, Gmail only): To respond, FYI, Comment, Marketing, Meeting update, Notification, Actioned. At most one per email. They cover new mail and "up to 300 messages from the last 7 days". https://sparkmailapp.com/help/spark-ai/auto-labels-in-spark
- Spark states plainly that it "doesn't automatically learn from your corrections" and "does not silently retrain a model". Same source.

### Clean Email

- Smart Folders: Top senders, Automated messages, You are CC-ed, Misc notifications, Finance, All Messages. Criteria are not stated except volume for Top senders. Spam and pinned mail are never included. "The preview contains only email meta-data." https://clean.email/help/basics/smart-folders

### Inbox Zero (open source, read the code)

Repo: https://github.com/elie222/inbox-zero . Files read on 2026-11-18.

- Categories are per sender, not per message: Newsletter, Marketing, Receipt, Notification, Other. Banking, Travel, Personal and others are commented out for later. `apps/web/utils/categories.ts`
- Cascade. Cheap static rules first, then an LLM only for what is left. `apps/web/utils/categorize/senders/categorize.ts`
  - Newsletter if the address contains "newsletter" or is on substack.com, mail.beehiiv.com, ghost.io. `apps/web/utils/ai/group/find-newsletters.ts`
  - Receipt if the address contains `receipt@`, `invoice@`, `billing@`, `invoice+statements`, or the subject has phrases like "Your receipt from", "Invoice #", "Payment received". `apps/web/utils/ai/group/find-receipts.ts`
  - The LLM sees the address plus subject and snippet of up to 3 recent emails. `apps/web/utils/ai/categorize-sender/ai-categorize-senders.ts`
- Abstain. The prompt says "Accuracy is more important than completeness" and to answer Other "if the category is unclear or multiple categories could apply". The decision model drops any answer under 0.6 confidence. `apps/web/utils/decision-model/categorize-sender.ts`
- Learning from label removal. `apps/web/utils/rule/record-label-removal-learning.ts`
  - Every removal is saved as feedback, a hint for the next email.
  - Only a second removal for the same sender, on a different message and outside a 15 minute window, becomes a fixed exclusion.
  - Ten or more removals of one label in 15 minutes is a sweep ("stop labeling this"), and teaches no sender anything.
  - Removing a custom rule's label deletes the AI-learned sender pattern but keeps patterns the user wrote.
- Cold email check. Same organisation as the user is never cold. A learned "cold sender" is overruled once the user has sent them mail. If the prior-contact check fails, it assumes contact (fails safe). `apps/web/utils/cold-email/is-cold-email.ts`
- Scams. No phishing check in these paths.

## 3. Where Cluster already matches or beats them

- Metadata only and on device. Only Apple makes the same promise, and on iCloud.com Apple's servers do the work. Cluster does it in the browser.
- Labels arrive with the computer off through Gmail filters. Shortwave also syncs labels with Gmail filters. SaneBox and the AI tools need their own servers.
- Per-sender corrections for past and future mail, like Apple, Spark, HEY and Outlook. Cluster also keys them by canonical address and machine-address pattern (`addressIdentity.ts`), which none of them document.
- Service senders beat the company domain (`SERVICE_SENDERS`), so AWS is not Shopping. Apple, Spark and HEY only get this by manual per-address correction.
- A two-vote rule before learning from Gmail swaps (`learnFromMoves.ts`). Spark does not learn at all, by its own statement.
- A Screener for anything it cannot place, which is the abstain option Inbox Zero builds with its Other category and 0.6 cut.
- Scam checks before moving mail. None of the sorters above do this. Only the arrival filters skip them, which is the bug below.

## 4. Ranked improvements, best first

### 1. A scam never keeps a Cluster label (fixes the Netflix bug)

What is wrong, verified in code:
- `categoryQueries.ts` builds subject-kind filters (`otp`, `accounts`, `shipping`, `receipt`, `social`, `jobs`) from phrases alone. There is no `from:` guard and no free-mail exclusion. The header comment says the server side is "only ever narrower than what Cluster itself would decide". That is false today, because `classifySortBucket` returns null for free mail and the filter does not.
- `gmailProvider.labelSuspicious` adds Suspicious (and SPAM) and removes only INBOX. A Cluster label put on by a filter stays.
- `holdUnsortedInbox` and `tagUntaggedInbox` search with `withoutClusterLabels`, so mail a filter already labelled is never looked at again by the inbox passes.

Change, in four small parts:
1. `labelSuspicious` (and `runQuarantine` in `background.ts`) also removes every Cluster label id. Undo through `unlabelSuspicious` can leave it unlabelled. The next tagger run relabels it if the user released it.
2. In `categoryQueries.ts`, every subject-kind query gets `-from:(gmail.com OR googlemail.com OR yahoo.com OR outlook.com OR hotmail.com OR live.com OR icloud.com OR aol.com OR proton.me OR protonmail.com)`. That is about 120 characters of the 1,400 budget. It restores the "narrower than the client" rule for the common case.
3. For `accounts`, `receipt` and `otp` only, require evidence of who sent it. The filter matches the phrase only when the sender is on a curated list (`from:(known domains)`) or Gmail put the mail in `category:purchases` or `category:updates`. Unknown senders with those phrases wait for the client tagger, which runs `senderVerdict` first. Those labels already wait one hour in the inbox, so a later label costs the user nothing. Whether Gmail filters accept `category:purchases` and `category:updates` as criteria needs a live test. `category:promotions` already works in Cluster's filters.
4. A metamorphic test in `metamorphicSort.test.ts`: any mail the verdict holds or warns on ends with no Cluster label, whichever pass saw it first.

Gain: removes the worst kind of mistake, a scam filed as trusted. Phishing leans on exactly the phrases these filters match ("security alert", "receipt", "invoice", "verification code").
Cost: small for parts 1, 2 and 4, about a day. Part 3 is medium and needs the live test.
Promise: keeps metadata-only and on-device. With the computer off, unknown-sender receipts and security notices wait until Chrome is open. Known senders still label on arrival.

### 2. Use Gmail's own Purchases and Reservations verdicts

What: `category:purchases` and `category:reservations` are documented search operators (https://support.google.com/mail/answer/7190). Cluster reads Purchases on the client only (`gmailApi.listPurchaseMessageIds`, then `withPurchase`). Reservations is not used anywhere.
Change:
- Client: list `category:reservations` the same way. Mail there becomes Travel unless the kind is otp or accounts. Files: `gmailApi.ts`, `messageKind.ts` (a `withReservation` beside `withPurchase`), `sortTaxonomy.ts`.
- Server: add `category:reservations` to the Travel filter and `category:purchases` to the Receipts filter, both with the free-mail exclusion from item 1. This needs the same live test of category criteria in filters.
Gain: airlines, hotels, ticket sites and small shops that are on no domain list. That was about half of all misses in the 2,000 email test ("a domain missing from a hand list", `2026-11-15-sorting-mistakes-research.md`). Google read the content on its side. Cluster reads only the label.
Cost: small.
Promise: keeps all three. It is a Gmail label, not a body.

### 3. Safer learning from Gmail moves (Inbox Zero's rules)

What: `movedTo` counts one vote per message. A user who moves one two-message thread, or selects two emails from one sender at once, teaches Cluster in a single action. A sweep across many senders also teaches each one.
Change, in `learnFromMoves.ts`:
- Count votes per sender per batch of the change feed, not per message. The second vote must come from a later batch, at least 15 minutes after the first.
- Treat 10 or more removals of one Cluster label within 15 minutes as a sweep. A sweep teaches no sender.
- Removing a Cluster label and putting the mail back in the inbox twice, at different times, learns "never" for that sender. Today "removing alone" teaches nothing.
- Keep the user's own corrections (Details "Label as", review step) above learned ones. A learned rule can be undone by one later contradicting move.
Gain: fewer wrong rules from one careless bulk action, and a new path to learn "leave this sender alone".
Cost: small. Store a batch id and time with each vote.
Promise: keeps all three.

### 4. Corrections by sender plus kind, not only sender

What: one sender often spans labels (Amazon orders and Amazon deals). Google labels by `<sender, subject template>` (Wendt et al., WSDM 2016), and Yahoo groups by canonized sender plus template (see 2026-11-15 notes). Apple, Spark and Outlook only correct per sender, so this would beat them. It was proposed on 2026-11-13 and not built.
Change: when the user relabels mail whose kind is not `other`, store `sortOverrides["<correctionKey>|<kind>"]` and check it before the plain sender key in `overrideFor` (`sortTaxonomy.ts`). `learnFromMoves.ts` saves the kind-scoped key when both votes share a kind. For Gmail filters, the key becomes `from:(addr) subject:(kind phrases)` in `categoryQueries.ts`.
Gain: one correction no longer drags a store's receipts into Promotions, or its ads into Receipts.
Cost: medium. The filter query length needs care.
Promise: keeps all three.

### 5. Require settled identity before transactional labels on the client

What: Inbox Zero answers Other "if multiple categories could apply" and drops answers under 0.6. Cluster's client already sends free mail to the Screener. It still labels a "receipt" from an unknown company domain that has no DMARC pass.
Change: in `classifySortBucket`, a `receipt`, `statement`, `accounts` or `otp` kind from a domain on no list gets a label only when Gmail's DKIM or DMARC result passes for the From domain, or Gmail put it in Purchases or Updates. Otherwise it returns null and goes to the Screener. The DKIM domains are already passed in `hints.dkimDomains`.
Gain: catches lookalike-domain phishing that the verdict scores just under "warn".
Cost: small. Some real small shops with broken DMARC go to the Screener, which is the safe failure.
Promise: keeps all three.

### 6. Never learn a domain rule for free mail

What: HEY lets you screen a whole @domain, but not @gmail.com. Cluster's `overrideFor` reads `@domain` keys, and `practiceSenders.boardOverride` writes them during setup. Today that path only sees senders Cluster could guess a label for, which leaves out free mail. So it is safe by accident, not by a rule.
Change: refuse `@<free-mail domain>` keys wherever overrides are saved, and ignore any that exist. One guard in `sortTaxonomy.ts` plus a test.
Gain: one wrong click can never label every friend.
Cost: tiny.
Promise: keeps all three.

### 7. Keep time-sensitive mail in view (needs the user's yes, it changes a screen)

What: Apple shows time-sensitive mail from any category in Primary. Gmail keeps packages arriving within 24 hours at the top of the inbox. Cluster moves every label out after one hour, codes and "out for delivery" included.
Change: mail matching `TIME_SENSITIVE_QUERY` (`categoryQueries.ts`) keeps its label but stays in the inbox until the end of the day, or until read. The sweep in `inboxTimeLimits.ts` already has a keep list (`keptIds`).
Gain: fewer "where did my code go" moments.
Cost: small.
Promise: keeps all three.

### 8. Wire up or delete the on-device AI second opinion

What: `aiMessageKind.ts` (Chrome Prompt API, on device) is not imported by any non-test file. It has no confidence cut.
Change: either delete it, or call it only for `other` subjects from senders the verdict scores "none", and keep only answers the model marks as certain. Inbox Zero's prompt wording ("Accuracy is more important than completeness", Other when more than one fits) is a good template.
Gain: unknown. It needs the replay test (2026-11-15, item 7) before it is turned on.
Cost: small to delete. Medium to wire up.
Promise: keeps on-device. It needs Chrome open, so it can never run when the computer is off.

## 5. Checked and rejected

- **LLM labelling on a server** (Inbox Zero, Superhuman, Shortwave, Spark Auto-Labels). All send subject and snippet or full content to a model. That breaks metadata-only and no-server.
- **Gmail's preview snippet.** Inbox Zero feeds snippets to its model. Cluster declined snippets earlier, pending the user. Nothing found here changes that.
- **Schema.org order and flight markup** (what Gmail's summary cards read, per the Purchases post). It sits in the body.
- **Engagement-ranked labels** like Gmail's "most relevant" Promotions. That is ranking inside a label, not choosing one. Cluster's move-out also skews open rates, as noted on 2026-11-15.
- **Merging Orders, Receipts and Codes into one Transactions label** (Apple, HEY Paper Trail). It would remove the boundary errors seen in the tests. It is a product choice for the user, not an algorithm fix, so it is not ranked.
- **A Gmail search operator for DMARC or DKIM results.** None is documented on the operators page (https://support.google.com/mail/answer/7190), so filters cannot check sender authentication. That is why item 1 relies on curated domains and Gmail categories.
- **Outlook's Focused Inbox bypass header.** It is set by an admin at the server. A browser extension cannot use it.
- **Clean Email's cross-user statistics.** They need data from many users on a server.

## Sources not reachable

- Superhuman help center: 403 to automated reads.
- support.microsoft.com through the fetch tool: blocked. Read with curl instead.
- No primary Google page explains how Purchases or Reservations are chosen.

## 6. Follow-up: checked against the real mailbox (2026-11-18, read-only search)

**Gmail's Purchases and Reservations views.** No Google page says whether a filter can use `category:purchases` or `category:reservations` on arriving mail. Google's search help lists both as search operators only (https://support.google.com/mail/answer/7190). In this mailbox, Reservations held 1 thread in 180 days (an Expedia itinerary, already Travel by domain). Purchases held about 200 threads in 90 days, almost all from senders Cluster already labels (Amazon, PayPal, Atlassian). Verdict: the client reads both views (built, 6d9c225). The filter side is **not worth building** until a mailbox shows misses it would catch.

**What the views did show.** One Amazon order's mail was split across three labels. "Ordered: …" (amazon.in) went to Orders & shipping. "Ordered 2 items: …" (amazon.com), "Item cancelled successfully" and "Payment declined … ship your order" went to Shopping or Receipts. Fixed in 3d4b229.

**Screener misses (15 threads, 30 days).**
- Recruiter post "Position | Senior … Engineer | Chicago, IL": no work-mode word, so no Jobs. Fixed.
- Google Voice "… is no longer connected to your Google Voice account": no Accounts phrase. Fixed.
- Azure billing notice from azure-noreply@microsoft.com: already fixed by SERVICE_SENDERS (dab324e).
- Red Cross volunteer region mail, Google Voice marketing texts, a Trustpilot review request: the Screener is the right place.

**Receipts label (39 threads, 60 days).**
- "Resume Receipt Confirmation" (Greenhouse) was Receipts. It is Jobs now, and the Receipts filter skips it. Fixed.
- Discover "We've received your payment" (8 threads) is Receipts, but the client says Finance. The Gmail filter matches the phrase for any sender and labels first. The daily index relabel should swap it (`labelFromIndex` is tested for this) but did not. Likely causes: the sender was skipped (`skipSender`: known correspondent or a "warn" verdict), or the relabel has not run since. **Open, needs the extension's own data.** A Receipts filter that skips bank and travel domains does not fit: those lists come to about 3,000 characters, against Gmail's ~1,400 limit.
- ADPList "Booking Confirmed with <mentor>" is Receipts through the "booking confirm" phrase. It is a meeting with a person. Left alone for now: "booking confirmed with" also fits hotels.
- Rakuten "Cash Back Statement" is Receipts through "your … statement". Acceptable.
