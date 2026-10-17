# Bulk sorting, kind classification, unknown-sender screening and noise reduction (input for Cluster)

Researched 2026-10-16. Scope: how providers and products separate people from machine mail, sort bulk into kinds, screen unknown senders, and reduce noise, with emphasis on what a header-only, on-device tool can copy. Builds on (does not re-derive) `research/2026-10-11-how-cluster-solves-it.md` and `research/2026-10-05-algorithm-audit-and-upgrades.md`. Facts already in those notes (Priority Inbox numbers, Boykin whitelist 44/54/47%, Gamzu ">90% machine, 95% self-subscribed", Grbovic "70% never make a folder", Defender first-contact tip, Superhuman Auto Labels, HEY 90-day screen-in, Gmail drag-to-teach, RETVec) are only referenced, not repeated.

Labels: "verified" claims carry an inline link; "(Inference)" marks my reasoning. Dates given where the fact is older than 2025.

## 1. Gmail tabs/categories, 2025-2026 changes, and Gmail/Yahoo bulk-sender rules

### Takeaway
Gmail's five tabs are defined by kind (people, social, promotions, automated updates, mailing lists) and learn from per-user drag corrections; 2025 added a sender-grouped "Manage subscriptions" page, a "Purchases" view and a relevance-ranked Promotions tab. The Feb 2024 Gmail/Yahoo rules make RFC 8058 one-click unsubscribe mandatory for 5,000+/day senders and set a 48-hour (Gmail) / 2-day (Yahoo) honour window, so a one-click POST to a big sender is now the most reliable unsubscribe path, but small senders are not bound.

### Cited Findings
- Official tab definitions: Primary = "Emails from people you know and messages that don't appear in other tabs"; Social = "Messages from social networks and media-sharing sites"; Promotions = "Deals, offers, and other promotional emails"; Updates = "Automated confirmations, notifications, statements, and reminders that may not need immediate attention"; Forums = "Messages from online groups, discussion boards, and mailing lists". Dragging a message to another tab "helps Gmail learn your preferences." — [Gmail Help 3094499](https://support.google.com/mail/answer/3094499)
- Gmail does not publish the classifier's signals for tabs (no source found). Note Primary is the residual ("messages that don't appear in other tabs"), i.e. people-mail is the default, machine kinds must be positively detected. — [Gmail Help 3094499](https://support.google.com/mail/answer/3094499)
- **Manage subscriptions** (announced 2025-07-08): a nav-bar page listing active subscriptions by sender with the count of emails sent in recent weeks, ordered most-frequent first; one click makes Gmail send the unsubscribe request on the user's behalf; rolling out on web, Android, iOS in select countries. — [Google blog](https://blog.google/products/gmail/new-manage-subscriptions-unsubscribe/), [Workspace Updates 2025-07](https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html)
- Google's Workspace post adds that it "can take senders a few days to stop sending messages." — [Workspace Updates](https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html) (via search summary)
- Android first appeared April 2025; 9to5Google found one-click generally worked, but some attempts opened a browser window (i.e. fell back to a web unsubscribe page when no RFC 8058 header). — [9to5Google 2025-04-22](https://9to5google.com/2025/04/22/gmail-manage-subscriptions-page-android-unsubscribe/)
- **Purchases view + "most relevant" Promotions** (2025-09-11): Purchases collects purchase and shipping mail in one list; packages arriving within 24 hours still pin to the top of the inbox; Promotions can be sorted "most relevant" (senders/brands that matter most to you, plus nudges for upcoming deals) or "most recent"; personal accounts. Ranking signals undisclosed. I found no source tying these views to Gemini. — [GSMArena](https://m.gsmarena.com/gmail_gets_a_new_purchases_view_and_a_more_relevant_promotions_tab-news-69466.php), [Android Authority](https://www.androidauthority.com/gmail-purchases-tab-and-promotions-sorting-3596995), [Tom's Guide](https://www.tomsguide.com/ai/gmail-finally-fixed-its-most-annoying-problem-for-shoppers-heres-the-new-feature-youll-want-to-try)
- **Gmail bulk-sender rules** (from 2024-02-01, 5,000+ messages/day to Gmail): SPF and DKIM, DMARC (p=none allowed) with alignment; "Marketing messages and subscribed messages must support one-click unsubscribe" with both `List-Unsubscribe-Post: List-Unsubscribe=One-Click` and a `List-Unsubscribe` URL, plus "a clearly visible unsubscribe link" in the body; keep Postmaster spam rate below 0.10% and never reach 0.30%. — [Google sender guidelines 81126](https://support.google.com/a/answer/81126)
- Gmail FAQ: "Unsubscribe requests aren't honoured within 48 hours" is listed as a non-compliance whose consequence is "Delivery support or mitigations unavailable" (not automatic rejection). Gmail began "ramping up its enforcement" with "temporary and permanent rejections" for non-compliant traffic (November 2025). — [Gmail sender FAQ 14229414](https://support.google.com/mail/answer/14229414) (via search summary); secondary: [Red Sift 2025-11-14](https://redsift.com/guides/blog_gmails-enforcement-ramps-up-what-bulk-senders-need-to-know) (spam rate >0.3% loses mitigation until 7 consecutive days below)
- Postmaster Tools has an "Honor Unsubscribe" compliance status that flags senders whose recipients keep getting mail after unsubscribing. — [Suped](https://www.suped.com/knowledge/email-deliverability/sender-reputation/why-does-googles-honor-unsubscribe-status-show-needs-work-for-email-senders) (secondary)
- **Yahoo rules** (enforcement from February 2024, gradual): SPF & DKIM, DMARC ≥ p=none and passing with alignment; "functioning list-unsubscribe header, which supports one-click unsubscribe for marketing and subscribed messages" (POST per RFC 8058 "highly recommended", mailto acceptable); "Honor unsubscribes within 2 days"; "Keep your spam rate below 0.3%"; active Complaint Feedback Loop for all DKIM domains. — [Yahoo Sender Hub best practices](https://senders.yahooinc.com/best-practices/)
- **Feedback-ID** (Gmail FBL): `Feedback-ID: a:b:c:SenderId`; SenderId required, 5-15 chars, consistent across all mail; a/b/c optional campaign/customer identifiers aggregated separately; avoid per-message values. — [Google Postmaster help 6254652](https://support.google.com/mail/answer/6254652)
- **RFC 8058** (2017): one-click requires `List-Unsubscribe` with an HTTPS URI plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, both covered by a valid DKIM signature; the receiver POSTs that body with no cookies or auth. — [RFC 8058](https://datatracker.ietf.org/doc/html/rfc8058) (RFC text from prior knowledge, not re-fetched this session; Cluster already implements the DKIM-pass check per the 2026-10-05 note)

### Inferences
- Cluster's unsubscribe should tier by mechanism: (1) RFC 8058 POST with DKIM d= aligned to From (bound by 48h/2-day rules if the sender is large) → highest expected success; (2) mailto → medium; (3) body link / browser page only → low, and verify. Show the tier to the user ("This sender supports one-click; it should stop within 2 days").
- The 48h/2-day windows give Cluster a principled verification timer: if mail from the same List-Id / Feedback-ID SenderId / From address arrives more than ~3 days after a one-click POST, mark "ignored unsubscribe" and offer block/auto-trash (as Clean Email and Proton do).
- Gmail's own Manage subscriptions orders by frequency, not by read rate; Cluster can differentiate by ordering by "frequency x unread ratio" (cost to the user), which Gmail does not.
- Presence of `List-Unsubscribe-Post` is itself a strong bulk/ESP signal post-2024, since compliant bulk senders must send it; transactional mail often lacks it. (Inference: the rules apply to "marketing messages and subscribed messages", so transactional exemption is implied.)

### Gaps
- No primary Google source on how tabs are computed (sender vs message level, header features).
- No Google figure on what share of one-click unsubscribes are honoured.
- Specific SMTP rejection codes cited by vendors (421 / 550 5.7.15) not verified against Google docs.
- Gemini-based "deliveries" views: no verified source found.

## 2. Yahoo Mail research on machine-generated mail and Yahoo Views

### Takeaway
Yahoo's production categoriser (Grbovic et al., CIKM 2014) is a three-stage cascade: hard-coded message rules, then a sender-level lookup table, then a heavy message classifier for only ~8% of traffic; sender-level classification wins on cost and sparsity, and address-only features alone reach AUC ~0.90. Template work (Ailon et al. WSDM 2013; Wendt et al. WSDM 2016, Google) shows machine mail is a small number of templates per sender, so labels can be propagated per template with >91% precision.

### Cited Findings (Grbovic, Halawi, Karnin, Maarek, "How Many Folders Do You Really Need?", CIKM 2014; read in full this session from the arXiv PDF)
- Dataset: >500 billion messages over six months from opted-in Yahoo users; categories discovered by LDA over folder names, finalised as one human + five machine categories: **career, shopping, travel, financial, social** (plus "other" machine). — [arXiv 1606.09296](https://arxiv.org/abs/1606.09296)
- Their stated principle: "given the difference in syntax and semantics between human- and machine-generated messages, one should first distinguish between machine and human-generated messages." — [arXiv 1606.09296](https://arxiv.org/abs/1606.09296)
- **Aggregation levels compared**: message-level 1.4T examples (avg 6.31 features), sender-level raw 2.6B (26.86), sender-level filtered 339M (29.22), domain-level 75.8M (34.61). Sender aggregation gives the big scalability win; domain aggregation suffers "multiple businesses loss" (Table 3 examples: target.com has orders@ shopping, target.jobs@ career, target.payroll@ financial, name.lastname@ human; vailresorts.com store@/careers@/booking@/payroll@ all differ). — [arXiv 1606.09296](https://arxiv.org/abs/1606.09296)
- Sender-level failure mode named **"machine-human mix"**: a recruiter/broker/travel agent sends machine mail "in 90% of the cases, and personal messages otherwise". Multiple-businesses loss at sender level "is quite low" because companies "typically use different addresses for each type". — [arXiv 1606.09296](https://arxiv.org/abs/1606.09296)
- **Cascade**: (1) lightweight message-level hard rules: top-100 category-consistent senders, and "we categorized all reply/forward messages as human"; this stage "covers 32% of the email traffic"; (2) sender lookup table built offline (one-vs-all logistic regression per category, sender enters the table only if confidence is high); (3) heavy message classifier for senders missing from the table (new/sparse or low-confidence, i.e. likely "mixed"), "roughly 8%" of traffic. — [arXiv 1606.09296](https://arxiv.org/abs/1606.09296)
- **Address features** (header-only): local-part tokens ("subname", e.g. billing, noreply), domain tokens split on ".", a list of >500 commercial keywords matched inside the address (itinerary, flight, ticket, order, confirmation, billing, payslip, payment…), random strings canonicalised to a "random string" feature; very frequent substrings like yahoo.com/gmail.com removed to avoid overfitting. — [arXiv 1606.09296](https://arxiv.org/abs/1606.09296)
- **Behavioural features**: sender outbound volume, recipients-per-message histogram, share of "re:"/"FW:" subjects, read/delete/reply/forward/spam rates, folder-move names (treated as human labels), and **burst features** (sent more than 10/60/80/100/120 messages in an hour). — [arXiv 1606.09296](https://arxiv.org/abs/1606.09296)
- **AUC by feature subset (Table 8)**, avg over shopping/financial/travel/career/social/human: all features 0.973; content only 0.964; **address only 0.897** (human 0.948); behavioural only 0.716 (but **human 0.982**); no body 0.971. "Behavioral features showed good performance in distinguishing between human and machine senders, but could not on their own discriminate between different machine categories." — [arXiv 1606.09296](https://arxiv.org/abs/1606.09296)
- Human-vs-machine heuristics used for labels: reserved words "mailer-daemon or no-reply", repeated "unsubscribe" in headers, spam votes; humans via `<first name>.<lastname>` address patterns. "Unsubscribe" in body strongly machine; common first names in the address strongly human. Domain alone insufficient: machine mail comes from gmail.com/hotmail.com/yahoo.com, and amazon.com/ibm.com carry personal employee mail. — [arXiv 1606.09296](https://arxiv.org/abs/1606.09296)
- Evaluation weighted per **canonized sender** (a regex like `update+.*@facebookmail.com` or `.*noreply@xyz.com` treated as one sender), because per-message evaluation lets a "Facebook = social" rule look good. Precision and recall "in the 0.9 range"; at 0.5% FPR, >85% of true positives covered. Stopwords removed "for several common languages"; top feature list includes German/French/Portuguese tokens (bestellung, commande, versandt-type words), i.e. the model learned multilingual vocab from data rather than regexes. — [arXiv 1606.09296](https://arxiv.org/abs/1606.09296)
- Labels for training came largely from **folder voting** (users' moves vote for a sender's label; vote threshold 50, ≥2 folders). — [arXiv 1606.09296](https://arxiv.org/abs/1606.09296)
- **Ailon, Karnin, Liberty, Maarek, "Threading machine generated email", WSDM 2013**: machine mail estimated >60% of traffic; pipeline groups messages by template, builds a causal graph between templates (e.g. order confirmation → shipped), learns a causal predictor, threads the stream; 12.5M opted-in Yahoo inboxes; >70% of causal threads found at 90% precision. — [Unpaywall/ACM 10.1145/2433396.2433447](https://unpaywall.org/10.1145%2F2433396.2433447) (abstract via search summary)
- **Wendt et al. (Google), "Hierarchical Label Propagation and Discovery for Machine Generated Email", WSDM 2016**: machine mail = instances of structural templates; labels propagate over a template graph then down to documents; template graph far more compact than document graph; precision >91%, recall >93%, label coverage +11% over a document classifier. — [Google Research](https://research.google/pubs/hierarchical-label-propagation-and-discovery-for-machine-generated-email/)
- WWW 2015 companion (Yahoo): predicting which machine templates a user will receive using template causality over several million opted-in inboxes. — [IW3C2 p1327](https://archives.iw3c2.org/www2015/documents/proceedings/companion/p1327.pdf) (via search summary)
- Yahoo patent US8239387B2 "Structural clustering and template identification for electronic documents". — [Google Patents](https://patents.google.com/patent/US8239387)
- **Yahoo Mail Views**: 2019 app added Views (Deals, Travel, Attachments, packages), one-tap unsubscribe and a subscriptions view; 2022 added a Receipts View and free-trial reminders. — [Yahoo press 2019-09-23](https://unified.www.yahooinc.com/press/yahoo-mail-reimagines-the-inbox-of-the-future), [Yahoo press 2022-10-03](https://www.yahooinc.com/press/yahoo-mail-makes-saving-time-and-money-easier-than-ever-with-new-commerce-features)

### Inferences
- The Yahoo cascade maps almost exactly onto Cluster's constraints: Stage 1 = Cluster's hard rules (Re:/Fwd: or In-Reply-To referencing a sent Message-ID ⇒ human; a small curated top-sender map); Stage 2 = a **per-sender kind table** on-device (accumulated over all scans, not per message), so one subject keyword can no longer flip a sender's kind; Stage 3 = per-message subject rules only when the sender is new or "mixed". This directly fixes the "one keyword flips a message's kind" weakness.
- Key the sender table on **canonized sender** (address with digits/random tokens collapsed, plus-tags stripped) and on `List-Id` when present, not on the bare domain (Target/Vail examples show domain-level is wrong).
- Address-only AUC ~0.90 means header features (local-part tokens like noreply/billing/orders/news, keyword-in-address, subdomains such as `email.`/`e.`/`mail.`/`news.`) can carry most of the kind signal without subjects, and are language-independent. The paper's top features include `sendersubname_info`, `sendersubname_newsletter`, `senderkeyword_order`, `sendersubdomain_e`, `sendersubdomain_members`.
- A cheap template ID for header-only use: sender + subject with digits, prices, names and dates masked ("Your order #<N> has shipped"). Labels assigned to a template (by user correction or a confident rule) propagate to every message with that template, the Wendt idea at tiny scale. (Inference.)
- Precision should be measured per canonized sender, not per message, or the top few senders will hide errors (Grbovic's evaluation lesson).

### Gaps
- "Mail-X-Ray" name: no source found; could not confirm it is a Yahoo system.
- Di Castro et al. ("You've got mail, and here is what you could do with it", WSDM 2016) and the "Hebrew / 90% machine" finding: not retrieved this session.
- Full texts of Ailon 2013 and Wendt 2016 not read; numbers from abstracts.

## 3. Outlook: Focused/Other, Sweep, rules, categories, BCL

### Takeaway
Focused Inbox is a relationship model ("emails and contacts with whom you interact") that filters "automatically generated or bulk email", with per-sender "Always move" overrides. Microsoft's BCL (0-9) is a sender-reputation complaint score, not a content score, and as of July 2026 bulk promotional mail gets a Promotions tag and optional Promotions folder that learns from moves.

### Cited Findings
- Focused Inbox "takes into account emails and contacts with whom you interact" and "filters out noisy sources like automatically generated or bulk email"; corrections per message (Move to Focused/Other) or per sender ("Always move"); "overrides to make sure emails from certain senders always show up in a particular destination"; not for shared mailboxes. — [Microsoft Support](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978)
- **BCL**: assigned to inbound mail from bulk senders and stamped in an X-header; "Microsoft uses both internal and external sources to identify bulk mail and determine the appropriate BCL value." 0 = not bulk; 1-3 = bulk sender with few complaints; 4-7 = mixed complaints; 8-9 = high complaints. Default threshold 7 (Standard preset 6, Strict 5); at/over threshold → Junk (Strict → quarantine). — [Microsoft Learn, BCL (updated 2026-10-14)](https://learn.microsoft.com/en-us/defender-office-365/anti-spam-bulk-complaint-level-bcl-about)
- **Promotions tag/folder** (2026): "As of July 2026, all messages identified as bulk that are promotional in nature (regardless of BCL value) automatically receive the Promotions tag"; with "Bulk moves enabled", bulk below the BCL threshold goes to a Promotions folder; "The system learns from user activity in the Promotions folder (moving messages in or out), and remembers the action for future messages"; allow-listed senders and accepted domains bypass; Promotions tag is an Inbox-rule condition in new Outlook/OWA. — [Microsoft Learn, BCL](https://learn.microsoft.com/en-us/defender-office-365/anti-spam-bulk-complaint-level-bcl-about)
- BCL appears to readers in `X-Microsoft-Antispam: BCL:<n>` (and the earlier note documents `X-Forefront-Antispam-Report` `SFTY`/`CAT:` values). — [Microsoft anti-spam message headers](https://learn.microsoft.com/en-us/defender-office-365/message-headers-eop-mdo) (cited in the 2026-10-05 note; header name from that page)
- **Sweep** (Outlook web): per-sender bulk action: move/delete all from the inbox, all plus future messages, keep only the latest, or messages older than 10 days; default destination Deleted Items; Sweep rules run once every 24 hours. — [How-To Geek](https://www.howtogeek.com/662263/use-the-built-in-sweep-feature-in-outlook-online-to-clear-unwanted-emails/), [WiseStamp](https://www.wisestamp.com/?p=38104) (secondary; "keep latest" only in WiseStamp)

### Inferences
- On Outlook, Cluster can read BCL from headers it already fetches: BCL ≥ 1 is a provider-computed "bulk" bit (like Gmail's CATEGORY_PROMOTIONS label), and BCL 8-9 is a provider-computed "people complain about this sender" signal Cluster can use to rank clean-up suggestions. This is free sender reputation without a server.
- Sweep's four verbs (all, all+future, keep latest, older than N days) are the proven minimal per-sender action set; Cluster's "keep newest" already matches; "older than N days" per sender is a cheap addition.
- Microsoft's "learns from moves in/out of Promotions" is the same correction-driven design as Gmail drag and Spark/Apple per-sender recategorise; every product learns per sender from moves.

### Gaps
- Microsoft does not publish the BCL computation beyond "internal and external sources" and complaints.
- No official Microsoft doc for Sweep found this session; Outlook "categories" (colour labels) not researched further.

## 4. Apple Mail categories (iOS 18.2+)

### Takeaway
Apple sorts into Primary, Transactions, Updates, Promotions on-device, with time-sensitive mail also surfaced in Primary and per-sender recategorisation by the user; the criteria are not disclosed.

### Cited Findings
- Four categories plus an All Mail view; categorisation "is done on-device"; Apple doesn't disclose criteria; Apple Intelligence plays a role and it adapts to recipient behaviour; recipients can recategorise senders, "senders cannot"; iOS 18.2+, Mac in macOS 15.4, not iPad (at time of writing). — [Direct Mail blog](https://directmailmac.com/blog/?p=1988)
- Mapping: receipts/order confirmations → Transactions; newsletters and social notifications → Updates; ads/marketing → Promotions; Primary = personal and time-sensitive. — [9to5Mac](https://9to5mac.com/mail-app-ios-18/), [e-shot](https://www.e-shot.net/insights/blog/apple-mail-ios18) (secondary)
- Apple Support page lists the categories and that time-sensitive items also show in Primary (cited in the 2026-10-05 note; page body not reached). — [Apple Support](https://support.apple.com/guide/iphone/use-categories-iphfe4a36baf/ios)

### Inferences
- Apple is the closest analogue to Cluster (on-device, no server reading mail); its correction granularity is the sender, which supports a per-sender kind table.
- Apple merges newsletters with social notifications (Updates) and keeps Transactions separate, which matches Cluster protecting receipts/shipping. Apple's "time-sensitive also in Primary" is an override lane worth copying for OTPs/deliveries-today.

### Gaps
- No technical description of Apple's classifier signals (headers vs content) found.

## 5. Products: HEY, Superhuman, Shortwave, Spark, SaneBox, Clean Email, Unroll.me, Leave Me Alone, Proton, Fastmail, Tuta, Edison

### Takeaway
Every successful consumer product routes **per sender** with a one-time human decision (HEY Screener, Spark Gatekeeper, Clean Email Screener) or per-sender learned folders (SaneBox), and handles non-compliant senders with block/auto-trash rather than trusting unsubscribe. The cautionary tale is Unroll.me, which monetised inbox receipts.

### Cited Findings
- **HEY**: Screener ("The first time someone emails you, you get to decide if you want to hear from them again"); Imbox for "important, immediate emails"; The Feed shows newsletters "already open — with the newest at the top"; Paper Trail for receipts/confirmations; Bundles collapse a frequent sender into "a single row"; push notifications "off by default", enabled per contact/thread; Reply Later and Set Aside piles. — [HEY features](https://www.hey.com/features/)
- **Spark**: Smart Inbox splits Personal / Notifications / Newsletters; changing a sender's category makes "all future emails from this sender" follow it; Gatekeeper shows new senders as cards to accept or block. — [Spark Smart Inbox](https://www.sparkmailapp.com/features/smart_inbox), [Readdle support](https://support.readdle.com/spark/personalization/customize-your-smart-inbox)
- **Shortwave**: Smart Labels = auto-apply rules based on senders; Gmail filters carry over. Bundles not verified this session. — [Shortwave migration doc](https://www.shortwave.com/docs/migrations/migrating-from-spark-mail/)
- **SaneBox**: analyses headers (sender, subject etc.), not bodies; SaneLater for less important, SaneNews for newsletter-like mail, SaneBlackHole learns "you don't want future emails from that sender"; moving back to Inbox retrains; SaneDigest is a daily summary of the Sane folders. — [SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work), [SaneBox support](https://support.sanebox.com/hc/en-us/articles/203095746-What-is-SaneBox-); training page in the 2026-10-05 note
- **Clean Email**: Unsubscriber offers keep / unsubscribe / Pause / Keep Newest; unsubscribe sends the request and moves new and existing messages to Trash; blocked senders' new mail is trashed on arrival (handles senders who ignore unsubscribes); Screener holds new senders for accept/block with no further auto-cleaning; Auto Clean rules run last after sender settings. — [How Clean Email processes incoming mail](https://clean.email/help/basics/how-clean-email-processes-incoming-mail), [Clean Email auto unsubscribe](https://clean.email/how-to-unsubscribe-from-emails/automatically-unsubscribe-from-emails) (vendor docs)
- **Proton Mail**: six categories, Primary, Social, Promotions, **Newsletters** (non-promotional content you signed up for), Transactions, Updates; on by default for new users. — [Proton blog, categories](https://proton.me/blog/proton-mail-categories). Newsletter View (from 2025-06-25): sort by most/least read, most frequent, recent; after Unsubscribe, offers trash/archive/mark-read of existing mail; blocking is separate for senders that ignore unsubscribe. — [Yahoo Tech](https://tech.yahoo.com/apps/articles/proton-mail-way-clean-inbox-100016440.html), [It's FOSS](https://itsfoss.com/protonmail-gmail-better-newsletter/). Unsubscribe button appears "when the system detects a mailing list". — [Proton support auto-unsubscribe](https://proton.me/support/auto-unsubscribe) (via search summary)
- **Unroll.me**: in April 2017 the NYT reported Uber bought analytics from Unroll.me's parent Slice Intelligence built from users' Lyft receipts; the CEO apologised but said it was disclosed in the user agreement; the FTC settled deception allegations requiring deletion of some consumers' data (2019; exact date conflicts between sources, Aug vs Dec 2019). — [CIO Dive](https://www.ciodive.com/news/unrollme-under-fire-for-selling-user-data-to-uber/441153/), [Gizmodo](https://gizmodo.com/unroll-me-settles-with-ftc-for-rifling-through-its-user-1840496042), [MediaPost](https://www.mediapost.com/publications/article/339092/unrollme-duped-consumers-about-privacy-ftc-says.html). Claim that it still shares anonymised data under NielsenIQ is from competitor Leave Me Alone only. — [Leave Me Alone blog](https://leavemealone.com/blog/unroll-me-data-selling-explained/)

### Inferences
- Six-bucket consensus across Gmail, Apple, Proton, Spark, HEY: people; transactions/paper trail; newsletters (read-worthy, Feed); promotions; notifications/updates; social. Proton's split of Newsletters vs Promotions mirrors HEY Feed vs. junk, and is the split users act on differently (read later vs bulk-delete).
- Screener products gate on **first contact** and decide once per sender; Cluster's Screener should also auto-pass senders with In-Reply-To to mail you sent, and Gmail-IMPORTANT/Outlook-Focused (the 2026-10-05 note found it ignores providerMarkedPersonal).
- "Unsubscribe + block fallback" (Clean Email, Proton) is the industry answer to non-compliance; Cluster's outcome tracking should end in an offered auto-trash filter.
- Cluster's no-server, header-only design is a direct differentiator against the Unroll.me model; worth stating in product copy plainly.

### Gaps
- Superhuman (beyond the 2026-10-05 note), Leave Me Alone, Fastmail Masked Email, Tuta and Edison were not researched in this session for lack of tool budget.

## 6. Sender-level vs message-level, template clustering, header signals, multi-language

### Takeaway
Sender-level wins for most traffic (Yahoo: only ~8% needs message-level), with message-level reserved for new or mixed senders and a hard human override for replies; template clustering lets one label cover every instance. Header signals are language-independent and should carry the kind decision, with English subject regexes demoted to a tie-breaker.

### Cited Findings
- Yahoo cascade and aggregation results (see section 2). — [arXiv 1606.09296](https://arxiv.org/abs/1606.09296)
- Wendt et al.: templates "capture shared topics and filter out noisy personal details", scale better, and propagate properties to all matching documents; >91% precision, >93% recall. — [Google Research](https://research.google/pubs/hierarchical-label-propagation-and-discovery-for-machine-generated-email/)
- A USPTO filing describes clustering message headers so that clusters are "likely to have been produced by the same message template". — [USPTO 10447635](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10447635) (via search summary)
- Header standards: **RFC 2369** defines List-Help/List-Unsubscribe/List-Subscribe/List-Post/List-Owner/List-Archive; **RFC 2919** defines `List-Id` as a stable list identifier; **RFC 3834** defines `Auto-Submitted: auto-generated | auto-replied` (and `no`) for automatic responses. — [RFC 2369](https://datatracker.ietf.org/doc/html/rfc2369), [RFC 2919](https://datatracker.ietf.org/doc/html/rfc2919), [RFC 3834](https://datatracker.ietf.org/doc/html/rfc3834) (RFC content from prior knowledge, not re-fetched)
- Feedback-ID SenderId is constant per sender, campaign IDs vary. — [Google 6254652](https://support.google.com/mail/answer/6254652)
- Yahoo model learned multilingual tokens from data and stripped stopwords "for several common languages"; address features alone AUC 0.897. — [arXiv 1606.09296](https://arxiv.org/abs/1606.09296)

### Inferences (header-only design for Cluster)
- **Bulk/machine evidence ladder** (strongest first): `List-Unsubscribe-Post` present; `List-Id` present (mailing list or ESP); `Feedback-ID` present; `Precedence: bulk|list|junk`; `Auto-Submitted` ≠ no; ESP fingerprint (DKIM `d=` or Return-Path domain of a known ESP such as sendgrid.net, mcsv.net/mailchimp, amazonses.com, sparkpostmail, mailgun, klaviyo, braze, salesforce/exacttarget, hubspot; Return-Path ≠ From domain with VERP-style local part; `X-Mailer` of a campaign tool); local-part tokens (noreply, no-reply, news, info, notifications, orders, billing); provider labels (Gmail CATEGORY_*, Outlook BCL ≥ 1). None of these depend on language. This list of ESP domains is my inference, not sourced.
- **Human evidence ladder**: In-Reply-To / References pointing at a Message-ID you sent; Re:/Fwd: (weak, language-specific prefixes vary: AW:, SV:, RE:, TR:, Rif:); address in sent-To history; first.last@ pattern on free mail; no bulk headers; single recipient.
- **Kind within machine mail**: decide per canonized sender or `List-Id`, using votes accumulated across all messages (majority of subject rule hits + address tokens + curated domain map + user corrections). A single subject keyword only adds one vote; it cannot flip an established sender. Flag a sender "mixed" when votes split (Yahoo's machine-human mix), and only then classify per message.
- **Template key** = canonized sender + masked subject. Same template ⇒ same kind; one correction fixes the whole template. Transactional senders that also send marketing (Amazon) separate cleanly at template level even when they share a From address.
- **Language robustness**: rely on headers and address tokens first; for subjects, a small multilingual keyword set for receipt/shipping/OTP in the top languages, and digit-shape features (6-digit code, order number) that are language-free; detect language per sender, not per message (Chrome Language Detector warns against short text, per the 2026-10-05 note).

### Gaps
- No published measurement found of how well List-Unsubscribe/List-Id/Feedback-ID alone separate transactional vs promotional mail; the owner's own mailbox census would be the source.
- No public list of ESP DKIM/Return-Path domains with coverage figures found.

## 7. Delivery batching / delivery windows

### Takeaway
Evidence for batching is mixed: limiting checks to three times a day lowered stress in a two-week field experiment, but a CHI 2016 sensor study found batching linked to higher self-rated productivity and not to lower stress. Products batch by digest (SaneDigest), default-off notifications (HEY), and per-sender bundling rather than delayed delivery.

### Cited Findings
- Kushlev & Dunn (Computers in Human Behavior 43, 2015): 124 adults, one week limited to three checks a day vs one week unlimited; stress significantly lower in the limited week; participants found it hard to keep. — [Kushlev & Dunn PDF](https://www.interruptions.net/literature/Kushlev-ComputHumBehav15.pdf), [PsyPost](https://www.psypost.org/resist-temptation-check-email-less-reduce-stress-study-finds/)
- Mark, Iqbal, Czerwinski, Johns, Sano (CHI 2016): 40 information workers, 12 workdays, logging + biosensors; more email time → lower productivity and higher stress; self-interrupters rated productivity higher than notification-driven checkers; batching linked to higher productivity at longer email durations but "no evidence" it lowered stress. — [Microsoft Research](https://www.microsoft.com/en-us/research/?p=238239), [PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/06/Email20Duration20Camera20Ready20submission3-1.pdf)
- SaneDigest: daily summary email of mail in Sane folders. — [SaneBox support](https://support.sanebox.com/hc/en-us/articles/203095746-What-is-SaneBox-)
- HEY: notifications off by default, per-contact opt-in; Feed lets newsletters accumulate unread-as-read. — [HEY features](https://www.hey.com/features/)
- Outlook Sweep scheduled rules run once every 24 hours. — [How-To Geek](https://www.howtogeek.com/662263/use-the-built-in-sweep-feature-in-outlook-online-to-clear-unwanted-emails/)

### Inferences
- For Cluster (which can't hold mail before delivery without a server), "delivery windows" = filters that skip the inbox at delivery for machine kinds, plus a scheduled "release" (e.g. add the inbox label back at 8am/5pm via alarms when the browser runs) or simply a daily digest card. Evidence supports reducing notification-driven checks more than strict time windows, so lead with "machine mail never notifies" (skip-inbox) and keep timed release optional.
- Gmail's own "packages arriving within 24h pin to top" is a counter-example: time-sensitive machine mail should escape batching (OTPs, deliveries today).

### Gaps
- Superhuman reminders and Gmail scheduled features as batching: not researched. No study found on digest-style newsletter batching outcomes.

## 8. Unsubscribe that actually works: verification and compliance evidence

### Takeaway
Historic audits found roughly 1 in 5 brands kept mailing after a confirmed unsubscribe, though compliance among large e-commerce brands later reached 98%; since 2024 Gmail/Yahoo bind big senders to 48h/2 days, so the remaining failures concentrate in small or non-compliant senders, which products handle with a block/auto-trash fallback.

### Cited Findings
- Return Path study: about 20% of top brand marketers kept emailing after a confirmed unsubscribe; 11% still emailing more than 10 days later. — [MarketingCharts](https://www.marketingcharts.com/industries/retail-and-e-commerce-6889) (date not shown in summary; older study, likely 2000s-2010s)
- Online Trust Alliance audits: 98% of top e-commerce brands compliant with US/Canadian unsubscribe rules, up from 90% in 2014. — [Internet Society](https://internetsociety.org/?p=96715)
- EEC: about 4% of retailers failed to honour opt-outs or took longer than 10 business days. — [Chief Marketer](https://chiefmarketer.com/retailers-not-capitalizing-on-unsubscribes-eec) (older)
- Gmail 48h and Yahoo 2-day honour rules, Postmaster "Honor Unsubscribe" status (section 1). — [Gmail FAQ](https://support.google.com/mail/answer/14229414), [Yahoo](https://senders.yahooinc.com/best-practices/)
- Gamzu et al. (WSDM 2018, Yahoo): users hardly use unsubscribe although most machine mail is self-subscribed (abstract, cited in the 2026-10-11 note). — [listing](https://ir.webis.de/anthology/2018.wsdm_conference-2018.28) (404 this session; abstract read earlier)
- Clean Email and Proton both pair unsubscribe with trash/block of future mail because some senders ignore requests. — [Clean Email](https://clean.email/help/basics/how-clean-email-processes-incoming-mail), [Yahoo Tech on Proton](https://tech.yahoo.com/apps/articles/proton-mail-way-clean-inbox-100016440.html)

### Inferences
- Verification algorithm Cluster can run locally: record (canonized sender, List-Id, Feedback-ID SenderId, method, timestamp) at unsubscribe; for 3 days treat new mail as "in grace" (48h/2 days + delivery lag); after that, any new message matching List-Id or SenderId or address = "ignored"; offer one-tap block filter. Matching on List-Id/SenderId catches senders that rotate From addresses. Also detect "resubscribed via new list" when a new List-Id appears from the same DKIM d=.
- Prefer the RFC 8058 POST path for large senders; for mailto, the reply is unverifiable but outcome tracking still works; for web-only links, label "may need a confirmation page".
- Store outcome stats per ESP/DKIM d= locally (e.g. "unsubscribes via this platform stopped mail 9/10 times") to rank future unsubscribe confidence without a server.

### Gaps
- No recent (2024-2026) independent measurement of unsubscribe compliance after the Gmail/Yahoo rules was found.
- Return Path study date not confirmed.
