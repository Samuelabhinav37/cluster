# How Cluster solves the main problem today, what the evidence says, and where it falls short

Date: 2026-10-11. Follows `2026-10-11-core-problem.md`, which stated the main problem:

> Your inbox treats every sender the same. It doesn't know who matters to you. So the mail that
> matters gets **buried**, and the mail that only pretends to matter gets you **fooled**.

The owner asked for more data and knowledge before acting: a thorough look at **how** Cluster solves
this. Three parts:

1. **What the code actually does**: an audit of `src/` on `ui/apple-structure` (96fe686).
2. **What published evidence says** about solving it this way: primary papers read in full where
   possible.
3. **Scorecard and gaps**, ranked, with what would close each one.

Labels: **(Paper)** = peer-reviewed or a research note read in full; **(Industry)** = vendor or
secondary source; **(Code)** = verified in this repo with file and line; **(Inference)** = my reading.

---

## 1. Summary

- **The approach is right.** Every serious system that solves this problem does it the same way:
  learn per person who is normal, and judge mail against that. Gmail Priority Inbox, Microsoft
  Defender's mailbox intelligence, and the best academic phishing detectors all work this way.
  Cluster's design (header-only, per-person, on the device) matches the evidence.
- **The execution is thin in three places:**
  1. **Cluster sees too little mail to know who matters.** The picture is built from 150 bulk
     messages, 100 inbox messages from the last 30 days, and the recipients of your last 150 sent
     emails. In a mailbox of about 3,200 messages a month, that's under 10%.
  2. **Cluster only removes noise. It never lifts what matters.** "Who matters" protects mail from
     being swept away, but nothing brings an important email forward.
  3. **Cluster can't catch someone pretending to be a person you know.** Impersonation checks
     compare senders against a list of 37 brands, never against your own contacts. A fake
     "Lisa" writing to her mother from a new Gmail address passes. So does a fake supplier.
- **The picture is split across four modules** that each define "known" differently, so they
  can't share what they learn.
- **The evidence also warns about one trap.** Naive "new sender" and "identity changed" alerts
  flood people. Ho et al. found that 40% of sender names appear only once, and 52% of established
  names use more than one address. Cluster already guards against this, partly. Any new
  contact-impersonation check must keep that guard.

---

## 2. How Cluster solves it today (code audit)

### 2.1 The pipeline

```
Gmail / Outlook headers
  (From, Reply-To, Authentication-Results, List-Unsubscribe, labels, size, unread)
        │
        ▼
senderModel.ts  ── groups messages by sender address → SenderSummary
        │
        ├─ threatSignals.ts   11 signal kinds (brand, lookalike, auth, Reply-To, …)
        ├─ senderLedgerStore  familiarity + DKIM/Reply-To baselines → "identity-change"
        ├─ firstContact.ts    first time this address was seen → "new sender" badge
        ├─ engagementModel    unread ratio over time → clean-up suggestions
        └─ screener.knownSenderSet   addresses you sent to + allow-list
        │
        ▼
Decisions
  verdict.ts          hold / warn / none, with plain reasons
  protectionPolicy    which messages may never be cleaned up
  inboxTimeLimits     which sorted mail leaves the inbox, and when
        │
        ▼
Actions in the mailbox
  labels, Gmail filters / Outlook rules, archive, Trash, hold label, unsubscribe
```

### 2.2 Where each sender group comes from

The core-problem note proposed six groups. This is how each one is actually decided today.

| Group | Signal used | Module | How much mail it sees | Used for |
|---|---|---|---|---|
| **People you write to** | To/Cc of sent mail | `gmailApi.listSentCorrespondents` (Code: `gmailApi.ts:416`) | **Last 150 sent messages** in 2 years, at most 1,000 addresses, refreshed weekly, added to over time | Protects their mail from clean-up and sweeps; drops brand look-alike signals in the verdict |
| **Mail the provider calls important** | Gmail `IMPORTANT` or `CATEGORY_PERSONAL`, Outlook "Focused" | `gmailProvider.ts:149`, `outlookProvider.ts:179` | Every message scanned | Protection only |
| **Records** | Subject patterns (receipt, shipping, tax, ticket, booking…) | `messageKind.ts`, `protectionPolicy.ts:46` | Every message scanned | Protection only |
| **Bulk you read / ignore** | Unread ratio, smoothed across scans | `engagementModel.ts` | Senders in the clean-up scan (150 messages) | Clean-up suggestions (score ≥ 70) |
| **New senders** | Address never seen before | `firstContact.ts`, `settings.knownSenders` | Whatever was scanned | A badge, and the opt-in Screener |
| **Impostors** | Brand list, lookalike domain, auth failure, Reply-To, identity change, blocklist | `threatSignals.ts`, `senderLedger.ts`, `verdict.ts` | **Inbox only, last 30 days, 100 messages** in the background (Code: `background.ts:56`) | Hold or warn |

### 2.3 What works well (verified)

- **The verdict is careful by design.** A hold needs a score of 6 or more **and** either two
  different kinds of evidence or one decisive signal (a known-bad domain, or a brand claim from a
  free email account). This is the "combine weak signals" pattern the research below supports
  (Code: `verdict.ts:186`).
- **People you write to are trusted, but not blindly.** Brand look-alike signals are dropped for
  them unless their mail failed authentication. This mirrors Microsoft's mailbox intelligence
  (Code: `verdict.ts:149`).
- **The ledger resists poisoning.** A new signing or Reply-To domain becomes "normal" only after it
  shows up again at least 7 days later, so a scammer's first email can't teach the baseline. A
  sender must have 3 or more messages over 30 or more days before a change counts (Code:
  `senderLedger.ts:40`).
- **Holds are per message**, so one hijacked email from a supplier doesn't hold the supplier's
  whole history.
- **Gmail's own importance model is reused.** `IMPORTANT` is Priority Inbox's output, and Cluster
  treats it as "protected". That borrows Google's per-person model for free.
- **Protection is central.** One function (`protectionDecision`) guards every clean-up path.

### 2.4 What the audit found missing or weak

| # | Finding | Evidence in code | Which result it hurts |
|---|---|---|---|
| A1 | **Sample too small.** 150 clean-up + 100 security messages per scan; background security looks back only 30 days. With about 3,200 messages a month (owner's mailbox, 2026-10-05), Cluster sees under 10%. | `settingsStore.ts:158`, `background.ts:56-57` | Both |
| A2 | **Sent-mail history too short.** 150 sent messages define "people you write to" on the first run. Someone you last wrote to 200 sent emails ago counts as a stranger. | `gmailApi.ts:416` | Both |
| A3 | **Scores depend on how much was sampled.** A known-bug test exists for this: the same inbox gets a different score when the scan sees more of it. | `algorithmAudit.test.ts`, "same inbox scores differently" | Fooled |
| A4 | **No check for impersonating a contact.** Look-alike checks run against 37 brands only (`data/brandDomains.json`). Nothing compares a sender's display name, or address shape, with people you actually write to. Sent-mail scanning keeps addresses and throws away the names. | `threatSignals.ts:41` (no such kind), `gmailApi.ts:428` | **Fooled** (Raj, Margaret, Lisa) |
| A5 | **Brand claims from free mail are missed for the brand's own free domain.** "Microsoft Account Team" from outlook.com, "Google Security" from gmail.com and "Apple Support" from icloud.com aren't flagged (three known-bug tests). These are among the most common scams aimed at older people. | `algorithmAudit.test.ts` | Fooled (Margaret) |
| A6 | **"Known" means four different things.** `knownSenders` (seen once), `knownSenderSet` (sent to), the ledger (familiar for 30 days) and engagement (read rate) never share data. A sender can be trusted by the verdict and offered for clean-up at the same time. | Section 2.2 | Both |
| A7 | **Known means exact address only.** A supplier who writes from `accounts@` and later `billing@` at the same company is two strangers. | `screener.ts:51` | Both |
| A8 | **Nothing lifts what matters.** "Who matters" is used only to protect mail from removal. There's no Important strip and no "from someone you know" view. | No caller lifts mail | **Buried** |
| A9 | **Engagement learns from one signal.** Only unread vs. read. It ignores replies, stars, moves, and how long mail sat before being opened. Two callers also skip the protection context, so the model includes mail it should ignore. | `engagementModel.ts:76`, `background.ts:353`, `dashboard.ts:597` | Buried |
| A10 | **Protection gaps for records.** Plural "tickets" and "reservations" aren't protected, and "ends tonight" promotions become undeletable (known-bug tests). | `algorithmAudit.test.ts` | Buried |

---

## 3. What the evidence says about solving it this way

### 3.1 Learning "who matters" per person works, and per person beats global

**Gmail Priority Inbox** (Aberdeen, Pacovsky & Slater, Google, 2010) (Paper, read in full)
- Ranks mail by "the probability that the user will perform an action on that mail", because
  "importance is highly personal".
- Its first feature group is **social features**, "based on the degree of interaction between
  sender and recipient, e.g. the percentage of a sender's mail that is read by the recipient." The
  others are content, thread (for example, "if a user began a thread") and labels.
- **A global model plus a small per-user model.** The personal weights "only represent how
  different the user is from the global model".
- Error on 160,000 user corrections: **global model 45% → user models 38% → user models plus
  per-user thresholds 31%**. "Increased personalization significantly reduces mistakes."
- Accuracy is about **80 ± 5%**, and false negatives run **3 to 4 times** false positives. Users
  "read mail they acknowledge is not important", so opening mail is a noisy signal.
- **People disagree about how much should count as important.** "A huge variation between user
  preferences for volume of important mail, which can not be correlated with their actions", so
  users must be able to tune it.
- Google employees using it (about 2,000) spent **6% less time reading mail and 13% less on
  unimportant mail**. They were also "more confident to bulk archive or delete email."
- Source: [The Learning Behind Gmail Priority Inbox](https://research.google/pubs/pub36955/)

**What it means for Cluster.** Social features (who you read and reply to) are the strongest base.
Personalisation cuts errors by about a third. Unread alone is noisy. A manual nudge ("more" or
"less") matters, because people want different amounts. Feeling safe to bulk-clean comes *after*
the important mail is lifted. Cluster does the cleaning but not the lifting (A8).

### 3.2 Headers alone can sort about half of mail with no mistakes, but not all of it

**Personal email networks** (Boykin & Roychowdhury, 2004; IEEE Computer 2005) (Paper, read in full)
- Using **only From/To/Cc headers**, the authors built each user's email graph. Close-knit clusters
  became a whitelist and loose clusters a blacklist.
- Result: **44% of good mail whitelisted, 54% of spam blacklisted, 47% left unclassified, with no
  message misclassified**.
- It needs "no user intervention or supervised training".
- The authors' warning: "if spammers can impersonate members of your whitelist they can damage the
  effectiveness of any whitelisting scheme."
- Source: [arXiv cond-mat/0402143](https://arxiv.org/abs/cond-mat/0402143)

**What it means for Cluster.** Header-only "who you correspond with" is very precise but covers only
about half of mail. The other half needs kind sorting (Cluster's five kinds) and behaviour signals.
And once you trust contacts, **impersonating a contact becomes the attack**, which is gap A4.

### 3.3 Most mail is machine-made, and people don't file

- Machine-generated mail is **over 90% of non-spam traffic**, and about **95% of it was subscribed
  to by the users themselves**, often without meaning to. The unsubscribe option "is hardly
  actually used by users" (Gamzu, Lewin-Eytan & Silberstein, WSDM 2018, Yahoo) (Paper, abstract)
  ([listing](https://ir.webis.de/anthology/2018.wsdm_conference-2018.28)).
- **70% of Yahoo users never create a single folder**; only 10% filed more than 10 messages in six
  months. Six shared categories (one human, five machine) covered **70% of traffic and of
  searches**, at about 90% precision and recall (Grbovic et al., CIKM 2014) (Paper, abstract)
  ([arXiv 1606.09296](https://arxiv.org/abs/1606.09296)).

**What it means for Cluster.** The split is "people" vs. "machines", then a few machine kinds. That
matches Cluster's five kinds plus people-you-write-to. Don't ask people to file. Make unsubscribe
easy, because the barrier is effort, not desire.

### 3.4 Catching impersonation: per-person history works, but naive alerts flood

**Detecting credential spearphishing** (Ho et al., USENIX Security 2017, 370M emails at Lawrence
Berkeley National Lab) (Paper, read in full)
- Four attacker types: address spoofer, **name spoofer** ("Alice Good" <alice@evil.com>, which
  "circumvents DKIM/DMARC"), previously unseen attacker, and **lateral attacker** (a compromised
  real account).
- Main name-spoofer feature: **how many earlier days this exact name *and* address appeared
  together**. Name trust is measured by how consistently that name has sent mail.
- **The flood problem.** "Over 60% of From names sent three or fewer emails and over 40% … exactly
  one." Alerting on every new name would have produced **1.1 million alerts**. Even among names
  with over 100 emails, **52% sent from more than one address**.
- Their fix was to require a **second, independent signal** (a rare link domain) before alerting.
  The result: **under 10 alerts a day**, 17 attacks caught, a month of alerts reviewed in 15 minutes.
- Source: [USENIX](https://www.usenix.org/conference/usenixsecurity17/technical-sessions/presentation/ho)

**Lateral phishing** (Ho et al., USENIX Security 2019, 113M emails, 92 organisations) (Paper,
abstract): hijacked real accounts send phishing that inherits the account's trust. Their detector
reached **under 4 false positives per million emails**. Earlier hijack detectors ran at 20–40%
false positives. ([arXiv 1910.00790](https://arxiv.org/abs/1910.00790))

**What it means for Cluster.**
- The name-spoofer check (a known name with a new address) is exactly gap A4, and it's the attack
  that passes DMARC.
- Cluster's existing two-kinds-or-decisive-signal rule is the same remedy Ho used for the flood. A
  contact-impersonation signal should **never hold on its own**. It should hold only when paired
  with payment or lure language, a free-mail address, a Reply-To change, or a risky attachment.
- Compromised real accounts are handled by the ledger's identity-change signal (a new signing
  domain or Reply-To). It's built, but it only fires for senders with 30 days of history in a
  30-day window (A1).

### 3.5 The industry does exactly this, but only for companies

- **Microsoft Defender's mailbox intelligence** "applies a machine learning model to form a contact
  graph of whom they are normally in contact with" and flags "an unfamiliar sender using a familiar
  display name". The **first contact safety tip** shows "You don't often get email from…". Both are
  admin features in paid Microsoft 365 plans (Industry:
  [Microsoft doc](https://query.prod.cms.rt.microsoft.com/cms/api/am/binary/RWSD6b),
  [Edinburgh](https://information-services.ed.ac.uk/computing/first-contact-safety-tips),
  [Prelude](https://www.preludesecurity.com/blog/how-to-maximize-anti-phishing-settings-in-microsoft-365)).
- **Gmail's** "Be careful with this message" banner triggers on look-alike names **inside an
  organisation** (Workspace). I found no consumer Gmail banner tied to your personal contacts or
  first-time senders (Industry: [Brown IT](https://ithelp.brown.edu/kb/articles/gmail-anti-spoofing-warning-banner),
  [Google help](https://support.google.com/mail/answer/185812)). Absence of evidence, not proof.
- **Abnormal Security** (enterprise) builds per-person and per-vendor baselines. It reports that
  nearly half of recipients engaged with vendor email compromise messages, and only 0.2% reported
  them (Industry: [SC Media](https://insight.scmagazineuk.com/research-vec-attacks-surpass-bec-in-emea)).
- **Phishing tactics** (Agari, H2 2020, Industry): brand display-name impersonation **62.6%**,
  individual display-name impersonation **22.1%**, look-alike domains **10.9%**, compromised
  accounts **4.4%**. These come from search coverage of Agari's report; I didn't retrieve the
  original, so check it before using the figures externally.
  Cluster covers the brand case. The individual case, about one in five, isn't covered (A4).

**What it means for Cluster.** "Who is normal for you" protection is standard for companies and
missing for households. That's the gap the core-problem note claimed, now with evidence.

---

## 4. Scorecard

How well Cluster solves each part of the main problem today. A rating is a judgement from the audit
and evidence (Inference).

| Part of the problem | Approach supported by evidence? | Built? | Coverage | Rating |
|---|---|---|---|---|
| Separate people from machines | Yes (Boykin, Grbovic) | Yes: sent-to list, Gmail IMPORTANT, kinds | Low: 150 sent messages | **Partial** |
| Sort machine mail into a few kinds | Yes (Grbovic, Gmail tabs) | Yes: five kinds, filters at delivery | Good: filters see all new mail | **Good** |
| Lift what matters | Yes (Priority Inbox −6% to −13% time) | No | None | **Missing** |
| Learn from behaviour | Yes (Priority Inbox social features) | Unread ratio only | Clean-up scan only | **Weak** |
| Catch brand impersonation | Yes (Agari 62.6% of attacks) | Yes, with known gaps (A5) | Inbox, 30 days | **Good, gaps** |
| Catch contact impersonation | Yes (Ho 2017, Defender, Agari 22%) | No | None | **Missing** |
| Catch hijacked real accounts | Yes (Ho 2019, Abnormal) | Yes: ledger identity-change | Needs 30 days of history in a 30-day window | **Partial** |
| Avoid alert floods | Yes (Ho 2017) | Yes: two-kinds rule, 7-day promotion | Good | **Good** |
| Personal tuning | Yes (Priority Inbox thresholds) | Released/confirmed adjust the score; persona setup | Partial | **Partial** |

---

## 5. What would close the gaps (ranked by impact on the main problem)

Each item: what to do, the evidence for it, and a rough size. Sizes are estimates (Inference).

1. **One sender profile** (closes A6, A7, and is the base for 2 to 5).
   Merge the four "known" notions into one record per sender: correspondent (sent to, how often),
   familiarity (ledger), engagement (read, reply, star), provider-important rate, and the display
   names seen. Add a domain-level view for companies.
   *Evidence:* Priority Inbox's social features. Ho's name-and-address history.
   *Size:* medium. It's a data model and migration over existing modules.

2. **Know more mail, cheaply** (closes A1, A2, A3).
   Read the full sent history once (sent mail is small, and To/Cc headers are cheap). Index all mail
   with history sync, as the owner already chose ("history = ALL mail", 2026-10-06; the IndexedDB
   index A3/A4 from 2026-10-05 is not built). Keep the security window at 30 days for checks, but
   build baselines from everything.
   *Evidence:* the sample-size known bug. Ho's features need long history.
   *Size:* large, and the Gmail quota (6,000 units a minute) sets the pace. One-time backfill,
   then incremental.

3. **Contact-impersonation signal** (closes A4).
   Keep display names from sent mail and from familiar senders. Flag a message whose display name
   matches a contact (exactly or nearly) but whose address doesn't. Hold only with a second signal:
   a payment, gift-card or urgency subject, free mail, a Reply-To change, or a risky attachment.
   Reason text: "This uses Lisa's name, but it isn't the address Lisa uses."
   *Evidence:* Ho 2017 (name spoofer), Defender, Agari 22%. Use Ho's two-signal rule to avoid floods.
   *Size:* small to medium once item 1 exists.

4. **Fix brand claims from free mail** (closes A5).
   "Microsoft …" from outlook.com, "Google …" from gmail.com and "Apple …" from icloud.com should
   count as free-mail brand claims, except for real no-reply domains. The three known-bug tests
   already describe the correct behaviour.
   *Size:* small.

5. **Lift what matters** (closes A8).
   An Important strip fed by the profile: mail from people you write to that's unanswered, records
   due soon, and mail Gmail marked important from familiar senders. Add a "more / less like this"
   nudge, as with Priority Inbox thresholds.
   *Evidence:* Priority Inbox. 62% of parents miss important details (core-problem note).
   *Size:* medium.

6. **Richer engagement** (closes A9).
   Add replied, starred, moved to a label, and "Undo" to the engagement record. Pass the protection
   context in both callers.
   *Size:* small.

7. **Record protection fixes** (closes A10). Fix the plural and "ends tonight" known bugs.
   *Size:* small.

---

## 6. Data still missing

Knowledge this research couldn't settle, and how to get it without a server:

| Question | Why it matters | How to find out |
|---|---|---|
| What share of the owner's inbox is from people vs. machines, and what share of people are in the 150-message sent list? | Sizes A1 and A2 for real | A local "mailbox census" script, or a Settings "about your mailbox" panel that counts locally |
| How often do contacts write from a new address legitimately? | Sets the contact-impersonation threshold (Ho: 52% of established names use more than one address) | Count from the owner's full sent and received headers, locally |
| How accurate is Gmail `IMPORTANT` for this user? | Cluster leans on it for protection | Compare against stars and replies, locally |
| Does consumer Gmail warn about contact impersonation at all? | If it does, A4 is less urgent | Send a test message from a new Gmail account using a contact's name, and observe |
| Hold rate and false-hold rate after A4 | Must stay low (Ho: under 10 alerts a day for a whole lab) | The existing Scam report page |

## Sources

- Aberdeen, Pacovsky, Slater. *The Learning Behind Gmail Priority Inbox.* Google, 2010. [pub36955](https://research.google/pubs/pub36955/) (read in full)
- Boykin, Roychowdhury. *Personal Email Networks: An Effective Anti-Spam Tool.* 2004/2005. [arXiv](https://arxiv.org/abs/cond-mat/0402143) (read in full)
- Ho et al. *Detecting Credential Spearphishing in Enterprise Settings.* USENIX Security 2017. [USENIX](https://www.usenix.org/conference/usenixsecurity17/technical-sessions/presentation/ho) (read in full)
- Ho et al. *Detecting and Characterizing Lateral Phishing at Scale.* USENIX Security 2019. [arXiv](https://arxiv.org/abs/1910.00790) (abstract)
- Gamzu, Lewin-Eytan, Silberstein. *Unsubscription: A Simple Way to Ease Overload in Email.* WSDM 2018. [listing](https://ir.webis.de/anthology/2018.wsdm_conference-2018.28) (abstract)
- Grbovic et al. *How Many Folders Do You Really Need?* CIKM 2014. [arXiv](https://arxiv.org/abs/1606.09296) (abstract)
- Dabbish, Kraut, Fussell, Kiesler. *Understanding email use: predicting action on a message.* CHI 2005. [DOI](https://www.doi.org/10.1145/1054972.1055068) (abstract; cited by Priority Inbox)
- Microsoft Defender mailbox intelligence and first contact safety tip: [Microsoft doc](https://query.prod.cms.rt.microsoft.com/cms/api/am/binary/RWSD6b), [Edinburgh IS](https://information-services.ed.ac.uk/computing/first-contact-safety-tips), [Prelude Security](https://www.preludesecurity.com/blog/how-to-maximize-anti-phishing-settings-in-microsoft-365)
- Gmail warnings: [Brown IT](https://ithelp.brown.edu/kb/articles/gmail-anti-spoofing-warning-banner), [Google help 185812](https://support.google.com/mail/answer/185812)
- Abnormal VEC research via [SC Media](https://insight.scmagazineuk.com/research-vec-attacks-surpass-bec-in-emea) (vendor)
- Agari H2 2020 display-name figures: from search coverage only, original report not retrieved (vendor)
