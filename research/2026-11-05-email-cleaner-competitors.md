# Email cleaning and organizing apps: how they work (2026-11-05)

What the apps closest to Cluster do, how they decide where mail goes, and what Cluster should take from each.

Source quality: most comparison pages are written by competitors (Leave Me Alone, Mailstrom and Clean Email all publish "best X alternative" posts). Vendor docs are used for facts about how a product works. Reviews are used only for complaints that repeat across several of them.

## The field, in four groups

| Group | Apps | Model |
|---|---|---|
| **Cleaners** (sit on top of Gmail) | Clean Email, Mailstrom, Leave Me Alone, Trimbox, Unroll.me | One-time bulk clean plus unsubscribe, with some rules |
| **Filters** (server-side, any client) | SaneBox | Moves unimportant mail to folders and learns from your drags |
| **New mail apps** (replace the client) | HEY, Spark, Superhuman, Shortwave | Their own inbox views: screeners, splits, smart inbox |
| **Platforms** | Gmail (Manage subscriptions, tabs), Apple Mail (categories) | Built in, free, sorted on arrival |
| **AI assistants** | Inbox Zero (open source), Shortwave AI filters | Rules in plain English, carried out by a language model |

Cluster sits between the cleaners and the filters: it cleans like Clean Email, sorts on arrival like SaneBox, screens like HEY, and runs in the browser like Trimbox and Leave Me Alone.

## App by app

### Clean Email
- **What:** web, iOS, Android and Mac apps over your IMAP or Gmail account.
- **How it decides:**
  - "Smart Folders": 30+ built-in categories, shown only when your mail has them.
  - "Cleaning Suggestions" that adapt to your behaviour.
  - "Auto Clean" rules you set: archive after N days, move newsletters to Read Later.
- **Also:** Unsubscriber (works even without an unsubscribe link), a pause option for subscriptions, and a Screener for new senders with trusted senders, domains and keywords.
- **Pricing:** the free tier covers the first 1,000 emails, 25 unsubscribes, and 14 days of Screener and Auto Clean.
- **Complaints:** receipts landing in Read Later through over-broad rules, no Windows app, and a weaker mobile app.
- **For Cluster:** Smart Folders appear only when they have mail, as Cluster's labels already do. Clean Email's main risk, receipts caught by a newsletter rule, is the one Cluster guards against with life-admin protection (e4f14b0). Keep that guard.

### SaneBox
- **What:** a server-side filter that connects to the mail server (IMAP IDLE), not to an app. It works with any client.
- **How it decides:**
  - Moves "less important" mail into `@SaneLater`, with `@SaneNews` for newsletters.
  - Importance comes from sender frequency, whether you reply, and content.
  - **You train it by dragging:** move an email from SaneLater to the inbox and that sender is promoted.
  - A daily digest lists what landed in SaneLater.
- **Onboarding:** pick a date range, and only mail older than that date gets scanned (the Deep Clean report). Setup takes minutes to hours depending on size.
- **Complaints:** a 2 to 3 week learning period with uneven filtering, and confusing pricing tiers.
- **For Cluster:**
  - **Learning from moves is the big one.** If you drag an email out of a Cluster label in Gmail, or back into the inbox, that's a correction Cluster ignores today. Gmail's change feed already reports label changes, so Cluster could treat them as `sortOverrides`.
  - The digest matches Cluster's opt-in "Today by email".

### HEY (Basecamp)
- **What:** a full mail service (its own address).
- **How it decides:**
  - **Every new sender waits in the Screener.** "Yes" sends them to the Imbox. You can also route them to the **Feed** (newsletters) or the **Paper Trail** (receipts).
  - Routing is **per sender**, and changing a sender's place **moves their existing mail too**.
  - You can override a single email ("Move to Paper Trail").
- **Complaints:** one place per sender, so a store's receipt and its ads land in the same place.
- **For Cluster:**
  - HEY proves that per-sender decisions are what people understand. Cluster's per-sender `sortOverrides` match it.
  - Cluster's per-email kind (a receipt from Amazon goes to Receipts, an ad from Amazon to Promotions) fixes HEY's top complaint.
  - "Changing the sender moves their old mail" is what Rescan now does, but it should happen **instantly on the correction**, not on the next Rescan.

### Spark (Readdle)
- **What:** a mail app.
- **How it decides:**
  - The Smart Inbox splits new mail into Personal, Notifications and Newsletters, with people on top.
  - Gatekeeper previews first-time senders so you can accept or block them.
  - Cards (Pins, Seen) are configurable.
- **Complaints:** sorting accuracy, and the Smart Inbox isn't on desktop.
- **For Cluster:** "people first" is the same promise as Cluster's landing line. Gatekeeper is like the Screener but only for **first-time senders**. Cluster now also holds *unsorted automated* mail, which is broader. Make sure the Screener explains which of the two each email is.

### Superhuman and Shortwave
- **What:** fast mail clients. Superhuman works with Gmail and Outlook; Shortwave is Gmail only.
- **How they decide:**
  - Split inboxes (tabs built from searches or labels).
  - Shortwave's **AI filters** are written as a plain-English prompt, capped per tier (3 on one tier, 10 on another).
  - **Gmail filters stay the source of truth**: a filter that skips the inbox also skips theirs.
- **For Cluster:** writing Gmail filters (Cluster's categoryFilters) is the right choice, because filters keep working in every client and on phones. A natural-language rule ("anything from my landlord goes to Home") is the one feature these apps have that Cluster's rule sentences only partly cover.

### Inbox Zero (open source)
- **What:** an AI assistant for Gmail and Outlook, hosted or self-hosted.
- **How it decides:** you write rules in plain English and a language model applies them and drafts replies. It also has one-click unsubscribe plus archive for mail you never read, and a cold-email blocker.
- **For Cluster:** this is the strongest open-source competitor. It sends mail to a language model; Cluster's selling point is that nothing leaves the browser. Its cold-email blocker matches Cluster's first-contact signal plus Screener.

### Mailstrom, Leave Me Alone, Trimbox, Unroll.me
- **Mailstrom:**
  - Groups mail into visual **bundles** by sender, subject, list and time, then cleans in bulk.
  - The "full inbox analysis" view is its draw.
- **Leave Me Alone:**
  - A flat list of subscriptions, each with Keep / Roll up / Unsubscribe.
  - The **rollup** turns many newsletters into one digest.
  - Says it runs entirely in the browser and stores nothing.
- **Trimbox:**
  - A Gmail extension that says no email data leaves the device.
  - Unsubscribe plus bulk delete.
- **Unroll.me:**
  - Free unsubscribe and rollup, paid for by **selling purchase data from receipts** (to Uber, among others).
  - The FTC settled with it in 2019 over misleading privacy claims ("we won't touch your personal stuff").
  - It's the reason users distrust free inbox cleaners.
- **For Cluster:**
  - Privacy is a crowded claim (Leave Me Alone and Trimbox both make it), so it needs proof: an open privacy page, no server, and the network calls listed.
  - A "Roll up" choice next to Unsubscribe (Cluster's parked Digest idea) is the one cleanup action the leaders have and Cluster doesn't.

### Gmail and Apple Mail (the free default)
- **Gmail Manage subscriptions (July 2025):** a list of senders by volume with one-tap unsubscribe, built into Gmail on web, Android and iOS. This makes Cluster's Stop mail **table stakes**, not a reason to install.
- **Apple Mail categories (iOS 18.2):** an on-device model sorts mail into Primary, Transactions, Updates and Promotions, and "Categorize sender" moves a sender for good.
- **For Cluster:** what's left for Cluster is doing things the platforms won't:
  - **moving** mail out on timers
  - **holding** scams with reasons
  - **labels that work in every client**
  - **cleaning old mail**

## Patterns across the leaders

1. **Per-sender decisions, applied to old mail at once.** HEY, Apple and Gmail's tab drag ("do this for future messages") all do it. Cluster: corrections exist, but old mail only changes on Rescan.
2. **Learning from what you already do.** SaneBox learns from drags, Gmail and Apple ask when you move a sender. Cluster ignores manual moves in Gmail.
3. **A results view, then quiet.** SaneBox's Deep Clean report and Clean Email's suggestions appear once; daily use is invisible. Cluster's scan card now does the first part; it should stay hidden on later runs unless something changed.
4. **Cleaning in bundles.** Mailstrom groups by sender, subject and time; Clean Email groups by Smart Folder. Cluster's Clean up sender table does the same.
5. **A digest or rollup instead of a choice between unsubscribe and keep.** SaneBox digest, Leave Me Alone rollup, Unroll.me rollup. Cluster has "Today by email", but no newsletter rollup.
6. **Free tier ending at about 1,000 emails or 25 unsubscribes** (Clean Email, Leave Me Alone). Cluster is free with no limits.
7. **The trust tax.** Every cleaner pays Google's yearly security assessment for restricted Gmail scopes. 2019-era reports put it at $15k to $75k a year; current tiered assessors are cheaper, and one developer reported about $550 (an anecdote). Clean Email and Leave Me Alone protested it in 2019. Cluster needs `gmail.modify` (a restricted scope), so it faces the same wall before a public release (release-wizard step 7).

## Where Cluster is ahead
- It runs in the browser with no server, like Trimbox and Leave Me Alone, but does far more (sorting, timers, scam holds).
- Per-email kinds beat HEY's one place per sender.
- Gmail filters plus labels work in every client (the Superhuman and Shortwave lesson). SaneBox needs its server running.
- Scam holds with reasons. No cleaner on this list explains phishing per email.

## Where Cluster is behind
1. **It doesn't learn from moves made in Gmail** (SaneBox, Apple, Gmail all do).
2. **Corrections don't instantly move a sender's old mail** (HEY does).
3. **No newsletter rollup or digest** (SaneBox, Leave Me Alone).
4. **No natural-language rule** (Shortwave, Inbox Zero). That's optional, and an on-device model would keep the privacy promise.
5. **Only an extension:** no mobile app (Clean Email, Spark and HEY all have phones). The Gmail filters soften this.
6. **No verified Google app yet**, the same wall every competitor had to get over.

## Proposed next steps (not built)
1. **Learn from Gmail moves.** When the change feed shows you removed a Cluster label or added a different one to an email from a sender, save that as a correction, after two matching moves so one slip doesn't count.
2. **Corrections apply instantly.** Changing a sender's label relabels all of their indexed mail right away, using `labelFromIndex` scoped to that sender, without opening the scan card.
3. **Scan card only when something changed.** Background relabels stay silent if they labelled 0.
4. **A "Roll up" action in Stop mail.** Newsletters skip the inbox into one weekly digest email, reusing the "Today by email" path (messages.insert).
5. **A privacy proof page.** List every host Cluster talks to (Gmail API, the auth worker, brand datasets) and say outright that Cluster doesn't sell data, because the Unroll.me story is what users remember.

## Sources
- Clean Email: [features](https://clean.email/features), [official info](https://clean.email/llm-info), [review](https://thebusinessdive.com/clean-email-review)
- SaneBox: [how it works](https://sanebox.com/help/155-how-does-sanebox-work), [Deep Clean](https://www.sanebox.com/help/419-email-deep-clean-sanebox-can-help-clear-out-old-unnecessary-emails), [review](https://www.asianefficiency.com/email-management/sanebox-review/), [review](https://maketecheasier.com/sanebox-review/)
- HEY: [how it works](https://www.hey.com/how-it-works/), [Imbox](https://hey.com/features/the-imbox/), [Paper Trail](https://help.hey.com/article/787-paper-trail), [review](https://brianli.com/hey-email-an-initial-review/)
- Spark: [Smart Inbox](https://sparkmailapp.com/features/smart_inbox), [customize](https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox), [AppleInsider review](https://appleinsider.com/articles/23/01/13/spark-mail-211-review-e-mail-organizer-with-gatekeeper-smart-inbox)
- Superhuman and Shortwave: [Zapier comparison](https://zapier.com/blog/shortwave-vs-superhuman), [Shortwave migration docs](https://shortwave.com/docs/migrations/migrating-from-superhuman/)
- Inbox Zero: [README](https://cdn.jsdelivr.net/gh/elie222/inbox-zero@main/README.md), [site](https://getinboxzero.com/)
- Mailstrom, Leave Me Alone, Trimbox (vendor-written): [LMA bulk unsubscribe 2026](https://leavemealone.com/blog/best-bulk-email-unsubscribe-tools-2026/), [Mailstrom vs LMA](https://mailstrom.co/articles/mailstrom-vs-leave-me-alone/amp/), [Trimbox blog](https://www.trimbox.io/blog/best-email-management-tools)
- Unroll.me: [The Register](https://www.theregister.com/2019/12/17/unrollme_ftc_slap/), [MediaPost](https://www.mediapost.com/publications/article/339092/unrollme-duped-consumers-about-privacy-ftc-says.html), [Gizmodo](https://gizmodo.com/unroll-me-settles-with-ftc-for-rifling-through-its-user-1840496042)
- Gmail Manage subscriptions: [Google blog](https://blog.google/products-and-platforms/products/gmail/new-manage-subscriptions-unsubscribe/), [Workspace updates](https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html)
- Google security assessment: [The Register 2019](https://www.theregister.com/2019/02/11/google_gmail_developer/), [GMass](https://www.gmass.co/blog/google-oauth-verification-security-assessment/), [indie developer thread](https://community.latenode.com/t/is-casa-tier-2-assessment-necessary-for-all-gmail-api-apps-options-for-indie-developers/22861)
