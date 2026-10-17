# Platform APIs, permissions, limits and policy for sending mailto unsubscribe emails (Gmail + Outlook) from an on-device Chrome MV3 extension

State as of 2026-10-16. Pages fetched on that date unless a date is noted. Cluster context: no server; Gmail scopes `gmail.modify` + `gmail.settings.basic`; Outlook (MSAL) scopes `offline_access`, `Mail.ReadBasic`, `Mail.ReadWrite`.

## Gmail API users.messages.send (scope, format, Sent/threading, quota, sending limits, bounces, send-as, admin blocks)

### Takeaway
Cluster's existing `gmail.modify` scope already authorizes `messages.send` and `drafts.send`, and `gmail.settings.basic` (or `gmail.modify`) covers `settings.sendAs.list`. So adding Gmail mailto sending needs no new Google scope. Quota cost is 100 units per send. The limits that actually bind are Gmail's per-account daily sending limits. For Workspace, the key one is 2,000 *unique external* recipients per day, and every unsubscribe address counts as a unique external recipient. Bounces and spam complaints count against the account too. Workspace admins can block third-party apps from Gmail's "high-risk" scopes such as sending mail.

### Cited Findings
**Scope**
- `users.messages.send` accepts any one of `https://mail.google.com/`, `gmail.modify`, `gmail.compose` or `gmail.send`. — [Gmail API messages.send reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- The scopes page classifies `gmail.modify` as **Restricted** ("Read, compose, and send email", with no permanent deletion that bypasses trash). `gmail.send` is **Sensitive** (send only). `gmail.compose` is Restricted. `gmail.settings.basic` is Restricted. — [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes?hl=en)

**Request format**
- Endpoint: `POST https://gmail.googleapis.com/gmail/v1/users/{userId}/messages/send` (`userId` = `me`). There is also an upload URI `https://gmail.googleapis.com/upload/gmail/v1/users/{userId}/messages/send` for media uploads. The body is a Message resource. — [messages.send reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- Messages must be MIME and RFC 2822 compliant, encoded as a **base64url** string and placed in the `raw` field of the message resource. You then call `messages.send`, or `drafts.create` followed by `drafts.send`. — [Gmail API "Sending email" guide](https://developers.google.com/workspace/gmail/api/guides/sending)

**Threading**
- A sent message joins an existing thread only if all three hold: the request includes `threadId`, the `References` and `In-Reply-To` headers follow RFC 2822, and the `Subject` matches. — [Gmail API "Manage threads" guide](https://developers.google.com/gmail/api/guides/threads); [Sending guide](https://developers.google.com/workspace/gmail/api/guides/sending)
- (Community) `References` should hold the parent's Message-ID plus earlier references. `In-Reply-To` should hold only the parent's Message-ID. — [DEV Community walkthrough](https://dev.to/devnik/reply-in-thread-using-nestjs-and-gmail-api-47ec)

**Quota (changed 2026-05-01)**
- Per-method cost: `messages.send` = 100 units, `drafts.send` = 100, `drafts.create` = 10, `messages.list` = 5, `messages.get` = 20 (60 for full/raw), `settings.sendAs.list` = 1. — [Gmail API usage limits](https://developers.google.com/workspace/gmail/api/reference/quota?hl=en)
- Rate limits: 1,200,000 units per minute per project, and **6,000 units per minute per user per project**. That is about 60 `messages.send` calls per user per minute. — [Gmail API usage limits](https://developers.google.com/workspace/gmail/api/reference/quota?hl=en)
- Dates: the limits were updated on 2026-05-01. Projects that used the API between November 2025 and April 2026 keep their previous quotas, and projects created on or after 2026-05-01 get the new ones. There is also a daily billing threshold of 80,000,000 units per project per day. Charges for exceeding quota are "planned for later in 2026" with at least 90 days' notice. Google recommends truncated exponential backoff. — [Gmail API usage limits](https://developers.google.com/workspace/gmail/api/reference/quota?hl=en)
- Conflict: older snapshots and third parties cite 15,000 units per user per minute (the pre-May-2026 figure). — [Nylas Gmail API quotas](https://developer.nylas.com/docs/cookbook/email/gmail-api-quotas/)

**Daily sending limits (account-level, apply to API sends too)**
- Consumer Gmail: at most 500 recipients per email and at most 500 emails per day. When a limit is exceeded you see "You have reached a limit for sending mail" and can usually send again within 1 to 24 hours. — [Gmail Help: sending limits](https://support.google.com/mail/answer/22839?hl=en)
- Workspace, per user, over a **rolling 24 hours**:
  - 2,000 messages per day (500 for trial accounts).
  - 10,000 total recipients.
  - 3,000 external recipients.
  - **Unique recipients**: 3,000 total and **2,000 external** (500 external for trial accounts).
  - The per-message recipient cap for the **Gmail API is 500**.
  - Sends from aliases and delegates count toward the limits. Limits can change without notice.
  - Source: [Workspace Admin Help: Gmail sending limits](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace?hl=en)
- What happens at the Workspace limit: the user is blocked from sending for up to 24 hours. "The account might be suspended." Accounts that send spam "can be permanently restricted from sending." — [Workspace sending limits](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace?hl=en)

**Bounces**
- Consumer Gmail lists "a large number of emails that can't be delivered" (invalid addresses or recipient servers bouncing them) as a cause of sending blocks. The message shown is "Messages you sent couldn't be delivered", with sending possibly restored after 24 hours. — [Gmail Help: sending limits](https://support.google.com/mail/answer/22839?hl=en)

**Send-as aliases**
- `users.settings.sendAs.list` accepts `gmail.settings.basic`, `https://mail.google.com/`, `gmail.modify` or `gmail.readonly`. — [sendAs.list reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.sendAs/list?hl=en)

**Workspace admin blocking**
- In Admin console > Security > Access and data control > API controls, admins can set Gmail to Restricted, so only Trusted apps get access. For Gmail and Drive they can restrict only "high-risk" access, for example **sending mail**. Switching to Restricted revokes tokens of untrusted apps that are already installed. — [Workspace Admin Help: control which apps access Workspace data](https://knowledge.workspace.google.com/admin/apps/control-which-third-party-and-internal-apps-access-google-workspace-data)

### Inferences
- Unsubscribe mailboxes are almost always outside the user's domain and are new each time. For a Workspace user, a mass-unsubscribe run therefore spends the **2,000 unique external recipients per day** budget, or **500 on trial tenants**. That is the tightest documented cap. For consumer Gmail the cap is 500 emails per day.
- The new 6,000 units per minute per user quota (about 60 sends per minute) is far above any sane pacing. Sending limits and abuse heuristics will bind long before API quota does.
- Because of 2-24h blocks and the bounce trigger, Cluster should cap a batch well below these limits. It should also stop the batch when it sees sending-limit errors or bounce NDRs. The user's whole mailbox depends on that account.
- If Cluster sends a reply-in-thread (not normally needed for mailto unsubscribe), it needs `threadId` plus References and In-Reply-To headers. A standalone new message is simpler and matches what a mail client does for a mailto link.
- A Workspace tenant that restricts "high-risk" Gmail scopes may let Cluster read and modify but fail on send. Cluster should handle a 403 on send gracefully and fall back to the compose-window route.

### Gaps
- I could not fetch an official statement on whether API-sent messages automatically get the `SENT` label and show in Sent. Widely observed behaviour is yes, but no official URL was retrieved. Verify by inspecting `labelIds` on the response.
- The exact error codes and HTTP statuses the API returns when the daily sending limit is hit were not retrieved from official docs.
- I did not retrieve how bounce NDRs are delivered (they land in the inbox as mailer-daemon messages), only that many bounces can block sending.
- The pre-2026-05-01 per-user quota value is not stated on Google's page.

## Google policy: User Data Policy, Limited Use, restricted-scope verification/CASA, disclosure; Chrome Web Store policies

### Takeaway
Sending uses scopes Cluster already holds, so adding it does not add a new restricted scope. The Google User Data Policy still requires Cluster to disclose "any actions you take on a user's behalf". Material changes in data use need prompt, prominent disclosure and fresh consent. The Chrome Web Store Spam and Abuse policy explicitly forbids sending messages on the user's behalf without letting the user confirm the content. So a per-batch confirmation that shows recipients and body is effectively mandatory. CASA applies to restricted-scope data *stored on or transmitted through servers*. A server-less extension is still subject to restricted-scope app verification.

### Cited Findings
- Limited Use: limit use of data "to providing or improving user-facing features". "All other transfers, uses, or sales of user data are prohibited." — [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- Developers must disclose "any actions you take on a user's behalf". Disclosures "should be prominent and timely". Before accessing newly disclosed data types, apps must "prompt the user to consent to any changes". — [User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- Minimum permissions: "Only request access to the permissions necessary to implement your application's features or services." — [User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- Restricted-scope verification: apps that **store or transmit restricted-scope data on servers** need a security assessment by a Google-approved third party under App Defense Alliance CASA. Reverification and reassessment happen at least every 12 months after LOA approval. Adding a new restricted scope not covered by a prior assessment may require reassessment. The page also advises least privilege: an app that only occasionally sends email should not request full email access. — [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- Exemptions listed: personal use (you plus a few known users), testing status, service-owned data, internal-only Workspace apps. The page does not list an explicit "client-side only" exemption. — [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- Public apps using user-data scopes must complete verification. Restricted-scope data stored on or transmitted through your servers requires a security assessment. — [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes?hl=en)
- Chrome Web Store, Spam and Abuse: extensions must not "send messages on behalf of the user without giving the user the ability to confirm the content". They must not abuse notifications "by sending spam, ads, promotions, phishing attempts, or unwanted messages". — [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- Chrome Web Store: "The outcome of any user interaction should match the reasonable expectations that were set with the user." The policy also requires a single, narrow purpose, and data use limited to "the extension's disclosed single purpose". — [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)

### Inferences
- No new OAuth scope means the consent screen does not change. Google verification probably does not need resubmission just for using `messages.send` under `gmail.modify`. Even so, the verification submission and the privacy policy should be updated to say Cluster sends unsubscribe emails from the user's account on the user's request. That covers the "actions on a user's behalf" disclosure rule. Reviewers judge the stated justification for `gmail.modify`, so sending should appear in it.
- The safest reading of the CWS rule is a confirmation UI before each send or batch. It should show the recipient address(es), subject and body, plus an explicit "Send N emails" action, with no silent background or automatic sends (for example, no auto-unsubscribe on a schedule).
- Whether a server-less extension avoids CASA depends on how Google classifies it (data never leaves the device). The restricted-scope page ties CASA to server storage or transmission, so adding send does not change this. It is not new data handling.

### Gaps
- I found no official Google statement on whether a sending capability under an already-approved `gmail.modify` justification triggers re-review.
- I did not retrieve the Chrome Web Store "Limited Use" / user-data FAQ text about Gmail data specifically.

## Microsoft Graph: Mail.Send requirement, consent behaviour, Exchange Online limits, saveToSentItems

### Takeaway
Both `POST /me/sendMail` and `POST /me/messages/{id}/send` list **Mail.Send** as the only permission, with no higher-privileged alternative, for work, personal and application tokens. Cluster's current `Mail.ReadWrite` can create a draft but cannot send it. Adding `Mail.Send` (delegated) is required for API sending. That triggers incremental consent, and some work tenants will block it unless an admin consents. Both endpoints save to Sent Items, and `sendMail` can opt out via `saveToSentItems: false`. Exchange Online caps are 10,000 recipients per day and 30 messages per minute per mailbox. Outlook.com caps for Microsoft 365 subscribers are 5,000 per day and 1,000 "non-relationship" recipients per day. Free accounts have lower caps that Microsoft does not publish.

### Cited Findings
- `POST /me/sendMail`: least-privileged = Mail.Send for delegated (work or school), delegated (personal Microsoft account) and application. Higher-privileged = "Not available". The body is JSON (`message`, `saveToSentItems`) or base64 MIME with `Content-Type: text/plain`. — [Graph user: sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0) (doc updated 2026-06-19)
- sendMail "saves the message in the Sent Items folder". `saveToSentItems` defaults to true and should be specified only when false. — [Graph user: sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)
- sendMail returns `202 Accepted`. This "doesn't indicate that the request processing has completed". Delivery is subject to Exchange Online limits and throttling. Malformed MIME returns 400 `ErrorMimeContentInvalidBase64String`. — [Graph user: sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)
- `POST /me/messages/{id}/send` (send an existing draft): least-privileged = **Mail.Send** for all three permission types, with no higher alternative. It saves to Sent Items and returns 202. — [Graph message: send](https://learn.microsoft.com/en-us/graph/api/message-send?view=graph-rest-1.0) (doc updated 2025-07-23)
- Entra default: "all users are allowed to consent to applications for permissions that don't require administrator consent". For example, a user "can consent to allow an app to access their mailbox". Microsoft recommends allowing user consent only for apps from **verified publishers**. — [Entra: configure user consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent) (updated 2026-08-04)
- Tenant options: disable user consent entirely; `microsoft-user-default-low` (verified publishers only, and only permissions an admin classifies "low impact"); or `microsoft-user-default-legacy` (any non-admin-consent permission). The admin consent workflow lets users request approval. Changes affect only future consents, and existing grants remain. — [Entra: configure user consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent)
- (Vendor guidance) Security-restrictive tenants often block users from connecting apps that request mail access until an admin grants tenant-wide consent. — [Intric Outlook setup](https://help.intric.ai/de/docs/tools-and-integrations/microsoft/outlook/setup/); [Bigtincan delegated auth](https://help.bigtincan.com/hc/en-us/articles/25044640494989-Delegated-Authentication-for-Email-Integrations)
- Exchange Online, all M365/O365 plans:
  - Recipient rate limit of **10,000 recipients per day**. Once it is reached, the mailbox can't send until the 24h count drops.
  - Message rate limit of **30 messages per minute**. Excess is throttled and carried over to later minutes, and this "will typically not block the sender's account".
  - Recipients per message are customizable up to 1,000.
  - Trial tenants' Tenant External Recipient Rate Limit (TERRL) is capped at 5,000 external recipients per day.
  - `onmicrosoft.com` sender domains are limited to 100 external recipients per org per 24h (NDR 550 5.7.236).
  - Exchange Online "isn't suited to accommodate bulk-mailing scenarios".
  - Source: [Exchange Online limits](https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits) (updated 2026-09-09)
- Outlook.com (consumer):
  - Microsoft 365 subscribers get 5,000 daily recipients, 500 per message and **1,000 daily non-relationship recipients** (people never emailed before).
  - Free accounts have lower limits that "may vary with usage history". New accounts start with a low, temporary quota that rises as credibility builds.
  - Source: [Sending limits in Outlook.com](https://support.microsoft.com/en-us/office/sending-limits-in-outlook-com-279ee200-594c-40f0-9ec8-bb6af7735c2e)
- Third-party estimate (unofficial): free Outlook.com allows about 300 recipients per day. — [Prospeo](https://prospeo.io/s/outlook-email-limits) (treat as unverified)

### Inferences
- With `Mail.ReadWrite`, Cluster can `POST /me/messages` to create a draft in Drafts but cannot send it. A "draft then user clicks Send in Outlook" flow is possible without new scopes, but sending itself needs `Mail.Send`.
- Mail.Send is delegated and normally user-consentable. Personal accounts get an incremental consent prompt. Work tenants on "verified publishers only" will block Cluster unless the MSAL app registration has a verified publisher (MPN), and even then only if the admin classified Mail.Send as low impact. Otherwise an admin must consent. Expect some work users to be unable to enable sending.
- Every unsubscribe address is a non-relationship recipient. On Outlook.com that puts a hard ceiling of 1,000 per day for subscribers and an unknown, much lower ceiling for free accounts. Free and new Outlook.com accounts are the riskiest population for API burst sends.
- Graph's 202 response means a send can "succeed" and still fail later. Cluster can't learn the outcome without reading NDRs from the inbox (possible with Mail.ReadBasic / Mail.ReadWrite).

### Gaps
- I could not read the Graph permissions-reference entries for Mail.Send, Mail.ReadWrite and Mail.ReadBasic directly; the page was too large and the excerpt cut off. The "admin consent required: No" status for delegated Mail.Send is from training knowledge plus the sendMail page, not a verified quote.
- No official numbers exist for free Outlook.com sending limits.
- Graph mailbox throttling (10,000 requests per 10 minutes per mailbox) was not re-verified this session.

## Account safety: burst sends tripping abuse detection; competitor pacing

### Takeaway
No official Google or Microsoft document addresses unsubscribe-tool sends specifically. The documented triggers are many undeliverable messages, high unique-recipient volume, spam complaints and rapid sends to new recipients. Unsubscribe mail hits the first two by design: role addresses that sometimes bounce, and all-new recipients. I found no published pacing figures from Superhuman, Clean Email or Leave Me Alone.

### Cited Findings
- Gmail blocks sending after many undeliverable emails. — [Gmail Help: sending limits](https://support.google.com/mail/answer/22839?hl=en)
- Workspace: exceeding limits can lead to account suspension, and spam senders can be permanently restricted. — [Workspace sending limits](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace?hl=en)
- Outlook.com: limits "may vary with usage history", and new accounts get a low temporary quota. Microsoft advises adding recipients to Contacts and communicating frequently with contacts to raise limits. — [Sending limits in Outlook.com](https://support.microsoft.com/en-us/office/sending-limits-in-outlook-com-279ee200-594c-40f0-9ec8-bb6af7735c2e)
- Exchange Online's per-minute throttle defers sends rather than blocking the account, but it is "not suited" for bulk. — [Exchange Online limits](https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits)
- (Third party) API sending suspensions are often tied to high-volume or unsolicited sending and may affect API sending without affecting the web client. — [Suped](https://www.suped.com/knowledge/email-deliverability/troubleshooting/what-does-authenticated-user-is-not-authorized-to-send-mail-mean-when-using-gsuite-api)
- (Third party, quoted Google support reply) Recipients marking messages as spam can trigger Gmail's automated abuse tracking even under the limits. — via search summary of [vBulletin forum thread](https://www.vbulletin.com/forum/forum/vbulletin-3-8/vbulletin-3-8-questions-problems-and-troubleshooting/325426-sending-via-gmail-suspended-because-of-spam) (low-confidence)
- Leave Me Alone: it uses list-unsubscribe metadata. If there is no link, "we send an email to the sender, using a specific unsubscribe email address". Its help text does not say whether the mail goes from the user's own address. It connects via IMAP and notes senders can take up to 72 hours to process removals. — [Leave Me Alone help: how to unsubscribe](https://help.leavemealone.com/en/start-here/the-basics/how-to-unsubscribe-from-an-email)

### Inferences
- These are conservative design choices, not documented thresholds:
  - Hard per-day caps well under the smallest relevant limit (Workspace trial: 500 unique external; Outlook.com free: unknown).
  - Sequential sends with a few seconds' spacing. Exchange's 30 per minute is a ceiling, not a target.
  - Dedupe by address.
  - Stop on any sending-limit error or a spike of NDRs.
- Short, plain, non-promotional bodies addressed to the listed `mailto:` are unlikely to draw spam complaints, since recipients are list-management robots. Bounces from dead unsubscribe mailboxes are the realistic risk.

### Gaps
- I found no documented incident of an unsubscribe tool getting user accounts suspended.
- I found no published pacing or throttling from Superhuman, Clean Email or Leave Me Alone for mailto unsubscribes. Searches turned up nothing citable.

## Alternative route: prefilled compose window / mailto handler vs API send

### Takeaway
Opening a prefilled Gmail compose window (`https://mail.google.com/mail/?view=cm&fs=1&to=…&su=…&body=…`) or an Outlook compose window needs no send scope. It satisfies the Chrome Web Store "user confirms content" rule by construction, and it puts the send under the provider's normal UI. The costs are one click per message, an undocumented URL format, and broken mobile support. API send allows batch UX but needs Mail.Send on Outlook, explicit confirmation UI and careful pacing.

### Cited Findings
- Gmail compose URL: base `https://mail.google.com/mail/?view=cm&fs=1` with `&to=`, `&cc=`, `&bcc=`, `&su=`, `&body=`. Values should be URL-encoded. — [Airtable community answer (2021)](https://community.airtable.com/t/trying-to-add-cc-bcc-on-button-to-openurl-to-compose-gmail/40265)
- The format is undocumented. The `/u/0/` part can be replaced with an email address to target an account (useful for multi-account users). Older variants redirected elsewhere, and the approach does not work on mobile web. — [Simon Willison TIL](https://til.simonwillison.net/google/gmail-compose-url)
- Gmail does user-agent detection and serves mobile users a different experience, which breaks compose links. — [Mozilla Discourse thread](https://discourse.mozilla.org/t/open-special-gmail-outlook-links-to-compose-a-new-message/144039)
- (Forum) When `body` is prefilled, the signature handling differs. — [Xojo forum](https://forum.xojo.com/t/showurl-mailto-gmail/55198)
- The CWS rule that motivates this route: extensions must not send on the user's behalf "without giving the user the ability to confirm the content". — [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- Graph alternative without Mail.Send: Mail.ReadWrite allows creating drafts (`POST /me/messages`), but sending a draft needs Mail.Send. — [Graph message: send](https://learn.microsoft.com/en-us/graph/api/message-send?view=graph-rest-1.0)

### Inferences
- Compose route pros:
  - No new Outlook scope and no admin-consent friction.
  - Zero policy ambiguity.
  - Mail is sent with the user's signature, alias choice and native Sent placement.
  - Abuse risk is spread by human pacing.
- Compose route cons:
  - One tab and one click per sender, which makes bulk runs tedious.
  - No programmatic success signal.
  - The URL format can change.
  - It fails on mobile, which matters little for a desktop Chrome extension.
- A hybrid seems strongest:
  - Gmail: API send behind a confirmation sheet (no scope change), with the compose URL as a fallback when a Workspace admin blocks high-risk scopes.
  - Outlook: create drafts with the existing Mail.ReadWrite scope and open them in Outlook web for the user to click Send, or add Mail.Send as an opt-in incremental consent.

### Gaps
- I did not retrieve an official Outlook on the web compose deeplink format (e.g. `outlook.office.com/mail/deeplink/compose?to=…&subject=…&body=…`) from Microsoft docs. It needs verification.
- I did not verify whether a generic `mailto:` link opened from an extension routes to Gmail or Outlook web. That depends on the user's registered protocol handler, and no source was retrieved.
