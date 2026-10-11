# What published research says about each email problem, and how Cluster works on it

Date: 2026-10-10. Third in today's series after `2026-10-10-customer-problems-and-product-map.md` and
`2026-10-10-why-email-problems-happen-successes-failures.md`. Owner asked: are there studies and
findings for each problem, and how should Cluster work on each one.

Each section: **Findings** (study, sample, result, link), **What it means**, **How Cluster works on
it** (concrete product and engineering), **How we'll know** (measured on the device only; Cluster
has no server and no telemetry, so signals are local counters the person can see, or opt-in surveys).

Labels: (Peer-reviewed), (Industry) = vendor or trade study, (Inference) = recommendation.

---

## 1. Too much mail

**Findings**
- Email overload has two parts: **volume** and **status** (mail you must still act on). Re-studied in
  Gmail 16 years after Whittaker & Sidner 1996, overload "is still a problem"; work email is mostly
  status-overloaded, personal email is also **type-overloaded** (many kinds of mail mixed together).
  Grevet, Choi, Kumar, Gilbert, CHI 2014 ([DOI](https://dx.doi.org/10.1145/2556288.2557013)) (Peer-reviewed).
- When Gmail separated important mail (Priority Inbox, 2010), Google's internal tests found people
  spent **6% less time** on email; later, users spent **15% less time reading email overall** and 43%
  more time on important than unimportant mail ([Google, Aug 2010](https://cloud.googleblog.com/2010/08/email-overload-try-priority-inbox.html),
  [Gmail blog, Dec 2010](https://gmail.googleblog.com/2010/12/priority-inbox-update-time-savings-new.html)) (Industry).
- After Gmail tabs (2013), promotions were read at about the same rate and marked spam less than half
  as often as Primary (Return Path, ~3M users, via [PaySimple](https://paysimple.com/blog/gmail-promotions-tab-impacts-small-business-email-marketing/)) (Industry).

**What it means:** personal inboxes suffer from **mixing kinds of mail**, and simply separating them
saves real time without forcing people to delete anything.

**How Cluster works on it**
- Sorting with **five kinds** (Updates, Promotions, Orders, Receipts, Codes) and one setting each
  ("stays in inbox: 1 day / 1 week / keep"). Already built as time limits; the redesign simplifies it.
- Protect people the user writes to: never sorted away (built).
- Home shows the split as one chart ("Most of this week's mail was promotions").

**How we'll know:** share of inbox mail that's from people vs. bulk senders, before and after (local
chart on Home).

## 2. Checking email too often, and interruptions

**Findings**
- 124 adults randomly assigned to check email **three times a day** for a week reported
  **significantly lower daily stress**, which predicted higher well-being; participants found the limit
  hard to keep. Kushlev & Dunn, *Computers in Human Behavior* 2015 ([PDF](https://www.interruptions.net/literature/Kushlev-ComputHumBehav15.pdf)) (Peer-reviewed).
- 237 people whose phone notifications were **batched three times a day** felt more attentive,
  productive, in a better mood and in control; turning notifications off entirely raised anxiety and
  fear of missing out. Fitz et al., *CHB* 2019 ([summary](https://communities.springernature.com/posts/batching-notifications-can-improve-attention-well-being-and-productivity),
  DOI 10.1016/j.chb.2019.07.016) (Peer-reviewed).

**What it means:** batching works, but people need help sticking to it, and "nothing at all" backfires.

**How Cluster works on it**
- **Delivery windows** for low-priority kinds: promotions and updates arrive in the inbox at set times
  (for example 9am, 1pm, 6pm) instead of all day. Implementation: Gmail filters already label on
  arrival and skip the inbox; the background sweep moves them back to the inbox at the chosen times.
  People's mail is never hidden indefinitely.
- No new notifications from Cluster except "scan finished" and real scam warnings.

**How we'll know:** count of inbox arrivals outside windows (shown on Home as "interruptions saved").

## 3. Organizing and finding mail later

**Findings**
- 345 long-term users, 85,000+ refinding actions: heavy **filing into folders did not improve finding**;
  filers were no more successful and took marginally longer than people who searched. **Search and
  threading** worked better. Whittaker et al., "Am I wasting my time organizing email?", CHI 2011
  ([IBM Research](https://researcher.ibm.com/publications/am-i-wasting-my-time-organizing-email-a-study-of-email-refinding)) (Peer-reviewed).
- Disorganized inboxes are linked to missed bills and lost records (exploratory 2024 study, via
  [The Conversation](https://theconversation.edu.au/do-you-have-7-513-unread-emails-in-your-inbox-research-suggests-thats-unwise-225181)) (Peer-reviewed, small sample).

**What it means:** asking people to file is wasted effort. Automatic, **coarse** labels plus good search
help; deep folder trees don't.

**How Cluster works on it**
- Keep labels few and automatic (the five kinds), never a folder tree.
- **Important strip** on Home: bills due, deliveries, renewals, school, found from senders and subject
  patterns, linking straight to the message in Gmail.
- Header search finds senders and jumps to their mail.

**How we'll know:** clicks from the Important strip into Gmail (local counter).

## 4. Unsubscribing doesn't stick

**Findings**
- About **20% of top brands kept emailing** after confirming an unsubscribe; **11% were still emailing
  after 10 days** (Return Path); 73% of retailers stopped, 4% violated the law (EEC); almost two thirds
  of marketers admitted discouraging opt-outs, for example with tiny unsubscribe text (Lyris)
  ([Chief Marketer](https://chiefmarketer.com/retailers-not-capitalizing-on-unsubscribes-eec),
  [MarketingCharts](https://www.marketingcharts.com/industries/retail-and-e-commerce-6889)) (Industry, 2010–2018).
- Since 2024, Gmail and Yahoo require bulk senders to honour unsubscribes within **two days**
  ([AWS](https://go.aws/4bwFazW)).

**What it means:** unsubscribe works most of the time but not reliably, and now there's a clear
deadline to check against.

**How Cluster works on it**
- **Verified unsubscribe**: after unsubscribing, Cluster watches for new mail from that sender. If
  anything arrives after 2 days, it mutes the sender automatically (a Gmail filter, undoable) and tells
  the person in one line: "Old Navy kept emailing after you unsubscribed, so Cluster muted them."
- Prefer one-click (RFC 8058); never follow unsubscribe links in mail Cluster flags as suspicious.

**How we'll know:** a local "unsubscribe results" list: stopped / muted after ignoring / pending.

## 5. Scams and phishing

**Findings**
- **Active** browser warnings (that interrupt) were heeded by **79%** of participants; the **passive**
  warning was heeded by only **one** participant; 97% fell for at least one phishing message.
  Egelman, Cranor & Hong, CHI 2008, n=60 ([PDF](https://css.csail.mit.edu/6.566/2018/readings/youve-been-warned.pdf)) (Peer-reviewed).
- **Embedded, just-in-time training** (teaching at the moment someone is fooled) was retained after
  **28 days** and did not make people avoid legitimate links; a second reminder helped further.
  Kumaraguru et al., "School of Phish", n=515 ([CMU](https://kilthub.cmu.edu/articles/journal_contribution/School_of_Phish_A_Real-World_Evaluation_of_Anti-Phishing_Training/6625691)) (Peer-reviewed).
- Older users were **less aware of their own susceptibility**; 43% of 158 participants fell for at
  least one simulated spear-phishing email. Oliveira, Lin et al. ([Age-related vulnerabilities, PDF](https://cps-vo.org/sites/cps-vo.org/files/cpsvo_file_nodes/Age-Related_Vulnerabilities_to_Social-Engineering_Attacks.pdf)) (Peer-reviewed).
  In the 515-person CMU study, **18–25-year-olds** were the most vulnerable, so risk is not only age.
- Most domains can be spoofed: about 83.9% have no DMARC record, 2.5% enforce reject
  ([Red Sift](https://redsift.com/guides/achieving-dmarc-consensus)) (Industry).

**What it means:** a quiet badge doesn't protect anyone. Warnings must **interrupt at the moment of
risk**, and the moment of being fooled is the best time to teach.

**How Cluster works on it**
- **Hold** high-risk mail out of the inbox (built, opt-in) so the warning happens before the click.
- In Gmail itself, the held label already says what it is ("🚨 Possible phishing", `clusterLabels.ts`),
  so the warning travels with the message even outside Cluster.
- **Teach at the moment:** when someone releases a held email ("It's fine") that scored high, show one
  short card: the reason, how to check (call the company on a number you already have), and a "Report"
  option. Not a course, one card.
- Simple mode for older relatives with holding on by default.

**How we'll know:** held vs. released counts and how often a released email was later reported (Scam
report page, local).

## 6. Fear of deleting, and keeping everything

**Findings**
- Digital hoarding is driven by keeping data "just in case", as evidence, out of laziness or time cost,
  and emotional attachment; it's linked to lower productivity, stress and security risk. Sweeten,
  Sillence & Neave, *CHB* 2018, n=45 ([Northumbria](https://nrl.northumbria.ac.uk/id/eprint/33816)) (Peer-reviewed, small).
  A workplace study found people keep email as evidence of work, as reminders, or "just in case"
  ([CREST](https://crestresearch.ac.uk/comment/the-risks-of-digital-hoarding/)).
- Defaults strongly shape choices (opt-out vs. opt-in organ donation, Johnson & Goldstein, *Science* 2003;
  the size of the effect on actual donations is debated) ([The Decision Lab](https://thedecisionlab.com/insights/health/can-defaults-save-lives-the-power-of-default-options-on-life-saving-decisions),
  [Jason Collins](https://www.jasoncollins.blog/posts/does-presuming-you-can-take-a-persons-organs-save-lives.html)) (Peer-reviewed, with caveats).

**What it means:** people won't delete if they fear losing something. Lower the stakes: archive and Trash
(30 days) instead of permanent delete, show exactly what goes, and make keeping the default for
anything that looks like a record.

**How Cluster works on it**
- Default action is **move to Trash** (recoverable for 30 days) with Undo; permanent delete stays under
  Advanced (built).
- Starred mail, receipts and shipping records, and sensitive subjects are **never** cleaned up by
  default (`protectionPolicy.ts`, built). Extend the same protection to bills, travel and finance.
- Every clean-up card says what's included and what's protected.

**How we'll know:** Undo rate after clean-ups (low = suggestions are trusted).

## 7. Too many choices

**Findings**
- Choice overload is real **under specific conditions**: hard decisions, complex options, unclear
  preferences, and when people want to minimise effort. Chernev, Böckenholt & Goodman, *Journal of
  Consumer Psychology* 2015 meta-analysis ([Kellogg](https://www.kellogg.northwestern.edu/academics-research/research/detail/2015/when-product-assortment-leads-to-choice-overload-a-conceptual/)) (Peer-reviewed).
  An earlier meta-analysis found an average effect near zero with high variance (Scheibehenne et al.
  2010) ([PDF](https://abcwest.cogs.indiana.edu/pmwiki/pdf/scheibehenne.options.2010.pdf)).

**What it means:** inbox clean-up hits every overload condition (unclear preferences about each sender,
desire to be done quickly). Fewer, grouped decisions with a recommended option are justified.

**How Cluster works on it**
- Clear out shows **3–5 suggestion cards**, each one button, with a recommended action.
- Sender details live in one panel, opened only when wanted.
- Optional "one by one" mode for people who prefer it.

**How we'll know:** suggestion cards acted on vs. ignored.

## 8. Trusting automation

**Findings**
- When an algorithm's result surprised people, a **medium-level explanation restored trust**; too much
  detail did not. Kizilcec, CHI 2016 ([PDF](https://www.cs.mcgill.ca/~jeromew/data/COMP766/CHI2016/p2390-kizilcec.pdf)) (Peer-reviewed).

**What it means:** one clear reason, not a dump of signals.

**How Cluster works on it**
- Every suggestion and verdict shows **one sentence of why** (verdict reasons are built; extend to
  clean-up and sorting), with "More" for the full list.

**How we'll know:** "It's fine" / Undo rate on items that showed a reason.

## 9. Privacy and tracking

**Findings**
- Of 13,000 marketing emails from about 900 sites, **85% embedded third parties** (average 5 per email)
  and about **30% leaked the recipient's address** to third parties when opened. Englehardt, Han &
  Narayanan, PoPETs 2018 ([paper](https://petsymposium.org/popets/2018/popets-2018-0006.php),
  [FTC slides](https://www.ftc.gov/system/files/documents/public_events/1223263/privacycon_emailprivacy_englehardt_0.pdf)) (Peer-reviewed).

**What it means:** every promotion opened leaks data; fewer promotions in view means less tracking,
which is a privacy benefit Cluster can state honestly.

**How Cluster works on it**
- Cluster reads headers, never opens messages, so it never triggers trackers itself (true by design;
  worth saying on the privacy page).
- Future idea: flag senders whose mail is heavy with trackers (needs bodies; only with explicit opt-in).

## 10. Storage

**Findings:** no peer-reviewed study found; Google's own rules are the evidence: storage is shared
across Gmail, Drive and Photos, mail stops when full, and content may be deleted after two years over
quota ([Google One Help](https://support.google.com/googleone/answer/6374270)).

**How Cluster works on it:** storage meter from Gmail's per-message size estimate; one-click clean-ups
for large attachments and old promotions; never touches receipts and records.

---

## Summary: research to product

| Problem | Strongest finding | Cluster response | Status |
|---|---|---|---|
| Too much mail | Separating kinds saves time (Priority Inbox −6% to −15%) | Five kinds, one setting each | Built, simplify |
| Interruptions | 3×/day batching lowers stress (two RCTs) | Delivery windows for low-priority mail | **New** |
| Finding later | Filing doesn't help; search does (n=345) | Few auto labels, Important strip, search | Partly |
| Unsubscribe | ~20% keep mailing (industry) | Verified unsubscribe, auto-mute after 2 days | **New** |
| Scams | Active warnings 79% vs passive ~0; just-in-time teaching lasts 28 days | Hold before the click, one teaching card on release | Partly |
| Fear of deleting | Hoarding is "just in case" | Trash not delete, records protected, Undo | Built |
| Too many choices | Overload under hard, effortful choices | 3–5 cards, one button | Redesign |
| Trust in automation | Medium explanation restores trust | One-sentence reason everywhere | Partly |
| Tracking | 85% of marketing mail has trackers | Header-only, never opens mail; say so | Built |
| Storage | Google rules | Storage meter | **New** |

## Sources

Linked inline. Peer-reviewed sources are noted with sample sizes where available; industry figures
(Return Path, EEC, Lyris, Red Sift, Google blog) are indicative.
