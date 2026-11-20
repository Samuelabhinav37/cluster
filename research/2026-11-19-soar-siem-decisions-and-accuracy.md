# What security tools teach Cluster about decisions and accuracy (2026-11-19)

Research only. No code changed. Sources are vendor docs and papers. Where a page could not be opened, the note says so and the claim rests on the search result's quote of that page.

## Summary

Security tools face Cluster's problem at a larger scale. Too many items, too little attention, and a cost for every wrong move. They all land on the same few answers:

1. Group many alerts about one thing into one case. Decide once.
2. Act alone only on what is clearly bad. Queue the rest for a person, with a timeout.
3. Show the reason and the evidence next to every verdict.
4. Turn every correction into a visible rule that can be removed.
5. Raise the bar before acting, and leave things alone when unsure.

On accuracy, the strongest evidence for Cluster is Yahoo's mail categorisation paper. With the body removed, accuracy barely moved (AUC 0.973 to 0.971). Most traffic was sorted by a sender lookup table, not by reading messages. That supports Cluster's headers-only design. Previews would add little to sorting and would weaken a clear privacy promise.

Cluster today, for grounding: one engine (`src/lib/mailEngine.ts`) decides a place and a risk tier per email from sender summaries. Mail that fits no label waits in the Screener. Scams go to Spam with "Not a scam" to undo. Marketing is never trashed or unsubscribed on its own (`docs/goal-and-plan-2026-11-18.md`, Rule 1). The north star is fixes per 100 emails. The privacy page promises headers only, except the Today list's one-line preview and a link check on mail already flagged as a scam (`docs/privacy.md`).

---

## Part A. Making decisions easy

### A1. Group alerts into one incident

**What the tools do**
- Microsoft Sentinel can group alerts from a rule into one incident "if all the entities match" (the recommended setting), within a time frame you set. Up to 150 alerts fit in one incident. A closed incident can be re-opened when a matching alert arrives. [Sentinel: create scheduled analytics rules](https://learn.microsoft.com/en-us/azure/sentinel/create-analytics-rules)
- Google SecOps groups alerts into cases when they share at least one entity. The window is 0.5 to 24 hours. A case holds at most 30 alerts, then a new case starts. A fallback rule makes sure every alert lands somewhere. [Google SecOps: configure alert grouping](https://docs.cloud.google.com/chronicle/docs/soar/investigate/working-with-alerts/alert-grouping-mechanism-admin)
- Cortex XSIAM groups by alert source, type and time period. An incident stops taking alerts at its threshold or at 1,000 alerts. (Page could not be fetched; from the search quote.) [XSIAM: Incidents](https://docs-cortex.paloaltonetworks.com/r/Cortex-XSIAM/Cortex-XSIAM-Administrator-Guide/Incidents)
- Splunk ES risk-based alerting ties events to a "risk object" (a user or system). Five low-score events from one system can produce "only a single risk notable". [Splunk: how RBA works](https://help.splunk.com/en/splunk-enterprise-security-7/risk-based-alerting/7.3/introduction/how-risk-based-alerting-works-in-splunk-enterprise-security)
- Defender for Office 365 AIR fully auto-remediates "malicious similarity clusters" of URLs and files. [Defender: AIR](https://learn.microsoft.com/en-us/defender-office-365/air-about)

**Cluster screen idea.** A sender case. Forty emails from one sender become one row: "Temu · 40 emails · never opened". One decision covers all forty. A case also catches the newest email when it arrives, the way Sentinel re-opens a matching incident. Cluster already groups by sender and company, so this is mostly a screen change. Cap a case by time (for example "since Monday") so one row never hides months of mixed mail.

### A2. Risk scoring

**What the tools do**
- Splunk sums risk scores per risk object and raises a notable at a threshold. The default rule is "Score threshold 100 exceeded over 24 hours". Analysts can lower the threshold for high-confidence events and raise it for low-confidence ones. [Splunk: how RBA works](https://help.splunk.com/en/splunk-enterprise-security-7/risk-based-alerting/7.3/introduction/how-risk-based-alerting-works-in-splunk-enterprise-security), [Splunk: adjust risk threshold](https://docs.splunk.com/Documentation/ES/7.1.1/RBA/AdjustRiskThreshold)
- Elastic scores each entity hourly from its open alerts over the last 30 days, weighted by asset criticality. [Elastic: entity risk scoring](https://www.elastic.co/docs/solutions/security/advanced-entity-analytics/entity-risk-scoring)
- XSIAM offers rule-based scores and an ML "SmartScore". Users can send feedback on a SmartScore they disagree with. (From the search quote.) [XSIAM: prioritize incidents with starring and scoring](https://docs-cortex.paloaltonetworks.com/r/Cortex-XSIAM/Cortex-XSIAM-Documentation/Prioritize-incidents-with-starring-and-scoring)

**Cluster screen idea.** No number on screen. A non-technical user can't act on "risk 73". Keep the score inside the engine (`riskOf` already returns a tier) and show only the tier as words: "Looks fine", "Check this", "Held". Let the score add up across a sender's emails, like Splunk does per risk object. Three weak signs in one week should become one "Check this".

### A3. Confidence

**What the tools do**
- CrowdStrike Charlotte AI returns a verdict, a confidence score, a recommendation and its reasoning. Teams decide what happens at each level. It takes no automated response action by default. [Charlotte AI](https://www.crowdstrike.com/platform/charlotte-ai/)
- Sublime's Attack Score gives verdicts such as malicious, suspicious, unknown and likely_benign. Its docs suggest auto-remediating malicious and investigating suspicious or unknown. (Page could not be fetched; from the search quote.) [Sublime: Attack Score](https://docs.sublime.security/docs/attack-score)
- Defender for Endpoint's recommended "Full" level acts on artifacts "determined to be malicious". [Defender: automation levels](https://learn.microsoft.com/en-us/defender-endpoint/automation-levels)

**Cluster screen idea.** A "Not sure" chip, shown only when confidence is low. Confident decisions show nothing extra. A low-confidence email gets a small "Not sure" chip and lands in the Screener instead of a label. That matches the user's design rule of no extra meta lines.

### A4. Evidence for "why"

**What the tools do**
- Microsoft's Phishing Triage Agent gives "transparent rationale for its classification verdicts in natural language, detailing the reasoning behind its conclusions and the evidence used". The card highlights "key pieces of incriminating evidence". [Phishing Triage Agent](https://learn.microsoft.com/en-us/defender-xdr/phishing-triage-agent)
- Sentinel lets a rule put custom details and entity values into the alert name and description. [Sentinel: create scheduled analytics rules](https://learn.microsoft.com/en-us/azure/sentinel/create-analytics-rules)
- Abnormal's AI Security Mailbox sends the employee who reported an email "an AI-generated explanation of every reported email outcome". (Vendor marketing page.) [Abnormal: AI Security Mailbox](https://abnormal.ai/resources/data-sheets/ai-security-mailbox)

**Cluster screen idea.** One reason line plus up to three evidence chips. "Held: pretends to be PayPal" with chips "Not paypal.com", "Failed DMARC", "First email from them". Plan step 4.9 already wants a reason per label. This adds the evidence chips and keeps them plain.

### A5. Recommended next action

**What the tools do**
- Defender AIR ends with "recommended actions" that wait for approval. [Defender: AIR](https://learn.microsoft.com/en-us/defender-office-365/air-about)
- Google SecOps' Gemini case summary "recommends next steps for remediation", and users can rate it. [Gemini case summary widget](https://docs.cloud.google.com/chronicle/docs/soar/investigate/working-with-cases/using-the-gemini-case-summary-widget)
- Charlotte AI returns a recommendation with each verdict. [Charlotte AI](https://www.crowdstrike.com/platform/charlotte-ai/)

**Cluster screen idea.** One primary button per case, picked by the engine. Never-opened newsletter: "Unsubscribe". Look-alike: "Keep in Spam". Person: no button. Other actions sit behind "More". The plan's step 5.3 already has "one bulk action" per suggestion; extend it to Security and the Screener.

### A6. One-click playbooks with approval steps

**What the tools do**
- Splunk SOAR's Prompt block pauses a playbook until a named user or role responds, with a required response time in minutes. If automation started the run without an owner, the prompt fails and is not sent. (From the search quote of the docs.) [Splunk SOAR: Prompt block](https://docs.splunk.com/Documentation/SOARonprem/latest/Playbook/PromptBlock)
- Tines suggests Pages as approve or reject forms, with timeout or escalation so an approval never stalls. (Community answer.) [Tines community: human in the loop](https://community.tines.com/t/how-do-i-build-a-human-in-the-loop-approval-workflow/30)
- Defender Action center lists pending actions with Approve and Reject, and History with Undo. [Defender: Action center](https://learn.microsoft.com/en-us/defender-xdr/m365d-autoir-actions)

**Cluster screen idea.** A "Waiting for you" queue. Each row is one proposed action on one case: "Unsubscribe from 6 shops you never open · Approve · Not now". Approve runs the durable job (plan 5.1) and writes Undo to Activity, like Defender's History tab.

### A7. Automation tiers: automatic, suggest, ask first

**What the tools do**
- Defender for Endpoint levels: "Full" acts automatically. "Semi" sends some actions to the Pending tab. "Pending actions time out after seven days. If an action times out, the behavior is the same as if the action is rejected." Full automation customers "had 40% more high-confidence malware samples removed". [Defender: automation levels](https://learn.microsoft.com/en-us/defender-endpoint/automation-levels)
- For email in Defender XDR, "no remediation actions are taken automatically for email and content". All wait for approval. [Defender XDR: configure AIR](https://learn.microsoft.com/en-us/defender-xdr/m365d-configure-auto-investigation-response)
- AIR auto-closes investigations that find no threat, which it says is common for user submissions. [Defender: AIR](https://learn.microsoft.com/en-us/defender-office-365/air-about)
- Torq describes Tier-1 threats handled fully autonomously and higher-risk actions needing "one-click analyst approval". (Vendor blog, not docs.) [Torq blog via search](https://torq.io/?p=5718)

**Cluster screen idea.** One "What Cluster may do alone" card in Settings with three rows. Do it: hold scams, label marketing. Ask me: unsubscribe, trash. Off: anything the user turns off. Pending items expire after 7 days as "nothing happened", never as "done". This is Cluster's Rule 1 written as Defender writes it.

### A8. True and false positive feedback that tunes detection

**What the tools do**
- The Phishing Triage Agent turns an analyst's reclassification and written reason into a "lesson". The analyst can preview it with "Evaluate feedback". A lesson that contradicts an older one is marked "Conflict". Lessons can be rejected later. A feedback page shows status: in use, not in use, or conflict. [Phishing Triage Agent](https://learn.microsoft.com/en-us/defender-xdr/phishing-triage-agent)
- Elastic separates rule tuning, exceptions for known-safe cases, and shared exception lists across rules. [Elastic: reduce noise and false positives](https://www.elastic.co/docs/solutions/security/detect-and-alert/reduce-noise-and-false-positives)
- Sentinel says to tune by updating the rule query to exclude false positives. [Sentinel: create scheduled analytics rules](https://learn.microsoft.com/en-us/azure/sentinel/create-analytics-rules)

**Cluster screen idea.** "What Cluster learned from you". A list of every correction as a plain rule: "LinkedIn goes to Social. You moved it on 12 Nov. Remove". When a new move contradicts an old rule, ask once: "Last week you sent Uber to Receipts. Now Travel?" Cluster already writes corrections into Gmail filters (plan 4.5). This screen makes them visible.

### A9. Cutting alert fatigue

**What the tools do**
- Elastic alert suppression creates one alert per group of duplicates within a time window. Snoozing pauses notifications while alerts are still stored. [Elastic: reduce noise and false positives](https://www.elastic.co/docs/solutions/security/detect-and-alert/reduce-noise-and-false-positives)
- Sentinel's "Stop running query after alert is generated" suppresses a rule for up to 24 hours. [Sentinel: create scheduled analytics rules](https://learn.microsoft.com/en-us/azure/sentinel/create-analytics-rules)
- Defender's built-in alert tuning rules suppress common benign alerts, and re-activate an alert if AIR later finds a threat. [Defender: AIR](https://learn.microsoft.com/en-us/defender-office-365/air-about)

**Cluster screen idea.** One warning per sender per week. Kai and Home show "PayPal look-alike · 3 emails" once, not three times. A "Don't warn me about this" link snoozes a sender's warnings but keeps the hold.

### A10. Auto-written case summaries

**What the tools do**
- Gemini's case summary analyses the event, the entities and similar cases, summarises the alerts and suggests next steps. [Gemini case summary widget](https://docs.cloud.google.com/chronicle/docs/soar/investigate/working-with-cases/using-the-gemini-case-summary-widget)
- The Phishing Triage Agent's card gives the verdict and the key evidence, with a full activity view. [Phishing Triage Agent](https://learn.microsoft.com/en-us/defender-xdr/phishing-triage-agent)
- Torq says its agents "generate case summaries". (Vendor news, not docs.) [Torq HyperSOC via vmblog](https://vmblog.com/bylines/torq-debuts-hypersoc-ai-driven-soc-solution-for-reducing-secops-alert-fatigue-false-positives-and-staff-burnout/)

**Cluster screen idea.** A one-sentence summary per case, written from a template, not an LLM. "Amazon sent 14 emails this month. You opened 2. All are orders and parcels." It is cheap, needs no body text, and is testable. Kai's Home sentence can reuse it.

### Measured results from Part A

| Claim | Number | Source |
|---|---|---|
| Phishing triage agent RCT: true positives per analyst minute | up to 6.5x | [Bono, arXiv 2511.13860](https://arxiv.org/abs/2511.13860) |
| Same RCT: verdict accuracy | +77% vs control | same |
| Same RCT: time on malicious email | +53% | same |
| Defender full automation vs lower levels | 40% more high-confidence malware removed | [Defender: automation levels](https://learn.microsoft.com/en-us/defender-endpoint/automation-levels) |
| Charlotte AI agreement with expert MDR analysts | over 98% (vendor benchmark) | [Charlotte AI](https://www.crowdstrike.com/platform/charlotte-ai/) |
| Abnormal: reported-email review time cut | up to 95% (vendor claim, internal data) | [Abnormal: AI Security Mailbox](https://abnormal.ai/resources/data-sheets/ai-security-mailbox) |
| Manual triage of one user report | up to 30 minutes | [Phishing Triage Agent](https://learn.microsoft.com/en-us/defender-xdr/phishing-triage-agent) |

---

## Part B. Accuracy

### B1. Tuning from verdicts

- The Phishing Triage Agent learns only from feedback the analyst explicitly marks "Use this feedback to teach the agent". Other feedback is saved for audit only. [Phishing Triage Agent](https://learn.microsoft.com/en-us/defender-xdr/phishing-triage-agent)
- Gmail says "the most important" sorting signal "is your direct input". Moving a message between tabs makes Gmail remember the choice for that sender. [Google Workspace blog: how Gmail sorts your email](https://workspace.google.com/blog/productivity-collaboration/how-gmail-sorts-your-email-based-on-your-preferences)
- Gemini case summaries and XSIAM SmartScore both collect user ratings. [Gemini case summary](https://docs.cloud.google.com/chronicle/docs/soar/investigate/working-with-cases/using-the-gemini-case-summary-widget), [XSIAM scoring](https://docs-cortex.paloaltonetworks.com/r/Cortex-XSIAM/Cortex-XSIAM-Documentation/Prioritize-incidents-with-starring-and-scoring)

For Cluster: a correction is a per-sender rule first and training data second. That is what Gmail describes, and what Cluster's learn-from-moves already does.

### B2. Suppression rules and allowlists

- Elastic's exceptions "permanently stop alert creation for matching field values", while rule logic stays the same. Shared exception lists cover many rules at once. [Elastic: reduce noise and false positives](https://www.elastic.co/docs/solutions/security/detect-and-alert/reduce-noise-and-false-positives)
- Defender's built-in tuning rules suppress benign alerts but still let AIR run, and re-activate the alert if AIR finds a threat. [Defender: AIR](https://learn.microsoft.com/en-us/defender-office-365/air-about)
- SNARE added an autonomous-system allowlist and cut false positives from about 0.2% to 0.14%. (From the search quote of the paper.) [Hao et al., USENIX Security 2009](https://static.usenix.org/events/sec09/tech/full_papers/hao.pdf)

For Cluster: "Not a scam" and "Let in" are allowlists. Defender's pattern is worth copying: an allowlisted sender still gets checked, and a fresh, strong sign (failed DMARC from a look-alike domain) can still raise a warning.

### B3. Sender and entity reputation

- Gmail's domain reputation (Taylor, Google, CEAS 2006) scores authenticated sending domains as spammy or not. It uses SPF and DomainKeys to identify the sender. A later paper says user spam-button reports feed it. (Full text not found; from the abstract and a citing paper.) [CEAS 2006 listing](https://dblp.dagstuhl.de/db/conf/ceas/ceas2006.html), [Yeung et al., CEAS 2007, citing it](https://cse.hkust.edu.hk/~dyyeung/paper/pdf/yeung.ceas2007.pdf)
- Microsoft's bulk complaint level (BCL) runs from 1 to 9, based on complaints about a bulk sender. The default policy treats 7 and above as bulk. [Microsoft: BCL](https://learn.microsoft.com/en-CA/defender-office-365/anti-spam-bulk-complaint-level-bcl-about), [Microsoft: tune bulk filtering](https://learn.microsoft.com/en-us/defender-office-365/step-by-step-guides/tune-bulk-mail-filtering-walkthrough)
- Sublime rules use a sender profile: `prevalence` ("new", "outlier" and others), `solicited` (has the organisation ever written to them) and flags for past benign or false-positive messages. (From the search quote; reference page not reached.) [Sublime: common snippets](https://docs.sublime.security/docs/common-snippets)
- SNARE used only network-level metadata (no content) and reached about 70% detection at about 0.2% false positives. [Hao et al., USENIX Security 2009](https://static.usenix.org/events/sec09/tech/full_papers/hao.pdf)

For Cluster: no crowd reputation is possible without a server, by design. But Sublime's per-sender profile maps directly onto data Cluster already has: first seen, how often, have you written to them, have you ever said "Not a scam".

### B4. Behavioural baselines

- Abnormal says it combines "behavioral baselines" (known good) with threat intelligence (known bad). It builds baselines "over weeks to 90 days". No false positive rate is published. (Vendor blog and learning pages.) [Abnormal: behavioral AI](https://abnormal.ai/blog/behavioral-ai), [Abnormal: anomaly-based detection](https://abnormal.ai/learning/anomaly-based-detection)
- In Yahoo's paper, behaviour features alone reached AUC 0.716, far below content (0.964) or address (0.897). They helped as an add-on. [Grbovic et al., CIKM 2014](https://arxiv.org/abs/1606.09296)

For Cluster: behaviour (opens, replies, stars) is a good tiebreaker and a good care score. It is a weak classifier on its own. That matches the plan's choice to use the care score for ordering suggestions, not for labels.

### B5. Rules plus ML, in layers

- Yahoo's production pipeline (CIKM 2014): light message rules covered 32% of traffic. A sender lookup table, built offline from senders classified "with sufficient confidence", handled most of the rest. Only "8% of the traffic" reached the per-message classifier. (The 60% table share is inferred as 100 minus 32 minus 8; the paper does not state it.) [Grbovic et al., arXiv 1606.09296](https://ar5iv.arxiv.org/html/1606.09296)
- Google's template label propagation spreads labels over a graph of templates, then to the emails that match. It reports over 91% precision, 93% recall, and over 11% more coverage than the baseline classifier. [Wendt et al., WSDM 2016](https://research.google/pubs/hierarchical-label-propagation-and-discovery-for-machine-generated-email/)
- Yahoo found machine-generated mail is over 60% of traffic, and mostly repeated templates from the same sender process. [Ailon et al., WSDM 2013](https://dblp.uni-trier.de/rec/conf/wsdm/AilonKLM13.html)
- Gmail tabs use "who the email comes from", "what type of content is in the message" and how users interacted with similar mail. No numbers given. [Google Workspace blog](https://workspace.google.com/blog/productivity-collaboration/how-gmail-sorts-your-email-based-on-your-preferences)

For Cluster: this is the same order Cluster's engine already uses (rules, then sender, then fallback). The research says the sender layer should do most of the work, and per-message logic should be the small last step.

### B6. Thresholds that abstain

- Selective classification (Geifman and El-Yaniv, NeurIPS 2017) wraps a trained classifier with a reject option. You pick a target error and it keeps error under that target "with high probability", at the cost of coverage. Example: 2% top-5 ImageNet error guaranteed with 99.9% probability at almost 60% coverage. [arXiv 1705.08500](https://arxiv.org/abs/1705.08500)
- Yahoo only put senders in the lookup table if classified with sufficient confidence. The rest fell to the next stage. [Grbovic et al.](https://ar5iv.arxiv.org/html/1606.09296)
- Splunk raises a notable only past a summed threshold, and tells analysts to raise the threshold for low-confidence signals. [Splunk: adjust risk threshold](https://docs.splunk.com/Documentation/ES/7.1.1/RBA/AdjustRiskThreshold)
- Microsoft's Standard and Strict presets use lower BCL thresholds than the default (stricter). [Microsoft: BCL](https://learn.microsoft.com/en-CA/defender-office-365/anti-spam-bulk-complaint-level-bcl-about)

For Cluster: the Screener is already an abstain bucket. The missing piece is choosing the cut-off from a target, such as "at most 2 wrong labels per 100 labelled", and drawing the risk-coverage curve on the replay mailboxes.

### B7. Precision targets and how they are measured

- Gmail (2015): under 0.1% of inbox mail is spam, and under 0.05% of wanted mail lands in spam. [Official Gmail Blog, July 2015](https://gmail.googleblog.com/2015/07/)
- Yahoo reports recall above 85% at 0.5% false positive rate "in most cases", and precision and recall "in the 0.9 range". Labels came from 5 editors (about 18,000 messages), heuristics and users' own folders. [Grbovic et al.](https://ar5iv.arxiv.org/html/1606.09296)
- CrowdStrike defines accuracy as the share of Charlotte AI decisions that match its expert analysts. [Charlotte AI](https://www.crowdstrike.com/platform/charlotte-ai/)
- The Phishing Triage Agent's Performance tab tracks daily activity and mean time to triage. The incident queue card shows incidents addressed and resolved over the last 30 days. [Phishing Triage Agent](https://learn.microsoft.com/en-us/defender-xdr/phishing-triage-agent)
- Return Path's 2016 survey of 1,628 Gmail users: 9.2% of tab users said Gmail did not sort their email correctly. This is user perception, not measured precision. [MediaPost report](https://www.mediapost.com/publications/article/294358/are-your-emails-to-gmail-accounts-being-mislabeled.html)
- I found no vendor doc that publishes production precision or false positive rates for Sentinel, Splunk, Elastic, XSIAM, Sublime, Abnormal or Proofpoint.

For Cluster: the tools measure "agreement with the human", which is Cluster's fixes per 100. Two more numbers are worth tracking from the same data. "Not a scam" per 100 holds is the false positive rate for Stop. Screener share is the coverage.

### B8. User-reported emails as labels

- Defender: admins choose where user reports go. Microsoft runs the same checks on user reports as on admin ones. Admins can mark a verdict, and the reporting user is emailed automatically. [Microsoft: admin review of user reported messages](https://learn.microsoft.com/en-us/defender-office-365/submissions-admin-review-user-reported-messages), [Microsoft: submissions](https://learn.microsoft.com/en-us/defender-office-365/submissions-admin)
- User submissions are one of the alert types that start AIR. [Defender: AIR](https://learn.microsoft.com/en-us/defender-office-365/air-about)
- Proofpoint CLEAR analyses reported mail, removes copies from every recipient, and closes cases judged safe. (Vendor blog and press release.) [Proofpoint: CLEAR](https://www.proofpoint.com/us/corporate-blog/post/new-clear-solution-automation-email-reporting-through-remediation)
- Abnormal: when a report is malicious, it finds and removes other unreported emails from the same campaign. (Vendor page.) [Abnormal: AI Security Mailbox](https://abnormal.ai/resources/data-sheets/ai-security-mailbox)

For Cluster: when a user marks one email as a scam, apply it to every email in that sender case at once (Proofpoint and Abnormal's campaign cleanup). When they mark "Not a scam", that is the strongest label Cluster gets. Store it, use it, and show it in "What Cluster learned".

---

## Would previews help?

**The evidence**

- Yahoo's ablation on 6 categories (CIKM 2014, Table 8, average AUC): all features 0.973. Without the body 0.971. Content only (subject and body words) 0.964. Address only 0.897. Behaviour only 0.716. Taking the body out cost 0.002 AUC. [Grbovic et al.](https://ar5iv.arxiv.org/html/1606.09296)
- In the same system, about 92% of traffic never reached a per-message model. Rules and a sender table handled it. [Grbovic et al.](https://ar5iv.arxiv.org/html/1606.09296)
- A header-only study reports about 97% accuracy for phishing and 99% for spam. It is a non-peer-reviewed preprint on public datasets, so treat it as weak. [Beaman and Isah, arXiv 2203.10408](https://arxiv.org/abs/2203.10408v1)
- An Enron study says header-only matched header plus body and ran faster. The page I could reach gave no exact numbers. [Kitikusoun and Wisitpongphan, IJICT](https://ijict.iaescore.com/index.php/IJICT/article/view/21627)
- On the other side, Google's RiSER (WWW 2019) says HTML structure plus words beats strong text-only baselines on Gmail mail. I could not open the PDF, so I have no numbers, and it is about full bodies, not a one-line preview. [RiSER](https://research.google/pubs/riser-learning-better-representations-for-richly-structured-emails/)
- Gmail says it uses "what type of content is in the message" for tabs, without numbers. [Google Workspace blog](https://workspace.google.com/blog/productivity-collaboration/how-gmail-sorts-your-email-based-on-your-preferences)
- Security tools that read bodies (the Phishing Triage Agent's "email content analysis") do so for phishing verdicts, not for sorting. [Phishing Triage Agent](https://learn.microsoft.com/en-us/defender-xdr/phishing-triage-agent)
- I found no study that measures what a one-line snippet adds over headers. That gap is real.

**Verdict for Cluster**

Don't add previews to sorting. The best measured evidence says the body adds almost nothing once you have the sender, the subject and behaviour. The gain that exists sits in the small hard tail, about 8% of traffic in Yahoo's system, and Cluster already sends that tail to the Screener. A one-line preview carries far less than the full body Yahoo tested, so its gain should be smaller still. Against that, "headers only, apart from Today" is a simple promise that users can repeat. Breaking it for a gain nobody has measured is a bad trade.

If Cluster ever tests it, do it this way. Measure first on the replay mailboxes, for Screener mail only. Ship only if fixes per 100 drop clearly. Make it opt-in per email ("Look closer"), on device, never stored, and say so in `docs/privacy.md`. The scam link check stays as it is: it already reads the body only for mail flagged as a scam, which is where the security tools read bodies too.

---

## Top 10 ideas for Cluster, ranked

| # | Idea | Expected impact | Cost | Sources |
|---|---|---|---|---|
| 1 | **Sender cases.** All of a sender's mail in a time window is one row with one decision. New mail joins the open case. Cap by time. | High. Cuts decisions per screen by an order of magnitude. Builds on existing sender grouping. | S | [Sentinel](https://learn.microsoft.com/en-us/azure/sentinel/create-analytics-rules), [Google SecOps](https://docs.cloud.google.com/chronicle/docs/soar/investigate/working-with-alerts/alert-grouping-mechanism-admin), [Splunk RBA](https://help.splunk.com/en/splunk-enterprise-security-7/risk-based-alerting/7.3/introduction/how-risk-based-alerting-works-in-splunk-enterprise-security) |
| 2 | **"What Cluster may do alone" card.** Three tiers: Do it (hold scams, label marketing), Ask me (unsubscribe, trash), Off. Rule 1 in Defender's words. | High. Makes trust explicit. Mostly a re-framing of existing switches. | S | [Defender automation levels](https://learn.microsoft.com/en-us/defender-endpoint/automation-levels), [Defender XDR: no auto action on email](https://learn.microsoft.com/en-us/defender-xdr/m365d-configure-auto-investigation-response), [Charlotte AI](https://www.crowdstrike.com/platform/charlotte-ai/) |
| 3 | **Reason line plus evidence chips** on every label and hold, one click to correct. Extends plan step 4.9. | High. Users fix wrong labels faster, which lowers fixes per 100. | S to M | [Phishing Triage Agent](https://learn.microsoft.com/en-us/defender-xdr/phishing-triage-agent), [Abnormal](https://abnormal.ai/resources/data-sheets/ai-security-mailbox) |
| 4 | **Abstain by target.** Pick a target (for example 2 wrong per 100 labelled), draw the risk-coverage curve on the replay mailboxes, set the cut-off from it. Low-confidence mail goes to the Screener with a "Not sure" chip. | High for accuracy. Turns the Screener into a measured trade-off. | M | [Geifman and El-Yaniv](https://arxiv.org/abs/1705.08500), [Grbovic et al.](https://ar5iv.arxiv.org/html/1606.09296) |
| 5 | **"What Cluster learned from you".** Every correction listed as a plain rule with Remove. A new move that contradicts an old one asks once. | High. Makes learning visible and safe to undo. | M | [Phishing Triage Agent feedback page](https://learn.microsoft.com/en-us/defender-xdr/phishing-triage-agent), [Elastic exceptions](https://www.elastic.co/docs/solutions/security/detect-and-alert/reduce-noise-and-false-positives), [Gmail direct input](https://workspace.google.com/blog/productivity-collaboration/how-gmail-sorts-your-email-based-on-your-preferences) |
| 6 | **"Waiting for you" queue** for Ask-me actions, with Approve or Not now. Items expire after 7 days as "nothing happened". | Medium to high. One place for every decision. Safe default on timeout. | M | [Defender Action center](https://learn.microsoft.com/en-us/defender-xdr/m365d-autoir-actions), [Defender pending timeout](https://learn.microsoft.com/en-us/defender-endpoint/automation-levels), [Splunk SOAR Prompt](https://docs.splunk.com/Documentation/SOARonprem/latest/Playbook/PromptBlock) |
| 7 | **Sender profile tiers** in the engine and on the sender card: first email, rare, regular; you've written to them; you've said "Not a scam". New plus failed auth plus brand look-alike scores higher. | Medium. Better scam precision from data already in the index. | S | [Sublime sender profile](https://docs.sublime.security/docs/common-snippets), [Abnormal baselines](https://abnormal.ai/learning/anomaly-based-detection), [Taylor CEAS 2006](https://dblp.dagstuhl.de/db/conf/ceas/ceas2006.html) |
| 8 | **Three accuracy numbers, one place.** Fixes per 100 (agreement), "Not a scam" per 100 holds (false positives), Screener share (coverage). Show a 30-day trend in Diagnostics, like the triage agent's Performance tab. | Medium. Tells you whether changes help, and gives the beta an exit test. | S | [Phishing Triage Agent Performance tab](https://learn.microsoft.com/en-us/defender-xdr/phishing-triage-agent), [Charlotte AI accuracy definition](https://www.crowdstrike.com/platform/charlotte-ai/), [Gmail 0.05%](https://gmail.googleblog.com/2015/07/) |
| 9 | **One warning per sender per week**, plus "Don't warn me" that snoozes the warning but keeps the hold. | Medium. Less noise from Kai and Home. | S | [Elastic suppression and snooze](https://www.elastic.co/docs/solutions/security/detect-and-alert/reduce-noise-and-false-positives), [Sentinel suppression](https://learn.microsoft.com/en-us/azure/sentinel/create-analytics-rules) |
| 10 | **Template case summary** in one sentence per case, and scam reports applied to the whole sender case at once. | Medium. Faster reading, and one report cleans the whole campaign. | S | [Gemini case summary](https://docs.cloud.google.com/chronicle/docs/soar/investigate/working-with-cases/using-the-gemini-case-summary-widget), [Proofpoint CLEAR](https://www.proofpoint.com/us/corporate-blog/post/new-clear-solution-automation-email-reporting-through-remediation), [Abnormal campaign removal](https://abnormal.ai/resources/data-sheets/ai-security-mailbox) |

Not recommended: previews for sorting (see above), and any visible numeric risk score.

## What I could not verify

- Cortex XSIAM, Sublime and docs.splunk.com pages refused automated fetches. Those claims rest on the search engine's quote of the page and are marked.
- Torq has no public docs on its tiers. Only vendor blog and news pages.
- Abnormal and Proofpoint numbers are vendor claims, not independent.
- The Microsoft SIGIR 2017 reply paper and Google's RiSER and Email Category Prediction PDFs could not be read, so their feature ablations are not reported.
- Taylor's CEAS 2006 Gmail reputation paper: full text not found. The user-report detail comes from a citing paper.
- No primary source found for measured gains from a one-line snippet over headers.
