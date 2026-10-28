# Sender grouping, people, counts, rules and how others organize

Asked 2026-10-28 after the user's real mailbox showed five problems: hiring platforms grouped as one
company, robots in People, Home saying "Inbox 250" next to "Clean up 507", a confusing rule builder
and Sort now flow, and the same senders shown on five screens.

Builds on `2026-10-28-organizing-competitors.md`, `2026-10-28-first-run-audit.md` and
`2026-08-31-inbox-sorting-and-labels.md`. Facts already in those docs (SaneBox folders, Clean Email
Screener, HEY places, Gmail tabs, Apple categories, unsubscribe flows) are not repeated.

Marks used:
- **[snippet]**: vendor page blocked direct fetch, read through a search excerpt of that page.
- **[secondary]**: only a third party says it.
- **[inferred]**: my reading of a primary fact, not stated by the vendor.

All sources accessed 2026-10-28.

## Summary: the patterns that matter

1. **Nobody groups by domain by default.** SaneBox trains per sender address and uses domain only
   when you make a domain filter. Clean Email's default group is name plus address; "Sender Domain"
   is an opt-in Group By. Outlook's Focused override and Proton's "Always move sender's emails" are
   per address. Domain grouping is a tool you pick, not the default view.
2. **Mail clients already tell you when a platform sent the mail.** Gmail shows "via" when the
   sending domain does not match the From domain. Greenhouse documents that unverified customers
   show "via greenhouse.io". Mailchimp documents mcsv.net showing in the From. A platform's own
   domain in From (target@myworkday.com) means the brand is in the local part or display name, not
   the domain.
3. **There is no public list of ESP or ATS sending domains.** Sublime Security ships open lists for
   freemail, disposable, file hosts and URL shorteners, but none for ESPs or SaaS notifiers. Every
   tool that handles this builds its own short list. Cluster must do the same.
4. **"Person" means person-to-person mail, not "you interacted".** Gmail Primary is "people you
   know", Spark People is "emails from other people", Superhuman Important is "person-to-person",
   Focused Inbox removes "automatically generated or bulk email". The standards give hard machine
   signals: Auto-Submitted (RFC 3834), List-Id (RFC 2919), List-* fields (RFC 2369). Google's own
   "Other contacts" saves anyone you emailed, which is why "you interacted" lets robots in.
5. **Numbers on one screen share one population.** Gmail's inbox types, iPhone storage and Google
   One all show one total split into parts. Clean Email's group count is "the total number of
   messages in the group". No vendor found shows two totals from different populations side by side.
6. **The best rule flows start from a message and preview the matches.** Gmail ("Filter messages
   like these", "Also apply filter to N matching conversations"), Fastmail ("Add rule from
   message", preview on Continue), Zoho (sender and subject "prefilled based on the current email",
   match counts), Outlook (right click, Create rule, "Run this new rule now"), Proton (tick "Always
   move sender's emails" when moving). Few fields, one sentence, one checkbox for old mail.
7. **Recommended practice is few, action-based places and archive by default.** Microsoft: Inbox
   to process, a single Reference folder, rules only for must-read mail, the 4 Ds. David Allen: add
   only "Action" and "Waiting For", keep reference elsewhere. Inbox Zero: delete, delegate, respond,
   defer, do. Exchange's default policy archives items after two years.
8. **Category sets are converging on five or six.** Gmail 5 tabs, Apple 4, Proton 6 (new in Aug
   2026), Yahoo 7 Views, Zoho 2 smart folders, Superhuman 2 splits plus VIP, Team, Calendar, News.

## A. Sender grouping

### What each product groups by

| Product | Default grouping | Domain grouping | Source |
|---|---|---|---|
| SaneBox | Per sender. Unknown domains filed "via the importance of the sender". | Only via a Domain Filter you create. `newletters.company.com` "is not the same as company.com" unless you tick Subdomains. "Force training" overrides individual trainings. | [domain filters](https://www.sanebox.com/help/121-what-is-domain-training-based-filtering-and-how-does-it-work) |
| Clean Email | "Sender": name plus address, so one address under two names is two groups [snippet]. Also "Sender's Email" (address only) [snippet]. | Group By "Sender Domain" pulls "every message from a domain, including its subdomains". | [filter by domain](https://clean.email/help/questions/how-can-i-filter-emails-by-domain), [manage thousands](https://clean.email/help/questions/how-do-i-manage-thousands-of-emails) |
| Gmail Manage subscriptions | "the sender", key not stated. Count is "the number of emails sent recently". Unsubscribe covers "all active mailing lists related to the sender". | Not offered. | [manage subscriptions](https://support.google.com/mail/answer/15621070?hl=en) |
| Apple Mail | Digest view "of messages from that sender" in Transactions, Updates, Promotions. Key not stated. Primary is not grouped. Categorize Sender "applies to all current and future messages from the sender". | Not offered. | [iCloud categories](https://support.apple.com/guide/icloud/use-categories-mmafbebd3108/icloud) |
| Outlook | Focused override is per sender SMTP address (`senderEmailAddress`, `classifyAs` focused or other). Sweep acts on "a particular sender". | Not in Sweep. Rules can match domains. | [Graph override](https://learn.microsoft.com/en-us/graph/api/resources/inferenceclassificationoverride?view=graph-rest-1.0), [Sweep (es)](https://support.microsoft.com/es-es/outlook/organize-your-inbox-with-archive-sweep-and-other-tools-in-outlook-on-the-web) |
| Superhuman | VIP split takes "full email addresses or other domains"; Team split takes domains, defaults to "people with your same domain" [snippet]. | Explicit, per split. | [Default Split Inbox](https://help.superhuman.com/hc/en-us/articles/38458392810643-Default-Split-Inbox) [snippet] |
| HEY | Per sender. "@domain" button on a contact: auto Imbox, auto screen out, or per sender. gmail.com cannot be screened out whole. | Explicit. | [Screener](https://help.hey.com/article/722-the-screener) |
| Zoho Mail | Filter from an email prefills "Sender/ Subject". | Via a filter condition. | [filters](https://www.zoho.com/mail/help/filters.html) |

Takeaway: every product keys on the address, and domain grouping is either opt-in or an explicit
per-domain decision. None claims to detect "the company" automatically.

### How the platforms in the user's mailbox send

- **Workday.** Sends from `myworkday.com` and `otp.workday.com` with Workday's own SPF and DKIM.
  Customers can switch to their own SMTP. [Workday SES](https://doc.workday.com/admin-guide/en-us/manage-workday/tenant-configuration/notifications-and-alerts/email-notifications/concept--amazon-ses-email-delivery.html).
  How the From local part is built (`walmart@myworkday.com`) is not documented on that page; the
  local part matching the tenant name is what the user's mailbox shows [inferred].
- **Greenhouse.** No-reply From addresses `no-reply@greenhouse.io`, `no-reply@us.greenhouse-mail.io`,
  `no-reply@eu.greenhouse-mail.io`, `no-reply@anz.greenhouse.io`. Customers can verify their own
  domain and send from it. [Greenhouse no-reply](https://support.greenhouse.io/hc/en-us/articles/17675865619099).
  Unverified domains go out through `outbound-mail.greenhouse.io` and show "via greenhouse.io"
  [snippet]. [domain verification](https://support.greenhouse.io/hc/en-us/articles/11915120413211-Email-domain-verification-quick-start-guide)
- **Mailchimp.** `mcsv.net`, `mcdlv.net`, `mailchimpapp.net`, `rsgsv.net` appear when the sender
  address is not tied to the customer's domain [snippet]. [Mailchimp help (de)](https://mailchimp.com/de/help/my-campaign-from-name-shows-mcsvnet/)
- **Paylocity.** No primary page found on its sending addresses. Treat as the same pattern as
  Workday (HR platform, own domain in From) until checked against real headers.

So there are two shapes:
1. **Platform domain in From, brand in local part or display name.** `walmart@myworkday.com`,
   `no-reply@us.greenhouse-mail.io` with display name "Acme Recruiting". DKIM `d=` is the platform,
   so it aligns, and Cluster's current test (registrable From domain plus aligned DKIM) calls the
   platform a company. This is the bug.
2. **Brand domain in From, platform in DKIM or Return-Path.** Gmail shows "via".
   Cluster's current alignment test already refuses these as a company key, which is correct.

### Signals a client can read, with what the standard says

| Signal | What it means | Use for grouping | Source |
|---|---|---|---|
| From domain vs DKIM `d=` | `d=` is the SDID "claiming responsibility for an introduction of a message". A mismatch is what Gmail shows as "via". | Mismatch: the brand is From, the platform is `d=`. | [RFC 6376 sec 2.5, 3.5](https://www.rfc-editor.org/rfc/rfc6376), [Gmail "via"](https://support.google.com/mail/answer/1311182?hl=en) |
| Sender header | "the mailbox of the agent responsible for the actual transmission" (RFC 5322 3.6.2). | If present and differs from From, the Sender domain is the platform. | [RFC 5322](https://www.rfc-editor.org/rfc/rfc5322) |
| List-Id | A unique list identifier in a domain namespace. A hosting service "may choose to assign list identifiers in their own domain based namespace, or they may allow their clients ... to provide list identifiers in a namespace for which the owner has authority." | The label part often carries the customer (e.g. `acme.list.platform.com`). Best grouping key for lists when present. | [RFC 2919 sec 2](https://www.rfc-editor.org/rfc/rfc2919) |
| Return-Path | Envelope sender; ESPs use bounce subdomains (Workday documents per-datacenter bounce subdomains). | Platform evidence, not brand. | [Workday SES](https://doc.workday.com/admin-guide/en-us/manage-workday/tenant-configuration/notifications-and-alerts/email-notifications/concept--amazon-ses-email-delivery.html) |
| BIMI | Logo for the sending organization; needs DMARC `p=quarantine` or `p=reject` at `pct=100`, plus a VMC or CMC. Gmail shows a checkmark for VMC. Google's page does not say which domain's logo is chosen. | A BIMI logo on myworkday.com mail would be Workday's, which confirms "platform", not "employer" [inferred]. Cluster cannot read BIMI from the Gmail API directly. | [Google BIMI](https://knowledge.workspace.google.com/admin/security/set-up-bimi?hl=en) |
| Display name | Free text. | The only place many platforms put the employer ("Walmart Careers"). Weak, spoofable, so never a security key. | none |
| Local part | Free text. | `walmart@myworkday.com`: a tenant name. `no-reply@` carries nothing. | none |

### Public lists

- **No public ESP or ATS domain list found.** Sublime Security's open lists cover
  `$free_email_providers`, `$disposable_email_providers`, `$free_file_hosts`,
  `$free_subdomain_hosts`, `$url_shorteners` and domain rankings, but nothing for ESPs or SaaS
  notification senders. [Sublime lists](https://docs.sublime.security/docs/lists)
- A search turned up freemail and disposable lists only (for example
  [arnt/freemail](https://github.com/arnt/freemail)) [secondary]. A deliverability vendor says a
  complete static list is impractical [secondary]. [Suped](https://www.suped.com/knowledge/email-deliverability/technical/where-can-i-find-a-list-of-all-mailbox-providers-and-their-domains)
- Conclusion: keep a short hand-curated list in `src/lib/freeMail.ts` (it already has
  `SHARED_SENDER_PLATFORMS` with substack, beehiiv, buttondown, ghost), and add a data rule so the
  list does not need to be complete (see fix 1).

## B. People vs companies

### How others decide "a person"

| Product | Definition (their words) | Signals stated | Source |
|---|---|---|---|
| Gmail Primary | "Emails from people you know and messages that don't appear in other tabs." Updates: "Automated confirmations, notifications, statements, and reminders". | Not stated for tabs. | [categories](https://support.google.com/mail/answer/3094499?hl=en) |
| Gmail Important | Uses "Whom you email, and how often you email them", "Which emails you open", "Which emails you reply to", "Keywords that are in emails you usually read", "Which emails you star, archive, or delete". | Interaction. This is importance, not personhood. | [importance markers](https://support.google.com/mail/answer/186543?hl=en) |
| Google Contacts | "Other contacts" are saved automatically from people you interacted with, including people you emailed. | Interaction, so it includes robots you replied to. | [Other contacts](https://support.google.com/contacts/answer/7345608) |
| Outlook Focused | Considers "emails and contacts with whom you interact" and filters "noisy sources like automatically generated or bulk email". | Interaction plus automated/bulk detection, both. | [Focused Inbox](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978) |
| Spark | People "displays emails from other people". Notifications "shows messages from services". Newsletters "regular emails from the websites you've subscribed to". | Not stated. Fix per sender address. | [customize](https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox) |
| Superhuman | Important "contains person-to-person and high priority messages", Other "contains automated messages and emails sent to mailing lists" [snippet]. Team split: people with your domain. | Automated and mailing-list mail excluded. | [Split Inbox Basics](https://help.superhuman.com/article/581-split-inbox-basics) [snippet] |
| Apple | Primary: "personal messages, direct communications, and time-sensitive information". Uses "senders and email header information", not the body. | Headers. | [iCloud categories](https://support.apple.com/guide/icloud/use-categories-mmafbebd3108/icloud), [privacy](https://www.apple.com/legal/privacy/data/en/mail-categorization/) |
| Shortwave | Does not define it. Importance is Gmail's, which "uses AI to categorize emails based on your past actions". | Delegates to Gmail. | [blog](https://www.shortwave.com/blog/split-email-inbox-by-importance) |
| HEY | Does not separate people from companies. Every sender is screened the same way. | None. | [Screener](https://help.hey.com/article/722-the-screener) |
| Proton | Primary "For personal and work messages, plus important updates and notifications". Moving a message "automatically updates the filter for next time". | Not stated. | [Proton Categories, 2026-08-20](https://proton.me/blog/proton-mail-categories) |

Takeaway: two tests are combined everywhere that works. "You interact with them" decides
importance. "Not automated and not bulk" decides personhood. Cluster uses only the first.

### Machine signals from the standards

- **Auto-Submitted (RFC 3834 sec 5).** Values `no`, `auto-generated`, `auto-replied`. It "SHOULD NOT
  be supplied for messages that were manually submitted by a human". `auto-generated` is for
  "automatic (often periodic) processes". Any value other than `no` means a machine.
  [RFC 3834](https://www.rfc-editor.org/rfc/rfc3834)
- **List-* fields (RFC 2369) and List-Id (RFC 2919).** RFC 3834 says a responder "MAY ignore any
  subject message with a List-* field". Presence of List-Unsubscribe, List-Id or List-Post means list
  mail. [RFC 2369](https://www.rfc-editor.org/rfc/rfc2369), [RFC 2919](https://www.rfc-editor.org/rfc/rfc2919)
- **Precedence.** Non-standard; RFC 3834 recommends no behavior for it, but its example vacation
  program skips mail whose Precedence is "list", "junk", or "bulk". Use as a weak signal. [RFC 3834 sec 7](https://www.rfc-editor.org/rfc/rfc3834)
- **RFC 3834's vacation example** also skips mail that does not name the recipient in To, CC or Bcc,
  has no Return-Path, or a `<>` Return-Path. Those are cheap "not a person" checks.
- **Bulk sender rules.** Google requires bulk senders (over 5,000 a day) to support one-click
  unsubscribe with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. A one-click header means a
  bulk sender. [Google sender guidelines](https://support.google.com/a/answer/81126?hl=en)
- **Local part.** `no-reply`, `noreply`, `donotreply`, `notifications`, `alerts`, `service`,
  `support`, `billing`, `mailer-daemon`. No standard; a hand list. The user's `service@paypal.com`
  shows why `service` belongs on it.
- **Your own sent mail.** You wrote to them first, or more than once, and they answered with no
  Auto-Submitted and no List-* header. This is the strongest person signal and Cluster already has
  the sent store (`src/lib/correspondents.ts`).

Why Cluster shows robots: `isPerson` in `src/lib/senderListView.ts` is `tier === "close" || tier ===
"known"`, and `tierFor` in `src/lib/senderProfile.ts` sets "known" when `youWrote > 0 || starred > 0
|| replied || known`. Replying to PayPal support or starring a Google security alert makes them
"known", so they are People. `staysOutOfCompany` already adds `kind === "person"`, but the People
list does not.

## C. Consistent counts

What the primary sources show (thinner than other sections; most vendors only show numbers in
screenshots):

- **Gmail inbox types** split one inbox into named sections, each a part of the same inbox. [inbox types](https://blog.google/products-and-platforms/products/gmail/gmail-inbox-types/)
- **iPhone storage** shows "a bar that shows how much storage your content uses, divided by content
  type"; recommendations sit below it, each opening a review list. [Apple storage](https://support.apple.com/en-us/108429)
- **Google One** shows usage per service and, when over quota, "the amount of storage you need to
  clean up". Cleanup is "by service", so each cleanup number is a part of the one total. [Google One](https://support.google.com/googleone/answer/9312312?hl=en)
- **Clean Email** puts "the total number of messages in the group" beside each group. It does not
  describe a cross-group total. [Smart Folders](https://clean.email/help/basics/smart-folders)
- **SaneBox Digest** Daily Snapshot shows "Emails Received" for the period and Time Saved; no
  per-folder sum is promised. [Digest](https://www.sanebox.com/help/170-daily-digest-why-should-i-use-it-and-how-do-i-read-it)
- **Gmail filters** say "Also apply filter to N matching conversations", the count of the exact
  set the action will touch [secondary]. [Ablebits](https://www.ablebits.com/office-addins-blog/filter-email-gmail/)
- **Apple iCloud Mail Cleanup** shows "Unsubscribe from [X] Senders" and per-rule Age and Status;
  no affected-email count. [iCloud Cleanup](https://support.apple.com/guide/icloud/mma3d15ee93e)

The common rule: one population per screen; parts never exceed the whole; the action count equals
what the action will touch.

Why Cluster shows 250 next to 507, from the code:
- Inbox total comes from `mailByKind(securitySenders, ...)` in `renderOverview`
  (`src/dashboard/dashboard.ts` ~1188). The comment says "The security lane is the whole inbox".
- Clean up comes from `clearOutPlan(senders)` (~1379), where `senders` is "only the cleanup tabs",
  a different population that can include archived mail.
- Home's tile adds `f.neverOpened.emails + f.pastDate` (`src/dashboard/homeDashboard.ts` ~339) with
  no de-duplication. A never-opened promo that is also past its date counts twice. The 10-28
  first-run audit already logged the double count (246 of 250 on sample data).

## D. Rules and filters UX

| Product | Start from an example | Preview of matches | Old mail | Few choices | Source |
|---|---|---|---|---|---|
| Gmail | Tick a message, More, "Filter messages like these"; or search, then "Create filter". | The search results are the preview. | "Also apply filter to matching conversations" [secondary for exact label]. | Criteria then actions, two screens. | [create filters](https://support.google.com/mail/answer/6579?hl=en), [CMU IT](https://www.cmu.edu/computing/news/2022/google-filters.html) [secondary] |
| Outlook | Right click a message, Rules (or Advanced Actions), Create rule: moves mail "from a specific sender or a set of senders to a folder". "More options" for the full editor. | None stated. | "Run this new rule now on messages already in the current folder" (classic); run icon in Settings (new). | Quick rule is sender plus folder. "Stop processing more rules" on by default on the web. | [Outlook rules](https://support.microsoft.com/office/8400435c-f14e-4272-9004-1548bb1848f2) |
| Outlook Sweep | From a message: delete all from a sender, keep only the latest, or delete older than 10 days. Sweep rules run once a day. | None. | Yes, acts on existing. | Three choices. | [Sweep (es)](https://support.microsoft.com/es-es/outlook/organize-your-inbox-with-archive-sweep-and-other-tools-in-outlook-on-the-web) |
| Zoho Mail | More Actions, Add To, Filters: sender and subject "prefilled based on the current email". "Show matching filters" with match counts. | Counts of existing filters that match. | "Run through Filter" on a folder. | Match all or any. | [Zoho filters](https://www.zoho.com/mail/help/filters.html) |
| Fastmail | Actions, "Add rule from message...": conditions prefilled with sender and recipient. Or search, then "Create rule". | Settings-created rules preview matches after "Continue". From-message rules do not. | Choose to apply to matching existing mail at creation. | Name and save. | [Fastmail organizing](https://www.fastmail.help/hc/en-us/articles/1500000278122-Organizing-your-inbox) |
| Proton | When moving or labeling, tick "Always move sender's emails" or "Always label sender's emails". | Full editor ends on a Preview "to see an overview of the filter". | Not stated. | The tick box is one choice. Free plan: one active filter; paid 250. | [Proton filters](https://proton.me/support/email-inbox-filters) |
| Apple Mail (Mac) | Not from a message. Any or all conditions, then actions. | None. | Message > Apply Rules. | Classic two-part form. | [Mac rule settings](https://support.apple.com/guide/mail/cpmlprefrulesadd/mac) |
| Superhuman | Auto Labels: "write a prompt", e.g. "job applications". Library of built-ins. | Not stated on the changelog. | Not stated. | One text box. | [Auto Labels](https://new.superhuman.com/auto-labels-custom-auto-labels-313354) |
| SaneBox | Drag a message into a folder, or Train from the Digest. Domain filter page for whole domains. | The Digest shows results after. | Moves current and future. | No form at all. | [domain filters](https://www.sanebox.com/help/121-what-is-domain-training-based-filtering-and-how-does-it-work) |
| Clean Email Auto Clean | Select a group, "Create Rule": "scope automatically suggested based on the messages you have selected". | No match count or preview described. | Toggle, off by default; on cleans matches at once. | Two steps: "For messages", "Apply Action". Sender field options: Any, Recipients, Sender (name and address), Email Address, Email Domain. | [overview](https://clean.email/help/auto-clean/overview), [create rules](https://clean.email/help/auto-clean/create-rules) |
| Zoho Smart Filters | Built-in, on by default for new accounts: ZMNewsletter and ZMNotification from "certain header information". Cannot be deleted, only disabled. | Read-only preview of the filter definition [snippet]. | Not stated. | On/off. | [Smart Filters](https://www.zoho.com/mail/help/smart-filters.html) |

Patterns for Cluster:
1. Start from a sender or a message, with the condition already filled.
2. The first screen is one sentence: "Mail from Walmart Careers goes to Jobs." One action picker.
3. Show the match count and a short list of matches before saving (Gmail search results, Fastmail
   preview). Clean Email's lack of a preview is called out by its own warning text.
4. One checkbox for old mail, with the count in its label.
5. The full editor is behind "More options" (Outlook) and most users never need it.
6. The fastest form is a tick box in the move action (Proton) or a drag (SaneBox).

## E. How organizations recommend organizing email

- **Microsoft, "Best practices for Outlook".** An Inbox "for messages that you need to process", "A
  single reference folder, under the Inbox, for all reference material", "Nothing is automatically
  filed (that is, with a rule) into this folder." Rules "filter the messages coming into your Inbox
  for must-read items only." Mail "sent directly to you or with you on the Cc line is sent to the
  Inbox and isn't processed by other rules". The 4 Ds: "Delete it", "Do it (respond or file for
  reference)", "Delegate it (forward)", "Defer it (using categories and flags)". "Categories aren't
  a required aspect of this system." A folder over 10,000 items may slow Outlook.
  [Microsoft best practices](https://support.microsoft.com/en-us/outlook/best-practices-for-outlook)
- **Microsoft, categories.** One item can carry several categories; default names are "Red
  Category" and so on; not available on IMAP accounts. [categories](https://support.microsoft.com/en-us/office/use-categories-in-outlook-a0f709a4-9bd8-45d7-a2b3-b6f8c299e079)
- **Microsoft, shared mailboxes.** For a group to "monitor and send email from a public email
  alias" (info@, support@), also used as a "noreply" account. Focused Inbox "doesn't work with
  shared mailboxes". [shared mailbox](https://support.microsoft.com/en-us/office/open-and-use-a-shared-mailbox-in-outlook-d94a8e9e-21f1-4240-808b-de9c9c088afd),
  [Focused Inbox](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978)
- **Microsoft, retention.** The default Exchange policy, "automatically assigned to every mailbox",
  "Moves items that are two years or older from a user's primary mailbox to their archive mailbox."
  Auto-archiving also triggers at 96% of quota. [archive mailboxes](https://learn.microsoft.com/en-us/purview/archive-mailboxes)
- **Google.** Labels "are different from folders" and can nest. Deleting removes the email "from
  every label", so one email carries many labels. [labels](https://support.google.com/mail/answer/118708?hl=en).
  Inbox types: Default tabs ("set it and forget it"), Priority Inbox, Important/Unread/Starred
  first, and Multiple Inboxes with "up to five labeled inboxes" for hands-on users.
  [inbox types](https://blog.google/products-and-platforms/products/gmail/gmail-inbox-types/)
- **Zoho.** Smart Filters ZMNewsletter and ZMNotification on by default, each making "one folder
  and one tag". [Smart Filters](https://www.zoho.com/mail/help/smart-filters.html). Streams is team
  posting inside the mailbox, not a sorting tool. [Streams](https://www.zoho.com/mail/help/streams.html)
- **David Allen (GTD).** Make reference folders, then "create two more folders in your navigator
  bar – "Action" and "Waiting For"", visually distinct and at the top. "'Empty' does not mean
  finishing all the work embedded in your emails." [Getting Email Under Control (DAC handout, SlideShare mirror)](https://www.slideshare.net/slideshow/getting-email-undercontrol-16073364/16073364)
- **Merlin Mann (Inbox Zero).** Five actions: delete, delegate, respond, defer, do. Series started
  2006-03-14 on 43folders.com; the Google Tech Talk was 2007. The original site is now parked, so
  this is [secondary]. [MIT Sloan Review](https://sloanreview.mit.edu/article/inbox-zero-is-it-worth-the-effort),
  [TechTarget](https://www.techtarget.com/whatis/definition/inbox-zero)

What this means for a personal or pro inbox:
- **Few folders.** Microsoft names three (Inbox, Reference, Contact Groups). Allen adds two
  (Action, Waiting For). Google caps Multiple Inboxes at five.
- **Action-based beats topic-based for the inbox.** The places that matter say what to do (Action,
  Waiting For, Read later). Topic folders are for reference and should not get rule-filed mail
  (Microsoft says this directly).
- **Archive by default.** Reference is one folder; Exchange archives at two years; Gmail labels
  plus archive replace folders.
- **Mail to you directly never gets moved by rules.** Microsoft's To/Cc rule is the same idea as
  Superhuman never auto-archiving people you emailed (10-27 doc).

## F. Top-level structure in other clients

| Client | Top-level names | How mail lands | Source |
|---|---|---|---|
| Outlook | Focused, Other tabs; folders; categories; Archive; Sweep | Focused/Other by interaction and bulk detection; per-sender "Always move to" override | [Focused](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978) |
| Zoho Mail | Inbox, ZMNewsletter, ZMNotification (folder plus tag each), user folders and tags, Streams | Smart Filters by headers; user filters in order, "Stop processing other Filters" | [Smart Filters](https://www.zoho.com/mail/help/smart-filters.html), [filters](https://www.zoho.com/mail/help/filters.html) |
| Proton | Categories Primary, Social, Promotions, Newsletters, Transactions, Updates (Transactions and Updates hidden by default [secondary]); folders and labels | Automatic, on for new users; moving a message updates the filter | [Proton blog](https://proton.me/blog/proton-mail-categories), [Neowin](https://neowin.net/news/proton-mail-is-finally-now-able-to-sort-your-emails-into-different-categories/) [secondary] |
| Fastmail | System folders (Inbox, Archive, Spam and others) that "cannot be deleted, nested, or renamed"; labels or folders mode; Archive in folders mode [snippet] | Rules | [folders](https://www.fastmail.help/hc/en-us/articles/1500000280301), [labels and IMAP](https://www.fastmail.help/hc/en-us/articles/1500000278282) [snippet] |
| Superhuman | Important, Other; default splits VIP, Team, Calendar, News [snippet] | Auto Labels Marketing, Pitch, News, Social to Other; VIP by address or domain; Team by your domain | [split controls](https://new.superhuman.com/split-inbox-controls-321318), [Default Split Inbox](https://help.superhuman.com/hc/en-us/articles/38458392810643-Default-Split-Inbox) [snippet] |
| Shortwave | Splits (default "Other" catch-all; "Important & Other" popular); bundles (Newsletters, Promotions, Travel, custom labels) | Labels from Gmail filters, auto-apply rules or AI filters; bundles group threads for one bulk action | [Shortwave guide](https://www.shortwave.com/docs/guides/labels/) |
| Spark | Smart Inbox cards People, Notifications, Newsletters, Pins, Seen | Automatic; per-sender change by clicking the address | [Spark customize](https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox) |
| Yahoo | Views: Contacts, Photos, Documents, Subscriptions, Shopping, Receipts, Travel | Automatic views under the inbox, not folders | [Yahoo Views](https://help.yahoo.com/kb/new-mail-for-desktop/navigate-emails-views-yahoo-desktop-sln36325.html) |
| OnMail (Edison) | Shut down 2025-07-31 [secondary] | none | [Spam Resource](https://www.spamresource.com/2025/06/onmail-email-service-to-shut-down.html) |
| Edison Mail | Still running per a status tracker [secondary]; not researched further | none | none |

## How Cluster should fix it

Ranked by value for effort inside each problem. Effort S is under a day, M a few days, L a week or more.

### 1. Platform senders grouped as one company

1. **Add a "platform" list and refuse it as a company key.** Extend `SHARED_SENDER_PLATFORMS` in
   `src/lib/freeMail.ts` with hiring and HR platforms: `myworkday.com`, `workday.com`,
   `greenhouse-mail.io`, `greenhouse.io`, `paylocity.com`, plus the usual ATS set (Lever, iCIMS,
   SmartRecruiters, Ashby, Taleo/Oracle, SuccessFactors, Jobvite) once their From domains are
   confirmed from real headers. `companyKeyFor` already returns null for these. From: none of the
   vendors publish such a list (Sublime does not either), so a curated list is normal. Effort: S.
2. **Data rule so the list need not be complete.** Treat a registrable domain as a platform when it
   has many distinct local parts with different display names (the user's myworkday.com has 103
   addresses). Example threshold: 10 or more local parts and display names that share no common
   word. Then key each address separately. From: SaneBox and every product in section A key on the
   address by default. Effort: S to M. Needs a test with the user's shape.
3. **Name platform senders by display name or tenant.** For a platform address, show
   "Walmart (via Workday)": the display name, else the local part title-cased, plus "via" and the
   platform. Group addresses under one row only when display name and local part both match. From:
   Gmail's "via" label and Greenhouse's "via greenhouse.io". Effort: S.
4. **Use List-Id before domain when present.** If mail carries List-Id, key the group by it. RFC
   2919 lets hosts give each customer a list identifier. From: RFC 2919; Clean Email groups
   Unsubscriber by unsubscribe link, not sender (10-28 doc). Effort: S if List-Id is already in
   `NormalizedMessageMetadata`, else M.
5. **Keep domain grouping, but as a choice.** "Group by company" stays as a toggle on Senders, off
   for platform domains. From: Clean Email "Sender Domain" Group By, SaneBox Domain Filters. Effort: S.

Not worth it: BIMI. The Gmail API does not expose it and it would only confirm the platform.

### 2. Robots in People

1. **Split "person" from "important".** People requires both: the sender is not a machine, and you
   interacted with them. Machine means any of: `Auto-Submitted` not `no`; any List-* header;
   one-click unsubscribe header; Precedence bulk, list or junk; a role local part (no-reply,
   noreply, donotreply, notifications, alerts, service, support, billing, info, hello, team,
   mailer-daemon); a known platform domain. Change `isPerson` in `src/lib/senderListView.ts` to
   require `!profile.machine && profile.kind === "person"` as well as the tier. From: Outlook
   Focused (interaction plus "automatically generated or bulk"), Superhuman Important vs Other,
   RFC 3834 and RFC 2369. Effort: S, if `machine` already reads these headers; check
   `senderProfile.ts`.
2. **Starring and replying no longer make a sender "known" for People.** Keep them for importance
   and for Screener bypass. Only mail you wrote first, or more than one reply from them without
   machine headers, counts toward a person. From: Gmail separates Important (interaction) from
   Primary (people); Google "Other contacts" shows what happens when interaction alone is used.
   Effort: S.
3. **A "Companies you talk to" group.** service@paypal.com, a support desk you replied to, a
   recruiter's no-reply. Shown under the company, with a small "you replied" note. From: Spark
   Notifications ("messages from services"). Effort: S.
4. **One tap to fix.** On any People row, "Not a person" moves the sender and remembers it; on a
   company row, "This is a person". From: Spark (click the address, pick a category), Outlook
   "Always move to". Add it to the "What Cluster learned" list from the 10-28 doc. Effort: S.

### 3. Home 250 vs 507

1. **One population on Home.** Compute every Home number from the inbox lane (`securitySenders`),
   or show a clear "Inbox" and "All mail" switch, never both mixed. Clean up's tile then reads
   "120 of your 250 inbox emails can go". From: iPhone storage and Google One (one total, parts
   inside it), Gmail inbox types. Effort: S.
2. **De-duplicate by message id.** `clearOutPlan` and the Home tile should build one Set of message
   ids across never-opened, past-its-date and spam, then count the set. Keep the per-part counts
   for the breakdown, but label them as overlapping or assign each message to one part in a fixed
   order (past its date, then never opened). From: Gmail "N matching conversations" counts the
   exact set the action touches. Effort: S. The 10-28 audit already found this.
3. **Say "of N" whenever a part sits next to a total.** "Clean up: 120 of 250". Sidebar badge and
   Clean up page header use the same function. From: Google One cleanup by service. Effort: S.
4. **Test it.** A unit test that a message in two buckets counts once and that Clean up never
   exceeds Inbox on Home. Effort: S.

### 4. Rules, filters and Sort now

1. **"Always do this" from any action.** When the user archives, mutes, labels or moves mail from a
   sender in Details or Clean up, show a tick box "Always do this for mail from Walmart Careers".
   That is the rule. No form. From: Proton "Always move sender's emails", Outlook quick rule,
   SaneBox drag. Effort: S to M.
2. **Rule sheet starts from a sender or message, not a blank form.** Prefill sender (address, or
   platform-aware name from fix 1), show one sentence "Mail from X goes to Y", one action picker,
   and "More options" hiding the 14 fields. From: Zoho prefill, Fastmail "Add rule from message",
   Outlook "More options". Effort: M.
3. **Preview with a count before save.** Under the sentence: "Matches 42 emails. Newest: ...", five
   rows, and "Also do this to the 42 you have now" ticked off by default. From: Gmail search
   results plus "Also apply filter to N matching conversations", Fastmail preview, Clean Email's
   old-mail toggle off by default. Effort: S; the dry run exists.
4. **Drop the AI draft step from the main path.** The sentence box and "Draft rule locally" then
   "Save reviewed draft" are two steps with jargon (10-28 audit) and the draft can hang. Keep AI as
   an optional "Describe it" box like Superhuman's prompt, with the deterministic draft as the
   fallback and a timeout. Effort: S.
5. **Sort now: pick places, not labels.** Offer the 4 to 6 action places (Read later, Receipts,
   Jobs, Muted, plus the user's own) with counts for each, preview, then one Sort button. Hide the
   18 kind labels behind them. From: Microsoft (Inbox, one Reference), Allen (Action, Waiting For),
   Google's five-section cap, Proton and Gmail's 5 to 6 categories. Effort: M; needs the label
   migration noted in the 10-28 competitors doc.
6. **Never move mail sent straight to you by a person.** A fixed guardrail shown in the rule sheet:
   "Mail people send to you stays in the inbox." From: Microsoft's To/Cc rule, Superhuman Auto
   Archive. Effort: S.

### 5. Redundancy between Home, Clean up, Stop mail, Senders and Details

1. **One job per place, written down.** Home: one total and up to three next steps. Clean up:
   delete old mail (Trash on every row, as the 10-28 audit asked). Stop mail: unsubscribe and mute.
   Senders: decide where a sender goes. Details: the list of emails for whatever is selected. Each
   other place links to it instead of repeating its rows. From: Microsoft's one-purpose folders;
   Apple's one sender digest; the user's own "one job per screen" feedback. Effort: M (copy and
   layout, little logic).
2. **One sender row component, one sender key.** Details and Clean up list one row per address
   while Senders groups by company (10-28 audit). After fix 1, use the same key and the same row
   everywhere, with the same counts. From: Clean Email groups the same way in every Smart Folder.
   Effort: M.
3. **Send each sender to one home.** A sender with an unsubscribe header appears in Stop mail; in
   Clean up it shows only its old-mail count with a link. A never-opened bulk sender appears in
   Clean up, not in Senders' suggestions too. From: SaneBox Digest (each mail appears once, under
   one folder). Effort: S.
4. **Details is the only list of emails.** Home, Clean up and Senders open Details filtered, and do
   not draw their own email lists. Already mostly true; finish it. From: Apple's digest view opens
   from any message. Effort: S.

Skip for now: auto-detecting "company" from BIMI or logos, a Zoho-style Streams, a Yahoo-style
Photos or Documents view, HEY's Speakeasy code.

## Corrections to earlier Cluster research

1. **2026-10-16-unsubscribe-and-grouping.md** defines Company as "registrable domain, plus the DKIM
   signing domain when they match, with free-mail domains excluded". That rule is what groups
   myworkday.com. It needs the platform exclusion from fix 1.
2. **No vendor auto-detects companies by domain** as the default. Earlier docs treated domain
   grouping as the competitor norm; it is an opt-in in Clean Email and SaneBox.
3. **Proton now has Categories** (Primary, Social, Promotions, Newsletters, Transactions, Updates),
   announced 2026-08-20. Not in any earlier doc.
4. **OnMail is gone** (2025-07-31) [secondary].

## Sources

All accessed 2026-10-28.

- Standards: [RFC 3834](https://www.rfc-editor.org/rfc/rfc3834),
  [RFC 2919](https://www.rfc-editor.org/rfc/rfc2919), [RFC 2369](https://www.rfc-editor.org/rfc/rfc2369),
  [RFC 6376](https://www.rfc-editor.org/rfc/rfc6376), [RFC 5322](https://www.rfc-editor.org/rfc/rfc5322)
  (RFC 5322 sec 3.6.2 quoted from the standard; the fetch failed this session).
- Google: ["via" in Gmail](https://support.google.com/mail/answer/1311182?hl=en),
  [sender guidelines](https://support.google.com/a/answer/81126?hl=en),
  [BIMI](https://knowledge.workspace.google.com/admin/security/set-up-bimi?hl=en),
  [manage subscriptions](https://support.google.com/mail/answer/15621070?hl=en),
  [categories](https://support.google.com/mail/answer/3094499?hl=en),
  [importance markers](https://support.google.com/mail/answer/186543?hl=en),
  [Other contacts](https://support.google.com/contacts/answer/7345608),
  [create filters](https://support.google.com/mail/answer/6579?hl=en),
  [labels](https://support.google.com/mail/answer/118708?hl=en),
  [inbox types blog](https://blog.google/products-and-platforms/products/gmail/gmail-inbox-types/),
  [Google One storage](https://support.google.com/googleone/answer/9312312?hl=en)
- Microsoft: [Focused Inbox](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978),
  [rules](https://support.microsoft.com/office/8400435c-f14e-4272-9004-1548bb1848f2),
  [Sweep and Archive (es)](https://support.microsoft.com/es-es/outlook/organize-your-inbox-with-archive-sweep-and-other-tools-in-outlook-on-the-web),
  [categories](https://support.microsoft.com/en-us/office/use-categories-in-outlook-a0f709a4-9bd8-45d7-a2b3-b6f8c299e079),
  [best practices](https://support.microsoft.com/en-us/outlook/best-practices-for-outlook),
  [shared mailbox](https://support.microsoft.com/en-us/office/open-and-use-a-shared-mailbox-in-outlook-d94a8e9e-21f1-4240-808b-de9c9c088afd),
  [archive mailboxes](https://learn.microsoft.com/en-us/purview/archive-mailboxes),
  [Graph inferenceClassificationOverride](https://learn.microsoft.com/en-us/graph/api/resources/inferenceclassificationoverride?view=graph-rest-1.0)
- Apple: [iCloud categories](https://support.apple.com/guide/icloud/use-categories-mmafbebd3108/icloud),
  [categorization privacy](https://www.apple.com/legal/privacy/data/en/mail-categorization/),
  [iCloud Mail Cleanup](https://support.apple.com/guide/icloud/mma3d15ee93e),
  [Mac rule settings](https://support.apple.com/guide/mail/cpmlprefrulesadd/mac) [snippet],
  [iPhone storage](https://support.apple.com/en-us/108429)
- Platforms: [Workday SES delivery](https://doc.workday.com/admin-guide/en-us/manage-workday/tenant-configuration/notifications-and-alerts/email-notifications/concept--amazon-ses-email-delivery.html),
  [Greenhouse no-reply addresses](https://support.greenhouse.io/hc/en-us/articles/17675865619099),
  [Greenhouse domain verification](https://support.greenhouse.io/hc/en-us/articles/11915120413211-Email-domain-verification-quick-start-guide) [snippet],
  [Mailchimp mcsv.net (de)](https://mailchimp.com/de/help/my-campaign-from-name-shows-mcsvnet/) [snippet],
  [Sublime Security lists](https://docs.sublime.security/docs/lists)
- SaneBox: [domain filters](https://www.sanebox.com/help/121-what-is-domain-training-based-filtering-and-how-does-it-work),
  [Digest](https://www.sanebox.com/help/170-daily-digest-why-should-i-use-it-and-how-do-i-read-it)
- Clean Email: [Smart Folders](https://clean.email/help/basics/smart-folders),
  [filter by domain](https://clean.email/help/questions/how-can-i-filter-emails-by-domain),
  [manage thousands](https://clean.email/help/questions/how-do-i-manage-thousands-of-emails),
  [Auto Clean overview](https://clean.email/help/auto-clean/overview),
  [create rules](https://clean.email/help/auto-clean/create-rules)
- Zoho: [filters](https://www.zoho.com/mail/help/filters.html),
  [Smart Filters](https://www.zoho.com/mail/help/smart-filters.html),
  [Streams](https://www.zoho.com/mail/help/streams.html)
- Fastmail: [organizing your inbox](https://www.fastmail.help/hc/en-us/articles/1500000278122-Organizing-your-inbox),
  [folders](https://www.fastmail.help/hc/en-us/articles/1500000280301) [snippet],
  [labels and IMAP](https://www.fastmail.help/hc/en-us/articles/1500000278282) [snippet]
- Proton: [filters](https://proton.me/support/email-inbox-filters),
  [Categories blog](https://proton.me/blog/proton-mail-categories)
- Superhuman [snippet unless noted]: [Split Inbox Basics](https://help.superhuman.com/article/581-split-inbox-basics),
  [Default Split Inbox](https://help.superhuman.com/hc/en-us/articles/38458392810643-Default-Split-Inbox);
  fetched directly: [split controls](https://new.superhuman.com/split-inbox-controls-321318),
  [Auto Labels](https://new.superhuman.com/auto-labels-custom-auto-labels-313354)
- Shortwave: [guide](https://www.shortwave.com/docs/guides/labels/),
  [importance blog](https://www.shortwave.com/blog/split-email-inbox-by-importance)
- Spark: [customize inbox](https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox)
- HEY: [Screener](https://help.hey.com/article/722-the-screener)
- Yahoo: [Views](https://help.yahoo.com/kb/new-mail-for-desktop/navigate-emails-views-yahoo-desktop-sln36325.html)
- Methods: [David Allen, Getting Email Under Control](https://www.slideshare.net/slideshow/getting-email-undercontrol-16073364/16073364)
  (DAC handout on a mirror);
  [secondary]: [MIT Sloan Review on Inbox Zero](https://sloanreview.mit.edu/article/inbox-zero-is-it-worth-the-effort),
  [TechTarget](https://www.techtarget.com/whatis/definition/inbox-zero)
- Other [secondary]: [Ablebits Gmail filters](https://www.ablebits.com/office-addins-blog/filter-email-gmail/),
  [CMU IT filters](https://www.cmu.edu/computing/news/2022/google-filters.html),
  [Neowin Proton](https://neowin.net/news/proton-mail-is-finally-now-able-to-sort-your-emails-into-different-categories/),
  [Spam Resource OnMail](https://www.spamresource.com/2025/06/onmail-email-service-to-shut-down.html),
  [Suped](https://www.suped.com/knowledge/email-deliverability/technical/where-can-i-find-a-list-of-all-mailbox-providers-and-their-domains),
  [arnt/freemail](https://github.com/arnt/freemail)

Not reached: 43folders.com (parked), Superhuman help (403), Paylocity sending docs (none found),
Gmail Multiple Inboxes help page (404; the Google blog was used), Apple Mail Mac rules page
(navigation only), RFC 5322 text (download failed).
