# Teach Cluster who matters from headers

Date: 2026-10-16. Built from the five notes in `research/research_notes/Cluster sender algorithm deep dive/`. It builds on `research/2026-10-11-core-problem.md` and `research/2026-10-11-how-cluster-solves-it.md` and replaces their ranked fix list (section 5 of the second note). Gap codes A1 to A9 come from that note. Code references are `path:line` on branch `feat/kai-2026-10` at `c811ff2`.

Labels: **[verified]** means checked against the linked primary source or the repo. **[vendor]** means the vendor says so and nobody independent checked. **[secondary]** means press or blog coverage of a source the researchers did not read. **[inference]** means our reasoning.

**Bottom line.** The core problem breaks into eleven sub-problems. All of them rest on one missing thing: a long-memory, per-sender record of how you and this sender behave. Every system that made measurable progress built that record first. Google's Interactions Rank and Priority Inbox did it for "who matters". Yahoo's sender table did it for "what kind of mail". Barracuda's BEC-Guard did it for "is this really them". The evidence agrees on three points. History between you and a sender predicts importance better than content does: in Microsoft's 2017 study, history features alone reached AUC 0.69 against 0.72 for the full model. Identity checks on headers only become useful once a second, independent signal confirms them: BEC-Guard's precision rose from 11.7% to 98.2%. Lifting mail is safer than hiding it. Cluster already fetches most of the headers it needs. It then throws most of them away, samples under 10% of the mailbox, and splits "known" across four stores that never talk to each other. The top recommendation is a single IndexedDB sender profile, fed by a full Sent backfill and incremental sync, holding decayed interaction counts. On top of it Cluster can build three things: an Important strip that lifts mail and never hides it, a contact-impersonation gate that holds only when a second signal agrees, and per-sender corrections. All of this fits the Gmail quota if received-mail backfill is throttled and depth-capped. The new 80M-units-a-day project ceiling, not the per-user limit, is what forces that cap.

## Eleven sub-problems hang off one missing picture

The problem statement is "Your inbox treats every sender the same. It doesn't know who matters to you. So the mail that matters gets buried, and the mail that only pretends to matter gets you fooled." It has a buried half, a fooled half, and a shared base that both halves need. The map below splits it so each piece can be built and measured on its own.

| # | Sub-problem | Plain question | Half | Cluster today | Gap codes |
|---|---|---|---|---|---|
| S1 | Know the sender | Which messages come from the same sender, company or person? | Base | Exact address only. First display name kept. | A7 |
| S2 | See enough history | Has Cluster seen enough of this mailbox to judge? | Base | 150 cleanup messages, 100 inbox messages over 30 days, 150 sent | A1, A2, A3 |
| S3 | Rank people | How much does this person matter to you? | Buried | Boolean "you sent to them" from 150 sent messages | A2, A8 |
| S4 | Tell machines from people, then sort kinds | Is this a person, a record, a newsletter or a promo? | Buried | Per-message rules. One subject keyword can flip the kind. | A9 |
| S5 | Lift what matters | What should be in front of you right now? | Buried | Nothing lifts mail | A8 |
| S6 | Quiet the bulk you ignore | What can go, and did the unsubscribe work? | Buried | Read-rate EMA and one-click unsubscribe | A9 |
| S7 | Screen first contact | What happens when someone new writes? | Both | Opt-in Screener keyed on the sent set | A6 |
| S8 | Catch impostors | Is this really the person, brand or thread it claims to be? | Fooled | 37-brand lookalikes plus a DKIM and Reply-To ledger | A4, A5 |
| S9 | Warn and explain | How do you say "careful" without people tuning it out? | Fooled | Hold card with a reason | none |
| S10 | Learn from corrections safely | How does the picture improve without being poisoned? | Both | Engagement EMA learns from unread versus read only | A9 |
| S11 | Measure without collecting data | How do we know it got better? | Base | Known-bug tests and a synthetic corpus plan | A3 |

S1, S2 and S11 are the foundation. Every other row reads from them. That is why the ranked plan below starts with them, even though users never see them.

## How Gmail, Yahoo, Outlook and the field handle each piece

### S1. Know the sender: the right key is address, then company, then name

**Providers.** Google's implicit social graph keys relationships on exact contacts and on "implicit groups" of recipients. It is built only from "timestamp, sender, and recipients" and filters out `info@` and `noreply@` addresses with regexes first **[verified]** ([Roth et al., KDD 2010](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/36371.pdf)). Yahoo's production categoriser compared aggregation levels. Grouping by sender won on cost. Grouping by domain lost accuracy because one company sends different kinds from different addresses (target.com has orders@, target.jobs@, payroll@ and staff) **[verified]** ([Grbovic et al., CIKM 2014](https://arxiv.org/abs/1606.09296)). Outlook separates `from` (the visible mailbox) from `sender` (the account that sent). They differ for delegates and shared mailboxes **[verified]** ([Graph message](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0)).

**Products and vendors.** Abnormal keeps a vendor-level profile next to the address-level one **[vendor]** ([VendorBase](https://abnormal.ai/platform/product-demos/vendorbase)). BEC-Guard stores names as first plus last and normalises variants: middle initials, "Smith, Jane", suffixes and nicknames **[verified]** ([Cidon et al., USENIX Sec 2019](https://www.usenix.org/system/files/sec19-cidon.pdf)).

**Who measured progress.** BEC-Guard found **82% of employees in a 44,000-mailbox org sent from one address**. Ho et al. found that **52% of established display names used more than one address** across all senders **[verified]** ([BEC-Guard](https://www.usenix.org/system/files/sec19-cidon.pdf); Ho 2017 via the 2026-10-11 note). The two figures do not conflict. Employees use one corporate address. Friends, family and services do not. A household inbox looks like Ho's population **[inference]**.

**Lesson.** Use three levels. The first is the address, with plus-tags stripped and dots ignored for Gmail. The second is the registrable domain, switched off for free mail and shared platforms such as Substack. The third is a display-name skeleton, used only as an index and never as an identity. Merge addresses into one person only when you wrote to both or the user confirms it. Name equality must never merge them **[inference]**.

### S2. See enough history: Gmail is slow, Outlook is cheap, Yahoo is closed

**Gmail.** The API exposes every header and label a profile needs. It does not say why a message is Important; `IMPORTANT` is a bare label **[verified]** ([Message resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages#Message)). `messages.get` costs 20 units against **6,000 units per minute per user**. For projects created on or after 1 May 2026 there is also a **project-wide 80,000,000 units per day "billing threshold"** that cannot be raised **[verified]** ([Gmail quota](https://developers.google.com/workspace/gmail/api/reference/quota)). Batching does not save units **[verified]** ([batch guide](https://developers.google.com/workspace/gmail/api/guides/batch)). `history.list` costs 2 units a page and can report label changes. Its start ID is "typically valid for at least a week" **[verified]** ([history.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)). Moving to the `gmail.metadata` scope gains nothing. It is restricted just like `gmail.modify`, and it disables the `q` search that every Cluster candidate query depends on **[verified]** ([scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), `src/lib/providers/gmailProvider.ts:43-49`).

**Outlook.** Graph returns sender, recipients, read state, flag, Focused classification and conversation ID inline on list and delta calls. The limit is **10,000 requests per 10 minutes per mailbox, 4 at a time**, not per-message units **[verified]** ([throttling](https://learn.microsoft.com/en-us/graph/throttling-limits), [delta](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0)). Delta is per folder. Message IDs change on folder moves unless you send `Prefer: IdType="ImmutableId"` **[verified]** ([message](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0)).

**Yahoo.** No REST mail API exists. Access is IMAP with OAuth and a commercial-access agreement **[verified]** ([Yahoo developer access](https://senders.yahooinc.com/developer/developer-access)). An MV3 extension cannot open raw IMAP sockets, so Yahoo needs a server or a native helper. Both break Cluster's model **[inference]**.

**Chrome MV3.** The service worker dies after 30 seconds idle or 5 minutes on one event. Alarms can fire every 30 seconds **[verified]** ([SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)). Cluster has `unlimitedStorage`, `alarms` and a durable-jobs mechanism, but no IndexedDB **[verified]** (`manifest.json:31`, `src/lib/durableJobs.ts:41-48`).

**What it costs.** At Cluster's 5,500 units-a-minute pacing, a 5,000-message Sent folder takes about 18 minutes and a 50,000-message mailbox takes about 3 hours. One 50k backfill uses 1M units. The project ceiling therefore allows about **80 full 50k backfills a day across all users**. About 10 users pacing at full speed all day would hit it **[inference from verified costs]**. Listing IDs by label (`SENT`, `STARRED`, `IMPORTANT`) costs 5 units per 500 IDs, about 1% of fetching **[inference]**.

**Lesson.** Sent mail first, because it is small and the most valuable. Then received mail, newest first, throttled and capped. Then incremental sync. Outlook is not the bottleneck. Gmail and the project ceiling are.

### S3. Rank people: history beats content, and replies beat reads

**Gmail.** The Important marker's published factors are almost all behavioural: "Whom you email, and how often", what you open, reply to, star, archive or delete, plus keywords **[verified]** ([Google Help 186543](https://support.google.com/mail/answer/186543?hl=en)). Gemini AI Inbox (announced January 2026) still names "people you email frequently" and "your contacts" first when it describes how it finds VIPs. It also reads content. Personal accounts need a paid AI plan, and it is US and English only **[verified]** ([Google blog](https://blog.google/products-and-platforms/products/gmail/gmail-is-entering-the-gemini-era/), [Android Authority](https://www.androidauthority.com/gmail-live-gemini-ai-inbox-3724359/)). Google's header-only formula is **Interactions Rank**: a sum of interactions that decay exponentially with a tunable half-life, with outgoing mail weighted separately **[verified]** ([Roth 2010](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/36371.pdf)).

**Outlook.** Focused Inbox uses "emails and contacts with whom you interact" **[verified]** ([Microsoft Support](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978)). Graph's `/me/people` returns contacts ranked by relevance, with scores. It works on personal accounts but is in maintenance mode **[verified]** ([List people](https://learn.microsoft.com/en-us/graph/api/user-list-people?view=graph-rest-1.0)).

**Yahoo.** A Priority tab shipped in June 2024. Its signals are not public **[verified]** ([Yahoo press](https://yahooinc.com/press/yahoo-mail-redesigns-the-inbox-for-a-cleaner-smarter-and-simpler-experience)). Yahoo Research found that as volume rises, people reply to a smaller share of their mail **[verified]** ([Kooti et al., WWW 2015](https://arxiv.org/abs/1504.00704)).

**Products.** SaneBox sorts on "the subjects and sender alone" and learns per person from folder moves **[vendor]** ([SaneBox help 186](https://www.sanebox.com/help/186-how-does-sanebox-determine-trainings)). Spark, Superhuman and HEY let the user mark a sender priority or VIP once **[vendor]** ([Spark priority](https://sparkmailapp.com/help/sending-emails/pin-and-priority)).

**Who measured progress.** Microsoft Research studied 351,532 emails. **History features alone reached AUC 0.6924, against 0.7208 for every feature combined**. Bag-of-words alone reached 0.51. A recipient's past reply count ranked second among single features, and being in To ranked fourth. Reply rates peaked at 3 to 5 recipients **[verified]** ([Yang et al., SIGIR 2017](https://microsoft.com/en-us/research/uploads/prod/2017/04/sigir17a.pdf)). A second Microsoft study found replies are a weak signal of importance for single messages in personal mail. Reads did not separate important from unimportant mail. Deletes were a negative signal. About a third of personal-mail judges were anti-correlated with the action model **[verified]** ([Alrashed et al., WWW 2019](https://people.csail.mit.edu/tarfah/papers/email_significance.pdf)). Priority Inbox cut error from 45% (global model) to 38% (per-user models) to 31% (per-user thresholds) **[verified]** ([pub36955](https://research.google/pubs/pub36955/)).

**Lesson.** Score a person from your outgoing mail and replies, weighted by recency. Add how directly they write to you. Treat reads as weak. Bills and school notices matter without any reply, so records need their own lift lane and cannot share the people score. A header-only model keeps the history, pair and address feature groups and loses only content prediction. A rough estimate is AUC 0.68 to 0.71 on comparable data **[inference, extrapolated from the ablation tables]**.

### S4. Tell machines from people, then sort kinds: decide per sender, not per message

**Gmail.** The five tabs are defined by kind. Primary is the residual: anything not positively detected as machine mail lands there **[verified]** ([Gmail Help 3094499](https://support.google.com/mail/answer/3094499)). In 2025 Google added a Purchases view and a "most relevant" Promotions sort **[secondary]** ([Android Authority](https://www.androidauthority.com/gmail-purchases-tab-and-promotions-sorting-3596995)).

**Yahoo.** The CIKM 2014 cascade has three stages. Hard rules cover 32% of traffic, and every reply or forward counts as human. A per-sender lookup table comes next. A heavy per-message classifier runs only for the **roughly 8%** of traffic from new or mixed senders. **Address-only features reached AUC 0.897.** Behavioural features alone reached 0.982 for human versus machine but could not tell machine kinds apart **[verified]** ([Grbovic 2014](https://arxiv.org/abs/1606.09296)). Google's template work propagated labels across structural templates at **over 91% precision and 93% recall** **[verified]** ([Wendt et al., WSDM 2016](https://research.google/pubs/hierarchical-label-propagation-and-discovery-for-machine-generated-email/)).

**Outlook.** Microsoft stamps a Bulk Complaint Level from 0 to 9 in `X-Microsoft-Antispam: BCL:`. Since July 2026, promotional bulk mail also gets a Promotions tag and folder that learn from moves **[verified]** ([BCL](https://learn.microsoft.com/en-us/defender-office-365/anti-spam-bulk-complaint-level-bcl-about)).

**Others.** Apple sorts into Primary, Transactions, Updates and Promotions on the device, from metadata that "does not include the body content" **[verified]** ([Apple privacy](https://www.apple.com/legal/privacy/data/en/mail-categorization/)). Proton separates Newsletters from Promotions **[vendor]** ([Proton](https://proton.me/blog/proton-mail-categories)). HEY splits mail into Imbox, Feed and Paper Trail by a one-time user decision **[vendor]** ([HEY](https://www.hey.com/how-it-works/)).

**Lesson.** Copy Yahoo's cascade. Replies and threads that answer your sent mail count as human. Each sender gets a kind decided by votes across all its messages. Per-message subject rules apply only to new or mixed senders, so one keyword can no longer flip an established sender. Key the table on the canonized sender or `List-Id`, never the bare domain. Header evidence is language-free and should carry the decision. English subject regexes become a tie-breaker **[inference]**.

### S5. Lift what matters: everyone lifts, and the failures come from hiding

**Gmail.** Nudges surface "Received 3 days ago. Reply?" and "Sent 5 days ago. Follow up?" **[verified]** ([Google Help 6585](https://support.google.com/mail/answer/6585?hl=en)). Packages arriving within 24 hours pin to the top **[secondary]** ([GSMArena](https://m.gsmarena.com/gmail_gets_a_new_purchases_view_and_a_more_relevant_promotions_tab-news-69466.php)).

**Outlook.** Focused Inbox hides the rest in Other. Its best-known failure is essential mail hidden there. A university IT desk told students to turn it off, and a 2019 incident sent everything to Other **[verified]** ([IU](https://medicine.iu.edu/blogs/md-student-news/2024/turn-off-focused-inbox-in-outlook), [Office365ITPros](https://office365itpros.com/2019/07/25/focused-inbox-outage/amp/)).

**Apple.** Time-sensitive mail from any category also shows in Primary **[secondary]** ([Creative Techs](https://www.creativetechs.com/2025/01/14/mail-on-the-iphone-can-categorize-your-messages-in-ios-18-2/)).

**Products.** Spark puts priority senders on top with a 1 to 10 preview count **[vendor]** ([Spark](https://sparkmailapp.com/help/sending-emails/pin-and-priority)).

**Who measured progress.** Nobody published accuracy or time-saved figures for Nudges, AI Inbox, Focused, Apple Priority, Yahoo Priority, SaneBox, Spark or HEY. Priority Inbox's per-user threshold gain is the main controlled result **[verified absence across the notes]**.

**Lesson.** Build an Important strip that lifts and never moves mail out of the inbox on a model's guess. A wrong lift costs a glance. A wrong demotion costs a missed deadline **[inference]**. Use separate lanes for people, for "waiting on reply" and for time-sensitive records.

### S6. Quiet the bulk you ignore: unsubscribe is now enforceable, but verify it

**Gmail and Yahoo.** Since February 2024, senders of more than 5,000 messages a day must support RFC 8058 one-click unsubscribe. Gmail requires it to be honoured within 48 hours and Yahoo within 2 days **[verified]** ([Google sender guidelines](https://support.google.com/a/answer/81126), [Yahoo best practices](https://senders.yahooinc.com/best-practices/)). Gmail's Manage subscriptions page groups senders by frequency and unsubscribes for you **[verified]** ([Google blog](https://blog.google/products/gmail/new-manage-subscriptions-unsubscribe/)).

**Outlook.** Sweep offers four verbs per sender: move all, move all plus future mail, keep only the latest, or older than 10 days **[secondary]** ([How-To Geek](https://www.howtogeek.com/662263/use-the-built-in-sweep-feature-in-outlook-online-to-clear-unwanted-emails/)).

**Products.** Clean Email and Proton pair unsubscribe with block or auto-trash, because some senders ignore requests **[vendor]** ([Clean Email](https://clean.email/help/basics/how-clean-email-processes-incoming-mail)). Unroll.me sold receipt data and settled with the FTC. It is the trust lesson for this whole category **[secondary]** ([Gizmodo](https://gizmodo.com/unroll-me-settles-with-ftc-for-rifling-through-its-user-1840496042)).

**Who measured progress.** Online Trust Alliance audits found **98% of top e-commerce brands** complied with unsubscribe rules, up from 90% in 2014 **[secondary]** ([Internet Society](https://internetsociety.org/?p=96715)). No 2024 to 2026 independent measurement exists.

**Lesson.** After an unsubscribe, allow a 3-day grace period. Any mail after that matching the same address, `List-Id` or `Feedback-ID` SenderId means the request was ignored, and Cluster should offer a block filter. Rank cleanup by frequency times unread share. Gmail ranks by frequency only **[inference]**.

### S7. Screen first contact: a one-time decision per sender, with smart auto-pass

**Providers.** Microsoft stamps a first-contact tip ("You don't often get email from…") as `SFTY:9.25` in `X-Forefront-Antispam-Report`. It skips mailboxes younger than 7 days **[verified]** ([MS Learn](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about)). Gmail and Yahoo have no consumer screener **[inference from absence]**.

**Products.** HEY screens every new sender. Spark's Gatekeeper is optional with three modes. Clean Email holds new senders for accept or block **[vendor]** ([HEY](https://www.hey.com/features/), [Spark](https://www.sparkmailapp.com/features/smart_inbox), [Clean Email](https://clean.email/help/basics/how-clean-email-processes-incoming-mail)).

**Who measured progress.** No product published numbers.

**Lesson.** Keep the Screener opt-in. Auto-pass replies to your sent mail, Gmail-IMPORTANT and Outlook-Focused mail, and new addresses at an authenticated company you already know. On Outlook, read Microsoft's `SFTY:9.25`. It judges first contact over the whole mailbox, which Cluster's 30-day sample cannot **[inference]**.

### S8. Catch impostors: a history gate plus a second signal

**Gmail.** Gmail claims to block "more than 99.9%" of threats **[vendor]** ([Workspace whitepaper](https://workspace.google.com/learn-more/security/security-whitepaper/asset-protection/)). After its authentication rules, unauthenticated messages to Gmail users fell 75% and then a further 65% **[vendor via secondary]** ([Valimail](https://www.valimail.com/?p=9773)). Directory-name spoof protection exists only in paid Workspace **[verified]** ([Workspace admin](https://knowledge.workspace.google.com/admin/gmail/advanced/advanced-phishing-and-malware-protection)). No consumer tier we could verify warns when a contact's name arrives from a new address.

**Yahoo.** Yahoo moved yahoo.com to DMARC `p=reject` in April 2014. Mailing lists broke as a result **[secondary]** ([PCWorld](https://www.pcworld.com/article/444768/yahoo-email-antispoofing-policy-breaks-mailing-lists.html)).

**Outlook.** Microsoft documents its verdicts down to the header: `compauth` with reason codes, the `?` and "via" conditions, `CAT:` values and `SFV:SFE` (sender in the user's Safe Senders) **[verified]** ([anti-spam headers](https://learn.microsoft.com/en-us/defender-office-365/message-headers-eop-mdo)). Defender's paid impersonation checks are switched off when sender and recipient "previously communicated" **[verified]** ([MS Learn](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about)).

**Others.** Proton shows a red banner on authentication failure **[vendor]** ([Proton](https://proton.me/support/email-has-failed-its-domains-authentication-requirements-warning)). Apple's "trusted sender" label is familiarity only, and phishing has carried it **[secondary]** ([Fox News](https://www.foxnews.com/tech/phishing-scam-exploits-apple-mail-trusted-sender-label)).

**Vendors.** Sublime's open rules use exact protected-name matching. Fuzzy name matching fires only with strong intent. Each rule has a "solicited" brake (you have written to this address) and negations for real threads and lists. Its Microsoft rule fires on "Microsoft account team" from outlook.com, because outlook.com is not a corporate Microsoft root **[verified]** ([sublime-rules](https://github.com/sublime-security/sublime-rules/tree/main/detection-rules)). Abnormal caught a vendor fraud that passed SPF, DKIM and DMARC because none of 1,300 earlier emails came from that country and the Reply-To had changed **[vendor]** ([Abnormal](https://abnormalsecurity.com/resources/use-case-vendor-email-compromise)).

**Who measured progress.** BEC-Guard is the only peer-reviewed production result. Its header impersonation classifier alone had **11.7% precision, about 1 false positive per 6,300 emails**. Gating a content classifier with it reached **98.2% precision and 1 false positive per 5.26 million**. **59.9% of attacks carried no link.** It performed well after one month of data **[verified]** ([BEC-Guard](https://www.usenix.org/system/files/sec19-cidon.pdf)). At 1 in 6,300, a name check alone on a 3,200-message-a-month household would raise a false alarm about every two months **[inference]**.

**Lesson.** Contact impersonation is the open consumer lane. Build it as a gate that holds only with a second signal. Fix brand claims sent from the brand's own free-mail domain by allow-listing corporate roots with DMARC pass, as Sublime does. Add thread-integrity and "Reply-To solicited" checks. All of these are header-only.

### S9. Warn and explain: interrupt at the action, rarely

**Evidence.** In Petelka et al. (CHI 2019), phishing click-through was **76.67% with no warning and 44.00% with an email banner**. An on-hover link warning that made the user click the revealed real URL cut it to **8.67%** **[verified]** ([Petelka 2019](https://yixinzou.github.io/publications/pdf/chi2019-petelka.pdf)). Active browser warnings were heeded 79% of the time. A passive warning did no better than none **[verified]** ([Egelman et al., CHI 2008](https://kilthub.cmu.edu/articles/journal_contribution/You_ve_Been_Warned_An_Empirical_Study_of_the_Effectiveness_of_Web_Browser_Phishing_Warnings/6626570)). Users still obeyed 59% to 67% of false warnings, so every false alarm trains the wrong habit **[verified]** ([Petelka 2025](https://jpetelka.github.io/files/ieee_2025_phishing.pdf)). Attention to warnings fell across a week. Varying the visual resisted that decline **[verified]** ([Vance et al., MISQ](https://misq.org/tuning-out-security-warnings-a-longitudinal-examination-of-habituation-through-fmri-eye-tracking-and-field-experiments.html)).

**Providers.** Microsoft writes the clearest identity copy: "appears similar to someone who previously sent you email, but may not be that person". Its "Unverified" tag shows only on the first message in a thread **[verified]** ([MS Learn](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about), [Office365ITPros](https://office365itpros.com/2025/08/19/unverified-sender-outlook/)). Gmail shows hover-for-why on the Important marker **[verified]** ([186543](https://support.google.com/mail/answer/186543?hl=en)).

**Lesson.** Put the warning on the link and on Reply, not only in a banner. Show at most one interruptive warning per sender or thread. Give each reason type its own icon and line. Name the exact mismatch, then give one safe action **[inference]**. Explanations make corrections cheaper: Explanatory Debugging raised user understanding by 52% and roughly doubled correction efficiency **[verified via search summary]** ([Kulesza et al., IUI 2015](https://openaccess.city.ac.uk/id/eprint/13819/)).

### S10. Learn from corrections safely: per-sender rules first, small models second

**Providers.** Every provider corrects per sender. Outlook has "Always move to", Apple lets users recategorise a sender, and Gmail learns from drags between tabs **[verified]** ([Microsoft](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978), [Gmail](https://support.google.com/mail/answer/3094499)). Outlook exposes per-sender Focused overrides through Graph, which is a user-written "this sender matters" signal **[verified]** ([overrides](https://learn.microsoft.com/en-us/graph/api/inferenceclassification-list-overrides?view=graph-rest-1.0)).

**Who measured progress.** Priority Inbox showed that per-user thresholds matter as much as per-user weights (38% to 31% error) **[verified]** ([pub36955](https://research.google/pubs/pub36955/)). On the risk side, an attacker controlling about **1% of training mail made SpamBayes unusable** **[verified via search summary]** ([Nelson et al., LEET 2008](https://www.usenix.org/conference/leet-08/exploiting-machine-learning-subvert-your-spam-filter)). Federated learning works at Gboard scale, but it needs a coordinating server, and some models still reached ε = 13.69 **[verified]** ([Google Research](https://research.google/blog/advances-in-private-training-for-production-on-device-language-models/)). It does not fit Cluster.

**Lesson.** Give users permanent per-sender overrides, then a tiny logistic model: global weights ship in a signed file and a small per-user adjustment stays local. Only signals attackers cannot fake should raise trust: your outgoing mail, replies, stars, corrections and DMARC-aligned identity **[inference]**.

### S11. Measure without collecting data: time-split replay and local counters

**Evidence.** Roth et al. evaluated by predicting future interactions from earlier ones only **[verified]** ([Roth 2010](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/36371.pdf)). Grbovic weighted evaluation per canonized sender, so a few huge senders could not hide errors **[verified]** ([Grbovic 2014](https://arxiv.org/abs/1606.09296)). Enron (about 0.5M messages, 150 users) and Avocado (279 accounts, LDC-licensed) give real two-way headers. TREC 2007 may not be republished **[verified]** ([CMU Enron](https://www.cs.cmu.edu/~enron/), [LDC](https://catalog.ldc.upenn.edu/LDC2015T03), [TREC07](https://plg.uwaterloo.ca/~gvcormac/treccorpus07/about.html)).

**Lesson.** Run an out-of-repo replay script on public corpora to tune half-lives and weights. Keep only counts locally and show them in a "How Cluster is doing for you" panel.

## Best in class per sub-problem

| Sub-problem | Best in class | Measured result | Evidence label | What Cluster copies |
|---|---|---|---|---|
| S1 Know the sender | Yahoo sender-level aggregation; BEC-Guard name normalisation | Domain level loses "multiple businesses"; 82% of employees use one address | verified | Address, company and name skeleton levels; no merges by name |
| S2 See enough history | Microsoft Graph delta | 10,000 requests per 10 min; one list call returns about 999 messages | verified | Per-folder delta; Gmail `history.list` with all event types |
| S3 Rank people | Google Interactions Rank and Priority Inbox; MSR reply model | History AUC 0.69 against 0.72 for all features; per-user error 45% to 31% | verified | Decayed, direction-weighted accumulators |
| S4 Machines and kinds | Yahoo cascade; Google templates | Address-only AUC 0.897; templates above 91% precision | verified | Three-stage cascade; sender kind table; template key |
| S5 Lift what matters | Gmail Nudges; Apple time-sensitive override | No published numbers | verified features, no metrics | Separate lanes; lift, never hide |
| S6 Quiet bulk | Gmail and Yahoo 2024 sender rules; Clean Email block fallback | 98% brand compliance (OTA, older) | verified rules, secondary metric | 3-day verification and block fallback |
| S7 First contact | Microsoft `SFTY:9.25`; HEY Screener | No published numbers | verified, vendor | Read Microsoft's verdict; smart auto-pass |
| S8 Impostors | Barracuda BEC-Guard; Sublime rules | Precision 11.7% alone, 98.2% gated | verified | Two-signal gate; solicited brake; negations |
| S9 Warn and explain | Petelka on-hover forced attention; Microsoft copy | Click-through 8.67% against 44% for banners | verified | Warnings at the link and on Reply; one per thread |
| S10 Learn safely | Priority Inbox per-user deltas and thresholds | 38% to 31% error from thresholds | verified | Overrides, per-user offset, influence caps |
| S11 Measure | Roth time-split; Grbovic per-sender evaluation | Method, not a score | verified | Replay harness; local counters; shadow mode |

## What Cluster already has and throws away

The code audit matters most for the plan. Cluster's Gmail fetch already asks for From, Reply-To, List-Unsubscribe, List-Unsubscribe-Post, Subject, Authentication-Results, DKIM-Signature, Precedence and Auto-Submitted. It also gets labels, date and size **[verified]** (`src/lib/gmailApi.ts:291-325`). Then it discards most of the relationship signal. `threadId` comes back from `messages.list` but is mapped away (`gmailProvider.ts:89-92`). To, Cc, Message-ID, In-Reply-To, References, List-Id and Return-Path are never requested (`gmailApi.ts:293-305`). `IMPORTANT` and `CATEGORY_PERSONAL` collapse into one boolean, and `SENT`, `CATEGORY_SOCIAL` and `CATEGORY_FORUMS` are dropped (`gmailProvider.ts:120-150`). The sent scan reads 150 messages and throws away display names. It also splits quoted names on commas (`gmailApi.ts:401-440`). Gmail history sync watches only new inbox messages, so later reads and stars are missed (`gmailApi.ts:244-249`). On Outlook, Cluster selects `sender` rather than `from`, lists only the Inbox, and selects a `size` property that does not exist in Graph v1.0. That last one may make every metadata call fail (`outlookProvider.ts:82-140`, needs a live test) **[verified against docs; runtime unverified]**.

"Known" lives in four stores fed by three different samples. `knownSenders` is unbounded inside the settings blob. `knownSenderSet` is the only one that gates protection and verdicts (`protectionPolicy.ts:20-29`, `verdict.ts:57-58`). The ledger's history feeds identity-change signals only. The engagement model is updated without a protection context (`background.ts:353`, `engagementModel.ts:65`) **[verified]**. Nothing persists beyond a 2,000-entry cache, so every score is recomputed from a fresh small sample. That explains the "same inbox scores differently" known bug (A3) **[inference]**.

## Ranked recommendations: what to build, why, and how

Ranking is by impact on the core problem per unit of effort, with foundations first because everything else reads from them. Sizes are estimates **[inference]**.

| Rank | Build | Closes | Why first | Size |
|---|---|---|---|---|
| 1 | Stop discarding headers and labels | A2, A4, A9 (inputs) | Nearly free, and every later item needs these fields | Small |
| 2 | One sender profile in IndexedDB, with a migration | A3, A6, A7 | The spine. Protection, verdict, Screener and engagement then agree | Medium |
| 3 | Full Sent backfill, throttled received backfill, incremental sync | A1, A2, A3 | History is the strongest predictor, and the profile is empty without it | Large |
| 4 | "Who matters" score from decayed accumulators | A2, A8 | Turns history into a ranking with reasons | Medium |
| 5 | Important strip with three lift lanes | A8 | The buried half, which Cluster does not touch today | Medium |
| 6 | Impostor checks: brand from free mail, contact-name gate, thread integrity, Reply-To solicited | A4, A5 | The fooled half's open lane; small once rank 2 exists | Small to medium |
| 7 | Sender kind table, cascade and template key | A9, kind flips | Stops one keyword flipping a sender; feeds the records lane | Medium |
| 8 | Corrections and learning: overrides, per-user offset, safe updates | A9 | Makes it personal without poisoning risk | Medium |
| 9 | Unsubscribe verification and block fallback | Bulk noise | Cheap, visible, and builds trust | Small |
| 10 | Warning placement and reason-code UX | Fooled | Makes holds effective and keeps false alarms quiet | Small to medium |
| 0 (runs alongside all) | Local census, metrics panel, replay harness, shadow mode | A3 and measurement | Without it no threshold can be tuned | Small, then ongoing |

### Rank 1. Stop discarding headers and labels

**What.** Add `To`, `Cc`, `Message-ID`, `In-Reply-To`, `References`, `List-Id`, `Return-Path`, `Feedback-ID` and `Sender` to the Gmail `metadataHeaders`. Keep `threadId` on candidate stubs. Replace the label booleans with an 8 to 16 bit mask covering INBOX, UNREAD, STARRED, IMPORTANT, SENT, CATEGORY_PERSONAL, CATEGORY_SOCIAL, CATEGORY_PROMOTIONS, CATEGORY_UPDATES, CATEGORY_FORUMS and TRASH. Keep IMPORTANT and PERSONAL separate. Keep display names in the sent scan, and parse addresses with a quote-aware parser. On Outlook, select `from` alongside `sender`, `conversationId` and `internetMessageId`. Drop `size`, or replace it after a live check.

**Touch points.** `src/lib/gmailApi.ts:291-325` (header list), `:401-440` (`parseAddressList` and `listSentCorrespondents`), `src/lib/providers/gmailProvider.ts:89-92` (stubs) and `:120-150` (label normalisation), `src/lib/providers/outlookProvider.ts:136-140,151,159` (select and mapping) and `:554-579` (Outlook sent scan). Pass a `ProtectionContext` to `updateEngagement` at `background.ts:353` and `dashboard.ts:604`.

**Cost.** Header count does not change Gmail unit cost, which is per method **[verified]**. Payload size grows a little **[inference]**.

### Rank 2. One sender profile

**Data model (IndexedDB, under `unlimitedStorage`).** The design below follows the on-device-learning notes, trimmed **[inference]**.

| Store | Key | Holds | Size estimate |
|---|---|---|---|
| `messageIndex` | provider message id | time, addressKey, threadId, your position (To, Cc, Bcc, absent), recipient count, label bits, auth bits (DMARC aligned pass, compauth reason, DKIM d=), list bits (List-Id hash, List-Unsubscribe-Post, Feedback-ID SenderId), Reply-To root, In-Reply-To resolved (yes or no), kind, sizeKB. No subject text, or a salted hash if a template key needs it | 150 to 300 B a row; 15 to 30 MB at 100k |
| `addressProfile` | addressKey (lowercase, plus-tag stripped, Gmail dots removed) | raw forms, orgKey, personId, names {skeleton to firstDay, lastDay, days}, firstSeen, lastSeen, daysSeen, accumulators (below), Beta counts for read, reply, undo, release and providerImportant, infrastructure set {dkimD and spfDomain pairs with days and promoted flag}, Reply-To set with a solicited flag, kind votes, overrides, state (active, dormant), schema version | 0.5 to 1 KB; 5 to 10 MB at 10k senders |
| `orgProfile` | registrable domain via PSL, absent for free mail and platforms | rolled-up rates, infrastructure set, address count, earliest familiarity | small |
| `nameIndex` | name skeleton | addressKeys that used it, and whether you wrote to each | small |
| `modelState`, `trainingBuffer`, `localMetrics` | singleton | per-user weights and offsets, up to 500 examples, counters | under 100 KB |

Small cursors and the quota ledger stay in `chrome.storage.local`.

**Read API.** One `senderProfile` module exposes `getProfile(addressKey)`, `tier(profile)`, `mattersScore(profile)`, `isSolicited(address)` and `explain(profile)`. Then `screener.knownSenderSet`, `protectionPolicy`, `verdict`, the Screener, inbox time limits and `engagementModel` all call it instead of their own stores.

**Migration.** Seed `firstSeen` from `settings.knownSenders`. Seed out-counts from `settings.sentCorrespondents`. Seed the infrastructure and Reply-To sets from `senderLedger`. Seed read counts from `settings.senderEngagement`. Then retire those stores and remove `knownSenders` from the settings blob, where its unbounded growth slows every settings write. Touch points: `src/lib/screener.ts:13-56`, `src/lib/firstContact.ts:17-37`, `src/lib/settingsStore.ts:59-61,66,179-183`, `src/lib/senderLedger.ts:20-52`, `src/lib/senderLedgerStore.ts:7-44`, `src/lib/engagementModel.ts`, `src/lib/protectionPolicy.ts:20-29,61-62` and its 14 `buildProtectionContext` call sites, `src/lib/verdict.ts:57-58,149-153`, and `src/lib/senderModel.ts:120-185` (`addToSenders` writes into the profile instead of a throwaway summary).

**Rule kept from the notes.** Only user-originated or authenticated events raise trust. Incoming volume from a misaligned sender updates display counts but never "normal" or "matters" **[inference]**.

### Rank 3. Coverage within quota

| Phase | Gmail | Outlook | Cost and time (inference from verified costs) |
|---|---|---|---|
| Seeds | `messages.list` ID sets for SENT, STARRED, IMPORTANT and CATEGORY_PERSONAL | `/me/inferenceClassification/overrides`; optionally `/me/people` | Under 1,000 units; minutes |
| Sent backfill | List all SENT IDs, then `format=metadata` with To, Cc, Bcc, Date, Message-ID, In-Reply-To, References and From | `sentitems` list with recipients and names inline | 5,000 sent = 100k units, about 18 min; Outlook 5 to 50 requests |
| Received backfill | List with `-in:spam -in:trash`, newest first. Fetch at **1,500 to 2,500 units a minute**. Use `threads.get` only where a thread has 3 or more listed IDs | List every folder with a full `$select`; headers by GET only for the last 90 days | 50k messages about 7 to 13 h wall clock across sessions |
| Incremental | `history.list` with messageAdded, labelAdded, labelRemoved and messageDeleted, **no label filter**, at least daily. On 404, re-list IDs and diff | One deltaLink per folder (Inbox, Sent Items, Archive, Cluster's folders), with ImmutableId | 2 units a page |

**Guards.** Set `getProfile.historyId` before the backfill starts. Checkpoint the page token and last ID after each page through `durableJobs`. Each alarm tick does at most about 4 minutes of work, under the 5-minute event limit. Default depth is **2 years or 20,000 messages**, with full history opt-in. A 20k cap costs 400k units, which allows about 200 backfills a day under the 80M project ceiling. Treat any rate-limit 403 or 429 during backfill as "stop until tomorrow", while foreground scans keep their headroom **[inference]**. Touch points: `src/lib/gmailApi.ts:235-274` (history), `src/lib/providers/gmailProvider.ts:89-117`, `src/lib/gmailQuotaLedger.ts:19,24,46` (add a separate backfill budget), `src/background.ts:62-67,325-383` (alarms and lanes), `src/lib/durableJobs.ts`, `src/lib/providers/outlookProvider.ts:82-134`, `src/lib/metadataCache.ts:27-30` (its 7-day re-fetch can go once label history syncs).

**Optional scope (owner decision).** Google People `otherContacts.list` (`contacts.other.readonly`) returns auto-created contacts with names, 1,000 per page. It needs a new scope and a `people.googleapis.com` host permission **[verified]** ([otherContacts](https://developers.google.com/people/api/rest/v1/otherContacts/list)).

### Rank 4. "Who matters" score

**Accumulators per address profile.** Each is stored as a value and a reference time, so an update is `S = S × 2^(-(t - tRef)/λ) + w`. That is constant space and works incrementally **[inference from Roth's IR formula, verified]**.

| Accumulator | Event and weight | Half-lives |
|---|---|---|
| `outIR` | You sent to them: To 1, Cc 0.5, Bcc 0.5 | 30 d and 365 d |
| `inIR` | They sent to you: you alone in To 1, To with 2 to 5 others 0.8, larger To 0.4, Cc 0.4, list mail 0.1 | 30 d and 365 d |
| `replyIR` | Your sent message whose In-Reply-To is one of theirs | 365 d |
| `threadStartIR` | You started a thread they joined | 365 d |
| `starIR` | You starred or flagged their mail | 365 d |
| Beta counts | read, reply, delete-unread, undo and release, as (k, n), decayed the same way | 365 d |

The weights follow the reply-rate evidence: replies peak at 3 to 5 recipients and To ranks above Cc ([Yang 2017](https://microsoft.com/en-us/research/uploads/prod/2017/04/sigir17a.pdf)). The exact numbers are starting guesses to tune in the replay harness **[inference]**. Start with outgoing weighted twice incoming (ω_out = 2). Roth's paper does not publish its own value **[verified gap]**.

**Tiers, used everywhere instead of four "known" notions.**

| Tier | Rule (starting thresholds, inference) | Effect |
|---|---|---|
| Close | `outIR_365 ≥ 3` and a reply or write within 365 days, DMARC-aligned or a free-mail address you wrote to | Lift lanes; never cleaned; impostor checks keyed on their name |
| Known | You ever wrote to them, or the ledger rule holds (3 or more messages over 30 or more days with stable aligned infrastructure), or a user override | Protected from cleanup; Screener auto-pass |
| Familiar machine | Machine kind with 3 or more messages over 30 or more days and a stable infrastructure set | Kind lane; read-rate decides cleanup |
| New | Under 7 days of history, or first seen | Let through; weak first-contact note only |
| Unknown address at a Known org | New address, same authenticated org, not free mail | Starts at the org's prior (fixes A7) |

`mattersScore` is a logistic function of these features plus Gmail IMPORTANT and Outlook Focused rates. It ships with global weights that reproduce today's rule behaviour, so v1 introduces no regressions. Reason codes are the top contributions mapped to text with real numbers, at most four. Example: "You've written to Lisa 14 times. Last reply 3 days ago." **[inference]**.

### Rank 5. Important strip

Three lanes sit above the inbox. Each item carries one reason. The default cap is 5 items, and the user can set 1 to 10, as in Spark. Nothing is moved out of the inbox **[inference]**.

| Lane | Rule (starting thresholds, inference) | Precedent |
|---|---|---|
| Unanswered from people | Close or Known sender; you in To with 5 or fewer recipients; no List headers; no later SENT message in the thread; 1 to 14 days old | Gmail reply nudge |
| Waiting on reply | Your sent message to a Close person; no reply in the thread after 3 days | Gmail follow-up nudge |
| Due soon | Record kind (bill, school, travel, delivery) plus a due-date pattern or a delivery-today shape in the subject, within 3 days, from any category | Apple time-sensitive override; Gmail package pinning |

Each item offers "Always important" and "Not important" per sender. For service senders the correction is scoped to sender plus template, as SaneBox does. This lane needs threadId and In-Reply-To from rank 1. Touch point: a new dashboard surface reading `senderProfile` and `messageIndex`. The kind and due-date rules already in the records code feed the Due soon lane.

### Rank 6. Impostor checks

| Check | Fires when (header-only) | Suppressed when | Weight |
|---|---|---|---|
| Brand from free mail (A5) | Display name matches a brand exactly, via confusables, or within 1 edit, and the root domain is not on the brand's corporate list with DMARC pass. outlook.com, hotmail.com, live.com, gmail.com, googlemail.com, icloud.com, me.com and mac.com count as free mail even for that brand | Corporate root with DMARC pass | Decisive |
| Explicit DMARC fail on a brand claim | Outlook `compauth=fail reason=000`, or Gmail `dmarc=fail` under a reject or quarantine policy | none | Decisive |
| Lookalike of a correspondent domain | Second-level domain longer than 3 characters, 1 edit from a domain you have written to. On a reply thread, 1 to 2 edits and first seen under 3 days ago | The domain is itself Known | Decisive |
| Fake thread | RE: or FW: subject with empty References or In-Reply-To, from an unsolicited sender | List, calendar or bounce mail | Strong |
| Reply-To mismatch | Free-mail Reply-To on a non-free From, or a different free mail on a free From, or a Reply-To you never wrote to with a different root | Gmail `+caf_=` forwarding, List-Unsubscribe plus "via", known services (LinkedIn, Salesforce) | Strong |
| Identity change on a Known sender | New DKIM d=, Reply-To or Return-Path root (existing ledger rule: promote only after re-observation 7 or more days later) | Re-observed and promoted | Strong |
| Contact name, new address (A4) | Normalised name of 2 or more tokens equals a Close or Known contact's name; this name and address never seen together; you never wrote to the address | Same root as the contact's known address; In-Reply-To resolves to your sent mail; the name is the mailbox owner's own; list headers present; under 30 days of profile history | Weak, never decisive |
| First contact | New tier, or Outlook `SFTY:9.25` | Mailbox under 7 days of history | Weak |
| Implicit auth fail | `compauth=fail reason=001`, `?` or "via" conditions | none | Weak |

**Combining rule.** Keep Cluster's existing hold rule: score of 6 or more AND (two signal kinds OR one decisive). Add one more condition: a contact-name hit can only count toward a hold alongside a second kind. Allowed second kinds are payment, gift-card or urgency words in the subject, a risky attachment, auth failure at enforcement, a Reply-To mismatch, or free mail when the contact normally uses a company domain. This copies the BEC-Guard gate **[inference from verified]**. Name normalisation follows BEC-Guard: lowercase, NFKC, TR39 confusables, drop middle initials, reverse "Last, First", strip suffixes and embedded addresses, and a nickname table. Touch points: `src/lib/threatSignals.ts:41` (new kinds), `src/lib/verdict.ts:57-58,149-153` (the `knownCorrespondent` drop must keep identity-change and contact-name signals), `data/brandDomains.json` (add corporate roots per brand), and the three A5 known-bug tests in `algorithmAudit.test.ts`.

### Rank 7. Sender kind table

Stage one applies hard rules. A message is human when In-Reply-To resolves to your sent mail, or when it is a reply with no bulk headers. A small curated top-sender map assigns known kinds. Stage two keeps a per-canonized-sender (or per-`List-Id`) vote table. The machine evidence ladder runs, strongest first: List-Unsubscribe-Post, List-Id, Feedback-ID, Precedence bulk or list, Auto-Submitted not "no", an ESP DKIM d= or Return-Path, local-part tokens (noreply, orders, billing, news), Gmail categories, and Outlook BCL of 1 or more. Stage three runs per-message subject rules only when a sender is new or "mixed" (votes split). A template key of canonized sender plus a masked subject lets one correction cover a whole template. That separates Amazon shipping notices from Amazon promotions **[inference from Grbovic and Wendt, verified]**. Measure precision per canonized sender. Touch point: the kind assignment and `looksAutomated` in `src/lib/senderModel.ts:120-185`. The ESP domain list is unsourced and needs building **[inference]**.

### Rank 8. Corrections and learning

Overrides are permanent until the user removes them. Labels are weighted by reliability: explicit "Not right?" or release 3, undo 2, reply or star 1.5, move 1, read 0.3. Use online logistic SGD with L2 toward zero. A per-user offset `b_user` moves on "more" and "less" nudges, following Priority Inbox's threshold gain. Cap each sender's influence at 5 examples a week. Draw 1 in 20 suggestions from just below the threshold to catch false negatives. Ask at most 3 questions a day, and never about a security hold. Action bands on calibrated probability: 0.9 or above may act (still reversible), 0.7 to 0.9 suggests, below 0.7 never acts. Refit Platt scaling per user once a probability bin has 20 or more labels and drifts by more than 0.15. Expect user weights to beat global ones only after about 50 to 100 labels per decision **[all inference]**. A security correction changes the infrastructure set or a person link only after a second confirmation or re-observation 7 days later. Touch points: `src/lib/engagementModel.ts:10-110` (replace the EMA with Beta counts), and the feedback calls at `dashboard.ts:1524,1778,2723`, `recentTab.ts:97-99` and `subscriptionsTab.ts:90-91`.

### Rank 9. Unsubscribe verification

At unsubscribe time, record the canonized sender, List-Id, Feedback-ID SenderId, method and timestamp. Rank the method: an RFC 8058 POST with DKIM aligned to From is high, mailto is medium, and a web link is low. After a 3-day grace period, any new match marks the request "ignored" and offers a block or auto-trash filter. Track success per DKIM d= or ESP locally to rank future confidence **[inference]**.

### Rank 10. Warning UX

On held mail, disable links and use an on-hover reveal of the real URL, since that format had the best click-through in testing. Attach contact-impersonation notes to the Reply button. Show one interruptive warning per sender or thread, with one icon per reason type. Copy names the mismatch and gives one safe action. Example: "Uses Lisa's name, but not an address Lisa has written from. If it's about money, check with her another way." Weak signals appear as a quiet note and never interrupt. Never show a positive "trusted" badge from familiarity alone, given Apple's failure **[inference]**. The Prompt API may rewrite reason codes into one sentence, but it can never be load-bearing. It is desktop-only and hardware-gated **[verified]** ([prompt-api](https://github.com/webmachinelearning/prompt-api/blob/main/README.md)).

## Phased plan

| Phase | Scope | Exit check |
|---|---|---|
| 0. Measure and quick fixes (1 to 2 weeks) | Local mailbox census (count-only). Brand-from-free-mail fix (A5). Pass protection context to engagement. Outlook `size` and `from` fix after a live check. Rank 1 header and label capture. Local counters | A5 known-bug tests pass. Census numbers recorded. Outlook metadata call verified live |
| 1. Profile and Sent (2 to 3 weeks) | IndexedDB stores, `senderProfile` API, migration from the four stores, Sent backfill, label ID seeds | Protection, verdict and Screener read one source. "Same inbox scores differently" test passes for sent-derived tiers |
| 2. Received history and score (3 to 4 weeks) | Throttled received backfill, `history.list` and Graph delta sync, accumulators, tiers, `mattersScore` in shadow mode | Shadow disagreements logged for 2 weeks. Replay harness picks half-lives and weights |
| 3. Lift and impostors (3 weeks) | Important strip (three lanes, cap 5). Contact-name gate, fake thread, Reply-To solicited, correspondent lookalike | Strip acted-on share above inbox baseline. Hold rate within budget (below) |
| 4. Kinds, unsubscribe, learning (3 to 4 weeks) | Sender kind table and template key, unsubscribe verification, overrides, per-user offset, calibration | Per-sender kind precision floors met. Undo rate per reason code stable or falling |
| 5. Warning placement | Link deactivation with reveal, Reply-button note, polymorphic icons | No rise in release-after-hold rate; one warning per thread enforced |

## How to measure progress locally

| Metric | Where computed | Target or use (inference) |
|---|---|---|
| Census: share of mail from people versus machines; share of correspondents missing from the 150-message sent list; IMPORTANT agreement with stars and replies; how often a known name arrives from a new address | One-time local script or a Settings panel, counts only | Sizes A1, A2 and the contact-gate threshold. Ho's 52% says expect it to be high |
| Score stability | Re-score the same mailbox after more history | The A3 test passes. Tier changes come only from new events |
| Strip quality | Share of lifted items opened, replied or starred within 3 days, against the same share for ordinary inbox mail | Lifted mail acted on clearly more often; "Not important" rate falling |
| Holds | Holds per month; release rate; release-after-reading rate | Fewer than 1 false hold per month on the owner's mailbox; BEC-Guard's gated rate implies near zero |
| Notes | Weak-signal notes per week | A small handful, so they stay noticed |
| Corrections | Undo and "Not right?" rate per reason code and per decision | A rising rate on one code is the drift alarm |
| Calibration | Labels per 0.1 probability bin | Refit when a bin of 20 or more drifts by more than 0.15 |
| Kinds | Precision per canonized sender on corrected senders | Per-class floors in the existing vitest corpus |
| Offline | Enron or Avocado time-split replay: AUC for "replied within 7 days" against raw count, recency only, and current rules | Choose λ, ω_out and To or Cc weights; expect AUC near 0.68 to 0.71 |
| Shadow mode | New against old decisions side by side for N days | Promote only if the user's later actions side with the new model |

All of this lives in `chrome.storage.local` as counts. An optional "copy anonymised counts" button lets the owner paste them into a GitHub issue. No server is involved **[inference]**.

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| 80M units a day project ceiling | One shared OAuth client. About 10 users backfilling flat out could hit it | Default depth cap, slow pacing, stop on 403 or 429, Sent first |
| Restricted-scope review | A full-history header backfill may read differently to Google's Limited Use or CASA review than today's sampled scan | Owner checks before the public listing. Keep everything on the device and say so |
| Outlook `size` select | May break every Outlook metadata call today | Live test in phase 0 |
| Name collisions in families | Two people with the same name, or relatives sharing names, fire the contact gate | 2-token rule, same-root suppression, never decisive alone |
| Poisoning by patient attackers | Hundreds of benign mails can "legitimise" an address (BEC-Guard's stated limit) | Trust only from your outgoing mail and aligned auth; influence caps; dormant re-check |
| Compromised real accounts | Prior communication suppresses impersonation checks, as in Defender | Identity-change ledger on Known senders; thread-integrity checks |
| Leaning on Gmail IMPORTANT | Opaque and binary, and it already includes Google's social model | Use it as one feature with a rate, never as a gate |
| Habituation | False alarms train people to ignore real ones | Warning budget, quiet notes, one warning per thread |
| Selection bias | The model only sees outcomes on mail it surfaced | 1-in-20 exploration and shadow mode |
| Service worker kills | Backfill dies mid-page | Checkpoint per page; 4-minute ticks |
| Gemini AI Inbox closes the gap | Google could reach Cluster's users with a server-side version | Cluster's edge is free, local, header-only and explained. Ship the strip early |
| `/me/people` in maintenance mode | Microsoft may retire the cheap Outlook seed | Treat it as optional; Sent backfill is the real seed |
| Yahoo | No browser-only path | Out of scope unless the owner accepts a native helper |

## Open questions

| Question | Needs | Why |
|---|---|---|
| Does the Outlook `$select=size` call fail at runtime? | Live test | It may break every Outlook scan today |
| Do consumer Outlook.com messages carry `SFTY:9.25`, `compauth`, BCL and "Unverified"? | Live test of a consumer header | Decides whether Outlook verdicts can be borrowed for free |
| Can `internetMessageHeaders` be selected on Graph list or delta calls, or only on single GET? | Live test | Sets the Outlook header backfill cost |
| Does consumer Gmail warn on a contact's name from a new address? | Live test from a fresh Gmail account | Sizes the A4 urgency |
| Is snippet returned under `format=metadata`? | Live test | It is body text. If it is returned, make sure it is never stored |
| Was the Cloud project created before 1 May 2026, and does billing apply past 80M a day? | Owner checks the Cloud console | Sets the backfill depth cap |
| Default backfill depth: 2 years or 20k messages, or full history opt-in? | Owner decision | Trades coverage against quota and review risk |
| Add `contacts.other.readonly` (Gmail) or `People.Read` (Outlook)? | Owner decision | Display names and cheap seeds against an extra consent prompt |
| Is `/me/inferenceClassification/overrides` reachable with the current Mail.ReadWrite grant? | Live test | The cheapest user-written "matters" signal on Outlook |
| Strip default size and where it lives (dashboard only, or inside Gmail and Outlook) | Owner decision | Product surface and copy |
| Is Yahoo in scope with a native helper? | Owner decision | The only path that keeps mail off a server |
| Owner's mailbox shape: Sent count, thread depth, IMPORTANT rate | Local census | Sets the real backfill time and thresholds |

## Conclusion

The research changes the order of work more than its content. The earlier plan listed a merged profile and wider coverage as two of seven fixes. The new evidence shows they are the product. Every measured success in this field, from Interactions Rank to Yahoo's sender table to BEC-Guard, is a long-memory per-sender table, with the clever part layered on top. Cluster's distinct opening is narrower than "smart inbox" and more defensible. No consumer provider checks whether a message is really from the person you think it is, and Gemini's paid, content-reading AI Inbox has not made lifting free or explainable. A header-only, local system can do both, provided it is built on what you send and not on what arrives.

Two constraints should shape every later design call. The Gmail project ceiling, not the per-user limit, now decides how much history Cluster can afford, so Sent mail and recent mail must carry most of the value. And because people obey most false warnings, every new impostor signal has to arrive with its suppressions and its second-signal rule already attached. The cheapest progress is in rank 1. Cluster already pays for most of these headers and throws them away.
