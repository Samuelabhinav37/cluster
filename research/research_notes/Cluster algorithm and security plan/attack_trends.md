# Email Phishing, Spam and Scam Attack Trends (2024-2026): What Consumers Receive and What Metadata Betrays It

Research method note: about 20 searches. Direct fetches of docs.apwg.org and blog.barracuda.com failed (DNS errors through the proxy), so several figures come from search-result excerpts of primary pages or from secondary coverage. Each finding says which. Dates are noted for all numbers older than 2025.

## Q1. Volumes and shares: how big is email phishing and which brands/sectors are hit?

### Takeaway
Phishing is still a top initial-access vector: about 15-16% of breaches in DBIR 2025, and the top vector in Talos IR for most quarters of 2025 to Q1 2026. Microsoft is the most impersonated brand by a wide margin (about 23-25% of brand phishing). For consumers, the money is in scams more than credential theft. IC3 2025 losses were $20.9B, with BEC at about $3.05B. FTC 2025 recorded $15.9B in fraud losses, but text and social media, not email, are the top consumer contact channels.

### Cited Findings
**Verizon DBIR**
- DBIR 2025: initial access vectors were stolen credentials 22%, vulnerability exploitation 20%, phishing 16% (another summary says 15%). The human element was involved in 60% of breaches, down from 68% in DBIR 2024. Within social engineering, phishing was 57%, pretexting 30% and prompt-bombing 14%. These are secondary summaries, not the PDF — [ClearanceJobs](https://news.clearancejobs.com/2025/04/30/60-of-breaches-still-tied-to-human-mistakes-what-the-2025-dbir-means-for-fsos-and-leaders/); [ManageEngine](https://www.manageengine.com/products/desktop-central/blog/access-vectors-and-endpoint-risks.html); [Keepnet](https://keepnetlabs.com/blog/2025-verizon-data-breach-investigations-report.)
- DBIR 2026: covers more than 31,000 incidents and 22,000+ breaches. Social engineering was about 16-17% of breaches and the human element was involved in 62%. Vulnerability exploitation, at 31%, became the top initial access vector. About 41% of social-engineering breaches used non-email vectors (voice, SMS). Mobile social engineering's median success rate was about 40% higher than email-only phishing — [Verizon DBIR 2026 exec summary](https://www.verizon.com/business/resources/executivebriefs/dbir-2026-executive-summary.pdf); [Retarus](https://www.retarus.com/blog/en/?p=11792); [Keepnet](https://keepnetlabs.com/blog/2026-verizon-data-breach-investigations-report). Sources differ slightly (16% vs 17%).
- DBIR 2026 reportedly puts a callback/TOAD variant at about 5% of the gateway attack mix. This is single-source, from a vendor blog — [IRONSCALES](https://ironscales.com/threat-intelligence/geek-squad-toad-callback-hotmail-jpeg-invoice-no-links)

**Cisco Talos IR quarterly trends**
- Q1 2025: phishing was initial access in about 50% of engagements. Vishing was more than 60% of the phishing engagements — [Talos Q1 2025](https://blog.talosintelligence.com/ir-trends-q1-2025/)
- Q2 2025: phishing remained the top vector, at 33% of engagements. 75% of phishing engagements involved compromised internal or trusted-partner email accounts — [Talos Q2 2025](https://blog.talosintelligence.com/ir-trends-q2-2025/)
- Q3 2025: public-facing app exploitation was over 60% (ToolShell/SharePoint). Post-exploitation phishing from compromised valid accounts increased — [Talos Q3 2025](https://blog.talosintelligence.com/ir-trends-q3-2025/)
- Q4 2025: phishing was the #2 vector. Compromised legitimate accounts were used for internal phishing — [Talos Q4 2025](https://blog.talosintelligence.com/ir-trends-q4-2025/)
- Q1 2026: phishing was again the top vector, at over a third of engagements — [Talos CTIR index](https://blog.talosintelligence.com/category/ctir-trends/)

**APWG Phishing Activity Trends**
- Q2 2025: 1,130,393 phishing attacks, the highest quarter since Q2 2023. The most targeted sectors were Financial/Payment, SaaS/Webmail and e-commerce. 1,642 brands were targeted with QR codes; DHL was the most impersonated in QR attacks, with Microsoft close behind — [APWG Q2 2025](https://docs.apwg.org/reports/apwg_trends_report_q2_2025.pdf); [APWG Q4 2025](https://docs.apwg.org/reports/apwg_trends_report_q4_2025.pdf) (search excerpt only; the PDF fetch failed)
- Q3 2025: Mimecast detected 716,306 malicious QR codes used for phishing, up 13% from 635,672 in Q2 — [APWG Q3 2025](https://docs.apwg.org/reports/apwg_trends_report_q3_2025.pdf)
- Q4 2025: 866 unique brands were targeted. It is unclear whether this counts QR attacks only — [APWG Q4 2025](https://docs.apwg.org/reports/apwg_trends_report_q4_2025.pdf)
- The APWG 2025 year-in-review headline says scams "explode" via social media, SMS, email and QR codes — [Newswire](https://www.newswire.com/view/content/apwg-year-in-review-scams-explode-via-social-media-sms-email-and-qr-22733100)
- Older (APWG Q4 2024): .top is linked to toll-road scams, mostly delivered by SMS — via [Spamhaus](https://info.spamhaus.com/domain-reputation-updates)

**Check Point brand phishing**
- Q2 2025: Microsoft 25%, Google 11%, Apple 9%, Spotify 6% (back in the top 10 for the first time since 2019), Adobe 4%, LinkedIn 3%, Amazon/Booking/WhatsApp/Facebook 2% each. By sector: Technology first, then Social Networks, then Retail — [Check Point](https://blog.checkpoint.com/research/phishing-trends-q2-2025-microsoft-maintains-top-spot-spotify-reenters-as-a-prime-target)
- Q2 2026: Microsoft 22.6% (about 23%), LinkedIn 11.6%, Google 6.7%, Apple 5.8%, Amazon 5.2%. ChatGPT entered the top 10 for the first time, with fake "ChatGPT Plus payment failed" billing lures that harvest card data. By sector: Technology, then Social Networks, then Banking — [Check Point Q2 2026](https://blog.checkpoint.com/research/which-brands-are-impersonated-most-inside-the-q2-2026-brand-phishing-report); [Infosecurity](https://infosecurity-magazine.com/news/chatgpt-most-impersonated-brands)

**FBI IC3 2025 (released April 2026; figures via secondary sources)**
- About 1,008,597 complaints and $20.877B in losses (up 26% from $16.6B in 2024). BEC: about $3.05B from 24,768 complaints. Investment fraud $8.65B; tech-support fraud $2.13B. New AI-related category: about 22,000 complaints and $893M — [SpyCloud](https://spycloud.com/blog/fbi-internet-crime-report-2025/); [dmarcian](https://dmarcian.com/fbi-internet-crime-report-2025/); [MacMyths](https://macmyths.com/cybercrime-losses-jumped-26-to-20-9-billion-in-2025-fbi-says-but-scams-drove-most-of-the-increase/)
- Phishing/spoofing: 191,561 complaints in 2025 vs 193,407 in 2024, and about 19% of all complaints, the most-reported category. Losses rose from $70M to $215.8M — [SpyCloud](https://spycloud.com/blog/fbi-internet-crime-report-2025/); [dmarcian](https://dmarcian.com/fbi-internet-crime-report-2025/)
- BEC, phishing and government impersonation combined exceeded $4B, up 46% — [Red Sift](https://redsift.com/es/blog/fbi-ic3-2025-report-email-fraud) (this framing is Red Sift's own)
- Older (2023): sextortion, including romance, was reported more than 48,000 times to the FBI — [Newtown PA Now](https://newtownpanow.com/2025/02/20/sextortion-email-scam-targets-bucks-countians/)

**FTC Consumer Sentinel 2025**
- About 3M fraud reports and $15.9B in losses (a record). Imposter scams were the #1 category for the fifth year: more than 1M reports and over $3.5B. Business impersonators accounted for about $1B (bank impersonators the largest share) and government impersonators about $920M. Text was the #1 reported contact method; social media had the highest aggregate losses — [FTC JEC testimony](https://www.ftc.gov/news-events/news/press-releases/2026/03/ftc-testifies-joint-economic-committee-agencys-efforts-combat-fraud); [FTC testimony PDF](https://www.ftc.gov/system/files/ftc_gov/pdf/ftc-testimony-jec-hearing-on-the-rising-scam-economy.pdf); [Bitdefender](https://www.bitdefender.com/en-au/blog/hotforsecurity/americans-lost-3-5-billion-imposter-scams-ftc)

**Proofpoint Human Factor 2025 Vol. 2**
- About 4.2M QR-code phishing attacks in H1 2025. Malicious URLs were about 4x more prevalent than malicious attachments. 3.7B URL-based credential-phishing attacks. ClickFix URL campaigns rose about 400% year over year. About 55% of suspected smishing texts contained URLs — [CXOToday](https://cxotoday.com/media-coverage/new-proofpoint-report-reveals-sharp-rise-in-url-based-threats-400-spike-in-clickfix-malware-campaigns-and-4-2m-qr-code-attacks/); [SC World](https://www.scworld.com/news/clickfix-phishing-links-increased-nearly-400-in-12-months-report-says) (secondary)

**KnowBe4 Phishing Threat Trends 2025 (Defend ICES telemetry, Sep 2024 to Feb 2025)**
- Phishing emails rose 17.3% over the previous six months. 57.9% came from compromised accounts, and 11.4% of those came from within the supply chain. 76.4% of attacks had at least one polymorphic feature (2024). 82.6% showed some AI use. Ransomware payloads rose 22.6% — [KnowBe4](https://blog.knowbe4.com/key-takeaways-from-the-2025-phishing-threat-trends-report); [KnowBe4 press](https://www.knowbe4.com/press/new-knowbe4-report-reveals-a-spike-in-ransomware-payloads-and-ai-powered-polymorphic-phishing-campaigns). The press release words the 57.9% figure differently.

**Cloudflare (older)**
- 2023 Phishing Threats Report (13B emails, May 2022 to May 2023): deceptive links were in about 35.6% of threats. Brand impersonation and identity deception were also top tactics — [KnowBe4 summary](https://blog.knowbe4.com/deceptive-links-brand-impersonation-identity-deception-top-phishing-tactics); [Bolster](https://bolster.ai/blog/phishing-threats). No 2025 Cloudflare numbers found.

### Inferences
- For a consumer Gmail/Outlook extension, the brand list should lead with Microsoft, Google, Apple, LinkedIn, Amazon, PayPal, Spotify, Netflix-type subscriptions, ChatGPT/OpenAI, banks, and DHL/postal/USPS/toll agencies. The last group is mostly SMS-delivered but also appears in email.
- Consumer losses are dominated by imposter, tech-support and investment scams, not credential theft. Callback/fake-invoice and sextortion lures matter more to consumers than to enterprises.

### Gaps
- Could not read the APWG PDFs in full: no TLD distribution or BEC wire-amount stats from APWG Q3/Q4 2025, and no 2026 quarters.
- No Microsoft Digital Defense Report 2025 email volume figures beyond the AI click-rate numbers in Q2.
- The 2025 Cloudflare, Abnormal, Barracuda annual, SlashNext, Egress and Unit 42 email reports were not retrieved. Barracuda fetches failed.
- FTC contact-method share for email specifically is not in the summaries found; it needs the Consumer Sentinel Data Book.

## Q2. Techniques: share of each, whether it passes authentication, and which metadata cues remain

### Takeaway
The fastest-growing and most damaging techniques pass SPF/DKIM/DMARC because they come from real infrastructure: abused SaaS (PayPal invoices, DocuSign, Google/Microsoft shares) and compromised accounts, which were 57.9% of phishing in KnowBe4 telemetry and 75% of Talos Q2 2025 phishing cases. Authentication alone is a weak signal, so the cues that remain are relational: display name vs. sender, an unfamiliar sender for a given brand, phone numbers, attachment types (SVG/HTML/PDF), new-gTLD or new domains, reply-to mismatch, and lure-subject patterns.

### Cited Findings
**Adversary-in-the-middle (AiTM) and phishing-as-a-service (PhaaS)**
- Tycoon 2FA was 89% of PhaaS incidents in January 2025, followed by EvilProxy at 8% and Sneaky 2FA at 3% — [Barracuda](https://blog.barracuda.com/2025/03/19/threat-spotlight-phishing-as-a-service-fast-evolving-threat); [SecurityBrief](https://securitybrief.co.nz/story/phishing-as-a-service-attacks-rise-in-early-2025-report)
- Tycoon 2FA was about 62% of phishing attempts blocked by Microsoft as of mid-2025, including more than 30M emails in a single month. It was the most prolific platform of 2025. It steals credentials and session cookies, bypassing MFA. A Europol/Microsoft-led operation dismantled it in March 2026 — [The Hacker News](https://thehackernews.com/2026/03/europol-led-operation-takes-down-tycoon.html?m=1); [TechRadar](https://www.techradar.com/pro/security/microsoft-europol-take-down-global-phishing-as-a-service-network-which-was-able-to-bypass-2fa-with-ease)

**QR-code phishing (quishing)**
- Proofpoint saw about 4.2M QR attacks in H1 2025 and notes that scanning on a phone bypasses gateway filters — [CXOToday](https://cxotoday.com/media-coverage/new-proofpoint-report-reveals-sharp-rise-in-url-based-threats-400-spike-in-clickfix-malware-campaigns-and-4-2m-qr-code-attacks/)
- Mimecast via APWG: 635,672 malicious QR codes in Q2 2025 and 716,306 in Q3 2025 — [APWG Q3 2025](https://docs.apwg.org/reports/apwg_trends_report_q3_2025.pdf)
- Microsoft data reportedly shows QR phishing up 146% in Q1 2026 — via [Hoxhunt search coverage](https://hoxhunt.com/blog/svg-phishing-email-attachments-mini-report) (secondary)
- Hoxhunt's mini-report says malicious QR is declining while SVG rises. The trend direction conflicts across vendors — [Hoxhunt](https://hoxhunt.com/blog/svg-phishing-email-attachments-mini-report)

**SVG and HTML attachment smuggling**
- Hoxhunt: SVG was about 0.1% of phishing lures in 2024 and 4.9% in H1 2025. Malicious SVGs grew roughly 50x in 2025 and are now the #3 malicious attachment type after PDF and HTML — [Hoxhunt mini-report](https://hoxhunt.com/blog/svg-phishing-email-attachments-mini-report); [OPSWAT](https://www.opswat.com/blog/svg-delivered-malware-is-flooding-emails-here-is-what-actually-blocks-it)
- LevelBlue SpiderLabs: SVG phishing up 1,800% in early 2025 vs. its April 2024 baseline, peaking in March 2025 — [LevelBlue](https://www.levelblue.com/blogs/spiderlabs-blog/pixel-perfect-trap-the-surge-of-svg-borne-phishing-attacks)
- Kaspersky: about a 6x month-over-month rise in March 2025 and 2,825 such emails in Q1 2025. SVGs act as HTML pages with JavaScript that opens fake Microsoft login pages — [Securelist](https://securelist.com/svg-phishing/116256/)
- Microsoft: one February 2026 campaign sent 1.2M SVG phishing messages to more than 53,000 organizations — via [OPSWAT](https://www.opswat.com/blog/svg-delivered-malware-is-flooding-emails-here-is-what-actually-blocks-it) (secondary)
- A 26,000-email SVG smuggling campaign used fake voicemail lures — [Kaseya](https://www.kaseya.com/blog/svg-smuggling-voicemail-phishing-campaign)
- Cue: attachment MIME type and extension (.svg, .html, .htm, .shtml) are visible in metadata without body inspection. Voicemail, fax or "document" subjects are common.

**Callback / TOAD (fake invoices with phone numbers)**
- Cisco Talos (May 5 to June 5, 2025): a significant portion of PDF-payload email threats push victims to call attacker phone numbers. Top impersonated brands: NortonLifeLock, PayPal, Geek Squad — [The Hacker News](https://thehackernews.com/2025/07/hackers-using-pdfs-to-impersonate.html?hl=en)
- Invoices claim charges of "several hundred dollars." The call leads to remote-access software installation. Some messages have no links or attachments — [UCSF Feb 2025](https://it.ucsf.edu/feb-2025-telephone-oriented-attack-delivery-toad-attacks-trick-users-downloading-remote-access)
- IRONSCALES cases include a Geek Squad invoice from Hotmail with a JPEG and no links, and a TOAD from a compromised school account that passed full authentication and a clean scan — [IRONSCALES Geek Squad](https://ironscales.com/threat-intelligence/geek-squad-toad-callback-hotmail-jpeg-invoice-no-links); [IRONSCALES school](https://ironscales.com/threat-intelligence/compromised-school-account-toad-callback-pdf-clean-scan-auth-pass); [IRONSCALES Pandora](https://ironscales.com/threat-intelligence/pandora-renewal-vishing-compromised-college-domain-callback)
- Trustwave reported a 140% surge in callback phishing between July and September; the year is unclear from the snippet — [Barracuda 2026 blog](https://blog.barracuda.com/2026/08/28/callback-phishing-fake-invoice-toad-attacks) (fetch failed; title and context only)
- Cues: a free-webmail sender (gmail.com, hotmail.com, outlook.com) claiming a corporate brand (Geek Squad, Norton, McAfee, PayPal); a phone number in the subject or display name; subjects like "invoice/receipt/order #/renewal/subscription"; an image or PDF as the only content; recipient in BCC or "undisclosed recipients."

**Abuse of legitimate SaaS notifications (these pass SPF/DKIM/DMARC)**
- PayPal invoices and money requests created on PayPal itself come from genuine service@paypal.com and pass every authentication check. The scam phone number sits in the invoice note or merchant name — [Guard.io](https://guard.io/blog/paypal-scam-emails-7-fakes-making-rounds); [FNB247 Oct 2025](https://www.fnb247.com/education-center/news/identity-theft/recent-scams-article-this-isnt-your-pal-its-a-phish); [BBB March 2025](https://www.bbb.org/article/scams/31573-fake-invoice-scam-with-paypal-twist-hits-business-and-consumers-nationwide)
- The Pennsylvania AG's advice to "check it's from service@paypal.com" is insufficient for this variant — [Yahoo/PA AG](https://www.yahoo.com/news/pa-ag-warns-paypal-invoice-164258922.html)
- PayPal-branded invoices were sent through the DocuSign API/templates, bypassing filters because the mail originates from DocuSign — [Malwarebytes Mar 2025](https://www.malwarebytes.com/de/blog/news/2025/03/paypal-scam-abuses-docusign-api-to-spread-phishy-emails); [ISU May 2025](https://www.isu.edu/news/2025-spring/beware-phishing-attack-using-docusign.html)
- A fake DocuSign email passed SPF, DKIM and DMARC, then led through a Webflow page and a fake CAPTCHA with fingerprinting cloaking — [Malwarebytes Jun 2025](https://www.malwarebytes.com/?p=262327)
- Proofpoint: OneDrive, Dropbox and Google Drive are misused to mask malware links — [SecurityBrief](https://securitybrief.co.nz/story/surge-in-phishing-attacks-as-cybercriminals-exploit-urls-qr-codes)
- Cloudflare Workers/Pages host phishing pages with valid TLS certificates. Proofpoint and Intermedia link-wrapping is abused to mask payloads (Cloudflare, August 2025) — [CyberSecurityNews](https://cybersecuritynews.com/hackers-abuse-cloudflare-services); [MEA TechWatch](https://meatechwatch.com/?p=30371)
- Cues: legitimate platform sender (paypal.com, docusign.net, google.com, sharepoint/onmicrosoft) with a brand mismatch between the platform and the brand named in the subject or display name (e.g. "PayPal" in a DocuSign mail). A phone number in the subject or merchant/display name. A "money request/invoice" from an unknown merchant name. Free-webmail addresses in the visible content.

**Compromised legitimate accounts (pass authentication; strongest metadata blind spot)**
- KnowBe4: 57.9% of phishing came from compromised accounts — [KnowBe4](https://blog.knowbe4.com/key-takeaways-from-the-2025-phishing-threat-trends-report)
- Talos Q2 2025: 75% of phishing engagements involved compromised email identities. Q3 and Q4 2025 saw post-compromise phishing to internal and external partners — [Talos Q2](https://blog.talosintelligence.com/ir-trends-q2-2025/); [Talos Q4](https://blog.talosintelligence.com/ir-trends-q4-2025/)
- Egress customer case studies: 1,491 phishing emails bypassed M365 at one customer, 743 of them from compromised accounts. Other customers saw 3,948 and 2,570 bypasses in 90 days. These are counts, not rates — [Egress Shields](https://egress.com/resources/customers/customer-stories/shields-health-solutions); [Egress NHS Dorset](https://egress.com/resources/customers/customer-stories/nhs-dorset); [Egress MAG](https://mta-sts.egress.com/resources/customers/customer-stories/manchester-airports-group)
- Cues: a known or unrelated legitimate domain (e.g. .edu or a small business) sending a brand-themed lure (Pandora renewal from a college domain); a sender with no prior history with the recipient; a mismatch between sender organisation and lure topic.

**LLM-written lures**
- Microsoft Digital Defense Report 2025: AI-automated phishing had a 54% click-through rate vs. 12% for non-AI (4.5x) and up to 50x profitability — [The Register](https://www.theregister.com/2025/10/16/ai_makes_phishing_45x_more_effective); [SC World](https://www.scworld.com/brief/report-higher-phishing-success-profitability-seen-with-ai-emails)
- KnowBe4: 82.6% of phishing showed AI use — [KnowBe4](https://blog.knowbe4.com/key-takeaways-from-the-2025-phishing-threat-trends-report)
- Hoxhunt: AI phishing went from 4% to 56% of reported threats by December 2025 — [Hoxhunt report page](https://hoxhunt.com/form/download-phishing-trends-report-2026)
- Implication: typo and grammar heuristics are now unreliable.

**Sextortion and extortion with personal data**
- Avast: the likelihood of being targeted by sextortion was up 137% in the U.S. in early 2025, with more than 15,000 unique Bitcoin wallets — [Security Boulevard](https://securityboulevard.com/2025/03/sextortion-scams-are-on-the-rise-and-theyre-getting-personal/)
- Variants include street-view photos of the victim's home, full names and leaked passwords. Typical demands are about $2,000 within 24 hours, paid by BTC wallet or QR code — [Trend Micro 2024](https://news.trendmicro.com/2024/09/10/sextortion-scam-email-uses-pictures-of-your-home); [Newtown PA Now](https://newtownpanow.com/2025/02/20/sextortion-email-scam-targets-bucks-countians/); [CBS](https://www.cbsnews.com/amp/minnesota/news/home-image-email-extortion-scam)
- Cues: often spoofed "from yourself" or from a random free-webmail address. A PDF or image attachment named with the recipient's name or address. Subjects containing the recipient's name, street or phone number. Bitcoin and wallet strings in the body.

**Domain and TLD abuse**
- Interisle Phishing Landscape 2025: new gTLDs are 11% of the domain market but 51% of reported phishing domains. Top phishing TLDs include .top (#2), .xyz (#4) and .shop (#5). ccTLD share dropped from 15% to 11% — [Interisle](https://interisle.net/)
- Older (Interisle 2024): new gTLDs were about 37% of cybercrime domains, and several cost under $1 to register — [Krebs Dec 2024](https://krebsonsecurity.com/2024/12/why-phishers-love-new-tlds-like-shop-top-and-xyz/)
- Spamhaus (Apr-Sep 2025): 43.5M new domains, 75% of them gTLDs; .top registrations up 94% and .xyz up 103%. .top is a toll-scam hotspot (Oct 2024 to Mar 2025) — [Spamhaus](https://info.spamhaus.com/domain-reputation-updates)
- In one postal phishing campaign, .top was 70.1% of domains, .cfd 13.7% and .xyz 7.3% — [URLAbuse](https://urlabuse.com/blog/An-overview-of-the-worlds-largest-postal-services-phishing-campaign)

**Display-name deception**
- An October 2025 fake "Security Notice" used the display name "Help Center" with rotating sender addresses to evade blocklists — [MailGuard](https://www.mailguard.com.au/blog/cloudflare-customers-targeted-with-fake-security-notice)

### Inferences
- Priority metadata detections for a consumer extension, roughly ordered by impact and feasibility:
  1. **Brand-to-domain mismatch.** A display name or subject names a top brand (Microsoft, PayPal, Apple, Geek Squad, Norton, McAfee, DHL/USPS, banks, ChatGPT) but the From domain is not that brand's known domain set. Also catches free webmail claiming a brand.
  2. **Phone number in subject, display name or sender name,** plus invoice, renewal or order-number keywords. This is the TOAD signal. It works even for genuine paypal.com and docusign.net senders whose merchant name holds the number.
  3. **Legitimate-platform sender carrying a third-party brand** (DocuSign, PayPal invoice, Google Forms/Drive, SharePoint notifications) from an unknown originator. Treat "passes DMARC" as neutral, not positive.
  4. **Risky attachment types:** .svg, .html/.htm, .shtml; also a PDF or image as the only content combined with invoice or voicemail subjects.
  5. **Sender domain on a new gTLD (.top, .xyz, .shop, .cfd, etc.)** and domain age, which needs RDAP/WHOIS lookup.
  6. **Reply-To differing from From,** especially Reply-To on free webmail.
  7. **First-contact sender plus an urgency or financial subject** (suspended, verify, payment failed, invoice, voicemail, document shared).
  8. **Sextortion pattern:** recipient's own address as sender, or personal data in the subject.
- Body or URL inspection is still needed for QR codes (image decoding), AiTM landing pages, cloaked redirects, and compromised-account lures whose sender looks normal.

### Gaps
- No aggregate figure found for the share of phishing that passes DMARC. Evidence is per-campaign only.
- No reliable share for "fake unsubscribe-link abuse." Nothing found in this pass.
- No 2025-26 quantitative share for toll or package scams in email specifically; the data is mainly SMS.
- Rockstar 2FA and EvilProxy 2025-26 volumes were not found beyond Barracuda's January 2025 split.
- The Trustwave 140% TOAD surge figure could not be dated.

## Q3. Consumer specifics: what Gmail/Outlook already catch and what slips through

### Takeaway
Google says Gmail blocks more than 99.9% of spam, phishing and malware, a claim from 2017 repeated in September 2025. At consumer scale, though, the residual 0.1% still means regular inbox exposure. What gets through is disproportionately authenticated mail: abused SaaS notifications, compromised accounts, and link-less callback or extortion messages. No independent consumer bypass rate was found.

### Cited Findings
- Gmail blocks more than 99.9% of spam, phishing and malware (originally 2017). Google noted 50-70% of incoming mail is spam and that it delays fewer than 0.05% of messages for deeper phishing analysis. TechCrunch noted this still lets about 1 in 1,000 through — [BleepingComputer 2017](https://www.bleepingcomputer.com/news/security/google-says-gmail-now-blocks-99-9-percent-of-spam-and-phishing-emails/); [TechCrunch](https://techcrunch.com/?p=1497069)
- In September 2025 Google called reports of a mass Gmail security warning "entirely false" and restated that Gmail blocks more than 99.9% of phishing and malware — [Slashdot](https://tech.slashdot.org/story/25/09/02/0419231/google-says-gmail-security-alert-claims-are-false); [Android Authority](https://www.androidauthority.com/google-denies-mass-security-warning-gmail-3593297)
- Enterprise M365 bypass counts (Egress case studies): 1,491, 2,570 and 3,948 phishing emails bypassed native M365 defenses in 90 days at individual organizations, half of one sample from compromised accounts — [Egress](https://egress.com/resources/customers/customer-stories/shields-health-solutions)
- KnowBe4 says the share sent from compromised accounts is what gets through traditional detection — [KnowBe4 press](https://www.knowbe4.com/press/new-knowbe4-report-reveals-a-spike-in-ransomware-payloads-and-ai-powered-polymorphic-phishing-campaigns)
- Proofpoint: QR codes bypass gateway filters because the URL is in an image and is opened on a phone — [CXOToday](https://cxotoday.com/media-coverage/new-proofpoint-report-reveals-sharp-rise-in-url-based-threats-400-spike-in-clickfix-malware-campaigns-and-4-2m-qr-code-attacks/)
- The IRONSCALES TOAD case passed full authentication and a clean scan, carrying only a phone number — [IRONSCALES](https://ironscales.com/threat-intelligence/compromised-school-account-toad-callback-pdf-clean-scan-auth-pass)

### Inferences
- A metadata-first extension adds the most value on the authenticated residual that native filters miss. Its focus should be relational and semantic metadata (brand vs. domain, phone numbers, platform-abuse patterns, attachment types, first-contact) rather than re-checking SPF/DKIM/DMARC, which providers already enforce.
- Consumer harm skews toward scams (tech support at $2.13B, imposters at $3.5B) rather than credential AiTM. The callback/invoice and sextortion detectors are high-value for consumers despite their smaller share of enterprise telemetry.

### Gaps
- No Microsoft Outlook.com consumer catch-rate figure was found.
- No independent measurement of the consumer Gmail/Outlook phishing bypass rate in 2025-26.
- No data on what share of consumer-reported phishing (e.g. FTC or IC3 email-contact share) arrives at Gmail vs. Outlook.
