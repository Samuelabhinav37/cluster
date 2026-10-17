# End-to-end unsubscribe journey and edge cases (for Cluster, on-device MV3, Gmail + Outlook)

Research date: 2026-10-16. Vendor help pages are vendor claims unless noted. Independent evidence was thin: I found no independent measurements of unsubscribe success rates. Some fetches failed (ICO page: connection reset; CRTC FAQ: HTTP 403), so those points rely on secondary sources and are marked.

## 1. After the request: confirmation emails, "confirm your unsubscribe" emails, preference centres, mailto auto-replies and bounces

### Takeaway
The standards make one-click unsubscribe a no-further-action flow. RFC 8058 says it "has to work without manual intervention", and Google says mailto does not meet its one-click requirement. So a "confirm your unsubscribe" email is a red flag for one-click senders, though it can happen with mailto or web flows. None of the vendor help pages I read (Gmail, Proton, Clean Email, Leave Me Alone, Superhuman) say how they detect or file post-unsubscribe confirmation emails, auto-replies or bounces. Cluster has to design this itself.

### Cited Findings
- RFC 8058: the one-click POST "has to work without manual intervention". The sender cannot ask the user for an address or a list. The POST MUST NOT include cookies, HTTP authorization or other context. The sender MUST NOT answer with an HTTPS redirect. The URI MUST identify the recipient and the list, ideally with an opaque, hard-to-forge token. One-click SHOULD NOT be offered unless a valid DKIM signature covers both List-Unsubscribe and List-Unsubscribe-Post. Receivers MUST NOT POST without user consent. The RFC defines no response codes and no failure handling for receivers. — [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html)
- POST body: the key/value `List-Unsubscribe=One-Click`, sent as multipart/form-data (SHOULD) or x-www-form-urlencoded (MAY). — [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html)
- Secondary sources say the same: the RFC 8058 action should unsubscribe immediately, with no further input or confirmation. — [Suped](https://www.suped.com/knowledge/email-deliverability/compliance/does-google-require-list-unsubscribe-for-one-click-unsubscribe-in-emails); also [Palisade](https://www.palisade.email/learning/one-click-unsubscribe)
- Google: "We'll continue to support mailto links but they don't meet our one-click unsubscribe requirement." A mailto link in the body does not satisfy the requirement either. — [Google sender guidelines FAQ](https://support.google.com/a/answer/14229414)
- With mailto, the client sends a generated message to the sender's address. "It is the sender's responsibility to receive and process these generated emails." — [Twilio SendGrid docs](https://docs.sendgrid.com/ui/sending-email/list-unsubscribe)
- Yahoo: "The mail-to: method is acceptable", but the POST method is preferred. — [Yahoo Sender Hub](https://senders.yahooinc.com/best-practices/)
- Gmail Manage subscriptions: some senders send you to their website. A pop-up offers "Go to website" or "Block instead". — [Gmail Help](https://support.google.com/mail/answer/15621070)
- Superhuman: it "either emails the sender for you or sends you to the company's unsubscribe page". — [Superhuman help](https://help.superhuman.com/article/521-unwanted-emails)
- Clean Email uses several methods: emailing the sender, following header unsubscribe links, and "automating unsubscribe forms". — [Clean Email help](https://clean.email/help/unsubscriber/overview)
- CAN-SPAM lets the opt-out be a reply email or "a single page on an Internet Web site". The sender may not charge a fee or ask for personally identifying information beyond an email address. A menu of choices is allowed, but it must include the option to stop all marketing. — [FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- Secondary sources on CAN-SPAM/CASL confirmation pages and preference updates. — [Suped](https://suped.com/email-deliverability/answers/what-are-the-can-spam-and-casl-requirements-for-unsubscribe-confirmation-pages-preference-update) (not fetched in full)

### Inferences
- Classify replies that arrive after Cluster sends (match the sender's domain or the mailto address and a time window, about 0 to 72 h):
  - (a) "You have been unsubscribed" confirmations. These are informational. A safe default is to mark them read and archive or label them, not delete them, because they are evidence for the Unsubscribed record.
  - (b) "Confirm your unsubscribe / click here" emails. These need the user. Surface them as "needs you" and never auto-click. The links can be tracking or re-engagement links, and RFC 8058's consent principle argues for user action.
  - (c) Auto-replies (vacation/OOO, "this mailbox is not monitored"). These are inconclusive. Keep watching.
  - (d) Bounces or NDRs to the mailto address (mailer-daemon or postmaster sender, "Delivery Status Notification"). The mailto method failed. Mark it failed and fall back to the next method or the "needs you" queue.
- Preference-centre landing (a web URL that shows checkboxes) cannot be completed silently. Treat it as "needs you" and open it in a tab.
- Because CAN-SPAM forbids the sender from requiring more than an email address, a flow that asks for login is legally questionable for US commercial mail. It is still common (see Leave Me Alone's login-failure example in section 5).

### Gaps
- No vendor help page I found documents auto-filing or deleting confirmation emails, auto-replies or bounces. No reliable source either way.
- I found no published regex or heuristics for classifying confirmation emails.
- RFC 8058 does not say which HTTP status counts as success, so 2xx = accepted is an implementer convention, not a cited rule.

## 2. Multiple lists per company, re-subscription after purchase, and transactional mail versus the backstop filter

### Takeaway
Unsubscribing from marketing legally and practically leaves transactional mail flowing (receipts, password resets, order updates). The products differ on scope. Gmail unsubscribes from all of a sender's active lists and then sends new mail to Spam. Clean Email groups by unsubscribe link and Trashes later mail. A backstop filter keyed on the whole sender address or domain risks catching transactional mail.

### Cited Findings
- Gmail: unsubscribing in Manage subscriptions "unsubscribes you from all of that sender's active mailing lists". After that, new mail from the sender goes to Spam with an explanatory banner, and "Report not spam" moves it back. — [Gmail Help](https://support.google.com/mail/answer/15621070)
- Gmail: "Blocking doesn't unsubscribe you from the mailing list". Blocked mail goes straight to Spam. — [Gmail Help](https://support.google.com/mail/answer/15621070)
- Clean Email: "Clean Email identifies unique subscriptions based on the unsubscribe link found in the message headers." Different sender names with the same link form one group. The same sender with different links can form separate groups. — [Clean Email help](https://clean.email/help/unsubscriber/overview)
- Clean Email routes new messages from an unsubscribed sender to Trash. Its "Move existing messages to Trash" toggle is on by default. — [Clean Email help](https://clean.email/help/unsubscriber/overview)
- Proton: regular emails can be misclassified as newsletters, which it attributes to senders who don't follow conventions. Users can report this by sending headers. — [Proton support](https://proton.me/support/mail-newsletters-view)
- CAN-SPAM transactional/relationship messages are a narrow category (facilitating an agreed transaction, warranty or safety info, account or employment info and similar). An ongoing relationship alone does not make a message transactional. Mixed messages are judged by "primary purpose", with the subject line as a key factor. — [FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- Google: one-click is required "only for marketing and promotional messages". Its examples of transactional messages are password resets, reservation confirmations and form-submission confirmations. — [Google sender guidelines FAQ](https://support.google.com/a/answer/14229414)
- Merchant example (vendor help): after unsubscribing you may still get abandoned-cart notices, order confirmations and order updates. Marketing stops "unless you opt into them again". — [Artifact Uprising help](https://help.artifactuprising.com/hc/en-us/articles/44200853766683-Unsubscribing-From-Our-Emails)
- Leave Me Alone says you may still get transactional emails such as receipts. — [Leave Me Alone sender pages](https://leavemealone.com/how-to-unsubscribe-from/mailerlite/) (snippet-level)
- Multiple accounts on one service each keep their own email settings, which can explain mail that seems to continue (Reddit example, secondary). — [Inbox Zero blog](https://www.getinboxzero.com/blog/post/how-to-stop-reddit-emails)

### Inferences
- Backstop filter safety:
  - Key the filter on list identity (List-Id, or List-Unsubscribe URL host + path, or the exact From address that carried List-Unsubscribe), not on the bare domain.
  - Exclude mail without a List-Unsubscribe header, because transactional mail often lacks it.
  - Prefer label/archive or Spam over hard-delete. Gmail's own pattern is Spam with a banner and an easy "not spam".
  - Prefer Trash only after the 3-day watch confirms the mail is still list mail.
  - Typical transactional senders (no-reply@ for receipts, security@, accounts@) often share the marketing domain. Domain-level filters will catch them.
- Re-subscription after a purchase ("you opted in again at checkout") is legal when consent was given. Cluster should treat new list mail after a later purchase or sign-up as "came back" rather than "unsubscribe failed". Without a server it can only guess from timing, for example whether a receipt from the same domain arrived just before.
- Several lists per company: per-list grouping (Clean Email) is more precise. Per-sender, all-lists (Gmail) matches user intent better. Cluster can do per-sender in the UI while sending one request per distinct List-Unsubscribe target.

### Gaps
- No source quantified how often senders re-add users after purchases.
- No vendor documented how its backstop avoids transactional mail beyond the above.

## 3. Undo and re-subscribe; how "Unsubscribed" history is shown

### Takeaway
No product can truly undo an unsubscribe on the sender's side. "Undo" in clients only removes the local block or filter, and getting back on the list requires the sender (re-opt-in on their site). Clean Email says this explicitly. Proton shows an Unsubscribed tab. Gmail's help shows no history view.

### Cited Findings
- Clean Email: the Unsubscribed tab lists unsubscribed lists sorted by latest message received, newest first, and is searchable. "Unblock" stops the Trash routing, but you must contact the sender directly to resume delivery. — [Clean Email help](https://clean.email/help/unsubscriber/overview); also [Clean Email tools help](https://clean.email/help/tools/unsubscriber)
- Clean Email "Pause" sends no request and auto-Trashes the list. "Unblock" in the Paused tab reverts it. This is a reversible alternative to unsubscribing. — [Clean Email help](https://clean.email/help/unsubscriber/overview)
- Proton Newsletters view: Active and Unsubscribed tabs. Active shows unread count and emails received in the past 30 days. In Unsubscribed, "Move to trash" with "Apply to future messages" auto-deletes future mail. The page does not cover undo or resubscribe, and the view "doesn't move or reorganize anything" by itself. — [Proton support](https://proton.me/support/mail-newsletters-view)
- Gmail Manage subscriptions: the visible help content describes no history or past-subscriptions view. The only reversal is "Report not spam" on later messages. — [Gmail Help](https://support.google.com/mail/answer/15621070)
- Outlook.com: Settings > Mail > Subscriptions lists current subscriptions with Unsubscribe or Block. Blocked senders appear under Junk email settings. Some senders show no unsubscribe option (already junked, blocked, or a different sender). — [Microsoft Support](https://support.microsoft.com/en-us/office/how-to-manage-email-subscriptions-in-outlook-com-26c8f447-2141-4bff-8781-80a4e6b7f0c8)

### Inferences
- Label Cluster's Undo honestly: "Stop filtering. To get emails again, re-subscribe on the sender's site". Remove the backstop filter, and optionally offer a link to the sender's site or the original message. A mailto "subscribe" is not standard.
- Offering a Pause option (filter only, no request) gives a truly reversible path.

### Gaps
- I could not confirm whether Proton's Unsubscribed tab shows dates.
- No source documented Gmail Manage subscriptions history as of Oct 2026 (the help page was partly truncated).

## 4. Verification: how tools tell users it worked, and what time windows to state

### Takeaway
Vendors mostly don't verify. They hide later mail (Gmail: Spam. Clean Email: Trash. Leave Me Alone: optional Inbox Shield block) and give user-triggered "It didn't work" paths. The only tool with documented failure evidence is Leave Me Alone, which shows an "Action required" flag with a screenshot. Time windows to state: Gmail and Yahoo expect bulk senders to honour requests within 2 days (Google calls 48 h a recommendation, but treats not honouring within 48 h as a requirement issue). The legal maximum is 10 business days under CAN-SPAM and CASL.

### Cited Findings
- Gmail user help: "It can take a few days for the sender to unsubscribe you". You may keep getting messages meanwhile. — [Gmail Help](https://support.google.com/mail/answer/15621070)
- Google sender FAQ: "recommend that you fulfill unsubscribe requests within 48 hours". Not honouring within 48 h is listed as a requirement issue with "Delivery support or mitigations unavailable". Bulk-sender rules started Feb 2024 (5,000+/day). The one-click deadline for senders that already had links was 1 June 2024. Gmail began ramping up enforcement (temporary and permanent rejections) in November 2025. — [Google sender guidelines FAQ](https://support.google.com/a/answer/14229414)
- Yahoo: "Honor unsubscribes within 2 days". — [Yahoo Sender Hub](https://senders.yahooinc.com/best-practices/)
- CAN-SPAM: honour within 10 business days, and the mechanism must work for at least 30 days after sending. — [FTC](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- CASL (secondary, CRTC page returned 403): process "without delay" and no later than 10 business days. The unsubscribe address must stay valid 60 days after sending. Rogers Media paid $200,000 partly over not honouring unsubscribes within 10 business days (2015). — [Bennett Jones 2015](https://www.bennettjones.com/Insights/Blogs/2015/11/Unsubscribe-Problems-Nets-Telecommunications-Provider-Under-Antispam-Law); [emaillistvalidation blog](https://emaillistvalidation.com/blog/casl-identification-and-unsubscribe-requirements-in-every-message/)
- Leave Me Alone: failed unsubscribes show "Action required" with the reason and a screenshot (example: the sender needed a login). The "It didn't work" button reveals the unsubscribe link for manual completion. You can filter by "unsubscribed" or "failed". — [Leave Me Alone help](https://help.leavemealone.com/en/troubleshooting/im-still-getting-emails); also [help.leavemealone.com search snippet](https://help-new.leavemealone.com/en/having-problems/im-still-getting-emails)
- Leave Me Alone: "Unfortunately we can't unsubscribed [sic] from everything." Inbox Shield (paid) blocks senders. — [Leave Me Alone help](https://help.leavemealone.com/en/troubleshooting/im-still-getting-emails.md)
- Clean Email: no success confirmation is described. Some senders "require a grace period", and later mail is Trashed. — [Clean Email help](https://clean.email/help/unsubscriber/overview)
- Superhuman: unsubscribe plus optional archive or trash of past mail. Auto Archive / Always Archive for senders you cannot unsubscribe from. — [Superhuman help](https://help.superhuman.com/article/521-unwanted-emails)
- Proton: the page makes no timing claims. — [Proton support](https://proton.me/support/mail-newsletters-view)
- A vendor blog states a 48 h removal expectation. — [PowerDMARC](https://powerdmarc.com/one-click-unsubscribe-email-requirement/)

### Inferences
- Copy for Cluster: "Most senders stop within 2 days. The law allows up to 10 business days." That is accurate for big senders to Gmail and Yahoo and for US/Canada law.
- Cluster's 3-day watch fits the 2-day bulk-sender norm. Mail on days 1 and 2 is expected. After about 3 days, "still sending" is a real signal. Legally the sender still has until about 14 calendar days (10 business days), so avoid wording like "they ignored you" before then.
- Gmail and Yahoo's 2-day rule applies only to bulk senders' marketing mail, so small senders can lawfully take longer.

### Gaps
- No vendor publishes its own success rate. I found no independent measurement.
- Microsoft (Outlook.com) has no published sender processing deadline that I found.

## 5. Bulk unsubscribe UX: pacing, progress, partial failures, "needs you" items

### Takeaway
Documented practice is a multi-select action bar with a confirmation dialog (Clean Email), then per-item statuses with "Action required" and filters for failed items (Leave Me Alone). Methods that can't be automated (login, CAPTCHA, preference centres) are pushed back to the user with the raw link.

### Cited Findings
- Clean Email bulk: multi-select, then an action bar (Unsubscribe, Keep Receiving, Read Later, folder, Pause). It advises caution with bulk unsubscribe. A "Do not ask for confirmation again" preference exists. — [Clean Email help](https://clean.email/help/unsubscriber/overview)
- Clean Email automates unsubscribe forms, which is a server-side capability. — [Clean Email help](https://clean.email/help/unsubscriber/overview)
- Leave Me Alone: the "Action required" flag, failure screenshots, login-required failures, the "failed" filter and manual-link fallback. — [Leave Me Alone help](https://help.leavemealone.com/en/troubleshooting/im-still-getting-emails)
- Gmail: website-only senders get a "Go to website" or "Block instead" choice. — [Gmail Help](https://support.google.com/mail/answer/15621070)
- If automated unsubscribe fails it harms sender reputation, so senders have an incentive to support one-click (secondary). — [Suped](https://www.suped.com/knowledge/email-deliverability/troubleshooting/how-does-the-unsubscribe-from-sender-option-work-and-what-should-i-do-if-it-fails)

### Inferences
- For Cluster, with no server and only one-click POST + mailto:
  - Bucket the results as Done (2xx POST / mailto sent), Needs you (URL-only, preference centre, login, CAPTCHA, confirm-click emails), Failed (network error, 4xx/5xx, mailto bounce) and Watching (day 0 to 3).
  - Pace mailto sends. Sending many generated emails from the user's account in a burst could trip provider send limits or abuse heuristics (provider limits not researched here).
  - Persist the queue in chrome.storage so that a closed browser resumes the batch (section 6).

### Gaps
- No vendor documents pacing or rate limits for bulk unsubscribe.
- I found no public data on the share of senders that offer only web or login flows.

## 6. Account and environment edge cases

### Takeaway
Little vendor documentation exists. Most edge-case handling must be derived from mechanics: the List-Unsubscribe URI encodes the recipient that the mail was sent to, so the subscribed address is the original To, not the reading account.

### Cited Findings
- RFC 8058: the URI MUST contain enough to identify the recipient and the list. — [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html)
- Gmail Manage subscriptions is "gradually rolling out and may not be available to you yet". The help page did not mention Workspace availability. — [Gmail Help](https://support.google.com/mail/answer/15621070)
- Outlook does not offer unsubscribe when mail was junked, the sender is blocked, or messages come from different senders. — [Microsoft Support](https://support.microsoft.com/en-us/office/how-to-manage-email-subscriptions-in-outlook-com-26c8f447-2141-4bff-8781-80a4e6b7f0c8)
- Separate accounts on one service with the same email each keep their own settings. — [Inbox Zero blog](https://www.getinboxzero.com/blog/post/how-to-stop-reddit-emails)

### Inferences
- Aliases and forwarding:
  - The one-click URI already carries the original recipient token, so POST works whichever account reads it.
  - mailto sends from the reading account, which can differ from the subscribed alias or forwarded address. Senders matching on From may not find the subscriber. Prefer one-click when present, and show the original To or Delivered-To in the UI.
- Several linked accounts on the same list: each needs its own request, because each URI or token differs. Dedupe the UI by list but send per account.
- Shared or delegated mailboxes: sending mailto from a delegate may send "on behalf of" the delegate. A filter created in a shared mailbox affects everyone. Ask before acting in non-primary mailboxes.
- Workspace or managed accounts: admins may restrict filters, forwarding or external sending. Treat any API or filter failure as "needs you" rather than retrying silently.
- Offline or closed browser mid-batch: MV3 service workers are ephemeral. Store per-item state before each send, use idempotent request IDs so nothing is sent twice, and resume on startup or alarms.
- User deletes the backstop filter: detect it on the next sync, and mark the item "filter removed" rather than re-creating it silently.

### Gaps
- No vendor documentation found for Workspace, delegated mailboxes, aliases or offline behaviour in unsubscribe tools.

## 7. Measurement: local counters and outcome data

### Takeaway
I found no vendor that publishes outcome stats like "X% stopped within 7 days". The documented counters are inventory counts: Proton's unread and past-30-days counts, Clean Email's count of pending lists, and Gmail's recent-email count.

### Cited Findings
- Proton: unread count and emails received in the past 30 days per sender. — [Proton support](https://proton.me/support/mail-newsletters-view)
- Clean Email: a blue badge counts subscriptions not yet actioned. Unsubscribed is sorted by latest message received. — [Clean Email help](https://clean.email/help/unsubscriber/overview)
- Gmail: a recent email count per sender. — [Gmail Help](https://support.google.com/mail/answer/15621070)

### Inferences
- Cluster can compute locally, per item:
  - first post-request message date;
  - messages caught by the backstop;
  - a stopped/still-sending verdict at days 3, 7 and 14;
  - aggregates such as "N of M stopped within 7 days" and "emails kept out of inbox".
- The last two give honest, private outcome data that competitors don't show.

### Gaps
- No public benchmark for unsubscribe effectiveness.

## 8. Legal context (for accurate copy)

### Takeaway
- US (CAN-SPAM) and Canada (CASL): 10 business days.
- Gmail and Yahoo platform rules for bulk senders: 2 days (not law).
- UK PECR: opt-outs must be honoured and suppressed. The ICO page could not be fetched to confirm any timing wording.
- India: no email-specific unsubscribe statute was confirmed. The DPDP Rules 2025 add consent-withdrawal duties, phased in through May 2027.

### Cited Findings
- CAN-SPAM: 10 business days. The mechanism must work 30 days. No fee and no PII beyond the email address. A menu is allowed but must include "stop all". The sender may not sell or transfer the address after opt-out. — [FTC](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- CASL (secondary): without delay, at most 10 business days. The unsubscribe address must stay valid 60 days. CRTC enforcement exists (Rogers $200k, 2015). — [Bennett Jones](https://bennettjones.com/Blogs-Section/Unsubscribe-Problems-Nets-Telecommunications-Provider-Under-Anti-spam-Law); [emaillistvalidation](https://emaillistvalidation.com/blog/casl-identification-and-unsubscribe-requirements-in-every-message/)
- UK PECR: senders must provide a valid contact address to opt out or unsubscribe (ICO page title and snippet). — [ICO](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/how-do-we-comply-with-the-pecr-electronic-mail-marketing-rules/)
- Law-firm summaries of the ICO guidance (2022): one-click opt-out or a valid contact address, and keep up-to-date opt-out records. Objectors go on a suppression list rather than being deleted. — [RPC 2022](https://rpclegal.com/snapshots/data-protection/winter-2022/ico-publishes-new-guidance-on-marketing-by-electronic-mail); [IDPE 2017](https://idpe.org.uk/uk/idpe/uploads/files/Documents%20for%20News%20Page/A%20brief%20overview%20of%20PECR%20Nov2017.pdf)
- PECR soft opt-in requires an opt-out in every message. — [FSP Law](https://www.fsp-law.com/pecr-updates/)
- India DPDP Rules: notified 14 Nov 2025. Phases take effect 13 Nov 2025, 13 Nov 2026 and 13 May 2027. Withdrawing consent must be as easy as giving it. After withdrawal, processing must cease. — [The Leaflet](https://theleaflet.in/explainer/indias-new-digital-personal-data-protection-rules-2025-a-detailed-reading); [KPMG Nov 2025](https://assets.kpmg.com/content/dam/kpmgsites/in/pdf/2025/11/dpdp-rules-2025-guidance-to-dpdp-act-implementation.pdf)
- India (2023 law-firm alert, dated): Indian law generally did not require opt-in or opt-out for email marketing. The TRAI UCC Regulations 2018 covered voice and SMS, not email. — [TTA 2023](https://tta.in/annual-maintenance-email-marketing-india/)

### Inferences
- Safe copy: "Senders are generally required to stop within 10 business days in the US and Canada. Large senders to Gmail and Yahoo are expected to stop within 2 days."
- Avoid giving specific UK or India deadlines.
- GDPR Art. 21 (right to object to direct marketing) applies in EU/UK, but this pass did not fetch its text.

### Gaps
- I could not confirm whether the ICO uses "without delay" or another timing phrase, or whether the Data (Use and Access) Act 2025 changes PECR opt-out rules.
- I could not verify the CRTC primary text (403).
- No verification on whether India's IT Act or IT Rules impose any email unsubscribe deadline. None was found.
