# Email security landscape, gaps, and how Cluster should recognise mail (2026-10-06)

Status: complete (2026-10-06). Sources are cited inline.
Conventions: **(Inference)** marks my reasoning, not a source. **[secondary]** marks a claim taken
from a search-result summary or a third-party write-up, not the vendor's own page. Code
citations are `path:line` in `C:\Users\samue\cluster-inspect` (HEAD `1a9fa7e`) or
`C:\Users\samue\projects\moat` (HEAD `68b3ea3`).

This note builds on, and does not repeat:
`2026-10-06-personas-phishing-and-web-security.md` (personas, timing, filters, link checking),
`2026-10-06-quarantine-destination.md` (where held mail goes),
`2026-10-06-founder-strategy-open-source-ethics-federated.md` (policy quotes, FL design, ideas),
`2026-10-05-algorithm-audit-and-upgrades.md` (U1-U16 upgrades, probes),
`2026-10-05-inbox-intelligence-research.md` §4 and §6.

## TL;DR

1. **Strong email security is enterprise-only.** Impersonation checks, mailbox intelligence, Safe Links and API tools (Abnormal, Material, Avanan, Sublime) need a Workspace or Microsoft 365 admin. A personal Gmail user gets Gmail's global filter and nothing personal on top.
2. **The costly attacks pass authentication.** BEC, invoice fraud, ESP abuse and hijacked threads arrive DMARC-aligned. Microsoft says so in its own docs. Context catches them: is this sender new, is the Reply-To new, does this domain look like one I already deal with.
3. **That context is in the user's own mailbox.** It is Cluster's edge. Microsoft's mailbox intelligence uses the same idea: history suppresses impersonation verdicts but never grants blanket trust.
4. **Header-only is blind to QR codes and body text.** Quishing works as well as normal phishing and evades detectors (AsiaCCS 2025). AI-written spear phishing matched human experts at 54% clicks. Say so. Offer opt-in, on-device checks for mail that is already flagged.
5. **Copy the open-source engines' shape.** SpamAssassin and Rspamd use named signals, learned weights and thresholds. Sublime's MIT rule repo (1,301 rule files, plus lists) is the model for header-only community rule packs.
6. **Cluster's recognition today is a flat sum of 10 hand weights.** Trust is by address string only. There is no PSL, a 7-domain free-mail list, Reply-To fires only for free mail, and the auth parser reads the first `dmarc=` token. Two audit bugs are now fixed: quarantine skips known contacts, and AI verdicts can only add protection.
7. **Proposed trust model, four layers:** personal history, then verified identity (aligned DMARC, BIMI list), then signed public lists, then community rules. Combine in log-odds with a few interactions and hard floors. Give up to three plain reasons per verdict.
8. **Learning:** a personal offset model on device, trained on releases, confirmations and replies. Global weights come only from public data (Nazario CC-BY-4.0, Phishing Pot CC BY-NC) and scams users forward themselves. Releases are signed and can only raise protection unattended.
9. **Old corpora predate DMARC.** Train auth features only on modern headers, or the model learns "has Authentication-Results means phishing".
10. **Moat and Cluster share three things:** one signed threat-data release, one Apache-2.0 detection library, and a local `externally_connectable` handshake with fixed ids.
11. **Gmail-derived domains may warn locally in Moat.** They must never reach Moat's federated training. Enforce it with a branded type, a runtime check and a property test, as Moat's own plan already requires.
12. **Store rules:** no install-time bundling and no promotional notifications. Prompt for the other extension once, in context, from a held-scam card.
13. **Top five, in order:** fix the auth parser, sign the datasets (fail closed for allow-lists), build the shared normalisation and PSL library, build the sender ledger with auth baselines, then rewrite the combiner with reason codes.

---

## 1. How other email security tools work

Four families. The split matters because it decides what data each tool sees and where.

- **Secure email gateway (SEG).** Sits in front of the mailbox. The domain's MX record points
  at the vendor. Sees every byte before delivery. Can rewrite links and hold mail.
- **API-based integrated cloud email security (ICES).** Connects to Microsoft 365 or Google
  Workspace through admin-granted APIs. No MX change. Reads mail after (or just as) it lands
  and pulls it back. Learns from the whole tenant's history.
- **Consumer.** One person connects one mailbox, or pastes a suspicious message into a tool.
- **Open source.** Scoring engines and rule sets anyone can run and read.

Cluster is a fifth shape that none of these occupy: a **consumer, client-side, header-only**
tool that runs in the user's own browser with the user's own OAuth token. (Inference)

### 1.1 Built into the mailbox provider

**Gmail (Google).**

| Aspect | What is documented |
|---|---|
| Detection | TensorFlow models over "thousands of potential signals", personalised because "what one person considers spam another person might consider an important message" ([Google Workspace blog](https://workspace.google.com/blog/product-announcements/ridding-gmail-of-100-million-more-spam-messages-with-tensorflow), via the algorithm note B.1). Google says Gmail blocks "more than 99.9% of spam, phishing and malware" ([Google, 2024](https://blog.google/products-and-platforms/products/gmail/gmail-holidays-2024-spam-scam/)) |
| RETVec | A character-level text vectoriser built to resist "insertion, deletion, typos, homoglyphs, LEET" ([arXiv 2302.09207](https://arxiv.org/abs/2302.09207)). Open source under Apache-2.0 at `google-research/retvec` (GitHub API, fetched today; last push 2025-04-04). Reported Gmail gains: spam detection +38%, false positives −19.4% ([The Hacker News](https://thehackernews.com/2023/11/google-unveils-retvec-gmails-new.html) **[secondary]**). The Google Security blog post body did not load (header only) |
| Bulk-sender rules (Feb 2024) | Senders of more than 5,000 messages a day to personal Gmail must "Set up SPF and DKIM", publish DMARC with the From domain aligned to SPF or DKIM, "support one-click unsubscribe", and keep spam rates "below 0.30%", ideally "below 0.10%". Mandatory "Starting February 1, 2024" ([Gmail sender guidelines](https://support.google.com/a/answer/81126)) |
| What it does with a verdict | "might show a warning or move the email to Spam" ([Gmail Help](https://support.google.com/mail/answer/8253)). Reporting spam sends Google "a copy of the email" ([Gmail Help](https://support.google.com/mail/answer/1366858)) |
| Gemini-era scam signals | Verified for Chrome, not for Gmail: Chrome Enhanced Protection gives Gemini Nano "the contents of the page" to find tech-support scams ([Google](https://blog.google/security/using-ai-to-stop-tech-support-scams-in/)). Google Messages runs on-device scam detection for chats ([Google](https://blog.google/security/new-ai-powered-scam-detection-features/) **[secondary]**). I found **no primary Google page** describing a Gemini scam warning inside Gmail itself. Press coverage instead describes prompt-injection abuse of Gemini's "summarize this email" ([digit.in](https://www.digit.in/news/general/gmail-users-beware-scammers-are-using-gemini-to-steal-your-password-heres-how.html) **[secondary]**) |
| Enhanced Safe Browsing in Gmail | The Gmail Help page I tried (`support.google.com/mail/answer/9585757`) returned 404. **Not verified this session.** |
| Privacy model | Google processes all mail on its servers |
| Price | Free for consumers |
| Documented weaknesses | It only sees what it sees globally. Attackers use legitimate infrastructure that passes the sender rules (see §2). Calendar invites carried "fake renewal notices" past the inbox path ([Google advisory, June 2026](https://blog.google/innovation-and-ai/technology/safety-security/fraud-scams-advisory-june-2026/), via the personas note) |

**Microsoft Exchange Online Protection (EOP) and Defender for Office 365 (MDO).**

| Aspect | What is documented |
|---|---|
| Free tier (EOP, every cloud mailbox) | Spoof intelligence, "first contact safety tip", and "unauthenticated sender indicators" ([anti-phishing policies](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about)). First contact fires "The first time they get a message from a sender" or when "They don't often get messages from the sender" (`SFTY:9.25`) |
| Composite auth | A composite verdict over SPF, DKIM and DMARC. "a composite authentication failure doesn't directly result in a message being blocked". Microsoft uses "a holistic evaluation strategy" to avoid blocking senders "who fail to conform to standard email authentication practices" (same page) |
| Impersonation (MDO only) | User impersonation, max "350 users" per policy. Domain impersonation, max "50 custom domains". Looks for similar domains like `contosososo.com`. Text: "Impersonation can pass email authentication checks (SPF, DKIM, and DMARC) if the attacker created a lookalike domain" (same page) |
| Mailbox intelligence | "uses artificial intelligence (AI) to determine user email patterns with their frequent contacts". Impersonation protection "doesn't work if the sender and recipient previously communicated via email" (same page). History suppresses impersonation verdicts. It does not grant blanket trust |
| Thresholds | Four phishing thresholds from "Standard" to "Most aggressive". "The chance of false positives ... increases as you increase this setting" (same page) |
| Safe Links (MDO) | "URL scanning and rewriting of inbound email messages during mail flow, and time-of-click verification". Links are wrapped to `*.safelinks.protection.outlook.com`. "URLs that don't have a valid reputation are detonated asynchronously". Option to hold mail until scanning finishes ([Safe Links](https://learn.microsoft.com/en-us/defender-office-365/safe-links-about)) |
| Safe Attachments (MDO) | Detonation "in a virtual environment". "Typically, email attachment scanning completes within 15 minutes". Dynamic Delivery delivers the body with placeholders ([Safe Attachments](https://learn.microsoft.com/en-us/defender-office-365/safe-attachments-about)) |
| What it does with a verdict | Junk folder, quarantine, redirect, Bcc, delete. Users cannot release malware or high-confidence phishing themselves (quarantine note §2) |
| Privacy model | All processing in Microsoft's cloud. Safe Links "Track user clicks" stores click data |
| Price | EOP included with Exchange Online. MDO Plan 1 and 2 are paid add-ons (the docs advertise a "90-day Defender for Office 365 trial") |
| Documented weaknesses | Microsoft lists them itself. Safe Links "doesn't provide protection for URLs in rich text format" mail and "ignores S/MIME signed messages". With API-only checking: "The link was legitimate on delivery, but was later weaponized ... Jim is phished". "Using another service to wrap links before Defender ... might prevent Safe Links from processing links". If policy can't be read, "the user is redirected to the clicked link" ([Safe Links](https://learn.microsoft.com/en-us/defender-office-365/safe-links-about)). First contact tip is not stamped on S/MIME mail or for mailboxes "created less than seven days ago" ([anti-phishing](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about)) |

### 1.2 Secure email gateways (SEG)

| Product | How it detects | Where it runs, what it sees | Verdict handling | Privacy | Price tier | Known weaknesses and notes |
|---|---|---|---|---|---|---|
| **Proofpoint** (Email Protection, TAP) | Multi-stage attachment sandboxing, URL rewriting with time-of-click detonation, threat intel ("NexusAI") **[secondary: search summary of third-party pages, not Proofpoint docs]** | MX gateway, full message | Block, quarantine, rewrite links | Vendor cloud sees all mail | Enterprise | Proofpoint bought **Tessian** (closed 19 Dec 2023), adding behavioural ML for misdirected mail and exfiltration ([Proofpoint press release](https://www.proofpoint.com/us/newsroom/press-releases/proofpoint-signs-definitive-agreement-acquire-tessian); close date [secondary: itpro.com](https://itpro.com/business/acquisition/proofpoint-closes-acquisition-of-email-security-firm-tessian)) |
| **Mimecast** (Targeted Threat Protection) | URL Protect (rewrite, click-time check). Impersonation Protect counts identifiers: display-name similarity to internal users, a reply-to mismatch "between the sender's email address (both Header and Envelope), and the Reply-to", and "newly observed domain" (a domain whose sending volume rose in the last week, "created at any time"). A "Number of Hits" setting decides how many identifiers must match, with "at least two" recommended ([Mimecast Community definitions](https://community.mimecast.com/s/article/email-security-cloud-gateway-ttp-impersonation-protection-impersonation-protection-definitions) **[secondary: search summary of that page]**) | MX gateway | Hold, tag, bounce | Vendor cloud | Enterprise | Its own page says the newly-observed list "may not contain every potential threat since not all email traffic is visible" (same). The "count hits, need two" design is a good fit for Cluster (§4) |
| **Barracuda** (Email Gateway + Impersonation Protection, formerly Sentinel) | Gateway filtering, plus an API product whose AI learns "historical communication patterns" and maps "the social networks of every individual" from metadata and content ([Barracuda Sentinel datasheet](https://assets.barracuda.com/assets/docs/dms/Barracuda_Sentinel_DS_US.pdf) **[secondary: search summary]**) | Gateway and Microsoft 365 API | Quarantine | Vendor cloud | SMB to enterprise | Not researched in depth |
| **Cloudflare Area 1** (now Cloudflare Email Security) | "proactively crawls the web to discover phishing campaigns" and blocks attacker infrastructure early, plus ML on attachments, sender domains and "sentiment" ([Cloudflare Gmail brief PDF](https://cf-assets.www.cloudflare.com/slt3lc6tev37/2OiIoCoWSfWNq2ItZFvIeN/d28f52bdcc7b63d71bcd4aa750284e74/BDES-3928_Gmail-Security-Solution-Brief.pdf) **[secondary: search summary]**) | Inline MX, or API / journaling | Block, quarantine, retract | Vendor cloud | Enterprise | Not researched in depth. Pre-emptive infrastructure discovery is the idea Moat's daily lists approximate for free (Inference) |

### 1.3 API-based ICES

| Product | How it detects | Where / data | Verdict handling | Price | Weaknesses and notes |
|---|---|---|---|---|---|
| **Abnormal Security** | "learns every identity, relationship, and communication pattern" and "detects the abnormal". "Deploy in 60 seconds via API. No MX changes." Integrations: "Microsoft 365, Google Workspace, Okta, CrowdStrike" ([Abnormal platform](https://abnormal.ai/platform)). Marketing cites "43,000+ signals" to build "a known good baseline" ([Carahsoft listing](https://www.carahsoft.com/learn/resource/19500-secure-your-cloud-email) **[secondary]**) | Vendor cloud reads the whole tenant through Graph / Gmail APIs, including history and identity logs | Removes mail after delivery | Enterprise | Post-delivery removal leaves a short window where the user can see the message (Inference, intrinsic to API mode). Opaque to the user |
| **Material Security** | API platform for Google Workspace and Microsoft 365. "Phishing Herd Immunity", leak prevention, account-takeover prevention ([Material](https://material.security/lp-email-security) **[secondary: search summary]**). How "herd immunity" works is **not documented** on pages I reached | Vendor cloud via APIs | Remediates after delivery | Enterprise | Not verifiable |
| **IRONSCALES** | Mailbox-level anomaly detection plus a crowdsourced network. When an accredited analyst confirms a phish, IRONSCALES "pushes out this intelligence automatically to all their clients". Claims "17,000+ organizations" and that "more than 40%" of detections come from the community ([Expert Insights review](https://expertinsights.com/insights/ironscales-overview/) **[secondary]**) | Vendor cloud via APIs | Removes from all inboxes | SMB to enterprise | **A model for Cluster's community rule packs**: a human confirms, then everyone is protected. Cluster can copy the shape without the server (§3) |
| **Avanan / Check Point Harmony Email** | "API-based inline": scans before the inbox using API hooks, with a patent on the method ([Check Point white paper](https://www.checkpoint.com/resources/items/white-paper-a-revolutionary-approach-to-api-based-inline-email-security) **[secondary: search summary]**) | Vendor cloud, Microsoft 365 and Gmail | Holds before the user sees it | Enterprise | Needs admin-level API access a consumer cannot grant (Inference) |
| **Sublime Security** | Rules in **MQL**, "Sublime's domain-specific language purpose-built for email" ([MQL docs](https://docs.sublime.security/docs/message-query-language)). The rule feed is public: `sublime-security/sublime-rules`, **MIT**, 1,301 files under `detection-rules/`, pushed today (GitHub API). Supporting lists in `sublime-security/static-files` (MIT) | Self-hosted or vendor cloud, full message via API | Rules raise alerts or auto-act | Free platform tier and paid tiers [secondary]. Feed is free | See §1.3.1 |
| **Tessian** (now Proofpoint) | Behavioural ML for inbound threats and for misdirected or exfiltrated outbound mail ([Proofpoint](https://www.proofpoint.com/us/newsroom/press-releases/proofpoint-signs-definitive-agreement-acquire-tessian)) | Vendor cloud | Warns the sender in the moment | Enterprise | Outbound focus is out of Cluster's scope |

#### 1.3.1 Sublime's open rule repo as a model for Cluster's community rule packs

A real rule, `detection-rules/bec_contract_order_lure_reply_to_mismatch.yml` (fetched via the
GitHub API today):

```yaml
name: "BEC/Fraud: Contract or order lure with mismatched reply-to"
severity: "medium"
source: |
  type.inbound
  and any(headers.reply_to, .email.email != sender.email.email)
  and regex.icontains(subject.subject, '(?:contract agreement|order)_\d{8}\b')
  and regex.icontains(body.current_thread.text, 'attached (?:contract agreement|order)')
attack_types: ["BEC/Fraud"]
detection_methods: ["Header analysis", "Content analysis"]
id: "d5bc416a-9289-5827-a748-2b7f1f31736d"
```

A second rule, `asr_new_sender_or_reply_to_with_new_linked_dom.yml`, uses
`network.whois(sender.email.domain).days_old <= 30`. Domain age is a first-class input.

The static lists (`sublime-security/static-files`, MIT) include `free_email_providers.txt`,
`org_brand_names.txt`, `suspicious_tlds.txt`, `url_shorteners.txt`,
`replyto_service_domains.txt`, `bulk_mailer_url_root_domains.txt`,
`high_trust_sender_root_domains.txt`, `email_forwarding_domains.txt`,
`suspicious_subjects_regex.txt`, `self_service_creation_platform_domains.txt` and
`tranco_top_10k.csv` (GitHub API listing today).

Design points worth copying (Inference, from the repo shape):

1. **One rule, one file, one stable UUID.** Diffs are reviewable. A user can switch off one id.
2. **Declared metadata**: `attack_types`, `tactics_and_techniques`, `detection_methods`,
   `severity`. That metadata is exactly what a plain-words explanation needs.
3. **Reference lists live apart from rules**, so a list update never touches rule logic.
4. **Test fixtures and CI**: the repo has an `emls/` folder and `.github/workflows`.
5. **Several feeds**: the README links third-party rule feeds (DelivrTo, vector-sec,
   amitchell516). Users can subscribe to more than one pack.
6. **Gap coverage**: 24 detection-rule filenames mention `qr` and 50 mention `callback`
   (GitHub tree, today). Most of these read the body or attachments, which Cluster does not.

What Cluster cannot copy: MQL's body, attachment, OCR and WHOIS functions. A Cluster pack must
be a **header-only subset** (From, display name, Reply-To, subject, auth verdicts, attachment
names, sender history) evaluated inside the extension. The MIT licence lets Cluster vendor
lists like `free_email_providers.txt` and `replyto_service_domains.txt` into a GPL-3.0 build
with attribution. (Inference: MIT is GPL-compatible.) Those two lists fix two known Cluster
weaknesses directly: the 7-domain free-mail set (`src/lib/threatSignals.ts:121`) and the
missing Reply-To service allow-list (`src/lib/threatSignals.ts:299-311`).

### 1.4 Consumer tools

| Product | How it detects | Where / data | Verdict handling | Privacy | Price | Notes |
|---|---|---|---|---|---|---|
| **Guardio** | Connect Gmail. Detects "harmful emails that make it past your spam filter". Push alert, dashboard entry, and a Gmail label "Flagged by Guardio" ([Guardio help](https://help.guard.io/hc/en-us/articles/16222692346388) **[secondary: search summary; the page returned 403 in an earlier session]**) | (Inference) Server-side, since it alerts a phone with the browser closed | Labels in place. Does not move | Vendor processes mail | Paid | Gmail only [secondary]. Closest consumer competitor (personas note D.3) |
| **Norton Genie / Safe Email** | "uses Natural Language Processing (NLP) and machine learning to proactively scan the subject lines, sender addresses, and body text". Gmail and Outlook. Only scans mail received after connecting. May ask consent to keep a flagged message "for up to 30 days in 'raw form' to improve their AI models" ([Norton support](https://support.norton.com/sp/en/us/home/current/solutions/v20250307183526342) **[secondary: search summary]**) | Cloud. Gen Digital runs Genie on AWS ([AWS case study](https://aws.amazon.com/solutions/case-studies/gen-digital-video-case-study/) [secondary]) | Flags safe or suspicious | Body text leaves the device | Norton 360 tier with Genie Pro [secondary] | Reads bodies on a vendor server |
| **Bitdefender Scamio** | Chatbot. Paste text or links, or upload screenshots. Free ([Bitdefender](https://www.bitdefender.com/en-us/consumer/scamio)) | Not stated | Answer in chat | User chooses what to share | Free | Reactive. Only helps if the user already suspects |
| **Proton Mail** | Server-side filtering on arrival. Third-party mail is "encrypted with the recipient's public key upon reaching Proton Mail's servers". Each account's filter adjusts when you mark spam or not spam, and mail from contacts is allowed through ([Proton blog](https://proton.me/blog/encrypted-email-spam-filtering) **[secondary: search summary]**). PhishGuard adds warnings (quarantine note §2) | Proton servers | Spam folder, warnings | Strong at rest. Scanning still happens on arrival | Free and paid | Only for Proton mailboxes |
| **Apple Mail Privacy Protection** | Not a phishing filter. It hides the IP address, and "remote content is privately downloaded in the background when you receive a message", through two relays run by different entities ([Apple Support](https://support.apple.com/guide/mail/mlhlp1205/mac) **[secondary: search summary; support.apple.com was blocked to the fetcher]**) | Apple relays | n/a | Defeats tracking pixels and open tracking | Free | A privacy control that also blunts "did they open it" reconnaissance (Inference) |

### 1.5 Open-source scoring engines

| Engine | Design | Reusable for Cluster |
|---|---|---|
| **Apache SpamAssassin** (Apache-2.0, `apache/spamassassin`, pushed today per GitHub API) | Many independent rules, each with a score. Mail is spam when the sum passes a threshold. Scores come from optimisation over contributed corpora: "The scores are assigned using a neural network trained with error back propagation" (2.x used "a genetic algorithm"). The aim is to "minimize the number of false positives and false negatives". Users feed it through "NightlyMassCheck and RescoreMassCheck". Because rules are scored independently, "BAYES_80 with a higher score than BAYES_99" can happen. "A score of 0 will stop a rule from being run" ([SpamAssassin wiki](https://cwiki.apache.org/confluence/display/SPAMASSASSIN/HowScoresAreAssigned)) | **Rule as a named feature with a learned weight.** Every hit has a name the user can read. Weights are fit offline on corpora, then shipped. Mass-check is a community evaluation loop where contributors run rules locally and send back only hit statistics. (Inference) Cluster must not run mass-check over Gmail data (founder note §1.2, class G2), but it can run it on public corpora and on scams users forward themselves (G4) |
| **Rspamd** (GitHub licence field "Other"; docs say "Apache 2.0 license") | "Each message is analyzed by multiple independent checks (called symbols) that contribute to a cumulative spam score". Actions by threshold. Bayes with "per-user and per-language training". A neural module, "Multi-layer perceptron with rule outputs as inputs", that "automatically learns optimal symbol weight combinations". Fuzzy hashes. SPF, DKIM, DMARC and ARC modules. A phishing module that "detects lookalike domains via URL processing" ([Rspamd features](https://docs.rspamd.com/about/features)) | **Symbols, then per-user Bayes, then a learned combiner over symbol outputs.** This is close to what Cluster should be: deterministic header symbols, a tiny per-user model on top, trained only on the user's own releases and reports |

(Inference) Both engines prove one design. Named, explainable signals sit at the bottom. Learned
weights sit in the middle. Thresholds that map to actions sit at the top. Neither needs a vendor
server to score. Both need a labelled corpus to set weights, and that is the part Cluster must
source from public data.

## 2. Where they fall short

Each row is a gap, the evidence, and who suffers. "Cluster today" is a short pointer. §3 says
what Cluster can do about it.

| # | Gap | Evidence | Who it hurts most |
|---|---|---|---|
| G1 | **Consumer coverage.** The strong tools are enterprise-only | Impersonation protection, mailbox intelligence, Safe Links and Safe Attachments are MDO features, not EOP ([anti-phishing](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about), [Safe Links](https://learn.microsoft.com/en-us/defender-office-365/safe-links-about)). Abnormal, Material, Avanan, Sublime, IRONSCALES all need admin API grants on a Workspace or Microsoft 365 tenant (§1.3). A personal @gmail.com user gets Gmail's global filter and nothing personal on top | Older adults, sole traders, students (personas 1-3) |
| G2 | **Privacy.** Content is scanned on vendor servers | Norton reads "subject lines, sender addresses, and body text" in the cloud and may keep flagged mail "for up to 30 days in 'raw form'" [secondary, §1.4]. Every ICES and SEG processes full messages off-device (§1.2-1.3). Unroll.me's FTC case is the cautionary tale (inbox note §6) | Anyone who won't hand a company their inbox, high-risk users (A5) |
| G3 | **BEC with no link or attachment** | Microsoft: "Impersonation can pass email authentication checks (SPF, DKIM, and DMARC) if the attacker created a lookalike domain" ([anti-phishing](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about)). Link and attachment sandboxes have nothing to detonate. IC3 2025 BEC losses $3.05B (personas note, evidence base) | Small businesses, home buyers (A3), freelancers |
| G4 | **Conversation (thread) hijacking** | Attackers with mailbox access "reply within existing email conversations". Qakbot and Emotet "harvested email content ... to build convincing replies within existing threads" ([Abnormal glossary](https://abnormal.ai/learning/what-is-thread-hijacking) **[secondary]**). The reply comes from a known sender and passes DMARC, so history-based trust *helps* the attacker (Inference) | Small businesses, anyone with suppliers |
| G5 | **QR-code phishing (quishing)** | In a field study across organisations ("over 71k emails"), "quishing emails" were as effective as traditional phishing while being "harder for detectors to identify" ([Weinz et al., AsiaCCS 2025, arXiv 2505.12104](https://arxiv.org/abs/2505.12104)). In a USENIX Security 2025 study of 1,876 participants, only 13% recognised fraudulent QR payment requests vs 46% for manually entered details ([Kowalewski et al.](https://www.usenix.org/conference/usenixsecurity25/presentation/kowalewski) **[secondary: figures via search summary]**). The QR is an image, so header-only tools never see it | Everyone. Mobile users |
| G6 | **Callback phishing (TOAD)** | Proofpoint saw "10 million TOAD attacks per month, on average" with a peak of 13 million in August 2023 ([Proofpoint 2024 State of the Phish](https://www.proofpoint.com/us/newsroom/press-releases/proofpoints-2024-state-phish-report-68-employees-willingly-gamble) **[secondary: search summary of Proofpoint pages]**). The mail is often only a phone number and a fake invoice. IC3 2025 Tech/Customer Support losses $2.13B (personas note). Sublime keeps 50 rule files on it (§1.3.1) | Older adults (persona 3), small business |
| G7 | **Lookalike or abuse on legitimate ESPs** | A field report of 27 phishing emails sent through Twilio SendGrid found all passed SPF and none failed DMARC; one campaign used a compromised OpenAI SendGrid account and "passed SPF, DKIM and DMARC checks for openai.com" ([Keepnet](https://keepnetlabs.com/blog/twilio-send-grid-phishing-examples-27-real-emails-that-passed-authentication), [Kaseya](https://www.kaseya.com/blog/how-threat-actors-use-sendgrid-and-callback-phishing-for-openai-scam/) **[secondary: vendor blogs]**). Sublime ships `replyto_service_domains.txt` and `self_service_creation_platform_domains.txt` because DocuSign, Google Drive, Dropbox and Adobe Sign notifications are abused (rule names `abuse_docusign_unsolicited_reply-to.yml` etc.) | Everyone. Hard for every vendor |
| G8 | **Compromised legitimate accounts that pass DMARC** | Same as G4 and G7. Authentication proves the domain, not honesty: RFC 8601 §7.2 (algorithm note B.2) | Supplier chains, older adults whose friends get hacked |
| G9 | **AI-written scams** | Fully automated LLM spear phishing reached a 54% click-through rate, equal to human experts and against 12% for generic phishing ([Heiding, Lermen, Kao, Schneier, Vishwanath, arXiv 2412.00586](https://arxiv.org/abs/2412.00586)). LLM-assisted phishing in the AsiaCCS field study: "over 30% of the emails opened led to visiting the landing webpage" at one organisation ([arXiv 2505.12104](https://arxiv.org/abs/2505.12104)). Grammar and spelling cues stop working (Inference) | Everyone. Content-language filters lose their edge |
| G10 | **Non-English mail** | Most phishing datasets are English, and E-PhishGen reports existing methods degrade on its multilingual set ([E-PhishGen, CEUR-WS Vol-4178](https://ceur-ws.org/Vol-4178/paper4.pdf) **[secondary: search summary]**). Cluster's lure regex is English-only (`src/lib/threatSignals.ts:291-292`) | Newcomers (A4), non-English households |
| G11 | **Small-business invoice and bank-detail fraud** | Mimecast and Microsoft protect *the customer's own* domains and VIPs (max 50 domains, 350 users). A sole trader has no admin and no protected-domain list (§1.1, §1.2). The supplier is not in any brand list | Store owners (persona 2), freelancers |
| G12 | **Older adults** | IC3 2025, age 60+: 201,266 complaints, $7.748B lost; Phishing/Spoofing and Tech Support top the count (personas note). Older users' susceptibility "remained stable" over 21 days ([Lin et al., TOCHI 2019](https://doi.org/10.1145/3336141) [secondary]). Warnings get clicked through, holds don't (quarantine note §3) | Persona 3, caregivers (A1) |
| G13 | **Explainability** | Gmail and Outlook categorisation explain nothing to the user (algorithm note B.1). Abnormal and Material are model verdicts. Microsoft is the exception with fixed safety-tip text ("You don't often get email from…") | All. Trust and appeals |
| G14 | **False positives on small senders** | Microsoft warns that raising thresholds raises false positives ([anti-phishing](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about)). Gmail's bulk rules expect SPF, DKIM, DMARC and one-click unsubscribe ([Gmail](https://support.google.com/a/answer/81126)), and a small sender with a misconfigured domain looks like a forger. Cluster's own probe: "Chase Miller" on gmail.com, "Apple Valley Library" and "Spotify Discover Weekly" trip brand checks (algorithm note A.5) | Small legitimate senders, freelancers, community groups |
| G15 | **Link rewriting breaks things** | Safe Links rewriting changes every URL, Teams links can need re-authentication with `SameSite=Strict` cookies, and "Using another service to wrap links before Defender ... might prevent Safe Links from processing links" ([Safe Links](https://learn.microsoft.com/en-us/defender-office-365/safe-links-about)) | Admins, users of multiple security layers |
| G16 | **Time-of-click vs time-of-delivery** | "The link was legitimate on delivery, but was later weaponized ... Jim is phished" when click-time checks are off or the client doesn't support them ([Safe Links](https://learn.microsoft.com/en-us/defender-office-365/safe-links-about)). Safe Attachments "Typically ... completes within 15 minutes", which is a delay or a window ([Safe Attachments](https://learn.microsoft.com/en-us/defender-office-365/safe-attachments-about)). API tools remove mail after delivery (§1.3). Cluster itself only acts every 6 hours today (personas note, TL;DR 1) | Everyone |

Three cross-cutting observations (Inference):

1. **The expensive gaps are identity gaps, not content gaps.** G3, G4, G7, G8, G11 all pass
   authentication. What catches them is context: is this a new sender, a new Reply-To, a new
   bank detail, a domain that looks like one I already deal with. That context lives in the
   user's own mailbox, which is exactly what a personal on-device tool can see.
2. **The content gaps (G5 QR, G9 AI text) are where header-only tools are blind.** Be honest
   about it. Body or attachment checks must be opt-in and on-device.
3. **No consumer tool explains itself well.** Cluster can win on G13 at low cost.

## 3. How Cluster fills each gap

Constraints, restated once. No Cluster server. Headers by default (`src/lib/gmailApi.ts:291-305`
fetches From, Reply-To, List-Unsubscribe(-Post), Subject, Authentication-Results,
DKIM-Signature, Precedence, Auto-Submitted). Gmail filters for Chrome-closed actions. An optional
on-device model. Moat for the web. Policy class names (G1-G8) are from the founder note §1.2.

Policy status key: **allowed** = fits the quoted Google and Chrome Web Store texts as read in
the founder note. **grey** = defensible but worth a written check. **blocked** = conflicts with
the Workspace AI/ML clause or Limited Use.

| Gap | Cluster approach | Data needed | Policy | Effort | Honest limit |
|---|---|---|---|---|---|
| G1 consumer coverage | The whole product. Free, one Chrome install, personal @gmail.com works | Headers, own OAuth token | allowed | (exists) | Chrome must be open for anything beyond Gmail filters (personas note B.2) |
| G2 privacy | Everything scores on device. Datasets are download-only and signed. No telemetry. Body reading only per message on user action, or opt-in for already-flagged mail (personas note B.5) | None leaves the device | allowed | S (signing, see U14) | Users must trust the extension build. Verified CRX uploads and provenance help (founder note §2.4) |
| G3 BEC, no link | **Identity-change signals**: first contact by count, Reply-To to an unrelated registrable domain, lookalike of a domain *the user already corresponds with* (personal lookalike), payment-change words in the subject. Hold plus the call-back card (founder note §5.1-5.2) | Headers + sent-mail correspondents (`src/lib/screener.ts:27-55`) + sender ledger | allowed | M | Subject-only wording is weak. A fraudster with a fresh, unrelated domain and a neutral subject passes |
| G4 conversation hijack | Per-sender **auth and infrastructure baseline**: remember which DKIM `d=` domain and which Reply-To a known correspondent normally uses. Flag "known sender, new Reply-To" and "known sender, auth changed from pass to none/fail". Raise, never lower | Headers already fetched. Store only counts and domain names per sender | allowed | M | A hijacked real mailbox sends real, aligned mail. If Reply-To is unchanged there is nothing in the headers. Say so |
| G5 quishing | **Header-only:** cannot see the code. **Proxy**: image or PDF attachment (`filename:png`, `filename:pdf`) + first contact + brand claim or lure subject → elevated. **Opt-in deep check** for already-elevated mail only: fetch the image attachment, decode on device with `BarcodeDetector` (an "experimental technology", available in workers per [MDN](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector); platform support must be tested) or a bundled decoder, check the decoded host against the signed list, discard the bytes | Attachment names via `filename:` search (`src/lib/riskyAttachments.ts:296-303`); attachment bytes only on opt-in | allowed (opt-in, user-facing feature); grey if done silently for all mail | M-L | No decode without fetching the attachment. QR in HTML body images is not an attachment and stays invisible |
| G6 callback / TOAD | **Phone number in subject or display name** regex (international formats), brand claim (Norton, Geek Squad, PayPal, Microsoft) from a non-brand domain, invoice/renewal words, first contact. Hold, then "Don't call the number in this email" card (founder note §5.2). Optional opt-in: scan snippet for a phone number | Subject, display name; snippet only if opted in | allowed | S | Most TOAD numbers sit in the body or a PDF. Header-only catches the minority that put it in the subject (Inference) |
| G7 ESP / platform abuse | **Infrastructure tag**: classify the DKIM `d=` and Reply-To against a shared-platform list (DocuSign, Google Drive, Dropbox, Adobe Sign, SendGrid, Mailchimp; seed from Sublime's MIT `replyto_service_domains.txt` and `self_service_creation_platform_domains.txt`). Rule: "brand or document-share notification + Reply-To to free mail or an unrelated domain + first contact" | Headers (DKIM-Signature already fetched) | allowed | S-M | A pure platform notification with no Reply-To twist looks normal. Moat covers the landing page |
| G8 compromised accounts | Same baseline as G4, plus a **money-request tripwire** that ignores history: "bank details changed", "new account", "wire" from anyone, even known contacts, triggers the call-back checklist instead of a hold (founder note §5.1) | Subject | allowed | S | Words vary. Needs language packs |
| G9 AI-written scams | Don't fight on text quality. Lean on identity and infrastructure, which AI does not change. Optional "second opinion" with Chrome's on-device Prompt API, user-triggered, one message (founder note §5.14) | Headers; body only on click | allowed (on device, user-triggered) | M | On-device LLMs can be prompt-injected by the email itself. Output may only raise suspicion, never clear it (algorithm note U12, already enforced for kinds at `src/lib/aiMessageKind.ts:144-159`) |
| G10 non-English | Language packs as **signed community rule packs** (lexicons per language). Detect a sender's language over several subjects with Chrome's Language Detector (algorithm note B.2, U10) | Subjects | allowed | M | Coverage depends on contributors |
| G11 small-business invoice fraud | **Pinned domains**: the user pins "people I pay" (founder note §5.13). Lookalike checks run against pinned domains and against domains in the user's correspondent history, not only the 37 brands (`src/lib/data/brandDomains.json`) | Sent-mail correspondents, pinned list (local) | allowed | M | Pinning needs one setup step. Offer it in the "Running a shop" persona mode |
| G12 older adults | Hold, don't warn. Label name is the warning. Three reasons max. Caregiver mode only with safeguards (quarantine note §5, founder note §4.4) | none new | allowed | (designed) | A hold that swallows a real bank alert is a harm. Keep holds to high confidence |
| G13 explainability | Every signal is a named **reason code** with fixed plain text and up to four per verdict (algorithm note C.2). Rule packs carry their own human text, like Sublime's `description` | none | allowed | M | Requires the scoring refactor in §4 |
| G14 small-sender false positives | Two-signal rule for holds (Mimecast's "at least two"). Personal history suppresses impersonation verdicts (Microsoft mailbox intelligence pattern). Common-word brand stop list. Release teaches the personal model | Local history | allowed | M | Some first-time real senders will still be held. Make release one tap and keep 30 days |
| G15 link rewriting | Never rewrite links. Moat warns at navigation instead, so mail stays intact | none | allowed | (design rule) | No click-time check from a phone. Moat is desktop Chrome only |
| G16 time of click vs delivery | Delivery: Gmail filters for known-bad domains and user blocks (personas note B.3). Arrival: 1-minute `history.list` lane while Chrome runs (personas note B.4). Click: Moat blocks the domain on the web, using fresher lists than the mail was scored with | Signed lists, local handshake | allowed | M | Phone clicks are unprotected. Filters cap at 1,000 per account (personas note B.3) |
| G2 vs learning | Per-user model on device. Global weights only from public and user-forwarded data. **No federated learning on Gmail-derived data** | — | FL on Gmail data: **blocked** (founder note §1.3 a-b) | — | "Learns from everyone" is only true for Moat's web model and for human-reviewed rule packs |

What Cluster should not attempt (Inference):

- **Sandboxing attachments or detonating links.** Needs a server or a VM. Moat plus signed
  lists is the substitute.
- **Domain-age lookups for every sender.** RDAP is an outbound request that names the sender's
  domain (personas note B.1). If offered, make it opt-in, per first-contact domain, and say so in
  the UI. A better default is a **signed "newly seen domains" list** built offline from public
  feeds, the same way Mimecast's "newly observed domain" works, but without anyone's mail.
- **Silent body scanning.** It contradicts `docs/privacy.md` and the product's promise.

## 4. How Cluster recognises mail today vs how it should

### 4.1 The decision path in one picture

```
Gmail/Outlook metadata ──► provider adapter ──► NormalizedMessageMetadata
  (gmailApi.ts:291-305)     (gmailProvider.ts:128-149, outlookProvider.ts:138-179)
        │
        ├─► scoreSenderIdentity  (threatSignals.ts:336-362)  blocklist, punycode, brand, lookalike
        ├─► scoreMessageAuthentication (threatSignals.ts:369-371) DMARC / SPF+DKIM fail
        ├─► scoreMessageContext  (threatSignals.ts:377-386)  Reply-To, lure, risky attachment
        │        merged per sender (senderModel.ts:120-155)
        ▼
  senderRiskScore = Σ weight + 1 per high-confidence signal (threatSignals.ts:403-426)
  riskTier: high ≥ 6, elevated ≥ 3 (threatSignals.ts:428-432)
        │   ± quarantine review nudge −1 / +1 (quarantineReview.ts:30-36)
        ▼
  runQuarantine: opt-in; skip known correspondents unless auth failed (background.ts:191-210)

Separately, trust for *cleanup* (not security):
  protectionDecision (protectionPolicy.ts:126-159) ─ starred → provider-important → known
  correspondent → offer/window regex → transactional kind → sensitive subject → "other" w/o bulk
```

Two things changed since the 2026-10-05 audit, both verified in today's code:

- `runQuarantine` now skips known correspondents unless DMARC failed or SPF and DKIM both
  failed (`src/background.ts:197-209`). The audit's "Chase Miller on gmail.com gets moved" case
  is fixed for people the user has emailed.
- The on-device AI may only take a verdict that adds protection
  (`src/lib/aiMessageKind.ts:144-159`). U12 is partly done.

### 4.2 Signal inventory

"Trust" rows make mail *more* trusted. "Distrust" rows make it *less* trusted. Many signals are
two-sided and should be.

| Signal | Direction | How computed today | Where | Weakness | Improvement |
|---|---|---|---|---|---|
| **DMARC verdict** | Distrust on fail. Not used for trust | First `dmarc=` token anywhere in the selected Authentication-Results header | `src/lib/emailAuth.ts:50-54`, used at `src/lib/threatSignals.ts:267-285` | Comment injection and ARC comments can make a fail read as pass (algorithm note A.4, probes). `bestguesspass`, `temperror`, `permerror` become "unknown" | Tokenised parser (U1). Then use **aligned DMARC pass** as a *trust* input, not only fail as distrust |
| **Trusted authserv-id** | Gate for all auth | Gmail: exactly `mx.google.com`. Outlook: any `*.outlook.com` | `src/lib/emailAuth.ts:29-48` | Outlook suffix trust is forgeable and Microsoft's documented header has no authserv-id (algorithm note A.4) | U2: verify on a live Outlook header; fall back to `compauth` |
| **SPF / DKIM** | Distrust only when both fail and DMARC isn't pass | Regex as above | `src/lib/threatSignals.ts:281-283` | First `dkim=` wins even when an unaligned signature passed and the aligned one failed | Reuse the tokenised `dkim=pass ... header.d=` walker that already exists for RFC 8058 (`src/lib/unsubscribe.ts:38-50`). Record the **aligned DKIM d=** per message |
| **ARC** | none | Not parsed (and harmful when the regex reads its comment) | — | — | Ignore for scoring. Use only to explain forwarded failures (RFC 8617 is Experimental; inbox note §4a) |
| **BIMI / VMC** | none | Not used | — | Gmail does not expose the checkmark through the API (inbox note §4a). Gmail BIMI needs "a Verified Mark Certificate (VMC) or a Common Mark Certificate (CMC)" ([Google](https://support.google.com/a/answer/10911320)) | Signed, offline-built "verified mark" domain list (founder note §5.6). Show "Verified sender: <brand>" only with aligned DMARC pass. **Never lowers a hold** |
| **Known correspondent** (sent-mail + allowlist) | Trust (strong) | Addresses in To/Cc of the last 150 sent messages over 2 years, plus the Screener allowlist. TTL 7 days | `src/lib/gmailApi.ts:411-430`, `src/lib/screener.ts:13-55`, used in `src/lib/protectionPolicy.ts:134-136` and `src/background.ts:197-206` | Trust by **address string only**. A DMARC-failing spoof of a known address gets cleanup protection and Screener bypass (algorithm note A.5). Includes no-reply and list addresses the user replied to. Only 150 messages | Key trust on `(address, aligned auth domain)`. Distinguish "I wrote to them" from "they were Cc'd". Raise the sample or use incremental `history.list` |
| **First contact** | Distrust (weak) | "Not seen since install" bit; first scan seeds a baseline | `src/lib/firstContact.ts:15-37` | Not "rarely seen". Adds no score, only copy (personas note §0) | U6: per-sender `{firstSeen, lastSeen, count, alignedPassCount}`. Use as a **multiplier** with identity claims |
| **Engagement** | Trust for cleanup only | Unread-ratio EMA per sender, counts only | `src/lib/engagementModel.ts:36-110`, suggestions `:145-194` | Not used for security at all. "Opened often" is a real trust signal Microsoft uses (Focused Inbox, algorithm note B.1) | Feed "user has read and replied N times" into personal trust. Never let engagement *lower* a security signal on its own |
| **Provider importance** | Trust for cleanup | Gmail `IMPORTANT` or `CATEGORY_PERSONAL`; Outlook `focused` | `src/lib/providers/gmailProvider.ts:149`, `src/lib/providers/outlookProvider.ts:179`, `src/lib/protectionPolicy.ts:133` | Opaque. Gmail may mark a convincing phish Important | Keep for cleanup. Do **not** use as a security trust input |
| **Registrable domain** | Grouping, matching | Parent-label walk, stops before the last label. **No Public Suffix List** | `src/lib/registrableDomain.ts:119-162` | `a.co.uk` and `b.co.uk` share the "parent" `co.uk`, so a blocklist entry `co.uk` would match every UK sender. Brand checks can't tell `paypal.com.evil.io` from a PayPal subdomain by registrable domain (they currently miss it entirely, algorithm note A.5) | Vendor a PSL snapshot at build time (Moat already parses PSL in `scripts/lib/publicSuffixList.mjs:15-30`). Compare **registrable domains** everywhere. Reject list entries that are public suffixes, as Moat's publisher does (`scripts/update-live-security.mjs:39`) |
| **Lookalike / homoglyph** | Distrust (strong) | Hand confusables map (Cyrillic, Greek, 0/1/5), Levenshtein ≤ 2 against 37 brands' domains, min lengths | `src/lib/threatSignals.ts:129-243` | Tiny map. Only against brands, not the user's own contacts. No combosquat check. Punycode is flagged, not decoded (`:326-330`) | TR39 skeleton (U3). Compare against **pinned and frequently-seen correspondent domains** too. Brand-token containment for combosquats ([Kintis et al., CCS 2017](https://doi.org/10.1145/3133956.3134002)) |
| **Brand claim in display name** | Distrust | Word-boundary regex for 37 brand names; legit-domain check before free-mail check | `src/lib/threatSignals.ts:159-169`, `:245-259`; list `src/lib/data/brandDomains.json` (37 keys, counted today) | Zero-width and Cyrillic evasions; gmail.com listed as a Google domain; common-word brands (Discover, Chase, Apple) (algorithm note A.5). Address-in-display-name not checked | Normalise first. Separate free-mail list. Stop-list common words unless a second signal fires. Add `"service@paypal.com" <x@evil>` check |
| **Free-mail list** | Context | 7 domains | `src/lib/threatSignals.ts:121` | Misses live.com, gmx, proton.me, yandex, qq and more | Vendor Sublime's MIT `free_email_providers.txt` (§1.3.1) |
| **Reply-To** | Distrust | Fires only when Reply-To is one of the 7 free-mail domains | `src/lib/threatSignals.ts:299-311` | Evaded by any throwaway non-free-mail domain | Fire on any unrelated registrable domain, minus a reply-to service allow-list (Sublime `replyto_service_domains.txt`). Weight low alone, high with first contact or a brand claim |
| **Return-Path / envelope** | none | Not fetched | `src/lib/gmailApi.ts:293-303` | — | Skip as a score (ESPs differ by design). Optionally fetch for explanation only |
| **ESP infrastructure** | none | Not modelled. DKIM-Signature is fetched but only used for RFC 8058 | `src/lib/gmailApi.ts:300`, `src/lib/unsubscribe.ts:38-50` | Cannot tell "PayPal via its own ESP" from "anyone via SendGrid" | Tag the aligned DKIM `d=` as *own domain*, *known ESP*, or *shared platform*. Per-sender baseline for G4 |
| **Blocklist (malware)** | Distrust (strong) | Seed + URLhaus slice (388 domains in the bundled file today) + unsigned daily add-only JSON | `src/lib/blocklist.ts:163-225`, `src/lib/remoteDataset.ts:244-266` | Wrong kind of list for senders (URLhaus is malware download hosts; personas note §0). Unsigned. Parent walk without PSL | Replace with Moat's signed phishing and scam lists for **link** hosts, and a curated **sender** list. Verify Ed25519 before caching (U14) |
| **Spam / disposable list** | Distrust for cleanup | Seed + disposable-email-domains + StopForumSpam sample (10,764 domains today) | `src/lib/spamList.ts:100-183` | Duplicate normaliser and parent walk (`:114-142`) instead of `registrableDomain.ts`. Unsigned. StopForumSpam is non-commercial only (founder note §2.3) | Share one matcher. Sign it |
| **Lure subject** | Distrust (weak) | One English regex | `src/lib/threatSignals.ts:291-297` | English only; one invisible character defeats it (algorithm note B.4) | Normalise, then per-language packs. Add payment-change, phone-number and invoice families |
| **Risky attachment name** | Distrust (only when DMARC isn't pass) | 7 extensions + double extension | `src/lib/riskyAttachments.ts:283-303`, `src/lib/threatSignals.ts:319-324` | Misses svg, lnk, one, hta, msi, xlam, bidi tricks (algorithm note A.5) | Extend list. Seed from Sublime's `file_extensions_*.txt` (MIT) |
| **Link mismatch** | Distrust | Manual "Deep scan" only, body regex | `src/lib/linkMismatch.ts:24-99` | Symmetric subdomain test lets the child match the parent (`:38-40`) | Asymmetric test. Use registrable domains. Run automatically only on already-elevated mail if the user opts in |
| **Domain category** | Neither (sorting) | Hand list, parent walk | `src/lib/domainCategories.ts:24-84` | Unauthenticated look-alikes can inherit a category label (U15) | Only categorise when From is aligned-DMARC pass |
| **Message kind** | Trust for cleanup | Subject regexes | `src/lib/messageKind.ts:225-244` | "Protection is purchasable" by subject words (algorithm note A.6) | Two-signal protection (U8). Never a security input |
| **Domain age** | none | Not available | — | High value in the literature and in Sublime rules | Signed "newly seen domains" list (offline). RDAP opt-in only |
| **Quarantine review** | Personal label | Released −1, confirmed +1 per sender | `src/lib/quarantineReview.ts:21-45` | A label ledger, not a learner | Becomes the training signal for the personal model (§5) |

### 4.3 Proposed trust model

Four layers. Each adds evidence in log-odds. Lower layers can only be *overridden upward* by
higher-confidence evidence, never silently.

```
Layer 1  Personal trust      what *you* already do      (on device, Gmail-derived, never leaves)
Layer 2  Verified identity   what the domain proves     (DMARC alignment, BIMI/VMC list)
Layer 3  Public reputation   what the world knows       (signed lists from Moat/Cluster publisher)
Layer 4  Community rules     what reviewers wrote       (signed header-only rule packs)
```

**Layer 1. Personal trust (strongest, most private).**

- Inputs: you wrote to them (count), they wrote to you (count, months), you replied, you starred,
  you released one of their messages, their usual aligned DKIM domain, their usual Reply-To.
- Output: a per-sender *familiarity* value and a *baseline*.
- Rule: familiarity **suppresses impersonation and lookalike verdicts** for that exact identity,
  like Microsoft's mailbox intelligence ("doesn't work if the sender and recipient previously
  communicated via email", [anti-phishing](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about)).
  It does **not** suppress auth failure, a blocklist hit, or a baseline break (new Reply-To
  domain, auth changed from pass to fail). That is the G4 defence.

**Layer 2. Verified identity.**

- Aligned DMARC pass from the provider's own authserv-id proves the From domain. It does not
  prove honesty (RFC 8601 §7.2, algorithm note B.2).
- Domain on the signed verified-mark list **and** aligned pass: show "Verified sender: <brand>".
  This may *explain* trust. It must never *lower* a hold (founder note §5.6).
- Aligned pass is the gate for categories, server filters, and "known correspondent" trust.

**Layer 3. Public reputation.**

- Signed domain lists: phishing, scam, malware link hosts (Moat's, `src/shared/liveSecurity.ts:16-27`
  in Moat), a sender-abuse list, a "newly seen domains" list, free-mail and shared-platform lists.
- A list hit is strong evidence. A list *absence* is no evidence.

**Layer 4. Community rule packs.**

- Header-only rules in a small declarative format (Sublime-like), each with id, severity,
  attack type, and a one-line human reason. Reviewed by two people, tested in CI against public
  known-good and known-bad sets. Rules may only add distrust or add *explanation*. A rule may
  never grant trust.

**How scores combine.**

Use a **naive-Bayes-style sum of log-likelihood ratios**, then a logistic link. It is the same
mathematics as SpamAssassin's additive scores and Rspamd's symbol weights, but with a
probabilistic reading that can be calibrated.

```
z = b0                                  # prior log-odds for "this is a scam"
  + Σ_i w_i · x_i                       # x_i ∈ {0,1} or small counts; w_i ≈ log P(x_i|scam)/P(x_i|ok)
  + Σ_(i,j) v_ij · x_i · x_j            # a few hand-chosen interactions, e.g. brand_claim × first_contact
  + personal_offset(sender)             # Layer 1: negative for familiar identities, never below a floor
p = 1 / (1 + e^(−z))                    # calibrated with Platt scaling on held-out public data
```

Rules for the combiner (Inference, drawn from the sources above):

1. **Weights start hand-set** (today's `SIGNAL_WEIGHTS`, `src/lib/threatSignals.ts:403-414`,
   re-expressed as log-odds) and are later fit by logistic regression on public corpora (§5).
2. **Interactions instead of sums for the dangerous shapes.** Mimecast's "number of hits" and
   the algorithm note's U5 both say one medium signal should not hold mail. `brand_claim ×
   first_contact × not_aligned` should be high. `brand_claim` alone on a known correspondent
   should be near zero.
3. **Hard floors and ceilings** stay deterministic: blocklisted link host or DMARC fail on a
   pinned domain is always at least "held". Starred mail is never moved. The model ranks inside
   what the rules allow (algorithm note B.3).
4. **Personal offset is bounded.** Familiarity can cancel identity-claim evidence. It cannot
   cancel auth failure or list hits.
5. **Thresholds map to the quarantine tiers** (quarantine note §5.1): p ≥ T_high hold;
   T_elev ≤ p < T_high label in inbox; below that, nothing. Thresholds come from the evaluation
   set, chosen for a target false-hold rate, not a target catch rate.

**How each verdict is explained.**

- Every non-zero term is a **reason code** with fixed text. Sort by contribution `|w_i·x_i|`.
  Show at most three to the 80-year-old and four elsewhere (12 CFR 1002.9 "principal reasons",
  algorithm note B.3).
- Text is plain and concrete. Examples:
  - `FIRST_CONTACT` "You have never had an email from this address before."
  - `BRAND_CLAIM_FREEMAIL` "It says it is from PayPal, but it was sent from a free Gmail account."
  - `LOOKALIKE_PINNED` "The address looks like your title company's, but one letter is different."
  - `REPLY_TO_ELSEWHERE` "If you press Reply, your answer goes to a different company."
  - `AUTH_FAIL` "The email failed the check that proves it came from <domain>."
  - `PHONE_IN_SUBJECT` "It asks you to call a number. Call the number you already have instead."
  - `LIST_PHISHING_LINK` "A link in it goes to a site on a public list of scam sites."
- Trust reasons are shown too, so the user learns what "safe" looks like:
  `KNOWN_CORRESPONDENT` "You have written to this person 14 times."
  `VERIFIED_MARK` "Verified sender: PayPal."
- Never "score too low" or a number alone. A small "why" link can show the numbers to people who
  want them.

## 5. Making the model more powerful, and keeping it improving

### 5.1 Features worth adding, header-only first

Ordered by value per unit of effort (Inference). All use headers Cluster already fetches unless
marked.

| # | Feature | Source header | Catches | Note |
|---|---|---|---|---|
| F1 | Sender familiarity: count, months seen, replied-to count | ledger + sent mail | G3, G14 | Replaces the first-contact bit (U6) |
| F2 | Aligned-DMARC pass, aligned DKIM `d=` | Authentication-Results | trust gate, G4 | Needs U1 parser |
| F3 | Baseline break: new aligned DKIM domain or new Reply-To domain for a familiar sender | AR + Reply-To + ledger | G4, G8 | Store per sender: last 3 DKIM `d=` and Reply-To registrable domains |
| F4 | Reply-To to unrelated registrable domain, minus service list | Reply-To | G3, G7 | Sublime `replyto_service_domains.txt` (MIT) |
| F5 | Address inside display name, domain ≠ From | From | spoofing | Algorithm note A.5 |
| F6 | TR39 skeleton brand claim and lookalike, including pinned and familiar domains | From | G3, G11 | U3, Unicode `confusables.txt` |
| F7 | Combosquat: brand token inside an unrelated registrable domain | From | brand fraud | Needs PSL |
| F8 | Invisible or bidi characters in display name or subject | From, Subject | evasion | Presence itself is a signal (algorithm note B.4) |
| F9 | Phone number in subject or display name | Subject, From | G6 | International patterns, normalise digits |
| F10 | Payment-change / invoice / renewal lexicon per language | Subject | G3, G6, G8 | Rule pack |
| F11 | Shared-platform DKIM domain (SendGrid, Mailchimp, DocuSign...) | DKIM-Signature | G7 | Tag, not a score on its own |
| F12 | Image or PDF attachment from a stranger | `filename:` search | G5 proxy | Weak alone |
| F13 | Extended risky attachment set | `filename:` search | malware | U-list in algorithm note |
| F14 | Free-mail sender + brand or agency claim | From | high-confidence shape | Larger free-mail list |
| F15 | Signed list hits: sender domain, Reply-To domain | From, Reply-To | known bad | Moat lists + sender list |
| F16 | "Newly seen domain" list hit | From, Reply-To | throwaway domains | Built offline. Download only |
| F17 | Gmail category labels (`CATEGORY_PROMOTIONS`, `CATEGORY_UPDATES`) as context | labelIds | bulk vs personal | Already returned with metadata |
| F18 | Opt-in: link hosts from body of already-elevated mail | body (opt-in) | link phishing | Deep scan automated for flagged mail only |
| F19 | Opt-in: QR decode of image attachments in already-elevated mail | attachment (opt-in) | G5 | §3 |

### 5.2 The on-device personal model

**Model.** Logistic regression over F1-F17 plus a few interactions. A few hundred weights. Plain
TypeScript SGD. No dependency (founder note §1.5).

**Labels come from what the user already does** (algorithm note B.1: "Nobody asks users to label
training data"):

| User action | Label | Strength |
|---|---|---|
| Released a held message ("Not a scam") | ok | strong |
| Confirmed a held message, or "Report scam" | scam | strong |
| Replied to a sender | ok | medium, sender-level |
| Moved to Spam in Gmail (seen via `history.list` labelAdded SPAM) | scam-or-spam | medium. Spam ≠ scam, so map to a separate "unwanted" head or drop |
| Starred | ok | medium |
| Ignored (never opened) | none | do **not** use. Absence of action is not a label |

**Class imbalance.** Scams are rare in one person's mailbox (Inference: tens per year, against
thousands of normal messages). Handle it by:

1. Training the personal model as an **offset** on top of the global model, not from scratch.
   A per-user intercept and a handful of per-user weights, with strong L2 regularisation pulling
   them to zero. With few labels it stays close to the global model.
2. Class weights equal to inverse label frequency, capped.
3. Never letting the personal model lower the score below the deterministic floor (§4.3 rule 3).

**Calibration.** Platt scaling (two parameters) on the global model's held-out public set, not
per user. Isotonic needs more data (algorithm note B.3). Re-check calibration on every global
release.

**Drift.** Two clocks (Inference, consistent with founder note §1.6):

- *Indicators* (domains) drift in days. They belong in signed lists refreshed daily, not in
  weights.
- *Shapes* (brand claim from free mail, lookalike of a pinned domain, phone in subject) drift in
  months. They belong in weights, refreshed with each global release.
- Personal weights decay: exponential forgetting with a half-life of about 180 days, so an old
  release doesn't shield a sender forever.

**What the personal model may never do.** Remove a hard protection. Clear a list hit. Clear an
auth failure. Act on mail the user starred. It ranks and suggests inside the rules.

**Policy.** All personal training data and weights stay on device. That is "that specific user's
personalized model" in the Workspace policy's own words (founder note §1.1). **allowed.**

### 5.3 Shared global weights from public data

Global weights are trained offline by the founder on data that never passed through Cluster's
scopes (founder note §1.2, classes G4 and G7). Published signed, download-only.

| Dataset | What it is | Licence / terms (as fetched) | Header value | Use |
|---|---|---|---|---|
| **Nazario phishing corpus** | Hand-classified phishing from one inbox, "spanning 2005-2025" in yearly mboxes ([monkey.org/~jose/phishing](https://monkey.org/~jose/phishing/)) | README: "The license for these files is CC-BY-4.0, enabling derivative works and commercial use but does require attribution" (fetched today) | Full headers. Recent years should carry Authentication-Results from the receiving server (Inference: check per year) | Positive class. Best licence of the set |
| **Phishing Pot** (`rf-peixoto/phishing_pot`) | Real phishing `.eml` from honeypots. README says "this is the last public commit" and gives "Total number of samples, including private ones: 10362" | **CC BY-NC 4.0** (LICENSE fetched via GitHub API) | Full headers | Positive class for a non-commercial project only. Breaks if Cluster ever charges (same as StopForumSpam, founder note §2.3) |
| **SpamAssassin public corpus** | 6,047 messages, "approximately 31% spam" ([readme](https://spamassassin.apache.org/old/publiccorpus/readme.html)) | "Copyright for the text in the messages remains with the original senders." No licence grant stated. "do NOT send these emails into a live email system" | Old (early 2000s, Inference from the corpus age). No DMARC era headers | Ham and spam for subject/lexicon features only. Do not redistribute |
| **Enron email** | About 0.5M messages from about 150 users, released by FERC ([CMU](https://www.cs.cmu.edu/~enron/)) | No licence. Users are asked to "be sensitive to the privacy of the people involved" | Pre-DMARC headers. Corporate ham | Ham class for subject and display-name features. Do not redistribute |
| **CEAS 2008, TREC 2007 spam** | Classic spam corpora | **Not verified this session** (TREC page did not return content). Treat as unknown | Old | Skip until terms are read |
| **PhishTank** | Verified phishing URLs, "updated hourly". Automated fetching needs an application key; "Without this key, you will be limited to a few downloads per day" ([developer info](https://phishtank.org/developer_info.php), fetched via curl) | Terms page not read this session. Whether new key registrations are open was not stated | URLs only, no mail | Link-host list (Layer 3), not mail training |
| **URLhaus** | Malware download URLs | "PROVIDED FREE OF CHARGE, SUBJECT TO THE FAIR USE PRINCIPLES", non-commercial volumes (founder note §2.3) | URLs only | Link-host list |
| **OpenPhish** | Phishing URLs | Terms forbid "customer protection" and "product development" without written consent (founder note §2.3) | — | **Do not use** |
| **Phishing.Database** (`Phishing-Database/Phishing.Database`) | Phishing domains and URLs, validated with PyFunceble | **MIT** (GitHub API today) | Domains | Candidate list source. Check upstream provenance before trusting |
| **APWG eCX** | Phishing URLs, "a repository of reported phishing emails, including header data, body text and images", malicious domains, crypto addresses, SMS ([APWG](https://apwg.org/ecx/)) | "AVAILABLE TO APWG MEMBERS". Price not stated | Has header data | The one source with fresh labelled headers. Needs membership and a terms review before any model use |
| **User-forwarded scams** (G4) | Users forward scams from Gmail's own UI to a Cluster reporting mailbox | Consent at forwarding. GDPR applies. Not Gmail API data (founder note §1.2) | Full headers as received by the reporting mailbox, which re-authenticates them (Inference) | Grows the positive set without touching Cluster's scopes. Needs a mailbox, so a small server or a mail provider account |
| **Synthetic headers** | Generated from templates | Own | Exactly the header schema Cluster reads | Fills the DMARC-era gap in old corpora (below) |

**The header-era problem (Inference).** Old ham corpora predate DMARC (RFC 7489 is 2015).
Cluster's strongest features (aligned auth, Reply-To relation, display-name tricks) are absent
or distributed differently in them. A model trained naively will learn "has
Authentication-Results" means phishing because only recent phishing has it. Mitigations:

1. Train auth features only on data where both classes carry modern headers (recent Nazario years,
   Phishing Pot, user-forwarded reports, the founder's own Takeout).
2. Use old corpora only for subject and display-name features.
3. Generate synthetic ham headers from the published shapes of large senders (Gmail bulk-sender
   rules guarantee SPF, DKIM, aligned DMARC and one-click unsubscribe for senders over 5,000 a day,
   [Google](https://support.google.com/a/answer/81126)).

### 5.4 Evaluation without user data

| Layer | What | Pass bar (Inference) |
|---|---|---|
| Unit probes | The algorithm note's probe tables become vitest fixtures (Cyrillic PayPal, ZWSP, combosquat, ARC comment injection, Chase Miller) | All pass. Already started in `src/lib/threatSignals.test.ts` |
| Held-out public set | Time-split, not random: train on years ≤ N, test on N+1. Report precision, recall and **false-hold rate on ham** per class | False holds on ham below a fixed budget (e.g. 1 in 2,000) before any threshold change |
| Known-good set | Curated real headers from the founder's own mailbox and from volunteers who donate via Takeout, plus synthetic ESP ham. Includes small senders, non-English, mailing lists, forwarders | No regression allowed |
| Red-team suite | Hand-written adversarial headers per gap: each Sublime-style attack type re-expressed as headers. TR39 evasions. Forged AR headers. ESP abuse shapes | Each case has an expected verdict |
| Per-user local metrics | Held, released, confirmed counts shown to the user on their own device (`src/lib/quarantineReview.ts`) | Never uploaded (G2 data) |

### 5.5 Release gating

1. **Only raise protection automatically.** A new global model or rule pack may ship unattended
   only if, on the known-good set, no message moves into "held" that wasn't before, and on the
   known-bad set nothing moves out of "held". Anything else needs a human review and a note in
   the changelog (founder note §1.5, algorithm note U12).
2. **Never lower a list-backed or auth-backed verdict** through weights.
3. **Monotone checks**: adding a distrust signal can never lower p (enforce `w_i ≥ 0` for
   distrust features at training time).
4. **Size-of-change guard**, as Moat already does for lists: a day's change that shrinks a list
   by half or changes more than `max(5000, 25%)` entries goes to a pull request instead of
   publishing (`C:\Users\samue\projects\moat\src\shared\liveSecurity.ts:111-123`,
   `scripts/update-live-security.mjs:41-58`).

### 5.6 Versioned, signed weights

- One manifest per release: `{format, version, createdAt, files: {name: sha256}}`, signed with
  Ed25519, verified in the extension before use. Moat's verifier is a drop-in
  (`C:\Users\samue\projects\moat\src\background\liveSignature.ts:46-80`), and its publisher
  refuses to silently drop a signature (`scripts/update-live-manifest.mjs:76-103`).
- **One difference for Cluster.** Moat accepts `"no-key"` and `"no-engine"` as trusted
  (`liveSignature.ts:21-23`) and falls back to per-file SHA-256 for old browsers. For Cluster's
  *allow-style* data (brand domains, verified marks, service lists) that fallback is unsafe,
  because a widened allow-list lowers protection. Cluster should fail closed for allow-style data
  and keep the bundled copy. (Inference)
- Refuse a version lower than the cached one (rollback protection).
- Optional: append each manifest hash to a public transparency log (founder note §1.5).

### 5.7 Adversarial robustness

- **Normalise before matching** (TR39, strip default-ignorables and bidi controls, NFKC). One
  invisible character breaks regexes and commercial NLP alike ([Boucher et al., IEEE S&P 2022](https://arxiv.org/abs/2106.09898)).
- **Prefer features the attacker can't cheaply change**: aligned auth domain, sender history,
  registrable domain, list membership. Subjects and display names are attacker-chosen.
- **Per-user weights resist tuning.** Graham's argument: per-user probabilities make it "hard for
  spammers to tune mails" ([A Plan for Spam](https://www.paulgraham.com/spam.html), via the
  algorithm note B.3). A scammer can test against the public global model, not against each
  person's offset.
- **Poisoning of the personal model**: a scammer can't release their own mail in the victim's
  account. Poisoning of rule packs and lists: two-person review, size guards, rules may only add
  distrust.
- **On-device LLM prompt injection**: treat model output as one more signal that can only raise
  suspicion (`src/lib/aiMessageKind.ts:144-159` already applies this rule to kinds).

### 5.8 The continuous improvement loop

```
             PUBLIC / CONSENTED DATA (never Gmail-API data)
   Nazario CC-BY ─┐  user-forwarded scams (G4) ─┐  Moat FL web weights (opt-in, web only) ─┐
   Phishing Pot ──┤  founder Takeout ───────────┤  public URL/domain feeds ────────────────┤
                  ▼                              ▼                                          ▼
          ┌────────────────────────── founder's offline pipeline (GitHub Actions) ──────────┐
          │ 1. build lists (PSL-filtered, protected-domain guard, size-change guard)        │
          │ 2. train global logistic weights, Platt-calibrate                               │
          │ 3. run red-team + known-good + held-out time-split                              │
          │ 4. release gate: raises-only? → auto. else → human review PR                    │
          │ 5. sign manifest (Ed25519), publish to Pages, log hash                          │
          └──────────────────────────────────────┬──────────────────────────────────────────┘
                                                 ▼ download only
          ┌──────────────────────────── each user's browser ────────────────────────────────┐
          │ verify signature → load lists, weights, rule packs                              │
          │ score arrivals (1-min lane) → hold / label / nothing → explain with reasons     │
          │ user releases / confirms / replies → personal offset updates (stays here)       │
          │ user taps "Share this scam" → forwards from Gmail UI (G4) ────► back to the top │
          └──────────────────────────────────────────────────────────────────────────────────┘
            Community: rule-pack PRs (header-only) → CI on public sets → 2 reviewers → signed
```

Nothing in the browser box sends Gmail-derived data upward except the user's own deliberate
forward of one message through Gmail itself.

## 6. How Cluster and Moat work as one body

Moat already has a written plan for this: `C:\Users\samue\projects\moat\docs\federated-learning-plan.md`
("Status: plan only, nothing built", lines 1-5; "The Gmail firewall", lines 108-118). This
section is consistent with it and adds the detection-side detail.

### 6.1 Three shared pieces

| Piece | What | Licence | Lives where |
|---|---|---|---|
| **Shared threat-data release** | One signed manifest covering: phishing, scam and malware link-host lists (today Moat's `live/security-domains.json`, sources at `src/shared/liveSecurity.ts:16-20`); sender-abuse domains; free-mail list; shared-platform / reply-to service lists; brand and verified-mark domains; government suffixes; "newly seen domains"; TR39 confusables subset; PSL snapshot | Data under its upstream licences (CC0, MIT, GPL-3.0 from Scam-Blocklist, abuse.ch fair use). Index and code Apache-2.0 | One publisher repo, one Ed25519 key, GitHub Pages. Both extensions verify the same manifest |
| **Shared detection library** | `registrableDomain` with PSL, TR39 `skeleton()`, lookalike and combosquat checks, list matcher with protected-domain guard, manifest verifier, reason-code enum and text | **Apache-2.0** package, as the founder note recommends for shared code (founder note TL;DR 7). Both GPL-3.0 extensions can include it | npm package or git submodule, one test suite |
| **Local handshake** | Two extensions talk over `chrome.runtime` external messaging on the same browser profile | — | Both manifests |

The library replaces code that exists twice today with small differences: Cluster's
`registrableDomainCandidates` with no PSL (`src/lib/registrableDomain.ts:137-146`) and a second
copy in `src/lib/spamList.ts:114-142`; Moat's PSL loader for scripts
(`scripts/lib/publicSuffixList.mjs:15-30`) and its host guard
(`src/shared/liveSecurity.ts:50-59`).

### 6.2 The local handshake, and its security rules

Chrome facts:

- `externally_connectable` "declares which extensions and web pages can connect to your
  extension". For `ids`: "If left empty or unspecified, no extensions or apps can connect." If
  the key is absent, "all extensions can connect, but no web pages can connect"
  ([externally_connectable](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable)).
- Receivers use `runtime.onMessageExternal` / `onConnectExternal`. Senders pass the target
  extension's id to `runtime.sendMessage` ([messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)).
- Security advice on the same page: "validate and sanitize all input" and prefer `JSON.parse()`
  and `innerText` over `eval()` and `innerHTML`.

Today Cluster's manifest has no `externally_connectable` and a test asserts that
(`src/nonfunctional/security.test.ts:43-48`). With no `onMessageExternal` listener that is
harmless. **The moment a listener is added, the key must be declared with an explicit `ids`
list**, because absence means every extension may connect. (Inference from the Chrome text.)

Rules (Inference):

1. **Both sides declare `externally_connectable: { "ids": ["<other store id>"] }` and no
   `matches`.** No web page can connect.
2. **Check `sender.id`** in every `onMessageExternal` handler against the same constant. Defence
   in depth if a manifest regresses.
3. **Schema-validate every message.** Fixed message types, bounded arrays (for example at most
   500 domains), each domain passing the shared host guard. Reject anything else silently.
4. **Data only, no commands.** Neither side can ask the other to change settings, open URLs, or
   read storage.
5. **Each extension works alone.** If the other is missing, `sendMessage` fails and is ignored.
6. **Update the security test**: replace "`externally_connectable` is undefined" with "it equals
   exactly `{ids: [MOAT_ID]}`".

### 6.3 What flows each way

| Direction | What | Why | Data class | Policy |
|---|---|---|---|---|
| Publisher → both | Signed lists, weights, rule packs | Same indicators, two surfaces | Public (G7) | allowed |
| **Cluster → Moat** | Registrable domains of senders and (if Deep scan ran) link hosts from mail that Cluster **held or the user confirmed as a scam**, with a 30-day expiry | Moat warns or blocks if the user later visits that domain, including from a link opened outside Gmail | **Gmail-derived (G2).** Stays on this computer | allowed for a local warning, and state it in the OAuth verification (§6.6). Must never reach Moat's training, labels or uploads (Moat plan lines 113-117) |
| **Moat → Cluster** | (a) Domains Moat's *local* model scored as scam pages this week on this device. (b) Once Moat FL ships, the global web-reputation score for a domain, asked one domain at a time or as a downloaded table | Cluster adds a "the site this email links to was flagged as a fake shop" reason, and treats a sender domain with a bad web score as more suspicious | Moat web data (G6) and public weights | allowed. Disclose in both privacy policies |
| Moat → Cluster | "User just entered a password on a site that Moat flagged" event (no URL beyond the domain) | Cluster can show "an email from <domain> arrived 3 minutes before" if such mail exists, and suggest a password change | G6 | grey. Useful but couples the products. Later |

What does **not** flow (Inference): message ids, subjects, addresses, display names, counts per
sender, model weights or gradients computed from mail, anything about which messages the user
opened.

### 6.4 The Gmail-data firewall, in code and tests

Moat's plan says tagged data "must never enter the training buffer, the label set or any upload"
and that "A unit test asserts that no tagged item can reach the federated client"
(`docs/federated-learning-plan.md:113-117`). Concretely (Inference):

1. **Separate store.** Cluster-sent domains live in their own `chrome.storage.local` key, for
   example `clusterHeldDomains`, with `{domain, expiresAt, source: "cluster"}`. Never merged
   into Moat's own block statistics or overrides.
2. **Type-level taint.** The FL client's input type accepts only `MoatObservation`, built only by
   Moat's own navigation code. `ClusterSignal` is a distinct branded type with no conversion
   function. A compile error is the first wall.
3. **Runtime assertion.** The FL client asserts `obs.source === "moat"` and drops otherwise.
4. **Tests.**
   - Property test: generate random `ClusterSignal` values, push them through every public
     entry point of Moat, assert the training buffer and upload queue never contain their
     domains.
   - Snapshot test of the upload payload schema: no field can hold a domain at all (FL uploads
     are weight deltas only).
   - A test that a domain present **only** in `clusterHeldDomains` produces a warning page but no
     change to any counter that feeds FL.
5. **No feedback loop through labels.** If the user overrides a Moat warning that was triggered
   by a Cluster domain, that override is **not** an FL label. Only Moat-only verdicts become
   labels.
6. **Cluster side.** Cluster sends only after a hold or a user confirmation, never for every
   first-contact domain. The send function lives in one file with its own test that it never
   includes anything but registrable domains.

### 6.5 Install one, get prompted for the other

Chrome Web Store text: "Do not post an extension with a single purpose of installing or
launching another app, theme, webpage, or extension", and "Bundling other extensions or offers
within the same installation flow" is a deceptive installation tactic. Notifications may not
carry "spam, ads, promotions" ([CWS program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)).

So (Inference):

- **No prompt during install or onboarding.** No bundled flow.
- **Contextual, once, dismissable.** In Cluster: after the first held scam that contained a link,
  the explanation card adds one line, "Want a warning if you ever open this site? Moat can do
  that." with a Web Store link. In Moat: after the first phishing-page block that came from a
  webmail referrer, one line offering Cluster. Never as a system notification.
- **Detect, don't ask for `management`.** A failed `runtime.sendMessage` to the other id means it
  isn't installed. No new permission.
- **Each listing describes its own single purpose.** Cluster: "protects your Gmail and Outlook
  inbox". Moat: "blocks ads, pop-ups and dangerous sites". The handshake is described as an
  optional integration in both, not as a feature either depends on.

### 6.6 Privacy policy and store disclosures

- **Cluster `docs/privacy.md`**: add "If Moat is installed, Cluster tells it the web domains of
  scam emails it held, so Moat can warn you if you visit them. This stays on your computer."
  Also disclose the existing Athena path (founder note §1.3).
- **Moat `PRIVACY.md`**: today it says "Nothing is ever sent automatically" (line 25). The
  handshake does not change that (it is local). FL does, and Moat's plan already lists the
  rewrite (`docs/federated-learning-plan.md:120-125`).
- **Web Store data-use forms**: Cluster still transmits no user data off-device for the
  handshake. Moat's form changes only when FL ships.
- **OAuth verification (Cluster)**: say in the submission that Gmail-derived domains may be passed
  to a second local extension of the same developer, only after a hold, and never transmitted.
  The Workspace policy's transfer rules quoted in the founder note §1.1 talk about transfers to
  third parties and models; a same-device, same-developer hand-off for a "user-facing feature"
  is the most defensible case, but it is still worth stating plainly. (Inference: **grey until
  stated in the verification thread**, low risk.)

## 7. Ranked recommendations

Personas: 1 student, 2 store owner, 3 eighty-year-old, 4 creator, A1 caregiver, A2 job seeker,
A3 home buyer/renter, A4 newcomer, A5 high-risk (personas note). Effort: S days, M 1-2 weeks,
L weeks. Items marked "(prior)" were already recommended in earlier notes and are ranked here
because detection depends on them.

| Rank | Item | Gap closed | Personas | Data / privacy | Policy | Effort |
|---|---|---|---|---|---|---|
| 1 | **Tokenised Authentication-Results parser + aligned DKIM/DMARC** (U1, prior). Reuse `unsubscribe.ts:38-50`'s walker | Spoof-to-pass bug; enables every trust layer | all | Headers already fetched | allowed | S |
| 2 | **Signed datasets with fail-closed allow-lists** (U14, prior). Reuse Moat's verifier and publisher, but fail closed for allow-style data (§5.6) | Supply-chain; G2 trust | all | Download only | allowed | S |
| 3 | **Identity normalisation + PSL registrable domain in a shared Apache-2.0 library** (U3 + §6.1) | Evasions, combosquats, `co.uk` parent bug | all | Bundled data | allowed | M |
| 4 | **Sender ledger v2: familiarity counts + per-sender auth and Reply-To baseline** (F1, F3; extends U6) | G3, G4, G8, G14 | 2, 3, A3 | Counts and domain names, on device | allowed | M |
| 5 | **Combiner rewrite: log-odds with interactions, deterministic floors, reason codes with fixed plain text** (§4.3) | G13, G14, two-signal holds | all, esp. 3 | None | allowed | M |
| 6 | **Reply-To and free-mail fixes using Sublime's MIT lists** (`free_email_providers.txt`, `replyto_service_domains.txt`) | G3, G7 | 2, A2, A3 | Bundled data | allowed | S |
| 7 | **TOAD and money-change rules: phone number in subject/display name, payment-change lexicon, call-back card** | G6, G8 | 3, 2, A1 | Subject only | allowed | S |
| 8 | **Personal lookalike: check against pinned and familiar correspondent domains, not only 37 brands** | G11, G3 | 2, A3 | Local | allowed | M |
| 9 | **1-minute arrival lane** (prior, personas note B.4) | G16 | all | Same API data | allowed | S |
| 10 | **Header-only community rule packs** in a Sublime-like YAML subset, with CI on public sets and two-person review | G10, freshness | A4, all | Public contributions | allowed | M |
| 11 | **Local Cluster→Moat handshake with firewall tests** (§6.2-6.4) | G15, G16 at click time | 3, A1, 4 | Domains only, same device | allowed (state in OAuth verification) | M |
| 12 | **Evaluation harness**: probes as fixtures, Nazario CC-BY + Phishing Pot (non-commercial) + synthetic modern ham, time-split, false-hold budget | Prerequisite for weights | — | Public data only | allowed | M |
| 13 | **Global logistic weights, Platt-calibrated, signed, raises-only release gate** | Accuracy beyond hand weights | all | Public data | allowed | L |
| 14 | **Personal offset model trained on releases, confirmations, replies** | G14, per-user tuning resistance | all | On device | allowed | L |
| 15 | **Shared-platform / ESP tagging of DKIM `d=`** | G7 | all | Headers | allowed | S-M |
| 16 | **Signed "newly seen domains" list** built offline from public feeds | Domain-age gap | all | Download only | allowed | M |
| 17 | **Opt-in QR decode and link-host check for already-elevated mail only** | G5, link phishing | 1, 3, 4 | Attachment/body on device, opt-in, discarded | allowed if opt-in and visible; grey if silent | M-L |
| 18 | **Verified-mark list from public BIMI DNS** (founder note §5.6) | Trust explanation | 3, A4 | Public DNS | allowed | M |
| 19 | **Moat → Cluster web-reputation scores** once Moat FL exists | Link and sender reputation | all | Moat data (G6) | allowed | M (after Moat Phase 2) |
| — | **Federated learning on any Gmail-derived feature or gradient** | — | — | — | **blocked** | — |
| — | **Opt-in RDAP domain-age lookups** | Domain age | A5 | Outbound request naming the sender domain | grey (disclose; opt-in) | S |

### 7.1 Phased roadmap

**Phase A, correctness and trust plumbing (2-3 weeks).** #1, #2, #6, #9, plus the shared
library skeleton from #3 with PSL. Ship the updated security test for `externally_connectable`
only when #11 starts. Exit test: the algorithm note's probe table passes for auth and Reply-To
rows.

**Phase B, the identity model (3-4 weeks).** #3 complete (TR39, combosquat), #4, #5, #7, #8,
#15. Exit test: every held message shows at most three plain reasons; Chase Miller, Apple Valley
Library and Spotify Discover Weekly are not held; Cyrillic PayPal, ZWSP PayPal, combosquat and
"service@paypal.com" display-name cases are.

**Phase C, data and evaluation (3-4 weeks, can overlap B).** #12, #16, #10 (format, CI, first
packs: payment-change in es/de/fr/pt/hi, TOAD brands, job-scam lexicon). Exit test: published
numbers on the public time-split set and a false-hold budget the founder signs off.

**Phase D, learning (4-6 weeks).** #13, then #14. Exit test: raises-only gate passes; personal
offset never moves a message below a deterministic floor in property tests.

**Phase E, one body with Moat (after Moat's FL Phase 1).** #11, #18, then #19. Exit test: the
firewall property test in Moat; each extension passes its full suite with the other absent.

**Opt-in extras, any time after B.** #17, RDAP opt-in. Each behind a clearly worded switch.

### 7.2 Open questions for the founder

1. Is CC BY-NC data (Phishing Pot) acceptable given the commitment to stay free? It adds a third
   "breaks if we ever charge" dependency alongside StopForumSpam and Safe Browsing.
2. Should Cluster run a reporting mailbox for user-forwarded scams (G4 data)? It is the only way
   to grow modern labelled headers without touching Cluster's scopes, but it is a small server.
3. Is APWG membership worth pursuing for eCX phishing emails with headers?
4. One publisher key for both products, or one key per product with a shared root? (One key is
   simpler; two limits blast radius. Founder note §3.2 covers key handling.)

### Sources not reached or only partly read

- Google Security blog RETVec post: header only, no body (`security.googleblog.com/2023/11/improving-text-classification.html`). Figures taken from The Hacker News [secondary].
- Gmail Help "Enhanced Safe Browsing" (`support.google.com/mail/answer/9585757`): 404. No primary page found for Gemini-based scam warnings inside Gmail.
- Proton PhishGuard support page (`proton.me/support/phishguard`): 404. Proton claims are from a search summary of its blog.
- Apple Support MPP pages: blocked to the fetcher. Claims from a search summary.
- Abnormal: platform page read; "43,000+ signals" only from a reseller listing [secondary].
- Material Security, Avanan/Check Point, Barracuda, Cloudflare Area 1, Proofpoint TAP, Mimecast TTP, IRONSCALES, Guardio, Norton: vendor pages not read directly; claims are from search summaries and marked [secondary].
- Sublime MQL docs: page fetched but the excerpt did not list fields or functions. Rule syntax is taken from the rule files themselves (GitHub API).
- PhishTank terms-of-use page: not read; only the developer page via curl.
- TREC 2007 and CEAS 2008 corpus terms: not reached.
- Kowalewski et al. USENIX Security 2025 (QR): figures from a search summary only.
- E-PhishGen (CEUR-WS Vol-4178): search summary only.
- Proofpoint 2024 State of the Phish TOAD figures: from a search summary of Proofpoint pages; the PDF was not parsed.
- SendGrid abuse figures (Keepnet, Kaseya): vendor blogs via search summary.
