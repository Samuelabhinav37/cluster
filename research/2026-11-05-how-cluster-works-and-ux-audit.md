# How Cluster works, where it falls short, and how to make it simpler (2026-11-05)

Research only. Nothing in the app was changed for this, except a preview-only `?scale=N` flag in `scripts/preview/chrome-stub.js` (and storage change events there), so the audit could run a 4,000+ email mailbox.

The audit used the real dashboard bundle on `localhost:4599` with the fake mailbox (`node scripts/preview/serve.mjs`, then `/src/dashboard/index.html?reset&pinned&scale=11`, which is 3,676 emails in range). Competitors were read from their own help docs in Chrome.

---

## 1. How Cluster works, in plain words

### Sign in
You press "Continue with Gmail" and give Cluster permission. Cluster runs only in your browser. There's no Cluster account and no Cluster server holding your mail.

### Setup (4 questions)
1. Who you are.
2. What always stays in the inbox. People you write to are always on.
3. How hands-off: "Ask me first" moves nothing, "Tidy for me" moves mail.
4. Your plan.

Pressing Start saves your answers, turns on scam holds, and with "Tidy for me" writes Gmail filters so Gmail itself labels new mail on arrival, even on your phone.

### The first read (the "scan")
Cluster copies the facts about each email into a small database in your browser, the **mail index**. It stores the sender, subject, date, Gmail's labels and tab, the unsubscribe link and the sign-in check results. It never stores the body. It reads in this order:
1. **The newest 150 emails**, so screens have something to show quickly.
2. **Some of your sent mail**, to learn who you write to. Those people are "known": their mail is never moved or held.
3. **Everything else from the last 180 days.**

**Why it's slow:** Google lets one person's app spend 6,000 "units" a minute, and reading one email costs 20. That's at most 300 emails a minute, and Cluster keeps some headroom for your own clicks, so it reads about 200 a minute. **4,000 emails take 20 to 30 minutes**, and no app that reads emails one by one can beat about 13. Source: [Gmail usage limits](https://developers.google.com/workspace/gmail/api/reference/quota), updated May 1, 2026.

After the first read, Cluster never reads everything again. Gmail's **change feed** tells it what's new or changed, so it reads only that.

### Sorting: deciding the label
For each email, in this order:
1. **Your corrections win.** "This sender is Shopping", or "never sort".
2. **Mail that must stay is skipped:** starred mail, people you know, and risky senders (the scam check handles those).
3. **Clues decide the kind:**
   - **The subject:** a code means One-time codes, "order confirmed" means Receipts, "shipped" means Orders & shipping, a password reset means Accounts, an application update means Jobs.
   - **Gmail's Promotions tab** marks ads.
   - **The sender's company:** a list of about 270+ domains maps banks to Finance, airlines to Travel, stores to Shopping.
   - **An unsubscribe link** only says it's list mail. A known company beats it, so a bank's list mail goes to Finance.
4. **No clue means no label.** After 3 hours that mail goes to the **Screener** for you to decide.

### Labelling: putting labels on in Gmail
- **Gmail filters** label new mail as it arrives.
- **After the first read**, Cluster applies every label it worked out in one pass, with no re-reading: up to 1,000 emails per request, seconds in total. It also swaps any wrong Cluster label for the right one (added today, `labelFromIndex`).
- **Every 5 minutes**, a background check labels anything the filters missed, and slowly works through inbox mail older than 180 days.
- **Rescan, or a rules update**, relabels everything once.

### Organizing
Each label has a **keep-in-inbox time**: skip the inbox, 3 hours, 1 day, or "Label only" (stays). When the time is up, the mail moves out of the inbox into its label. Nothing is deleted, and Activity can undo it.

### Cleanup
- **Unopened:** senders whose mail you never open.
- **Subscriptions:** lists you can unsubscribe from.
- **Automation:** "Never opened skips the inbox", "Keep the newest 3 per sender".

Everything goes to Trash, never deleted for good, and can be undone. Job-application and money mail are protected.

### Security
Each sender gets warning signs:
- failed sign-in checks (SPF, DKIM, DMARC);
- a look-alike domain (paypa1.xyz);
- a brand name used by a stranger;
- a Reply-To address that goes somewhere else;
- the first email ever from this sender.

Enough signs together means **High**, and with holds on, the email is moved to a held label before you open it, along with the reasons.

---

## 2. What Cluster needs to know about email to be solid

| Signal | What it tells you | Cluster today | Gap |
|---|---|---|---|
| `List-Unsubscribe`, one-click unsubscribe (RFC 8058) | It's bulk or list mail, and how to leave it | Read, used for Subscriptions and unsubscribe | — |
| `List-Id`, `Precedence: bulk`, `Auto-Submitted` | Mailing list or automated sender | Read (looksAutomated) | — |
| `Feedback-ID`, the sending platform's DKIM `d=` (sendgrid, mailchimp…) | Which platform sent it. Receipts often go through the same platforms as ads | Partly: signed list headers only | **The receipt-vs-ad split for one sender** relies on subject phrases only |
| SPF, DKIM, DMARC alignment | The sender really owns the domain | Read and scored | — |
| ARC | Forwarded mail whose checks broke on the way | Not read | **Forwarded mail can look like a sign-in failure.** Read ARC before scoring a DMARC fail |
| BIMI | The brand has a verified logo | Used for the brand registry | — |
| Gmail tabs, `IMPORTANT`, `category:purchases` | Google's own model, trained on billions of inboxes | Promotions tab and purchases used | **IMPORTANT is barely used.** It's a free "this matters to you" signal |
| What you do: open, reply, star, **move** | Your real preference | Opens and replies used for Cleanup | **Moves in Gmail are ignored.** SaneBox's whole product is learning from drags |
| Threads and replies | A conversation, not a mass mailing | Replies keep mail in the inbox | — |
| How often a sender writes, and how long you've known them | Familiar vs first contact | senderLedger, first contact | — |
| Google's 2024 bulk-sender rules (5,000+/day senders must authenticate and offer one-click unsubscribe) | Real bulk senders almost always pass the checks, so a "brand" that fails them is suspect | Implied in scoring | Say so explicitly in the scam reasons |

**Known hard cases to test against:**
1. Amazon (and others) send receipts and ads from the same address.
2. Banks send real alerts through marketing platforms.
3. Google security alerts come from `no-reply@accounts.google.com`, an automated sender with a list-style look. It was once labelled Newsletters.
4. LinkedIn job alerts and Medium digests showed as **High** in Overview's suspicious list (finding 6).
5. Forwarded and university relay mail breaks DKIM.

---

## 3. Superhuman, Shortwave, SaneBox: how they keep triage simple

These notes come from each vendor's own help docs, read 2026-11-05.

### Superhuman ([Split Inbox](https://help.superhuman.com/hc/en-us/articles/46005619081101-Default-Split-Inbox), [Auto Labels](https://help.superhuman.com/hc/en-us/articles/46005657758861-Auto-Labels), [Auto Archive](https://help.superhuman.com/hc/en-us/articles/46005662460813-Auto-Archive), [Mass Archive](https://help.superhuman.com/hc/en-us/articles/46005611576589-Mass-Archive))
- **Split Inboxes: at most 7.** "More creates more places to check." Each shows its count and hides when empty. "Splits hold mail that still needs action; folders hold done mail."
- **Auto Labels:** built-ins (Marketing, News, Pitch, Social go to "Other"). They apply to new mail **plus only the last 14 days**. Custom labels show a **live preview where you tick or cross results** before saving.
- **Auto Archive:** per label, plus "Always / Never archive" per sender or domain. It **never** archives:
  - people you've written to;
  - your own company's domain;
  - an email carrying another label that stays.
- **Get Me to Zero:** pick a time frame and tick "keep unread" or "keep starred". It runs in batches to stay under the API limit, with **undo for 7 days**.
- A 1-on-1 onboarding call for every new user.

### Shortwave ([The Shortwave Method](https://www.shortwave.com/docs/guides/method/), [Customize](https://www.shortwave.com/docs/guides/customize-your-shortwave-settings/))
- **Triage every email once**, into three outcomes:
  - nothing to do: Done, Delete or Snooze;
  - under 2 minutes: do it now;
  - bigger: star it or make it a todo.
  "~80% is clutter you can clear in minutes."
- **Bundles:** a whole label or sender collapses to **one line** in the inbox, and one click clears the bundle.
- **Delivery schedules:** for example, "Newsletters arrive Saturday 8am".
- **Auto-apply a label from the label picker:** a checkbox on any email for "always label this sender Travel". Settings shows how many senders each label has.
- **"Reapply filters"** on selected emails shows what happened and why.
- Splits default to **Important and Other**, can hide when empty, and are built on Gmail labels and filters.

### SaneBox ([Quick start](https://www.sanebox.com/quick-start-guide), [How it works](https://www.sanebox.com/help/155-how-does-sanebox-work))
- **Three first steps:** SaneLater, SaneBlackHole, reminders.
- **It learns from your moves in any mail app.** Moving an email back to the inbox retrains it.
- A **Trainings & Filters page lists everything it has learned.**
- **The Digest:** a summary email with bulk archive, delete or mark read. Green dots mark unfamiliar senders, orange marks ones to avoid. No email if nothing's new.
- If SaneBox is down, mail still arrives, just unsorted.

### What they share, and what Cluster lacks

| Pattern | Who | Cluster |
|---|---|---|
| Few places to look (about 7 or fewer) | Superhuman, Shortwave | 13 labels, 4 Overview kinds, 4 sidebar places, 9 Settings sections plus Advanced |
| Fix a sender's label from any email, applied going forward | Shortwave picker, Superhuman Cmd+K | Only from the Screener or the sort preview. **Details has Archive, Trash and Mute but no "Label as"** |
| Learn from moves made in the mail app | SaneBox | No |
| One list of everything learned | SaneBox | Settings → "Learned preferences" exists (good) but sits 5th of 9 sections |
| Bounded backfill (last 14 days), then quiet | Superhuman | Everything back 180 days, about 30 min for 4,000 emails |
| A bulk "get to zero" with keep-unread/starred and a 7-day undo | Superhuman | Cleanup moves per sender, no single "older than X" sweep |
| Collapse a sender or label to one line, clear in one click | Shortwave bundles | The Cleanup table does this per sender, not per label |
| Preview with tick/cross before a rule saves | Superhuman | Sort preview exists, hidden |
| Digest you can act on | SaneBox | "Today by email" is read-only |

---

## 4. UX audit (preview, 206-email and 3,676-email mailboxes)

| # | Where | What I saw | Why it hurts | Fix |
|---|---|---|---|---|
| 1 | Sign-in | With 3,676 emails, **30 to 58 seconds** of a grayed button before setup opens. The 206-email mailbox took about 4 s | Looks broken | Open setup straight away and read in the background. Show "Reading your mail…" on the button |
| 2 | Setup → Start | **About 40 s (small) and about 50 s (large)** on "Setting up…". It waits for a full Gmail tag-and-sweep run (`turnOnTimeLimits` → `runInboxTimeLimits`) that competes with the read for quota | No progress shown, and setup should be instant | Save and go to Overview at once. Run the Gmail work in the background and show it on the scan card |
| 3 | Overview, first visit | "Welcome back!" | Wrong on day one | "Welcome", or no greeting during the first read |
| 4 | Setup step 2 | Kai: "What should never move?" Title: "What should always stay?" The plan list repeats the "Your Cluster" card | Two wordings for one thing, said twice | One wording, and show the plan once |
| 5 | Bottom bar | "paused for Gmail's speed limit, back in 28 s" throughout | Sounds like an error, but it's normal pacing | Hide the pause line. Show the ETA only |
| 6 | Counts | Cleanup badge 181 vs page "30 unopened". Overview "Suspicious" lists LinkedIn and Medium as High while Security lists Netflix, PayPal and Apple. "Quarantined 0" with holds on | Numbers that disagree destroy trust | One source per number. Overview Suspicious = Security's list |
| 7 | Categories | Overview donut: People, Receipts, Updates, Promotions. Labels: 13 labels | Two systems for the same mail | Use the label groups everywhere (People, Transactions, Updates, Personal from ORGANIZE_GROUPS, or the 13 labels) |
| 8 | Overview | Today list plus 6 charts. "Automatically filed: 1" after 326 were labelled | Charts instead of next steps | 3 widgets at most, plus the scan card. "Filed" counts labels too |
| 9 | Overview | **Label step waits for the whole read: 30+ minutes for 4,000 emails before anything is labelled.** The scan card never appeared in the preview (fixed in the stub; the card also needs to read its state on render) | The one thing you came for comes last | Label as you read: each read batch goes to `labelFromIndex`. Or label first by Gmail search (below) |
| 10 | Cleanup | Sender logos sit above the names. "Open rate: None". No action visible until you tick a row | Looks broken, unclear, no next step | Logo beside the name, "Never opened", row action buttons visible |
| 11 | Labels | 13 rows, each with a dropdown, including labels with 0 emails | Too many places | Hide empty labels (Superhuman), group into 4 (ORGANIZE_GROUPS), one keep-time per group |
| 12 | Security | Each row has Block, ›, ⋯. "Quarantined", "Threats detected" | Jargon, and three controls per row | "Held", "Look like scams", one action per row |
| 13 | Top bar | Grid (Details), gear and Kai icons have no text | You have to guess | Show a text label beside each icon, or say what each does on hover |
| 14 | Details | "All mail · 150 emails" during the read while Gmail holds 3,676. Archive, Trash, Mute, but **no "Label as"** | Looks like missing mail. You can't fix a wrong label where you see it | "150 of 3,676 read so far". Add Label-as with "always for this sender" |
| 15 | Settings | 9 sections. Contacts, New senders, Scam report and Rules hidden in Advanced. Starter rules ("Label mail from Uber Receipts…") appear unasked | Hard to find. Rules you didn't make | Fewer sections. Put "Learned preferences" first and call it "What Cluster learned" |

**Clicks for the main jobs (large mailbox):**
- **Unsubscribe from one sender:** Cleanup → Subscriptions tab → tick → Unsubscribe → confirm. 5 steps.
- **Fix one wrong label:** not possible from Overview, Labels or Details. Only from the Screener (if the email is held) or the sort preview. **This is the biggest triage gap.**
- **Look at a held scam:** Security → row → ›. 3 steps. Fine.

---

## 5. Where Cluster falls short, and engagement

**Falling short:**
1. **Time to first value.** About 1 minute of waiting through sign-in and setup, then 30 minutes before labels on a 4,000-email inbox. Superhuman backfills 14 days; SaneBox sorts new mail at once and the backlog later.
2. **No easy fix-and-learn loop.** You can't correct a label where you see it, and moves in Gmail teach nothing.
3. **Too many places and numbers that disagree** (findings 6, 7, 11, 15).
4. **Charts instead of next steps.** Overview tells you what happened, not what to do.
5. **No daily reason to come back** except the Today email, which can't be acted on.

**Engagement:** Cluster has no analytics, by design, so engagement can't be measured. To learn without breaking privacy, keep **local-only counters** visible in "Privacy & data":
- days the dashboard was opened;
- decisions made (labels fixed, senders stopped, scams reviewed);
- time from install to the first labelled inbox.

Nothing would leave the device. Being visible proves that, and gives you real numbers when you test with friends.

---

## 6. Streamlining, keeping Overview (ranked: impact first, then effort)

| Rank | Change | Impact | Effort |
|---|---|---|---|
| 1 | **Label by Gmail search first.** For each label, run its filter query (`categoryQueries`) as a search with `in:inbox` (5 units per 500 ids), then batchModify. Thousands labelled in under a minute, before the read finishes. The read then fixes leftovers | Very high: labels in minutes, not 30 | Medium (reuse categoryFilters queries plus labelFromIndex's batching) |
| 2 | **Setup and sign-in never wait on Gmail**: go straight in, and the work shows on the scan card | High | Small |
| 3 | **One number per fact**: Cleanup badge = page, Overview Suspicious = Security | High (trust) | Small |
| 4 | **"Label as…" in Details rows, with "always for this sender"**, applied to old mail at once (labelFromIndex scoped to the sender) | High (the triage gap) | Medium |
| 5 | **Learn from Gmail moves**: the change feed shows a Cluster label removed or swapped. After two matching moves for a sender, save a correction | High (SaneBox's core) | Medium |
| 6 | **One category system** (the 4 groups everywhere, with 13 labels inside), hiding empty labels | Medium | Small |
| 7 | **Overview: scan card plus 3 widgets** (Today, Suspicious, Top senders). Charts move to Details | Medium | Small |
| 8 | **Words:** "Held" not Quarantined, "Never opened" not Open rate None, no "speed limit" line, "Welcome" on first visit, one setup wording | Medium | Small |
| 9 | **Get to zero:** "Move everything older than N days out of the inbox, keep unread and starred", undo for 7 days | Medium | Medium |
| 10 | **Labelled top-bar icons, "What Cluster learned" first in Settings** | Low-medium | Small |

Rank 1 is the answer to "4,000 emails gets complicated". Reading every email costs 20 units each, but a Gmail search returns up to 500 ids for 5 units, and labels can be applied 1,000 at a time. Gmail's own filters already prove those queries match the right mail.
