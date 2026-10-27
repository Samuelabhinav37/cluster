# Dashboard friction: what Apple and others do, and what Cluster does today

Asked 2026-10-27 after the first live test: the dashboard is too busy to test. Home has six
charts, every screen over-explains, Senders doesn't group PayPal, Clear out and Stop mail scroll
forever, there's no sign the scan is still going, Rules and Sorting start from a blank form,
New senders asks for a click per sender, Activity and Settings are wordy.

## 1. What Cluster does today (measured)

Preview build (`npm run preview:ui`, `?big` fake mailbox, 150 of 804 messages read), visible
text and controls per screen:

| Screen | Words | Controls | Page height |
|---|---|---|---|
| Home | 145 | 11 | 1,143 px, 6 equal tiles, each with its own button |
| Senders | 281 | 34 | 2,244 px |
| Clear out | 389 | 73 | 3,514 px |
| Stop mail | **722** | **168** | **4,201 px** |
| Sorting | 329 | 35 | 944 px |
| Rules | 71 | 12 | 873 px, blank form only |
| Safety | 202 | 13 | 1,097 px |
| New senders | 54 | 1 | 726 px |
| Scam report | 107 | 0 | 929 px |
| Activity / Settings | 11 / 32 | 0 / 4 | |

Eleven screens in the sidebar plus a second "Home" for simple mode. These counts grow with the
mailbox: Clear out and Stop mail list every sender.

### Two functional causes, not just design

- **The scan looks stuck.** The first view is built from the first 150 messages
  (`DEFAULT_QUICK_COUNT`, `mailSync.ts:36`). Reading continues in the background toward
  20,000 (`MAIL_INDEX_CAP`), paced by Gmail's per-minute quota, so a large mailbox takes an
  hour or more. The only sign is a grey line at the top ("Counting your senders: 8 of 804"),
  and the screens never refresh by themselves: you must press "Update view"
  (`dashboard.ts` `updateIndexStatus`). So you see the same first batch again and again.
- **PayPal isn't one row.** Senders groups addresses into a company only when a passing DKIM
  signature matches the address's own registrable domain (`senderProfile.ts`
  `companyKeyFor`). A brand that mails from more than one registrable domain, or whose mail
  isn't DKIM-aligned, stays split. Cluster already ships a brand → domains list
  (`brandDomains.json`, used by scam checks) that could merge them when authenticated.
  To confirm on your mailbox: which PayPal addresses show up as separate rows.

## 2. What Apple does with the same problems

**Group by business, and let one choice cover all of it.** Apple Mail sorts mail into Primary,
Transactions, Updates and Promotions. "When you select a Transactions, Updates, or Promotions
message, a digest view of messages from that sender opens." Recategorizing a sender: "Your
choice applies to all current and future messages from the sender."
([Apple iCloud Mail guide](https://support.apple.com/guide/icloud/mmafbebd3108/icloud)).
Digest view shipped in iOS 18.2 ([9to5Mac](https://9to5mac.com/2024/11/22/ios-182-upgrades-apple-mail-with-its-biggest-redesign-ever/),
[Creative Techs](https://www.creativetechs.com/2025/01/14/mail-on-the-iphone-can-categorize-your-messages-in-ios-18-2/)).
For Cluster: the unit of every list is the business, not the address; one decision applies to
all its addresses and future mail.

**One overview, then a short list of recommendations, then detail.** iPhone Storage shows one
usage bar, then "Recommendations" with one action each (e.g. "Review Large Attachments"), then
the app list sorted by size (secondary guides:
[MacRumors](https://www.macrumors.com/how-to/delete-large-attachments-iphone-ipad/),
[Clean Email](https://clean.email/blog/email-providers/how-to-review-large-attachments-on-iphone)).
Apple's own support page wasn't reached. For Cluster's Home and Clear out: one picture, at most
three recommendations each with one button, everything else one tap away.

**Show essentials first, detail on request.** Apple's charting guidance, as summarised by third
parties: keep a chart simple, let people choose when they want detail, keep charts consistent;
show essentials first and avoid putting every option on one screen
([summary of HIG patterns](https://skillselion.com/skills/raintree-technology/apple-hig-skills/hig-patterns)).
developer.apple.com refused the connection three times, so these are secondhand. The classic
Macintosh HIG names this progressive disclosure: common choices shown, complex ones hidden
behind "More Choices".

**Start from presets, not a blank form.** Apple's Shortcuts app opens on a Gallery of
"starter shortcuts... for a range of common tasks grouped in collections"
([Apple Support, via search](https://support.apple.com/en-hk/guide/mac-pro-rack/apd2df1fcc29/mac)).
Notion does the same with page templates. For Rules and Sorting: a gallery of 6 to 8 named
presets, each one tap to preview and turn on; the full editor is "Make your own".

**Rank, count, one button.** Gmail's own Manage subscriptions lists "active subscriptions sorted
by the most frequent senders alongside the number of emails they've sent you in the past few
weeks", with one-click unsubscribe ([Google Workspace Updates](https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html),
[Google blog](https://blog.google/products-and-platforms/products/gmail/new-manage-subscriptions-unsubscribe/)).
That is the bar Stop mail competes with: one sorted list, one action per row.

## 3. Rules these imply for Cluster

1. One screen, one job, one primary button.
2. Lists are of businesses (digest), sorted by volume, top 10 then "Show all".
3. Home: one picture, up to three recommendations. No chart without a decision behind it.
4. One sentence under a title, at most. Buttons are verbs. Detail goes in the drill-down.
5. Progress is always visible and the view updates itself.
6. Presets first for Rules and Sorting; a blank editor second.
7. Decisions in batches: "Allow all 9 you've written to, review 3" instead of one click each.
