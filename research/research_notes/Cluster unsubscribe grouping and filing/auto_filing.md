# Auto-filing new mail: mechanisms, timing, controls, and results (state as of 2026-10-16)

Scope: how email products file new mail into groups or folders after it arrives (instant filters, delayed or batched delivery, schedules), what users control, what is measured, and the platform limits that apply to Cluster (a header-only, on-device Chrome MV3 extension for Gmail and Outlook with no server). Vendor claims are labeled "vendor". Independent evidence is labeled "independent".

## 1. How SaneBox, HEY, Superhuman, Spark, Clean Email, Outlook Sweep, Gmail/Inbox and Shortwave file mail

### Takeaway
Two models exist. **Server-side at arrival** covers Gmail filters, Outlook inbox rules, HEY sender routing and SaneBox via IMAP IDLE: mail is filed seconds after it lands, and the provider runs the work whether or not a client is open. **Scheduled or batched** covers Outlook Sweep (daily), Google Inbox bundles (once a day or week), Shortwave batched delivery, Boomerang Inbox Pause and the SaneBox Digest (daily summary). Sender-level, user-confirmed routing (HEY, SaneBox training, Superhuman "Always Archive") is the common UI pattern. Published results are almost all vendor claims with no methodology.

### Cited Findings
**SaneBox**
- SaneBox sorts on "headers (sender, subject, etc.)" and doesn't send or receive mail itself. "SaneBox doesn't send or receive emails; your server handles that." — [SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work)
- Timing: it uses IMAP IDLE to tell the server to move lower-priority messages to @SaneLater. If SaneBox is offline, new mail stays in the Inbox unsorted until it comes back. So mail lands in the Inbox first and is moved shortly after. — [SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work)
- Its folders hold "emails we automatically sort after they arrive in your inbox". Snoozed mail "will resurface in your inbox" when the snooze period ends. No delay or polling interval is published. — [SaneBox help 248](https://www.sanebox.com/help/248-how-often-does-sanebox-move-my-email)
- Training: dragging a message to a Sane folder teaches SaneBox where similar mail goes, and moving it back to the Inbox "retrains" it. — [SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work)
- SaneBlackHole: moving one message there routes that sender's future mail there. Messages in it are trashed after 7 days. It is meant for unwanted legitimate senders, not spam. — [SaneBox help 235](https://www.sanebox.com/help/235-saneblackhole-what-do-i-do-with-my-saneblackhole-folder)
- Digest: a daily summary email that lists what is in the Sane folders. The dispatch schedule is adjustable in the dashboard. SaneBox advises that checking those folders often works against the product's purpose. — [SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work); [SaneBox help 251](https://sanebox.com/help/251-i-find-myself-having-to-check-too-many-email-folders)
- SaneNews holds newsletters. The Digest has an "Inbox Once" button that brings one back for a single read. Moving a newsletter to the Inbox stops filtering for that sender (secondary review). — [affninja review](https://affninja.com/sanebox-review/)
- Vendor time-saved claims conflict:
  - "more than 4 hours" a week (current Trustpilot company profile) — [Trustpilot](https://uk.trustpilot.com/review/sanebox.com)
  - about 8 hours a month on the executives page — [SaneBox for CEOs](https://www.sanebox.com/for/ceos-and-executives)
  - "100+ hours a year" in a 2012 blog post — [SaneBox blog 2012-10-23](https://blog.sanebox.com/2012/10/23/how-does-sanebox-save-you-time/)
  - None of these gives a methodology.
- Independent and anecdotal evidence:
  - A PCWorld hands-on test said that after about 15 minutes SaneBox had cleaned up the tester's Gmail (a backlog sort, not live latency). — [PCWorld](https://www.pcworld.com/article/465508/sanebox_shows_you_only_the_email_you_need_to_see.html)
  - A G2 reviewer said it filters "almost instantaneously". — [G2 reviews](https://g2.com/products/sanebox/reviews_and_filters?page=2)
  - A Dupple review (updated July 2026) says SaneBox analyzes 4 to 6 weeks of history and sorts with "decent accuracy" within a couple of days. — [Dupple](https://dupple.com/reviews/sanebox)
  - No published accuracy percentage was found.

**HEY**
- Per-sender routing: the user picks Imbox, The Feed or Paper Trail for each sender, and new mail from that sender goes there automatically. Routing can't be set for a whole domain, only for specific senders. Changing a sender's destination also moves their existing emails. — [HEY help: The Feed](https://help.hey.com/article/761-the-feed)
- The Feed shows newsletters "already open", newest at the top. Feed mail goes to Recycling after 90 days by default. — [HEY help: The Feed](https://help.hey.com/article/761-the-feed)
- The Imbox is for important mail, The Feed for newsletters, and Paper Trail for receipts. — [HEY how it works](https://www.hey.com/how-it-works/)
- Users rebuilding HEY on Fastmail used contact groups and server rules, with the Feed folder set to auto-purge. — [dev.to: HEY to Fastmail](https://dev.to/borama/moving-from-hey-to-fastmail-phe)

**Superhuman** (Auto Labels and Auto Archive, announced April 2025)
- In Settings the user picks which Auto Labels bypass the inbox. Matching mail goes to that label and to an "Auto Archived" folder, and "Auto Archived" appears below those conversations. An "Always Archive" tab takes specific addresses or whole domains. — [Superhuman help: Auto Archive](https://help.superhuman.com/hc/en-us/articles/40127823829267)
- Launch coverage dates the update to April 2025. — [AlternativeTo 2025-04](https://alternativeto.net/news/2025/4/superhuman-s-new-update-brings-auto-reminders-auto-drafts-auto-labels-and-auto-archive/)
- The Executive Assistants guide recommends a Starred (Gmail) or Flagged (Outlook) split inbox for one-off messages. — [Superhuman help: Executive Assistants](https://help.superhuman.com/hc/en-us/articles/46005779957261-Executive-Assistants)

**Spark (Readdle)**
- "Smart" notifications mute strangers and automated emails. "People you reply to are considered important" and trigger notifications. A user can mark a contact important or not important with the bell icon. — [Spark help: notifications](https://support.readdle.com/spark/getting-started/customize-notifications)
- Notifications arrive only while Spark is running. This page is from the Spark Classic help. — [Spark help](https://readdle.helpjuice.com/customize-notifications)

**Clean Email**
- Auto Clean actions: Trash, Archive, Move to Folder and **Keep Newest**, which "maintains an updated inbox by deleting older emails as new ones arrive". Rules can apply by sender or subject. — [Clean Email help: Auto Clean rules](https://clean.email/help/auto-clean/create-rules)
- Safety rule: if message age is used as a criterion, pick at least one other criterion too. "Otherwise, Clean Email will clean ALL messages that reach the specified age." — [Clean Email help: Auto Clean rules](https://clean.email/help/auto-clean/create-rules)
- A separate Screener keeps first-time senders out of the Inbox. — [Clean Email features](https://clean.email/features)

**Outlook Sweep and Rules**
- Sweep rules run once every 24 hours on the server, so they work even when Outlook is closed. Sweep can be created only in Outlook on the web and the new Outlook for Windows. — [Clean Email: Outlook sweep rules](https://clean.email/create-email-rules/outlook-rules/outlook-sweep-rules)
- Options are "Always keep the latest message" and "Always move messages older than 10 days". — [How-To Geek](https://www.howtogeek.com/662263/use-the-built-in-sweep-feature-in-outlook-online-to-clear-unwanted-emails/)
- Secondary sources disagree on whether the 10-day option deletes or moves:
  - [BetterCloud](https://www.bettercloud.com/monitor/the-academy/how-to-use-sweep-to-clean-up-your-office-365-inbox/) and [SVSU KB](https://svsu.teamdynamix.com/TDClient/1949/Portal/KB/PrintArticle?ID=98503) say it deletes.
  - The label suggests a move.
  - Microsoft's own Sweep support URL I tried returned 404, so this is unresolved.

**Google Inbox bundles (2014 to 2019) and Gmail**
- The Gmail Blog post "A bit about Bundles in Inbox" is dated 2014-11-19. Its body could not be retrieved. — [Gmail Blog](https://gmail.googleblog.com/2014/11/a-bit-about-bundles-in-inbox.html)
- Bundles could appear as mail arrived, once a day or once a week. — [Computerworld tips](https://www.computerworld.com/article/1625113/5-great-tips-for-getting-more-out-of-google-inbox.html)
- Computerworld (2019-12-03): "Bundles would let you choose to receive certain types of messages only once a day or once a week." It recreated this in Gmail with Boomerang Inbox Pause, which releases mail at user-chosen times and has exceptions (senders, domains, keywords, `category:primary`) that deliver immediately. Inbox Pause needs the Pro plan at $15 a month. — [Computerworld 2019](https://www.computerworld.com/article/3487279/inbox-like-delivery-gmail.html)
- The "7am" delivery time came from a user's own setting, not a built-in default. — [Tom McFarlin](https://tommcfarlin.com/efficient-with-email/)
- Gmail itself has no time-based delivery for categories, per Computerworld. — [Computerworld 2019](https://www.computerworld.com/article/3487279/inbox-like-delivery-gmail.html)

**Shortwave**
- "Batched delivery" launched 2022-12-14. It lets users schedule non-urgent emails to arrive only at chosen times. — [Product Hunt listing](https://webmail.hunted.space/product/shortwave-6/launches/shortwave-batched-delivery)

### Inferences
- Cluster's "move within about 10 minutes" sweep is closest to SaneBox's model: deliver to the Inbox first, then move. SaneBox does the move server-side within seconds through IMAP IDLE. Cluster's sweep would be much slower and would run only while Chrome is open.
- The products with the most reliable filing (HEY, Gmail filters, Outlook rules, SaneBox) all act on the provider side at arrival. For Cluster, creating native Gmail filters and Outlook rules for grouped senders is the only way to get at-arrival filing with no server. The sweep is then a backup, not the main path.
- Per-sender routing confirmed by the user (HEY, SaneBlackHole, Superhuman Always Archive) is the dominant control. HEY's choice to route by sender only, not by domain, is a deliberate guard against misfiling.

### Gaps
- No published SaneBox latency or accuracy figure was found.
- HEY Screener timing, and whether Feed or Paper Trail mail triggers notifications, are not documented in the pages fetched.
- Shortwave's current bundle options (as of October 2026) were not confirmed. The current Shortwave help center was not retrieved.
- Microsoft's own Sweep documentation was not retrieved (404), so whether "older than 10 days" moves or deletes is unconfirmed.

## 2. Batched delivery: HCI evidence

### Takeaway
Independent evidence is mixed. Kushlev and Dunn (2015) found lower daily stress when people checked email three times a day with notifications off. Mark et al. (CHI 2016) found **no evidence** that batching lowers stress, though batching was linked to higher self-rated productivity.

### Cited Findings
- **Kushlev and Dunn, "Checking email less frequently reduces stress", Computers in Human Behavior (2015)**
  - Design: a two-week within-subjects field experiment with 124 adults.
  - Conditions: one week limited to checking three times a day with notifications off, and one week of unlimited checking.
  - Results: daily stress was significantly lower in the limited week, and lower stress predicted higher well-being.
  - Source: [Kushlev & Dunn PDF](https://www.interruptions.net/literature/Kushlev-ComputHumBehav15.pdf)
  - Kushlev said most participants found checking only a few times a day difficult. — [PsyPost](https://www.psypost.org/resist-temptation-check-email-less-reduce-stress-study-finds/)
- **Mark, Iqbal, Czerwinski, Johns and Sano, "Email Duration, Batching and Self-interruption", CHI 2016**
  - Design: 40 information workers tracked for 12 workdays with computer logging, biosensors and daily surveys.
  - Batching: "we found no evidence that batching email leads to lower stress." Batching was linked to higher self-rated productivity.
  - Other findings: longer daily email time was linked to lower perceived productivity and higher measured stress. People who checked email through self-interruption reported higher productivity than those driven by notifications.
  - Source: [Microsoft Research PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/06/Email20Duration20Camera20Ready20submission3-1.pdf)

### Inferences
- The robust lever in Kushlev and Dunn was fewer checks plus notifications turned off. It was not filing as such. Cluster's filing helps mainly when it stops a low-value message from ever triggering a notification or an Inbox glance. A 10-minute post-arrival move does not do that.
- Neither study tested automatic filing of bulk senders, so the evidence for Cluster's exact feature is indirect.

### Gaps
- No controlled study was found that measures automated sender-based filing (SaneBox-style) against stress or time.

## 3. Timing: file at arrival versus deliver then file, notifications, and the "I didn't see it" risk

### Takeaway
Products file after arrival when they live outside the provider's delivery pipeline (SaneBox via IMAP, Clean Email, Cluster's sweep). Providers' own rules (Gmail filters, Outlook rules, HEY) file at arrival. The deliver-then-file gap means a phone may already have notified the user. The mitigations found are: separate notification policies (Spark Smart), immediate-delivery exceptions (Boomerang), digests listing what was filed (SaneBox), and auto-expiry only in clearly marked folders.

### Cited Findings
- SaneBox leaves mail unsorted in the Inbox when its service is offline. Delivery is never blocked, only filing is delayed. — [SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work)
- The SaneBox daily Digest lists everything in Sane folders, which guards against unseen mail. — [SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work)
- Boomerang Inbox Pause (as of 2019) offers exceptions by sender, domain, keyword or `category:primary` for immediate delivery. — [Computerworld 2019](https://www.computerworld.com/article/3487279/inbox-like-delivery-gmail.html)
- Spark keeps notification policy separate from filing. It notifies only for people the user has replied to and mutes automated senders. — [Spark help](https://support.readdle.com/spark/getting-started/customize-notifications)
- Destructive auto-expiry is confined to clearly named folders:
  - SaneBlackHole trashes after 7 days. — [SaneBox help 235](https://www.sanebox.com/help/235-saneblackhole-what-do-i-do-with-my-saneblackhole-folder)
  - HEY Feed recycles after 90 days. — [HEY help](https://help.hey.com/article/761-the-feed)
  - Clean Email warns that an age-only rule cleans "ALL messages". — [Clean Email help](https://clean.email/help/auto-clean/create-rules)

### Inferences
- With a 10-minute sweep, mobile push for the original Inbox arrival has probably already fired, and the user may see then lose a message. Native filters avoid this because they act before the Inbox. Cluster should prefer filter or rule creation for confirmed groups and use the sweep only for stragglers. Examples: senders added after the filter was made, Outlook rules that exceed quota, or messages that arrived while a filter edit was pending.
- A "recently filed" view or digest, in the spirit of SaneBox's Digest, is the standard answer to "I didn't see it".

### Gaps
- No documented real-world incident was found of a vendor's auto-filing causing missed important mail. Reviews were not deeply searched for this.
- No documentation was found on whether SaneBox or Clean Email suppress phone notifications for mail they later move.

## 4. Platform limits (Gmail API, Graph, Chrome MV3)

### Takeaway
Gmail push requires Cloud Pub/Sub, which implies Google Cloud infrastructure (a pull subscription is possible but still needs a GCP project). Google itself recommends polling-based sync with `history.list` for browser clients. Graph change notifications require a public HTTPS webhook (or Event Hubs or Event Grid), so a serverless extension must poll with delta queries. Chrome alarms fire at most every 30 seconds, don't wake a sleeping device, and the service worker dies after 30 seconds idle. A 10-minute sweep is easy to schedule but runs only while Chrome is running and the device is awake.

### Cited Findings
**Gmail**
- "The Gmail API uses the Cloud Pub/Sub API to deliver push notifications." Watch must be renewed "at least once every 7 days" (daily is recommended). Notifications are capped at one per second per user, and excess ones are dropped. — [Gmail API push guide](https://developers.google.com/workspace/gmail/api/guides/push)
- Push can be delayed or dropped, so the docs advise falling back to `history.list` after a period with no notifications. For user-owned devices such as browsers, they recommend poll-based sync. — [Gmail API push guide](https://developers.google.com/workspace/gmail/api/guides/push)
- History records are "typically available for at least one week and often longer" and can be shorter in rare cases. An out-of-range `startHistoryId` returns HTTP 404, which requires a full sync. — [Gmail API sync guide](https://developers.google.com/workspace/gmail/api/guides/sync)
- Limit: a maximum of 1,000 filters per account. — [Gmail API filters.create](https://developer.google.com/gmail/api/v1/reference/users/settings/filters/create)
- The filter criteria length limit is undocumented. One blog test hit the cap at about 1,469 to 1,488 characters (anecdotal). — [spudart blog](https://www.spudart.org/blog/character-limit-for-gmail-filter/)
- One claim of a "10,000 filters" limit conflicts with Google's docs. — [SupportBee](https://supportbee.com/blog/how-to-create-rules-and-filters-in-gmail)

**Outlook / Microsoft Graph**
- Inbox rules are limited to 256 KB in total across all enabled rules. Disabled rules don't count, and there is no rule-count cap. Admins can lower the quota (range 32 to 256 KB) but not raise it. Users are warned when they hit the limit. — [Microsoft Learn: Inbox rules space](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/outlook-on-the-web/increase-the-space-used-by-inbox-rules)
- A community estimate puts capacity at about 300 average rules. — [robert365](https://robert365.com/article/rules-cannot-be-uploaded-to-exchange-insufficient-space)
- Webhooks: "you must create a publicly accessible, HTTPS-secured endpoint". The endpoint must echo a validation token within 10 seconds, and failed deliveries are retried for up to 4 hours. The alternatives are Event Hubs or Event Grid. (Page updated 2026-04-22.) — [Graph webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)
- Delta query is per folder (`/me/mailFolders/{id}/messages/delta`) and returns a `@odata.deltaLink` to save for the next round. It supports `changeType=created` and `$select`. The only supported `$filter` is on `receivedDateTime`, which caps results at 5,000. `$search` is not supported. — [Graph delta query for messages](https://learn.microsoft.com/en-us/graph/delta-query-messages)

**Chrome MV3**
- "Chrome limits alarms to at most once every 30 seconds but may delay them an arbitrary amount more." Values under 0.5 minutes are ignored. Alarms don't wake a sleeping device, and missed ones fire once on wake. `persistAcrossSessions` (Chrome 150+) defaults to true. Extensions should re-check alarms each time the service worker starts. — [chrome.alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- The service worker is stopped after 30 seconds of inactivity, a single request over 5 minutes gets it terminated, and so does a `fetch()` response slower than 30 seconds. Extension API calls reset the idle timer (Chrome 110+). — [Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)

### Inferences
- A 10-minute `chrome.alarms` sweep is feasible:
  - Gmail: call `history.list` from the saved historyId, falling back to a full sync on 404.
  - Outlook: call Inbox delta with `changeType=created` and a narrow `$select` for header-only data.
  - Each sweep must finish well within the 5-minute and 30-second-fetch limits, so batch modify calls.
  - Nothing runs while Chrome is closed or the device sleeps. After a long gap, the history ID may have expired, so plan for a full resync path.
- Native filters and rules are better than the sweep for at-arrival filing. The constraints are 1,000 Gmail filters (combine many senders into one `from:(a OR b OR …)` filter per group, kept under about 1,400 characters) and 256 KB of Outlook rules (combine senders per group into one rule).

### Gaps
- The official Gmail filter criteria length limit is not documented by Google.
- The exact per-rule byte cost of Outlook rules is not measurable, per Microsoft. — [Microsoft Learn](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/outlook-on-the-web/increase-the-space-used-by-inbox-rules)

## 5. How products avoid filing important mail by mistake

### Takeaway
The safeguards found are:
- **Per-sender, user-confirmed routing**, not by domain (HEY)
- **Training by moving back to the Inbox** (SaneBox)
- **Immediate-delivery exceptions** for senders, keywords or the Primary category (Boomerang)
- **Treating people you reply to as important** (Spark)
- **A Starred or Flagged split** (Superhuman)
- **Requiring a second criterion for destructive age rules** (Clean Email)
- **Daily digests** of filed mail (SaneBox)

No source documented an explicit security-mail exception (for example 2FA codes or password resets) in these products.

### Cited Findings
- HEY routes by sender only, not domain. — [HEY help](https://help.hey.com/article/761-the-feed)
- SaneBox: moving a message back to the Inbox retrains it. Moving a SaneNews item to the Inbox stops filtering for that sender. — [SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work); [affninja](https://affninja.com/sanebox-review/)
- Spark: "People you reply to are considered important." — [Spark help](https://support.readdle.com/spark/getting-started/customize-notifications)
- Superhuman: a Starred/Flagged split for one-off messages, and auto-archived mail labeled "Auto Archived" and searchable. — [Superhuman EA guide](https://help.superhuman.com/hc/en-us/articles/46005779957261-Executive-Assistants); [Superhuman Auto Archive](https://help.superhuman.com/hc/en-us/articles/40127823829267)
- Boomerang exceptions: senders, domains, keywords, `category:primary`. — [Computerworld 2019](https://www.computerworld.com/article/3487279/inbox-like-delivery-gmail.html)
- Clean Email: an age-only rule cleans ALL messages, so a second criterion is required. — [Clean Email help](https://clean.email/help/auto-clean/create-rules)

### Inferences
- For Cluster, the low-risk defaults that follow are:
  - Never move starred or important-flagged mail.
  - Never move threads the user has replied to.
  - Never move mail from contacts.
  - Exclude security keywords such as "verification code", "password reset" and "sign-in", even from grouped senders.
  - Move, never delete, in automatic sweeps.
  - Show a "filed today" digest.
- These are design inferences, not documented vendor features.

### Gaps
- No vendor documentation was found for security or 2FA exceptions in automatic filing.
- No independent misfiling-rate data was found for any product.
