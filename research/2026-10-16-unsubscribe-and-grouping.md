# Unsubscribe, grouping, and filing new mail within 10 minutes

Date: 2026-10-16. Companion to `2026-10-16-suggestions-sorting-filtering.md`. Both build on the sender profile planned there.

## 1. How unsubscribe works

### The three ways a sender lets you leave

Every bulk email can carry a `List-Unsubscribe` header (RFC 2369) with one or more of the following.

| Method | What happens | How reliable | What Cluster does today |
|---|---|---|---|
| **One-click POST** (RFC 8058) | The header also carries `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The client sends one HTTPS POST with the body `List-Unsubscribe=One-Click`. No page and no login are involved | The best of the three. Gmail and Yahoo have required it from bulk senders (over 5,000 a day) since 2024, and the request must be honoured within 2 days | Fires it, but only when a provider-checked DKIM signature covers both headers and aligns with From (`unsubscribe.ts`). It also asks for the one origin's permission at click time. This is stricter than most competitors, and correct |
| **Web link** (GET) | Opens the sender's page, which often asks you to confirm or log in, or shows "manage preferences" | Medium. Some pages need a click or try to keep you on the list | Opens the link in a tab, and the user finishes there |
| **mailto** | Send an email to an address, sometimes with a set subject such as `unsubscribe` | Medium. It works, but slowly | Opens a compose link, and the user has to press send |

Rules that apply across providers:

- **Gmail and Yahoo (2024):** bulk senders need one-click unsubscribe plus a visible link in the body, and requests must be honoured within 2 days.
- **Microsoft (from 5 May 2025):** high-volume senders to Outlook.com, Hotmail and Live need SPF, DKIM and DMARC, plus a "functional unsubscribe link". Sources disagree on whether one-click is required.
- **Transactional mail** (receipts, codes, shipping) is exempt and often has no unsubscribe at all. "No unsubscribe" is normal for these senders and is not a warning sign.

### Gmail itself (July 2025, "Manage subscriptions")

The view sits in the left menu. It lists senders by how often they send, with a count for the last few weeks, and offers one Unsubscribe button each. Gmail sends the request itself when the sender supports it, or sends you to the sender's site. Google warns it "can take a few days". It does not verify the result, and it does not block senders that ignore the request.

### Competitors

| Tool | First try | When it fails |
|---|---|---|
| Leave Me Alone | Sends the List-Unsubscribe request for you | Blocks on the mailbox side |
| Clean Email | Tries a real unsubscribe | Automatically routes the sender's future mail to Trash |
| SaneBox (SaneBlackHole) | Hides the sender first. A real unsubscribe is an optional setting | Mail in the folder goes to Trash after 7 days |
| Gmail | Sends the request or opens the site | Nothing |

Old studies (Return Path 2008, Responsys 2009) found 11 to 30% of big retailers kept mailing after an unsubscribe. Today most late mail comes from the 1 to 2 day processing gap, or from the user being on a second list from the same company.

### What Cluster should change

1. **Send mailto requests ourselves.** `users.messages.send` accepts the `gmail.modify` scope Cluster already holds, so no new scope is needed. We send the exact address and subject from the header, with an empty body, and show it under Sent. Making this automatic is an owner call, since it sends mail on the user's behalf. I suggest one confirm the first time, then automatic.
2. **Always pair unsubscribe with "and file what still comes".** At the moment of unsubscribing, we also add a Keep-sorted filter for that sender (labelled, out of the inbox) for a 3-day grace period. That covers the processing gap, so the user sees the result straight away.
3. **Verify, then fall back.** `unsubscribeOutcome.ts` already watches 14 days and reports "still sending". With the index this becomes exact rather than scan-limited: the change feed tells us every new message from that address. Gmail's rule allows 2 days, so we use 3 days of grace. After that, any new message marks the request "ignored" and offers one button: "Send their mail to Trash". That is the Clean Email fallback, as a Gmail filter.
4. **Cover the whole company, not one address.** Unsubscribing from `news@email.brand.com` does nothing about `offers@brand.com`. After an unsubscribe, show the other bulk addresses from the same company (grouping, below) with "Unsubscribe from these too?".
5. **Tell the user which kind it was.** "Done. They've confirmed." for one-click. "Request sent by email. Senders have 2 days." for mailto. "Finish on their page." for a web link.
6. **Remember where to offer it.** Unsubscribe is offered only to senders that are still sending (see `stillSending` in the profile). A sender that stopped gets "Clear out old mail" instead.

## 2. Combining and grouping the same mail

"Same mail" comes in three sizes. Cluster should know all three, because each answers a different question.

| Level | Key | Example | Used for |
|---|---|---|---|
| **Template** | sender plus masked subject (digits, dates, amounts and names replaced) | Every "Your order #1234 has shipped" from Amazon | Collapsing repeats into one line with a count. Deleting all but the newest. A one-time "always do this" correction |
| **Sender** | lowercase address, plus-tags stripped | `shipment-tracking@amazon.com` | Today's unit. Unsubscribe and mute live here |
| **Company** | registrable domain, plus the DKIM signing domain when they match, with free-mail domains excluded | `amazon.com`, `email.amazon.com`, `marketplace.amazon.co.uk` → "Amazon" | One line per company on the Senders screen. "Unsubscribe from all their lists" |

What others do:

- **Shortwave:** bundles by label, by mailing list and by sender. Automated senders bundle automatically. One line in the inbox can be marked done, snoozed or deleted as a whole. A bundle can also have a delivery schedule.
- **Google Inbox (retired):** did the same by category.
- **HEY:** Feed and Paper Trail.
- **Gmail:** only threads by conversation. It never groups across messages.

Gaps in Cluster today:

- **Company grouping uses the full host.** `domainGrouping.ts` splits `email.brand.com` from `brand.com`. Cluster already has `registrableDomain.ts` and the public suffix list, so grouping should use them.
- **No template level at all.** `keepNewest.ts` keeps the newest per sender, not per template.
- **No exact-duplicate check.** The same Message-ID can sit in the index twice when one email was delivered to two of your addresses. We now store Message-ID, so these can be collapsed to one row, and "delete the copy" is safe.

The plan:

- `senderProfile.ts` gets `companyKey` (registrable domain, or null for free mail) and `templateKey(subject)`.
- The Senders screen gains "Group by company", with one row per company and its addresses inside, using the filters and sorts from the companion note.
- Inside a sender, repeated templates show as one line with a count, for example "Your order has shipped ×46". Actions there are "Keep newest" and "Delete all".
- Duplicates by Message-ID are hidden from counts, and a "Delete 12 duplicate copies" suggestion is offered.

## 3. New mail joins its group within 10 minutes

My reading of the request: once a sender or company is grouped (Keep sorted, a Sort my inbox category, or an unsubscribed sender still mailing), new mail from them should end up in that group, at the latest 10 minutes after it arrives.

There are two ways to do this. They work best together.

| | Gmail filter (server side) | Background sweep (Cluster) |
|---|---|---|
| When it acts | The moment mail arrives, even with the computer off | Every N minutes, only while Chrome is open |
| What it can match | From, to, subject, words, size, list headers, with no history | Anything Cluster knows: the sender profile, company, template, "still sending after unsubscribe" |
| Cost | Free after creation. A limit of 1,000 filters, and each filter's criteria fits about 40 addresses (roughly 1,470 characters) | The change feed costs about 2 units per check, plus 20 per message moved |
| Notifications | Mail filed out of the inbox never notifies | The user gets the notification, then it files away |

Cluster already uses this pairing for inbox time limits. A filter labels mail on arrival, and the 15-minute sweep moves it out once its limit passes (`categoryFilters.ts`, `inboxTimeLimits.ts`). So "within 10 minutes" means three changes, not a new system:

1. **Allow a limit in minutes.** `inboxHoursByBucket` becomes minutes, with "10 minutes" as an option next to "Straight away", the hour options and "Stays". This needs a settings migration.
2. **Run the sweep every 5 minutes, driven by the change feed.** With the index, a check is one `history.list` (2 units) when nothing changed, so a short period is cheap. The sweep then looks only at messages added since the last check, not at a label search. Five-minute ticks give "at most 10 minutes" even with alarm delay. `chrome.alarms` works in minutes, and its timing isn't exact.
3. **Group filters, not one filter per sender.** A company group becomes one filter, `from:(brand.com)`, which also matches subdomains. Groups of single addresses are packed about 40 to a filter. That keeps Cluster far under the 1,000-filter limit. Sorting decisions the profile makes, such as kind by majority vote, can't live in a filter, so the sweep handles those within 10 minutes.

**Outlook:**

- Inbox rules run on arrival on the server, like Gmail filters. Mailbox rules share 256 KB, so rules have to be packed in the same way.
- Outlook has no change feed in Cluster yet. A Graph delta query on the Inbox is the equivalent, and it is the outstanding item from the mail index work.

**Safety carries over:**

- Starred mail stays put.
- People you write to stay put.
- Anything the phishing checks flag stays in the inbox.
- Mail Cluster filed shows in Recent with Undo.
- Moving never deletes.

## Build order (merged with the companion note)

1. `senderProfile.ts` with companyKey, templateKey and duplicate detection, in shadow mode.
2. Suggestions v2, including stillSending-aware unsubscribe and Clear out old mail.
3. Unsubscribe v2: grace filter, mailto sending (owner decision), exact verification from the change feed, Trash fallback, and "the rest of this company".
4. The Senders screen: filters, sorts, and Group by company. Template lines inside a sender.
5. Filing within 10 minutes: minute limits, the 5-minute change-feed sweep, and packed group filters.
6. Sort my inbox on the per-sender kind.

## Sources

- RFC 8058: <https://www.rfc-editor.org/rfc/rfc8058>
- RFC 2369: <https://www.rfc-editor.org/rfc/rfc2369>
- Gmail Manage subscriptions (July 2025): <https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html> and <https://tomsguide.com/computing/email/gmails-new-manage-subscriptions-feature-might-help-me-finally-get-my-inbox-under-control>
- Gmail and Yahoo one-click requirements: <https://valimail.com/blog/one-click-unsubscribe> and <https://www.captaindns.com/en/blog/gmail-one-click-unsubscribe-rfc8058>
- Microsoft high-volume sender rules: <https://www.mailgun.com/blog/deliverability/microsoft-sender-requirements/> and <https://docs.inboxally.com/support/microsoft-outlook-changes-for-bulk-senders-in-2025>
- Competitor fallbacks: <https://clean.email/blog/clean-email-alternatives/best-leave-me-alone-alternative> and <https://leavemealone.com/blog/best-bulk-email-unsubscribe-tools-2026/>
- Shortwave bundles: <https://www.shortwave.com/docs/guides/bundles/>
- Senders who ignore requests (old data): <https://chiefmarketer.com/top-firms-fumble-opt-outs-return-path> and <https://www.suped.com/knowledge/email-deliverability/compliance/why-do-i-keep-receiving-emails-after-unsubscribing>
- Gmail filter limits: <https://developers.google.cn/gmail/api/reference/rest/v1/users.settings.filters/create?hl=en> and <https://www.spudart.org/blog/character-limit-for-gmail-filter/> (the per-filter length is a field test, not an official figure)
- `messages.send` scopes: <https://developers.google.cn/gmail/api/reference/rest/v1/users.messages/send?hl=en>
- Outlook rules quota: <https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/outlook-on-the-web/increase-the-space-used-by-inbox-rules>
- chrome.alarms: <https://developer.chrome.com/docs/extensions/reference/api/alarms>
