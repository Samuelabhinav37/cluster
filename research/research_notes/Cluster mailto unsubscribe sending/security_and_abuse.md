# Security, privacy and abuse risks of automatically acting on unsubscribe instructions (mailto focus)

Scope: what can go wrong when a client (here Cluster, an on-device Chrome MV3 extension for Gmail and Outlook with no server, seeing headers and authentication results only) sends a List-Unsubscribe mailto message or fires an unsubscribe without a human reviewing it, and what safeguards standards bodies and mailbox providers use. State as of 2026-10-16. Dates are given on older facts. Vendor claims are marked "(vendor)" and kept apart from standards text and independent tests.

## 1. Spam and address validation: does unsubscribing from spam confirm a live address?

### Takeaway
Yes, in principle. The standards text, Spamhaus, Google and documented scam campaigns all treat an unsubscribe (and especially a sent mailto reply) as a liveness signal. The only direct government test (FTC, 2002) found no measurable increase in spam after remove requests, but it also found most remove addresses were dead. So the main harm is not "more spam is guaranteed". It is that the request is wasted on spam, and in targeted scams it confirms the address. No current (2024-2026) independent study measuring the effect was found.

### Cited Findings
- RFC 8058 (Jan 2017, standards track) states that unsubscribing "provides a strong hint to the mailer that the address to which the message was sent was valid", and notes that senders could use it to test addresses, while simpler methods such as image links exist. — [RFC 8058 §6](https://www.rfc-editor.org/rfc/rfc8058.html)
- Spamhaus consumer FAQ: "By sending back a 'remove me' opt-out request you are confirming to the spammer that your address is live." It adds that live addresses are sold "at a premium" and advises "Never Opt-out of lists that you did not Opt-in to in the first place." (undated page, long-standing) — [Spamhaus consumer FAQ](https://www.spamhaus.org/consumer/)
- Google (July 2009 announcement, as quoted by Spam Resource): the Gmail unsubscribe option is shown "only ... for senders that we're pretty sure are not spammers", because spammers cannot be trusted to honor unsubscribes and "might even send you more spam". — [Spam Resource, Gmail list-unsubscribe FAQ, 2016-12-19](https://www.spamresource.com/2016/12/list-unsubscribe-on-gmail-frequently_19.html); same rationale reported by [TechCrunch (2009)](https://techcrunch.com/?p=85998)
- FTC test (2002): investigators sent remove requests in response to 215 spam messages. The FTC Northwest regional director said there was "no evidence" that remove requests produced more spam, but about two-thirds of requests went to addresses that never existed or were no longer in use. — [Techdirt, 2002-04-05](https://archive.techdirt.com/articles/20020405/0935251.shtml); FTC 2002 consumer feature (removal links often did not function; 77 marketers warned) — [FTC spam feature, archived 2004](https://webharvest.gov/peth04/20041018012911/http:/www.ftc.gov/bcp/conline/features/spam.pdf)
- FTC 2004 follow-up on legitimate retailers: 89% of 100 top e-tailers honored all three opt-out requests, 93% honored at least some. — [Chief Marketer](https://www.chiefmarketer.com/most-e-retailers-comply-with-can-spam-ftc)
- CDT 2003 six-month experiment (about 250 dummy addresses, 8,842 spam messages): companies that offered an opt-out choice generally respected it. The study did not isolate unsubscribing from spam as a cause of more spam. — [Network World, 2003](https://www.networkworld.com/article/896001/software-study-answers-why-am-i-getting-all-this-spam.html); report mirror [csrc.nist.rip/spam/bruening.pdf](https://csrc.nist.rip/spam/bruening.pdf)
- Online Trust Alliance audit of top 200 e-commerce brands: 98% compliant with US/Canadian unsubscribe rules (vs 90% in 2014). Shows legitimate senders mostly honor unsubscribes. — [emailkarma.net summary of OTA study](https://emailkarma.net/ota-releases-unsubscribe-study/)
- Documented abuse (2019-2021): a long-running "fake unsubscribe" scam sends a bare "do you want to subscribe or unsubscribe?" email. The button opens a pre-filled mailto to a batch of attacker-controlled addresses (one 2019 variant used roughly 15-20 addresses on a free dynamic DNS domain), so sending it confirms the address. BleepingComputer reported that a test account was flooded with spam within days of responding. Details are via secondary write-ups; the BleepingComputer original was not retrieved. — [Rewterz threat alert](https://rewterz.com/rewterz-news/rewterz-threat-alert-beware-of-emails-asking-you-to-confirm-your-unsubscribe-request); [HKCSS IT security, 2021-06-08, citing BleepingComputer](https://itsecurity.hkcss.org.hk/watch-out-these-unsubscribe-emails-only-lead-to-further-spam/); [Cyware](https://social.cyware.com/news/new-phishing-scam-asks-users-to-confirm-unsubscribe-request-eca38fc0)

Government and provider guidance on suspicious mail:
- CISA: verify unexpected senders independently, do not click links or download attachments in such emails, and report to IT or the email provider. No CISA page specific to unsubscribe links was found. — [search summary; CISA guidance as reported](https://www.msspalert.com/news/phishing-emails-mimic-department-of-homeland-security-alerts)
- NCSC (UK): if in doubt, do not open the email or click links; forward it to the Suspicious Email Reporting Service. No NCSC page specific to unsubscribe was found. — [NCSC report scam website](https://www.ncsc.gov.uk/collection/phishing-scams/report-scam-website)
- Google Help (Manage subscriptions, rolling out since July 2025): unsubscribing routes the sender's new mail to Spam, can take days, and "some senders may direct you to their website", with "Block instead" offered. Blocking does not unsubscribe. — [Gmail Help 15621070](https://support.google.com/mail/answer/15621070)
- Microsoft (MC1112455, Jul-Sep 2025, Outlook for Android): when a user reports junk, Outlook offers unsubscribe "if the sender supports it", otherwise block. No change to existing junk/phishing rules. — [Message Center MC1112455](https://mc.merill.net/message/MC1112455)
- Consumer-security vendor advice (vendor): do not click anything in a suspicious email, including unsubscribe; mark as spam instead (attributed to NIST by the vendor, not verified). — [Total Defense](https://www.totaldefense.com/?p=18912)

### Inferences
- A sent mailto is a stronger liveness signal than an HTTPS GET or POST. It carries the user's real address in From and lands in a mailbox the sender reads at leisure, while a POST only proves that someone holding the token acted.
- Since the main providers show unsubscribe only for "trusted" senders and route others to Spam/Block, the consistent industry pattern is: unsubscribe for senders that look legitimate, report/block for the rest. Cluster's "not in Spam" condition matches this.

### Gaps
- No 2020s independent study was found that measures whether unsubscribing from spam increases spam volume. The FTC 2002 result is old and small (215 requests).
- No official FTC page (2024-2026) specifically about unsubscribe was retrieved. Current FTC wording is unconfirmed.
- The BleepingComputer original for the fake-unsubscribe campaign was not retrieved. Its date and numbers come from secondary sources.

## 2. Malicious List-Unsubscribe headers

### Takeaway
The mailto URI is a sender-controlled template, and RFC 6068 says a client "SHOULD NOT send a message based on a 'mailto' URI without" showing the user the full decoded message and getting approval. RFC 2369 also requires user confirmation. Automatic sending therefore departs from both standards, and it needs strict sanitising: To only, no Cc/Bcc/attach/unknown hfields, and the subject/body treated as untrusted. Web unsubscribe links carry measurable malicious-site risk (DNSFilter 2025). The mailto attack surface is the To address and the hfields.

### Cited Findings
Standards on mailto handling:
- RFC 6068 §7: a mailto URI is only a template, and its content may be hidden. A client "SHOULD NOT send a message based on a 'mailto' URI without" showing the user the complete decoded message, including all headers, and getting approval, making clear an email is about to be sent. Some headers are inherently unsafe, and fewer URI-derived headers means less risk. The listed harms include messages that break delivery laws, identify the sender to an unwanted third party, incur charges, or trigger damaging actions. — [RFC 6068](https://www.rfc-editor.org/rfc/rfc6068.html)
- RFC 6068: originator, routing, trace and MIME fields in the URI MUST be ignored. Unrecognised or inconsistent fields should be treated as especially suspect. A user agent should not create a message if any header is dangerous, or may use only a safe subset. Subject and body are "considered safe" in general. Bcc in a URI need not produce a visible header (so a hidden recipient is possible). — [RFC 6068](https://www.rfc-editor.org/rfc/rfc6068.html)
- RFC 2369 (1998) §5: "the user must have a chance to confirm any action before it is executed". For mailto, clients may build the message without sending so the user can review it. Clients should not support URL schemes that could compromise the system (e.g. file://). Appendix B: confirmation should name the destination and command. The client should use the subscribed address. Use only one listed URL, falling back only on failure. — [RFC 2369](https://www.rfc-editor.org/rfc/rfc2369.html)
- RFC 8058: receivers "MUST NOT perform a POST on the HTTPS URI without user consent". The POST body is fixed to one key/value pair, so attackers cannot use it to fill arbitrary forms. — [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html)

Hfield injection and client bugs:
- Ruhr University Bochum (2020): 5 of 20 tested mail clients (incl. Thunderbird, Evolution, KMail, HCL Notes, Pegasus) could be made to attach local files via a mailto `attach=`-style parameter. That gives exfiltration through a mailto link. — [Linux Adictos summary](https://www.linuxadictos.com/en/some-mail-clients-are-vulnerable-to-manipulation-attacks-when-using-mailto.html); [study PDF mirror](https://www.edumaps.de/media/2020-08-18-email-clients-vulnerable-to-attacks-via-mailto-links.pdf)
- CVE-2020-27748 (xdg-email silently adds attachments from mailto URIs passed to Thunderbird) — [CIRCL CVE](https://cve.circl.lu/cve/CVE-2020-27748). CVE-2026-13324 (GNOME Geary opens compose with a local file attached from a crafted mailto `attach` parameter; patched) — [OpenCVE](https://app.opencve.io/cve/CVE-2026-13324)

Third-party targets, harassment, mail-bombing:
- The fake-unsubscribe campaign above is a real case of a mailto pointing at attacker-chosen third-party addresses, with multiple recipients pre-filled. — [Rewterz](https://rewterz.com/rewterz-news/rewterz-threat-alert-beware-of-emails-asking-you-to-confirm-your-unsubscribe-request)
- List operators report forged unsubscribe mail, i.e. mailto commands sent by a party other than the subscriber. A Sympa maintainer advised against listname-unsubscribe aliases because forged mail could unsubscribe members. This shows that a mailto command endpoint can be triggered by anyone who can send mail. — [Sympa list, 2010-07](https://lists.sympa.community/arc/en/2010-07/msg00081.html); [Suped, 2025](https://suped.com/email-deliverability/answers/can-you-rely-on-the-from-address-when-receiving-mailto-unsubscribes)

Malicious web unsubscribe links (DNSFilter 2025):
- DNSFilter (vendor; reported via the Wall Street Journal, June 2025): about one in every 644 clicks on links with "unsubscribe" in the URL led to a potentially malicious/risky site. DNSFilter's own X post words it as clicks on URLs containing "unsubscribe", which is narrower than "unsubscribe links". Methodology, sample and time frame were not published in the coverage found. CTO TK Keanini: "I trust my email client, but I don't trust what's inside the email." — [eSecurity Planet, 2025-06-17](https://www.esecurityplanet.com/news/unsubscribe-buttons-could-be-a-trap/); [La Nación, 2025-06-26](https://www.lanacion.com.ar/tecnologia/cancelar-la-suscripcion-en-los-mails-una-nueva-forma-de-estafa-digital-nid26062025/); [Popular Science](https://www.popsci.com/?p=703102)
- Coverage recommends the client's built-in (header-based) unsubscribe over body links, avoiding any unsubscribe page that asks for a password or personal data, and using report-spam/block for untrusted senders. — [eSecurity Planet](https://www.esecurityplanet.com/news/unsubscribe-buttons-could-be-a-trap/)
- Fake "confirmation" pages: ITRC described a fake unsubscribe "confirmation" that asks for email and name (identity-crime harvesting). Others lead to fake login pages. — [ITRC](https://www.idtheftcenter.org/?p=8397) (page failed to load in this session; description via search summary); [eSecurity Planet](https://www.esecurityplanet.com/news/unsubscribe-buttons-could-be-a-trap/)

### Inferences
- Premium/odd schemes: RFC 6068 lists "incur charges" as a harm, and RFC 2369 bans system-compromising schemes. Cluster should accept only `mailto:` and `https:` and drop tel:, sms:, file:, javascript:, data:, http: and anything else. This is an inference from the RFCs. No real-world premium-scheme List-Unsubscribe incident was found.
- Own-domain addresses: a mailto to the user's own domain (or own address, or a role address like postmaster@ at the user's org) is a classic way to cause internal harassment, loops or social-engineering of colleagues. No incident report was found. Treat as an inferred risk and block it outright.
- Hfields: for auto-send, keep exactly one To address. Drop cc, bcc, to= (extra recipients), attach/attachment, in-reply-to, references, and any unknown hfield (or refuse to send if they are present). Cap subject/body length, strip CR/LF (header injection), and consider replacing the body with a fixed string instead of the sender's `body=`. RFC 6068 permits a "subset of headers" approach.
- Multiple recipients in To (comma-separated addr-spec) is how the fake-unsubscribe campaign worked. Auto-send should require exactly one addr-spec.
- Only the To address and a "subject=unsubscribe"-style subject are needed in practice. Legitimate ESP mailtos rarely depend on body content (inference; ESP docs show subject-only examples, e.g. [Mailtrap](https://mailtrap.io/blog/list-unsubscribe-header/)).

### Gaps
- DNSFilter's primary report and methodology were not found on dnsfilter.com. The 1-in-644 figure is vendor data relayed by press.
- No published incident was found of List-Unsubscribe mailto being used to make users mail-bomb a third party at scale, or of premium-rate schemes. These remain theoretical but are consistent with the RFC harm list.
- No academic paper was found that measures malicious List-Unsubscribe header prevalence specifically.

## 3. Privacy leaks from a sent unsubscribe email

### Takeaway
A mailto unsubscribe reveals the user's real address, and usually display name, send time with timezone offset and client-generated headers, to the list operator and any intermediaries. The sender can also bind it to a specific message or recipient through tokens in the mailto local part or subject. That is intended for legitimate ESPs and is a tracking or validation channel for bad actors. No source was found confirming exactly which client headers Gmail/Outlook add on webmail or API sends.

### Cited Findings
- RFC 6068 §7: mail sent via a mailto can be logged by the sending site, the recipient's site and intermediaries, and read if unencrypted. Unwanted identification of the sender to a third party is a listed harm. — [RFC 6068](https://www.rfc-editor.org/rfc/rfc6068.html)
- RFC 2369: clients should send from the subscribed address. — [RFC 2369](https://www.rfc-editor.org/rfc/rfc2369.html)
- Apple Mail (Spam Resource, 2023-02-07): sends from the user's account with an empty subject. The body says Apple Mail sent it to unsubscribe and quotes the original message's subject. A copy is saved in Sent. No reputation/auth gating was observed, only a user confirmation dialog ("Mail will send a message from (you)..."). — [Spam Resource Apple FAQ](https://www.spamresource.com/2023/02/faq-list-unsubscribe-on-apple-mail-on.html)
- ESPs embed recipient/message identifiers in mailto addresses. Mapp shows placeholders for group, message and contact IDs in the mailto. Platform domains appear in List-Unsubscribe (e.g. hubspotemail.net, createsend.com). — [Mapp docs](https://documentation.mapp.com/1.0/en/list-unsubscribe-headers-12575935.html); [Newsletrix, 2026-07-14](https://newsletrix.com/blog/how-to-tell-what-platform-a-newsletter-uses)
- RFC 8058 advises senders to make unsubscribe URIs hard to forge with an opaque token. — [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html)

### Inferences
- What leaks in a Cluster-sent mailto: the From address and display name (from the Gmail/Outlook account), a Date header with timezone offset, Message-ID (which can reveal the provider), and whatever subject/body Cluster writes. Cluster should not copy the original subject into the body (Apple does) and should send a fixed minimal body. It should also not add an extension-identifying header.
- IP: on Gmail/Outlook webmail or API sends the user's IP is generally not exposed to recipients. This is not verified with a cited source in this session; see Gaps.
- Token-bearing local parts (e.g. unsubscribe-<id>@...) mean the sender learns exactly which recipient/message acted, even if the From is a forwarding alias. For a spammer this is perfect validation. That is another reason to gate on sender legitimacy, not on token presence.
- The sent message lands in the user's Sent folder, a visible artifact. Cluster may want to label or explain it. Gmail API sends also show in Sent (inference).

### Gaps
- No primary source retrieved on which headers Gmail web/API and Outlook add to outgoing messages (e.g. whether X-Originating-IP is stripped). This should be verified by inspecting a sent test message.

## 4. Provider gating rules (Gmail, Yahoo, Outlook, Apple) and authentication requirements

### Takeaway
Gmail and Yahoo gate the unsubscribe UI on sender reputation and authentication, and RFC 8058 makes DKIM coverage of the headers a precondition for one-click. Outlook ties unsubscribe to report-junk and to "sender supports it". Apple Mail shows unsubscribe for any valid mailto header but always asks the user to confirm. No provider publishes a rule that the mailto host must match the From domain.

### Cited Findings
- Gmail (Google, 2009, quoted): unsubscribe is shown only for senders "we're pretty sure are not spammers". Return Path (quoted, c. 2016): Gmail and Outlook.com use List-Unsubscribe for "senders with good sending reputations". — [Spam Resource, 2016-12-19](https://www.spamresource.com/2016/12/list-unsubscribe-on-gmail-frequently_19.html)
- Gmail reputation factors cited by deliverability vendors (vendor): poor domain reputation of From, Return-Path and DKIM domains, complaints, failing authentication and low engagement can hide the button. — [Suped](https://suped.com/email-deliverability/answers/why-does-the-unsubscribe-button-not-always-appear-in-gmail-emails); [Batch docs](https://doc.batch.com/guides-and-best-practices/email-deliverability/list-hygiene-and-recipients-management/why-doesnt-gmail-always-show-the-unsubscribe-button-in-your-marketing-emails)
- Google documentation (Verified Sender pilot): List-Unsubscribe must be DKIM-signed. List-Unsubscribe-Post is required for HTTP(S) and optional for MAILTO. Methods are favoured in the sender's listed order. — [Google support 12811169](https://support.google.com/mail/answer/12811169)
- RFC 8058: senders MUST apply a valid DKIM signature covering List-Unsubscribe and List-Unsubscribe-Post. Without one, receivers "SHOULD NOT offer a one-click unsubscribe". — [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html)
- Yahoo (vendor/secondary; senders.yahooinc.com not retrieved): button visibility depends on reputation and engagement even with correct headers. SPF+DKIM+DMARC expected. Unsubscribes to be honored within 2 days. — [Suped on Yahoo](https://www.suped.com/knowledge/email-deliverability/troubleshooting/why-is-list-unsubscribe-not-showing-in-yahoo-webmail); [Resend docs](https://resend.com/docs/knowledge-base/how-do-i-avoid-yahoos-spam-folder)
- Outlook: report-junk + unsubscribe "if the sender supports it" (Android, Jul-Sep 2025). Microsoft's criteria are not published. A Jan 2025 Microsoft Q&A thread shows a sender with valid headers whose button did not appear in Outlook. — [MC1112455](https://mc.merill.net/message/MC1112455); [Microsoft Q&A](https://learn.microsoft.com/en-au/answers/questions/2142228/unsubscribe-button-is-not-visible-in-outlook-clien)
- Apple Mail: banner shown when a correct mailto List-Unsubscribe exists. No reputation/auth gating was observed. HTTP and RFC 8058 POST appear unsupported (as of 2023). User confirmation is always required. — [Spam Resource, 2023-02-07](https://www.spamresource.com/2023/02/faq-list-unsubscribe-on-apple-mail-on.html). An iOS 26 discussion exists, but its contents were not retrieved — [Movable Ink](https://movableink.com/blog/list-unsubscribe-header-to-use-or-not-to-use-in-ios-26)

### Inferences
- Every provider that auto-acts or shows a one-tap control relies on server-side reputation data that Cluster lacks. Cluster's substitute signals are the provider's own verdicts: not in Spam/Junk; Gmail showing its native unsubscribe (if detectable); Outlook not flagging it; plus authentication results.
- Apple shows that a mailto-only, ungated control is acceptable when a confirmation dialog exists. Ungated *automatic* sending has no precedent in the providers reviewed.

### Gaps
- Gmail's, Yahoo's and Microsoft's actual gating thresholds are unpublished. senders.yahooinc.com and Google's current sender-guidelines FAQ were not retrieved in this session.
- No source was found on whether Gmail's own mailto unsubscribe sends are rate-limited or gated differently from HTTPS.

## 5. Cluster's planned gate: evidence for and against each part; ESP unsubscribe domains

### Takeaway
"Not in Spam" and "DKIM/DMARC pass aligned with From" are well supported (provider practice, RFC 8058). The rate limit is supported by inference (account sending limits, damage containment). A strict "mailto host must equal the From or DKIM domain" rule is not a published provider rule and would reject many legitimate ESP sends, because ESPs put unsubscribe mailboxes on their own domains. Matching against the DKIM d=, Return-Path/envelope domain, or a known-ESP allowlist is needed.

### Cited Findings
- Not in Spam: Gmail, Outlook and Google's help steer suspicious/spam mail to block/report rather than unsubscribe. — [Gmail Help](https://support.google.com/mail/answer/15621070); [MC1112455](https://mc.merill.net/message/MC1112455); [Spamhaus](https://www.spamhaus.org/consumer/)
- DKIM coverage: RFC 8058 and Google require List-Unsubscribe to be DKIM-signed. That proves the header was not added by a forwarder or attacker after signing, but only if the signature's h= covers it. — [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html); [Google 12811169](https://support.google.com/mail/answer/12811169)
- DMARC/authentication does not prove legitimacy of intent: authentication "primarily address[es] email spoofing", not trustworthiness (vendor). — [Suped](https://suped.com/email-deliverability/answers/can-you-rely-on-the-from-address-when-receiving-mailto-unsubscribes)
- ESP domains seen in List-Unsubscribe or Return-Path headers (vendor reference, 2026-07-14): Mailchimp (mailchimp.com), Constant Contact (constantcontact.com), Campaign Monitor (createsend.com in List-Unsubscribe), HubSpot (hubspotemail.net in Return-Path and List-Unsubscribe), Brevo (list-unsubscribe.me sometimes; DKIM sendinblue.com/brevo.com), SendGrid (sendgrid.net Return-Path), Amazon SES (amazonses.com Return-Path), ActiveCampaign (DKIM activehosted.com), Kit/ConvertKit (DKIM convertkit-mail.com), Klaviyo (klaviyomail.com), Marketo (mktomail.com), Pardot (pardot.com), Customer.io (customer.io), Braze (braze.com/appboy.com). — [Newsletrix](https://newsletrix.com/blog/how-to-tell-what-platform-a-newsletter-uses)
- Prior Cluster notes also list mcsv.net and sendgrid.net as ESP DKIM/Return-Path domains (marked there as unsourced inference). — local: `research_notes/Cluster sender algorithm deep dive/bulk_sorting_and_screening.md`
- SendGrid and Amazon SES insert or override List-Unsubscribe headers themselves when subscription management is enabled. The address then belongs to the ESP, not the brand. SES's one-click design assumes SES receiving is enabled for the mailto address. — [SendGrid support](https://support.sendgrid.com/hc/en-us/articles/20631133325467-How-to-Add-List-Unsubscribe-and-List-Unsubscribe-Post-Headers-to-Comply-with-MailBox-Provider-Requirements); [AWS SES docs](https://docs.aws.amazon.com/ses/latest/DeveloperGuide/sending-email-subscription-management.html); [AWS blog](https://aws.amazon.com/blogs/messaging-and-targeting/using-one-click-unsubscribe-with-amazon-ses/)
- Order preference: clients should use one listed URI and fall back only on failure (RFC 2369). Google honors sender order. Older tests reportedly showed mailto-first harmed RFC 8058 handling at some providers (vendor). — [RFC 2369](https://www.rfc-editor.org/rfc/rfc2369.html); [Google 12811169](https://support.google.com/mail/answer/12811169); [Suped](https://www.suped.com/email-deliverability/answers/does-the-order-of-mailto-and-https-in-the-list-unsubscribe-header-matter)

### Inferences
- Recommended domain relation (inference): accept the mailto host if its registrable domain (PSL eTLD+1) equals any of: the aligned From domain, an aligned-or-passing DKIM d= domain whose signature covers List-Unsubscribe, the Return-Path/envelope domain that passed SPF, or an entry in a curated ESP allowlist (seed list above, plus mcsv.net, list-manage.com, sendgrid.net, amazonses.com, mailgun.org, sparkpostmail.com, rsgsv.net, exacttarget.com, etc.; the seed beyond Newsletrix is unverified and should be confirmed from real headers).
- Domains that would fail a strict From/DKIM match: any brand that uses an ESP without custom DKIM (DKIM d= is the ESP), and brands whose ESP mailbox domain differs from both the signing and From domains (e.g. Campaign Monitor createsend.com, Brevo list-unsubscribe.me, HubSpot hubspotemail.net per Newsletrix).
- The DKIM-covers-List-Unsubscribe check is the single most valuable gate. A header injected by an intermediary, or by a sender whose DKIM key doesn't sign it, is untrusted. Cluster sees Authentication-Results but may need the raw DKIM-Signature h= list to confirm coverage.
- Prefer HTTPS one-click (RFC 8058 POST) over mailto when both exist and are DKIM-covered. It reveals less (no From address), produces no Sent-folder artifact, and cannot be redirected to a third-party mailbox. Mailto is the fallback.
- Rate limit: protects against a malicious batch, keeps volume far below account sending caps, and limits damage if the gate logic has a bug. Suggest per-day caps and a per-sender-domain cap of one send.

### Gaps
- No published provider rule was found requiring the mailto host to match From or DKIM. The domain-match idea is Cluster's own design.
- Exact ESP mailto local-part and host formats (e.g. Mailchimp's) were not confirmed from primary docs. Inspecting real headers in a test mailbox is recommended.

## 6. Account reputation risk to the user: bounces, spamtraps, limits

### Takeaway
Auto-sent mailto messages go out from the user's own Gmail/Outlook account, so bounces, sends to dead or trap addresses and bursts can count against that account's sending limits and possibly its reputation. Published evidence on consumer-account effects is thin and mostly vendor-sourced.

### Cited Findings
- FTC 2002: about two-thirds of remove requests to spammers went to addresses that never existed or were no longer in use, i.e. they would bounce. — [Techdirt](https://archive.techdirt.com/articles/20020405/0935251.shtml)
- Gmail sending limits (vendor reports; Google page not retrieved): about 500 recipients/day for free Gmail and about 2,000 for Workspace, rolling 24h, shared across all clients and add-ons. High bounce rates reportedly lead to throttling (anecdotal). — [Mailmeteor](https://mailmeteor.com/blog/email-sending-limits); [GMass](https://www.gmass.co/blog/gmail-reached-a-limit-bounces-how-to-avoid/)
- RFC 6068 says mailto handlers should ensure the SMTP envelope return path is set and correct, so bounces return to the user. — [RFC 6068](https://www.rfc-editor.org/rfc/rfc6068.html)
- Spamhaus (sender-side guidance as summarised by Listrak, vendor): mailing retired/invalid addresses is a list-hygiene failure associated with traps. — [Listrak](https://listrak.com/blog/spamhaus-best-practices)

### Inferences
- Spamtrap risk for a single user sending occasional one-to-one unsubscribe mails is likely low, but a malicious header could point at a known trap or a blocklist operator's address. The domain-relation gate and "one send per sender domain" cap mitigate this.
- Cluster should watch for bounces (NDRs in the inbox after a send) and stop or blacklist that sender. Repeated bounces should pause auto-send globally.

### Gaps
- No primary Google/Microsoft source was retrieved stating how bounces or trap hits from a consumer account affect its reputation.
- No data was found on spamtrap addresses being used in List-Unsubscribe headers.
