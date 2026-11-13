# Cluster's algorithm against SaneBox, Clean Email, Superhuman, Shortwave, Gemini and Copilot

2026-11-13. Two parts: what was wrong on the real mailbox today, and how the six products decide and move mail compared with Cluster.

## 1. What the real mailbox showed (read-only check, 2026-11-13)

- In the last 7 days **no labelled email left the inbox** except mail a Gmail filter sends straight to Muted. Promotions labelled 7 hours earlier were still in the inbox with a 1-hour limit.
- About **200 inbox emails from the last 14 days have no label at all**. Many are plain newsletters (OCEG, Resume Worded, OpenRouter, Ministry of Testing, Google Developer Program) and job alerts (jobs2web, Randstad, Alignerr, Nexxt).
- Labels that did land came from Gmail's own filters, which run on Google's servers. Everything Cluster's background run does itself (label by header, move out, hold unsorted) had stopped.

### Cause

The background run did its steps in one chain: filter sync, search labelling, **the full mailbox read**, index refresh, tagging, relabel, and the move-out last.

1. Since 2026-11-06 the first scan reads every email. On this mailbox that is over an hour of reading, and it only runs while Chrome keeps the service worker alive.
2. The read paces itself to leave exactly 1,500 quota units free. The 5-minute run refused to start below 1,500 free. So while a read was going, every run was skipped.
3. When a run did start, it went into the read first and stayed there. The move-out never came.
4. Any error in an earlier step (filter sync, the read) ended the run before the move-out.

### Fix (this commit)

- Order is now: filter sync, search labelling, index refresh, **tag new mail, move out, hold unsorted**, and only then the long read, older inbox pages and relabel.
- Every step is isolated. One failing step is logged and the rest go on.
- The quota floor for a run is 500, not 1,500.
- Test: the move-out runs before the read, and still runs when the filter sync and the read both fail.

Not proven from outside the browser: which of causes 2 to 4 hit on a given day. The fix covers all three. Not covered: another computer holding the one-device lease, labels switched off by a synced setting, or a failed sign-in refresh. See "Health line" below.

## 2. How the others work

| Product | Where it runs | What it reads | How it decides | What it does with the mail | How it learns |
|---|---|---|---|---|---|
| SaneBox | Their servers, IMAP, always on | Headers only (vendor and reviewers) | Past behaviour with the sender. People you write to stay in the inbox | Moves unimportant mail to a SaneLater folder at once. Digest lists what moved | Drag an email to another folder. People are trained by sender, services by sender **and subject** |
| Clean Email | Their servers | Headers and metadata only (vendor claim) | User-made Auto Clean rules, plus fixed Smart Folder views | Rules move, archive, label, delete, send to Read Later. Screener holds first-time senders | No learning. Rules, a weekly summary of what rules did, pause switch |
| Superhuman | Their servers, full mail client | Content, subject, sender, recipients | AI Auto Labels: Marketing, Pitch, Social, News, plus custom prompts | Auto Archive: mail **skips the inbox on arrival**. Never for people you emailed, your own domain, or a Never Archive list | Prompts and the Never Archive list |
| Shortwave | Their servers, full mail client, Gmail only | Full content | AI filters written in plain language or search syntax | Label, archive, star, mark important. Bundles group a label into one inbox row. Delivery schedules hold a label until a set time | Edit the filter text |
| Gemini in Gmail | Google | Full content | AI Inbox: "Suggested to-dos" and "Topics to catch up on". Manage subscriptions lists senders by volume | Nothing moves. It is a second view. Unsubscribe is one click | Marking important and moving to Primary |
| Copilot in Outlook | Microsoft | Full content | Prioritize: high, normal, low, with a one-line reason, from plain-language rules you write | Nothing moves. Needs a Microsoft 365 Copilot licence. New mail only | Edit the rules |

Sources: SaneBox help 186 and 155, Clean Email help (Auto Clean, Smart Folders), Superhuman blog and help (Auto Labels, Auto Archive), Shortwave docs (bundles, AI filters), TechCrunch and Android Central on Gmail AI Inbox (Jan 2026), Microsoft's Copilot in Outlook FAQ as quoted by third parties. Superhuman's and Microsoft's own help pages blocked a direct read, so those rows rest on search summaries.

## 3. Where Cluster stands

Same or better:

- Reads headers only, like SaneBox and Clean Email, and nothing leaves the browser. None of the six can say the second part.
- Labels land through Gmail's own filters, so they work with Chrome closed.
- People you write to are never moved. Same safeguard as SaneBox and Superhuman.
- Learns from label swaps in Gmail, like SaneBox's drag training.
- Scam checks. None of the six do this.

Weaker:

1. **Runs only while Chrome is open.** All four paid products run on a server all day. Cluster's move-out, header labelling and holds wait for the browser.
2. **A timed move-out is a fragile design.** Superhuman and SaneBox move mail the moment it arrives, as one server step. Cluster labels first and moves later, so there is a second job that can stop without anyone noticing, as it did this week.
3. **No visible proof it is working.** SaneBox sends a digest and Clean Email a weekly summary of what its rules did. Cluster removed its "Last checked, moved N" line.
4. **Corrections are per sender only.** SaneBox splits a service by subject, so a store's receipts and its ads go to different places. Cluster's kind rules do this by fixed phrases, but a user correction applies to the whole sender.
5. **Unlabelled leftovers.** About 200 in 14 days here. The products with content access leave almost none.
6. **No "why".** Copilot gives a one-line reason for each priority. Cluster's Today list picks mail without saying why.

## 4. What to change, in order

1. **Skip the inbox on arrival for labels the user never wants to see** (Promotions, Newsletters, Social). The Gmail filter already exists for each label. Adding "skip inbox" to it makes the move a server step that cannot stall and works with Chrome closed. The 1-hour window stays only for labels where a glance matters (Orders, Receipts, Finance, Accounts, Jobs, codes). Setup already has this as `SKIP_INBOX_BUCKETS`. Existing installs were migrated to 1 hour instead. Needs the user's yes, since it changes what they see.
2. **Health line.** Overview shows "Moved 12 today. Last run 4 min ago." and turns into a warning when no run finished in 30 minutes while Chrome was open. `autoSort.lastSweep` already holds the data. This is what would have caught this week's stall on day one.
3. **Fallback label for list mail.** Mail with a List-Unsubscribe header or in Gmail's Updates or Promotions tab that fits no label becomes Newsletters or Promotions. Clears most of the 200 leftovers. Check first why the tagger left OCEG and OpenRouter alone once the run is alive again. It may already do this and simply was not running.
4. **Job alerts by sender pattern.** `jobnotification@`, `jobs@`, and "job alert", "new jobs posted", "job notification" subjects. Four of the first 25 leftovers were job alerts.
5. **Sender plus kind corrections.** When the user relabels one email, offer "all mail from X" or "only X's receipts". Stored as `sortOverrides["address|kind"]`, checked before the address rule.
6. **Reason on Today rows.** "You replied to them last week", "Delivery today", "Starred". The picker already knows which rule matched.
7. **One screen of what Cluster did.** A daily list: moved 31, labelled 44, held 2, each row opens the Gmail search. This is SaneBox's digest without the email.

Not worth chasing: summaries, to-dos and drafting (Gemini, Copilot, Superhuman, Shortwave). They need the body of the mail and a model on a server, which is the one thing Cluster promises not to do.

## 5. Simpler to use

The others ask the user for one decision each:

- SaneBox: nothing. It starts moving mail and you correct it by dragging.
- Superhuman: one switch per label, "Auto Archive".
- Shortwave: one sentence per filter.
- Copilot: one sentence saying what matters.

Cluster asks per label: Off, Label only, Skip inbox, Move after X, plus a window. Proposal: two states per label, **Show in inbox** or **Keep out**, and one global "glance time" (1 h, 3 h, 1 day) for the labels that show. Everything else moves to Advanced. That is change 1 above seen from the screen.
