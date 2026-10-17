# Mailto unsubscribe: standards, client behaviour, and how list systems process it (as of 2026-10-16)

Scope: how Cluster (a header-only, on-device MV3 extension for Gmail and Outlook, with no server) should build and send `List-Unsubscribe: <mailto:...>` requests, and what happens on the receiving side. Vendor claims are marked "(vendor claim)". Independent or primary-standard evidence is marked "(standard)" or "(independent)".

## Q1. Parsing: RFC 2369 List-Unsubscribe + RFC 6068 mailto, and method preference (RFC 2369 vs RFC 8058)

### Takeaway
Parse List-Unsubscribe as a comma-separated list of `<...>` URLs, ordered by preference left to right. Stop at the first malformed item. Use only `to`, `subject` and `body` from the mailto URL, percent-decoded once as UTF-8, and ignore every originator, routing, trace and MIME hfield. RFC 2369 says to use the leftmost supported URL. RFC 8058 defines one-click as HTTPS POST only, so mailto is never "one-click" and is the fallback when no valid one-click HTTPS is present.

### Cited Findings
**RFC 2369 (1998) List-Unsubscribe syntax (standard)**
- The field content is angle-bracketed URLs, and whitespace inside them is ignored. MTAs "MUST NOT insert whitespace within the brackets", and clients should ignore any that a bad MTA inserts. Long values may be folded per RFC 822. — [RFC 2369 §2](https://www.rfc-editor.org/rfc/rfc2369.html)
- "The URLs have order of preference from left to right." The client should use the leftmost URL whose protocol it supports. It should use one URL per command and try another only if the first fails. — [RFC 2369 §2](https://www.rfc-editor.org/rfc/rfc2369.html)
- Parsing rules:
  1. If the content (after leading whitespace and comments) does not start with "<", the field SHOULD be ignored.
  2. Text after a bracketed URL is ignored unless the next non-whitespace character is a comma.
  3. If a comma-separated sub-item is not an angle-bracket URL, that item and all following items SHOULD be ignored.
  4. Parenthesized comments may appear around URLs (§3.2 examples).
  — [RFC 2369 §2, §3.2](https://www.rfc-editor.org/rfc/rfc2369.html)
- A message MUST have no more than one List-Unsubscribe field. — [RFC 2369 §3](https://www.rfc-editor.org/rfc/rfc2369.html)
- Example mailto values: `<mailto:list@host.com?subject=unsubscribe>`, `<mailto:list-off@host.com>`, and `<mailto:list-manager@host.com?body=unsubscribe%20list>`. So a list may depend on a specific subject or body supplied in the URL. — [RFC 2369 §3.2](https://www.rfc-editor.org/rfc/rfc2369.html)
- The mechanism does not support commands that need the client to insert variables, such as the user's address. — [RFC 2369 §1, A.5](https://www.rfc-editor.org/rfc/rfc2369.html)
- Security: the user must be able to confirm before the action executes, and clients should not support dangerous URL types such as `file://`. — [RFC 2369 §5](https://www.rfc-editor.org/rfc/rfc2369.html)
- If a dialog is used instead of showing the raw message, it "MUST include an option for the user to review (and possibly modify) the message before it is sent." — [RFC 2369 App. B.2.4](https://www.rfc-editor.org/rfc/rfc2369.txt)

**RFC 6068 (2010) mailto URI (standard)**
- Grammar: `mailto:` + optional `to` (`addr-spec *("," addr-spec)`) + `?hfname=hfvalue&...`. Several recipients are comma-separated. Putting the recipient in a `to=` hfield instead of the path is "NOT RECOMMENDED because different user agents handle this case differently." — [RFC 6068 §2](https://www.rfc-editor.org/rfc/rfc6068.html)
- Percent-encoding:
  - Reserved delimiters inside values are `%3F`, `%3D` and `%26`, and `#` is `%23`.
  - Fragments should be ignored.
  - Spaces SHOULD be `%20`. A `+` coming from HTML forms is a known problem, so do not decode `+` as a space.
  - Encoding and decoding must be applied "only once" (no double-unescaping).
  — [RFC 6068 §2, §5, §7](https://www.rfc-editor.org/rfc/rfc6068.html)
- UTF-8:
  - Non-ASCII in hfvalues is UTF-8 then percent-encoded. When composing, header values are converted to MIME encoded-words (RFC 2047).
  - `body` uses RFC 2045 transfer encoding instead. Encoding headers in the URI "MUST be ignored".
  - Percent-encoded non-ASCII in domains only stands for UTF-8 (prefer IDNA). In local parts it is allowed only for internationalized addresses.
  — [RFC 6068 §2, §6.3](https://www.rfc-editor.org/rfc/rfc6068.html)
- Line breaks in body are `%0D%0A`, and a final line break may be added. "Line breaks in other <hfield>s SHOULD NOT be used", which is a header-injection guard. — [RFC 6068 §5](https://www.rfc-editor.org/rfc/rfc6068.html)
- hfnames are case-insensitive and hfvalues are case-sensitive. Producers SHOULD NOT repeat an hfname, and handling of repeats varies. — [RFC 6068 §2](https://www.rfc-editor.org/rfc/rfc6068.html)
- Fields to ignore:
  - Originator, routing, trace and MIME header fields in the URI "MUST be ignored". This covers From, Sender, Reply-To, Return-Path, Received, Content-Type, Content-Transfer-Encoding and similar.
  - Unrecognized fields "SHOULD be treated as especially suspect".
  - Only Subject, Keywords and Body are "both safe and useful in the general case". Clients must handle `subject` and `body`.
  - A UA "SHOULD NOT create a message if any of the header fields are considered dangerous", but may create one with a safe subset.
  — [RFC 6068 §3, §4](https://www.rfc-editor.org/rfc/rfc6068.html)
- To/Cc/Bcc: the final message may differ from the URI, and clients "MAY eliminate duplicate addresses". Bcc in mailto links is a known abuse vector. — [RFC 6068 §3, §7](https://www.rfc-editor.org/rfc/rfc6068.html)
- Security: a client "SHOULD NOT send a message based on a 'mailto' URI without first disclosing" it to the user and should make clear that an email is about to be sent. Programs should make sure the envelope return path is set correctly, and parsers must sanity-check input. — [RFC 6068 §7](https://www.rfc-editor.org/rfc/rfc6068.html)

**RFC 8058 (2017) one-click (standard)**
- List-Unsubscribe "MUST contain one HTTPS URI" and "MAY contain other non-HTTP/S URIs such as MAILTO:". One-click is defined only as an HTTPS POST of `List-Unsubscribe=One-Click` to the HTTPS URI. There is no one-click mailto. — [RFC 8058 §3.1–3.2](https://datatracker.ietf.org/doc/html/rfc8058)
- A valid DKIM signature must cover both List-Unsubscribe and List-Unsubscribe-Post. Without it "the mail receiver SHOULD NOT offer a one-click unsubscribe". The POST must carry no cookies or auth, must not be performed "without user consent", and the sender must not redirect. — [RFC 8058 §3.1, §3.2, §4](https://datatracker.ietf.org/doc/html/rfc8058)
- RFC 8058 says nothing about choosing between mailto and HTTPS beyond defining the one-click POST. It "does not change other uses" of List-Unsubscribe URIs. — [RFC 8058 §3.1](https://datatracker.ietf.org/doc/html/rfc8058)
- Google bulk-sender FAQ: "We'll continue to support mailto links but they don't meet our one-click unsubscribe requirement." Senders must "include one HTTPS URL in the List-unsubscribe: header." Unsubscribes should be honoured "within 48 hours". — [Google Workspace Admin Help, sender guidelines FAQ](https://support.google.com/a/answer/14229414)

### Inferences
- Suggested Cluster order:
  1. A valid RFC 8058 pair (HTTPS URI plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`) gets a background POST. Cluster cannot check DKIM from the DOM. The mailbox provider's own button or Authentication-Results could stand in for that check.
  2. Otherwise, mailto (send an email).
  3. Otherwise, open the HTTPS URL in a tab.

  This departs from RFC 2369's strict "leftmost" rule. Major clients prefer one-click when it is present (see Q4), and RFC 8058 defines it as the stronger path, so the departure is defensible.
- Parser checklist:
  - Split the header on top-level commas outside `<>`, and stop at the first non-`<` item.
  - Strip whitespace inside brackets.
  - Take only `mailto:` items. For the path, split on `,` and percent-decode each addr-spec once.
  - Lowercase hfnames. Keep `to` (merge with the path, de-duplicate), `subject` and `body`. Drop everything else, especially cc/bcc, which a list has no reason to need.
  - Reject any CR/LF in decoded subject or to. Allow `%0D%0A` only in body, normalizing to CRLF.
  - Decode `+` as a literal plus.
  - Cap the number of recipients, for example 1–2. More than that is suspicious.

### Gaps
- No RFC sets a maximum for recipients in an unsubscribe mailto. The cap above is a design choice.

## Q2. What the sent message should contain (From identity, To, Subject, Body, Auto-Submitted); From matching; VERP/encoded addresses

### Takeaway
Send from the exact address that received the list mail. RFC 2369 says to use "the address that is subscribed". Classic list managers such as Mailman match on the sender, so a wrong identity (primary account instead of an alias, or a forwarded mailbox) silently fails or unsubscribes nobody. Use the URL's subject and body verbatim, and fall back to Subject "unsubscribe" when none is given. Do not add `Auto-Submitted`, because the user clicked to send it. Many ESPs encode a per-recipient token in the mailto local-part or subject, which makes From matching irrelevant for them, but Cluster cannot tell which senders do this.

### Cited Findings
- RFC 2369 Appendix B.1: "When unsubscribing or such, the address that is subscribed should be used, unless that is not known by the application and cannot be determined from the message headers." If the user has several addresses and the right one cannot be determined, "the client application should prompt the user". — [RFC 2369 App. B.1](https://www.rfc-editor.org/rfc/rfc2369.txt)
- Mailman (2.1 member manual): send to `LISTNAME-leave@DOMAIN` "from the address you want removed". "The subject and body of this message will be ignored." Mailman then sends a confirmation email that must be acted on, "to stop people from unsubscribing you without your permission", and a moderator may also need to approve. — [GNU Mailman member manual 5.2](https://list.org/mailman-member/node14.html)
- Mailman 3: the email `leave` command (alias `unsubscribe`) may require confirmation. Search-result summaries of the docs say lists with open unsubscription remove the sender immediately (the page could not be fetched directly, ECONNRESET). — [Mailman 3 docs, Membership changes via email](https://docs.mailman3.org/projects/mailman/en/latest/src/mailman/commands/docs/membership.html)
- Real-world mismatch failures (independent):
  - Lists discard or ignore requests whose sender differs from the subscribed address. — [UUA list help](https://www.uua.org/node/28230)
  - "The unsubscribe address must be the one used to subscribe", so check the headers to see which account received the mail. — [LibreOffice users list, 2011](https://www.libreoffice.org/lists/users/2011/msg05235.html)
  - oss-security points users to the Return-Path header to find their subscribed address. — [Openwall oss-security wiki](https://oss-security.openwall.org/wiki/mailing-lists/oss-security/unsubscribe)
- Suped (vendor, 2025-07, updated 2026-08) recommends an opaque, hard-to-forge per-recipient token for unsubscribe URIs that maps to recipient and list. It does not discuss VERP mailto directly. — [Suped](https://www.suped.com/learn/email-deliverability/can-you-rely-on-the-from-address-when-receiving-mailto-unsubscribes)
- Forwarded and aliased (plus-tag) addresses can fail to match the original subscription (vendor summary). — [Suped](https://www.suped.com/learn/email-deliverability/can-you-rely-on-the-from-address-when-receiving-mailto-unsubscribes)
- Salesforce Marketing Cloud Reply Mail Management unsubscribes "that email address", meaning the sender of the reply. It looks for unsubscribe terms in the subject or the first 200 characters of the body, including common misspellings (vendor doc). So SFMC reply-based handling is From-dependent and keyword-dependent. — [Trailhead: Set up Reply Mail Management](https://trailhead.salesforce.com/content/learn/modules/send-management-in-marketing-cloud/set-up-reply-mail-management); [Salesforce ReplyEmailSettings](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/api/sforce_api_objects_replyemailsettings.htm)
- Google Groups: email `groupname+unsubscribe@googlegroups.com`, and subject and body are ignored (university help pages, not Google). — [GlueX wiki](https://halldweb1.jlab.org/wiki/index.php/GlueX-Related_Google_Groups); [App State](https://confluence.appstate.edu/spaces/ATKB/pages/6719280/Stop+Receiving+Emails+from+a+Google+Group)
- Body content can break command parsers. In 2010 Sympa rejected a Gmail-generated unsubscribe because its body had the lines `unsubscribe%20msitm` (an undecoded `%20`) and "This message was automatically generated by Gmail." Sympa logged "Unknown command" and "Command has failed". This is a dated example of both a decoding bug and an appended-footer failure. — [Sympa listmaster archive, 2010-08](https://lists.sympa.community/arc/en/2010-08/msg00038.html)
- Auto-Submitted (RFC 3834):
  - The field "SHOULD NOT be supplied for messages that were manually submitted by a human".
  - `auto-generated` must not be used on a message issued in direct response to another message.
  - Responders "SHOULD NOT" auto-respond to messages carrying Auto-Submitted other than "no".

  So adding it could suppress the list manager's confirmation reply. — [RFC 3834 §2, §5.2](https://www.rfc-editor.org/rfc/rfc3834.html)
- RFC 6068 says the envelope return path should be set correctly, and originator fields from the URI must be ignored. The client sets From itself. — [RFC 6068 §3, §7](https://www.rfc-editor.org/rfc/rfc6068.html)

### Inferences
- Choosing the From identity in Gmail and Outlook:
  1. Find which of the user's addresses the message was delivered to. In order, check: To/Cc/Delivered-To, the `X-Original-To` and `Delivered-To` headers, and the Return-Path or VERP-encoded bounce address. A VERP bounce such as `bounce-list=user=example.com@...` often embeds the subscribed address.
  2. If it matches a send-as alias, send as that alias. Plus-addresses (`user+news@gmail.com`) usually cannot be a Gmail send-as identity. Sending from the base address usually works for token-based ESPs but may fail for sender-matching list servers like Mailman and Sympa.
  3. If the message was forwarded from an address that is not a send-as identity, warn the user. Mailman-style lists will not match.
  4. If nothing can be determined, ask the user (RFC 2369 B.1).
- Body: send the URL `body` verbatim when present. Do not add a signature, footer or tracking text, as the Sympa case shows.
- Subject: when the URL has no subject, use "unsubscribe". SFMC RMM and many command parsers key on that word. Mailman and Google Groups ignore the subject, so it does no harm there.
- Do not set Auto-Submitted. A human-initiated message is correct under RFC 3834, and leaving it out keeps confirmation replies working.
- Expect a confirmation email from Mailman and possibly Google Groups. Cluster could detect it and surface it, or tell the user that it is still pending.
- Token or VERP mailto addresses: when the local part or subject carries a long opaque token, the ESP can identify the recipient without the From address. That is the reason ESPs build them, since RFC 2369 A.5 forbids asking the client to insert the address. Cluster still sends from the delivered-to identity in that case, which costs nothing.

### Gaps
- I found no primary ESP doc that publishes its exact mailto token format, for example Mailchimp's `unsubscribe.mailchimpapp.net` addresses. Searches returned nothing citable. The format should be confirmed from real headers in the user's mail, using Cluster's own header samples.
- How Mailman and Google Groups handle Auto-Submitted on incoming leave requests was not verified.

## Q3. How ESPs and list managers process mailto unsubscribes

### Takeaway
Most API ESPs (SendGrid, Postmark, Mailgun, Amazon SES) do not process mailto requests themselves. They tell customers that the mailto address is theirs to receive and handle. Marketing platforms (SFMC, and likely Mailchimp, Klaviyo and HubSpot) use their own inbound addresses, but they do not document subject and body requirements or timing. Classic list servers (Mailman, Google Groups) ignore subject and body, match on sender, and often send a confirm-your-unsubscribe email. Mailto is a "best effort, delayed" channel compared with one-click.

### Cited Findings
- **SendGrid (Twilio):** the mailto address gets an email from the recipient's client, and "It is your responsibility to receive and process these generated emails." With subscription tracking on, SendGrid auto-inserts an HTTPS one-click header. The page does not mention an auto mailto (vendor doc). — [Twilio SendGrid List-Unsubscribe](https://www.twilio.com/docs/sendgrid/ui/sending-email/list-unsubscribe)
- **Postmark:** in the self-managed mode, the mailto is the customer's address. "You'll be sent an unsubscribe request to the email address you've listed", and you must act on it. Mailto "is not compliant with the 2024 Gmail and Yahoo requirements", but including both does no harm. Postmark-managed streams add one-click headers (page published 2025-03-19, modified 2026-10-06; vendor doc). — [Postmark support 1299](https://postmarkapp.com/support/article/1299-how-to-include-a-list-unsubscribe-header)
- **Mailgun:** "some inbox providers still allow the use of mailto", and the URL method is becoming the preferred standard (vendor glossary). — [Mailgun glossary](https://www.mailgun.com/resources/learn/glossary/list-unsubscribe/)
- **Amazon SES:** subscription management adds unsubscribe headers when a contact list and topic are passed. AWS recommends also including mailto. The AWS reference architecture assumes SES receiving is enabled for the mailto address and that the customer updates preferences via the API, so the mailto is processed by customer code (vendor doc and blog). — [SES subscription management](https://docs.aws.amazon.com/ses/latest/DeveloperGuide/sending-email-subscription-management.html); [AWS Messaging blog](https://aws.amazon.com/blogs/messaging-and-targeting/using-one-click-unsubscribe-with-amazon-ses/)
- **Salesforce Marketing Cloud:** Reply Mail Management unsubscribes the replying address when unsubscribe terms (and misspellings) appear in the subject or first 200 characters. Other replies are forwarded (vendor doc). — [Trailhead RMM](https://trailhead.salesforce.com/content/learn/modules/send-management-in-marketing-cloud/set-up-reply-mail-management)
- **Braze:** a Braze employee said on the community forum (circa 2024) that Braze's built-in mailto header did not meet the Gmail/Yahoo one-click rule and that one-click was being built. Customers with their own pages must process list-unsubscribe requests and sync status back. — [Braze community](https://community.braze.com/discussions/channels/re-collapsible-faqs---htmlcss-help/1165/replies/1192); [Braze community thread](https://community.braze.com/t5/ask-me-anything/list-unsubscribe-header-with-preference-center-page/m-p/2531)
- **Klaviyo:** adds one-click headers to every email automatically, and unsubscribes are global by default. Mailto handling is not documented. — [Klaviyo Guide to Unsubscribes](https://help.klaviyo.com/hc/en-us/articles/115005078267)
- **HubSpot:** a sample header shows a `hubspotemail.net` mailto address. Processing is not documented in what I found. — [Mailtrap](https://mailtrap.io/blog/list-unsubscribe-header/)
- **GNU Mailman:** `-leave` address, subject and body ignored, matches the sender, sends a confirmation email, and a moderator may need to approve. — [Mailman member manual](https://list.org/mailman-member/node14.html)
- **Google Groups:** `+unsubscribe` address, subject and body ignored. University help pages disagree:
  - A confirmation message must be followed (Alaska). — [UAlaska](https://service.alaska.edu/TDClient/36/Portal/KB/ArticleDet?ID=201)
  - Removal happens after a short wait (Colorado). — [CU Boulder OIT](https://oit.colorado.edu/services/messaging-collaboration/google-workspace/help/groups/help/use-as-email-list)
  - A success notice arrives afterwards (Wisconsin). — [UW KB](https://kb.wisc.edu/library/104015)
- **Sympa (2010):** a body-command parser that rejects unknown lines (see Q2). — [Sympa archive](https://lists.sympa.community/arc/en/2010-08/msg00038.html)
- **Timing:**
  - Google recommends fulfilling unsubscribes within 48 hours. — [Google FAQ](https://support.google.com/a/answer/14229414)
  - Yahoo's best practices say to "honor unsubscribes within 2 days" (quoted via search summary, not fetched). — [Yahoo Sender Hub](https://senders.yahooinc.com/best-practices/)
  - The CAN-SPAM legal baseline is 10 business days. — [FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
  - A 2026 compliance guide (vendor) classes mailto-only as "One click, delayed processing", meeting CAN-SPAM but not the Gmail/Yahoo bulk rules. — [Tomba](https://tomba.io/blog/email-unsubscribe-requirements)

### Inferences
- Cluster should tell users that a mailto unsubscribe may take up to about 2 days for compliant bulk senders and up to 10 business days legally (US). It should suppress or quietly archive further mail from that sender during the wait.
- Confirmation emails are a feature of list servers (Mailman, some Google Groups, LISTSERV-style). Marketing ESPs generally do not reply. Treat any reply to the unsubscribe as a possible confirmation that needs user action.

### Gaps
- No primary documentation found for Mailchimp, Constant Contact, HubSpot, Klaviyo (mailto path), Mailgun (whether it auto-generates mailto) or L-Soft LISTSERV. That covers subject or body requirements, speed and confirmations. Searches returned only third-party pages, and I did not fetch Mailchimp or LISTSERV help pages.
- No independent measurement of how long ESPs take to act on a mailto request.

## Q4. How Apple Mail, Gmail, Outlook, Thunderbird and Superhuman build the message

### Takeaway
Apple Mail sends from the user's own account with an empty subject and a fixed body naming the original subject. It saves a copy to Sent and reportedly ignores HTTPS. Gmail sends either an HTTP request or an email from the user's account. Its generated email has carried the footer "This message was automatically generated by Gmail." and lands in Sent. Outlook's Graph `unsubscribe` action works only with mailto and sends on the signed-in user's behalf. Thunderbird for Android added List-Unsubscribe support without one-click. I found nothing documented for Superhuman.

### Cited Findings
- **Apple Mail (iOS, as of Feb 2023):**
  - Confirmation prompt, then an email "from you" to the mailto address with an empty subject. The body reads, in effect, that Apple Mail sent this email to unsubscribe from the message "(original subject)". A copy goes to Sent.
  - The HTTP version "does not appear to be supported" and Apple doesn't support RFC 8058 POST. Works on any account domain.
  - Whether it honours `?subject=` is not stated.
  — [Spam Resource (Al Iverson), 2023-02-07](https://www.spamresource.com/2023/02/faq-list-unsubscribe-on-apple-mail-on.html)
- **Apple Mail:** the 2016 iOS 10 introduction of the unsubscribe banner was mailto-based. — [Badsender, 2016-09-21](https://badsender.com/en/2016/09/21/apple-mail-desinscription-ios-10)
- **Gmail:**
  - Google said that clicking unsubscribe makes Gmail send "http request or an email to the sender". 9to5 (via Android Central) describes the web button asking for confirmation before sending "an email from your account". — [Android Central](https://www.androidcentral.com/apps-software/gmail-blue-unsubscribe-button-on-the-web)
  - The 2020 test found Gmail "will favour the mailto method", with the unsubscribe emails visible in the Sent folder. This is old (2020-05-29), and likely superseded for one-click senders after 2024. — [Leave Me Alone, 2020](https://leavemealone.com/blog/how-does-the-gmail-unsubscribe-button-work/)
  - Body footer: "This message was automatically generated by Gmail." appears when Gmail sends the request programmatically (vendor, undated). — [GlockApps](https://glockapps.com/blog/does-gmail-unsubscribe-work/)
  - In 2010 Gmail sent body `unsubscribe%20msitm` (the URL body still percent-encoded) plus that footer, and Sympa rejected it. This was a decoding failure. — [Sympa archive](https://lists.sympa.community/arc/en/2010-08/msg00038.html)
  - A CiviCRM thread reports subject "unsubscribe" with that body (search summary only, not fetched). — [CiviCRM forum](https://forum.civicrm.org/index.php%3Ftopic=24755.0.html)
- **Outlook / Microsoft Graph (beta, page updated 2026-08-28):**
  - `POST /me/messages/{id}/unsubscribe` "Submits an email request on behalf of the signed-in user". For it to work "the sender must specify `mailto:` and not URL-based unsubscribe information".
  - The message exposes `unsubscribeEnabled` and `unsubscribeData`. Success moves the message to Deleted Items, and the API returns 202. Requires Mail.Send.
  - The subject and body Graph uses are not documented.
  — [Microsoft Learn: message unsubscribe](https://learn.microsoft.com/en-us/graph/api/message-unsubscribe)
- **Outlook support for one-click:** a vendor source said (circa 2024) that "not all mailbox providers currently recognize List-Unsubscribe-Post headers, Microsoft is one current example". This is dated and should be re-checked. — [Search summary; source among SocketLabs/Valimail results](https://www.socketlabs.com/blog/2024-is-the-year-of-the-one-click-list-unsubscribe/)
- **Thunderbird:** Mozilla Connect idea requesting an Unsubscribe button (prompted by the October 2023 Gmail/Yahoo announcement). Commenters note Thunderbird for Android (K-9) merged List-Unsubscribe support, with "no functionality in thunderbird-android for RFC 8058 One-Click Unsubscribe yet". Desktop status was not confirmed (page returned 403 on fetch). — [Mozilla Connect idea](https://connect.mozilla.org/t5/ideas/adoption-of-one-click-list-unsubscribe/idi-p/47180)
- **Superhuman:** no documentation found.

### Inferences
- In-product precedent (Apple, Gmail, Outlook) is to send from the user's own account, show a confirmation, and keep the message in Sent. Cluster matching that (sending through the provider's own compose/send so it appears in Sent) fits user expectations and RFC 6068 §7's disclosure rule.
- Lessons from failures:
  - Percent-decode `body` exactly once (Gmail 2010 / Sympa).
  - Don't append footers.
  - Don't send an empty subject when the URL gives none. Apple does, and keyword-based processors such as SFMC RMM still match on the body. "unsubscribe" is the safer default.
- On Outlook, the Graph unsubscribe action is a ready-made mailto sender. But it needs an OAuth token with Mail.Send, which may not fit a header-only, serverless extension. Driving the Outlook web UI's own Unsubscribe or compose is the alternative.

### Gaps
- No Google Help page was retrieved that documents Gmail's exact mailto subject and body in 2024–2026, or its precedence between one-click and mailto.
- The exact subject and body sent by Outlook (web and Graph) are undocumented.
- Superhuman, and Thunderbird desktop behaviour, are not found.

## Q5. Prevalence: mailto-only vs https-only vs both vs one-click (2023–2026)

### Takeaway
I found no independent or academic measurement of the mailto/https/one-click split for 2023–2026. Available numbers are vendor benchmarks with undisclosed methods. Header presence is high (about 95% of brands in one vendor dataset), and one vendor says only 14% of tested senders fully pass one-click. Treat all of it as directional, and have Cluster measure its own users' headers on-device.

### Cited Findings
- **InboxEagle (vendor):** 94.9% of 19,797 brands analysed include a List-Unsubscribe header (750,295 emails). Brands without the header were 4.86x likelier to hit extreme spam thresholds. No mailto/https breakdown. — [InboxEagle](https://www.inboxeagle.com/blog/list-unsubscribe-headers-spam-rates/)
- **Unspam (vendor):** "only 14% of senders pass the one-click List-Unsubscribe requirement" in its benchmark. The sample and method are undisclosed. — [Unspam](https://unspam.email/articles/list-unsubscribe-header/)
- **Policy driver:** Gmail and Yahoo required one-click for bulk senders from 2024 (Google: one HTTPS URL required, mailto alone insufficient). Shares therefore likely shifted toward "both" or "https + one-click" after June 2024. This is an inference. — [Google FAQ](https://support.google.com/a/answer/14229414)
- **Academic:** "Why Johnny Can't Unsubscribe" (Dev, Rader et al.; figures dated Jan 2020) is a usability study of unsubscribe mechanisms. Its PDF could not be text-extracted here. Search summary: "Reply to Unsubscribe" was not completed successfully by any participant. — [paper PDF](https://emileerader.com/papers/unsubscribing.pdf)

### Inferences
- Senders that offer mailto only are now mostly smaller, self-hosted or legacy list servers (Mailman, Sympa, Google Groups, institutional lists), plus non-bulk senders. Those are also the ones most likely to match on the From address and send confirmation emails, so Cluster's identity selection matters most for exactly the mailto-only population.

### Gaps
- No independent 2023–2026 dataset of mailto-only vs https-only vs both vs one-click shares. Cluster's own aggregated, on-device header stats (if users opt in) would be a better source than any published number.
