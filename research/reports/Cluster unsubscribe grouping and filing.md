# Let Gmail file, let Cluster decide

Date: 2026-10-16. Built from the four notes in `research/research_notes/Cluster unsubscribe grouping and filing/`. It also draws on the sender algorithm deep dive and its notes, and it checks the two design notes `research/2026-10-16-suggestions-sorting-filtering.md` and `research/2026-10-16-unsubscribe-and-grouping.md`. Where the earlier work and the new notes disagree, the new notes win.

**Bottom line.** The products that succeed at all four jobs share one pattern. They decide per sender, they act through the provider's own machinery, and they make every decision reversible. Unsubscribe is the same everywhere: a List-Unsubscribe POST or mailto, then a backstop filter. Gmail is the only provider that enforces it, by sending later mail from an unsubscribed sender to Spam. Grouping works best by exact sender. Yahoo's research measured that merging to the domain level loses the most accuracy, and Shortwave walked back automatic bundling in 2023. Filing at arrival happens only through server-side filters and rules. A sweep that runs every few minutes can catch up, but it cannot stop the phone from buzzing first. Suggestions in every product key on volume and on about 30 days without an open. No product documents using the user's Sent mail, which Cluster now has. Measured results are thin. Most are vendor claims or audits from 2018 and earlier. For Cluster this means the draft plan is mostly right. It needs five corrections. Gmail already blocks after its own unsubscribe. Company grouping should be a view the user opts into, not a default. Gmail rarely holds duplicate copies. The 10-minute promise should be a worst case, with filters giving zero minutes for most mail. And a "filed today" record is needed so filed mail never feels lost.

## Every provider unsubscribes the same way, and only Gmail enforces it

All the big providers build on the same two standards. RFC 2369 defines the List-Unsubscribe header, and RFC 8058 adds the one-click POST. Since 1 February 2024, senders of more than 5,000 messages a day to Gmail must send both `List-Unsubscribe-Post: List-Unsubscribe=One-Click` and an HTTPS List-Unsubscribe link, plus a visible link in the body, and keep spam complaints under 0.3% ([Google sender guidelines](https://support.google.com/a/answer/81126)). The "honour within 2 days" rule comes from Google's announcement as quoted in press coverage. The current guidelines page does not state it ([Kelley Drye](https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/new-gmail-marketing-requirements-will-impact-most-advertisers)). Yahoo lists a sender in its Subscription Hub only if it supports one-click or mailto and has "sufficient reputation and engagement" ([Yahoo Sender Hub](https://senders.yahooinc.com/subhub)). Microsoft's rules for high-volume senders took effect on 5 May 2025. Sources disagree on whether they require one-click ([Mailgun](https://www.mailgun.com/blog/deliverability/microsoft-sender-requirements/), [InboxAlly](https://docs.inboxally.com/compliance-industry-updates/microsoft-outlook-changes-for-bulk-senders-in-2025/)).

The providers differ in what happens after the click. Gmail's Manage subscriptions page, announced on 8 July 2025, lists senders by frequency with a count for "the past few weeks" ([Google Workspace Updates](https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html)). Its help page says one unsubscribe covers "all of that sender's related active mailing lists." **New mail from that sender then goes to Spam with a banner**, and "Report not spam" undoes it. When a sender needs its own website, Gmail offers "Go to website" or "Block instead" ([Gmail Help](https://support.google.com/mail/answer/15621070)). The draft note says Gmail does not block senders that ignore the request. That is wrong, and it changes how Cluster should present its own fallback. Outlook.com removes junk first, then looks for subscription headers. Its list sits under Settings, and it offers Block separately ([Microsoft Support](https://support.microsoft.com/en-us/office/how-to-manage-email-subscriptions-in-outlook-com-26c8f447-2141-4bff-8781-80a4e6b7f0c8)). Apple Mail has shown an Unsubscribe banner since iOS 10. After a confirm dialog, it sends an email from the user to the mailto address on its own ([Spam Resource](https://www.spamresource.com/2023/02/faq-list-unsubscribe-on-apple-mail-on.html)). That is the clearest precedent for Cluster sending mailto requests itself. Proton's Newsletters view, rolled out from June 2025, keeps Active and Unsubscribed tabs and warns that the result "differs from list to list" ([Proton Support](https://proton.me/support/auto-unsubscribe)).

The cleanup tools follow a ladder. They try the header first and fall back to a mailbox filter. Clean Email unsubscribes without forms, remembers past unsubscribes, offers Pause as a block without unsubscribing, and says it processes "only email headers, not message bodies" ([Clean Email Unsubscriber](https://clean.email/unsubscriber)). When a sender ignores the request, its later mail is routed to Trash ([Leave Me Alone comparison](https://leavemealone.com/blog/best-bulk-email-unsubscribe-tools-2026/)). Leave Me Alone sends the header request and blocks mailbox-side when there is no header. Superhuman's Cmd+U emails a request, opens the company page, or both, and offers to archive or trash existing mail ([Superhuman Help](https://help.superhuman.com/hc/en-us/articles/46005635358349-Dealing-with-Unwanted-Emails)). Shortwave shows new senders a "block and unsubscribe" banner, and blocked mail goes straight to Trash ([Shortwave docs](https://www.shortwave.com/docs/migrations/migrating-from-superhuman/)). SaneBlackHole hides a sender and trashes its mail after 7 days ([SaneBox help 235](https://www.sanebox.com/help/235-saneblackhole-what-do-i-do-with-my-saneblackhole-folder)). Trimbox reportedly never contacts senders and only filters, though that claim comes from a competitor ([Clean Email vs Trimbox](https://clean.email/blog/clean-email-alternatives/best-trimbox-alternative)). Across these tools, the backstop filter is what users experience as "it worked".

Safety gating is universal. Gmail hides Unsubscribe for lists "known to be owned by spammers" ([Gmail Help](https://support.google.com/mail/answer/8151)). Outlook drops Junk-filtered mail from its list. DNSFilter told the Wall Street Journal in June 2025 that about 1 in 644 clicks on links with "unsubscribe" in the URL led to potentially malicious sites ([WSMV](https://www.wsmv.com/2025/06/12/new-report-warns-clicking-unsubscribe-unwanted-emails)). Cluster's current rule fires a POST only when a provider-checked DKIM signature covers both headers and aligns with From. That is stricter than any documented provider rule, and it should stay.

## Grouping works per sender, and wider merges lose accuracy

Nearly every shipping product groups by sender address and lets the user widen or undo it. Spark collapses newsletters and notifications to one line per sender, and grouping by domain needs a paid plan ([Spark help](https://sparkmailapp.com/help/manage-your-inbox/group-emails-by-sender)). Apple Mail on iOS 18.2 groups non-Primary categories by sender and never groups Primary. Re-categorizing a sender applies to past and future mail ([Apple Support](https://support.apple.com/guide/iphone/use-categories-iphfe4a36baf/ios)). HEY asks once per new sender and routes it to Imbox, The Feed or Paper Trail. Moving a sender moves all their existing mail too, and **HEY deliberately does not route by domain** ([HEY help](https://help.hey.com/article/761-the-feed)). Shortwave bundles by label, mailing list and sender. On 16 November 2023 it changed course: "Automated senders, channels, and mailing lists no longer bundle by default." Users now press "Bundle threads like this" instead ([Shortwave changelog](https://www.shortwave.com/changelog/)). Google Inbox collapsed each bundle to one row, let users sweep it in one action, and set delivery per bundle. When Google shut it in 2019, those were the features reviewers said Gmail still lacked ([9to5Google](https://9to5google.com/2019/04/01/inbox-gmail-features-havent-arrived/)).

Research explains why sender is the right base. Grbovic and colleagues at Yahoo studied 500 billion messages. They found that one company's domain mixes shopping, travel, payroll and personal mail. Target.com, for example, sends orders, job mail, payroll and staff email. They wrote that "domain-level aggregation… suffers the most loss." Companies usually use a different address for each type of mail, so the sender level loses little. Their design looks up a cheap per-sender table first and classifies each message only when the sender is unclear. That reached close to 90% precision and recall. It also found that **70% of users never create a folder** ([arXiv 1606.09296](https://arxiv.org/pdf/1606.09296)). Free-mail domains carry machine mail, and corporate domains carry personal mail, so a domain alone is not a brand.

The template level is also proven, and it works on headers. Ailon and colleagues at Yahoo keyed a template as a hash of the sender plus a subject with its variable parts replaced by wildcards. On 12.5 million inboxes, threading built on it reached 70% recall at 90% precision ([ACM via Unpaywall](https://unpaywall.org/10.1145%2F2433396.2433447)). Google's 2019 VLDB paper calls that key "a good way to compute a template key." It also reports that 90% of mail traffic is machine-generated, from "a few million templates" ([Whittaker et al., PVLDB](https://www.vldb.org/pvldb/vol12/p1235-whittaker.pdf)). Google forms a template only when it reaches k distinct recipients. On one device, the equivalent is a minimum message count before a template shows as a group.

Duplicates matter less than the draft assumes. Gmail silently keeps only the first copy of a Message-ID, even across aliases and list cross-posts ([Simplelists](https://www.simplelists.com/blog/enhance/gmail-solution-mail-sent-to-a-list-doesnt-show-in-inbox/), [Sympa list](https://lists.sympa.community/arc/en/2021-07/msg00004.html)). This evidence comes from users and vendors, not Google. Exact duplicates will be rare in a Gmail index. They are more likely in Outlook, or when the same person connects two accounts. No product documents collapsing near-identical notifications. A template group with a count does that job better than deleting copies.

## Filters file at arrival, and a sweep can only catch up

Two filing models exist. The first files at arrival on the server: Gmail filters, Outlook inbox rules, HEY routing, and SaneBox through IMAP IDLE. The second files on a schedule: Outlook Sweep once every 24 hours, Google Inbox bundles once a day or week, Shortwave batched delivery, and Boomerang Inbox Pause ([SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work), [Clean Email on Sweep](https://clean.email/create-email-rules/outlook-rules/outlook-sweep-rules), [Computerworld](https://www.computerworld.com/article/3487279/inbox-like-delivery-gmail.html)). SaneBox is the closest model to Cluster's sweep. Mail lands in the Inbox first and is moved after. If SaneBox is offline, mail stays unsorted until it returns, so delivery is never blocked ([SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work)). Superhuman's Auto Archive tags filed mail "Auto Archived" and keeps it searchable ([Superhuman help](https://help.superhuman.com/hc/en-us/articles/40127823829267)). SaneBox sends a daily Digest of everything it filed. These are the standard answers to "I didn't see it."

The platform limits decide the design. Gmail push needs Cloud Pub/Sub, and Google recommends polling `history.list` for browser clients. History is "typically available for at least one week," and an expired starting point returns 404 and needs a full sync ([Gmail push guide](https://developers.google.com/workspace/gmail/api/guides/push), [Gmail sync guide](https://developers.google.com/workspace/gmail/api/guides/sync)). Graph change notifications need a public HTTPS endpoint, so Cluster must poll the Inbox delta query, which returns a deltaLink for the next round ([Graph webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks), [Graph delta](https://learn.microsoft.com/en-us/graph/delta-query-messages)). Chrome alarms run at most every 30 seconds, may be delayed more, and do not wake a sleeping device ([chrome.alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)). Gmail allows 1,000 filters per account ([filters.create](https://developer.google.com/gmail/api/v1/reference/users/settings/filters/create)). One blog test found the criteria field caps at about 1,470 characters ([spudart](https://www.spudart.org/blog/character-limit-for-gmail-filter/)). Outlook rules share 256 KB across all enabled rules ([Microsoft Learn](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/outlook-on-the-web/increase-the-space-used-by-inbox-rules)).

The owner's idea, that new mail from a grouped sender moves into its group within about 10 minutes, is feasible. A 5-minute alarm reading the change feed meets it while Chrome is open. But a move 10 minutes after arrival comes after the phone has already notified. The evidence on batching also points away from timers alone. Kushlev and Dunn found lower daily stress among 124 adults who checked mail three times a day with notifications off ([Kushlev and Dunn](https://www.interruptions.net/literature/Kushlev-ComputHumBehav15.pdf)). Mark and colleagues at Microsoft found "no evidence that batching email leads to lower stress," though batching was linked to higher self-rated productivity ([Mark et al., CHI 2016](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/06/Email20Duration20Camera20Ready20submission3-1.pdf)). The lever with support is fewer interruptions. A filter that skips the inbox gives that. A sweep does not. So filters should do the main work, and the sweep should catch only what a filter cannot express.

The safeguards in the field are simple. HEY routes by sender only. SaneBox retrains when you move mail back. Spark treats "people you reply to" as important. Boomerang lets chosen senders and the Primary category through at once. Clean Email will not run an age-only rule without a second condition ([Clean Email help](https://clean.email/help/auto-clean/create-rules)). No product documents a security-mail exception for sign-in codes or password resets. Cluster should add one anyway.

## Suggestions key on volume and 30 days unopened, and nobody uses Sent

Native suggestions are simple. Gmail's nudge appears for promotional mail you have not opened in about a month. It is based on how many messages you get from a sender against how many you open ([Mailjet](https://www.mailjet.com/blog/news/understanding-gmail-unsubscribe/)). An earlier Inbox card fired after 4 weeks of inactivity ([Litmus](https://www.litmus.com/blog/unsubscribe-suggestions-what-it-means-for-email-marketers)). Proton offers the richest sort set: Least read, Most read, Most frequent, A to Z, Recently read and Recently received. Each row shows the unread count and the mail received in the past 30 days ([Proton Support](https://proton.me/support/mail-newsletters-view)). Leave Me Alone sorts by read rate and tags senders unopened for over 6 months ([LMA](https://leavemealone.com/blog/new-tags/)). Trimbox defaults to most recent, and Gmail, Mailstrom and SaneBox default to volume.

Clean Email adds two ideas worth copying. Its suggestions say whether they come from "your cleaning" or from what other users clean, and each one has a "Create Rule" button for future mail. Dismissing one means it "will not suggest the action again" ([Clean Email help](https://clean.email/help/tools/cleaning-suggestions)). Superhuman's "Get Me To Zero" lets users exclude Unread and Starred mail, and it can be undone for 7 days ([Superhuman help](https://help.superhuman.com/hc/en-us/articles/45295217605523-Achieve-Inbox-Zero)). None of these products documents replies or Sent history as a signal. Cluster has both. That makes "never suggest someone you write to" a real advantage, not a copy.

The need is measured, even if outcomes are not. Yahoo's WSDM 2018 study found about 85% of traffic could be unsubscribed from and over 90% of it went unread. Yet unsubscribe was used for under 2% of lists, by about 3% of users ([Gamzu et al.](https://doi.org/10.1145/3159652.3159698)). Users do not act unless a tool asks them at the right moment.

## Measured results are few, old and mostly vendor claims

| Result | Number | Source and strength |
|---|---|---|
| Retailers that stop mailing at once after unsubscribe | About 88% of top 200 US retailers (2018), up from 86% (2016) | [OTA via Internet Society](https://news.internetsociety.org/?p=18761), independent audit |
| Brands still mailing more than 10 days after confirming | 11% | [MediaPost on Return Path](https://www.mediapost.com/publications/article/311216/unsubscribe-practices-theyre-good-until-theyre.html), date unclear |
| Lists users unsubscribe from without help | Under 2% of lists, about 3% of users | [Yahoo WSDM 2018](https://doi.org/10.1145/3159652.3159698), research |
| Subscriptions per Unroll.me user, and unsubscribed | 104 and 18 (2012) | [TechCrunch](https://techcrunch.com/2012/03/29/unroll-me-combines-your-favorite-email-subscriptions-into-one-lets-you-kill-the-rest/amp/), vendor |
| Sender-level categorization accuracy | Close to 90% precision and recall | [Grbovic et al.](https://arxiv.org/pdf/1606.09296), research |
| Template-based threading | 70% recall at 90% precision | [Ailon et al.](https://unpaywall.org/10.1145%2F2433396.2433447), research |
| Users with no folders | 70% | [Grbovic et al.](https://arxiv.org/pdf/1606.09296), research |
| Outlook Clutter time saved | 82 minutes a month on average | [gHacks](https://www.ghacks.net/?p=113370), vendor |
| SaneBox time saved | "More than 4 hours" a week, or 8 hours a month, or 100 hours a year | [Trustpilot](https://uk.trustpilot.com/review/sanebox.com), [SaneBox](https://www.sanebox.com/for/ceos-and-executives), vendor, inconsistent |
| Commercial mail in Gmail Promotions | 90%, and 19.9% of users never open the tab | [Smart Insights](https://www.smartinsights.com/email-marketing/email-deliverability/new-gmail-tabs/), marketer data, 2013 |

Read together, these say three things. About 1 sender in 10 will ignore an unsubscribe, so a fallback filter is needed, not optional. Automatic grouping by sender is accurate enough to act on. And almost no user organizes mail alone. There is no independent measure of any tool's unsubscribe success rate, misfiling rate, or suggestion acceptance rate. No study since 2024 measures how fast senders stop. Cluster will have to measure its own results on the device.

## Where the draft plan stands

The two design notes hold up on most points. The sender profile, the per-sender kind vote, suggestions with real numbers, "still sending" checks, the mailto send path, the grace filter, and packed filters all match what the field does. Five points need correcting or extending.

| Draft says | Evidence says | Change |
|---|---|---|
| Gmail does not block senders that ignore the request | Gmail sends later mail to Spam after its own unsubscribe ([Gmail Help](https://support.google.com/mail/answer/15621070)) | Present Cluster's fallback as matching Gmail. Note that Cluster can also cover Outlook, mailto senders and web links |
| "Group by company" as one row per company, and company-wide filters `from:(brand.com)` | Domain merging loses the most accuracy. Spark makes it opt-in, HEY refuses it, Shortwave reversed auto-bundling | Default stays per sender. Company is a view the user switches on. A company filter is made only on user confirmation, and it excludes addresses the user writes to |
| "Delete 12 duplicate copies" suggestion | Gmail already keeps one copy per Message-ID | Collapse duplicates in counts everywhere. Offer the delete suggestion only on Outlook or across linked accounts, and only when copies exist |
| Filing "within 10 minutes" through minute limits and a sweep | Filters act at arrival and before notifications. A sweep acts after | Filters give "straight away" for confirmed groups. The 5-minute sweep makes 10 minutes the worst case for what filters cannot express |
| Gmail and Yahoo require action within 2 days | The current Google page does not state this. It comes from the announcement via press | Keep the 3-day grace, but word it as "senders usually need a day or two" rather than a legal deadline |

## Ten ranked changes for Cluster

Ranking is by user impact per unit of effort, with foundations first. Sizes are estimates.

| Rank | What | Why | Size |
|---|---|---|---|
| 1 | Sender profile with `companyKey`, `templateKey` and Message-ID de-dup | Every later item reads it | Medium |
| 2 | Unsubscribe backstop: filter at the moment of unsubscribe, plus an Unsubscribed list | The filter is what users feel as success. About 1 in 10 senders ignore requests | Small |
| 3 | Verify after grace, then offer Trash | Turns a request into a result, as Gmail does | Small |
| 4 | Suggestions v2 from the index, with Sent protection | Works on first open. Uses the one signal no rival documents | Medium |
| 5 | Filing: packed filters first, 5-minute change-feed sweep second | Zero minutes for most mail, 10 at worst | Medium |
| 6 | "Filed today" record in Recent, with Undo | The standard answer to "I didn't see it" | Small |
| 7 | Mailto sent by Cluster after one confirm | Closes the weakest of the three unsubscribe methods | Small |
| 8 | Senders screen sorts, filters and an opt-in company view | Proton's sort set plus "People first" | Medium |
| 9 | Template lines inside a sender | Collapses repeats with a literature-backed key | Small to medium |
| 10 | Local counters for every outcome | No outside study can tune Cluster's thresholds | Small, ongoing |

### Rank 1. Sender profile with company, template and de-dup keys

**What.** Build `senderProfile.ts` as the companion note describes. Add `companyKey` as the registrable domain from `registrableDomain.ts`, set only when DKIM d= aligns with it. Leave it null for free-mail domains and known ESP domains. Add `templateKey` as the sender plus a subject with digits, dates, amounts, order numbers and names masked. Count each Message-ID once.

**Why.** Yahoo's two-stage design and Ailon's template key are the best-measured header-only methods. ESP signatures such as sendgrid.net would merge unrelated brands, which is why DKIM d= alone is a poor company key ([Grbovic et al.](https://arxiv.org/pdf/1606.09296), [BIMI Group FAQ](https://bimigroup.org/faqs/)).

**How.** Make it a pure function over index rows, the Sent store and the census, and run it in shadow mode first. The dashboard bundle sits at 495 of 500 KB, so the old engagement code must come out in the same change.

### Rank 2. Unsubscribe backstop at the moment of unsubscribing

**What.** When the user unsubscribes, create or extend a filter that labels that sender's mail "Unsubscribed" and skips the inbox. It never deletes. Add an Unsubscribed tab, as Proton and Yahoo have, with an Undo that removes the filter.

**Why.** Every working tool pairs the request with a mailbox filter. Gmail sends to Spam, Clean Email to Trash, and SaneBlackHole trashes after 7 days. OTA and Return Path data put the ignore rate near 1 in 10. The filter also covers the processing gap, so the user sees the result at once.

**How.** Pack addresses into existing Cluster filters, about 40 per filter, to stay under 1,000 filters. On Outlook, add the sender to one packed rule within the 256 KB quota. Tell the user which method ran: "Done. They've confirmed." for one-click, "Request sent by email." for mailto, and "Finish on their page." for a link.

### Rank 3. Verify after grace, then offer Trash

**What.** Record the sender, List-Id, Feedback-ID, method and time. After 3 days, any new mail from that sender, read from the change feed, marks the request "ignored." Show one button: "Send their mail to Trash." Keep watching for 14 days, as `unsubscribeOutcome.ts` does now.

**Why.** Gmail enforces unsubscribes, and nobody else confirms them to the user. Return Path's 10-day finding supports a watch window longer than the grace period.

**How.** The change feed makes this exact and cheap. Track ignore rates per DKIM d= on the device, and use them to word future expectations.

### Rank 4. Suggestions v2, protected by Sent

**What.** Replace the snapshot EMA with `suggestFor(profile)`, one action per sender, as the companion note plans. Offer Unsubscribe only to senders still sending, and "Clear out old mail" to those that stopped. Use about 30 days without an open as the main trigger, as Gmail does. Never suggest anyone in the Close or Known tier.

**Why.** Volume plus 30 days unopened is the industry baseline. The Yahoo study shows people rarely act without a prompt. Sent-based protection is not documented by any rival.

**How.** Show the real numbers in plain words, such as "You opened 2 of their last 140." Keep dismissals for 30 days, as planned. Add Clean Email's "Create rule" as the second button, so a one-off cleanup can become a filing rule.

### Rank 5. Filing: packed filters first, sweep second

**What.** For a confirmed group, the default is "Straight away," done by a filter that skips the inbox. A 5-minute alarm reads `history.list` on Gmail and the Inbox delta on Outlook. It files what filters cannot express, such as decisions from the profile's kind vote, senders added since the filter was made, and rules over quota. That makes 10 minutes the worst case while Chrome is open. Keep "after 10 minutes" as an option for users who want to see mail before it files, not as the default.

**Why.** At-arrival filing is the only kind that prevents the notification. Polling is the only option without a server.

**How.** Change the time limits from hours to minutes, with a settings migration. Never move starred mail, threads the user replied to, people the user writes to, mail the phishing checks flag, or subjects that look like sign-in codes or password resets. When history returns 404 after a long gap, run the full resync path. Test before shipping whether `from:(brand.com)` in a Gmail filter matches subdomains, since the plan depends on it.

### Rank 6. "Filed today" record

**What.** A short list in Recent of what Cluster filed today, with counts per group and Undo.

**Why.** SaneBox's Digest and Superhuman's "Auto Archived" tag exist for one reason. Filed mail must stay findable, or users stop trusting the filing.

**How.** Write a row per move from the sweep, and per filter hit seen in the change feed.

### Rank 7. Mailto sent by Cluster

**What.** Send the mailto request with `users.messages.send`, using the address and subject from the header and an empty body. Ask once, then do it automatically.

**Why.** Apple Mail has done exactly this since 2016, with one confirm. Today Cluster leaves the user to press send, which many will not do.

**How.** The design note reports that `gmail.modify` covers `messages.send`. Check this on a live account before building. Sending mail on the user's behalf is an owner decision.

### Rank 8. Senders screen sorts, filters and company view

**What.** Use the filters and sorts from the companion note, and add "Last opened" from Proton's set. Show one quiet line per row, such as "Opens 4% · 12 a month · still sending." Add "Group by company" as a toggle that is off by default.

**Why.** Proton pairs unread count with 30-day volume on each row, and it is the only native client with a "Least read" sort. The evidence on domain merging says company grouping should be offered, not imposed.

**How.** All of it reads the profile. A company row expands to its addresses, and actions such as "Unsubscribe from all their lists" act per address.

### Rank 9. Template lines inside a sender

**What.** Inside a sender, show repeats as one line, such as "Your order has shipped ×46," with "Keep newest" and "Delete all."

**Why.** Template keying is the proven header-only method. Outlook Sweep's "keep the latest message" and Clean Email's Keep Newest show users want this.

**How.** Show a template only after 3 or more messages share it, the device-side version of Google's k-threshold. Move `keepNewest.ts` from per sender to per template.

### Rank 10. Local counters

**What.** Count unsubscribes by method, the ignored rate, filter hits, sweep moves, minutes from arrival to filing, undo rate per action, and suggestion accept and dismiss rates.

**Why.** No independent study gives success, misfiling or acceptance rates for any product. Cluster's thresholds can only be tuned on real mailboxes.

**How.** Store counts in `chrome.storage.local`, never message data. Promote shadow-mode changes only when the user's later actions agree with them.

## Conclusion

The field shows that unsubscribe, grouping and filing are not three features. They are one loop around one decision per sender. The user decides once. The provider's own filter carries it out at arrival. A watcher checks that it held and shows what it did. Gmail closed that loop for its own unsubscribes in 2025. Cluster can close it for every method, for Outlook, and for grouping as well as unsubscribing. It can also do so without the server that SaneBox and Clean Email depend on.

Cluster's real advantage is not speed. Filters will always beat a 5-minute sweep. The advantage is knowing who the user writes to, which no rival documents using. That should set the order of work. Protection from Sent comes first. Filters do the filing, and the sweep handles only what filters cannot express. Wider merges wait until the user asks for them. The biggest open risk is not technical. Nobody has published how often automatic filing hides mail people needed. So the "filed today" record and the undo rate are not polish. They are how Cluster will find out.
