# The main problem Cluster solves, and how the other problems hang off it

Date: 2026-10-11. The owner asked for a firm statement of the main problem before any more design work,
then how each associated problem is solved from it. This note pulls the last four notes together
(`2026-10-10-customer-problems-and-product-map.md`, `…-why-email-problems-happen…`,
`…-research-findings-and-solutions.md`, `2026-10-11-personas.md`) and checks the claims against `src/`.
Problem codes P1–P10 are from the product-map note.

## 1. The main problem

> **Your inbox treats every sender the same. It doesn't know who matters to you.**
>
> So the few emails that matter get buried under bulk mail, and the emails that only pretend to
> matter get through.

One root cause, two results:

| Result | What people feel | Evidence |
|---|---|---|
| **Buried** (attention) | "I missed the school deadline / the real invoice / the interview." | 62% of parents missed an important event or detail; personal inboxes are "type-overloaded" with many kinds of mail mixed together (Grevet et al., CHI 2014). |
| **Fooled** (trust) | "It looked exactly like my bank / my supplier." | About 84% of domains have no DMARC record, so `From:` can be faked for most senders (Red Sift). Business email compromise often has no link or attachment, so scanners miss it. What catches it is knowing what's normal for this person (Abnormal's approach). |

Why this is the root and not just one problem among ten:

- **It's the same missing knowledge both times.** To lift a real email you must know who is real
  to this person. To catch a fake you must know who is real to this person. Gmail and Outlook judge
  mail by global reputation and content; neither builds "who is normal for *you*" for a
  consumer inbox and shows it. That gap is the opening.
- **Separating kinds is proven to help.** Priority Inbox cut time on email by 6% to 15%. After Gmail
  tabs, promotions were still read at the same rate. People don't hate bulk mail; they hate it
  mixed in with what matters.
- **It holds for every persona.** Maya (buried interview mail, fake recruiter), Raj (real invoice vs.
  fake invoice), Margaret (real bank vs. fake bank), Leo (real brand deal vs. fake sponsor), Dana
  (school mail buried). Each persona's two worst problems are the two results above.

### What the main problem is not

| Candidate | Why it isn't the core |
|---|---|
| "Too much mail" (P1) | A symptom. Gmail tabs and Manage subscriptions already attack volume for free, and a volume feature is easy to copy (Mailbox). Volume only hurts because it buries what matters. |
| "Scams" (P3) alone | The highest stakes, but rare for most people. A security-only tool gives no reason to open it on a normal day, and would sit unused until the day it matters. |
| "Privacy" (P6) | Not a problem anyone installs a tool to solve. It's the condition for being allowed to solve the real one. |

### How this fits the owner's earlier decision

On 2026-10-06 the owner set Cluster = email protection, Moat = web protection. This note doesn't
change that; it widens what "protection" means. Cluster protects **attention** (the real mail isn't
lost) and **trust** (the fake mail isn't believed). Clean-up is the daily value that keeps the
sender picture accurate and gives people a reason to keep Cluster around. Scam protection is the
reason it matters.

**One-line positioning (proposal):** *Cluster keeps the mail that matters in front of you, and the
mail that only pretends to matter away from you.*

## 2. The one mechanism: a picture of who is normal for you

If the problem is "the inbox doesn't know who matters to you", the solution is to build that
knowledge on the device and use it everywhere. Each sender gets one place in that picture:

| Sender group | How Cluster knows | What it means for the person |
|---|---|---|
| **People you write to** | Addresses in your Sent mail | Always in the inbox. Never sorted away or cleaned up. |
| **Records** (bills, receipts, orders, school, bank) | Subject patterns, known domains, starred mail | Kept safe; lifted when due. |
| **Bulk you read** | Opens and clicks over time | Sorted into its kind; stays easy to find. |
| **Bulk you ignore** | Every message still unread | Offered for clear out and unsubscribe. |
| **New senders** | Never seen before | Let through, unless they claim to be someone you know. |
| **Impostors** | Claims a known name or brand while the address, signing domain or Reply-To doesn't match | Held with one reason. |

**Finding from the code:** Cluster already collects all of this, but in four separate places that
don't share a definition of "known":

| Module | Its idea of "known" | Used by |
|---|---|---|
| `settingsStore.knownSenders` + `firstContact.ts` | Seen at least once before | "New sender" badge |
| `screener.knownSenderSet` | You wrote to them, or allow-listed them | Screener, `protectionPolicy`, `verdict` |
| `senderLedger.ts` | Familiarity plus normal DKIM and Reply-To domains | Identity-change warnings |
| `engagementModel.ts` | What you open and act on | Clean-up suggestions |

So a sender can be "known" to the scam checker and "ignored" to the clean-up list at the same time,
and the two screens can disagree. Merging these into **one sender profile** with one set of groups
(the table above) is the engineering form of the main problem. It isn't a new feature; it's the
spine the existing features should hang from. (Inference; scope it before building.)

## 3. How each associated problem is solved from it

Three kinds of associated problem: **symptoms** of the main problem, **consequences** of living with
it, and **barriers** that stop any tool from fixing it.

### Symptoms (the main problem, seen from one side)

| Problem | Why it follows from the main problem | How Cluster solves it | Uses the sender picture how | Status |
|---|---|---|---|---|
| P1 Too much mail | Bulk is mixed with people | Five kinds, one time limit each; people you write to stay put | Bulk vs. people decides what moves | Built, simplify |
| P2 Missing what matters | The important few are buried | Important strip: bills due, deliveries, renewals, school | Records group, lifted when due | New |
| P3 Scams | Inbox can't tell a stranger claiming a known name from the real one | Hold with one reason, teaching card on release, pinned contacts for suppliers | Impostor group; identity change vs. baseline | Built (hold, reasons), new (teaching card, pinned) |
| P4 Unsubscribe doesn't stick | No one checks the result | Verified unsubscribe: watch 2 days, mute if ignored, tell the person | Sender keeps appearing in the bulk-ignored group | Partly (outcome tracking) |
| P10 Time and interruptions | Everything arrives at once with equal weight | Delivery windows: low-priority kinds arrive 3 times a day | Only bulk groups are batched; people never are | New, later |

### Consequences (what piles up because of the main problem)

| Problem | How it follows | How Cluster solves it | Status |
|---|---|---|---|
| P5 Storage full | Bulk mail and attachments pile up unseen | Storage meter from Gmail's size estimate; one-click Trash for bulk you ignore; records protected | New |
| P8 Finding things later | Filing by hand doesn't help (Whittaker, CHI 2011) | Few automatic labels, Important strip, search | Partly |

### Barriers (what stops anyone fixing the main problem)

These aren't solved by the sender picture. They decide whether people let Cluster build it at all.

| Barrier | Why it blocks | How Cluster removes it | Status |
|---|---|---|---|
| P6 Fear of handing over the inbox | Unroll.me and Edison sold inbox data | No server, headers only, open source, plain privacy page | Built; page to publish |
| Fear of deleting | People keep mail "just in case" | Trash not delete, records protected, Undo everywhere | Built |
| P7 Hard to learn, too many choices | Training steps and walls of options | One setup question (persona picker), 3–5 cards, one reason each, learn from Undo and "It's fine" | Partly |
| P9 Several accounts | The picture is per mailbox, but people aren't | Multiple accounts, one Home | New (accounts work) |
| Desktop only | Margaret reads on a tablet | Put the picture into Gmail filters and labels, which run with no computer on | Partly |

## 4. What this changes in the plan

1. **Name the main problem in the product.** Home's headline answers it directly: what matters is
   in front of you, and what was held and why. The Important strip and the held count belong at the
   top; clean-up suggestions come after.
2. **Build one sender profile before more features.** Merge the four "known" notions. Verified
   unsubscribe, the Important strip, pinned contacts and the teaching card all read from it, so it
   comes first.
3. **Rank the "Next" features by how directly they hit the main problem:**
   1. Important strip (buried, directly)
   2. Pinned contacts and teaching card (fooled, directly)
   3. Verified unsubscribe (symptom)
   4. Storage meter (consequence; high visible value, small build)
   5. Multiple accounts, family setup (barriers; needed for reach)
   6. Delivery windows (symptom, lower stakes)
4. **Judge new ideas with one question:** does it help Cluster know who matters to this person, or
   act on that knowledge? If neither, it's a side feature.

## 5. How we'll know the main problem is the right one

All on the device, no tracking:

- **Buried:** share of mail in the inbox from people and records vs. bulk, before and after.
- **Fooled:** held count, release rate, and how often a released email is later reported.
- **Owner test:** five people per persona shown one sentence ("Cluster keeps the mail that matters
  in front of you, and the mail that only pretends to matter away from you"). Do they say "I need
  that" or "Gmail already does that"? If most say the latter, the problem statement is wrong.

## Open questions for the owner

1. Is the positioning line right, or should protection lead ("Cluster stops email scams, and
   clears the noise they hide in")?
2. Approve scoping the single sender profile before building the "Next" features?
