# Threat-intelligence APIs and feeds for a free, privacy-first consumer Chrome extension (sender / domain / URL / attachment flagging)

Research date: 2026-10-20. Method note: direct page fetches to most provider domains (docs.virustotal.com, developers.google.com, spamhaus, abuse.ch, developer.chrome.com) failed from this environment (DNS / proxy 403). Only the Google Cloud Web Risk pricing page was retrieved in full and read verbatim. Everything else comes from search-engine extracts of the cited pages, so short quotes are reliable but surrounding context was not always visible. Items marked **[UNVERIFIED]** come from secondary sources or from prior knowledge and were not confirmed on the provider's own page.

---

## Q1. VirusTotal: limits, ToS for a distributed free product, BYO key, pricing, privacy, useful endpoints

### Takeaway
VirusTotal's Public API (4 requests/min, 500/day) is a poor fit to ship as a built-in feature. It is described as not for commercial products or business workflows. Per-install quotas are tiny. Anything *submitted* (URL scans, file uploads) is shared with the security community and premium subscribers. The only defensible use is an opt-in, bring-your-own-key, **hash/domain lookup only** feature (GET reports, never POST submissions). Premium pricing is not public.

### Cited Findings
- The Public API is limited to "500 requests per day and a rate of 4 requests per minute". — [VirusTotal: Public vs Premium API](https://docs.virustotal.com/reference/public-vs-premium-api) (search extract; the same figures appear in the [older v2 reference](https://virustotal.readme.io/v2.0/reference/public-vs-private-api))
- A monthly cap (often quoted as 15.5K/month) appears in third-party sources. The official page extract I saw did not show it. **[UNVERIFIED]** — [Public vs Premium API](https://docs.virustotal.com/reference/public-vs-premium-api)
- The Public API "must not be used in commercial products or services" and must not be used "in business workflows that do not contribute new files". — [Wazuh docs quoting VT terms](https://documentation.wazuh.com/current/user-manual/capabilities/malware-detection/virus-total-integration.html). I did not retrieve the exact VT wording. **[Secondary]**
- Premium/Private API request rates are "only limited by the user's Terms of Service". Pricing is quote-based and not published. — [VT Public vs Premium](https://docs.virustotal.com/reference/public-vs-premium-api). One third-party estimate is $1,500–$4,000+/month. **[UNVERIFIED]** — [sed.sh comparison](https://sed.sh/compare/virustotal)
- A GlassWire user reported a new free account with a much lower quota (1 lookup/day), which suggests quotas vary by account. **[Anecdotal]** — [GlassWire forum](https://forum.glasswire.com/t/virustotal-functionality/14908)
- Privacy: "VirusTotal may share your data submission with the security community". — [Google Workspace Help (VT integration)](https://support.google.com/a/answer/11236991?hl=en). That integration sends only file hashes, which is the privacy-preserving pattern.
- Uploaded samples are stored in the corpus and shared with anti-malware partners. They "may also be included in premium services offered to a select group of security actors". — [VT Historic Privacy Policy](https://docs.virustotal.com/docs/historic-privacy-policy) (archived version; current wording not retrieved)
- Private Scanning (a separate paid licence) does not share submissions. They are deleted after the retention period (usually 24h). — [VT Private Scanning](https://docs.virustotal.com/docs/private-scanning)

### Inferences
- A free extension distributed through the Chrome Web Store with one embedded key would (a) break the Public API's per-key quota immediately, (b) expose the key in the client bundle, and (c) likely fall under "commercial product/service" in VT's eyes even at $0. The only safe pattern is **BYO key**: the user pastes their own VT key in options and is told plainly that lookups go to Google/VirusTotal.
- Useful v3 endpoints (from prior knowledge of the API, **[UNVERIFIED in this session]**): `GET /api/v3/files/{sha256}` (attachment hash report), `GET /api/v3/domains/{domain}`, `GET /api/v3/urls/{base64url(url)}` (report lookup, no scan), `GET /api/v3/ip_addresses/{ip}`. Avoid `POST /urls` and `POST /files`, because those submit content and make it visible to VT subscribers.
- A URL lookup by ID still discloses the full URL to VT. Prefer domain-level lookups, or hash lookups for attachments. Note that an attachment's SHA-256 can still identify a unique document if VT already holds it.

### Gaps
- The exact current VT ToS clause text and monthly quota were not retrieved from the official site (fetch blocked).
- Whether VT explicitly permits BYO-key usage inside a third-party consumer tool was not confirmed. Many open-source tools do this, but I found no official statement.

---

## Q2. Google Safe Browsing (v4/v5) and Web Risk: local hash-prefix vs lookup, commercial status, pricing, MV3 feasibility

### Takeaway
Safe Browsing v5 in **Local List Mode** (download hash-prefix lists, check locally, query Google only on a 4-byte prefix match) is the best privacy/coverage fit for URLs. Safe Browsing is free but **non-commercial only**. A free, ad-free, non-monetised extension is plausibly "non-commercial", but this is a judgement call. Web Risk is the commercial alternative: list downloads are free (computeDiff), but confirming matches costs $50 per 1,000 calls (hashes.search). v4 support ends 2027-03-31, so any build should target v5.

### Cited Findings
- Safe Browsing APIs are for non-commercial use. Commercial users are directed to Web Risk. "There is no cost for use of this API." — [Safe Browsing v4 Usage Restrictions](https://developers.google.com/safe-browsing/v4/usage-limits) (search extract). Google's definition of commercial use centres on "sale or revenue-generating" purposes. **[Wording from search extract, not read in full]**
- v5 supports Local List Mode: "If and only if there is a match, the client connects to the server to continue the check." It also offers a real-time mode and a no-storage real-time mode. — [Safe Browsing v5 Overview](https://developers.google.com/safe-browsing/reference), [Local List Mode](https://developers.google.com/safe-browsing/reference/Local.List.Mode)
- v5 local lists hold SHA-256 hashes or prefixes, with 4-byte prefixes most common. All hashes in a list share one length, which allows "much more efficient client implementations". The local database format is up to the client. — [Local Database](https://developers.google.com/safe-browsing/reference/Local.Database)
- List download endpoints: `hashLists.list`, `hashLists.batchGet`, `hashList.get` (e.g. `GET /v5/hashList/{name}`). Rice-delta encoding is used. — [REST hashList](https://developers.google.com/safe-browsing/reference/rest/v5/hashList)
- v5 has an optional Oblivious HTTP Gateway API. The relay sees only client IPs and Google sees only request content. — [Safe Browsing v5 Overview](https://developers.google.com/safe-browsing/reference)
- v5 avoids v4's staleness issue (20–50 min). — [Android SafetyNet Safe Browsing docs](https://developer.android.com/privacy-and-security/safetynet/safebrowsing) (search extract)
- v4 support ends 2027-03-31. Move to v5 or Web Risk. — [Brave issue #56023](https://github.com/brave/brave-browser/issues/56023) (relays Google's notice; **[secondary]**)
- **Web Risk pricing (verbatim, fetched in full):** "Lookup API uris.search: free for up to 100,000 calls per month. Update API threatLists.computeDiff: unlimited free use." Lookup above 100k costs $0.50 per 1,000. Update API `hashes.search` "to confirm threats" costs $50.00 per 1,000. "Calling threatLists.computeDiff changes the pricing of uris.search calls to the pricing of hashes.search calls." Examples: 2,000 hashes.search = $100; 50,000 = $2,500. — [Google Cloud Web Risk pricing](https://cloud.google.com/web-risk/pricing)
- A third-party MV3 extension (web-trust-clue-helper v0.3.0) already uses Safe Browsing v5. It sends only 4-byte SHA-256 URL hash prefixes and keeps full-hash matching local. It stores a **user-provided** API key in `chrome.storage.local`. — [GitHub: web-trust-clue-helper](https://github.com/a05031113/web-trust-clue-helper) (code not audited)

### Inferences
- MV3 feasibility: yes. A service worker plus `chrome.alarms` can periodically call `hashList.get` and store prefixes in IndexedDB. A few MB of 4-byte prefixes is fine. Exact list sizes are not documented in what I saw.
- Key exposure: a Safe Browsing API key shipped in the extension is extractable. Options are (a) BYO key, like the reference extension, (b) a key restricted to the Safe Browsing API only, accepting quota abuse risk, or (c) a thin proxy that holds the key (see Q6). Under Web Risk, a leaked key creates a **billing** risk ($50 per 1,000 confirmations). Under Safe Browsing it only risks the quota.
- Web Risk in Update mode for a consumer extension: each local prefix match triggers a paid `hashes.search`. Matches are rare, so cost tracks actual hits, but abuse via a leaked key is uncapped unless quotas are set. That argues for a server-held key if Web Risk is used.
- Chrome's built-in Safe Browsing already protects link clicks in the browser. The extension's added value is **pre-click** flagging inside the email view.
- Privacy: Local List Mode never sends full URLs. Even a 4-byte prefix plus the user's IP is a k-anonymous signal. OHTTP removes the IP linkage, but needs a relay operator.

### Gaps
- I could not read the full Safe Browsing ToS (attribution requirements, e.g. "Advisory provided by Google" warning text; I recall this from prior knowledge, **[UNVERIFIED]**), v5 quotas, or whether Google considers a free Chrome Web Store extension "non-commercial".
- Whether Google offers a public OHTTP relay for third-party Safe Browsing clients is unknown.

---

## Q3. Other URL/domain/file feeds: abuse.ch, PhishTank, OpenPhish, Phishing.Database, Spamhaus, SURBL, urlscan, OTX, IPQS, Tranco, Cloudflare Radar, others

### Takeaway
The strongest **bundle-able** sources (download centrally, ship as a signed dataset, match locally) are abuse.ch URLhaus/ThreatFox/MalwareBazaar hashes, OpenPhish community, and Phishing.Database. Licensing still needs confirming: abuse.ch requires an Auth-Key since 30 June 2025 and limits free use to not-for-profit. PhishTank is effectively closed to new users. Spamhaus and SURBL DNSBLs are free only for small/non-commercial use and block public resolvers, so per-user DoH queries from an extension are unsuitable. urlscan.io public scans leak data. IPQS free tiers are too small to embed.

### Cited Findings
**abuse.ch (URLhaus, ThreatFox, MalwareBazaar)**
- The APIs need an Auth-Key ("Required"), free from the abuse.ch Authentication Portal. — [URLhaus API](https://urlhaus.abuse.ch/api/), [MalwareBazaar API](https://bazaar.abuse.ch/api/), [ThreatFox API](https://threatfox.abuse.ch/api/)
- The Auth-Key has been mandatory since 30 June 2025. abuse.ch terms effective 4 November 2025 are described as allowing free not-for-profit use within volume limits, with paid commercial access through Spamhaus. **[Secondary: GitHub issue summarising terms]** — [hermes-cyber-au issue #32](https://github.com/jusso-dev/hermes-cyber-au/issues/32)
- Spamhaus Technology has been the primary licensee of abuse.ch data since 1 Aug 2022. Commercial API access is sold through the "abuse.ch-Spamhaus Alliance". — [abuse.ch blog](https://abuse.ch/blog/), [Spamhaus abuse.ch API data access](https://www.spamhaus.com/data-access/abusech-api/)
- Community API uses an Auth-Key. Commercial API uses Spamhaus Customer Portal credentials. — [Elastic abuse.ch integration](https://www.elastic.co/docs/reference/integrations/ti_abusech)
- CC0: only Feodo Tracker was found explicitly stating CC0. I found no primary confirmation that URLhaus/ThreatFox are CC0 today. — [hermes-cyber-au issue #32](https://github.com/jusso-dev/hermes-cyber-au/issues/32)

**PhishTank**
- New-user registration has been closed since 2020 and remained closed as of June 2026. — [Wikipedia: PhishTank](https://en.wikipedia.org/wiki/PhishTank) (**[Wikipedia; not confirmed on phishtank.org]**)

**OpenPhish**
- The free community feed is "restricted" and updated every 12 hours — [threatfeeds.io: OpenPhish](https://threatfeeds.io/?feed=OpenPhish); SpamAssassin docs say every 6 hours — [SpamAssassin Phishing plugin](https://spamassassin.apache.org/full/4.0.x/doc/Mail_SpamAssassin_Plugin_Phishing.html). The sources conflict, and the licence terms were not retrieved.

**Phishing.Database**
- Updated every few hours. Active list at `https://phish.co.za/latest/phishing-links-ACTIVE.txt`. — [SpamAssassin Phishing plugin docs](https://spamassassin.apache.org/full/4.0.x/doc/Mail_SpamAssassin_Plugin_Phishing.html). Licence not verified. From prior knowledge it is an MIT-licensed GitHub project. **[UNVERIFIED]**

**Spamhaus (ZEN / DBL via free "Blocklists via DNS Query", formerly DQS)**
- "Provided free of charge for use by non-commercial small organizations and individuals". Query volume must not consistently exceed 100,000/day. Spamhaus may revoke access without notice. — [Spamhaus free data query terms / fair use](https://www.spamhaus.com/terms-of-use-fair-use-policy-for-free-data-query-service/), [Spamhaus free DQS](https://www.spamhaus.com/data-access/free-data-query-service/)
- Queries via open/public resolvers are blocked and return 127.255.255.254. Microsoft (Apr 2025) and Oracle (Apr 2026) networks were blocked. Spamhaus recommends a DQS account key. — [Spamhaus: legacy DNSBLs via Microsoft](https://www.spamhaus.com/resource-center/query-the-spamhaus-projects-legacy-dnsbls-via-microsoft/), [Spamhaus: Oracle](https://www.spamhaus.com/resource-center/if-you-query-the-spamhaus-projects-dnsbls-via-oracle-move-to-the-free-data-query-service/)
- 127.255.255.255 means the querying IP has exceeded its allowance. — [securityzones.net](https://www.securityzones.net/error-return-codes-for-spamhaus-public-mirrors/) **[secondary]**

**SURBL**
- Free use is limited to under 1,000 users or under 250,000 messages scanned per day. Embedding SURBL data in a paid product is excluded. High-volume users need an rsync feed. — [Suped guide (Aug 2026)](https://www.suped.com/learn/blocklists/how-to-contact-surbl-and-what-are-their-policies-regarding-delisting-and-support-for-esps) **[secondary]**; consistent with [SmarterTools forum](https://portal.smartertools.com/community/a87485/surbl-via-rsync-as-a-paid-service.aspx) and [rspamd SURBL docs](https://docs.rspamd.com/modules/surbl/)

**urlscan.io**
- Visibility is public, unlisted (seen by vetted Pro researchers) or private. Separate per-minute, per-hour and per-day quotas apply. — [urlscan API docs](https://urlscan.io/docs/api/). Quota snapshot: public 2,500/day, unlisted 500/day, private 25/day. — [urlscan quotas](https://urlscan.io/user/quotas/) (snapshot; account-dependent)

**IPQualityScore**
- The official plans page says "start with 1,000 free lookups", with daily caps on entry plans. Older or secondary sources say 5,000/month. — [IPQS plans](https://www.ipqualityscore.com/plans); [Cortex XSOAR doc (old)](https://xsoar.pan.dev/docs/reference/integrations/ip-quality-score)

**Tranco (allowlist / popularity)**
- Built from Cisco Umbrella (free), Majestic (CC BY 3.0), CrUX (CC BY-SA 4.0), Cloudflare Radar (CC BY-NC 4.0) and Farsight (default list only). — [tranco-list.eu](https://tranco-list.eu/)

**Not researched / not found in this session:** AlienVault OTX limits (no results), Cloudflare Radar ranking API terms, Microsoft Defender TI, Hybrid Analysis, Netcraft, CheckPhish (Bolster), crt.sh, disposable-email-domains licence, rdap.org.

### Inferences
- **Central aggregation, local matching** suits most of these. A GitHub Action (running under one maintainer Auth-Key) pulls URLhaus, ThreatFox domains, MalwareBazaar SHA-256s, OpenPhish community and Phishing.Database. It normalises them to registrable domains / URL hashes and publishes through the existing **signed remote dataset on GitHub Pages**. Users never contact abuse.ch. Licence check: abuse.ch's "not-for-profit" clause appears to cover a free, non-monetised extension, but **confirm in writing with abuse.ch/Spamhaus**, because redistributing derived lists may be treated differently from querying.
- Spamhaus/SURBL via DoH from each extension: the queries would go through Google/Cloudflare public resolvers, which Spamhaus blocks. A DQS key embedded in the extension would be shared by all users and exceed the 100k/day "small organization" cap, and redistribution is likely disallowed. **Do not use DNSBLs from the client.**
- Tranco is useful as a local **allowlist / false-positive dampener** (e.g. do not flag top-100k domains on heuristics alone). The default list includes a CC BY-NC input, so attribution is required and the extension must stay non-commercial.
- urlscan.io and VT URL *scanning* should be excluded, or offered only as explicit opt-in "submit for analysis" actions with a clear warning that public scans are visible to others.
- IPQS and similar per-lookup commercial reputation APIs have free tiers (about 1,000/month) that cannot support a user base without a proxy and a paid plan.

### Gaps
- abuse.ch's current Terms of Use and Fair Use page text (redistribution rights) were not read directly.
- OpenPhish community feed licence and redistribution terms; Phishing.Database licence.
- OTX, Cloudflare Radar, Defender TI, Hybrid Analysis, Netcraft and CheckPhish were not covered due to the tool-call budget. Treat any claims about them as unresearched.

---

## Q4. Email-specific signals: disposable domains, DNSBLs for sending IPs, BIMI/VMC, DMARC via DoH, domain age (RDAP)

### Takeaway
Header-derived checks can be done with **only domain names leaving the device**. DMARC/SPF/BIMI TXT records can be fetched via DoH (Google's JSON API at `dns.google/resolve`). Domain age can come from RDAP. Disposable-domain lists can be bundled. DNSBL checks on sending IPs from Received headers are blocked by Spamhaus policy when routed through public resolvers (see Q3). Note too that Gmail/Outlook have usually already evaluated SPF/DKIM/DMARC and exposed the result in the `Authentication-Results` header, which can be parsed locally with zero network calls.

### Cited Findings
- Google Public DNS offers RFC 8484 DoH at `dns.google/dns-query` (GET/POST) and a JSON API at `dns.google/resolve` (GET only, `name` required, HTTPS only). — [Google Public DNS DoH docs](https://developers.google.com/speed/public-dns/docs/doh)
- CORS on `dns.google/resolve` is enabled according to a third-party listing. Not confirmed in Google's docs. **[UNVERIFIED]** — [bytetools listing](https://bytetools.bytevancer.com/public-apis/security/google-dns-api). (MV3 extensions with host permissions for `dns.google` bypass CORS anyway.)
- Spamhaus blocks queries from resolvers without attributable rDNS (public/open resolvers). — [Spamhaus fair use](https://www.spamhaus.com/terms-of-use-fair-use-policy-for-free-data-query-service/)

### Inferences
- DMARC: query `_dmarc.<from-domain>` TXT. BIMI: `default._bimi.<domain>` TXT, then optionally fetch the VMC/logo URL (this discloses the domain to the brand's host). This is standard DNS naming from prior knowledge, **[UNVERIFIED in this session]**.
- Privacy cost of DoH: the resolver (Google/Cloudflare) learns which sender domains the user receives mail from, tied to the user's IP. Mitigations: cache aggressively, only look up when the `Authentication-Results` header is missing or ambiguous, and offer a resolver choice.
- RDAP domain age: `rdap.org` (a redirect service using the IANA bootstrap) can return the registration event date. It discloses the domain to rdap.org and to the registry. Bundling a central "newly registered domains" list is an alternative. **[rdap.org behaviour not verified in this session]**
- Disposable-email domain lists (e.g. GitHub `disposable-email-domains`) can be bundled into the signed dataset. **[Licence not verified]**

### Gaps
- rdap.org CORS/rate limits, the disposable-email-domains licence, Cloudflare DoH JSON specifics, and crt.sh rate limits were not verified.

---

## Q5. Chrome Web Store policy impact: Limited Use, third-party transfers, host-permission review

### Takeaway
Sending even domains or URL hashes to third parties is "web browsing activity"/user data under the Chrome Web Store User Data Policy. It is allowed only when it is needed for the disclosed single purpose (security/anti-phishing qualifies under "protect against malware/fraud"), is prominently disclosed in the listing and UI, and is backed by a public Limited Use compliance statement. Data must be strictly necessary under the 2026 tightening. Broad host permissions slow review, so use narrow host permissions for the email sites plus `optional_host_permissions` for opt-in threat-intel endpoints.

### Cited Findings
- Collecting web browsing activity is prohibited unless required for a user-facing feature that is prominently described on the listing and in the UI. Monetisation of it is never permitted. — [CWS Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- Third-party transfers are allowed only if necessary to provide/improve the single purpose, required by law, to protect against malware/fraud, or in a merger with explicit consent. "All other transfers, uses, or sale of user data is completely prohibited." — [CWS Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- An affirmative statement of Limited Use compliance must be published on a website belonging to the extension. — [CWS Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- 2026 update: user data collected must be "strictly necessary" to the disclosed single purpose. — [CWS policy updates 2026 blog](https://developer.chrome.com/blog/cws-policy-updates-2026). Enforcement from 1 Aug 2026 per a secondary source. **[UNVERIFIED date]** — [superchargebrowser](https://www.superchargebrowser.com/library/chrome-web-store-privacy-rules-august-2026/)
- Reviews "may take longer for extensions that request broad host permissions…". Typically a few days, up to a few weeks. — [CWS review process](https://developer.chrome.com/docs/webstore/review-process)
- The usual remedy is narrower host patterns plus `optional_host_permissions` requested at runtime from a user gesture. This is community-documented rather than an official recipe. — [mv3-extension.com analysis](https://mv3-extension.com/manifest-v3-architecture-extension-lifecycle/host-permissions-and-site-access/the-review-cost-of-all-urls-and-broad-host-patterns/), [dev.to](https://dev.to/alexmacarthur/avoiding-a-host-permission-review-delay-when-publishing-a-chrome-extension-1kca)

### Inferences
- Adding a new host permission in an update typically re-triggers review, and may disable the extension until users accept new permission warnings. Optional host permissions avoid the install-time warning (from prior knowledge, **[UNVERIFIED]**). Fetching the signed dataset from the extension's own GitHub Pages origin needs just one narrow host permission.
- A design in which only the signed dataset is downloaded (no per-message data leaves) arguably involves **no user-data transfer at all**, which is the cleanest privacy-tab disclosure.

### Gaps
- Exact privacy-practices form wording required for hash-prefix lookups was not researched.

---

## Q6. Recommended architecture and whether a proxy (e.g. Cloudflare Worker) is needed

### Takeaway
Use a three-tier design. **Tier 0 (default, no network per message):** local heuristics plus `Authentication-Results` parsing plus a bundled signed dataset built centrally from abuse.ch, OpenPhish, Phishing.Database, disposable domains and the Tranco allowlist. **Tier 1 (default-on or opt-in, k-anonymous):** Safe Browsing v5 Local List Mode with 4-byte prefixes only. **Tier 2 (explicit opt-in per click, BYO key):** VirusTotal domain/hash report lookups, DoH DMARC/BIMI and RDAP age. A proxy is needed only to hide a shared Safe Browsing/Web Risk key. If used, it must be stateless, log nothing, and forward only hash prefixes.

### Cited Findings
- Web Risk list updates are free, and paid confirmations cost $50 per 1,000, which means any shared Web Risk key must sit server-side with quotas. — [Web Risk pricing](https://cloud.google.com/web-risk/pricing)
- A production MV3 extension uses Safe Browsing v5 prefix-only checks with a user-supplied key. — [web-trust-clue-helper](https://github.com/a05031113/web-trust-clue-helper)
- abuse.ch requires an Auth-Key and frames free use as not-for-profit within volume limits, which favours one central puller over per-user calls. — [URLhaus API](https://urlhaus.abuse.ch/api/); [hermes-cyber-au issue #32](https://github.com/jusso-dev/hermes-cyber-au/issues/32) **[secondary]**
- Spamhaus blocks public resolvers and caps free use at 100k/day for small non-commercial users, which rules out client-side DNSBL. — [Spamhaus fair use](https://www.spamhaus.com/terms-of-use-fair-use-policy-for-free-data-query-service/)

### Inferences (recommended architecture)
1. **Dataset build (GitHub Actions, maintainer keys):** pull feeds every few hours. Reduce URLs to registrable domains (via the Public Suffix List) and SHA-256 of canonical URLs, plus MalwareBazaar SHA-256 for attachments. Strip personal data. Sign the output (the existing mechanism) and publish to GitHub Pages. The extension fetches it on a `chrome.alarms` schedule. Users' IPs reach only GitHub Pages, never the threat-intel providers.
2. **Attachment check:** compute SHA-256 locally (WebCrypto) only where the attachment bytes are already available to the content script. Match against the bundled MalwareBazaar hash set. Never upload files.
3. **Safe Browsing v5:** maintain local prefix lists in IndexedDB. On a prefix hit, request full hashes for that 4-byte prefix only. Key options: BYO key (zero infrastructure, best privacy) or a Cloudflare Worker that holds the key, adds no logging, and forwards `hashes.search`/`search` requests (hides the user's IP from Google, but the Worker operator sees IP plus prefix, so publish a no-log policy). Cost: Workers' free tier is likely enough at low volume (**[pricing not verified in this session]**).
4. **Opt-in deep checks:** a "Check with VirusTotal" button uses the user's own VT key, with domain or file-hash GET only. DoH queries for `_dmarc`/`_bimi` are used only when `Authentication-Results` is absent. RDAP domain age is queried on demand. Each check is disclosed in the UI and privacy policy.
5. **Never:** send message bodies or full URLs to any third party; submit to VT/urlscan; query DNSBLs from the client.
6. **Licensing posture:** keep the extension free, ad-free and non-monetised to stay within the Safe Browsing "non-commercial", abuse.ch "not-for-profit", Tranco CC BY-NC input and SURBL/Spamhaus free-tier definitions. Request written confirmation from Google (Safe Browsing) and abuse.ch/Spamhaus about redistribution in a signed dataset.

### Gaps
- Cloudflare Workers pricing and limits, and Safe Browsing v5 quota per key, were not verified.
- There is no authoritative statement from Google that a free CWS extension counts as "non-commercial" for Safe Browsing. This is the main legal uncertainty.

---

## Comparison table (summary; see sections above for citations and verification status)

| Source | Cost | Limits | Licence for free consumer ext. | Freshness | Coverage | Privacy model | Key must be hidden? | CWS impact |
|---|---|---|---|---|---|---|---|---|
| VirusTotal Public API | Free | 4/min, 500/day (monthly cap unverified) | "Not in commercial products/services" (secondary); BYO key only | Real-time | Files, URLs, domains, IPs | Lookups disclose indicator; submissions shared with community/premium | Yes, or BYO | Third-party transfer; opt-in disclosure |
| VirusTotal Premium | Quote-only (est. $1.5–4k+/mo, unverified) | Contract | Commercial OK | Real-time | Same | Same (Private Scanning separate) | Yes (server) | Same |
| Google Safe Browsing v5 | Free | Not verified | Non-commercial only | Near real-time; v5 fixes 20–50 min staleness | Malware, social engineering, unwanted software URLs | Local list + 4-byte prefix; optional OHTTP | Leaked key = quota risk; BYO or proxy | Prefix transfer; disclose |
| Google Web Risk | computeDiff free; Lookup 100k/mo free, then $0.50/1k; hashes.search $50/1k | Billing-based | Commercial OK | Same | Same | Same as SB (Update API) | Yes (billing risk) | Same |
| abuse.ch URLhaus / ThreatFox / MalwareBazaar | Free (Auth-Key) | Fair-use volume limits | Not-for-profit free; commercial via Spamhaus (secondary); CC0 unconfirmed | Minutes–hours | Malware URLs, IOCs, malware hashes | Central pull → bundled list (no user data leaves) | Maintainer key in CI only | None if bundled |
| PhishTank | Free | — | Registration closed since 2020 | Hourly (historical) | Phishing URLs | — | — | Not usable for new projects |
| OpenPhish community | Free | Restricted subset | Terms not verified | 6–12 h (conflicting) | Phishing URLs | Bundle | No | None if bundled |
| Phishing.Database | Free | — | Licence unverified (likely MIT) | Every few hours | Phishing domains/URLs | Bundle | No | None if bundled |
| Spamhaus ZEN/DBL (free DQS) | Free | ≤100k queries/day; public resolvers blocked | Non-commercial small orgs/individuals only | Real-time | Sending IPs, domains | DNS query discloses indicator | DQS key; can't share across users | Not suitable client-side |
| SURBL | Free (small) | <1,000 users / <250k msgs/day | Not in paid products; feed for scale | Real-time | URL domains in mail | DNS query | — | Not suitable client-side |
| urlscan.io | Free tier | ~2,500 public / 500 unlisted / 25 private per day (snapshot) | Terms not verified | Real-time | Live page scans | Public scans visible to all | Yes | Avoid / opt-in only |
| IPQualityScore | 1,000 free lookups (official) vs 5,000/mo (old) | Daily caps | Paid for scale | Real-time | Email, URL, IP reputation | Sends indicator | Yes | Needs proxy + paid plan |
| Tranco | Free | — | Mixed inputs incl. CC BY-NC (Cloudflare Radar) | Daily | Top-sites allowlist | Bundle | No | None |
| Google DoH (`dns.google/resolve`) | Free | Not documented here | — | Live DNS | DMARC/SPF/BIMI TXT | Google sees domain + IP | No key | Host permission; disclose |
| OTX, Cloudflare Radar API, Defender TI, Hybrid Analysis, Netcraft, CheckPhish, crt.sh, rdap.org | — | — | **Not researched in this session** | — | — | — | — | — |
