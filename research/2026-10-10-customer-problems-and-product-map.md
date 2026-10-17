# Email problems people actually have, how others solve them, and how Cluster divides the work

Date: 2026-10-10. Owner asked, before designing the dashboard: research the problems customers
face with email, what can be done with email, how competitors and enterprise products solve the
same problems, and how to divide the work.

Labels: **(Source)** with link, **(Vendor)** a vendor's own figure or claim (treat as
indicative), **(Inference)** recommendation. Builds on, and does not repeat:
`2026-09-06-how-email-organizers-work.md` (mechanisms), `2026-10-05-inbox-intelligence-research.md`
(analytics, receipts, vault), `2026-09-09-competitor-ux-decision-fatigue-patterns.md`.

## 1. The problems, with evidence

| # | Problem | Evidence |
|---|---|---|
| P1 | **Too much mail, mostly low value** | Microsoft's 2025 "infinite workday" report: the average employee gets **117 emails a day** (via [Mailbird](https://www.getmailbird.com/measuring-true-cost-email-overload-organizations/)). Gated survey of 560 US adults: **67% feel overwhelmed** by their inbox ([MarTech Series](https://martechseries.com/content/email-mktg/67-percent-of-people-feel-overwhelmed-by-their-email-inbox-according-to-new-inbox-intelligence-report-from-email-management-solution-gated/)) (Vendor). Mailbird survey: only about 10% of email is business-critical (Vendor). |
| P2 | **Missing what matters** (bills, school, deliveries) | 62% of parents admit missing an important event or detail in their inbox; 52% feel overwhelmed by personal email ([Scary Mommy](https://www.scarymommy.com/parenting/parent-email-study)). A 2024 study links a disorganized inbox to missed bills and lost correspondence ([The Conversation](https://theconversation.edu.au/do-you-have-7-513-unread-emails-in-your-inbox-research-suggests-thats-unwise-225181)). |
| P3 | **Scams and phishing** | FBI IC3 2024: **$16.6 billion** reported losses; **phishing/spoofing was the most common complaint (193,407)**; people **60+ lost about $4.8 billion**, up 43%; business email compromise caused **$2.77 billion** ([Proofpoint](https://www.proofpoint.com/us/blog/email-and-cloud-threats/email-attacks-drive-record-cybercrime-losses-2024), [Axios](https://axios.com/2025/04/23/fbi-internet-crime-loss-record-high-2024)). BEC often has "no malicious link or attachment", so link scanners miss it ([Decryption Digest](https://www.decryptiondigest.com/blog/proofpoint-vs-abnormal-security-email-comparison)). |
| P4 | **Unsubscribing doesn't stick** | Users report still getting mail after confirming unsubscribe ([Swift forums](https://forums.swift.org/t/unsubscribing-from-emails-doesnt-always-take/13472)); guides warn unsubscribe links "don't always work" and some are malicious ([Clean Email](https://clean.email/how-to-unsubscribe-from-emails/stop-getting-emails-from-reddit)). Since 2024 Gmail and Yahoo require bulk senders to honour unsubscribes **within two days** and support RFC 8058 one-click ([AWS](https://go.aws/4bwFazW)), so "still mailing after 2 days" is now a measurable violation. |
| P5 | **Storage full** | Google's free 15 GB is shared by Gmail, Drive and Photos. When full you can't "send or receive emails in Gmail", and after 2 years over quota Google "might delete your content" ([Google One Help](https://support.google.com/googleone/answer/6374270)). Archived mail, Spam and Trash all count. |
| P6 | **Fear of handing over the inbox** | Unroll.me's parent sold receipt data from users' inboxes to companies like Uber; the FTC settled in 2019 requiring deletion of extracted data ([Gizmodo](https://gizmodo.com/unroll-me-settles-with-ftc-for-rifling-through-its-user-1840496042), [Hunton](https://hunton.com/privacy-and-information-security-law/unrollme-inc-settles-with-ftc-over-allegedly-deceptive-email-practices)). Trust is the category's biggest objection. |
| P7 | **Tools that are hard to learn** | SaneBox reviewers: "initial training of the AI can be time-consuming"; settings hard to find; heavy users "never quite wrapped their heads around" it ([G2](https://g2.com/products/sanebox/reviews), [Capterra](https://www.capterra.com/p/146115/SaneBox/reviews)). |
| P8 | **Finding things later** | Gemini's selling point in Gmail is finding "the confirmation number of your purchase from 10 months ago" ([Clean Email blog](https://clean.email/blog/ai-for-work/gmail-ai-cleanup-and-sorting-tools)) (Vendor). Disorganized inboxes correlate with lost records (P2 study). |
| P9 | **Several accounts** | Personal, work, school, old addresses; every product studied supports adding and switching accounts (`2026-10-10-accounts-connect-disconnect.md`). |
| P10 | **Time** | Knowledge workers spend about 28% of the week on email (McKinsey, via [Inbox Zero](https://www.getinboxzero.com/blog/post/how-much-time-are-you-spending-on-email)); 11.7 h/week in a 2025 survey (unverified original). |

## 2. What can be done with email inside Cluster's rules

Cluster's constraints (from earlier decisions): runs in the browser, reads **headers only** by
default (senders, subjects, dates, labels, authentication results), no server, no data leaves the
computer, every change is undoable or confirmed.

| Capability | What it enables | Status |
|---|---|---|
| Read headers in bulk | Group by sender and company, count, find never-opened senders, newsletters, receipts, codes | Built |
| Read authentication results (SPF/DKIM/DMARC), display names, domains | Lookalike and impersonation detection, risk reasons | Built |
| Label, archive, trash, untrash | Clean up, sort, undo | Built |
| Create Gmail filters / Outlook rules | Sorting that works with Chrome closed, mute, block | Built |
| One-click unsubscribe (RFC 8058), mailto, link | Leave newsletters | Built |
| **Check if a sender kept mailing after unsubscribe** | Verified unsubscribe, auto-mute offenders after 2 days | Partly (outcome tracking exists) |
| **Message sizes** (`sizeEstimate` in Gmail) | Storage meter, "free up space" | Not built |
| Subject-level patterns | Bills due, deliveries, renewals, codes, school mail surfaced without reading bodies | Partly (paid subscriptions) |
| On-device AI (Chrome Prompt API) | Classify ambiguous mail, digest | Built behind a flag |
| Multiple accounts | One person, several mailboxes | Not built (needs the accounts work) |

Not possible or deliberately out of scope: reading message bodies by default, sending mail,
server-side processing, scanning attachments' contents.

## 3. How others solve the same problems

| Problem | Google (Gmail) | Microsoft (Outlook) | Apple Mail | Cleanup tools | Enterprise security |
|---|---|---|---|---|---|
| P1 Too much mail | Tabs; **Manage subscriptions** (July 2025): senders by frequency, one-click unsubscribe ([Fone Arena](https://www.fonearena.com/blog/458485/gmail-manage-subscriptions.html/amp)) | Focused/Other; **Copilot "Prioritize my inbox"** marks high/low priority with a one-line reason, new mail only, needs an instruction to start ([Microsoft Support](https://support.microsoft.com/en-US/Outlook/copilot-outlook/prioritize-my-inbox)) | Four categories + Categorize Sender | Clean Email: grouped suggestions, one action per group; SaneBox: moves low-priority mail to folders, learns from moves | n/a |
| P2 Missing what matters | Gemini summaries and inbox Q&A (paid tier for Q&A) ([CXO Digital Pulse](https://www.cxodigitalpulse.com/google-launches-gemini-era-of-gmail-with-ai-tools-to-simplify-inbox-management/)) | Copilot priority + summaries | Time-sensitive mail lifted into Primary | SaneBox digest | n/a |
| P3 Scams | Spam filter, warning banners | Defender for Office 365: anti-phishing policies, link detonation, sandboxing | Junk filter | Mostly none | **Gateways** (Proofpoint) block before delivery; **API tools** (Abnormal) learn each person's and vendor's normal behaviour and pull bad mail after delivery; best practice is both ([Decryption Digest](https://www.decryptiondigest.com/blog/proofpoint-vs-abnormal-security-email-comparison)) |
| P4 Unsubscribe | One-click on behalf of the user | Unsubscribe banner | Unsubscribe banner | Leave Me Alone, Unroll.me; Clean Email sends requests and fills forms (Vendor) | n/a |
| P5 Storage | Google One storage page, `larger:10M` search | Storage page | n/a | Clean Email "large emails" views | n/a |
| P6 Trust | Server-side, first party | First party | On-device for categories | Mixed; Unroll.me is the cautionary tale | Enterprise contracts |
| P9 Accounts | Avatar switcher | Account list | Accounts in Settings | Per-address (SaneBox up to 4) | Tenant-wide |

**What the big players do that Cluster should copy (Inference):**
1. **One reason per decision.** Copilot shows a one-line reason for each priority; Abnormal shows
   why a message looks wrong. Cluster's verdict reasons already do this; keep every suggestion to
   one sentence.
2. **Behavioural baselines beat link scanning** for impersonation and vendor fraud (Abnormal). Cluster
   already keeps a sender ledger (who you normally hear from); it is the right foundation.
3. **Start small, then learn.** Copilot needs one instruction and only touches new mail; SaneBox
   learns from moves. Cluster should ask one setup question and learn from undo and "It's fine".
4. **Sender-level, not message-level.** Gmail's subscription manager and Clean Email both act per
   sender or group. That cuts decisions by an order of magnitude.

**Where Cluster can be different (Inference):**
- **Privacy you can check:** runs on the computer, headers only, open source. Directly answers P6.
- **Clean, sort and protect in one place** for people, not IT departments. Gmail and Outlook
  each do one piece; enterprise security is not sold to families.
- **Verified unsubscribe:** prove it worked using the 2-day rule, and mute senders that ignore it.
- **Scam protection for older relatives** (P3's largest losses), through simple mode.
- **Storage recovery** (P5), which no first-party mail app makes easy.

## 4. How to divide the work

Seven product areas. Each owns one customer question, one place in the app, and the problems it
answers.

| Area | Customer question | Problems | Screen |
|---|---|---|---|
| **A. Today** | "Is anything wrong, and what should I do?" | P1, P2, P10 | Home: headline, recommendations, weekly chart |
| **B. Clear out** | "What can I get rid of now?" | P1, P5 | Clear out: grouped suggestions, storage meter |
| **C. Stop it coming** | "How do I stop this sender?" | P1, P4 | Senders: one panel per sender with Unsubscribe, Mute, Block and the result of unsubscribing |
| **D. Keep it sorted** | "Where does each kind of mail go?" | P1, P2 | Sorting: five kinds, one setting each |
| **E. Stay safe** | "Is this email real?" | P3 | Safety: held mail, reasons, report |
| **F. Find what matters** | "Where's that bill, delivery or code?" | P2, P8 | New: Important (bills due, deliveries, renewals, codes) |
| **G. Trust and accounts** | "What did Cluster do, and whose mail is this?" | P6, P9 | Activity with Undo, accounts menu, privacy page |

## 5. Other things worth building (Inference, ranked by value ÷ effort)

1. **Storage meter and "Free up space"** (P5). Gmail returns a size estimate for each message, so
   Cluster can show what's using the space and offer one-click clean-ups (large attachments,
   old promotions). Strong, visible value; small build.
2. **Verified unsubscribe report** (P4). After unsubscribing, watch the sender for 2 days; if mail
   keeps coming, say so and offer Mute. Builds on the existing outcome tracker.
3. **Important strip** (P2, P8). Bills due, deliveries, renewals and expiring codes surfaced on
   Home from subject patterns and known senders, without reading bodies.
4. **Family protection** (P3). Simple mode plus scam holding as a "set up for a parent" path.
5. **Multiple accounts** (P9). Already researched; depends on the sign-in spike.
6. **Learning from corrections** (P7). Every Undo and "It's fine" quietly adjusts future
   suggestions, so there is no training step.

## 6. Order of work

| When | What | Why first |
|---|---|---|
| **Now** | Dashboard redesign around the seven areas (A–E, G) with the new sidebar | Fixes the "messy" feedback; everything else lands inside it |
| **Now** | Sign-in spike, then sign out and accounts | Unblocks onboarding and P9 |
| **Next** | Storage meter, verified unsubscribe | High value, small, uses data already fetched |
| **Next** | Important strip (F) | Answers P2 without reading bodies |
| **Later** | Family protection path, learning from corrections | Builds on simple mode and the ledger |

## Sources

Linked inline. Survey figures from vendors (Mailbird, Gated, Clean Email) are indicative only; the
FBI IC3 figures are from secondary coverage of the 2024 report and should be checked against the
FBI PDF before external use.
