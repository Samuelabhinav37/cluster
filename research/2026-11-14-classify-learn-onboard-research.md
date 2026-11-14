# Classify, learn, onboard: how others do it (research, 2026-11-14)

Status: research only. Nothing built. Companion to `2026-11-13-algorithm-vs-competitors.md` and `2026-11-06-first-scan-research.md`.

Rules used: primary sources only (vendor help centers, vendor blogs, Google and Apple docs). Each claim has a URL. Where only third-party coverage exists, the claim is marked **unverified**.

## 1. How others decide good, bad, and safe to trash

### Signals each product says it uses

| Product | What it reads | Signals named by the vendor | Source |
|---|---|---|---|
| Gmail importance markers | Full mail (Google) | Who you email and how often. Which emails you open. Which you reply to. Keywords in mail you usually read. Which you star, archive or delete. | https://support.google.com/mail/answer/186543 |
| Gmail categories | Full mail (Google) | Not documented. Gmail says it learns when you drag mail between tabs. | https://support.google.com/mail/answer/3094499 |
| Gmail Manage subscriptions | Full mail (Google) | Lists active subscriptions with the number of emails each sender sent "in the past few weeks", sorted by most frequent. How it picks senders is not documented. | https://blog.google/products/gmail/new-manage-subscriptions-unsubscribe/ , https://support.google.com/mail/answer/15621070 |
| SaneBox | Headers only | Which emails you open, which you respond to, how quickly you open, how often you correspond, how long the relationship goes back. Mail from real people stays in the Inbox by default. | https://assets.sanebox.com/faq |
| Clean Email | Headers only (subject, sender, recipients, dates, size). No bodies or attachments. | Cleaning Suggestions use your own past cleaning plus messages "frequently cleaned by other Clean Email users", built from anonymous statistics on sender, subject, attachment count and size, and age. | https://clean.email/help/tools/cleaning-suggestions , https://clean.email/help/basics/smart-folders |
| Superhuman Auto Archive | Full mail (AI) | Built-in Auto Labels: Marketing, Pitch, Social, News. Auto Archive never applies to senders or domains you have emailed before. Always Archive and Never Archive lists. | https://new.superhuman.com/auto-archive-exclusions-inclusions-321320 , https://blog.superhuman.com/solving-customer-success-email-overload/ (fetch failed; content from search snippet, treat as **unverified**) |
| Shortwave | Full mail (AI, server) | Plain-language AI filters, plus per-sender auto-apply labels that sync with Gmail filters. "Reapply filters" shows what the AI did and why. | https://www.shortwave.com/docs/guides/labels/ |
| HEY Screener | Full mail | No model. Every first-time sender waits for a Yes or No. Yes routes to Imbox, The Feed or Paper Trail. Contacts skip the Screener. | https://help.hey.com/article/722-the-screener , https://www.hey.com/features/the-screener/ |
| Spark Smart Inbox | Not stated | Sorts into People, Notifications, Newsletters. Changing one sender's category moves all future mail from that sender. Gatekeeper screens new senders on paid plans. | https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox |
| Apple Mail categories | On device on iOS; on iCloud.com only metadata such as senders and headers, no body | Primary holds personal and time-sensitive mail. Time-sensitive mail from other categories is also shown in Primary. "Categorize Sender" applies to current and future mail. | https://www.apple.com/legal/privacy/data/en/mail-categorization/ (fetch blocked; quoted from search snippet), https://support.apple.com/en-gb/guide/icloud/mmafbebd3108/icloud |
| Leave Me Alone | Subscription mail only, last 6 months | Finds lists from header metadata (List-Unsubscribe). Subscription Score grades senders A to F from aggregated data such as how often a list is seen and how often people unsubscribe. Exact formula unpublished. | https://help.leavemealone.com/en/start-here/first-steps/step-2-scanning-for-emails.md , https://blog.leavemealone.app/introducing-subscription-score/ |
| Unroll.me | Whole inbox | Keep, Block or Rollup per subscription. Detection method not documented in a page I could open. **Unverified.** | https://support.unroll.me/hc/en-us/articles/200391928-How-do-I-edit-my-email-subscriptions (403 when fetched) |
| Mailstrom | Metadata stored; has access to contents | Bundles by sender, subject, time, size. Block makes a rule by sender, list or subject. | https://mailstrom.co/faq |

### How they make trashing feel safe

- Mailstrom: "None of the actions that Mailstrom takes are permanent." Gmail deletes go to Trash, and an Undo in the task list reverses any command. https://mailstrom.co/faq
- Clean Email warns that its Delete is "permanent and irreversible" and that the action bar acts on every selected message. Keep Newest is offered as a softer option. Dismissing a suggestion "does not affect any messages". https://clean.email/help/basics/smart-folders , https://clean.email/help/tools/cleaning-suggestions
- Gmail Manage subscriptions shows a count per sender next to Unsubscribe. After unsubscribing, later mail from that sender goes to Spam "with a banner explaining why". https://support.google.com/mail/answer/15621070
- Superhuman never auto-archives people you have written to. https://new.superhuman.com/auto-archive-exclusions-inclusions-321320
- HEY: screening someone back in shows their mail from the last 90 days, so a wrong No is recoverable. https://help.hey.com/article/722-the-screener
- Leave Me Alone unsubscribes but does not delete old mail. https://help.leavemealone.com/en/start-here/first-steps/step-2-scanning-for-emails.md (as summarised in search; **unverified** wording)
- Gmail's "you haven't opened mail from this sender in 30 days" unsubscribe prompt is reported only by email-marketing blogs. **Unverified** from Google.

### List-Unsubscribe as a trust signal

Since 1 February 2024 Google requires bulk senders (over 5,000 messages a day to Gmail) to support one-click unsubscribe with `List-Unsubscribe-Post: List-Unsubscribe=One-Click` plus a `List-Unsubscribe` URL (RFC 8058), alongside DMARC and alignment. https://support.google.com/a/answer/81126

So a sender with a valid one-click header is very likely a legitimate bulk sender. That makes it a strong "bulk, safe to unsubscribe" signal. It says nothing about whether the user wants the mail.

## 2. How they improve classification

### Learning from corrections

| Product | Correction | Effect | Speed | Source |
|---|---|---|---|---|
| Gmail tabs | Drag a message to another tab | Over time it "helps Gmail learn your preferences". Undo reverses the move. Whether Gmail offers a per-sender rule here is not stated on this page (**unverified**). | Not stated | https://support.google.com/mail/answer/3094499 |
| Gmail importance | Click the marker | Teaches Gmail | Not stated | https://support.google.com/mail/answer/186543 |
| SaneBox | Move a message between Inbox and a Sane folder, or use the Digest dropdown | Sender trained | Out of a Sane folder to Inbox: "almost immediately". Inbox to Sane folder: 5 to 15 minutes. | https://sanebox.zendesk.com/hc/en-us/articles/203094276-How-do-I-train-teach-SaneBox |
| SaneBox DIY folders | Move a few examples into a custom folder | Learns where similar mail belongs | Not stated | https://www.sanebox.com/help/248-how-do-i-train-based-on-project-instead-of-priority |
| Spark | Change a sender's category | All future mail from that sender | Immediate | https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox |
| Apple Mail | Categorize Sender | Current and future mail. Reset removes all manual choices. | Immediate | https://support.apple.com/en-gb/guide/icloud/mmafbebd3108/icloud |
| HEY | Change a contact's destination | Existing and future mail move. Moving one email does not change the rule. | Immediate | https://help.hey.com/article/787-paper-trail |
| Shortwave | Label a thread with auto-apply on | Future threads from that sender | Immediate | https://www.shortwave.com/docs/guides/labels/ |
| Clean Email | Clean messages | Future suggestions for similar mail. Can turn a suggestion into an Auto Clean rule. | Not stated | https://clean.email/help/tools/cleaning-suggestions |

Two patterns stand out. First, almost every product treats a correction as a **per-sender rule**, applied to past and future mail. Second, products separate "move this one" from "move everything from this sender" (HEY says so explicitly).

### Per-user vs global

- Per user only: SaneBox, Spark, Apple Mail manual choices, HEY, Superhuman lists, Shortwave auto-apply. Sources above.
- Global from many users: Clean Email suggestions use "frequently cleaned by other Clean Email users" data. https://clean.email/help/tools/cleaning-suggestions . Leave Me Alone Subscription Score uses aggregated unsubscribe and frequency data. https://blog.leavemealone.app/introducing-subscription-score/
- Google's spam classifier is one shared model. RETVec raised spam detection 38% and cut false positives 19.4% over the old vectorizer, and the model can be converted to TFLite for devices. https://security.googleblog.com/2023/11/improving-text-classification.html . Whether Gmail personalises it per user is not stated there.

### On device vs server

- Apple: on iOS "categorization processing occurs entirely on-device". https://www.apple.com/legal/privacy/data/en/mail-categorization/
- SaneBox and Clean Email: server side, headers only. https://assets.sanebox.com/faq , https://clean.email/help/basics/smart-folders
- Shortwave: embeddings on its own GPU servers, stored per user in Pinecone. https://www.shortwave.com/blog/deep-dive-into-worlds-smartest-email-ai/

No vendor publishes accuracy numbers on a primary page. Third-party reviews of SaneBox claim 1 to 4 weeks to reach good accuracy. **Unverified.**

### Cold start

- SaneBox does not move old mail at signup. It processes the backlog overnight (11 PM to 5 AM local), which "may take a couple of nights". You can use it right away. https://www.sanebox.com/help/348-why-are-there-still-so-many-emails-in-my-inbox
- Mailstrom emails you when the account is ready. Wait depends on server load more than mailbox size. https://mailstrom.co/faq
- HEY avoids cold start by asking about each new sender. Imported contacts skip the Screener. https://help.hey.com/article/722-the-screener
- Superhuman ships fixed built-in labels so day one works without training. https://new.superhuman.com/auto-labels-custom-auto-labels-313354 (search snippet; **unverified** wording)

### Gmail API limits that set the speed ceiling

| Limit | Value | Source |
|---|---|---|
| Per user per project | 6,000 quota units per minute | https://developers.google.com/workspace/gmail/api/reference/quota |
| Per project | 1,200,000 units per minute | same |
| `messages.get` | 20 units (60 for full, raw or html) | same |
| `messages.list` | 5 units, max 500 ids per page (default 100) | same, https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list |
| `messages.modify` / `batchModify` | 5 / 50 units | quota page |
| `history.list` | 2 units | quota page |
| `threads.get` | 40 units (120 full) | quota page |
| Batch size | Hard cap 100 calls. Google recommends no more than 50. | https://developers.google.com/workspace/gmail/api/guides/batch |
| Concurrency | Per-user concurrency limit is shared by all clients on the mailbox. Error "Too many concurrent requests for user". Retry with backoff starting at 1 second. | https://developers.google.com/workspace/gmail/api/guides/handle-errors |
| History | Records usually kept at least a week, sometimes less. Old `startHistoryId` returns 404 and needs a full sync. | https://developers.google.com/workspace/gmail/api/guides/sync |
| `q` search | Cannot be used with the `gmail.metadata` scope. | messages.list page |

What this means in numbers: at 20 units per `messages.get`, 6,000 units a minute caps a single user at about **300 metadata reads a minute**, or about 18,000 an hour, before any other call. A 20,000 mail first read therefore has a floor of roughly 65 to 70 minutes. 100,000 mails is about 5.5 hours. `messages.list` with `q` costs 5 units for up to 500 ids, which is about 100 times cheaper per message than reading. Counting and labelling by Gmail search is far faster than reading every header. After the first read, `history.list` at 2 units keeps the index current cheaply.

## 3. Onboarding

### Sign in and permissions

- Google shows a per-scope consent screen when an app asks for more than one non sign-in scope. Users can untick scopes, and apps must handle partial grants. Google recommends asking for each scope when it is needed (incremental authorization). https://developers.google.com/identity/protocols/oauth2/resources/granular-permissions
- Duolingo moved sign-up "back a few steps", which gave "about a 20% increase in DAUs". Later tuning of skippable "soft walls" and required "hard walls" gave another 8.2%. Quote from Gina Gotthilf, VP Growth. https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker

### First value before real data

- Linear points new users to a demo workspace that resets on refresh, plus live onboarding sessions. https://linear.app/docs/start-guide
- Superhuman ran 1:1 onboarding calls aiming at Inbox Zero in about 30 minutes. https://blog.superhuman.com/the-fastest-way-to-inbox-zero-a-single-coaching-session/ . Its "synthetic inbox" practice step is described only by third parties. **Unverified.**
- Arc offered profile import from another browser during onboarding. https://resources.arc.net/hc/en-us/articles/22513842649623-Arc-for-Windows-2023-2026-Release-Notes . Arc now takes no new accounts. https://arc.net/

### Showing what a first pass did and asking to confirm

- SaneBox Daily Digest lists what it moved, with a dropdown to send a sender back to the Inbox. https://assets.sanebox.com/faq , https://sanebox.zendesk.com/hc/en-us/articles/203094276-How-do-I-train-teach-SaneBox
- Clean Email Cleaning Suggestions: accept or dismiss each one; turn one into an Auto Clean rule. https://clean.email/help/tools/cleaning-suggestions , https://clean.email/help/basics/getting-started
- Shortwave "Reapply filters" on sample mail shows each action and why. https://www.shortwave.com/docs/guides/labels/
- HEY: the whole model is a confirm step, per sender, with a History to change decisions. https://help.hey.com/article/722-the-screener
- Spark Gatekeeper: choose screen before the inbox, inside it, or accept all. https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox

### Long jobs, estimates, done summaries

- SaneBox runs the backlog overnight across nights and says so up front. https://www.sanebox.com/help/348-why-are-there-still-so-many-emails-in-my-inbox
- Mailstrom sends an email when the account is ready. https://mailstrom.co/faq
- Leave Me Alone says big mailboxes take longer and asks users to email if a scan looks stuck. https://help.leavemealone.com/en/start-here/first-steps/step-2-scanning-for-emails.md (search summary; **unverified** wording)
- No vendor in this set publishes a live ETA design on a primary page. **Unverified** for all.

## 4. What this means for Cluster

- Cluster's signals already match the industry: sender kind, List-Unsubscribe, Gmail categories, people you write to. The missing signals the vendors name are **open and reply behaviour per sender** (SaneBox, Gmail importance) and **"never auto-act on anyone you have written to or their domain"** (Superhuman).
- Every competitor gives the user a confirm loop. Cluster has none after the first scan. This is the largest gap.
- Corrections everywhere are per-sender rules that apply to past and future mail. Cluster already learns per sender from Gmail moves. It should also offer that inside Cluster and make the past-and-future choice explicit.
- Global learning exists only as anonymous aggregates (Clean Email, Leave Me Alone). Cluster can get most of the value with a shipped, versioned brand registry and no user data leaving the device.
- Speed is bound by 6,000 units a minute per user. Search-first labelling is the right design. Reading every header should be background work.

## Recommendations for Cluster

### Install
1. Open the dashboard on install with one sentence and one button. No mascot speech before sign-in.
2. Offer a 20-second practice inbox before sign-in (Duolingo, Linear). Cluster already has a practice inbox in setup. Move it in front of the Google screen as an optional "See it first".

### Sign in
3. Ask only the Gmail scopes the first scan needs. Ask for extra scopes (filters, settings) at the moment a feature needs them (Google incremental authorization).
4. Handle a partial grant. If a scope is unticked, say which feature is off and offer to ask again.

### Setup
5. Keep the 4 steps. Add one rule to "How hands-on": in both modes, Cluster never trashes or archives mail from people you have written to or their domain (Superhuman rule).
6. Pre-tick "always stay" with anyone you have replied to in the last year. Show the count, not names.

### Quick scan
7. Label with Gmail search first (`messages.list` with `q`, 5 units per 500 ids). Show counts per label within the first minute.
8. Read only the newest 150 headers in the foreground. Everything else goes to background.

### Review of labelling (new step)
9. After the quick scan, show "Here's what I sorted. Is this right?" One row per label with the top 3 senders and a count.
10. Each sender row has Right / Move to... . A move asks one question: "Just this email, or everything from this sender?" Everything applies to past and future mail (HEY, Spark, Apple).
11. Show the "with no label" group as its own row with its top senders and three choices: Keep in inbox, Screener, Pick a label.
12. Record each answer as a per-sender override, the same store Cluster already uses for Gmail moves.

### Full scan with ETA
13. Base the ETA on the quota, not on a guess: remaining headers divided by measured reads per minute, capped by 300 a minute. Say "about 1 hour" for 20,000 rather than a seconds countdown.
14. Use batches of 50 or fewer and back off on 429 starting at 1 second (Google guidance). Show "Paused by Gmail, resuming" instead of a frozen bar.
15. Persist progress so a closed tab resumes. Send a Chrome notification when done (Mailstrom emails; Cluster can notify).
16. After the first read, keep current with `history.list`. If Gmail returns 404, run a quiet catch-up scan.

### Final findings
17. The done summary shows three facts: mail sorted per label, mail left with no label, and senders to review. Each opens its list.
18. Re-show the review step only for senders that changed label during the full scan.

### Cleanup safe-to-trash signals
19. Score each sender by: emails in the last 90 days, share opened, any reply ever, one-click List-Unsubscribe present, age of newest opened mail.
20. Mark a sender "safe to trash" only when all hold: never replied, never written to, opened under 10%, bulk sender (List-Unsubscribe or Gmail Promotions/Updates), not starred, not Important. Show the reason in plain words, e.g. "112 emails, opened 0, you never replied."
21. Trash, never permanent delete. Keep Undo. Offer "Keep newest" as the softer choice (Clean Email).
22. Prefer Unsubscribe over Trash when one-click is present. Trash old mail as a second, optional step.

### Learning loop
23. One correction store: per-sender overrides from Gmail moves, the review step, and Details "Label as". Apply to past and future mail.
24. Learn per sender engagement on device from labels Gmail already gives (`UNREAD`, `STARRED`, `IMPORTANT`, sent mail). No body reading needed.
25. A weekly digest of what Cluster moved, with Right / Wrong per sender (SaneBox Digest). Every Wrong becomes an override.
26. For unlabelled Primary/Important mail, after 30 days suggest a label or Screener for senders with no replies. Never move people you write to.
27. Global learning without sending user data: ship the brand and domain registry as a versioned file inside the extension, updated with releases. Grow it from the user's own anonymised research, not from telemetry. Add opt-in aggregate counts only if there is a privacy policy and a server for it.
28. Track a local accuracy number: share of auto labels the user later moved. Show it nowhere, but use it to decide when to stop asking for review (for example below 2% moved for a label).
