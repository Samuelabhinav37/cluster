# How email systems decide "who and what matters" (importance / priority ranking)

Researcher notes, 2026-10-16. Scope: the BURIED half of Cluster's problem (lifting important mail).
This builds on `research/2026-10-11-core-problem.md` and `research/2026-10-11-how-cluster-solves-it.md`, which already cover Gmail Priority Inbox (Aberdeen 2010), Boykin & Roychowdhury, Grbovic 2014 and Gamzu 2018. Those are not repeated here.
Labels: **verified** = read on the linked page or PDF; **inference** = my reading. Dates are given for anything older than 2026.

---

## 1. Gmail: Important markers, Nudges, Gemini-era AI Inbox

### Takeaway
Gmail's published signal list for the Important marker is almost entirely behavioural and social: whom you email and how often, what you open, reply to, star, archive or delete, plus keywords. All but "keywords in bodies" can be derived from headers and labels. The 2026 Gemini "AI Inbox" adds content-based reasoning but still names "people you email frequently" and "your contacts" first when it describes how it finds VIPs.

### Cited Findings
- **Important marker signals (verified, current help page).** Gmail lists these factors: "Whom you email, and how often you email them", "Which emails you open", "Which emails you reply to", "Keywords that are in emails you usually read", and "Which emails you star, archive, or delete". Corrections: toggle the marker on or off, and it "informs future predictions". Hovering over the marker shows why a message was flagged. [Google Help 186543](https://support.google.com/mail/answer/186543?hl=en)
- **Nudges (launched in the 2018 Gmail web redesign, ML-driven).** There are two kinds: reply nudges for received mail you haven't answered, and follow-up nudges for sent mail with no reply. They show as orange text such as "Received 3 days ago. Reply?" or "Sent 5 days ago. Follow up?". Each kind has its own toggle in Settings → General ("Suggest emails to reply to", "Suggest emails to follow up on"). [Google Help 6585](https://support.google.com/mail/answer/6585?hl=en); [9to5Google, 2018-05-14](https://9to5google.com/2018/05/14/new-gmail-web-nudge-ai-reminders/)
- Google doesn't publish how threads are picked for nudges. Vendor guides say Gmail picks threads "based on message activity and its own signals about what seems important" and that nudges are best-effort. [Mailmeteor](https://mailmeteor.com/blog/gmail-nudges) (vendor source, treat with care)
- **Google research on reply expectation (2005).** Dredze, Blitzer and Pereira, "Reply Expectation Prediction for Email Management" (CEAS 2005), used logistic regression to predict whether a sent or received email needs a reply, aimed at "the problem of waiting for a reply to one's email". The abstract gives no numbers. [Google Research](https://research.google/pubs/reply-expectation-prediction-for-email-management/)
- **AI Inbox (announced 2026-01-08, Gemini 3).** It "filters out the clutter so you can focus on what's most important" and gives a personalised briefing of to-dos. High-stakes items such as "a bill due tomorrow or a dentist reminder" come first. It identifies VIPs using "people you email frequently, those in your contacts list and relationships it can infer from message content." At launch it was open to trusted testers only. [Google Keyword blog, 2026-01-08](https://blog.google/products-and-platforms/products/gmail/gmail-is-entering-the-gemini-era/)
- AI Inbox only highlights mail from the Primary tab, so Promotions and Social are excluded. [Android Authority hands-on](https://www.androidauthority.com/gmail-ai-inbox-hands-on-3678753/)
- By October 2026 AI Inbox and "Gmail Live" were expanding in the US, for English users. Workspace gets it on web and mobile. Personal accounts need a Google AI subscription. [Android Authority](https://www.androidauthority.com/gmail-live-gemini-ai-inbox-3724359/) (press; rollout details vary between outlets)

### Inferences
- Gmail's `IMPORTANT` label already includes "whom you email and how often", so reusing it (as Cluster does) brings in Google's social model. But the label is binary and not explained through the API, so Cluster can't rank with it or show reasons from it.
- AI Inbox is the closest competitor to an "Important strip". It's paywalled for consumers, US and English only, server-side and content-reading. A header-only, free, local version sits in a gap Google hasn't covered for most users yet. That gap may close as the rollout widens.
- Nudges show that "unanswered mail from a person" and "your sent mail with no reply" are surfaces worth building, and both can be computed from thread headers alone.

### Gaps
- I found no published accuracy figures or user-study results for Nudges or AI Inbox.
- I couldn't confirm whether any Gmail 2025–2026 "purchases" or "deliveries" views exist as separate products, beyond the AI Inbox "catch me up" snapshot of deliveries and reservations reported by [Android Central](https://www.androidcentral.com/apps-software/gmail/google-announces-major-gmail-gemini-powered-upgrades).

---

## 2. Outlook: Focused Inbox, Copilot, and Microsoft Research

### Takeaway
Focused Inbox (the successor to Clutter) uses "emails and contacts with whom you interact" and pushes bulk or machine mail to Other. Its main correction tool is a per-sender "Always move to" rule. Its best-known failure is important mail hidden in Other, and the standard support-desk fix is to turn the feature off. Microsoft Research finds that a sender's and recipient's interaction history is the strongest predictor of replies, ahead of content. They also found that reply alone is a weak proxy for importance in personal mail.

### Cited Findings
- **How Focused decides (verified, Microsoft support).** It "takes into account emails and contacts with whom you interact" and filters out high-volume automated and bulk mail. "The same algorithm that powered Clutter now powers Focused Inbox." Training works by moving a message, or by "Always move to Focused/Other", which sets a sender rule. "The more you use it, the better it gets." [Microsoft Support](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978)
- **Known failure: important mail in Other.** A university IT notice says "theoretically, this puts 'unimportant' emails out of sight; in reality, it puts some essential emails there occasionally" and recommends turning it off. [IU School of Medicine, 2024](https://medicine.iu.edu/blogs/md-student-news/2024/turn-off-focused-inbox-in-outlook). In a 2019 Exchange Online incident, all mail was delivered to Other. [Office365ITPros, 2019-07-25](https://office365itpros.com/2019/07/25/focused-inbox-outage/amp/). Admins can force mail into Focused with transport rules, and shared mailboxes were unsupported (2023). [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/1257920/how-to-receive-email-in-focused-inbox). Many institutional help desks list "check Other" as a missing-email fix, for example [Leesburg VA IT](https://leesburgva.freshservice.com/support/solutions/articles/22000053925).
- **Reply prediction (Yang, Dumais, Bennett, Awadallah, SIGIR 2017; PDF read).** Data: the Avocado corpus, 279 accounts, 351,532 emails. Only about 6.5–7.7% of emails got a reply (train 6.53%, test 7.70%). [PDF](https://microsoft.com/en-us/research/uploads/prod/2017/04/sigir17a.pdf)
  - Best model, AdaBoost: **AUC 0.7208** for reply or no reply, against 0.5858 for a "Previous Reply" baseline (predict from the recipient's past replies to this sender).
  - **Single feature group alone:** individual history ("HistIndiv") **AUC 0.6924**, close to all features combined. Pairwise sender-recipient history ("HistPair") 0.6382, content predictions (request or commitment) 0.5954, user job title 0.5944, address features 0.5912, temporal 0.5401, bag-of-words only 0.5106.
  - **Removing HistIndiv** caused the biggest drop for reply action. Removing Temporal caused the biggest drop for reply time.
  - **Top individual features for reply action:** subject length (1.00), the recipient's maximum historical reply count (0.57), the sender's historical sent count (0.43), the recipient's minimum count of emails received in the To field (0.43), number of receivers (0.43), body length (0.43), internal or external (0.29).
  - **Descriptive effects.** Internal mail got replies 7.76% of the time, external 2.26%. Mail containing a request got 14.81% against 7.45% without. Messages with attachments got 8.08% against 6.38% without. Messages sent to 3–5 recipients had the highest reply rate (about 10%); beyond that the rate fell ("people may think the other co-recipients will reply"), and median reply time rose from 44 to 95 minutes as recipients went from 1 to 8. Afternoon mail got 7.77% and night mail 3.63%. Weekdays got about 7%, weekends about 4%. Reply rate fell from 11.47% to 1.10% as subject length grew.
- **Actions as a proxy for significance (Alrashed, Lee, Bailey, Lin, Shokouhi, Dumais; WWW 2019; PDF read).** [PDF](https://people.csail.mit.edu/tarfah/papers/email_significance.pdf)
  - Uses Outlook Focused and Other moves as "implicit significant / insignificant" labels. The two classes showed clearly different action patterns.
  - **Personal mail (118 judges, 5,774 judgments):** Reply and Reply-all "have limited impact" on significance. Open-attachment rises with significance, and Delete rises as significance falls. Short reads and long reads occur "at similar rates across different levels of significance".
  - **Work mail (24 judges, 560 judgments):** Reply does rise with significance.
  - A reply-only predictor reached AUC about 0.5 (0.619 in one work setting). 30% of judges had no replies at all on the emails they rated.
  - A weighted action utility reached Spearman 0.25–0.27 against judged significance. ML on actions reached 0.315 (personal) and 0.295 (work). A real-time predictor reached 0.265 (personal) and 0.370 (work).
  - When cross-validation was split by judge, AUC fell 3–15%. "Significance may be highly personal." In personal mail, "around a third of the judges start to be anti-correlated", partly because "people also read promotions".
- **Copilot in Outlook:** I found no primary source describing its prioritisation signals (see Gaps).

### Inferences
- For a consumer tool, *reply* is a strong signal of "who matters" at the sender level (who you write to) but a weak signal for single messages in personal mail. Bills, school notices and receipts matter without replies. That argues for two separate lifts: people (social graph) and records (kind plus due date).
- Microsoft's main correction is the per-sender rule, not per-message retraining. That's cheap and easy to explain, and Cluster can copy it.
- The "missed it because it was in Other" failure is the main reputational risk of any hide-by-default design. Lifting ("show on top") is safer than demoting ("hide in another tab").

### Gaps
- No primary Microsoft source gives Focused Inbox accuracy, false-negative rate or user-satisfaction numbers.
- Copilot in Outlook's "prioritize my inbox" or summarisation features: signals and results not found in this pass.

---

## 3. Yahoo Mail: Priority tab and Yahoo Research

### Takeaway
Yahoo shipped a "Priority" inbox tab with AI one-line summaries in its June 2024 desktop redesign, and mobile AI features in November 2024. The signals aren't public. Yahoo Research's work shows that heavy volume cuts the share of mail people reply to.

### Cited Findings
- **June 2024 desktop redesign:** "A new Priority inbox tab will automatically highlight the most important messages first", with AI one-line summaries. Yahoo said this was the first such summary feature from any provider. [Yahoo Inc press, 2024-06-11](https://yahooinc.com/press/yahoo-mail-redesigns-the-inbox-for-a-cleaner-smarter-and-simpler-experience)
- **November 2024 app:** AI summaries, suggested next steps, quick actions, and "customized notifications alert users of the email categories most important to them." [Yahoo Inc press, 2024-11-14](https://www.yahooinc.com/press/yahoo-mail-launches-a-new-app-experience-with-mobile-first-ai-features)
- **Kooti, Aiello, Grbovic, Lerman, Mantrach, WWW 2015 (Yahoo; abstract):** over 2 million users and 16 billion emails. As daily volume rises, users reply to a smaller fraction, their replies get shorter, and their responsiveness holds or speeds up. The paper predicts reply time, reply length and conversation end "with considerable improvement over the baseline". [arXiv 1504.00704](https://arxiv.org/abs/1504.00704)
- A vendor blog says Yahoo dropped the classic view and cut free storage from 1 TB to 20 GB by August 2025. [Mailbird](https://www.getmailbird.com/yahoo-mail-desktop-redesign-regain-control/) (vendor, unverified)

### Inferences
- The Kooti result supports Nudge-like reminders. Overloaded users skip replies rather than reply slowly, so mail from people that never got a reply is where important things get dropped.

### Gaps
- Yahoo hasn't published the Priority tab's signals or accuracy. I found no 2025–2026 change to it.

---

## 4. Apple Mail (iOS 18): Primary category and Priority messages

### Takeaway
Since iOS 18.2 (Dec 2024), Apple sorts mail into categories on the device. Primary holds personal mail plus time-sensitive mail from any category. A separate Apple Intelligence "Priority" feature lifts a few urgent messages to the top of Primary. Apple doesn't publish its logic. Corrections are per sender.

### Cited Findings
- Categories are sorted on the device. Primary holds personal messages, and "all time-sensitive messages will appear in the Primary view even if they've been routed to other categories". Users can "recategorize messages from particular senders so Mail can correctly categorize similar messages in the future." [Creative Techs, 2025-01-14](https://www.creativetechs.com/2025/01/14/mail-on-the-iphone-can-categorize-your-messages-in-ios-18-2/); [Macworld](https://www.macworld.com/article/2585948/how-to-ios-18-macos-15-change-mail-categories-list-view.html)
- Priority messages need Apple Intelligence (iPhone 15 Pro or iPhone 16 and later). They appear only in Primary and can be turned off separately from categories. [Creative Techs](https://www.creativetechs.com/2025/01/14/mail-on-the-iphone-can-categorize-your-messages-in-ios-18-2/); [Six Colors](https://sixcolors.com/?p=33454)
- Reviewers saw misfiling, for example newsletters landing in Promotions instead of Updates. [Dr. Drang, Leancrew, 2024-12](https://leancrew.com/all-this/2024/12/mail-categories/)

### Inferences
- Apple's "time-sensitive mail always shows in Primary" rule is the closest product match to Cluster's "records lifted when due". It confirms the design: sort by kind, then let urgency override the sort.
- Apple's correction model, like Microsoft's, is per sender.

### Gaps
- Apple's support page on categories couldn't be retrieved in this pass (the fetch returned only a table of contents). I found no official description of the decision signals and no accuracy data.

---

## 5. Third-party clients: Superhuman, Shortwave, Spark, SaneBox, HEY, Newton/Edison

### Takeaway
Two families exist. ML sorters (SaneBox, Shortwave, Superhuman auto-labels) learn from sender history and corrections. Explicit-decision designs (HEY's Screener, Spark's Gatekeeper and Priority, Superhuman's split rules) have the user decide once per sender. SaneBox is the closest existing proof of Cluster's model: a commercial importance sorter that runs on headers only (sender and subject) and learns per sender from folder moves.

### Cited Findings
- **SaneBox (verified, vendor help).** For mail from people, "algorithms decide whether the person should be sorted into your Inbox or @SaneLater", and training "appl[ies] to all emails from that person". For automated senders, training is often tied to the subject, so a store's newsletters can go to SaneNews while its shipping notices stay in SaneLater. SaneBox "does not download the body of emails, so it is limited to deciding importance based on the subjects and sender alone." [SaneBox help 186](https://www.sanebox.com/help/186-how-does-sanebox-determine-trainings). Training means moving a misfiled email. [SaneBox FAQ](https://assets.sanebox.com/faq). The app listing says it analyses your email history to learn what's important. [App Store](https://apps.apple.com:443/us/app/sanebox-smart-email-cleaner/id1497929071). An early review (2012) describes cold start as "scan SaneLater once in a while and move messages back". [Macworld](https://www.macworld.com/article/221300/email-overload-check-out-sanebox.html)
- **HEY (Basecamp).** Every new sender waits in the Screener until the user approves or rejects them. Approved senders go to the Imbox by default. The user can move all of a contact's mail to The Feed (newsletters) or Paper Trail (receipts and transactional mail). It's an explicit decision rather than ML. [HEY: How it works](https://www.hey.com/how-it-works/); [The Imbox](https://hey.com/features/the-imbox/)
- **Spark (Readdle).** Smart Inbox groups mail into Priority, New senders, Notifications and Newsletters, with mail from people near the top. Gatekeeper screens first-time senders: before the inbox, inside it, or not at all. Marking a sender or thread as Priority makes its new mail "appear on top of your Inbox", with a light orange highlight, and the user picks how many Priority items to preview (1–10). [Spark Smart Inbox](https://sparkmailapp.com/features/smart_inbox); [Spark: pin and priority](https://sparkmailapp.com/help/sending-emails/pin-and-priority); [AppleInsider, 2023-01-13](https://appleinsider.com/articles/23/01/13/spark-mail-211-review-e-mail-organizer-with-gatekeeper-smart-inbox)
- **Superhuman.** Split Inbox sections are set in Settings, with a pre-built library. Its guides suggest turning on a "Starred" split and starring important senders such as the CEO. Auto Labels (Respond, Meeting, Travel, or custom by sender, domain, subject or AI criteria) tag messages. [Superhuman blog](https://blog.superhuman.com/how-engineering-teams-can-organize-their-inbox/) (vendor)
- **Shortwave.** Splits are defined "by importance, labels, senders, and ... search queries", plus natural-language AI filters and drag-and-drop between splits. Mail syncs to Shortwave's servers for features like embeddings. AI-aware splits were added in February 2025. [Shortwave docs](https://www.shortwave.com/docs/guides/customize-your-shortwave-settings/); [Shortwave labels guide](https://shortwave.com/docs/guides/labels). The inputs to its importance model aren't published.
- **Newton.** Shut down on 2018-09-25 and again later, then revived by new owners. [PCWorld, 2018](https://www.pcworld.com/article/3297801/software/newtons-shutdown-means-windows-users-are-losing-the-only-good-email-app-its-not-gmail.html); [PhoneArena](https://www.phonearena.com/news/The-Newton-email-app-is-back-and-not-going-anywhere_id124528). **Edison** offered a "Focused Inbox" of important conversations. [AlternativeTo](https://alternativeto.net/software/email--edison-mail/about). Its data-sale history is in the earlier Cluster notes (P6) and wasn't re-verified here.

### Inferences
- Every product above offers a **per-sender, one-tap correction**, and most offer an **explicit "this sender is priority"** (VIP) mark. Users want to set the rule themselves, not only nudge a model.
- SaneBox splits correction into "person → per sender" and "service → per sender plus subject pattern". That maps directly onto Cluster's people and records groups.
- HEY shows that explicit screening works for people who choose it, but it's a big cold-start cost. Spark makes it optional with three modes. Cluster already has an opt-in Screener, consistent with this.

### Gaps
- None of these vendors publish accuracy, time-saved or retention figures from controlled studies. SaneBox's own time-saved claims weren't retrieved.
- Astro (an AI email assistant, shut down around 2018 after its acquisition by Slack): not verified in this pass.
- Superhuman VIP and auto-label internals weren't found in primary docs.

---

## 6. Academic: which features carry the most predictive weight

### Takeaway
Across Google 2010, Microsoft 2017 and Microsoft 2019, the strongest single predictor of action is **interaction history between this sender and this user**: how often you've replied to them, how much they send you, and whether you're in To. Content helps less. Per-message reads are noisy. Importance is strongly personal, and models lose 3–15% AUC when tested on unseen users.

### Cited Findings
- History features alone give nearly all of the reply-prediction power (HistIndiv AUC 0.6924 against 0.7208 with all features). Bag-of-words alone is 0.51. [Yang et al., SIGIR 2017](https://microsoft.com/en-us/research/uploads/prod/2017/04/sigir17a.pdf)
- Number of recipients and internal/external status are among the top features. Reply rate peaks at 3–5 recipients, and internal mail gets more than three times the replies of external mail (7.76% against 2.26%). The same paper also models To versus Cc counts as features ("HistReceiveEmailSTRecipientMin" for To, "HistReceiveEmailCCSender" for Cc), and the To-count feature ranks 4th for reply action. [Yang et al.](https://microsoft.com/en-us/research/uploads/prod/2017/04/sigir17a.pdf)
- Dabbish, Kraut, Fussell and Kiesler (CHI 2005; abstract only): people kept about half of new messages in the inbox and replied to about a third. Messages were rated important mainly when they were work-related and needed action. Perceived importance had "only a modest effect" on replying or saving. Social messages get replies even when unimportant. [DOI 10.1145/1054972.1055068](https://www.doi.org/10.1145/1054972.1055068); restated in [Alrashed et al. 2019](https://people.csail.mit.edu/tarfah/papers/email_significance.pdf)
- Reads aren't discriminative: long and short reads occur at similar rates at every significance level. Open-attachment (positive) and delete (negative) are better signals. [Alrashed et al. 2019](https://people.csail.mit.edu/tarfah/papers/email_significance.pdf)
- Higher volume leads to a lower share of mail answered. [Kooti et al. 2015](https://arxiv.org/abs/1504.00704)

### Inferences
- A ranking of signals for "this sender matters", from the evidence, strongest first:
  1. You've replied to or written to them (and how often, and how recently).
  2. They write to you directly (you in To, few recipients), rather than as one of many or via Cc or a list.
  3. You star, keep or label their mail, and don't delete it.
  4. You open their mail. This is the weakest signal, because people read promotions too.
- Content signals (requests, due dates) matter mainly for **records**, not people. For a header-only tool, the subject line is the only content signal available, which is enough for kinds and due-date patterns.

### Gaps
- I didn't read the full Dabbish 2005 paper, so its sender-relationship effects aren't quantified here.
- The UCL "Prioritizing unread emails" HCI journal paper (Cox et al.) turned up but wasn't read. [UCL Discovery](https://discovery-pp.ucl.ac.uk/10115257/3/Cox_HCIJnl_Prioritizing%20Unread%20Emails_minors_v4.pdf)

---

## 7. Which signals are computable from headers only

### Takeaway
Nearly every high-weight signal in the literature can be computed from headers, labels and thread structure. The body is needed only for request or commitment detection and body length, which ranked lower than history.

### Cited Findings (signal → source → available from headers?)
| Signal | Evidence of weight | Header/metadata route | Header-only? |
|---|---|---|---|
| Whom you email, how often | Gmail factor 1 ([186543](https://support.google.com/mail/answer/186543?hl=en)); history features top ([Yang 2017](https://microsoft.com/en-us/research/uploads/prod/2017/04/sigir17a.pdf)) | To/Cc of SENT-label messages, counted over all history | Yes |
| You reply to them (reply rate, latency) | HistReplyCount ranks 2nd ([Yang 2017](https://microsoft.com/en-us/research/uploads/prod/2017/04/sigir17a.pdf)); Gmail factor 3 | Thread contains your SENT message after theirs; `In-Reply-To`/`References`; `Date` difference | Yes |
| Their send volume to you | HistSentEmailCountSender ranks 3rd | Count of From per address/domain | Yes |
| You are in To vs Cc | To-count feature ranks 4th | `To`/`Cc` headers | Yes |
| Number of recipients | Ranks 5th; reply peak at 3–5 | Count of To+Cc | Yes |
| Internal/external (≈ same domain / known domain) | 7.76% vs 2.26% reply | Sender domain vs your domain / contact domains | Yes |
| Opens | Gmail factor 2; weak per Alrashed 2019 | `UNREAD` label transitions | Yes (noisy) |
| Star / archive / delete | Gmail factor 5; delete negative per Alrashed 2019 | `STARRED`, removal of `INBOX`, `TRASH` labels | Yes |
| Attachment present | 8.08% vs 6.38%; open-attachment positive | MIME `Content-Type: multipart/mixed`, Gmail `has:attachment`, size | Mostly (presence yes, opening no) |
| Time of day / weekday | Top for reply *time* | `Date` | Yes |
| Subject length / keywords | Subject length ranks 1st | `Subject` | Yes |
| Bulk / list mail | Focused filters "high-volume automated" ([MS](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978)) | `List-Unsubscribe`, `Precedence`, `List-Id` | Yes |
| Provider's own judgement | — | Gmail `IMPORTANT`/`CATEGORY_PERSONAL`, Outlook `inferenceClassification` | Yes |
| Request/commitment in body, body length | CPred AUC 0.5954; body length rank 6 | Body | **No** (subject-only approximation) |
| "Relationships inferred from content" | Gmail AI Inbox ([blog](https://blog.google/products-and-platforms/products/gmail/gmail-is-entering-the-gemini-era/)) | Body | **No** |

### Inferences
- A header-only model can reproduce the HistIndiv plus HistPair plus Address feature groups that drove the SIGIR 2017 AUC, losing mainly the CPred group. My rough estimate is a model in the 0.68–0.71 AUC range for reply prediction on comparable data. That is an extrapolation from the single-group and remove-one-group tables, not a measured result.
- Outlook exposes Focused/Other through Graph as `inferenceClassification`. This is my general knowledge, not verified in this pass, so confirm it before relying on it.

### Gaps
- No study measured importance prediction with header-only features as an explicit condition. The estimate above comes from feature-group ablations.

---

## 8. Measured outcomes and failures

### Takeaway
Published hard numbers are rare. Priority Inbox's time savings (already covered) remain the main controlled result. Reply-prediction AUCs sit around 0.70–0.72. Correlation between actions and judged importance is modest (Spearman about 0.25–0.37). The dominant complaint across products is important mail hidden in the "other" bucket.

### Cited Findings
- Reply prediction: AUC 0.7208, against 0.5858 for "previous reply". [Yang 2017](https://microsoft.com/en-us/research/uploads/prod/2017/04/sigir17a.pdf)
- Action-based significance: Spearman 0.25–0.37. About 10% of personal judges and 20% of work judges reached "possibly reliable" agreement (ρ above 0.667). About a third of personal judges were anti-correlated. [Alrashed 2019](https://people.csail.mit.edu/tarfah/papers/email_significance.pdf)
- Judges were inconsistent with themselves, and identical action sets were labelled anything from "Insignificant" to "Extremely significant" (entropy 1.5–2). [Alrashed 2019](https://people.csail.mit.edu/tarfah/papers/email_significance.pdf)
- Focused Inbox: an institutional "turn it off" recommendation, a 2019 everything-to-Other outage, and unsupported shared mailboxes. [IU](https://medicine.iu.edu/blogs/md-student-news/2024/turn-off-focused-inbox-in-outlook); [Office365ITPros](https://office365itpros.com/2019/07/25/focused-inbox-outage/amp/); [MS Q&A](https://learn.microsoft.com/en-us/answers/questions/1257920/how-to-receive-email-in-focused-inbox)
- Apple categories misfile newsletters and updates. [Leancrew](https://leancrew.com/all-this/2024/12/mail-categories/)

### Inferences
- Even the best models are wrong often enough that **demoting** mail on a model's say-so is risky. **Lifting** mail is the safer product choice for wrong guesses: a false lift costs a glance, while a false demotion costs a missed deadline.

### Gaps
- I found no published time-saved or satisfaction study for Focused Inbox, Apple Priority, Yahoo Priority, AI Inbox, SaneBox, Spark or HEY.

---

## 9. Lessons a header-only, on-device tool can copy

### Takeaway
Build the "who matters" score from sent-mail and reply history first, add direct-address cues, treat reads as weak, lift rather than hide, and give one-tap per-sender corrections plus an explicit "priority sender" mark. Every one of these is computable from headers.

### Cited Findings (the basis for each lesson)
- History features dominate reply prediction. [Yang 2017](https://microsoft.com/en-us/research/uploads/prod/2017/04/sigir17a.pdf)
- Gmail's own factor list is behavioural and social. [Google Help](https://support.google.com/mail/answer/186543?hl=en)
- Header-only importance sorting is commercially viable (SaneBox: "subjects and sender alone"). [SaneBox](https://www.sanebox.com/help/186-how-does-sanebox-determine-trainings)
- Per-sender correction rules are standard. [Microsoft](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978); [Spark](https://sparkmailapp.com/help/sending-emails/pin-and-priority); [HEY](https://www.hey.com/how-it-works/)
- Time-sensitive mail overrides category (Apple Primary). [Creative Techs](https://www.creativetechs.com/2025/01/14/mail-on-the-iphone-can-categorize-your-messages-in-ios-18-2/)
- Unanswered-mail reminders (Gmail Nudges). [Google Help](https://support.google.com/mail/answer/6585?hl=en)
- Reads are noisy, replies matter less in personal mail, and importance is personal. [Alrashed 2019](https://people.csail.mit.edu/tarfah/papers/email_significance.pdf)

### Inferences (concrete design lessons for Cluster)
1. **Sender score from full sent history.** Count To/Cc of all SENT messages and keep recency. Weight reciprocity, meaning they write to you *and* you write back (HistPair). This fixes gap A2 from the earlier note.
2. **Directness multiplier per message.** You alone in To scores highest, small To lists next, Cc lower still, large lists and `List-Id`/`List-Unsubscribe` lowest. The data behind this: reply rate peaks at 3–5 recipients and falls after, and To-count features rank high.
3. **Domain-level familiarity.** Treat your own domain and domains of people you write to like "internal" (more than three times the reply rate). This also covers gap A7 (accounts@ against billing@).
4. **Weak and negative signals.** Unread→read counts as weak positive. Star and label count as strong positive. Trash without opening counts as strong negative. Don't let reads alone promote a bulk sender. This follows Alrashed and Priority Inbox's "users read mail they acknowledge is not important".
5. **Two lift lanes, not one score.** People: unanswered mail from high-score senders, Nudge-style "Received 3 days ago". Records: kind plus a due-date pattern in the subject, which overrides category the way Apple's time-sensitive rule does. This is because replies don't measure importance for bills and school mail.
6. **"Waiting on reply" lane.** Your sent mail to a high-score person with no reply in the thread after N days. Computable from `In-Reply-To`/thread headers. This is Gmail's follow-up nudge, done locally.
7. **Lift, don't hide.** Put the important strip on top, and never move a person's mail out of the inbox on a model guess. This avoids the "it was in Other" failure.
8. **Corrections are per sender, one tap, visible.** "Always important" or VIP (Spark Priority, Outlook "Always move to Focused"), plus "not important". For services, scope corrections to sender plus subject pattern (SaneBox), so shipping notices and newsletters from one store split correctly.
9. **Explain the reason**, as Gmail's hover-for-why does. For example: "You've written to Lisa 14 times" or "Due Friday".
10. **Cold start.** Seed from the full sent history, Gmail `IMPORTANT`/`CATEGORY_PERSONAL` or Outlook Focused labels, and contacts' domains, so the strip is useful on day one without a training phase. A HEY-style screener remains opt-in.
11. **Per-user threshold or volume control.** Let the user set how many items the strip shows (Spark 1–10 preview), because people differ in how much they want marked important (Priority Inbox, Alrashed).
12. **Measure locally.** Track the share of lifted items acted on (opened, replied, starred) against items dismissed, and how often users override. Personal models vary, so a "global" default will be wrong for some users.

### Gaps
- Optimal weights for the combined score are not published anywhere for headers-only. They'll have to be tuned on the owner's own mailbox, locally, with the census step proposed in the earlier note.
