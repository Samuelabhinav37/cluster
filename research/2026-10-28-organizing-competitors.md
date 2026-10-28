# How competitors organize mail

Asked 2026-10-28: how SaneBox and Cluster's competitors organize mail. Names of folders, screens,
triage vs backlog, digests, learning, screeners, unsubscribe, rules and price. Sources are vendor
help centers, vendor blogs and Apple/Google support pages, all accessed 2026-10-28.

Builds on `2026-08-29-competitive-and-security-review.md`, `2026-08-31-inbox-sorting-and-labels.md`
and `2026-10-27-organizing-rules.md`. Rule and preset tables already in the 10-27 doc are not
repeated here. Corrections to the older docs are listed in their own section.

Marks used:
- **[snippet]**: the claim comes from the vendor's own page, but the page blocked direct fetch
  (HTTP 403) so it was read through a search result excerpt. Primary source, less complete read.
- **[secondary]**: no primary source found. Only a third party says it.
- **[may be outdated]**: the page is old or the vendor pages disagree.

## Summary: the patterns that matter

1. **Few places, chosen per sender, applied to old mail too.** HEY has three (Imbox, The Feed,
   Paper Trail). Apple has four categories and "Categorize Sender" moves current and future mail.
   Spark moves a sender by clicking the address. Leave Me Alone and Unroll.me offer Keep, Rollup or
   Unsubscribe/Block per sender. Cluster makes up to 18 labels; nobody else asks the user to think
   in that many buckets.
2. **The digest is the safety net.** SaneBox's Daily Digest lists everything it filtered, with
   Move to Inbox, Train, Archive All and Trash All. Leave Me Alone mails a daily list of screened
   mail. Clean Email reminds hourly, daily or weekly about waiting senders. Moving mail out of the
   inbox only feels safe when there is one place to check it.
3. **Every screener has bypass rules.** Contacts, people you have emailed, replies to your own
   mail, priority senders, pre-approved domains or keywords. Clean Email lets you pick which types
   are screened (mailing lists, automated, people). HEY blocks screening out gmail.com as a whole.
4. **Learning is mostly "remember where I put this sender".** SaneBox (drag, Digest, Trainings
   page), Gmail (drag tab, Undo), Apple (Categorize Sender, Reset), Spark (change category). Only
   SaneBox shows a list of past training you can edit. Apple has a one-button reset.
5. **Unsubscribe always comes with a choice for existing mail.** Clean Email trashes existing mail
   by default (toggle). Superhuman offers "Unsubscribe, and Mark Done all" or "Trash all". Leave
   Me Alone moves it to "Unsubscribed mailing lists" or Trash. Unroll.me waits 24 hours before
   sending the request so you can change your mind, and trashes later mail as a backup.
6. **Tool-made folders are flat and pinned, or prefixed and nested.** SaneBox uses `@Sane*` flat.
   Leave Me Alone uses `_lma-shield/screener` and `_lma-rollups`. Mailstrom uses
   `[Mailstrom]/Chilled/YYYY-MM-DD` and `[Mailstrom]/Expired`. Unroll.me uses `Unroll.Me` and
   `Unroll.Me/Unsubscribed`. Clients (Spark, Superhuman, Apple, HEY) keep groupings in the app.
7. **Backlog and incoming are separate jobs.** Cleanup tools (Clean Email, Mailstrom) group the
   backlog by sender, subject, date or size and act in bulk, then offer "make this a rule". Triage
   tools (SaneBox, HEY, Apple, Gmail) act at delivery and barely touch the backlog.
8. **AI is arriving as summaries, not as the sorter.** SaneBox Digest Plus (Oct 2026), Gmail AI
   Inbox (rolling out Oct 2026), Apple Intelligence summaries, Leave Me Alone Rollup summary. Apple
   says its categorization uses sender and header metadata only, no bodies.

## SaneBox

- **Folders.** Flat, `@`-prefixed: `@SaneLater`, `@SaneNews`, `@SaneBlackHole`, `@SaneCC`,
  `@SaneTomorrow`, `@SaneNextWeek`, `@SaneTodo`, `@SaneNoReplies`, `@SaneDoNotDisturb`, plus DIY
  folders like `@SaneReceipts`, `@SaneBills`, `@SaneFamily`. [features](https://www.sanebox.com/help/138-what-is-a-feature),
  [DoNotDisturb](https://www.sanebox.com/help/340-sanedonotdisturb-what-do-i-do-with-that-folder) [snippet]
- **Screens.** No mail client. Your own client plus a web Dashboard with Folders, Trainings &
  Filters, Domain Filters, and the emailed Digest. [train](https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox),
  [domain](https://www.sanebox.com/help/121-what-is-domain-training-based-filtering-and-how-does-it-work)
- **Incoming vs backlog.** Incoming: connects over IMAP and moves lower-priority mail to
  `@SaneLater` "based on headers (sender, subject, etc.)". Backlog: an "Email Cleanup Tool" lists
  recent mail so you can train important senders. [how it works](https://www.sanebox.com/help/155-how-does-sanebox-work),
  [train](https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox)
- **Digest.** Daily. Top: "Daily Snapshot" with time saved and count received. Tabs: Show All,
  @SaneLater, @SaneNews, others. Same-sender mail grouped. Per message: Move to Inbox, Move,
  Train, Archive, Remove. Per folder: Read All, Archive All, Trash All. "Done Reviewing" closes it.
  Send time is not stated. [Digest](https://www.sanebox.com/help/170-daily-digest-why-should-i-use-it-and-how-do-i-read-it)
- **Digest Plus (new, 2026-10-26).** One-line AI summary per lower-priority mail. Dinner plan.
  "We never use your email content to train AI." [blog](https://blog.sanebox.com/2026/10/26/saneboxs-next-evolution-introducing-the-ai-bundle/)
- **Training.** Drag between Inbox and Sane folders. Back to Inbox takes effect almost at once;
  into a Sane folder takes 5 to 15 minutes. Trainings & Filters page lists "all past training
  actions" to edit. Domain filters can force every sender of a domain to one folder, include
  subdomains, and route replies. Unknown domains are filed "based on the importance of the
  sender", estimated from your history. [train](https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox),
  [domain](https://www.sanebox.com/help/121-what-is-domain-training-based-filtering-and-how-does-it-work)
- **Screener.** None named. SaneLater plays that role for unknown senders.
- **Unsubscribe/block.** SaneBlackHole: drag once, current and future mail goes there and can be
  trashed automatically. No unsubscribe request is sent. [features](https://www.sanebox.com/help/138-what-is-a-feature)
- **Rules.** Domain filters and subject filters (subject beats domain). DIY folders learn from
  examples. Do Not Disturb pauses only mail that would have stayed in the inbox; VIP keyword
  bypasses it. [domain](https://www.sanebox.com/help/121-what-is-domain-training-based-filtering-and-how-does-it-work),
  [release notes](https://www.sanebox.com/release-notes) [snippet]
- **Price.** Snack (1 account, a few features), Lunch (2 accounts), Dinner (4 accounts, all
  features). Each enabled feature uses a slot. "Plans start at just $7 per month". Trial 7 days
  on the plans page; another page says two weeks [may be outdated].
  [plans](https://www.sanebox.com/help/201-which-subscription-plans-can-i-choose-from); pricing page blocked fetch.

## Clean Email

- **Folders.** Mostly none in the mailbox. Smart Folders are app views: Top senders, All
  Messages, Automated messages, Misc notifications, Finance, You are CC-ed, and more ("33+").
  It creates a real `Read Later` folder when you use it. [Smart Folders](https://clean.email/help/basics/smart-folders),
  [Read Later](https://clean.email/help/tools/read-later), [info](https://clean.email/llm-info)
- **Screens.** Features listed: Auto Clean, Unsubscriber, Screener, Cleaning Suggestions,
  Privacy Monitor, Smart Folders, plus Logs, Favorites, Pinned Messages. [features](https://clean.email/features)
- **Incoming vs backlog.** Backlog: group by Sender, Sender's Email, Subject, Date, Labels or
  Recipients; bulk act. Incoming: Screener, sender settings, Auto Clean. [Smart Folders](https://clean.email/help/basics/smart-folders)
- **Digest.** Read Later summary, weekly by default or daily, pick day and Morning, Noon,
  Afternoon or Evening. Activity Summaries of unsubscribes and screened senders. Cleanup
  reminders. [Read Later](https://clean.email/help/tools/read-later), [features](https://clean.email/features)
- **Training.** Weak. "Cleaning Suggestions" adapt to your mailbox. No per-user model described. [features](https://clean.email/features)
- **Screener.** Holds anyone who never wrote before. Allow (to Inbox, Read Later or a folder),
  Block (current and future to Trash), Pause. History list. Reminders hourly, daily or weekly by
  email or phone. Choose which types get screened: mailing lists, automated, people. Pre-screen
  addresses, domains or keywords. [Screener](https://clean.email/help/tools/screener)
- **Unsubscribe.** Tabs New, Paused, Unsubscribed. Grouped by unsubscribe link, not sender.
  Unsubscribe (dropdown: Pause), Keep Receiving (to Read Later or a label). "Move existing
  messages to Trash" is on by default. Later mail from the list goes to Trash as a backup. [Unsubscriber](https://clean.email/help/tools/unsubscriber)
- **Rules.** Auto Clean. Build from a selected group ("scope automatically suggested") or from
  scratch. Runs on incoming mail, skips pinned messages, acts without asking, with a warning and
  a master off switch. [Auto Clean](https://clean.email/help/auto-clean/overview)
- **Price.** Free cleans up to 1,000 emails, basic actions only. 14-day trial. Screener,
  Unsubscriber, Auto Clean and sender settings are Premium. [info](https://clean.email/llm-info).
  $9.99/month or $29.99/year for one account [snippet; the pricing page returned 404].

## Mailstrom

- **Folders.** Nested and bracket-prefixed: `[Mailstrom]/Chilled/YYYY-MM-DD`,
  `[Mailstrom]/Expired`. [FAQ](https://mailstrom.co/faq)
- **Screens.** Grouped inbox (by sender, subject, time period, size, mailing list), a Mailing
  Lists tab, an "inbox summary" (top senders, never-opened subscriptions, storage), a task list
  with Undo, Settings for rules. [FAQ](https://mailstrom.co/faq), [email management](https://mailstrom.co/email-management)
- **Incoming vs backlog.** Backlog first: bulk Delete, Archive, Move, Unsubscribe, Block.
  Incoming: rules and Block filters. Free trial loads up to 5,000 latest messages and lets you act
  on 25%. [FAQ](https://mailstrom.co/faq)
- **Digest.** "Daily or weekly email reports", including sent-mail counts. Contents not
  detailed. [FAQ](https://mailstrom.co/faq)
- **Training.** None. Says it is not an AI tool that guesses. [home](https://mailstrom.co/)
- **Screener.** None found.
- **Unsubscribe/block.** Unsubscribe sends an email or opens the web page. Block removes mail and
  makes a rule by sender, list or subject. Chill brings mail back on a date. Expire removes it
  after a period. [FAQ](https://mailstrom.co/faq)
- **Rules.** Move incoming mail by sender or subject. A rule is disabled if a move fails. [FAQ](https://mailstrom.co/faq)
- **Price.** Basic $9/month (1 account, 10k mail, 200 smart filters). Plus $14 (3, 250k, 400).
  Pro $29.95 (20, unlimited, 1,000). Annual $59.95, $99.95, $199.95. [pricing](https://mailstrom.co/pricing)
- **Privacy conflict.** The FAQ says it "only stores subject lines and metadata" and has access
  to contents when displaying messages. The email-management page says it "never accesses the
  body or attachments". Both are vendor pages. [FAQ](https://mailstrom.co/faq), [email management](https://mailstrom.co/email-management)

## Leave Me Alone

- **Folders.** Prefixed and nested: `_lma-shield/screener` (changeable), `_lma-rollups`, and
  "Unsubscribed mailing lists" for unsubscribed mail. [Screener](https://help.leavemealone.com/en/start-here/the-basics/how-to-block-emails-with-the-screener),
  [Rollup](https://help.leavemealone.com/en/rollups/what-is-a-rollup),
  [unsubscribe](https://help.leavemealone.com/en/unsubscriber/what-happens-after-i-click-unsubscribe)
- **Screens.** Unsubscriber, Rollups, Screener, Spam Blocker, Do-not-disturb, Priority senders,
  Breach Detection, Private Emails. [home](https://leavemealone.com/)
- **Incoming vs backlog.** Backlog: the subscription list. Incoming: Screener, Rollups, Spam
  Blocker, Gmail filters for unsubscribed senders.
- **Digest.** Rollups: one email per Rollup, daily or weekly on days and a time you pick, default
  8am daily, up to 10 Rollups, optional AI summary on top. Screener: Daily Digest of the past 24
  hours, can be turned off. Advice: keep receipts, deliveries and security codes out of Rollups
  with "Keep". [Rollup](https://help.leavemealone.com/en/rollups/what-is-a-rollup),
  [Screener](https://help.leavemealone.com/en/start-here/the-basics/how-to-block-emails-with-the-screener)
- **Training.** None.
- **Screener.** Holds a first-time sender's first mail. Never screened: Priority Senders, Spam
  Blocker catches, unsubscribed senders, Rollup senders, replies to your own mail. Allow moves
  held mail back; Block sends future mail to the folder and can also unsubscribe. Nothing is
  deleted. [Screener](https://help.leavemealone.com/en/start-here/the-basics/how-to-block-emails-with-the-screener)
- **Unsubscribe.** Finds the link in headers or body. Simple links get an Unsubscribe-Post;
  complex ones are clicked by "UnsubscriberAI"; else it emails the sender. Existing mail: move to
  the folder or to Trash. Future mail: Gmail filter to the folder, marked read (Outlook "coming
  soon"), or Inbox Shield. [unsubscribe](https://help.leavemealone.com/en/unsubscriber/what-happens-after-i-click-unsubscribe)
- **Rules.** No rule builder. Fixed features only.
- **Price.** 10 free unsubscribes. Seven Day Pass $19 (2 accounts). Casual Emailer (4 accounts)
  and Inbox Zero Hero (unlimited); their prices render as $0 placeholders on the page. All plans
  include Screener and Rollups. [pricing](https://leavemealone.com/pricing/)

## Unroll.me

All support pages returned 403; content is from search excerpts of `support.unroll.me` [snippet].

- **Folders.** `Unroll.Me` for Rollup mail, `Unroll.Me/Unsubscribed` for blocked mail. [Rollup](https://support.unroll.me/hc/en-us/articles/200271733-What-is-the-Rollup)
- **Screens.** Subscriptions list with Keep, Rollup, Unsubscribe per sender; an Unsubscribed
  filter to change your mind. [edit](https://support.unroll.me/hc/en-us/articles/200391928-How-do-I-edit-my-email-subscriptions)
- **Incoming vs backlog.** Per-sender choice only; it applies going forward.
- **Digest.** Rollup, daily, morning, afternoon or evening. Can be paused. [Rollup](https://support.unroll.me/hc/en-us/articles/200271733-What-is-the-Rollup)
- **Training / screener / rules.** None.
- **Unsubscribe.** Takes effect at once, but the request is sent after a 24-hour window in case
  you change your mind. Future mail from the sender is trashed as a backup. [how](https://support.unroll.me/hc/en-us/articles/201748983-How-does-Unroll-Me-unsubscribe-me-from-a-subscription-)
- **Price.** Free. Funded by NielsenIQ measurement that extracts purchase data from commercial
  mail. Users can opt out of the panel. [data](https://support.unroll.me/hc/en-us/articles/115005696183-What-do-we-do-with-your-data),
  [opt out](https://support.unroll.me/hc/en-us/articles/360037344092-How-to-Opt-Out-of-our-measurement-panel) [may be outdated]

## Superhuman

Help center blocks direct fetch (403). Claims are from search excerpts of `help.superhuman.com`
and from `new.superhuman.com` changelog pages [snippet].

- **Folders.** Split Inbox tabs: Important and Other. Built-in Auto Labels Marketing, Pitch,
  News, Social go to Other by default. Turn off one rule (e.g. Pitch) in Auto Label Settings.
  Labels are Gmail labels on Gmail accounts. [split controls](https://new.superhuman.com/split-inbox-controls-321318),
  [Labels (Gmail)](https://help.superhuman.com/hc/en-us/articles/46005736546061-Labels-Gmail-Accounts)
- **Screens.** Mail client. Split tabs, Cmd+K command palette, Settings for Auto Labels, Split
  Inbox, Auto Archive, Auto Reminders.
- **Incoming vs backlog.** Incoming: Auto Labels, Auto Archive. Custom labels apply to new mail
  and the past 14 days (from 10-27 doc). No bulk cleanup tool.
- **Digest.** None found.
- **Training.** No retraining. Removing a label from one thread does not teach it; to fix, edit
  the prompt (applies going forward) or turn the label off. Two help pages disagree on details.
  [Superhuman for Gmail](https://help.superhuman.com/hc/en-us/articles/46183279736461-Superhuman-Mail-for-Gmail),
  [Email Assistant](https://help.superhuman.com/hc/en-us/articles/46005854346893-Email-Assistant-by-Superhuman-Mail-Gmail),
  [prompts](https://help.superhuman.com/hc/en-us/articles/39785596906387-Best-Practices-for-Writing-AI-Prompts)
- **Screener.** None. Auto Archive never archives people you have emailed or your domain (10-27 doc).
- **Unsubscribe/block.** Cmd+U, then "Unsubscribe, and Mark Done all" or "Unsubscribe, and Trash
  all". No link: Cmd+K, Block sender or domain. Blocked Senders list to unblock. [unwanted](https://help.superhuman.com/hc/en-us/articles/38458459391635-Dealing-with-Unwanted-Emails)
- **Rules.** Library of Auto Labels and Splits, or build your own (From, To, Subject or AI prompt).
- **Price.** Starter $25, Business $33 per member/month annual ($30/$40 monthly). Built-in Auto
  Labels and Split Inbox on all plans; custom Auto Labels on Business and Enterprise. [plans](https://help.superhuman.com/hc/en-us/articles/46178817646861-Pricing-Plans),
  [changelog](https://new.superhuman.com/auto-labels-custom-auto-labels-313354)

## Shortwave

- **Folders.** Gmail labels; "labels sync with Gmail". Splits are search views, not labels. Only
  default split is "Other". Built-in labels Newsletters, Promotions, Travel. Pre-built AI filters
  Needs Action, Cold Outreach, FYI, Travel, Finance, Purchases. [guide](https://www.shortwave.com/docs/guides/labels/)
- **Screens.** Gmail client: splits, bundles, AI assistant, settings for Inbox Setup and Filters.
- **Incoming vs backlog.** Incoming: AI filters, Skip Inbox, delivery schedules. Backlog: select
  samples and "Reapply filters" to test. [guide](https://www.shortwave.com/docs/guides/labels/)
- **Digest.** Delivery schedules hold a label or contact and deliver at set times. [guide](https://www.shortwave.com/docs/guides/labels/)
- **Training.** None; refine the plain-language filter.
- **Screener.** No hold. New senders get a banner with one-click block and unsubscribe [snippet].
- **Unsubscribe/block.** Cmd+U unsubscribe, Cmd+B block; blocked mail goes to Trash [snippet]. [pricing](https://www.shortwave.com/pricing/), [changelog](https://www.shortwave.com/changelog/)
- **Rules.** AI filters: plain language, search query, or both. Label, archive, important, star,
  todo, delete. [guide](https://www.shortwave.com/docs/guides/labels/)
- **Price.** Business $30, Premier $45, Max $120 per seat/month; a free tier exists [snippet]. [pricing](https://www.shortwave.com/pricing/)

## Spark

- **Folders.** In-app only. Unread Cards: People, Notifications, Newsletters, Pins, Seen, plus
  Priority, Gatekeeper, No New Mail cards. Focused List: Priority, Notifications, Newsletters,
  Pinned, Assigned to Me, Invitations, Invitation Responses. Also Classic list. [customize](https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox)
- **Screens.** Mail client with three inbox types, sidebar with a Blocked section, Cmd+K.
- **Incoming vs backlog.** Incoming sorting only. Done moves mail to Archive.
- **Digest.** None found.
- **Training.** Click the sender address, pick a new category; future mail follows. Also Cmd+K
  "change category". [customize](https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox)
- **Screener.** Gatekeeper (paid): before the inbox, inside it, or off. Accept or block; bulk
  thumbs up/down on New Senders. Senders not told. Blocked stay blocked after plan lapses. [Gatekeeper](https://sparkmailapp.com/help/set-up-focus/accept-or-block-new-senders),
  [customize](https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox)
- **Unsubscribe/block.** Block Sender from the message menu. Unsubscribe via the sender's own
  link; block as the fallback [snippet]. [iOS guide](https://sparkmailapp.com/how-to-unsubscribe-emails-ios)
- **Rules.** None documented on these pages.
- **Price.** Free has Smart Inbox. Plus $10/month ($99/year), Pro $20/month ($199/year). +AI in
  Plus and Pro. Tier for Gatekeeper not clear on the pricing page. [pricing](https://sparkmailapp.com/pricing)

## Gmail

- **Folders.** Tabs Primary, Social, Promotions, Updates, Forums. No custom tabs. Hidden
  `category:reservations` for search. User labels nest with `/`. [categories](https://support.google.com/mail/answer/3094499?hl=en)
- **Screens.** Inbox tabs, label sidebar, More > Manage subscriptions, Settings > Filters.
- **Incoming vs backlog.** Incoming: tabs and filters. Backlog: filters can be applied to
  existing matches (10-27 doc). No bulk-by-sender tool beyond search.
- **Digest.** None classic. New AI Inbox (beta, US English): "Suggested to-dos" and "Topics to
  catch up on", drawn from Primary only. Mark done, remove, thumbs up/down. Needs Google AI Plus,
  Pro or Ultra, or a paid Workspace plan; Workspace rollout began 2026-10-12.
  [AI Inbox help](https://support.google.com/mail/answer/16845247?hl=en),
  [Workspace update](https://workspaceupdates.googleblog.com/2026/10/gmails-ai-inbox-is-rolling-out-to-paid-Workspace-users.html)
- **Training.** Drag to another tab, Undo appears. Per sender: a filter "Categorize as".
  Notifications only for Primary. Default inbox type unavailable above 250,000 emails. [categories](https://support.google.com/mail/answer/3094499?hl=en)
- **Screener.** None.
- **Unsubscribe/block.** Manage subscriptions lists senders by frequency with counts from "the
  past few weeks". Unsubscribe covers all of that sender's lists; can take days. Block does not
  unsubscribe; it sends future mail to Spam. Still "gradually rolling out". [manage](https://support.google.com/mail/answer/15621070?hl=en),
  [blog](https://blog.google/products-and-platforms/products/gmail/new-manage-subscriptions-unsubscribe/)
- **Rules.** Filters with a full editor or "Filter messages like these". No presets.
- **Price.** Free. AI Inbox paid only.

## Apple Mail (iOS 18+, macOS 15+, iCloud.com)

- **Folders.** Categories Primary, Transactions, Updates, Promotions. In-app views, not
  mailboxes. Time-sensitive mail from the other three also shows in Primary; "Don't Show In
  Primary" removes one. [iCloud categories](https://support.apple.com/guide/icloud/use-categories-mmafbebd3108/icloud),
  [Mac](https://support.apple.com/en-afri/guide/mail/mlhlp1190/mac)
- **Screens.** Category bar; swipe to All Mail; List View turns categories off. [iPhone](https://support.apple.com/guide/iphone/use-categories-iphfe4a36baf/ios) [snippet]
- **Incoming vs backlog.** Incoming: categories. Backlog: iCloud Mail Cleanup (Clean Up Old
  Promotions, Archive Old Transactions) and unsubscribe recommendations (10-27 doc).
- **Digest.** "Digest" here means per-sender grouping. Open a Transactions, Updates or Promotions
  mail and see that sender's mail in the category; bulk mark unread, move, archive, delete.
  Primary is not grouped. Apple Intelligence adds Priority Messages (pinned on top, Primary or
  List View only) and inbox summaries. [iCloud categories](https://support.apple.com/guide/icloud/use-categories-mmafbebd3108/icloud),
  [Apple Intelligence in Mail](https://support.apple.com/en-ca/guide/iphone/iph9ae667055/ios) [snippet]
- **Training.** Categorize Sender (iPhone/Mac menu, iCloud More > Categorize, or drag on a
  computer); applies to current and future mail. "Reset Manual Categorization" undoes all. [iCloud categories](https://support.apple.com/guide/icloud/use-categories-mmafbebd3108/icloud)
- **Data.** Categorization uses sender and header metadata, "does not include the body". On iOS
  it runs "entirely on-device". [Apple privacy](https://www.apple.com/legal/privacy/data/en/mail-categorization/)
- **Screener.** None.
- **Unsubscribe/block.** iCloud unsubscribe recommendations; block sender (10-27 doc).
- **Rules.** iCloud rules, up to 500 (10-27 doc).
- **Price.** Free; Apple Intelligence needs a supported device.

## HEY

- **Folders.** Its own mail service, so its own places: Imbox, The Feed, Paper Trail, Set Aside,
  Reply Later, Screened Out. [how it works](https://www.hey.com/how-it-works/)
- **Screens.** Imbox (screened-in mail), The Feed (newsletters, open, newest first, scroll),
  Paper Trail (receipts), Screener, Contacts, Recycling Center. [Feed](https://help.hey.com/article/761-the-feed),
  [Paper Trail](https://help.hey.com/article/787-paper-trail)
- **Incoming vs backlog.** All incoming. Changing a sender's place also moves their old mail.
- **Digest.** None. The Feed is the batch reading place; Feed mail recycles after 90 days by
  default. Paper Trail cannot recycle. [Feed](https://help.hey.com/article/761-the-feed), [Paper Trail](https://help.hey.com/article/787-paper-trail)
- **Training.** None. Every routing choice is explicit, per sender, never per domain for Feed.
- **Screener.** First mail from anyone waits. Yes or No. Screened-out senders are not told and
  appear in Screener History; screen back in to see 90 days of their mail. Domains: auto Imbox,
  auto screen out, or per sender; big domains like gmail.com cannot be screened out. Contacts and
  a Speakeasy code skip it. [Screener](https://help.hey.com/article/722-the-screener)
- **Unsubscribe/block.** Screen out is the block. No unsubscribe request sent.
- **Rules.** None beyond per-sender place, Bundle, Bubble Up (10-27 doc).
- **Price.** HEY for You $99/year, HEY for Domains $12/user/month. [pricing](https://www.hey.com/pricing/)

## Comparison

| Product | Places it makes | Screener | Digest | Learning | Unsubscribe | Rules |
|---|---|---|---|---|---|---|
| SaneBox | Flat `@Sane*` folders | No (SaneLater) | Daily, bulk + Train | Drag, Digest, editable history | BlackHole only | Domain, subject, DIY |
| Clean Email | App views; `Read Later` | Yes, by type, reminders | Read Later weekly | Weak | Request + trash backup | Auto Clean from a group |
| Mailstrom | `[Mailstrom]/…` nested | No | Daily/weekly report | None | Request; Block = rule | Sender/subject move |
| Leave Me Alone | `_lma-*` nested | Yes, daily digest | Rollups, up to 10 | None | Header/AI/email; filter | None |
| Unroll.me | `Unroll.Me/…` | No | Daily Rollup | None | 24h delay + trash | None |
| Superhuman | Gmail labels, 2 splits | No | No | Edit prompt only | Cmd+U, done/trash all | Library + builder |
| Shortwave | Gmail labels, splits | Banner only | Delivery schedules | None | Cmd+U, block to Trash | AI filters |
| Spark | In-app cards | Gatekeeper (paid) | No | Change category | Block; sender's link | None |
| Gmail | 5 tabs, user labels | No | AI Inbox (paid) | Drag tab | Manage subscriptions | Filters |
| Apple Mail | 4 in-app categories | No | Per-sender view | Categorize Sender, Reset | Recommendations | iCloud rules |
| HEY | Imbox, Feed, Paper Trail | Yes, core | No (Feed) | None, explicit | Screen out | Per sender |

## Corrections to earlier Cluster research

1. **Mailstrom body access.** 08-31 says it "never reads the body content". Its FAQ says it
   stores subjects and metadata and has access to contents when showing a message. Its marketing
   says it never accesses bodies. Treat "headers only" as unverified.
2. **"Nobody uses slash-nesting as a namespace"** (08-31) is wrong. Leave Me Alone
   (`_lma-shield/screener`), Mailstrom (`[Mailstrom]/Chilled/...`) and Unroll.me
   (`Unroll.Me/Unsubscribed`) all do. Clients (Spark, Superhuman, Apple, HEY) keep groupings in
   the app instead. Cluster's flat emoji labels still look like the better choice.
3. **Leave Me Alone is not just an unsubscriber** (08-29 table). It now has Screener, Rollups,
   Spam Blocker, Do-not-disturb and Priority senders on every paid plan.
4. **SaneBox Digest is no longer purely deterministic** (08-29 gap table). Digest Plus adds AI
   summaries on Dinner, announced 2026-10-26.
5. **Superhuman "can't edit the prompts"** (08-31) looks outdated. Current help says edit the
   prompt; edits apply forward and do not backfill.
6. **Clean Email pricing** in 08-29 came from a third party. Clean Email's own pages confirm the
   free 1,000-email cap and 14-day trial; the dollar figures are only from a search excerpt.
7. **Apple categorization is metadata only**, per Apple's privacy page. Older docs grouped Apple
   with body-reading classifiers by inference. It is the closest big-vendor match to Cluster's model.
8. **Gmail now has AI Inbox** (to-dos and topics), not in any earlier doc.

## What Cluster should take

Ranked by value for effort. Cluster already has: flat emoji labels (18 in `src/lib/clusterLabels.ts`),
a Screener for never-emailed senders, Read later, No reply yet, Unsubscribed, Mute, presets, per-sender
overrides, Activity with Undo, and an on-device AI digest (`src/lib/aiDigest.ts`).

1. **"Moved today" review on Home.** One list of everything Cluster moved or held since last
   look, grouped by sender. Per row: Back to inbox (also teaches), Keep doing this. Per group:
   Archive all. A Chrome notification once a day with the count, off by default. No AI needed.
   From SaneBox Digest, Leave Me Alone Screener digest, Clean Email reminders. Screens: Home,
   Details, Settings (Notifications). Effort: S to M. Reuses the action log.
2. **Screener bypass and scope.** Never hold replies to your own mail. Let the user pick what is
   held: mailing lists, automated mail, people. Allow list for domains and keywords. Never offer
   to screen out a freemail domain whole. From Leave Me Alone, Clean Email, HEY. Screen: Protect.
   Effort: S.
3. **One "where does this sender go" choice.** On a sender row and in Details: Inbox, Read later,
   Receipts, Muted. Applies to old mail too, like HEY and Apple. Hide the 11 kind labels behind
   it for most users. From HEY, Apple Categorize Sender, Spark, Unroll.me Keep/Rollup. Screens:
   Senders, Details. Effort: M.
4. **Stop mail: say what happens to old mail, before the tap.** Two buttons, "Stop and archive
   old" and "Stop and trash old", archive the default. Add a short grace window before the
   unsubscribe request is sent, shown in Activity with Undo. From Superhuman, Clean Email,
   Unroll.me (24h delay). Screen: Stop mail. Effort: S.
5. **"What Cluster learned" list with reset.** Every sender override and accepted/dismissed
   suggestion in one list, each removable, plus "Reset all". From SaneBox Trainings & Filters and
   Apple Reset Manual Categorization. Screen: Settings. Effort: S.
6. **Time-sensitive mail is never held.** Codes, security alerts and delivery-today mail skip the
   Screener and every delay preset, and show in the inbox even when the sender is set to Read
   later. From Apple (time-sensitive shows in Primary) and Leave Me Alone (Keep receipts and
   security mail out of Rollups). Screens: Organize, Protect. Effort: S; kinds already exist.
7. **Block can also unsubscribe.** When blocking in Protect or the Screener, offer "also
   unsubscribe" if a List-Unsubscribe header exists. From Leave Me Alone. Screens: Protect, Stop
   mail. Effort: S.
8. **Group by sender in Details.** A toggle that collapses a category chip into one row per
   sender with bulk actions. From Apple's sender digest and Clean Email's Group By. Screen:
   Details. Effort: S.
9. **Make a rule from a selection.** After a bulk action in Details or Clean up, offer "Do this
   for new mail too", prefilled from the selection. From Clean Email Auto Clean and Mailstrom
   Block. Screens: Details, Clean up, Organize. Effort: M.
10. **Generalize "Newsletters on Saturday" to any label, a few schedules.** Daily or weekly, at a
    time. Cap it low (Leave Me Alone caps at 10). From Leave Me Alone Rollups, Shortwave
    delivery schedules, Clean Email Read Later. Screen: Organize. Effort: M.
11. **Fewer labels by default.** Competitors use 3 to 6 places. Consider defaulting to Read
    later, Receipts, Muted, Screener and folding the rest into those. From HEY, Apple, Spark.
    Screens: Organize, Settings. Effort: M; needs a label migration.
12. **Pin a message so no rule touches it.** From Clean Email Pinned Messages. Screens: Details,
    Organize. Effort: S if it maps to Gmail star or a label.

Skip for now: AI summaries in the review list (SaneBox, Gmail, Leave Me Alone do it, but Chrome's
on-device model is not everywhere; the plain list has to work first), Do Not Disturb holds
(SaneBox, Leave Me Alone; low demand signal), a reading Feed (HEY; big new screen).

## Sources

All accessed 2026-10-28.

- SaneBox: [features](https://www.sanebox.com/help/138-what-is-a-feature),
  [how it works](https://www.sanebox.com/help/155-how-does-sanebox-work),
  [training](https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox),
  [Digest](https://www.sanebox.com/help/170-daily-digest-why-should-i-use-it-and-how-do-i-read-it),
  [domain filters](https://www.sanebox.com/help/121-what-is-domain-training-based-filtering-and-how-does-it-work),
  [plans](https://www.sanebox.com/help/201-which-subscription-plans-can-i-choose-from),
  [DoNotDisturb](https://www.sanebox.com/help/340-sanedonotdisturb-what-do-i-do-with-that-folder),
  [release notes](https://www.sanebox.com/release-notes),
  [AI Bundle blog, 2026-10-26](https://blog.sanebox.com/2026/10/26/saneboxs-next-evolution-introducing-the-ai-bundle/).
  Pricing page blocked fetch.
- Clean Email: [features](https://clean.email/features), [official info](https://clean.email/llm-info),
  [Smart Folders](https://clean.email/help/basics/smart-folders),
  [Screener](https://clean.email/help/tools/screener),
  [Unsubscriber](https://clean.email/help/tools/unsubscriber),
  [Read Later](https://clean.email/help/tools/read-later),
  [Auto Clean overview](https://clean.email/help/auto-clean/overview). `clean.email/pricing` returned 404.
- Mailstrom: [home](https://mailstrom.co/), [FAQ](https://mailstrom.co/faq),
  [email management](https://mailstrom.co/email-management), [pricing](https://mailstrom.co/pricing)
- Leave Me Alone: [home](https://leavemealone.com/), [pricing](https://leavemealone.com/pricing/),
  [Screener help](https://help.leavemealone.com/en/start-here/the-basics/how-to-block-emails-with-the-screener),
  [Rollup help](https://help.leavemealone.com/en/rollups/what-is-a-rollup),
  [after unsubscribe](https://help.leavemealone.com/en/unsubscriber/what-happens-after-i-click-unsubscribe)
- Unroll.me [snippet]: [home](https://unroll.me/),
  [Rollup](https://support.unroll.me/hc/en-us/articles/200271733-What-is-the-Rollup),
  [edit subscriptions](https://support.unroll.me/hc/en-us/articles/200391928-How-do-I-edit-my-email-subscriptions),
  [how it unsubscribes](https://support.unroll.me/hc/en-us/articles/201748983-How-does-Unroll-Me-unsubscribe-me-from-a-subscription-),
  [data use](https://support.unroll.me/hc/en-us/articles/115005696183-What-do-we-do-with-your-data),
  [panel opt out](https://support.unroll.me/hc/en-us/articles/360037344092-How-to-Opt-Out-of-our-measurement-panel)
- Superhuman [snippet]: [unwanted emails](https://help.superhuman.com/hc/en-us/articles/38458459391635-Dealing-with-Unwanted-Emails),
  [pricing plans](https://help.superhuman.com/hc/en-us/articles/46178817646861-Pricing-Plans),
  [Labels (Gmail)](https://help.superhuman.com/hc/en-us/articles/46005736546061-Labels-Gmail-Accounts),
  [Superhuman for Gmail](https://help.superhuman.com/hc/en-us/articles/46183279736461-Superhuman-Mail-for-Gmail),
  [Email Assistant](https://help.superhuman.com/hc/en-us/articles/46005854346893-Email-Assistant-by-Superhuman-Mail-Gmail),
  [prompt tips](https://help.superhuman.com/hc/en-us/articles/39785596906387-Best-Practices-for-Writing-AI-Prompts);
  fetched directly: [Auto Labels changelog](https://new.superhuman.com/auto-labels-custom-auto-labels-313354),
  [Split Inbox controls](https://new.superhuman.com/split-inbox-controls-321318)
- Shortwave: [Customize your Shortwave](https://www.shortwave.com/docs/guides/labels/);
  [snippet]: [pricing](https://www.shortwave.com/pricing/), [changelog](https://www.shortwave.com/changelog/)
- Spark: [customize inbox](https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox),
  [pricing](https://sparkmailapp.com/pricing);
  [snippet]: [accept or block](https://sparkmailapp.com/help/set-up-focus/accept-or-block-new-senders),
  [unsubscribe on iOS](https://sparkmailapp.com/how-to-unsubscribe-emails-ios)
- Gmail: [categories](https://support.google.com/mail/answer/3094499?hl=en),
  [AI Inbox](https://support.google.com/mail/answer/16845247?hl=en),
  [Workspace update 2026-10](https://workspaceupdates.googleblog.com/2026/10/gmails-ai-inbox-is-rolling-out-to-paid-Workspace-users.html);
  [snippet]: [manage subscriptions](https://support.google.com/mail/answer/15621070?hl=en),
  [launch blog](https://blog.google/products-and-platforms/products/gmail/new-manage-subscriptions-unsubscribe/)
- Apple: [iCloud categories](https://support.apple.com/guide/icloud/use-categories-mmafbebd3108/icloud),
  [categorization privacy](https://www.apple.com/legal/privacy/data/en/mail-categorization/);
  [snippet]: [iPhone categories](https://support.apple.com/guide/iphone/use-categories-iphfe4a36baf/ios),
  [Mac categories](https://support.apple.com/en-afri/guide/mail/mlhlp1190/mac),
  [Apple Intelligence in Mail](https://support.apple.com/en-ca/guide/iphone/iph9ae667055/ios)
- HEY: [how it works](https://www.hey.com/how-it-works/), [pricing](https://www.hey.com/pricing/),
  [Screener](https://help.hey.com/article/722-the-screener), [The Feed](https://help.hey.com/article/761-the-feed),
  [Paper Trail](https://help.hey.com/article/787-paper-trail)

Not reached: SaneBox and Clean Email pricing pages, all Unroll.me and Superhuman help pages
(403, read via search excerpts), Apple iPhone and Mac category pages (navigation only on fetch).
No secondary sources were needed for any claim above.
