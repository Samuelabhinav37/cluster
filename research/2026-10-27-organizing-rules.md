# Organizing rules: what other mail tools offer

Asked 2026-10-27: which organizing rules and one-tap presets do real email tools ship, so
Organize can grow past its six time-limit cards. Sources are official help centers and product
pages, fetched 2026-10-27. Where a page could not be fetched it says so.

## Cluster today (for comparison)

Six one-tap cards, each sets one kind's "time in your inbox": Codes 1 day, Promotions skip the
inbox, Newsletters 1 week, Tracking 3 days, Receipts 1 week, Social 1 day. A Gmail filter labels
new mail and a 5 minute sweep moves it out of the inbox when time is up. Nothing is deleted.
Kinds without a card yet: shopping, travel, finance, productivity, education.

Other machinery: Mute a sender, Unsubscribe, Keep newest N per sender (**trashes** the rest,
`src/lib/keepNewest.ts`), expiry triage (**trashes** old codes, delivered parcels, expired
offers), Snooze a sender, Screener with "Let in", scam hold, Sort my inbox, Rules tab,
"never opened" senders.

## Gmail

| Preset or rule | Matches | Does | Setup | Source |
|---|---|---|---|---|
| Filter | sender, to, subject, words, size, attachment | label, archive ("skip the inbox"), delete, star, forward, mark important, categorize | full rule editor, or "Filter messages like these" from a message | [Gmail Help: filters](https://support.google.com/mail/answer/6579?hl=en) |
| Categories (Primary, Social, Promotions, Updates, Forums) | automatic, learns from drag between tabs | sorts into tabs, stays in inbox | on/off; per-sender via a filter "Categorize as" | [Gmail Help: categories](https://support.google.com/mail/answer/3094499?hl=en) |
| Manage subscriptions | active mailing lists by sender | unsubscribe; future mail goes to Spam | one tap per sender (rolling out) | [Gmail Help: subscriptions](https://support.google.com/mail/answer/15621070?hl=en) |
| Nudges | received with no reply, sent with no reply | remind (resurface at top) | two checkboxes | official page not found; only third-party coverage, so not cited |

Notes: you cannot add custom categories; a hidden `category:reservations` exists for search only
(same categories page). Filters only act on new mail unless you apply them to existing matches.

## Apple Mail and iCloud Mail

| Preset or rule | Matches | Does | Setup | Source |
|---|---|---|---|---|
| Categories: Primary, Transactions, Updates, Promotions | automatic. Transactions = confirmations, receipts, shipping. Updates = news, newsletters, social | sorts into views; time-sensitive mail also shows in Primary | on/off; recategorize a sender, which applies to all current and future mail | [iCloud guide: categories](https://support.apple.com/guide/icloud/use-categories-mmafbebd3108/icloud) |
| Sender digest in a category | one sender within a category | groups all their mail; bulk mark unread, move, archive, delete | open a message | same page |
| iCloud Mail Cleanup: "Clean Up Old Promotions" | Promotions, by read state and age | action chosen (delete by default) | one tap recommendation, then edit Action, Status (read, unread, all), Age | [iCloud guide: cleanup](https://support.apple.com/guide/icloud/automatically-clean-up-icloud-mail-mma3d15ee93e/icloud) |
| iCloud Mail Cleanup: "Archive Old Transactions" | Transactions, by read state and age | archive | same | same page |
| Unsubscribe recommendations | senders in Updates and Promotions | unsubscribe in bulk, future mail to Trash | pick senders, one button | same page |
| Rules (iCloud.com) | sender and other fields | move to folder, forward, and more; up to 500 rules, ordered | rule editor | [iCloud guide: rules](https://support.apple.com/guide/icloud/set-up-filtering-rules-mm6b1a3f8a/icloud) |

The iPhone categories page (`iph8f7d2a1f6`) and the macOS Mail rules page returned only
navigation when fetched, so iPhone and Mac specifics are not confirmed here. The iCloud pages
above describe the same four categories.

The Cleanup "Status" choice (only read mail, only unread, or all) is the one idea here nobody
else surfaces in a preset.

## Outlook

| Preset or rule | Matches | Does | Setup | Source |
|---|---|---|---|---|
| Sweep: delete all from sender | one sender | deletes now, optionally all future mail | pick a message, choose an option | [MS Support: Archive, Sweep](https://support.microsoft.com/en-us/outlook/organize-your-inbox-with-archive-sweep-and-other-tools-in-outlook-on-the-web) |
| Sweep: keep only the latest | one sender | keeps newest, deletes the rest | same | same page |
| Sweep: delete older than 10 days | one sender | deletes mail past 10 days (rules run once a day) | same | same page |
| Move to (all from sender) | one sender | moves all their inbox mail to a folder | pick a message | same page |
| Focused Inbox | automatic; bulk and automated mail goes to Other | two tabs, Focused and Other; "Always move to Other" for a sender | on/off, per-sender choice | [MS Support: Focused Inbox](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978) |
| Rules | sender and many conditions | move, delete, flag, forward and more; ordered | "Create rule" from a message moves all from that sender, or full editor | [MS Support: rules](https://support.microsoft.com/en-us/office/manage-email-messages-by-using-rules-in-outlook-c24f5dea-9465-4df4-ad17-a50704d66c59) |
| Quick Steps | the selected message | several actions in one click (move, pin, mark unread, forward); not undoable | build once, then one click | [MS Support: Quick steps](https://support.microsoft.com/en-us/office/quick-steps-in-outlook-d8efbdbd-5098-491b-9d2e-8c7b6f45a9b4) |

Third-party guides say Sweep's 10 day option can also move instead of delete. Microsoft's own
page only says delete, so treat move as unconfirmed.

## HEY

| Preset or rule | Matches | Does | Setup | Source |
|---|---|---|---|---|
| Screener | first email from any sender | Yes lets them in, No blocks quietly; whole domain can be screened in | one yes/no per sender | [HEY Help: Screener](https://help.hey.com/article/722-the-screener) |
| Imbox | screened-in senders by default | important mail | default destination | [HEY: how it works](https://www.hey.com/how-it-works/) |
| The Feed | senders you send there | newsletters as a scrolling feed, no unread count; recycled after 90 days by default (**deletes**) | per sender choice; changing it moves their old mail too | [HEY Help: The Feed](https://help.hey.com/article/761-the-feed) |
| Paper Trail | senders you send there | receipts and confirmations out of sight but findable | per sender choice | [HEY Help: Paper Trail](https://help.hey.com/article/787-paper-trail) |
| Set Aside | one email | parks it in a pile for reference | one tap | [HEY features](https://www.hey.com/features/) |
| Reply Later | one email | stack at the bottom, "Focus & Reply" opens them all | one tap | [HEY: how it works](https://www.hey.com/how-it-works/) |
| Bubble Up | one email or many | returns it to the top of the Imbox at a chosen time | one tap plus a time | [HEY Help: Bubble Up](https://help.hey.com/article/766-bubble-up) |
| Bubble Up if no reply by | a sent email | resurfaces it if they have not replied | one tap plus a date | [37signals update](https://updates.37signals.com/post/new-in-hey-bubble-up-if-no-reply-by) |
| Bundle | one sender | all their mail as one row in the Imbox | per sender toggle | [HEY Help: Bundle](https://help.hey.com/article/765-bundle-email) |

HEY's model is three places per sender, chosen once, applied to old mail too.

## SaneBox

| Preset or rule | Matches | Does | Setup | Source |
|---|---|---|---|---|
| SaneLater | lower-priority mail, learned | moves out of inbox to a folder | on/off, train by moving | [SaneBox: features](https://www.sanebox.com/help/138-what-is-a-feature) |
| SaneNews | newsletters and mailing lists | moves to a folder for batch reading | on/off | same page |
| SaneBlackHole | a sender you drag in | future mail goes there, **trashed after 7 days** | drag once | [SaneBox: SaneBlackHole](https://www.sanebox.com/help/235-saneblackhole-what-do-i-do-with-my-saneblackhole-folder) |
| SaneCC | mail where you are only CC'd | moves to a folder | on/off | [SaneBox: features](https://www.sanebox.com/help/138-what-is-a-feature) |
| SaneSnooze (SaneTomorrow, SaneNextWeek) | what you drag in | returns it to the inbox later | drag | same page |
| SaneReminders / SaneNoReplies | sent mail with no reply | reminds you, or files a copy in a folder | address in CC/BCC, or on/off | same page |
| DIY training (e.g. SaneReceipts, SaneBills) | learned from examples | custom folder | drag examples | same page |
| Daily Digest | everything filtered out | one summary; bulk Move to Inbox, Archive All, Trash All, Train | on by default | [SaneBox: Digest](https://www.sanebox.com/help/170-daily-digest-why-should-i-use-it-and-how-do-i-read-it) |

The Digest is pitched as the "safety net": the reason moving mail out of the inbox feels safe.

## Clean Email

| Preset or rule | Matches | Does | Setup | Source |
|---|---|---|---|---|
| Auto Clean rule | folder or Smart Folder, sender, address, domain, text, read state, age, size | Trash, Archive, Move, Read Later, Keep Newest, labels, mark read, star, Delete, Spam | full rule editor; warns it acts without asking | [Clean Email: create rules](https://clean.email/help/auto-clean/create-rules), [overview](https://clean.email/help/auto-clean/overview) |
| Keep Newest | a sender or a subject | **trashes** older mail as new arrives | rule action | [Clean Email: features](https://clean.email/features) |
| Trash as they get older | a rule's matches | **trashes** after a set age | rule | same page |
| Mute | sender, subject, other | hides frequent threads | one tap per group | same page |
| Deliver to / Read Later | a sender | future mail to a folder; optional digest on a schedule | one tap "Deliver to Read Later" | [Clean Email: Read Later](https://clean.email/help/tools/read-later) |
| Smart Folders | built-in groups: Top senders, Automated, You are CC'd, Finance, Social, Rideshare, Food delivery, Online shopping | bulk action, or "Create rule" from a group | browse and tap | [Clean Email: Smart Folders](https://clean.email/help/basics/smart-folders) |
| Screener | any sender who never wrote before | holds for review; approve or block | on/off | [Clean Email: Screener](https://clean.email/help/tools/screener) |
| Unsubscriber | mailing lists | unsubscribe, keep, or route | one tap per sender | [Clean Email: Unsubscriber](https://clean.email/help/tools/unsubscriber) |

## Shortwave

| Preset or rule | Matches | Does | Setup | Source |
|---|---|---|---|---|
| Inbox Splits | importance, labels, senders, search | tabs; hide empty splits; per-split bundling by sender | settings | [Shortwave guide](https://www.shortwave.com/docs/guides/labels/) |
| Bundles | built-in labels (Newsletters, Promotions, Travel), custom labels, contacts | one row; snooze, delete or done the whole bundle | toggle per label | same page |
| Delivery schedules | a label or contact | holds mail and delivers it at set times (e.g. newsletters Saturday 8am) | pick from a dropdown | same page |
| Skip Inbox filter | a filter | marks done on arrival | filter | same page |
| Auto-apply labels | a sender | "Always apply" a label | from the label picker | same page |
| AI filters | plain-language description or search | label, archive, mark important, star, add todo, delete | describe once | same page |

The `/docs/guides/splits/` and `/bundles/` URLs both served the same combined guide.

## Superhuman

| Preset or rule | Matches | Does | Setup | Source |
|---|---|---|---|---|
| Built-in Auto Labels: Marketing, Pitch, Social, News | AI | labels | one tap from the library | [Superhuman: Sort Smarter](https://help.superhuman.com/hc/en-us/articles/45266296636947-Sort-Smarter) |
| Custom Auto Labels (paid tiers) | From, To, Subject or an AI prompt, with exclusions, live preview | labels new mail and the past 14 days | builder | same page |
| Split Inbox | Auto Labels, sender, domain, subject, AI | tabs | library or "Build your own" | same page |
| Auto Archive | chosen Auto Labels; Always Archive sender or domain | skips the inbox into the label and an "Auto Archived" view | pick labels | [Superhuman: Auto Archive](https://help.superhuman.com/hc/en-us/articles/40127823829267) |
| Auto Archive exceptions | anyone you have emailed; your own domain; mixed labels; a Never Archive list | always stays in inbox | automatic plus a list | same page |
| Auto Reminders | sent mail with no reply: "needs a follow-up" (AI), "all external", or none; weekdays only option | brings it back to the inbox | one choice | [Superhuman: Auto Reminders](https://help.superhuman.com/hc/en-us/articles/40144492186515) |

Auto Summarize: no help article with setup steps was found; only marketing mentions.

## Spark

| Preset or rule | Matches | Does | Setup | Source |
|---|---|---|---|---|
| Smart Inbox | automatic: people, notifications, newsletters | people on top, the rest grouped below | on/off | [Spark: Smart Inbox](https://sparkmailapp.com/features/smart_inbox) |
| Newsletters and Notifications | those senders | two expandable folders; no push alerts for them | automatic | [Spark: Newsletters & Notifications](https://sparkmailapp.com/features/newsletter-notifications) |
| Gatekeeper | first email from any sender | accept or block future mail; block a sender or domain | one tap per sender | [Spark: Gatekeeper](https://sparkmailapp.com/features/gatekeeper) |

Spark's official pages are thin marketing copy; the follow-up reminder feature page returned 404
and the help center was not reached, so card names (People, Notifications, Newsletters) come
only from these pages and third-party reviews.

## Fastmail

| Preset or rule | Matches | Does | Setup | Source |
|---|---|---|---|---|
| Rules | conditions on sender, subject, etc.; regex in "no-preview" mode | pin, notify, move out of inbox, snooze until, send a copy, **delete to trash**, spam | editor, or from a message or search; can apply to existing mail | [Fastmail: rules](https://www.fastmail.help/hc/en-us/articles/1500000278122-Organizing-your-inbox-with-rules) |
| Blocked senders | address or whole domain | blocks | list | same page |

Masked Email: the help page fetched but its text did not include the feature description, so it
is not summarized here.

## Proton Mail

| Preset or rule | Matches | Does | Setup | Source |
|---|---|---|---|---|
| Sieve filters | any header, address book lists, size, date | fileinto (label or folder), mark read, and `expire` which **permanently deletes** after N days | script editor | [Proton: Sieve](https://proton.me/support/sieve-advanced-custom-filters) |

The simple filters page (`/support/email-inbox-filters`) could not be fetched. The Sieve page's
own example expires mail from anyone not in your contacts after 10 days.

## Patterns across tools

1. **Per-sender destination, chosen once.** HEY (Imbox, Feed, Paper Trail), Clean Email (Deliver
   to), Outlook (Always move to Other), Superhuman (Always Archive), Shortwave (Always apply),
   Apple (recategorize a sender). Seven of eleven.
2. **A place for receipts and confirmations.** Apple Transactions, HEY Paper Trail, SaneBox DIY
   SaneReceipts, Superhuman and Shortwave labels.
3. **Newsletters out of the inbox, read in a batch.** SaneNews, HEY Feed, Spark Newsletters,
   Clean Email Read Later, Shortwave delivery schedule, Superhuman News label.
4. **Follow up when no reply.** Superhuman, HEY, SaneBox, Gmail nudges. Four tools.
5. **A digest or summary as the safety net.** SaneBox Digest, Clean Email Read Later digest.
6. **Keep only the newest.** Outlook Sweep, Clean Email. Both **delete**.
7. **Age-based cleanup by category.** Apple Cleanup, Outlook Sweep 10 days, Clean Email, Proton
   expire. Apple offers archive as well as delete; the others default to delete.
8. **Protect real people.** Superhuman never auto-archives anyone you have emailed or your own
   domain; Apple keeps time-sensitive mail in Primary; SaneBox trains on what you move back.

## Candidate presets for Cluster

Card names follow the copy rules: short, plain, no dashes. **DELETES** marks anything that
trashes mail.

### A. Easy wins on existing machinery

1. **Shopping leaves after 3 days.** Matches the shopping kind. Moves out of inbox after 3 days.
   Uses the existing time limit and sweep; `DEFAULT_INBOX_HOURS.shopping` is already 3 days.
2. **Travel stays until the trip.** Matches travel. Labels and keeps in inbox (current default
   `null`), with a choice of 14 or 30 days. Same machinery. Tools that keep travel visible:
   Shortwave's built-in Travel bundle.
3. **Finance gets its own label.** Matches finance. Labels, stays in inbox by default, 7 or 30
   days as a choice. Same machinery. Clean Email has a Finance Smart Folder.
4. **Updates leave after a week.** Matches productivity (app and service notices). Moves out
   after 7 days. Same machinery. Like Spark Notifications and Outlook Other.
5. **Receipts place.** A card that groups receipt plus shipping into one label and leaves the
   inbox after a week, like Paper Trail and Apple Transactions. Same sweep; needs a combined
   label or a card that sets two kinds at once. Could replace the separate Receipts and
   Tracking cards rather than add a seventh.
6. **Keep the newest in your inbox.** Matches a chosen sender. Keeps their newest N in the inbox
   and **archives** (moves out) the rest. Reuses `keepNewestExcess` selection with archive
   instead of trash. Safe version of Outlook Sweep and Clean Email Keep Newest.
7. **Keep only the newest (trash the rest).** Same match. **DELETES** older mail. Already exists;
   keep it behind a confirm and off the preset grid.
8. **Never opened leaves the inbox.** Matches senders flagged "never opened". Moves their new
   mail straight to a label (0h). Uses the never-opened flag plus the existing filter. Like
   SaneLater learning from what you ignore.
9. **Mute never opened.** Same match; Mute hides all their mail now and later. Uses Mute. Stronger
   than 8; offer as the second step.
10. **CC only can wait.** Matches mail where you are only in CC. Moves out after 1 day. Needs a
    new kind or a Gmail filter on `cc:me -to:me`; sweep is reused. Like SaneCC.
11. **Only old read mail.** A switch on any card: the time limit applies to read mail only, unread
    stays. Apple Cleanup's Status choice. Needs a read check in the sweep query (`is:read`).
12. **Old promotions to Trash.** Matches promotions older than 30 days. **DELETES.** Uses expiry
    triage. Apple and Outlook both offer it; keep it opt-in with Undo.

### B. New work

13. **Remind me if no reply.** Matches mail you sent with no answer after 3 days. Brings the
    thread back to the top of the inbox. Needs sent-mail scanning, a reply check per thread, and
    re-inserting into inbox (Gmail: add INBOX label, mark unread). Superhuman, HEY, SaneBox,
    Gmail all have it.
14. **Newsletters on Saturday.** Matches newsletters. Holds them out of the inbox and puts them
    back at one chosen time a week. Needs a reverse sweep (label to inbox on a schedule).
    Shortwave delivery schedules; close to HEY Feed and SaneNews.
15. **Daily digest.** One summary of what Cluster moved out today, with Move back and Archive
    all. Needs a digest view or a sent summary email. SaneBox Digest, Clean Email Read Later.
    Makes every "leaves the inbox" card feel safer.
16. **Never move people I write to.** A global exception: anyone you have emailed and your own
    domain are never swept. Needs a sent-mail contact set (Superhuman's exceptions). Lowers the
    risk of every card above.
17. **Bring it back later.** Per message snooze (Snooze a sender exists; HEY Bubble Up, SaneSnooze
    work per email). Needs a per-message timer in the sweep.
18. **Feed for newsletters.** A reading view of the newsletter label, newest first, all opened.
    Needs a new screen. HEY Feed, Spark. Bigger lift; lower priority.
19. **Clear out old feed mail.** Newsletters older than 90 days to Trash. **DELETES.** HEY Feed
    recycles at 90 days by default. Only as an opt-in after the Feed exists.

## Recommendation: add these next

1. **Shopping leaves after 3 days** (A1). One more kind on the same sweep; default already set.
2. **Updates leave after a week** (A4). Service notices are the biggest gap; Spark, Outlook and
   Apple all split them out.
3. **Receipts place** (A5). The most copied idea (Paper Trail, Apple Transactions, SaneReceipts);
   a card that sets receipt and shipping together.
4. **Keep the newest in your inbox** (A6). Sweep's best preset made safe: archive, not trash.
5. **Never opened leaves the inbox** (A8). Uses data Cluster already has; nobody else can offer
   it without asking you to train.
6. **Never move people I write to** (B16). Guardrail that makes more aggressive cards safe.
7. **Remind me if no reply** (B13). Four of the surveyed tools ship it; moves nothing out.
8. **Newsletters on Saturday** (B14). Same sweep in reverse; answers "read in a batch", the most
   common newsletter pattern.

Keep the delete presets (A7, A12, B19) out of the one-tap grid: every tool that deletes by
rule (Clean Email, Proton, SaneBlackHole) warns about it, and Apple pairs its delete preset with
an archive one.

## Sources

- Gmail: [filters](https://support.google.com/mail/answer/6579?hl=en),
  [categories](https://support.google.com/mail/answer/3094499?hl=en),
  [manage subscriptions](https://support.google.com/mail/answer/15621070?hl=en)
- Apple: [iCloud categories](https://support.apple.com/guide/icloud/use-categories-mmafbebd3108/icloud),
  [iCloud Mail Cleanup](https://support.apple.com/guide/icloud/automatically-clean-up-icloud-mail-mma3d15ee93e/icloud),
  [iCloud rules](https://support.apple.com/guide/icloud/set-up-filtering-rules-mm6b1a3f8a/icloud)
- Outlook: [Archive, Sweep](https://support.microsoft.com/en-us/outlook/organize-your-inbox-with-archive-sweep-and-other-tools-in-outlook-on-the-web),
  [Focused Inbox](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978),
  [rules](https://support.microsoft.com/en-us/office/manage-email-messages-by-using-rules-in-outlook-c24f5dea-9465-4df4-ad17-a50704d66c59),
  [Quick steps](https://support.microsoft.com/en-us/office/quick-steps-in-outlook-d8efbdbd-5098-491b-9d2e-8c7b6f45a9b4)
- HEY: [how it works](https://www.hey.com/how-it-works/), [features](https://www.hey.com/features/),
  [Screener](https://help.hey.com/article/722-the-screener), [The Feed](https://help.hey.com/article/761-the-feed),
  [Paper Trail](https://help.hey.com/article/787-paper-trail), [Bubble Up](https://help.hey.com/article/766-bubble-up),
  [Bundle](https://help.hey.com/article/765-bundle-email),
  [Bubble Up if no reply](https://updates.37signals.com/post/new-in-hey-bubble-up-if-no-reply-by)
- SaneBox: [features](https://www.sanebox.com/help/138-what-is-a-feature),
  [SaneBlackHole](https://www.sanebox.com/help/235-saneblackhole-what-do-i-do-with-my-saneblackhole-folder),
  [Digest](https://www.sanebox.com/help/170-daily-digest-why-should-i-use-it-and-how-do-i-read-it),
  [tour](https://www.sanebox.com/tour)
- Clean Email: [Auto Clean rules](https://clean.email/help/auto-clean/create-rules),
  [Auto Clean overview](https://clean.email/help/auto-clean/overview),
  [Smart Folders](https://clean.email/help/basics/smart-folders), [features](https://clean.email/features),
  [Read Later](https://clean.email/help/tools/read-later), [Screener](https://clean.email/help/tools/screener),
  [Unsubscriber](https://clean.email/help/tools/unsubscriber)
- Shortwave: [Customize your Shortwave](https://www.shortwave.com/docs/guides/labels/)
- Superhuman: [Sort Smarter](https://help.superhuman.com/hc/en-us/articles/45266296636947-Sort-Smarter),
  [Auto Archive](https://help.superhuman.com/hc/en-us/articles/40127823829267),
  [Auto Reminders](https://help.superhuman.com/hc/en-us/articles/40144492186515)
- Spark: [Smart Inbox](https://sparkmailapp.com/features/smart_inbox),
  [Gatekeeper](https://sparkmailapp.com/features/gatekeeper),
  [Newsletters & Notifications](https://sparkmailapp.com/features/newsletter-notifications)
- Fastmail: [rules](https://www.fastmail.help/hc/en-us/articles/1500000278122-Organizing-your-inbox-with-rules)
- Proton: [Sieve filters](https://proton.me/support/sieve-advanced-custom-filters)

Not reached or not usable: Gmail nudges help page (404), Apple iPhone categories and macOS Mail
rules pages (navigation only), Proton simple filters page, Fastmail Masked Email text, Spark
follow-up page (404) and help center, Superhuman Auto Summarize docs.
