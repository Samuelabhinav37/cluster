# How email products group and combine similar mail (company, sender, template, bundles, duplicates)

Scope note: the current state is as of 2026-10-16. Older facts carry dates. "Vendor claim" marks numbers that come from the company itself with no independent check.

## 1. Google Inbox bundles (2014-2019) and Gmail tabs/categories

### Takeaway
Inbox bundles were fixed categories (Travel, Purchases, Finance, Social, Updates, Forums, Promos) plus user-defined ones. Each bundle collapsed to one row, had a per-bundle delivery schedule, and could be swept as a unit. Google retired Inbox in 2019 and said it was "folding ideas into Gmail". General bundling never fully arrived in Gmail. Gmail tabs (2013) remain the surviving form: five ML categories whose strongest signal is user correction at the sender level. Google has published no engagement numbers for bundles. The only public tab numbers come from marketers.

### Cited Findings
- Inbox was announced invite-only on 2014-10-22 and opened publicly on 2015-05-28. Shutdown was announced 2018-09-12 and took effect around 2019-04-02. Wikipedia's own dates are inconsistent (March vs April 2019) — [Wikipedia](https://en.wikipedia.org/wiki/Inbox_by_Gmail)
- Preset bundles: Travel, Purchases, Finance, Social, Updates, Forums, Promos. Users could add custom bundles and define what fills them — [Tom's Guide](https://www.tomsguide.com/uk/us/google-inbox-faq,news-19822.html); [Official Gmail Blog, "A bit about Bundles in Inbox", 2014-11-19](https://gmail.googleblog.com/2014/11/a-bit-about-bundles-in-inbox.html) (the post body did not render when fetched, so only its existence and date are confirmed)
- Each bundle could be delivered "as they arrive, once a day, once a week" or skip the inbox. Bundled mail did not send phone notifications by default — [Tom's Guide](https://www.tomsguide.com/uk/us/google-inbox-faq,news-19822.html)
- Google's stated reason for shutdown: Inbox had been "a great place to experiment," and it wanted to focus on one email product — [VentureBeat](https://venturebeat.com/business/google-will-kill-inbox-by-gmail-in-march-2019); [Wikipedia](https://en.wikipedia.org/wiki/Inbox_by_Gmail)
- At shutdown, coverage noted that general bundling and the ability to archive a whole bundle or a day's group in one action were missing from Gmail. Trips was named as the last unported bundle. Gmail tabs were called "not a proper replacement… quite limited" — [PhoneArena](https://www.phonearena.com/news/Inbox-gets-its-official-shutdown-date-and-Google-lies-to-users-about-Gmail_id114644); [9to5Google 2019-04-01](https://9to5google.com/2019/04/01/inbox-gmail-features-havent-arrived/); [Android Authority](https://www.androidauthority.com/google-inbox-shutting-down-904074/)
- A 2020 Gmail APK teardown found strings for Inbox-style Purchases/Travel auto-bundles. These were speculative and not confirmed as shipped — [9to5Google 2020-02-13](https://9to5google.com/2020/02/13/gmail-2020-02-02-apk-insight-teardown/)
- Gmail "Promotions bundles" (2018-19) are a different feature. ML picks deals into labeled clusters such as "Top Deals" and "Expiring Soon," and they are not grouped by sender — [MediaPost](https://www.mediapost.com/publications/article/330342/new-year-new-gmail-promotions-tab.html); [Zettasphere](https://www.zettasphere.com/gmail-promotions-tab-bundles-guide/)
- The only Inbox engagement numbers Google published were about Smart Reply, not bundles: 10% of mobile replies (Mar 2016) and about 12% (May 2017) — [Wikipedia](https://en.wikipedia.org/wiki/Inbox_by_Gmail)
- Gmail tabs launched May 2013 with Primary, Social, Promotions, Updates and Forums, built on labels. Dragging a message to another tab offers to apply the move to future mail from that sender — [Scientific American 2013](https://www.scientificamerican.com/article/new-gmail-look-blings-up-your-inbox-2013-05/); [CNN 2013-05-29](https://edition.cnn.com/2013/05/29/tech/web/gmail-inbox-update)
- Google (2020-01-16): tab signals are "who the email comes from," content type, and how other users interacted with similar content. Direct user input (moves, filters, contacts, replies) is described as the most important signal — [Google Workspace blog](https://workspace.google.com/blog/productivity-collaboration/how-gmail-sorts-your-email-based-on-your-preferences)
- Return Path (Dec 2013, a panel of about 3M users, marketer data): 90% of commercial mail lands in Promotions, and "move to Primary" campaigns made little difference. Another Return Path figure says 19.9% of users never open the Promotions tab. Reports of the early open-rate drop conflict, from "up to 18%" to "practically the same rate" — [Smart Insights](https://www.smartinsights.com/email-marketing/email-deliverability/new-gmail-tabs/); [SendPulse](https://sendpulse.com/blog/gmail-promotions-tab); [Econsultancy](https://econsultancy.com/the-effect-of-gmail-tabs-on-email-marketing/)
- Gmail "Manage subscriptions" (July 2025) is a per-sender list sorted by the most frequent senders, showing the number of emails each sent "in the past few weeks." Clicking a sender shows all their mail. One click sends the unsubscribe request on the user's behalf — [Google Workspace Updates 2025-07](https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html); [Google blog](https://blog.google/products/gmail/new-manage-subscriptions-unsubscribe/)

### Inferences
- The parts of Inbox people missed were collapse-to-one-row, archive-the-whole-group and scheduled delivery. These UI affordances are reproducible client-side. The categorisation itself is not what users missed.
- Every surviving Google surface keys user corrections by sender, which supports a sender-level override table as Cluster's base layer.

### Gaps
- No Google-published figures for bundle engagement, time saved, or bundle classification accuracy were found.
- No adoption numbers for Inbox were found. A "99% of complaints were missing features" claim had no source and is excluded.

## 2. Grouping key in each current product

### Takeaway
Nearly every shipping product groups by **sender address** and lets the user widen or override it. Only Spark exposes **domain** grouping, and it is paid. Shortwave adds **mailing list (List-Id)** and **label** bundles. Apple, Proton, Superhuman and Outlook classify into categories first and then group or override per sender. HEY skips ML and asks the user to decide each new sender once. Shortwave turned automatic bundling of automated senders off by default in Nov 2023, which suggests aggressive auto-bundling annoyed users.

### Cited Findings
**Shortwave**
- Bundle types are built-in label bundles (Newsletters, Promotions, Travel, and so on), custom label bundles, and "contact" bundles that group "all messages from specific senders, mailing lists, and channels." Each Split can auto-bundle by sender or turn bundling off. A bundle is one inbox row that can be snoozed, deleted or marked done in one action — [Shortwave docs: Bundles](https://www.shortwave.com/docs/guides/bundles/)
- Delivery schedules can be set per label or contact, for example Saturday 8am — [Shortwave docs](https://www.shortwave.com/docs/guides/bundles/)
- Changelog: 2022-12-15 label bundles and delivery schedules. 2023-03-28 schedules per address, mailing list and channel, plus an "Unbundle" action. **2023-11-16 "Automated senders, channels, and mailing lists no longer bundle by default"**, with a new "Bundle threads like this" action that creates sender, channel or list bundles. 2025-06-03 delivery schedules split from bundles — [Shortwave changelog](https://www.shortwave.com/changelog/)
- Magic Labels (Sept 2022) remember how a user labeled a sender and apply that label to future mail from them — [Shortwave blog](https://www.shortwave.com/blog/magic-labels-custom-bundles/)
- Conflict: the docs page still says automated senders are auto-bundled ([docs](https://www.shortwave.com/docs/guides/bundles/), per search snippet), while the 2023 changelog says they no longer are by default ([changelog](https://www.shortwave.com/changelog/))

**Spark (Readdle)**
- Smart Inbox splits into Personal/People, Notifications and Newsletters. Read mail moves to "Seen" — [Spark Smart Inbox](https://sparkmailapp.com/features/smart_inbox)
- Newsletters and Notifications senders are grouped by default into one collapsed line per sender. Any sender can be grouped by **Sender** or by **Domain** (domain requires a paid plan). There is a "Show in Primary List" toggle per sender — [Spark help: Group emails by sender](https://sparkmailapp.com/help/manage-your-inbox/group-emails-by-sender)
- Spark Classic Smart Inbox display modes are Unified, Grouped (one line per address with an unread count) and Per Account — [Readdle help](https://readdle.helpjuice.com/personalization/customize-your-smart-inbox)

**HEY**
- New senders wait in The Screener for Yes or No. Each approved sender is routed to Imbox, The Feed (newsletters and promos as a browsable feed) or Paper Trail (receipts). Changing a sender's destination moves all their existing mail too — [HEY how it works](https://www.hey.com/how-it-works/); [HEY Paper Trail help](https://help.hey.com/article/787-paper-trail); [HEY Feed/Imbox](https://hey.com/features/the-imbox/)
- Reviews are mixed. Fast Company called it visionary but "missing the basics" — [Fast Company](https://www.fastcompany.com/90522517/hey-is-a-visionary-alternative-to-gmail-but-its-missing-the-basics)

**Superhuman**
- Built-in AI Auto Labels are Marketing, Pitch, Social and News. Custom prompt labels are for Business/Enterprise. Split Inbox sections are built from search criteria or Auto Labels, with a suggested maximum of 7 splits. Auto Archive can remove labeled mail from the inbox — [Superhuman blog](https://blog.superhuman.com/superhuman-ai-feature-showcase/); [TechCrunch 2025-02-19](https://techcrunch.com/2025/02/19/superhuman-introduces-ai-powered-categorization-to-reduce-spammy-emails-in-your-inbox)
- At launch (Feb 2025), prompts for existing labels could not be edited — [TechCrunch](https://techcrunch.com/2025/02/19/superhuman-introduces-ai-powered-categorization-to-reduce-spammy-emails-in-your-inbox)

**Apple Mail (iOS 18.2+)**
- Categories are Primary, Transactions, Updates and Promotions. Tapping a message in the three non-Primary categories opens a list of all that sender's messages in that category (the digest). Primary is never grouped. "Group by Sender" can be turned off. Re-categorizing a sender applies to existing and future mail. iOS 18.2+ is required and the feature is not available in all regions — [Apple Support](https://support.apple.com/guide/iphone/use-categories-iphfe4a36baf/ios) (via search snippet; the page body did not render on fetch); [9to5Mac](https://9to5mac.com/2024/08/18/apple-mail-app-ios-18/)
- Some mailing lists need each sender moved individually, so the re-categorisation key is the sender address, not the list — [sealsystems](https://sealsystems.net/go/organize-your-mail-with-categories-on-the-iphone/)

**Outlook**
- Focused/Other learns from moves. Per-sender overrides are "Always move to Focused/Other." The algorithm is the same one that powered Clutter — [Microsoft Support](https://support.microsoft.com/en-us/outlook/mail/focused-inbox-for-outlook); [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/4745265/focused-inbox-vs-other-inbox)
- Overrides are keyed by sender, not recipient (2018 answer). Focused Inbox does not work on shared mailboxes — [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/4525301/focused-other-inbox-always-move-to-other-based-on)
- Clutter (2015) vendor claims: average users saved 82 min/month and the top ~10% saved 168 min/month, with over 1M messages moved per day and a target of at least 85% accuracy — [TechRadar](https://www.techradar.com/news/software/business-software/microsoft-turns-on-clutter-to-keep-your-inbox-clean-1294218); [gHacks](https://www.ghacks.net/?p=113370)
- Conversation grouping uses subject and thread relationship. Classic Outlook's "group by From" column breaks when subjects change or threads have several participants (2012) — [TechRepublic](https://www.techrepublic.com/de/article/outlooks-conversation-settings-lead-to-a-more-efficient-inbox/)

**Yahoo Mail**
- The 2022 redesign (2022-10-03) has views for Deals, Travel, Attachments, Receipts, Packages and Subscriptions (one-tap unsubscribe), plus a free-trial tracker and a Grocery view — [Yahoo press](https://www.yahooinc.com/press/yahoo-mail-makes-saving-time-and-money-easier-than-ever-with-new-commerce-features); [Verizon release PDF](https://espanol.verizon.com/about/sites/default/files/Release-form-%20Yahoo-Mail-9-23.pdf)

**Proton / Fastmail**
- Proton Newsletters view (mid-2025) has active and unsubscribed tabs, shows how often each sender emails, and allows bulk cleanup per sender — [AlternativeTo 2025-06](https://alternativeto.net/news/2025/6/proton-mail-introduces-newsletters-view-for-managing-subscriptions-and-inbox-clutter/)
- Proton Categories (Aug 2026): Primary, Social, Promotions, Newsletters, Transactions and Updates. It is described as **metadata-based, without reading message contents**, is on by default for new users, and learns from moves — [AlternativeTo 2026-08](https://alternativeto.net/news/2026/8/proton-mail-launches-categories-to-organize-inbox-emails-automatically/); [Thurrott](https://thurrott.com/cloud/340610/proton-mail)

### Inferences
- Proton's metadata-only Categories (2026) is the closest commercial analogue to Cluster's header-only constraint. Its exact feature set is not public.
- The consensus UI is: category, then one collapsed row per sender with a count, then an expand-to-digest view with bulk actions. The override applies to past and future mail (Apple, HEY).
- Shortwave's 2023 reversal and Spark's opt-in domain grouping both point the same way. Default grouping should be by exact sender, with wider merges (domain or brand) offered rather than imposed.

### Gaps
- No Spark, HEY, Apple or Proton classification accuracy or engagement numbers were found.
- Yahoo's current (2026) views and any per-sender cascade could not be confirmed. No source described Yahoo sender-cascade rules.
- No Fastmail grouping feature was found in searches.
- Whether new Outlook currently offers "group by sender" in the list could not be confirmed.

## 3. Template grouping research (Yahoo Research, Google)

### Takeaway
Header-only template keying is a published and validated approach. Ailon et al. (Yahoo, WSDM 2013) defined a template as **hash(sender address + canonicalized subject, with variable parts replaced by wildcards)**. Google (VLDB 2019) cites this as "shown to be a good way to compute a template key." Google's production systems (Juicer/Crusher) instead use body structure (MinHash over HTML XPaths) with a k-anonymity threshold on recipients. Yahoo's per-sender categorizer reached about 90% precision and recall, and the categories it found covered 70% of traffic.

### Cited Findings
- Ailon, Karnin, Liberty, Maarek, "Threading machine generated email," WSDM 2013 (DOI 10.1145/2433396.2433447). The method groups mail into templates, builds a causal graph of templates, and learns causal relations. On 12.5M Yahoo inboxes it identified over 70% of causal threads (recall) at 90% precision. Search precision was about 80% at 90% recall. Machine mail is over 60% of traffic — [Unpaywall/ACM](https://unpaywall.org/10.1145%2F2433396.2433447)
- Whittaker, Edmonds, Tata, Wendt, Najork, "Online template induction for machine-generated emails," PVLDB 12(11) 2019, describing Ailon's key: "most instantiations of a single template are delivered from the same email address… with subject lines that can be represented by fixed terms and wildcards (e.g., 'Your order of wildcard has shipped!'). A hash of the sender and a canonicalized subject expression has been shown to be a good way to compute a template key" — [VLDB PDF](https://www.vldb.org/pvldb/vol12/p1235-whittaker.pdf)
- Same paper: 90% of email traffic is machine-generated B2C mail from "a few million templates." Sender volume is highly skewed. Juicer's offline weekly MapReduce used a 0.5% sample of 90 days of Gmail. Crusher (online) found 1.5M more templates per week and saved 58% CPU — [VLDB PDF](https://www.vldb.org/pvldb/vol12/p1235-whittaker.pdf)
- Juicer/Crusher fingerprint: three MinHash values over the set of HTML XPaths (tags and indices only, no content). A template is formed only if the cluster reaches at least k unique recipients (k-anonymity). The template ID is used for spam/phishing detection, causal threading and search ranking — [VLDB PDF](https://www.vldb.org/pvldb/vol12/p1235-whittaker.pdf); [Sheng et al., CIDR 2020](https://www.vldb.org/cidrdb/papers/2020/p31-sheng-cidr20.pdf)
- Juicer (KDD 2018) serves over 1B Gmail users daily, and engineers cannot view any single email — [Google Research](https://research.google/pubs/anatomy-of-a-privacy-safe-large-scale-information-extraction-system-over-email/)
- In Juicer, a template's vertical label is a majority vote of per-email classifiers across the cluster. Extraction runs only for whitelisted high-quality templates — [CIDR 2020](https://www.vldb.org/cidrdb/papers/2020/p31-sheng-cidr20.pdf)
- Wendt et al. (Bendersky in the Google listing), "Hierarchical Label Propagation and Discovery for Machine Generated Email," WSDM 2016 pp. 317-326. Labels propagate over a template graph and then to emails, reaching over 91% precision and 93% recall while increasing label coverage by over 11%. A survey says these labels surface in Gmail as "Smart Labels" — [Google Research](https://research.google/pubs/hierarchical-label-propagation-and-discovery-for-machine-generated-email/); [WSDM anthology](https://ir.webis.de/anthology/2016.wsdm_conference-2016.35/); [Searching Personal Collections survey](https://arxiv.org/pdf/2412.12330)
- Grbovic, Halawi, Karnin, Maarek, "How Many Folders Do You Really Need?" CIKM 2014 (Yahoo), based on 500B+ messages over six months:
  - 70% of users never create a folder, and only 10% are "active classifiers."
  - LDA on folder names produced 6 latent categories (human, plus career, shopping, travel, financial and social) covering about 70% of traffic and search queries.
  - Precision and recall were close to 90%. Prior work (Koren et al.) reached only 80% at 72% coverage.
  - All of this is from [arXiv 1606.09296](https://arxiv.org/pdf/1606.09296)
- Same paper, design: two stages. First, an offline per-sender table lookup. Second, more expensive per-message classification only when sender confidence is low. A folder-voting heuristic labeled senders cheaply and covered 32% of traffic — [arXiv 1606.09296](https://arxiv.org/pdf/1606.09296)
- Same paper, header and sender features:
  - Address parts: subdomain and "subname" (billing, noreply).
  - Subject length and body URL counts.
  - "Burst" features (over 100 msgs/hour is present for more than half of machine senders and few humans).
  - 34.56% of machine senders have an average subject length over 30 characters, against 5.88% of humans.
  - [arXiv 1606.09296](https://arxiv.org/pdf/1606.09296)
- Same paper, aggregation sizes: 1.4T messages, 2.6B raw senders, 339M filtered senders, 75.8M domains — [arXiv 1606.09296](https://arxiv.org/pdf/1606.09296)

### Inferences
- Cluster can compute an Ailon-style template key on-device: from address + subject with numbers, dates, order IDs, names and prices replaced by wildcards. This is the literature-backed header-only fingerprint. Google's body-structure MinHash is unavailable to Cluster.
- Grbovic's two-stage design (cheap sender table, then per-message fallback when unsure) maps cleanly to sender → (sender, subject-template) refinement.
- Juicer's k-anonymity threshold is a server concept. On-device, the analogue is a minimum count of messages per template before showing it as a group.

### Gaps
- The full Ailon paper text (subject canonicalization rules, template-level precision) was not accessible. Only the abstract and the VLDB paraphrase were.
- No precision figure for template keying alone (as opposed to threading) was found.
- No Yahoo "Juicer" exists in the record found. Juicer is Google's. The Yahoo template work is Ailon et al. and Grbovic et al.

## 4. Company grouping (merging addresses/subdomains of one brand)

### Takeaway
Merging addresses to the domain level loses information. Yahoo's research shows that one company's domain mixes career, shopping, travel, financial and human mail, and that ESP domains send for many brands. The domain level suffers "the most loss." Free-mail domains carry machine mail, and corporate domains carry personal mail. BIMI ties a logo to the From organizational domain only under DMARC enforcement. It is a reasonable brand anchor where present, but coverage and subdomain inheritance vary.

### Cited Findings
- Grbovic et al. Table 3 shows "generalization loss in domain-level categorization":
  - vailresorts.com sends store@ (shopping), booking@ (travel) and payroll@ (financial).
  - careers@vailresorts.com is sent via asmnet.com, an ESP/agency domain that also sends payroll.services@ for other firms.
  - target.com mixes orders@, target.jobs@, payroll@ and name.lastname@ (human).
  - The authors write "Domain-level aggregation… suffers the most loss; in particular the multiple businesses loss is quite common there."
  - [arXiv 1606.09296](https://arxiv.org/pdf/1606.09296)
- Same paper: companies "typically use different addresses for each type" of business, so sender-level multiple-business loss is low. The main sender-level error is a "machine-human mix" (recruiters or brokers sending both automated and personal mail) — [arXiv 1606.09296](https://arxiv.org/pdf/1606.09296)
- Same paper: "SMTP domain information is not sufficient." Machine mail comes from gmail.com, hotmail.com and yahoo.com, while amazon.com and ibm.com carry employee personal mail. Machine-sender heuristics: mailer-daemon/no-reply local parts and "unsubscribe" in headers — [arXiv 1606.09296](https://arxiv.org/pdf/1606.09296)
- Spark offers "Group by Domain" as an explicit, paid, per-sender user choice — [Spark help](https://sparkmailapp.com/help/manage-your-inbox/group-emails-by-sender)
- BIMI: a default record at the organizational domain is inherited by subdomains, with subdomain overrides allowed. DMARC enforcement is required on the org domain and on sending subdomains. Selectors (BIMI-Selector header) allow several logos per domain, with uneven receiver support — [BIMI Group FAQ](https://bimigroup.org/faqs/)
- Vendor reports conflict on deep-subdomain inheritance. VMC coverage requires listing subdomains in the SAN — [Suped](https://www.suped.com/learn/bimi/will-bimi-work-on-multiple-levels-of-subdomains)
- An extra ESP DKIM signature that does not align with the From domain is said to be ignored by the BIMI lookup (vendor reasoning). Many ESP newsletters reportedly have DMARC only on the delegated subdomain (anecdotal) — [Suped](https://www.suped.com/knowledge/email-deliverability/technical/will-bimi-work-on-multiple-levels-of-subdomains); [GitHub mail-bimi issue](https://github.com/marcbradshaw/mail-bimi/issues/7)

### Inferences
- For Cluster, a safe brand key is the registrable domain (Public Suffix List eTLD+1) of the From address. It should apply only when DKIM d= aligns with that domain, and never for free-mail or known ESP/marketplace domains. In those cases the key should fall back to the exact address or display name. Merges should be suggestions, not defaults, given Yahoo's measured domain-level loss.
- DKIM d= alone is a poor brand key, because ESP signatures (for example sendgrid.net or mcsv.net) would merge unrelated brands. This is consistent with the BIMI alignment rules above.

### Gaps
- No product documentation was found describing a brand-merge algorithm (display name plus domain plus logo). Spark is the only product found exposing domain merge.
- No measured accuracy for registrable-domain or BIMI-based brand grouping was found.

## 5. Duplicate detection (same Message-ID across aliases, duplicate notifications)

### Takeaway
Gmail silently de-duplicates by Message-ID. It keeps the first copy seen, including across aliases and list cross-posts and your own Sent copy, and users cannot turn this off. This rests on vendor and forum evidence, not Google documentation. No product was found documenting de-duplication of near-identical notifications that have different Message-IDs.

### Cited Findings
- Gmail discards a list's echo of your own post because it shares the Message-ID with your Sent copy. Replies from others arrive normally — [Simplelists blog](https://www.simplelists.com/blog/enhance/gmail-solution-mail-sent-to-a-list-doesnt-show-in-inbox/)
- Users report Gmail keeps only one copy of the same Message-ID even when it arrives via different lists or aliases, keeping the first seen. There is no setting to override it — [BLU list 2012](https://blu.org/mhonarc/discuss/2012/12/msg00082.php); [Sympa list 2021](https://lists.sympa.community/arc/en/2021-07/msg00004.html)

### Inferences
- In Gmail, Cluster rarely sees exact Message-ID duplicates. In Outlook and multi-account views it may, so a Message-ID set de-dup step is cheap insurance. Near-duplicate notifications (same template key within a short window) are better handled as a template group with a count than by deletion.

### Gaps
- No official Google, Microsoft or Apple documentation on Message-ID de-duplication was found. No product feature for collapsing repeated notifications with distinct Message-IDs was found.

## 6. Measured outcomes and why features failed

### Takeaway
Hard numbers are scarce, and most are vendor claims.
- **Research side:** template and sender categorisation is accurate (about 90% precision and recall), and users almost never organise mail themselves (70% have no folders).
- **Product side:** Clutter claimed 82 min/month saved, and Gmail tab numbers come from marketers.

Failures and reversals had two causes. Inbox lacked basic features and was shut down by Google's consolidation. Shortwave over-bundled by default and walked it back.

### Cited Findings
- 70% of Yahoo users create no folder, and only 10% move more than 10 messages to folders — [arXiv 1606.09296](https://arxiv.org/pdf/1606.09296)
- Clutter, vendor claim: 82 min/month average and 168 min/month for the top 10% — [gHacks](https://www.ghacks.net/?p=113370); [TechRadar](https://www.techradar.com/news/software/business-software/microsoft-turns-on-clutter-to-keep-your-inbox-clean-1294218)
- Gmail Promotions: 90% of commercial mail goes there and 19.9% of users never open the tab (Return Path, a marketer source) — [Smart Insights](https://www.smartinsights.com/email-marketing/email-deliverability/new-gmail-tabs/); [SendPulse](https://sendpulse.com/blog/gmail-promotions-tab)
- 2013 tab backlash: "everyone hates the new Gmail inbox" (commentary). MailChimp saw a small drop in Gmail opens — [IOL 2013](https://iol.co.za/technology/2013-07-26-why-is-everyone-hating-on-gmail/); [Christopher Penn 2013](https://www.christopherspenn.com/2013/06/gmails-new-tabs-just-made-your-email-marketing-harder-again/)
- Inbox failure factors: Google consolidated onto one product, bundles and Trips were not ported, and tabs were judged a poor substitute — [VentureBeat](https://venturebeat.com/business/google-will-kill-inbox-by-gmail-in-march-2019); [9to5Google](https://9to5google.com/2019/04/01/inbox-gmail-features-havent-arrived/)
- Shortwave: automated senders, lists and channels "no longer bundle by default" (2023-11-16), replaced by an explicit "Bundle threads like this" action — [Shortwave changelog](https://www.shortwave.com/changelog/)
- Superhuman Auto Labels responded to customer complaints about marketing and cold email (2025). Its splits are capped by guidance at 7 — [TechCrunch](https://techcrunch.com/2025/02/19/superhuman-introduces-ai-powered-categorization-to-reduce-spammy-emails-in-your-inbox); [Superhuman blog](https://blog.superhuman.com/superhuman-ai-feature-showcase/)

### Inferences
- The products with staying power make grouping reversible and per-sender: Gmail move-to-tab, Outlook "Always move," Apple "Categorize Sender," HEY re-route, Spark ungroup and Shortwave Unbundle. Cluster should treat undo and override as first-class.
- No independent study measures time saved from sender bundles. Cluster can't cite one and would have to measure locally, for example rows collapsed or bulk actions per session.

### Gaps
- No independent (non-vendor) measurement of bundle or group-by-sender engagement or time saved was found for any product.
- No published accuracy figures were found for Apple, Proton, Spark or Superhuman categorisation.
