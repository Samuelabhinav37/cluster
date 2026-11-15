# How other mail tools handle the problems left in Cluster's tests

2026-11-15. Follows `2026-11-15-sorting-mistakes-research.md`.

## What each one does

| Tool | What it reads | How it sorts | First-time senders | Scams |
|---|---|---|---|---|
| SaneBox | Headers only (sender, subject, date); bodies only for optional AI replies | Per sender, from your behaviour; moving a message trains future mail from that sender | Decided from headers and history | Left to the mail provider |
| Clean Email | Headers only; bodies and attachments never downloaded | Groups by sender (name + address) and fixed Smart Folders; you act on groups | No special handling | Left to the mail provider |
| HEY | Its own mail service | You decide once per sender: Imbox, The Feed (newsletters) or Paper Trail (receipts, order confirmations, notifications) | Every first-time sender waits in the Screener; contacts and a "Speakeasy" code skip it | The Screener keeps strangers out of sight |
| Spark | Its own client | Per sender into Personal, Notifications and Newsletters; one correction moves all future mail from that sender | Classified on arrival | Left to the mail provider |
| Superhuman | Content, subject, sender and recipients, by AI (opt-in) | Auto Labels (Marketing, Pitch, Social, News) feed Split Inbox | Classified by AI | Content-based |
| Outlook Focused Inbox | Content and interaction | Per-user model; who you write to and reply to is the strongest signal | Unknown senders default to Other unless strong signals say Focused | Separate filter |

## What it means for the four open problems

1. **Order confirmations under Shipping (ticket orders).** No one splits receipts, orders and shipping as finely as Cluster. HEY puts receipts, order confirmations and notifications together in Paper Trail. Cluster's label is "📦 Orders & shipping", so an order confirmation there is right by Cluster's own design (two unit tests say so). The test answer key was wrong, and has been fixed.
2. **"Verify your email address" under Codes.** HEY (Paper Trail) and Spark (Notifications) don't separate codes from account notices at all. The tuned mailbox already counted Codes as right, so held-out A's key now agrees.
3. **Missing sending headers.** The tools that read only headers (SaneBox, Clean Email) and Outlook all fall back on who you write to, and send unknown senders to a lower-priority place: Cluster's Screener. In real use, Cluster's index has kept Return-Path, Message-ID, Feedback-ID and the threading headers since row version 2 (2026-10-16), and older rows are re-read once. So the 15% of rows without headers in the test generator is a stress test, not real mail. The 5 misses left on held-out A are all such rows.
4. **Scams only the body reveals.** No metadata-only tool solves this. SaneBox and Clean Email leave scams to the mail provider, and Superhuman and Outlook read content. HEY's answer is to hold every first-time sender until you say yes. Cluster's campaign signal already catches extortion sent as a run. A single extortion email in new wording is the case left, and only two things would catch it: Gmail's preview snippet (it breaks "Metadata-only") or HEY-style screening of every first-time free-mail sender (it costs you a tap per new friend).

## Where Cluster already matches them

- One correction covers all future mail from a sender (Spark, HEY, SaneBox): `sortOverrides`, and pattern keys for machine addresses.
- Learning from moves (SaneBox): `learnFromLabelMoves`.
- Contacts skip screening (HEY, Outlook): known senders, replies in your threads, and threads that copy your contacts.
- A first-time-sender holding area (HEY): the ✋ Screener, for anything Cluster can't place.

## Sources

- SaneBox, "How does SaneBox work": https://www.sanebox.com/help/155-how-does-sanebox-work ; review: https://geekflare.com/software/sanebox-review/
- Clean Email Smart Folders: https://clean.email/help/basics/smart-folders ; privacy: https://clean.email/is-clean-email-safe
- HEY, The Screener: https://help.hey.com/article/722-the-screener ; how it works: https://hey.com/how-it-works
- Spark Smart Inbox: https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox
- Superhuman Auto Labels: https://help.superhuman.com/hc/en-us/articles/40127432866323 ; https://techcrunch.com/2025/02/19/superhuman-introduces-ai-powered-categorization-to-reduce-spammy-emails-in-your-inbox
- Outlook Focused Inbox (third-party summaries; Microsoft does not publish the weighting): https://office-watch.com/2023/focused-inbox-outlook/ ; https://bowdoin.teamdynamix.com/TDClient/1814/Portal/KB/Article/119446/What-Is-the-Focused-Inbox-in-Outlook
