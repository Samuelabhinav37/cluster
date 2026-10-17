# Cleanup suggestions and sender sort/filter in email products (state as of Oct 2026)

Scope: how mail providers and third-party cleanup tools produce cleanup or unsubscribe suggestions, which signals they use, how they sort and filter sender lists, how they word explanations, and any measured outcomes. Written to inform Cluster, a header-only, on-device MV3 extension for Gmail and Outlook.
Method note: about 35 searches and fetches. Vendor claims are marked [VENDOR]. Independent or third-party evidence is marked [INDEP]. Research is marked [RESEARCH]. Several products could not be verified (see Gaps).

## 1. What each product suggests, and how

### Takeaway
Native providers mostly offer a sender list sorted by volume (Gmail: most frequent, with a "past few weeks" count) plus a one-click unsubscribe that uses List-Unsubscribe headers. Inactivity nudges ("you haven't opened X in about a month") are the main proactive suggestion. Proton has the richest native sort set, including "Least read". Third-party tools add volume, size and age groupings, crowd-sourced "commonly cleaned" suggestions, and date-based bulk archive.

### Cited Findings
**Gmail**
- "Manage subscriptions" launched July 8, 2025 for web, Android and iOS. Active subscriptions are "sorted by the most frequent senders", each with the number of emails sent "in the past few weeks". The exact window is not stated. Clicking a sender opens all their mail. Unsubscribe is one click and Gmail sends the request for you [VENDOR] — [Google blog](https://blog.google/products/gmail/new-manage-subscriptions-unsubscribe/); [Workspace Updates](https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html)
- Inactivity unsubscribe nudge. Android Police spotted it in Dec 2017 as an "Inbox Tip" card in Inbox by Gmail. It covered promotional mail only and triggered "after 4 weeks of inactivity" [INDEP, secondary] — [Litmus](https://www.litmus.com/blog/unsubscribe-suggestions-what-it-means-for-email-marketers)
- Later Gmail nudge: a notice that you haven't opened the sender's mail in the last month, with "no thanks" and "unsubscribe" choices. Mailjet says it is based on how many emails users receive from a sender and how many they open, for promotional mail unopened for 30+ days [INDEP, ESP blog] — [Mailjet](https://www.mailjet.com/blog/news/understanding-gmail-unsubscribe/)
- A news fact-check says Gmail "automatically sends an unsubscribe notice for any mailing list you haven't opened in more than a month", and that the prompt is not aimed at any one sender [INDEP] — [KGTV 10News](https://www.10news.com/news/fact-or-fiction/fact-or-fiction-gmail-targeting-trumps-email-to-unsubscribe)
- Clicking the nudge uses the List-Unsubscribe header to send a one-click request [INDEP, ESP blog] — [Bird](https://bird.com/zh-sg/blog/gmail-smart-unsubscribe)
- Google One / Gmail storage cleanup ("Clean up space") suggests these buckets: emails with large attachments, spam, trash, large photos and videos, large Drive files and unsupported videos. One guide warns it can miss emails with smaller attachments [INDEP, how-to guides] — [iGeeksBlog](https://www.igeeksblog.com/google-storage-full-heres-how-i-freed-up-space/); [BGR](https://bgr.com/2184866/how-to-save-storage-in-gmail-google-drive/)

**Yahoo Mail**
- The 2019 app redesign added a Subscriptions view that lists the newsletters you are subscribed to, with one-tap unsubscribe [VENDOR] — [Yahoo press, Sep 23 2019](https://unified.www.yahooinc.com/press/yahoo-mail-reimagines-the-inbox-of-the-future); [Engadget](https://www.engadget.com/2019-09-23-yahoo-mail-app.html)
- A Yahoo test (pre-2019) used a pop-up that recommended lists to unsubscribe from. It was triggered by bulk-delete actions, not inactivity, and offered auto-archive as an alternative [INDEP] — [Litmus](https://www.litmus.com/blog/unsubscribe-suggestions-what-it-means-for-email-marketers)
- One competitor-authored guide says Yahoo's Subscriptions folder is unreliable: unsubscribing from the inbox doesn't always show up in its Unsubscribed tab [INDEP, competitor] — [Clean Email PT](https://clean.email/pt/how-to-unsubscribe-from-emails/unsubscribe-from-emails-on-yahoo)
- Yahoo Research WSDM 2018 tested a personalized unsubscribe-recommendation feature (see section 6) [RESEARCH] — [BGU CRIS](https://cris.bgu.ac.il/en/publications/unsubscription-a-simple-way-to-ease-overload-in-email/)

**Outlook.com**
- The path is Settings > Mail > Subscriptions, which shows "Your current subscriptions". Outlook filters out junk first, then looks for subscription identifiers in the header. Each row has Unsubscribe (with an OK confirmation) and a three-dot Block menu. Unsubscribe is unavailable when the mail went to junk, the sender is blocked, or the message isn't from the same sender. The page does not document a sort order [VENDOR] — [Microsoft Support](https://support.microsoft.com/en-gb/office/how-to-manage-email-subscriptions-in-outlook-com-26c8f447-2141-4bff-8781-80a4e6b7f0c8)
- Sweep is per-sender bulk delete or move, with options to keep only the latest message or delete older than N days. It runs now and can persist as a rule [INDEP] — [Mailbird](https://www.getmailbird.com/how-to-unsubscribe-from-emails-on-outlook/); [The Windows Club](https://www.thewindowsclub.com/unsubscribe-from-emails-in-outlook-app)
- Hotmail origin (2011–2012): one-click unsubscribe combined with Sweep to remove old newsletters from the sender and send future ones to junk. Senders with no unsubscribe option were blocked. Scheduled Cleanup deleted mail older than 3, 10, 30 or 60 days, or kept only the newest message from a sender [INDEP press] — [eWeek](https://www.eweek.com/security/microsoft-hotmail-tackles-unwanted-graymail/); [GeekWire 2011](https://www.geekwire.com/2011/beating-spam-hotmail-takes-rest-crap-inbox/)

**Apple Mail**
- Since iOS 10 (2016), a dismissible banner appears at the top of mail Apple classifies as a mailing list with a List-Unsubscribe header. Tapping it sends a mailto unsubscribe. I found no evidence of an engagement-based ("haven't opened") trigger [INDEP] — [Spam Resource 2023](https://www.spamresource.com/2023/02/faq-list-unsubscribe-on-apple-mail-on.html); [Campaign Monitor 2016](https://www.campaignmonitor.com/blog/email-marketing/2016/09/how-ios-10-may-impact-email-marketers/)

**Proton Mail**
- The Newsletters view is under Views > Newsletters, with Active and Unsubscribed tabs. Each Active row shows sender name and address, unread count, and emails received in the past 30 days. Sorts are: Least read, Most read, Most frequent, A to Z, Recently read, Recently received. Detection uses "multiple signals — like email headers", and Proton warns that regular mail can be misclassified. When you unsubscribe you can trash or archive existing mail, or mark it all read. "Apply to future messages" routes a sender to a folder (to trash on the Unsubscribed tab) [VENDOR] — [Proton Support](https://proton.me/support/mail-newsletters-view)

**Clean Email**
- Cleaning Suggestions sit at the top of applicable Smart Folders, Inbox included, with a count. They are built from messages "frequently deleted or archived", based either on your own past cleaning or on what many other users clean (anonymous sender and subject statistics). Listed signals are sender, subject, number of attachments, attachment size and message age. The preview pane says which basis applies ("your cleaning" or "all users"). Each suggestion has a primary action button (such as Trash), a dropdown of other actions, and "Create Rule" to auto-clean in future [VENDOR] — [Clean Email help](https://clean.email/help/tools/cleaning-suggestions)
- Smart Folders are pre-built categories (social, travel, finance, shopping and more). Users can't create custom Smart Folders [VENDOR + INDEP review] — [Clean Email help](https://clean.email/help/basics/quick-clean); [thebusinessdive](https://thebusinessdive.com/?p=18235)

**Mailstrom**
- Groups mail by sender, subject, date range, size, mailing list and social. Grouping is dynamic, not label-based [VENDOR] — [Mailstrom vs Clean Email](https://mailstrom.co/articles/mailstrom-vs-clean-email/)
- "Chill" is a snooze, not a suggestion: it removes a group and returns it on a chosen date, stored in [Mailstrom]/Chilled/YYYY-MM-DD. Subscribers only. Unsubscribe in the Mailing Lists tab sends an email request, or falls back to opening the web page [VENDOR] — [Mailstrom FAQ](https://mailstrom.co/faq)
- Bulk unsubscribe after sorting by volume [VENDOR] — [Mailstrom](https://mailstrom.co/articles/effortlessly-unsubscribe-from-emails-in-bulk-with-mailstrom/)

**Trimbox**
- Senders are listed "most recent" first by default and can be re-sorted by message count. Keep/unsubscribe decision per row, plus bulk delete of a sender's old mail [INDEP review, via search snippet] — [Trimbox blog](https://www.trimbox.io/blog/choose-the-emails-you-want-to-unsubscribe-from)

**Leave Me Alone**
- Subscriber/Subscription Score grades lists A–F on frequency, unsubscribe rates and spam reports. It runs on anonymous crowd data, with an opt-out [VENDOR] — [LMA v2.0](https://leavemealone.com/blog/announcing-v2-0/); [Subscription Score](https://leavemealone.com/blog/introducing-subscription-score/)
- "Sort by read rate" to find mail you rarely open. An "unread" tag marks senders you haven't opened in over 6 months, and a "tracker" tag marks lists that track opens. These first shipped for IMAP [VENDOR] — [LMA new tags](https://leavemealone.com/blog/new-tags/)

**SaneBox Deep Clean**
- You pick a cutoff date and only older mail is scanned. Senders are listed by quantity and storage, sortable by size, date or sender type. Deleting goes to Trash. Limited to one scan per hour [VENDOR] — [SaneBox help 419](https://www.sanebox.com/help/419-email-deep-clean-sanebox-can-help-clear-out-old-unnecessary-emails)

**Unroll.me**
- Rollup puts chosen subscriptions into one daily digest at a time you pick. It required full mailbox access [INDEP] — [Gizmodo](https://gizmodo.com/unroll-me-settles-with-ftc-for-rifling-through-its-user-1840496042)

**Superhuman**
- "Get Me To Zero" moves inbox mail older than a cutoff to Done. "Most people move emails older than one week", with options from 1 day to 1 month. Unread or Starred mail can be excluded, and it can be undone for 7 days via Cmd+K > Bulk Actions. Help suggests running it again for unread mail older than a month [VENDOR] — [Superhuman help: Achieve Inbox Zero](https://help.superhuman.com/hc/en-us/articles/45295217605523-Achieve-Inbox-Zero); [Mass Archive](https://help.superhuman.com/article/456-mass-archive)

### Inferences
- Every native provider gates candidates on List-Unsubscribe or other header detection. Cluster's header-only model matches the industry baseline.
- Proactive suggestions in native clients key on inactivity (about 30 days unopened) plus promotional or bulk classification. They do not use complex scores.

### Gaps
- Shortwave, Spark and Fastmail cleanup or unsubscribe features: no usable sources found in this pass.
- Yahoo's current Subscriptions sort options (frequency or least opened) are unverified. No source confirmed them.
- Outlook Subscriptions page sort order is not documented. I found no evidence of Outlook "Sweep suggestions".
- Clean Email "Quick Clean" specifics beyond Cleaning Suggestions were not separately verified.

## 2. Signals, protecting important senders, and dismissal

### Takeaway
The signals in use are open or read rate and time since last open (Gmail, LMA, Proton), frequency or volume (Gmail, Proton, SaneBox, Trimbox), size and age (SaneBox, Clean Email, Google One), and crowd "commonly cleaned" data (Clean Email, LMA score). Protection comes mainly from scoping to bulk or list mail. Superhuman also has explicit unread or starred exclusion. Dismissal is permanent per suggestion in Clean Email, and Gmail offers "no thanks".

### Cited Findings
- Gmail nudge signals: receive count versus open count per sender, promotional mail, 30 days or more unopened — [Mailjet](https://www.mailjet.com/blog/news/understanding-gmail-unsubscribe/); [Litmus](https://www.litmus.com/blog/unsubscribe-suggestions-what-it-means-for-email-marketers)
- Clean Email signals: sender, subject, attachment count and size, age, and your own or others' delete/archive behavior. Dismissing one suggestion means "Clean Email will not suggest the action again". Dismissing all in a folder needs a confirmation and suppresses those suggestions app-wide without touching messages. A suggestion may come back if you later clean similar mail — [Clean Email help](https://clean.email/help/tools/cleaning-suggestions)
- Superhuman: Unread and Starred can be ignored by checkbox, and a 7-day undo applies — [Superhuman help](https://help.superhuman.com/hc/en-us/articles/45295217605523-Achieve-Inbox-Zero)
- Hotmail's 2012 newsletter model used three features: presence of List-Unsubscribe, the sending address, and display characteristics. It learned from user mark and unmark corrections — [Microsoft Learn archive (T. Zink, 2012)](https://learn.microsoft.com/archive/blogs/tzink/hotmail-rolls-out-features-to-help-deal-with-gray-mail)
- SaneBox Deep Clean only scans mail older than a user-chosen date. It also notes it won't delete your contacts — [SaneBox help](https://www.sanebox.com/help/419-email-deep-clean-sanebox-can-help-clear-out-old-unnecessary-emails)
- Outlook: excludes junk and blocked senders from Subscriptions — [Microsoft Support](https://support.microsoft.com/en-gb/office/how-to-manage-email-subscriptions-in-outlook-com-26c8f447-2141-4bff-8781-80a4e6b7f0c8)
- A graymail patent notes graymail usefulness "normally expires or declines after a period of time", which supports age as a signal — [USPTO 11528242](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11528242)

### Inferences
- Replies to a sender and sent-mail history are not documented as signals by any of these products. Cluster's access to the user's sent mail is a differentiator for "never suggest people you correspond with".
- A safe pattern is to exclude starred, unread-recent and replied-to senders. Superhuman's checkbox approach and Clean Email's permanent dismiss are both precedents.

### Gaps
- No source documents how Gmail handles repeat "no thanks" dismissals (cooldown length) or whether starring suppresses nudges.

## 3. Sort and filter options; default orders

### Takeaway
"Most frequent / most emails" is the dominant default (Gmail, Mailstrom volume, SaneBox quantity). Trimbox defaults to most recent. Proton is the only native client with a "Least read" sort. Size sorts are common in storage-oriented tools.

### Cited Findings
- Gmail: most frequent first, with a recent-weeks count — [Google blog](https://blog.google/products/gmail/new-manage-subscriptions-unsubscribe/)
- Proton: Least read, Most read, Most frequent, A to Z, Recently read, Recently received. Rows show unread count and 30-day volume — [Proton Support](https://proton.me/support/mail-newsletters-view)
- Leave Me Alone: sort by read rate — [LMA](https://leavemealone.com/blog/new-tags/)
- SaneBox: list by sender, quantity and storage. Sort by size, date or sender type — [SaneBox help](https://www.sanebox.com/help/419-email-deep-clean-sanebox-can-help-clear-out-old-unnecessary-emails)
- Trimbox: most recent by default, re-sortable by count — [Trimbox blog](https://www.trimbox.io/blog/choose-the-emails-you-want-to-unsubscribe-from)
- Mailstrom: grouping tabs by sender, subject, time, size, list and social — [Mailstrom](https://mailstrom.co/articles/mailstrom-vs-clean-email/)

### Inferences
- A volume default puts the biggest wins at the top. A least-read sort finds the safest unsubscribes. Proton's pairing of unread count with 30-day volume on each row gives the user both at once.

### Gaps
- No vendor explains why it chose its default order. No A/B data was found on sort defaults.

## 4. Explanation copy, and whether numbers help

### Takeaway
Copy is short and numeric or time-based: "haven't opened in the last month", per-sender counts "in the past few weeks", "emails in past 30 days". I found no published evidence that showing numbers increases action.

### Cited Findings
- Gmail nudge: haven't opened anything from the sender in about a month, with "no thanks" and "unsubscribe" choices — [Mailjet](https://www.mailjet.com/blog/news/understanding-gmail-unsubscribe/); [KGTV](https://www.10news.com/news/fact-or-fiction/fact-or-fiction-gmail-targeting-trumps-email-to-unsubscribe)
- Gmail list rows show the number of emails sent in recent weeks — [Google blog](https://blog.google/products/gmail/new-manage-subscriptions-unsubscribe/)
- Clean Email shows criteria text and the suggested action, and says whether the basis is your behavior or other users' — [Clean Email help](https://clean.email/help/tools/cleaning-suggestions)
- LMA uses letter grades (A–F) as a compact explanation — [LMA](https://leavemealone.com/blog/announcing-v2-0/)

### Gaps
- No exact verbatim Gmail nudge string from a primary Google source. No experiment on numeric versus non-numeric copy.

## 5. Measured outcomes and notable failures

### Takeaway
Hard outcome data is scarce and mostly vendor-reported. The strongest independent number is Yahoo's: unsubscribing barely happens without a tool (under 2% of lists, about 3% of users). The best-known failure is privacy (Unroll.me), not over-deletion.

### Cited Findings
- Yahoo, WSDM 2018: about 85% of traffic is unsubscribable and over 90% of it goes unread. Yet unsubscribe is triggered for under 2% of lists, and only about 3% of users unsubscribe [RESEARCH] — [WSDM paper via search snippet](https://labs.yahoo.com/mobstor/publication_attachments/WSDM_18_paper_357_revised.pdf); [DOI](https://doi.org/10.1145/3159652.3159698)
- Hotmail: 75% of mail users reported as spam was actually newsletters or notifications. Person-to-person mail was about 14% of the inbox. SmartScreen identified more than 1 billion newsletters a day, with about 95% newsletter-detection accuracy claimed. More than 100M automated graymail actions are reported [VENDOR via press] — [eWeek](https://www.eweek.com/security/microsoft-hotmail-tackles-unwanted-graymail/); [ITPro Today](https://itprotoday.com/microsoft-365/hotmail-declares-war-on-graymail); [Infopackets](https://infopackets.com/node/7295)
- Clean Email: 1.5M users and 4.5B emails cleaned (about page). Elsewhere it claims more than 5B a year, and the App Store says "hundreds of billions". These figures are inconsistent [VENDOR] — [Clean Email about](https://clean.email/about); [llm-info](https://clean.email/llm-info); [App Store](https://apps.apple.com/us/app/clean-email-inbox-cleanup/id1441250616)
- Unroll.me failure: the 2017 revelation was that it sold e-receipt data via its parent Slice (for example to Uber). The 2019 FTC consent order required notice and deletion, with no fine. Sources disagree on the date: June 21 versus August 2019 [INDEP] — [Gizmodo](https://gizmodo.com/unroll-me-settles-with-ftc-for-rifling-through-its-user-1840496042); [Willkie](https://complianceconcourse.willkie.com/?p=775)
- Unsubscribe is a request, not a guarantee. Senders may continue, or start again months later [VENDOR listing] — [Workspace Marketplace](https://workspace.google.com/marketplace/app/unsubscribe_afmeld_nyhedsbrev_i_bulk/1094604469280)
- Proton warns that regular mail can be misclassified as newsletters [VENDOR] — [Proton Support](https://proton.me/support/mail-newsletters-view)

### Gaps
- No public data on suggestion acceptance rate, unsubscribes per session, or retention for any product. No documented cases of users losing important mail through cleanup suggestions were found in this pass.

## 6. Research basis

### Takeaway
Microsoft Research defined and modeled "gray mail" in 2007–2009, using per-user engagement to predict read or reply actions. Yahoo (WSDM 2018) showed that the unsubscribe gap is mostly about access, and that personalized recommendations meet a real need.

### Cited Findings
- "Improve Spam Filtering by Detecting Gray Mail" (Microsoft Research, CEAS-era). It compares four detection methods, groups bulk mail into campaign clusters, and finds campaign features that predict category. It reports predicting read or reply at precision up to 40% at 90% recall for active users, and AUC gains of nearly 50% for less active users through regularization (summary from search snippet; full text not fetched) — [ResearchGate](https://www.researchgate.net/publication/221650806_Improve_Spam_Filtering_by_Detecting_Gray_Mail); [Wikipedia: Graymail](https://en.wikipedia.org/wiki/Graymail_(email))
- Gamzu, Lewin-Eytan and Silberstein, "Unsubscription: A Simple Way to Ease Overload in Email", WSDM 2018, pp. 189–197. Machine-generated mail is over 90% of non-spam traffic, and about 95% of it comes from user-created subscriptions. Users show little interest in it yet do little to reduce it. An online experiment with personalized recommendations showed "a strong need" — [BGU CRIS](https://cris.bgu.ac.il/en/publications/unsubscription-a-simple-way-to-ease-overload-in-email/)
- Hotmail 2012: graymail is the main remaining inbox problem once spam fell below 3%. "There is no general agreement" on how to handle it, so handling is personalized — [Microsoft Learn archive](https://learn.microsoft.com/archive/blogs/tzink/hotmail-rolls-out-features-to-help-deal-with-gray-mail)

### Inferences
- The research supports per-user engagement (reads and replies) over global sender scores for unsubscribe suggestions. Cluster's on-device per-sender read rate plus sent-mail data is well aligned.

### Gaps
- Full WSDM 2018 experiment metrics (acceptance or CTR) were not retrieved because the PDF link redirects. Google research on graymail or unsubscribe was not found. Email-overload HCI studies (for example Whittaker and Sidner) were not covered in this pass.
