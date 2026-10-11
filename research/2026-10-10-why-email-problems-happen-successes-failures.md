# Why email problems happen, who solves them well, who failed, and what Cluster takes from it

Date: 2026-10-10. Follows `2026-10-10-customer-problems-and-product-map.md`. Owner asked for more
specific research: why people face each problem, which companies do well on it and why, what
Cluster should learn from them, and which companies failed in this space and why.

Labels: **(Source)** linked; **(Vendor)** a company's own claim; **(Inference)** recommendation.

## Part 1. Why each problem happens

### 1. Promotional overload
**Why it happens**
- Email is the cheapest marketing channel, so senders mail often and add people at every checkout
  and sign-up. (Inference, widely known; no single primary source found.)
- People rarely hate promotions, they hate them **mixed in**. When Gmail split mail into tabs in 2013,
  a Return Path study of about 3 million users found promotions were still read at about the same
  rate (around 14%), and the "This is spam" rate in Promotions was 0.12%, less than half of
  Primary's ([PaySimple summary](https://paysimple.com/blog/gmail-promotions-tab-impacts-small-business-email-marketing/)).
- So the problem is **placement**, not existence.

**Takeaway:** sorting promotions out of the way beats deleting or unsubscribing from everything.
Cluster's time limits and categories are the right core; unsubscribe is for senders people truly
don't want.

### 2. Unsubscribing doesn't stick
**Why it happens** ([Word to the Wise](https://www.wordtothewise.com/2012/06/why-does-it-take-weeks-to-process-an-unsubscribe/),
[Suped](https://www.suped.com/email-deliverability/answers/why-do-i-still-receive-emails-after-unsubscribing-through-gmails-unsubscribe-button),
[FTC](https://www.ftc.gov/node/42095)):
- US law (CAN-SPAM) lets senders take up to **10 business days**, and mail already scheduled still goes out.
- Companies run **several lists**; leaving one leaves the others running.
- Some senders label marketing as "transactional" to avoid the obligation; a survey found over 10% of
  top sites failed to include or honour unsubscribe.
- Requests get lost: the FTC found Yesmail's spam filter was discarding reply-to unsubscribe requests.
- The List-Unsubscribe header isn't always implemented correctly.
- Unsubscribe links in actual spam can be malicious or confirm the address is live.
- Since 2024 Gmail and Yahoo require bulk senders to support one-click unsubscribe and honour it
  **within two days** ([AWS](https://go.aws/4bwFazW)).

**Takeaway:** treat unsubscribe as a **request with a result**: use one-click where offered, never
click unsubscribe links in mail flagged as suspicious, watch the sender for 2 days, and if mail keeps
coming, mute or filter it and tell the person "Old Navy ignored your unsubscribe, so Cluster muted them."

### 3. Scams get through
**Why it happens**
- Most domains still can't stop people pretending to be them. Red Sift (Dec 2025, 73.3M domains):
  about **83.9% have no DMARC record** and only **2.5% enforce p=reject**
  ([Red Sift](https://redsift.com/guides/achieving-dmarc-consensus)). So "From: yourbank" can be faked
  for most senders.
- Business email compromise often has **no link or attachment**, so link and attachment scanners miss it
  ([Decryption Digest](https://www.decryptiondigest.com/blog/proofpoint-vs-abnormal-security-email-comparison)).
- Attackers target the people with the least protection: people 60+ reported about $4.8 billion of
  losses in 2024, the most of any age group ([Axios](https://axios.com/2025/04/23/fbi-internet-crime-loss-record-high-2024)).
- Consumer spam filters are tuned on content and reputation, not on "is this sender normal for **you**".

**Takeaway:** combine the three signals enterprise tools use: authentication results, lookalike
domains, and **behaviour** (is this a new sender claiming to be someone you know?). Cluster's verdict
engine and sender ledger already do this; the gap is presentation (one clear reason) and reach
(simple mode for older relatives).

### 4. Missing what matters
**Why it happens:** volume buries a few important messages; unread counts stop meaning anything;
category sorting misfiles some mail (Apple Mail categories were criticised for exactly this
([MacRumors](https://www.macrumors.com/2024/12/13/ios-18-2-mail-categories/))).

**Takeaway:** don't only remove noise; **lift the signal**. An Important strip (bills due, deliveries,
renewals, school) plus "never sort away mail from people you write to" (Cluster already protects
correspondents).

### 5. Storage full
**Why it happens:** Google's 15 GB is shared with Drive and Photos; archived mail, Spam and Trash all
count; large attachments add up silently. When full, Gmail can't send or receive, and after two years
over quota Google may delete content ([Google One Help](https://support.google.com/googleone/answer/6374270)).

**Takeaway:** a storage meter that shows what's using the space by sender and by kind, with
one-click clean-ups. Gmail returns a size estimate for every message, so this costs no extra reading.

### 6. Fear of giving a tool the inbox
**Why it happens:** the business model of free inbox tools has often been selling data from the inbox
(Unroll.me, Edison; see Part 3). People have learned that "free" can mean "you are the product".

**Takeaway:** make privacy **checkable**, not just claimed: no server, headers only, open source, a
clear data page, and no analytics on mail content.

### 7. Tools are hard to learn
**Why it happens:** tools ask people to train them (SaneBox reviewers: "initial training of the AI can
be time-consuming" ([G2](https://g2.com/products/sanebox/reviews))), or expose every option at once.

**Takeaway:** one setup question, sensible defaults, learn from Undo and "It's fine", and show
recommendations rather than tools.

## Part 2. Who does well, and why

| Company | What they get right | Why it works | What Cluster takes |
|---|---|---|---|
| **Gmail** (tabs, Manage subscriptions) | Zero setup; acts per sender; built in | No new app to learn, no trust decision | Work inside Gmail, not instead of it; act per sender |
| **Microsoft Copilot** ("Prioritize my inbox") | A one-line reason for each priority; needs one instruction; touches new mail only ([Microsoft](https://support.microsoft.com/en-US/Outlook/copilot-outlook/prioritize-my-inbox)) | People trust what they can understand; starting small avoids surprises | One sentence of "why" on every suggestion; ask one setup question |
| **HEY** (Screener) | You approve first-time senders before they reach you; 125,000 sign-ups in 11 days at launch ([TechCrunch](https://techcrunch.com/2020/07/06/oh-hey/)); paid ($99/yr at launch) | A clear, opinionated idea; paid, so no data selling | Cluster's New senders hold is the same idea; keep it optional and explain it in one line |
| **SaneBox** | Works through folders in whatever mail app you already use; learns when you move mail | No new client; training is just normal behaviour | Learn from what people do (undo, release) instead of asking them to train |
| **Clean Email** | Grouped suggestions with one action per group; welcomed Google's 2019 privacy assessment ([The Register](https://www.theregister.com/2019/02/11/google_gmail_developer/)) | Fewer, bigger decisions; leaned into trust | Suggestion cards, one button each; treat Google verification as a trust asset |
| **Abnormal Security** (enterprise) | Learns each person's and vendor's normal behaviour, removes bad mail after delivery | Catches fraud with no bad link | Sender ledger as the foundation of Safety |
| **Superhuman** | Speed and a polished feel | Premium experience sells | Polish matters; but see Part 3 for its privacy misstep |

## Part 3. Who failed, and why

| Company | What happened | Why | Lesson for Cluster |
|---|---|---|---|
| **Mailbox** (bought by Dropbox 2013, closed Feb 2016) | Hyped swipe-to-triage app; stagnated, demand fell, features copied by Outlook and Google ([TechRadar](https://www.techradar.com/news/software/dropbox-is-dropping-mailbox-because-everyone-copied-it-1310708), [Failory](https://failory.com/cemetery/mailbox)) | No business model ("people are not willing to pay"), stopped shipping, ideas easy to copy | A feature the platforms can copy is not a moat. Cluster's lasting edge is the combination: privacy you can check, safety for families, verified results |
| **Inbox by Gmail** (2014–2019) | Google folded its ideas into Gmail and closed it ([VentureBeat](https://venturebeat.com/2018/09/12/google-will-kill-inbox-by-gmail-in-march-2019)) | A second mail app split users; Gmail absorbed the best parts | Don't ask people to switch mail apps. Cluster stays a companion that improves Gmail and Outlook in place |
| **Newton / CloudMagic** (closed 2018, revived, closed 2020, closed again 2024) | CEO: couldn't "figure out profitability & growth"; the premium mail market "is not big enough"; free apps from Google, Microsoft and Apple ([MacStories](https://www.macstories.net/news/newton-mail-to-shut-down-service-september-25th/), [Wikipedia](https://en.wikipedia.org/wiki/Newton_(software))); a later rebuild blamed "costly centralized server infrastructure" (single source) | Server costs plus a small paying market | Cluster's **no-server design** keeps costs near zero; price for sustainability, never for growth at all costs |
| **Astro** (bought by Slack 2018, closed weeks later) | Apps shut down; team absorbed ([Android Central](https://www.androidcentral.com/astro-email-app-shutting-down-after-being-acquired-slack)) | Likely "never found a viable business model" against free mail apps ([TidBITS](https://tidbits.com/2018/09/26/astro-acquired-by-slack-apps-to-shut-down-october-10th/)) | Same as Newton: compete on what free first-party apps won't do (cross-provider cleanup, family safety), not on being another mail client |
| **Unroll.me** (2017 scandal, FTC 2019) | Parent company sold data extracted from users' inboxes to companies like Uber; FTC required deletion ([Gizmodo](https://gizmodo.com/unroll-me-settles-with-ftc-for-rifling-through-its-user-1840496042)) | Free product paid for by data | Never monetise mail data. State it, and make it verifiable (open source, no server) |
| **Edison Mail** (2019–2020) | Sold "anonymous purchase information" from commercial emails while calling itself "privacy first"; a later bug exposed accounts to other users ([Input](https://www.inputmag.com/tech/edison-mail-scrapes-users-inboxes-sells-the-data-to-clients), [AppleInsider](https://forums.appleinsider.com/discussion/215878)) | Marketing claims didn't match practice; server-side data creates breach risk | Every privacy claim must be literally true; data that never leaves the device can't leak from a server |
| **Superhuman read receipts** (2019) | Tracking pixels on by default logged when and where recipients opened mail; after backlash it stopped logging location and turned the feature off by default ([TechCrunch](https://techcrunch.com/2019/07/03/superhuman-removes-email-location-logging-will-turn-read-receipts-off-by-default/amp/)) | Optimised for the user, ignored the people on the other end | Privacy defaults protect everyone, including senders and recipients Cluster's users deal with |
| **Gmail third-party app crackdown** (2019) | Apps using restricted Gmail scopes and storing data on servers needed a yearly security assessment costing **$15,000–$75,000+** ([Google Workspace blog](https://workspace.google.com/blog/product-announcements/elevating-user-trust-in-our-api-ecosystems), [The Register](https://www.theregister.com/2019/02/11/google_gmail_developer/)); small developers feared shutting down | Server-side mail data became expensive to hold | Cluster's no-server design avoids the paid assessment (`docs/oauth-scope-justification.md`); still budget for OAuth verification |

## Part 4. What Cluster should understand and do

**Principles** (Inference, drawn from Parts 1–3)
1. **Be a companion, not a new mail app.** Work inside Gmail and Outlook through labels and filters
   (Inbox, Mailbox, Astro, Newton all failed as separate clients).
2. **Privacy must be checkable.** No server, headers only, open source, a plain data page. Never
   sell or analyse mail content (Unroll.me, Edison).
3. **Sort before you delete.** People still read promotions when they're out of the way (Gmail tabs
   study). Default to sorting; deletion is opt-in and undoable.
4. **Every action reports its result.** Unsubscribe is verified; clean-ups show what moved and Undo.
5. **One reason per suggestion.** Copilot and Abnormal show why; so should every Cluster card.
6. **Learn quietly.** Undo and "It's fine" adjust future suggestions (SaneBox model), no training step.
7. **Compete where the platforms won't.** Cross-provider cleanup, verified unsubscribe, storage
   recovery, and family scam protection. Single features get copied (Mailbox).
8. **Stay cheap to run.** No servers means no paid security assessments and no infrastructure bills
   that killed Newton.
9. **Respect people on the other end.** No tracking pixels, no read receipts, nothing that watches
   senders (Superhuman).

**Backlog this adds or confirms**
| Item | Problem | Priority |
|---|---|---|
| Verified unsubscribe (2-day watch, auto-mute, message to the user) | Unsubscribe doesn't stick | Next |
| Never follow unsubscribe links on suspicious mail | Scams via unsubscribe | Now (rule) |
| Storage meter + Free up space | Storage full | Next |
| Important strip (bills, deliveries, renewals, school) | Missing what matters | Next |
| Family protection setup path | Scams on older adults | Later |
| Public "How Cluster uses your mail" page with the no-server proof | Trust | Now |
| Learn from Undo / It's fine | Hard to learn | Later |

## Sources

Linked inline. Vendor and blog figures are indicative; the FBI IC3 figures come from secondary
coverage; the Newton rebuild statement is single-source.
