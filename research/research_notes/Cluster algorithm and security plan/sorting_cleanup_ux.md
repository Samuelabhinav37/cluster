# Email Sorting, Classification & Low-Friction Bulk-Cleanup UX (2024-2026)

Scope note: about 20 search/fetch calls. Several primary domains (research.google, static.googleusercontent.com, developer.chrome.com) failed DNS from this sandbox, and the GitHub code-search API was blocked for repos outside the session. Some primary sources (the Priority Inbox paper PDF, the Chrome Prompt API docs, the Inbox Zero source tree) could not be read directly. Where a claim comes only from vendor or competitor marketing, the citation says so.

## Q1. How do the big mailbox providers (Gmail, Outlook, Apple Mail, Yahoo) classify mail, and what signals do they use?

### Takeaway
The big providers combine sender-level grouping with per-user engagement learning (who you reply to, open, ignore) and bulk/automated-mail detection. They expose correction as a per-sender action ("Always move to Focused", "Categorize Sender"). Gmail's "Manage subscriptions" view (July 2025) sets the bar for subscription cleanup: senders sorted by frequency, one-click unsubscribe, no confirmation step. None of them publish current accuracy numbers.

### Cited Findings
**Gmail**
- "Manage subscriptions" view rolled out July 2025: web first, Android from July 15, iOS from July 21. It is available to all Workspace customers, Workspace Individual subscribers and personal accounts — [Google Workspace Updates](https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html); [BetaNews](https://betanews.com/2025/07/09/google-launches-manage-subscriptions-for-gmail/)
- The view lists newsletters/subscriptions from roughly the past few weeks, sorted by frequency, with the frequency shown and an "Unsubscribe" button on each row. Gmail sends the unsubscribe request on the user's behalf, with no further confirmation and no visit to the sender's site — [BetaNews](https://betanews.com/2025/07/09/google-launches-manage-subscriptions-for-gmail/); [Thurrott](https://www.thurrott.com/?p=323112). Menu location is reported inconsistently: nav menu vs. under Inbox — [eastleighvoice summary](https://eastleighvoice.co.ke/google%20assistant/176431/gmail-rolls-out-new-manage-subscriptions-feature-to-help-users-easily-unsubscribe-from-unwanted-emails)
- Priority Inbox (2010) split the inbox into "Important and unread", "Starred" and "Everything else". Signals included the people you email most and which messages you open and reply to. It improves as users mark conversations important/not important with buttons at the top of the inbox — [Official Gmail Blog, Aug 2010](https://gmail.googleblog.com/2010/08/email-overload-try-priority-inbox.html)
- The paper "The Learning Behind Gmail Priority Inbox" (Aberdeen, Pacovsky, Slater) appeared at the NIPS 2010 LCCC workshop. Aberdeen worked on Gmail spam detection and Priority Inbox — [Google Research author page](https://research.google.com/pubs/author39485.html). The full text could not be fetched (see Gaps).

**Outlook**
- Focused Inbox looks at the emails and contacts a person interacts with and filters out noisy sources such as automatically generated or bulk email. It gets better the more it is used — [Bowdoin IT KB](https://bowdoin.teamdynamix.com/TDClient/1814/Portal/KB/Article/119446/What-Is-the-Focused-Inbox-in-Outlook)
- Users correct it per sender with right-click > "Always move to Focused/Other". Placement is per user, and an admin cannot force a sender into Focused across the whole org — [MKUH IT guide](https://mkuh.freshservice.com/support/solutions/articles/26000165824-How-to-Ensure-You-See-Emails-from-a-Specific-Sender-in-your-Focused-Inbox). Bulk/automated mail and new senders often land in Other, which depresses open rates for marketers — [ContactMonkey help](https://help.contactmonkey.com/hc/en-us/articles/42833575063949-Low-Opens-Caused-by-Outlook-Focused-Inbox)
- Sweep is a per-sender rule with four options: move/delete all messages from the sender now; always move/delete all future messages; always keep only the latest message; always move/delete messages older than 10 days. Sweep rules run once per day and can only be created in Outlook on the web and new Outlook for Windows, not classic, Mac or mobile — [WiseStamp](https://www.wisestamp.com/blog/outlook-sweep/); [BetterCloud](https://www.bettercloud.com/monitor/the-academy/how-to-use-sweep-to-clean-up-your-office-365-inbox/); [How-To Geek](https://www.howtogeek.com/662263/use-the-built-in-sweep-feature-in-outlook-online-to-clear-unwanted-emails/). Sources disagree on whether the 10-day option moves or deletes; it is configurable.

**Apple Mail (iOS 18.2+)**
- There are four fixed categories: Primary (personal and time-sensitive), Transactions (receipts, orders), Updates (newsletters, social), Promotions. Custom categories are not allowed. The feature shipped in iOS 18.2, iPhone-only at first, on by default — [Seal Systems](https://sealsystems.net/go/organize-your-mail-with-categories-on-the-iphone/); [MxToolbox](https://blog.mxtoolbox.com/2024/09/13/ios-18-changing-the-email-delivery-game/)
- Classification is described as on-device. Seal Systems says it is not tied to Apple Intelligence — [9to5Mac](https://9to5mac.com/2024/08/18/apple-mail-app-ios-18/); [Seal Systems](https://sealsystems.net/go/organize-your-mail-with-categories-on-the-iphone/)
- Correction is per sender ("Categorize Sender"). Users can switch to List View to turn categories off — [support.com guide](https://www.techsolutions.support.com/how-to/customize-email-settings-on-iphone-smart-categories). Sources disagree on what "Updates" catches and on how Primary is defined (contacts vs. time-sensitive) — [e-shot](https://www.e-shot.net/insights/blog/apple-mail-ios18)

**Yahoo Mail**
- The 2022 redesign added views for Receipts (order receipts in one place), package tracking, gift cards, Subscriptions (with alerts before free trials end) and Travel reservations — [Yahoo press release, Oct 2022](https://www.yahooinc.com/press/yahoo-mail-makes-saving-time-and-money-easier-than-ever-with-new-commerce-features); [Yahoo Postmaster blog](https://blog.postmaster.yahooinc.com/post/699742989830029312/get-stuff-done)
- Secondary coverage reports AI summaries and a Priority inbox that pull out dates, billing info and verification codes, with a US rollout in March 2026 — [macmyths](https://macmyths.com/yahoo-mail-comes-with-ai-genered-email-summaries-for-easier-inbox-task-management/). This is unverified against a primary Yahoo source.

### Inferences
- Every major provider exposes correction **at the sender level, not the message level**: "Always move to Focused", "Categorize Sender", Sweep "always". This is strong evidence that a metadata-only extension should key its model and its UI on sender (address or registrable domain plus List-Id) and treat each correction as a sender-wide rule.
- Gmail's Manage subscriptions view defines the minimum bar: frequency-sorted sender list, one click per sender, no confirmation for unsubscribe. A competing tool needs to beat it on cleaning the backlog (archive/delete existing mail) and on batch selection, not on unsubscribe alone.
- Apple's four fixed categories (Primary/Transactions/Updates/Promotions) suggest a good default taxonomy for an extension. "Transactions" as its own bucket shows that receipts/OTP/shipping must be protected from marketing cleanup.
- Sweep's "keep only the latest" and "older than 10 days" are proven, simple retention presets that suit recurring senders (daily deals, alerts).

### Gaps
- I recall, but could not verify in-session, figures from the Priority Inbox paper: four feature families (social, content, thread, label); a per-user logistic-regression model layered on a global model; a per-user threshold for "important"; reported accuracy around 80% (±5%); users spent about 6% less total time reading mail and about 13% less on unimportant mail. Verify against the PDF before citing.
- Gmail category tabs (Primary/Social/Promotions/Updates/Forums, launched 2013) have no published current accuracy figure, and I did not fetch the help page.
- Google Inbox ("bundles") was discontinued in April 2019 (from training knowledge, not re-verified in-session).
- No provider publishes accuracy for Focused Inbox, Apple categories or Yahoo views.

## Q2. How do third-party tools (SaneBox, Clean Email, Superhuman, HEY, Shortwave, Spark, Leave Me Alone, Unroll.me, Mailstrom, Trimbox, Inbox Zero) group senders and bulk-clean?

### Takeaway
Nearly all of them **group by sender, or by shared unsubscribe link/list, and act on the whole group**. The low-friction designs either (a) screen first-time senders once (HEY Screener, Spark "New senders", Clean Email Screener) or (b) show a sender table sorted by volume with per-row actions (Unsubscribe / Auto-archive / Keep) plus multi-select. SaneBox is the closest analog to a metadata-only approach: it reads headers only (no bodies), learns from the Sent folder and from folder moves, and processes the backlog overnight.

### Cited Findings
**SaneBox (metadata-only)**
- It does not download email bodies; importance is decided from subject and sender alone — [SaneBox help: how SaneBox works](https://sanebox.com/help/155-how-does-sanebox-work); [SaneBox: how trainings are determined](https://www.sanebox.com/help/186-how-does-sanebox-determine-trainings)
- It uses the Sent folder to identify important contacts, whose mail stays in the Inbox. Moving any email between Inbox and @SaneLater trains the algorithm for future mail from that sender. @SaneLater is a real server folder, and a daily digest summarizes it — [SaneBox Gmail getting-started](https://www.sanebox.com/help/143-gmail-getting-started-guide); [SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work)
- On signup it does not immediately move old mail; it processes the backlog overnight (11 PM-5 AM local). If SaneBox goes down, mail still arrives in the Inbox unsorted, so it fails open — [SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work)
- Third-party reviews say it also uses open/reply behavior, including how quickly and how often you respond. This is not confirmed in SaneBox's own docs — [thesweetbits review](https://thesweetbits.com/?p=17671)

**Clean Email**
- Mail is grouped by sender (address plus display name) by default. Grouping can also be by subject, date or size, and an action such as Trash applies to the whole group. The Unsubscriber merges senders that share the same unsubscribe link in headers into one subscription — [Clean Email: First cleaning](https://clean.email/help/basics/getting-started); [Clean Email: differences vs standard clients](https://clean.email/help/basics/differences-between-clean-email-views-and-standard-inboxes)
- Cleaning Suggestions propose actions (archive/trash) for types of mail, accepted or rejected with one click. Any accepted suggestion can be turned into an Auto Clean rule for future mail — [Clean Email: What's new](https://clean.email/help/basics/whats-new-in-clean-email-next)
- Auto Clean: pick a category and an action (Archive, Move, Trash). Users can review how many messages each rule processed and pause, edit or delete it at any time. "Smart Views" were renamed "Smart Folders". The Screener can block unknown senders or allow only people while blocking lists — [Clean Email Auto Clean](https://clean.email/auto-clean); [Clean Email features](https://clean.email/features)

**Superhuman**
- Split Inbox sorts mail into focused sections; Auto Labels tag messages. An Auto Label can be promoted into a Split. Custom labels can match on sender, domain, subject, label or an AI prompt, and there is a prebuilt Auto Label Library — [Superhuman blog](https://blog.superhuman.com/how-sales-teams-can-organize-their-inbox/); [Superhuman blog (CS)](https://blog.superhuman.com/solving-customer-success-email-overload/)
- An April 2025 update added Auto Archive, Auto Labels, Custom Auto Labels, Auto Reminders and Auto Drafts — [AlternativeTo news](https://alternativeto.net/news/2025/4/superhuman-s-new-update-brings-auto-reminders-auto-drafts-auto-labels-and-auto-archive/)

**HEY**
- The first email from a new sender is held in The Screener. The user decides yes or no **once**, and that decision applies to all future mail from the sender. Approved senders go to the Imbox by default and can be routed to The Feed (newsletters, a casual read) or Paper Trail (receipts, transactional) — [HEY: How it works](https://www.hey.com/how-it-works/); [Tools & Toys](https://toolsandtoys.net/hey-a-fresh-take-on-email/)

**Spark (Readdle)**
- Smart Inbox sorts into Personal, Notifications and Newsletters. Users can manually re-mark an email's category when it is misfiled. Smart Inbox 2.0 adds Priority, New senders (a screener), Pinned and other groups — [Spark Smart Inbox](https://sparkmailapp.com/features/smart_inbox); [Spark help: customize Smart Inbox](https://readdle.helpjuice.com/customize-your-smart-inbox). Gatekeeper's mechanics were not found in sources (see Gaps).

**Inbox Zero (open source, elie222/inbox-zero)**
- Features: Bulk Unsubscriber (unsubscribe plus archive in one click, aimed at senders you never read), Cold Email Blocker (auto-blocks cold outreach), AI Rules written in plain English, and Reply Zero reply tracking. Stack: Next.js, Prisma/PostgreSQL, Redis/Upstash; Electron desktop app — [GitHub README](https://github.com/elie222/inbox-zero)
- Bulk unsubscriber actions per sender are Unsubscribe, Auto archive, Auto archive + label, and Keep. Keep only hides the sender from the list. An expand control shows a send-frequency graph and old emails — [Inbox Zero docs](https://docs.getinboxzero.com/essentials/bulk-email-unsubscriber.md)
- If a sender ignores an unsubscribe, its future mail is auto-archived and labeled "Unsubscribed" (2024 changelog). Multi-row bulk actions were added in August 2024 — [Inbox Zero changelog](https://inboxzero.featurebase.app/changelog)
- A hashed version of emails is stored for analytics — [Inbox Zero newsletter cleaner page](https://getinboxzero.com/newsletter-cleaner)

**Mailstrom / Leave Me Alone / Trimbox / Unroll.me**
- Mailstrom groups by sender, subject or mailing list and moves or deletes a whole bundle in one go. Its own article says analysis is done on metadata alone and it unsubscribes through the list's official mechanism — [Mailstrom vs Leave Me Alone (Mailstrom-authored)](https://mailstrom.co/articles/mailstrom-vs-leave-me-alone/amp/). A competitor says bulk delete is not unsubscribe and that unsubscribe works only where a List-Unsubscribe header exists — [Leave Me Alone: Mailstrom alternatives (competitor)](https://leavemealone.com/blog/best-mailstrom-alternatives-2026/)
- Leave Me Alone sends real unsubscribe requests using List-Unsubscribe when present and blocks on the mailbox side when not. Free use is limited to the first 10 unsubscribes. It has no backlog bulk-delete or archive-by-sender — [Leave Me Alone 2026 tools list (vendor)](https://leavemealone.com/blog/best-bulk-email-unsubscribe-tools-2026/)
- Trimbox is a Gmail-only browser extension (OAuth) for unsubscribing and bulk deletion — [AgainstData: best unsubscribe apps 2025](https://againstdata.com/blog/best-unsubscribe-apps); [AgainstData: Trimbox alternatives](https://againstdata.com/blog/trimbox-alternatives)
- Unroll.me: no evidence of a shutdown in 2025-2026. The Rollup (a daily digest of newsletters the user puts in it) is still described as existing. It shut down for EU residents in May 2018 citing GDPR, and its 2017-2019 data-licensing controversy (Uber receipts case, FTC settlement) is widely cited — [Leave Me Alone: Unroll.me Rollups alternative (competitor)](https://leavemealone.com/blog/unroll-me-rollups-alternative/); [Leave Me Alone: Unroll.me not working 2026 (competitor)](https://leavemealone.com/blog/unroll-me-not-working-fix-or-replace/)

### Inferences
- Approximate click counts from first open to a cleaned inbox (inferred from the flows described; none of these were measured by a vendor):
  - Gmail Manage subscriptions: about 2 clicks to open the view, then 1 click per sender.
  - Inbox Zero / Clean Email: connect via OAuth, then a sender table; multi-select N senders plus 1 action plus confirm ≈ 3-4 clicks for a batch.
  - HEY Screener: 1 click per new sender, ever.
  - SaneBox: zero clicks (auto-sort overnight), then training by moving mail.
  - Outlook Sweep: 3 clicks per sender (select message > Sweep > choose option > OK).
- A privacy-first, metadata-only extension can copy SaneBox's model: sender importance from your *own sent mail* (recipients you have written to are VIPs), plus moves as training labels. This needs no bodies.
- Clean Email's "accept suggestion > optionally make it a standing rule" is the key bridge from a one-time cleanup to ongoing zero-click. Showing "processed N messages" per rule builds trust.
- Merging senders that share a List-Unsubscribe URL (Clean Email) cuts duplicate rows, since one brand often sends from several addresses.
- Inbox Zero's "if the unsubscribe fails, auto-archive + label" fallback is a good default: it guarantees a visible outcome even when the sender doesn't comply.

### Gaps
- Shortwave AI bundles / auto-archive: no sources retrieved. Its search query collided with unrelated "Spark" products and was not retried.
- Spark Gatekeeper mechanics (believed to be first-time-sender accept/block) were not confirmed in retrieved sources.
- I could not read the Inbox Zero source code (the GitHub code-search API was blocked in this sandbox). Its categorization algorithm (LLM prompt-based sender categorization plus rules) is not documented here; check `apps/web/utils/ai/` in the repo directly.
- No independent privacy audits of Mailstrom, Trimbox or Leave Me Alone were found. Most comparison content is vendor or competitor-authored.
- No published accuracy figures for any third-party tool.

## Q3. Which zero-click / one-click patterns work: auto vs. suggested actions, confidence thresholds, preview + confirm, undo, learning from what users do?

### Takeaway
The proven pattern is a ladder: **auto-sort (non-destructive, reversible) → suggest (one-click accept) → promote accepted suggestion to a standing rule → periodic report of what the rule did**. Destructive actions (delete) stay on explicit confirm, or move to trash with undo. Learning comes mostly from explicit moves and per-sender "always" choices, plus sent-mail engagement. Vendors do not publish confidence thresholds.

### Cited Findings
- Auto-but-reversible: SaneBox moves mail into a real folder (@SaneLater) rather than deleting it, sends a daily digest, and fails open if the service is down — [SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work)
- Suggest then promote: Clean Email suggestions are one-click accept/reject and can be converted into Auto Clean rules. Rules show a processed-message count and can be paused or edited — [Clean Email what's new](https://clean.email/help/basics/whats-new-in-clean-email-next); [Clean Email Auto Clean](https://clean.email/auto-clean)
- Time-based retention presets: Outlook Sweep offers "keep only latest" and "older than 10 days", applied once a day — [WiseStamp](https://www.wisestamp.com/blog/outlook-sweep/)
- Correction as a one-time per-sender decision: HEY Screener — [HEY](https://www.hey.com/how-it-works/). Outlook "Always move to Focused" — [MKUH IT](https://mkuh.freshservice.com/support/solutions/articles/26000165824-How-to-Ensure-You-See-Emails-from-a-Specific-Sender-in-your-Focused-Inbox). Apple "Categorize Sender" — [support.com](https://www.techsolutions.support.com/how-to/customize-email-settings-on-iphone-smart-categories)
- Implicit feedback signals named by providers: open, reply, frequency of contact (Priority Inbox) — [Gmail blog 2010](https://gmail.googleblog.com/2010/08/email-overload-try-priority-inbox.html); replied-to, opened, ignored, deleted, manual moves (Focused Inbox, via secondary sources) — [Bowdoin KB](https://bowdoin.teamdynamix.com/TDClient/1814/Portal/KB/Article/119446/What-Is-the-Focused-Inbox-in-Outlook)
- "Never read" as the targeting heuristic for bulk unsubscribe — [Inbox Zero README](https://github.com/elie222/inbox-zero)
- Undo windows: Gmail Undo Send is cited as a 20-second buffer. An implementation guide recommends 5-10 second undo toasts ("shorter and users miss it; longer and it becomes ambient noise") — [DEV Community: confirm vs undo vs soft delete](https://dev.to/137foundry/how-to-choose-between-confirmation-dialogs-undo-windows-and-soft-delete-patterns-1opj); [techinterview.org confirmation dialog patterns](https://www.techinterview.org/post/3233475217/build-confirmation-dialog-patterns/)

### Inferences
- Recommended defaults for the extension (design proposals, not sourced figures):
  - **Auto-apply only non-destructive actions** (label/move to a "Later"/"Promotions" view), and only when the sender-level signals agree. Example: has List-Unsubscribe or List-Id, AND zero replies to the sender ever, AND open rate below about 10% over 20 or more messages.
  - **Suggest** archive/unsubscribe for medium confidence.
  - **Never auto-delete.** Trash with undo, and real deletion only through the provider's 30-day trash.
- Protection rule for "archive everything older than X": exclude starred, important, replied-to threads, senders you have ever written to, and transactional categories (receipts, OTP, shipping, bank). Show the excluded count in the preview so users trust it.
- Treat every correction as sender-level, and weight it more than any implicit signal. A "keep" on a sender should suppress future suggestions, as Inbox Zero's Keep does.
- Undo: use a 5-10 s toast for single actions. For bulk actions, keep a persistent "Undo last cleanup" entry that stays available for the session or 24h. Archive/label changes are fully reversible through the API (re-add the INBOX label).

### Gaps
- No vendor publishes the numeric confidence thresholds it uses before auto-acting. Thresholds have to be tuned empirically.
- No measured step counts or completion rates were found for any tool's onboarding-to-clean flow.

## Q4. What techniques give accurate metadata-only classification (headers, sender-level vs. message-level, transactional vs. marketing, engagement, on-device models)?

### Takeaway
Sender-level aggregation of header signals is the backbone: List-Unsubscribe, List-Id, Precedence: bulk, Auto-Submitted, ESP Return-Path/DKIM domains. On top of that, user engagement (replied, opened, sent-to) personalizes importance. The hard case is telling transactional mail from marketing at the *same* sender, which needs message-level cues (subject patterns, no List-Unsubscribe). On-device LLMs (Chrome Prompt API / Gemini Nano) exist for extensions but have heavy hardware requirements and uncertain stable status.

### Cited Findings
- SaneBox shows that sender plus subject plus your own sent history gives commercially viable prioritization without bodies — [SaneBox help 155](https://sanebox.com/help/155-how-does-sanebox-work)
- Grouping senders by shared List-Unsubscribe link consolidates brands — [Clean Email getting started](https://clean.email/help/basics/getting-started)
- Unsubscribe depends on the List-Unsubscribe header. Tools without it fall back to blocking or filtering on the mailbox side — [Leave Me Alone (vendor)](https://leavemealone.com/blog/best-bulk-email-unsubscribe-tools-2026/); [Mailstrom (vendor)](https://mailstrom.co/articles/mailstrom-vs-leave-me-alone/amp/)
- Relevant standards: List-Unsubscribe header (RFC 2369), [RFC 2369](https://datatracker.ietf.org/doc/html/rfc2369); one-click unsubscribe POST via List-Unsubscribe-Post (RFC 8058), [RFC 8058](https://datatracker.ietf.org/doc/html/rfc8058); List-Id (RFC 2919), [RFC 2919](https://datatracker.ietf.org/doc/html/rfc2919); Auto-Submitted for automated mail (RFC 3834), [RFC 3834](https://datatracker.ietf.org/doc/html/rfc3834)
- Google's bulk-sender guidelines (enforced from February 2024 for senders of more than 5,000/day to Gmail) require one-click unsubscribe (RFC 8058) for marketing mail. This makes List-Unsubscribe-Post a high-precision marketing signal and means transactional mail is *not required* to carry it — [Google email sender guidelines](https://support.google.com/a/answer/81126). (The page could not be fetched in-session; details are from known guidelines and should be verified.)
- Apple separates Transactions from Promotions/Updates as distinct on-device categories — [MxToolbox](https://blog.mxtoolbox.com/2024/09/13/ios-18-changing-the-email-delivery-game/)
- Chrome built-in AI: the Prompt API (Gemini Nano) can be used from Chrome extensions. Requirements per Chrome docs (mid-2025 version): Windows 10/11, macOS 13+ or Linux; at least 22 GB free on the profile volume; more than 4 GB VRAM; unmetered network. Android, iOS and ChromeOS are not supported — [Chrome AI get-started (mirror)](https://developer.chrome.com/docs/ai/get-started)
- Status in 2026 is conflicting. A third-party post claims the Prompt API is stable since Chrome 148 — [pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/3145/gemini-nano-chrome-built-in-ai-client-side-en). A May 2026 German article says it is still an origin trial and criticizes the roughly 4 GB model download without explicit consent — [nevercodealone.de](https://nevercodealone.de/glossare/ki-tools-2026/gemini-nano-on-device-llm-chrome-pixel-built-in-ai-2026). Developers reported trouble enabling the model in January 2026 — [chrome-ai-dev-preview group](https://groups.google.com/a/chromium.org/g/chrome-ai-dev-preview-discuss/c/vG0kafkEY3Q/m/4ngN1OTYEwAJ)

### Inferences
- Suggested layered classifier for the extension:
  1. **Deterministic header rules** (highest precision): List-Unsubscribe-Post or List-Id present → bulk/list; Auto-Submitted: auto-generated with no list headers → notification/transactional candidate; Precedence: bulk/list → bulk.
  2. **Subject/sender heuristics for the transactional carve-out**: OTP or "verification code", "receipt", "order #", "shipped/out for delivery", "invoice", "password reset", and sender locals like no-reply@, receipts@, orders@. These should *override* marketing and protect the message, even from a marketing domain.
  3. **Sender-level engagement aggregates**: messages received, % read, ever replied, last opened, user sent mail to this address/domain.
  4. **An optional on-device LLM** only for ambiguous senders, given subject plus sender name. It has to be optional because of hardware gating, and must degrade gracefully to rules-only.
- Classify at the sender level for cleanup actions, but at the message level for the transactional carve-out. Many retailers send both receipts and promotions from one domain.
- Active learning: show the user the 5-10 senders with the most uncertain labels and the highest volume first, so each correction covers the most mail.

### Gaps
- No published precision/recall figures for header-based marketing detection were found.
- Whether the Chrome Prompt API is stable for extensions in Chrome as of October 2026 is unresolved. developer.chrome.com was unreachable from this sandbox.
- I did not verify Gmail API/extension-side access to raw headers (format=metadata with metadataHeaders); that belongs to another researcher's scope.

## Q5. What does research say about decision fatigue and UX writing for destructive bulk actions?

### Takeaway
Guidance converges on matching friction to risk. Prefer undo over confirmation for reversible actions. Use a confirmation dialog only for irreversible or high-impact actions; it should restate exactly what will happen (counts, scope), name the action on the button, and not pre-select the destructive option. Overusing confirmations trains users to click through.

### Cited Findings
- A confirmation dialog belongs before actions with serious consequences, especially irreversible ones. It should restate the user's request and explain what the system will do, and it should not pre-select an answer. Undo is preferred where possible (summarizing NN/g guidance) — [UX Psychology: destructive action modals](https://uxpsychology.substack.com/p/how-to-design-better-destructive)
- Overusing confirmations trains users to click through without reading. Friction should be proportional to the damage and to how hard the action is to reverse. For the most severe actions, typing the resource name to confirm significantly reduces accidental deletions — [saasui.design: destructive actions patterns](https://www.saasui.design/blog/saas-destructive-actions-confirmation-ux-patterns); [DEV Community](https://dev.to/137foundry/how-to-choose-between-confirmation-dialogs-undo-windows-and-soft-delete-patterns-1opj)
- GitHub Primer: don't use confirmation dialogs for low-risk actions that are easily undone. Focus Cancel by default on destructive dialogs — [Primer confirmation dialog guidelines](https://primer.style/product/components/confirmation-dialog/guidelines); [techinterview.org](https://www.techinterview.org/post/3233475217/build-confirmation-dialog-patterns/)
- "Prefer undo to confirmation steps" — [Andy Matuschak notes](https://notes.andymatuschak.org/zXH4ASvHNz488hCNgrBjQJK)
- Gmail's unsubscribe in Manage subscriptions has no confirmation step, which shows Google treats unsubscribe as low-friction — [BetaNews](https://betanews.com/2025/07/09/google-launches-manage-subscriptions-for-gmail/)

### Inferences
- Friction tiers for the extension:
  - Label/move/archive: no dialog, undo toast.
  - Bulk archive of more than about 100 messages: a preview sheet with counts and exclusions, plus one confirm button phrased as "Archive 1,240 emails from 18 senders".
  - Trash: the same, and note "recoverable for 30 days in Trash".
  - Unsubscribe: one click, but show "can't be undone from here" inline.
  - Permanent delete: avoid entirely, or require an explicit second step.
- Reduce decisions by batching: present a "recommended cleanup" with everything pre-checked only for high-confidence rows, and leave medium-confidence rows unchecked. One confirm then covers the bulk while the user only reviews exceptions.
- Microcopy: lead with the verb and the count, name what is protected ("Starred, replied-to and receipts are kept"), and say how to reverse it ("Undo" / "Find them in All Mail").

### Gaps
- The original NN/g and Baymard articles could not be fetched; the guidance above is via secondary summaries.
- I found no empirical study quantifying decision fatigue specifically in email-cleanup tools.
