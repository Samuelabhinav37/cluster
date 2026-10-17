# Cluster: algorithm audit and upgrades (classification, scoring, decisions)

_2026-10-05. Branch `redesign/apple-glass-v3` at `efeeb95` plus the uncommitted working tree.
Builds on `2026-10-05-end-to-end-walkthrough-and-roadmap.md` (the "walkthrough note") and
`2026-10-05-inbox-intelligence-research.md` (the "intelligence note"). Those cover features,
competitors' feature sets, the vault, order chains, OTP expiry, persistent block and storage.
This note covers the algorithms underneath: how each decision is made, where it fails, how a
sender can game it, and how to make it better and easier to explain. Research only. No source
code was changed._

Conventions, same as the earlier notes:

- **Verified** claims carry an inline link to the source that owns them.
- **(Inference)** marks my own reasoning or design suggestions.
- **Not reached** marks a source I tried and could not read.
- Code references are `path:line` on this branch.
- In the caveats table, "verified" means I ran it (probe or test) or it is unambiguous from the
  code. "Inferred" means it depends on provider behaviour I could not observe.

## TL;DR

1. **The classifier is a stack of English subject regexes plus hand lists, and one keyword can
   flip a message's fate.** "Free delivery" becomes shipping and is protected forever. "Enable
   2FA" becomes a one-time code and is offered for deletion after 2 days. Verified by probe.
2. **A sender can buy protection with a word.** Any subject with "expires", "ticket", "booking",
   "tax" or "security alert" is undeletable by every cleanup path. One "Offer expires tonight"
   subject also hides a known-spam domain from the Suggested spam list. Verified.
3. **Authentication-Results parsing reads the first `dmarc=` token anywhere in the header,
   comments included.** An envelope sender like `"dmarc=pass"@evil.example` turns Gmail's real
   `dmarc=fail` into "pass". An ARC comment that precedes the real verdicts does the same.
   Verified against the parser. Gmail's exact ARC comment layout is inferred.
4. **On Outlook, Cluster probably never trusts Microsoft's real header and may trust a forged
   one.** Microsoft documents its Authentication-Results without an authserv-id, while Cluster
   accepts anything starting `*.outlook.com;`. Outlook scoring also reads `sender`, not `from`.
5. **Brand impersonation misses the easy evasions.** A Cyrillic letter, a zero-width space or no
   space ("PayPalSupport") in the display name, and combosquat domains (`paypal-secure-login.com`)
   all score zero. "Google Security" from gmail.com is not flagged, because gmail.com is listed as
   a Google domain. Verified.
6. **The on-device AI can remove protection.** It only reclassifies "other" mail, but "other"
   with no bulk headers is exactly the protected "probably a person" bucket. An AI verdict of
   "social" or "newsletter" makes a friend's email deletable. Verified in code.
7. **Modules disagree about precedence.** Rules, smart-view archive, Sort and the Screener honour
   only "starred". Delete paths honour the full protection gate. Server-side Gmail filters bucket
   by domain while the client buckets by kind first. Sorting files mail out of the inbox, and the
   security scan only looks at the inbox.
8. **Explanations exist for phishing and engagement, but not for kind, bucket or protection.**
   The user sees "5 protected", never "protected because the subject says 'ticket'".
9. **The upgrade path that fits the constraints is a hybrid**: keep deterministic rules as the
   safety floor, add a per-user logistic-regression or naive-Bayes layer trained only on the
   user's own corrections (feature counts, never text), calibrate it, and attach reason codes
   to every decision. Graham's per-user argument and credit-scoring "adverse action" reasons
   are the two models to copy.
10. **Fix order:** header-parsing and brand-list security bugs first (S), then one shared
    protection policy with reason codes (M), then a labelled synthetic corpus and per-class
    metrics in vitest (M), then the learned layer (L).

---

## How this was audited

- Read every decision module in `src/lib/` and the dashboard code that applies or explains the
  results.
- Ran the untracked `src/lib/algorithmAudit.test.ts`. **Result: 23 passed, 23 expected-fail**
  (`npx vitest run --no-file-parallelism src/lib/algorithmAudit.test.ts`). Every `it.fails`
  known bug still reproduces. Its header points to `research/2026-10-05-algorithm-and-code-audit.md`,
  which does not exist in the repo. This note can serve as that reference.
- Wrote a throwaway probe in the session scratchpad that bundles the real modules with esbuild
  and runs about 90 adversarial and international inputs through them. No repo files were
  written. Probe results are quoted below as "probe".
- Read primary sources for Part B.

What `algorithmAudit.test.ts` already locks as known bugs (so this note does not re-derive
them): "Free delivery" / "Tracking your goals" / "Our statement" misclassified; "Please verify
your device" missed as OTP; "ends tonight" promo protected; plural "tickets" / "reservations"
not protected; facebookmail.com flagged; "Chase Miller" on gmail.com scored HIGH; chess.com as a
chase.com lookalike; "Start-Ups Weekly" as UPS; Microsoft/Google/Apple free-mail brand claims
missed; Substack and proton.me grouped by domain; Netflix "will renew on" and Apple "is renewing
soon" missed; Amazon marketing listed as a paid subscription; a comma inside a List-Unsubscribe
URL drops the link; a Trash rule ignores receipt protection; one 404 mid-scan fails the scan;
health score changes with sample size.

---

## Part A. Audit of the current algorithms

### A.0 The decision pipeline, in the order it actually runs

```
messages.list (q per lane)  ─► messages.get format=metadata (newest 150)
        │
        ▼
gmailProvider/outlookProvider normalise ─► parseFrom, select trusted Authentication-Results,
        │                                   parseListUnsubscribe (+ RFC 8058 check)
        ▼
senderModel.addToSenders  ─► kind = classifyMessageKind(subject, hasUnsubscribe)
        │                    looksAutomated(List-Unsubscribe, Precedence, Auto-Submitted)
        │                    threat signals (identity, auth, context), authVerdicts merge
        ▼
firstContact (dashboard only)
        ▼
consumers, each with its own gate:
  protectionDecision ─► expiry, keepNewest, smartView trash, domain delete, cleanup plan,
                         neverRead, engagement, spamSuggestions (lighter)
  isProtected only   ─► rules/ruleRunner, smartView archive, Sort my inbox, Screener
  riskTier            ─► Security tab, health metric, background auto-quarantine
  categorizeDomain    ─► Sort buckets (after kind), server filters (instead of kind), rules
  optional AI         ─► rewrites kind for "other" in memory, then re-renders Delete/Organize
```

(Inference) The pipeline is per message for kind and per sender for threats, which is the right
split. The weakness is that each consumer re-decides "is this safe to touch" with a different
gate, and none of them records why.

### A.1 Message kind (`src/lib/messageKind.ts`)

- **Inputs.** Subject string, `hasListUnsubscribe` (`messageKind.ts:14`). Called once per
  message in `senderModel.ts:104`.
- **Logic.** First match wins in a fixed order: OTP, shipping, receipt, social, then
  "newsletter" if a List-Unsubscribe exists, else "other" (`messageKind.ts:14-22`).
- **Thresholds.** None. Four regexes (`messageKind.ts:7-12`), English only, word-boundary
  anchored.
- **Outputs.** One of six kinds. Kind drives protection (`receipt`, `shipping` are protected),
  retention (`otp` 2 d, `newsletter` / `social` 30 d), smart views, sort bucket and rule
  conditions.

Probe results (subject, no unsubscribe header):

| Subject | Kind | Correct? |
|---|---|---|
| "Two-factor authentication was disabled on your account" | otp | No. Security notice. Gets 2-day expiry. |
| "Enable 2FA to keep your account safe" | otp | No. Marketing / security nudge. |
| "Confirm your email to finish signing up for our newsletter" | otp | Debatable. |
| "Your one-time offer inside" | otp | No. Promo. |
| "123456 is your Instagram code" | other | No. Missed OTP. |
| "Your sign-in link" | other | No. Missed magic link. |
| "Your order has been delivered" | other | No. "delivered" is not in the regex, only "delivery". |
| "Order # 4412 confirmed" | other | No. `order #\b` needs a word char after `#`. |
| "Delivery of today's newsletter" | shipping | No. Becomes protected forever. |
| "Get paid faster with Stripe" | receipt | No. Protected forever. |
| "Invoice overdue: pay now or account closed" | receipt | A phishing lure is now protected and sorted into Receipts. |
| "Security alert: new sign-in from Windows" | other | Kind fine; protected via sensitive-subject. |
| "Tu código de verificación es 482913" / "Votre code de vérification" / "Ihr Bestätigungscode" / "Ihre Bestellung wurde versandt" | other | No. Non-English always falls to "other". |

Caveats:

- **Order matters and is wrong in places.** OTP is checked before shipping and receipt, so
  "Your one-time payment receipt" is an OTP and expires in 2 days. (Inference from regex order;
  `one[- ]?time` matches.)
- **"2fa" and "two-factor" as OTP signals** pull account-security notices into the shortest
  retention bucket. `SENSITIVE_SUBJECT` (`protectionPolicy.ts:46-47`) does not list
  "two-factor", "2fa", "password changed" or "recovery email", so these notices are deletable
  after 2 days. Verified by reading both regexes; the probe shows the kind.
- **Newsletter means "has List-Unsubscribe", nothing more.** Transactional senders that add
  List-Unsubscribe (many do) become "newsletter" unless a keyword fires first.
- **No digits signal.** The intelligence note §2 already lists the missing OTP shapes. The
  structural fix is a feature, not a longer regex (see C.1).

### A.2 Automated-mail signal (`messageKind.ts:24-45`)

- **Inputs.** List-Unsubscribe presence, `Precedence`, `Auto-Submitted`.
- **Logic.** Any one present means "automated".
- **Caveat.** Absence of all three means "probably a person". Phishing kits, small shops and
  cold outreach often send without them. Combined with A.6, an attacker who omits bulk headers
  and uses a plain subject gets the `no-bulk-signal` protection (`protectionPolicy.ts:82-84`),
  so their mail can never be bulk-deleted. That is the safe direction for deletion, but it also
  means the bulk-header signal cannot be used as evidence of anything for strangers.
  (Inference)

### A.3 Sort buckets and domain categories (`sortTaxonomy.ts`, `domainCategories.ts`, `serverSort.ts`)

- **Inputs.** Kind, sender domain, per-sender overrides.
- **Logic.** Override first (`sortTaxonomy.ts:99-108`), then kind, then curated domain category
  (`sortTaxonomy.ts:84-88`). Domain lookup walks parent labels (`domainCategories.ts:73-78`,
  `registrableDomain.ts:30-39`).
- **Lists.** About 120 hand-picked domains, US-centric (`domainCategories.ts:27-66`).
- **Defaults.** OTP, receipt, shipping, newsletter, social are filed out of the inbox
  (`sortTaxonomy.ts:46-57`).

Caveats:

- **Spoofed From is trusted.** `classifySortBucket("other", "chase.com")` returns "finance"
  (probe). Nothing checks DMARC before giving a message a trusted-looking label. (Inference)
  A spoof from a bank domain that fails DMARC gets the "Finance" label next to real bank mail.
- **Country domains miss.** `amazon.co.uk` → "other" (probe). Only `airbnb.co.uk` has a non-.com
  entry.
- **Shared domains are categorised as a brand.** `google.com` and `microsoft.com` are
  "productivity", so a Google security alert, a Google Play receipt and a Google marketing mail
  share a bucket unless a kind keyword fires. `substack.com`, `medium.com` and `beehiiv.com` are
  one "newsletter" category for thousands of unrelated writers.
- **Client and server disagree.** The client puts an Amazon "has shipped" mail in
  "Order & shipping" (kind wins). The server filter for "Shopping" is `from:(amazon.com OR …)`
  (`serverSort.ts:63-81`) and catches the same mail at delivery. The same message can end up
  with both labels, one filed out, one in place. `serverSort.ts:6-9` documents the limit; the
  intelligence note already showed subject keywords *can* be filters.
- **Outlook `senderContains` is a substring test** (`serverSort.ts:99-119`). (Inference from the
  predicate name, [messageRulePredicates](https://learn.microsoft.com/en-us/graph/api/resources/messagerulepredicates).)
  `paypal.com.evil.io` and `notpaypal.com` contain `paypal.com`, so lookalikes get the Finance
  category and the same `stopProcessingRules`.
- **Sorting hides mail from the security scan.** The security lane queries `in:inbox`
  (`gmailProvider.ts:44`). Anything Sort or a server filter filed out is never threat-scored
  again by the background pass. A phish whose subject says "invoice" is classified receipt,
  filed out by default, and never reaches the Security tab. Verified by code reading.

### A.4 Authentication-Results parsing (`emailAuth.ts`, `unsubscribe.ts`, providers)

- **Inputs.** All `Authentication-Results` header values. The provider picks the first whose
  authserv-id is trusted (`emailAuth.ts:29-48`, `gmailProvider.ts:128`, `outlookProvider.ts:153`).
- **Logic.** `extractVerdict` runs `\b<mech>=([a-z]+)` and takes the **first** match anywhere in
  the string (`emailAuth.ts:50-54`). Unknown tokens become "unknown".
- **Outputs.** spf/dkim/dmarc verdicts used by threat scoring, the auth chip, and (separately)
  the RFC 8058 one-click check (`unsubscribe.ts:35-79`).

Probe results:

| Input (abridged) | Parsed | Truth |
|---|---|---|
| `mx.google.com; dkim=fail …; arc=pass (i=1 spf=pass … dkim=pass … dmarc=pass fromdomain=paypal.com); spf=fail …; dmarc=fail … header.from=paypal.com` | spf pass, dmarc **pass** | dmarc fail |
| `mx.google.com; dkim=none; spf=pass (google.com: domain of dmarc=pass@evil.example designates …) …; dmarc=fail …` | dmarc **pass** | dmarc fail |
| `mx.google.com; spf=softfail …; dmarc=pass` | spf softfail | correct (walkthrough note saw "—" because the chip only maps pass/fail, `securityTab.ts` `authChip`) |
| `mx.google.com; dmarc=bestguesspass` / `dmarc=temperror` | unknown | Microsoft documents `bestguesspass`; temperror/permerror are RFC values. Dropped. |
| `mx.google.com; dkim=pass header.i=@evil.example; dkim=fail header.i=@paypal.com; …` | dkim **pass** | the From-aligned signature failed |
| Microsoft-documented shape `spf=pass (sender IP is …) …;dmarc=pass action=none …;compauth=pass reason=100` | **not trusted** (no authserv-id) | Microsoft's real header |
| `evil.outlook.com; dmarc=pass` | **trusted** | anyone can write that string |

Why it matters:

- **Comment injection.** RFC 8601 allows comments (CFWS) throughout the header
  ([RFC 8601](https://datatracker.ietf.org/doc/html/rfc8601)). Gmail's SPF comment includes the
  envelope sender ("domain of X designates…", visible in public header dumps such as the one
  quoted by [Valimail](https://www.valimail.com/blog/understanding-email-authentication-headers/)).
  RFC 5321 allows `=` in a local part. So the attacker controls text that sits *before* the real
  `dmarc=` token. Effect: `failed-authentication` never fires, and the auth chip shows a green
  DMARC tick on a spoof. (Inference on exploitability in Gmail's live header; the parser bug is
  verified.)
- **ARC comments.** Public Gmail header dumps show `arc=pass (i=1 spf=… dkim=… dmarc=…)` placed
  before `spf=` and `dmarc=` (search summary of
  [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/4687181/arc-email-authentication)
  and [OpenARC issue #66](https://github.com/trusteddomainproject/OpenARC/issues/66); exact
  layout **inferred**). Those inner verdicts are an intermediary's claims. RFC 8617 says ARC
  "does not make any assessment of their trustworthiness" (cited in the intelligence note).
- **Outlook trust boundary.** Microsoft's documented syntax starts directly with `spf=`
  ([Anti-spam message headers](https://learn.microsoft.com/en-us/defender-office-365/message-headers-eop-mdo)).
  If real headers match the docs, `isTrustedAuthenticationResults("outlook", …)` rejects them,
  Outlook auth is always "unknown", and a forged header carrying a trusted-looking id wins
  `find()`. RFC 8601 §7.1 warns exactly about forged headers using the receiver's id, and §5 puts
  the stripping duty on the border MTA ([RFC 8601](https://datatracker.ietf.org/doc/html/rfc8601)).
  Whether Exchange Online strips third-party `*.outlook.com` headers is **unverified**. Needs one
  real Outlook header in the live test.
- **Microsoft gives more than SPF/DKIM/DMARC.** `compauth` with a reason code, plus
  `X-Forefront-Antispam-Report` `SFTY:9.25` (first contact), `9.19`/`9.20` (impersonation) and
  `CAT:` values ([same page](https://learn.microsoft.com/en-us/defender-office-365/message-headers-eop-mdo)).
  Cluster fetches all headers on Outlook already and ignores these.
- **RFC 8058 path is safer** because it anchors on `;\s*dkim=pass` (`unsubscribe.ts:40`). It
  still inherits the Outlook trust-boundary issue (`unsubscribe.ts:24-33`). (Inference) A forged
  Outlook header plus an attacker-written `DKIM-Signature` with `d=` of the From domain would
  mark a POST as "verified". Impact is limited: the POST carries no credentials, and Chrome asks
  per origin (`unsubscribe.ts:129-135`).

### A.5 Threat scoring (`threatSignals.ts`, `senderModel.ts`, `quarantineReview.ts`, `background.ts`)

- **Inputs.** From address and display name, Reply-To, subject, the selected AR header,
  risky-attachment flag.
- **Signals and weights** (`threatSignals.ts:400-411`): blocklisted 6, freemail-brand-claim 5,
  lookalike 4, link-mismatch 4, failed-auth 3, brand-impersonation 3, reply-to 3,
  risky-attachment 3, punycode 2, lure 2. +1 per high-confidence signal (`:418-423`).
- **Tiers.** high ≥ 6, elevated ≥ 3 (`:425-429`). Auto-quarantine (opt-in) acts on "high"
  (`background.ts:171-182`). Release lowers the score by 1, confirm raises it by 1
  (`quarantineReview.ts:30-36`).
- **Brand list.** 37 brands (`data/brandDomains.json`); display-name regex with word boundaries
  (`threatSignals.ts:159-168`). Lookalike: Levenshtein ≤ 2, domain ≥ 6 chars, brand label ≥ 5
  chars, small hand confusables map (`:129-141`, `:179-235`).

Probe results:

| Sender (display / address) | Signals | Tier | Should be |
|---|---|---|---|
| "P**а**yPal" (Cyrillic а) / a@evil.example | none | low | elevated+ |
| "Pay&lt;ZWSP&gt;Pal" / a@evil.example | none | low | elevated+ |
| "PayPalSupport" / a@evil.example | none | low | elevated+ |
| "P a y P a l" / a@evil.example | none | low | elevated+ |
| "Account Team" / a@paypal-secure-login.com | none | low | elevated (combosquat) |
| "Account Team" / a@paypal.com.evil.io | none | low | elevated |
| "service@paypal.com" / a@evil.example | brand-impersonation | elevated | high (address in display name) |
| "PayPal" / a@paypal.com, Reply-To x@evil.example | none | low | elevated |
| "PayPal Service" / x@gmx.de, x@proton.me, x@live.com | brand-impersonation (medium) | elevated | high: these are free-mail too |
| "Spotify Discover Weekly" / no-reply@spotify.com | brand-impersonation (Discover) | elevated | none |
| "Apple Valley Library" / library@applevalley.org | brand-impersonation | elevated | none |
| "Soporte" / subject "Su cuenta ha sido suspendida" | none | low | lure |
| "PayPal" / service@paypal.com with the ARC-comment header above | none | low | high (DMARC fail on a brand) |
| x@xn--pypal-4ve.com | punycode only | low | should be decoded and compared |

Caveats beyond the table:

- **Free-mail domains inside brand allow-lists.** `google: [google.com, gmail.com]`,
  `microsoft: [… outlook.com …]`, `apple: [apple.com, icloud.com]`. The legit-domain check runs
  before the free-mail check (`threatSignals.ts:248` then `:250`), so the highest-confidence
  phishing shape is silenced for the three biggest brands. Locked as known bugs in the audit test.
- **Four free-mail lists disagree.** `threatSignals.ts:121` (7 domains, no live.com/msn.com/gmx/
  mail.ru/yandex/qq/163/proton.me), `domainGrouping.ts:9-19` (9 domains), none of them share
  code. (Inference) One shared, larger list is needed.
- **Remote brand patch widens allow-lists without a signature.** `refreshBrandDomains` merges any
  published domains into a known brand (`threatSignals.ts:82-115`, `remoteDataset.ts:61-83`).
  The comment says a bad publish "can never introduce a brand". But adding `gmail.com` to
  `paypal` is the dangerous direction for an allow-list, and the only check is "string array".
  The malware and spam lists have the same shape (`blocklist.ts:42-57`, `spamList.ts:58-73`):
  publishing `gmail.com` there would flag every stranger on Gmail and feed them to Suggested
  spam. The trust root is one GitHub Pages site (`remoteDataset.ts:10`). (Inference on impact;
  the missing integrity check is verified.)
- **Signals add, they do not combine.** Two medium signals reach "high" (3+3), while
  freemail-brand-claim alone is 6. A person named "Chase Miller" on gmail.com is "high" and
  auto-quarantine moves his mail even if the user has emailed him, because `runQuarantine` does
  not consult `knownSenders` or starred state (`background.ts:171-182`). Verified by code; the
  tier is locked in the audit test.
- **First contact is "first seen since install", not "rarely seen".** The flag is true only on
  the scan where the address first appears (`firstContact.ts:17-37`, `dashboard.ts:568-582`).
  A phisher who mailed once before the dashboard was last opened is "known". Microsoft's tip
  fires on "the first time" *or* "don't often get messages from the sender"
  ([Microsoft](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about)).
  First contact also adds nothing to the score; it only changes copy.
- **Known correspondents are trusted by address alone.** `knownSenders` (allow-list + addresses
  from the last 150 sent messages) protect mail and bypass the Screener
  (`protectionPolicy.ts:61-63`, `screener.ts:51-73`). A DMARC-failing spoof of a known
  correspondent's address gets both. (Inference: the code never checks auth here.)
- **Lure regex is English only** (`threatSignals.ts:288-289`) and only scores 2.
- **Reply-To** only fires for free-mail targets (`:296-308`). The intelligence note covers the
  allow-list fix; noting here that it is also an evasion: point Reply-To at any throwaway
  non-free-mail domain.
- **Risky attachment list is short** (`riskyAttachments.ts:17-19`). Probe: `.svg`, `.lnk`,
  `.one`, `.msi`, `.hta`, `.xlam`, `.zip` and an RTL-override name (`invoice.pdf‮exe.pdf`)
  all return false.
- **Outlook reads `sender`, not `from`** (`outlookProvider.ts:151`). Graph defines `from` as the
  mailbox the message is sent from and `sender` as "the account that is used to generate the
  message", different in delegation and shared-mailbox cases
  ([message resource](https://learn.microsoft.com/en-us/graph/api/resources/message)). Gmail
  scores the From header. (Inference) The two providers judge different identities, and the
  user sees `from` in Outlook.
- **Gmail From parsing is naive** (`gmailProvider.ts:62-71`). `"PayPal <service@paypal.com>" <evil@x.com>`
  yields display `"PayPal` and an address string containing `service@paypal.com>" <evil@x.com`.
  The domain still resolves to `x.com` (last `@`), so scoring survives, but the UI prints the
  misleading string. (Inference on what Gmail returns for such a header.)
- **HTML injection in the explanation card.** `claim.innerHTML` and `actual.innerHTML` interpolate
  `claimedBrand`, `displayName` and `sender.address` (`securityTab.ts:253-264`). The address is
  attacker-shaped (see the parsing point above). The extension CSP `script-src 'self'`
  (`manifest.json:28-30`) blocks inline script, but markup, links and styling can still be
  injected into the one screen built to warn about phishing. Verified in code; exploitability
  depends on what Gmail accepts in From (inferred).

### A.6 Protection policy (`protectionPolicy.ts`)

- **Order** (`protectionPolicy.ts:53-86`): starred/flagged → provider-important
  (`IMPORTANT` or `CATEGORY_PERSONAL`, `gmailProvider.ts:148`; Outlook `focused`,
  `outlookProvider.ts:179`) → known correspondent → active-offer regex → [stop here if
  `contentHeuristics:false`] → receipt/shipping kind → sensitive-subject regex → "other" with no
  bulk header.
- **Regexes.** `SENSITIVE_SUBJECT` and `ACTIVE_OFFER_OR_WINDOW_RE` (`:46-50`).

Probe: every one of these promo subjects is protected.

| Subject | Reason |
|---|---|
| "Offer expires tonight!!" | active-offer-or-window |
| "Your ticket to savings" | sensitive-subject |
| "Booking a demo? 50% off" | sensitive-subject |
| "Tax-free weekend sale" | sensitive-subject |
| "Security alert: you're missing out" | sensitive-subject |
| "Free delivery this weekend" | transactional (kind = shipping) |

Caveats:

- **Protection is purchasable.** (Inference, but the mechanism is verified) Marketers already
  write "expires" and "tickets" in subjects for urgency. Each one silently shrinks the cleanup
  set, and the user is told only a count.
- **Active-offer runs before the spam bail-out.** `suggestSpamSenders` disables content
  heuristics but `ACTIVE_OFFER_OR_WINDOW_RE` still applies (`protectionPolicy.ts:64-67`), and one
  protected message removes the whole sender (`spamSuggestions.ts:57-63`). Probe: a listed spam
  domain with one "Offer expires tonight" subject produces **0** suggestions.
- **Provider importance is a strong, opaque veto.** Gmail's `IMPORTANT` label is set by Gmail's
  own model. Good as a safety signal; but Cluster cannot explain it beyond "Gmail marked it".
- **Known-correspondent ledger is broad.** Anyone in To/Cc of the last 150 sent messages
  (`gmailApi.ts:411-421`), including mailing lists and no-reply addresses you replied to.

### A.7 Retention and expiry (`retentionPolicy.ts`, `expiryTriage.ts`)

- OTP 2 d, newsletter 30 d, social 30 d (`retentionPolicy.ts:9-13`). Age from `internalDate`
  only. Protected messages skipped (`expiryTriage.ts:29`).
- Caveats: the OTP misclassifications in A.1 decide what expires. "Your one-time offer" goes in
  2 days. "Two-factor authentication was disabled" goes in 2 days. "123456 is your code" never
  expires. The intelligence note covers the wider regex; the deeper issue is that a 2-day
  deletion window rests on one regex hit with no second signal.

### A.8 Engagement, never-read, health (`engagementModel.ts`, `neverRead.ts`, `inboxHealth.ts`)

- **Engagement.** EMA of unread ratio, weight 0.35 (`engagementModel.ts:36`). A suggestion needs
  ≥3 safe messages, current unread ≥ 2/3, EMA ≥ 0.7, enough history, and score ≥ 70
  (`:153-177`). Score = 50·ratio + 25·EMA + 3·min(samples,5) + 4·min(accepted,2) − 8·dismissed
  − 25·undone.
  - (Inference) The score is effectively a hard gate: with ratio 2/3 and EMA 0.7 it is about 56,
    so only near-100% unread senders pass. Fine for safety, but the visible "Fit" number implies
    a scale that is not used.
  - **Self-reinforcing loop.** Mail that Cluster muted or sorted out of the inbox stays unread.
    The cleanup lane still sees it (`category:promotions OR category:updates`,
    `gmailProvider.ts:46-47`). So Cluster's own filing makes a sender look more ignored.
    (Inference)
  - Unread is a weak proxy. Many users read in the preview or on a phone notification, or
    "mark all read". Receipts are meant to stay unread (walkthrough note).
  - Dismiss snoozes 30 days and costs 8 points; nothing records *why* it was dismissed.
- **Never read.** ≥3 unprotected messages, all unread (`neverRead.ts:9-18`). Same proxy issue.
- **Health score.** 100 − 45·unreadRatio − 0.5·min(neverOpened,40) − 0.35·min(unsubCapable,50)
  − 15·min(ready/total,1) (`inboxHealth.ts:170-184`). Two terms are absolute counts, so the
  score falls when the sample grows (locked in the audit test).
- **Health metrics skip the protection context.** `buildExpiryBuckets(senders)`,
  `neverReadSenders(senders)` and `suggestSpamSenders(senders)` are called without `ctx`
  (`inboxHealth.ts:45-47`), so Overview counts include known correspondents that the action
  screens later exclude. The hint for "Ready to clean up" mentions shipping, which has no
  retention (intelligence note).

### A.9 Subscriptions and cadence (`subscriptionSignals.ts`, `subscriptionsTab.ts`)

- Trial/renewal regex, else domain list (`subscriptionSignals.ts:95-121`). Covered in depth by the
  walkthrough note §3.6 and the audit test. One addition: `detectSubscriptionSignal` returns
  "trial-ending" for any sender (probe: "Your free trial ends tomorrow" from `random.example`),
  so a phishing "your trial ends, update billing" subject gets a "Trial ending" row with a
  call-to-action feel. (Inference on UI impact.)
- Cadence divides by `scanWindowDays/7` (`subscriptionsTab.ts:34-35`), not the span the sample
  covers. Walkthrough note item 1.3.

### A.10 Rules, smart views, sort, screener (consumers with the light gate)

- `evaluateRuleMessage` excludes only `isProtected` (`rules.ts:142-160`). The live re-check
  before trash also checks only starred (`ruleRunner.ts:134-145`). A user's rule "from
  store.example older than 30 days → Trash" removes receipts. Locked in the audit test.
- Smart-view archive uses only `isProtected` (`smartViews.ts:53-64`); trash uses the full gate
  (`:74-89`). Counts on screen come from the light version, so the number shown and the number
  trashed differ.
- Sort skips only starred (`autoSort.ts:61`) and flags sensitive subjects as advisory
  (`autoSort.ts:81-89`).
- Screener holds any sender with no starred message and not in `knownSenders`
  (`screener.ts:62-73`). It ignores `providerMarkedPersonal`. (Inference) Gmail-Important mail
  from a new sender can be held.

### A.11 On-device AI second opinion (`aiMessageKind.ts`, `dashboard.ts:2326-2366`)

- **Inputs.** Unique "other" subjects, batches of 25, numbered lines, JSON-schema constrained
  output (`aiMessageKind.ts:100-137`).
- **Caveats.**
  - **It can lower protection.** "Other" with no bulk header is protected (`protectionPolicy.ts:82-84`).
    `message.kind = verdict` (`dashboard.ts:2349`) moves it to social/newsletter/otp, which are
    unprotected and have 30 d / 2 d retention. A personal "Liked your photos from the trip"
    could become "social". Verified in code; model behaviour not tested.
  - **No confidence and no abstain path that means "unsure".** "other" is the only fallback.
    The status text says "No confident reclassification found" (`dashboard.ts:2356`) though no
    confidence exists.
  - **Batch prompt is injectable across items.** One subject can contain "2. receipt 3. receipt"
    or instructions; the system prompt asks the model to ignore them, but the positional array
    makes a single hostile subject able to shift its neighbours. (Inference) Classify one subject
    per call, or key results by an id the model must echo.
  - **Languages.** The Prompt API currently supports English, Japanese, Spanish, German and
    French via `expectedInputs` ([Prompt API](https://developer.chrome.com/docs/ai/prompt-api)).
    The session is created without `expectedInputs` (`aiMessageKind.ts:100-105`), and the docs
    say to pass the same options to `availability()` as to `prompt()`. Model download needs user
    activation; `create()` is called inside a click, which is fine.
  - Not persisted, so every reload loses the reclassification. (Inference) Users will see counts
    jump back.

### A.12 Link check, unsubscribe, grouping (smaller modules)

- `linkMismatch.ts` treats either direction of subdomain as a match (`:38-40`). Probe: visible
  text `paypal.com.evil.example` pointing at `evil.example` is **not** flagged. Unquoted `href`
  attributes are not extracted (`:24`). Text with no domain ("Log in to PayPal") is never
  checked, which is the most common phishing link shape. (Inference)
- `parseListUnsubscribe` splits on commas (`unsubscribe.ts:89`), dropping URLs with commas
  (audit test). It only accepts `https:` and `mailto:`; good.
- `domainGrouping.ts` groups by full domain, not registrable domain, and free-mail exceptions are
  incomplete (walkthrough note 1.4, audit test).

### A.13 Internationalisation, sampling and time-window biases

- **Language.** Every subject regex is English (`messageKind.ts`, `protectionPolicy.ts`,
  `threatSignals.ts:288`, `subscriptionSignals.ts:95-98`). For a Spanish or German mailbox,
  almost everything is "other". "Other" without bulk headers is protected, so non-English users
  get a tool that silently does very little. That is safe but invisible. (Inference)
- **Domain lists** are US-centric (`.com` only for most brands).
- **Sample.** Newest 150 messages per account (`settingsStore.ts:132`), lanes Promotions/Updates
  (+ inbox for combined). Effects: per-sender counts are tiny (most senders have 1-3 messages),
  so `minMessages = 3` gates (never-read, engagement) rarely trigger; EMA "samples" accrue only
  when the dashboard is opened; cadence and health use the wrong denominator; the security
  slice is capped at 250 inbox messages (`senderModel.ts:297`). Walkthrough note Phase 2 covers
  the fix.
- **Time.** `older-1y` smart view can never match inside a 180-day window
  (`smartViews.ts:21-25` vs `settingsStore.ts:126`). (Inference from the two constants; the
  `newer_than:180d` query excludes anything older.) Retention uses wall-clock age, so a user
  returning from two weeks away gets every newsletter offered at once.

### A.14 Explainability today

| Decision | Does the UI say why? | Where |
|---|---|---|
| Phishing flag | Yes. Plain reason per signal, auth chip, "claims to be / sent from". | `securityTab.ts:24-49`, `:253-264` |
| Engagement suggestion | Yes. Unread %, history %, "no protected messages". | `engagementModel.ts:185-189`, `dashboard.ts:2471-2483` |
| Protection | Count only ("5 protected"). The reason enum exists and is counted (`protectionPolicy.ts:88-130`) but not shown per message. | `dashboard.ts:2159`, `:2198` |
| Kind / bucket | No. Sort preview offers "wrong bucket?" but not "because the subject contains 'delivery'". | `sortInbox.ts:275-324` |
| Retention | Label and days only. | `expiryTriage.ts` |
| Spam suggestion | One phrase ("spam / throwaway domain"), not which list. | `spamSuggestions.ts:79-81` |
| Screener hold | "New sender". No mention of auth or first contact. | `screener.ts` |
| AI reclassification | Count only. No per-message "AI said social". | `dashboard.ts:2353-2356` |
| Copy errors | "may be impersonating people you know / Display name matches a known contact" for brand lookalikes. | `dashboard.ts:933-934`, `securityTab.ts:258-259` |

### A.15 Caveats table

Severity: **High** = can delete or hide mail the user needs, or lets a phish look safe.
**Med** = wrong result the user will notice, or a defence that is easy to evade.
**Low** = cosmetic, rare, or already contained by another gate.

| # | Module | Caveat | Example | Severity | Evidence |
|---|---|---|---|---|---|
| 1 | emailAuth | First `dmarc=` token anywhere wins, including attacker-controlled comments | `smtp.mailfrom="dmarc=pass"@evil` → dmarc pass | High | verified (parser); live Gmail header inferred |
| 2 | emailAuth | ARC comment verdicts read as Gmail's own | `arc=pass (… dmarc=pass …); … dmarc=fail` → pass | High | verified (parser); Gmail layout inferred |
| 3 | emailAuth / outlookProvider | Microsoft's documented AR header has no authserv-id, so it is never trusted; a forged `*.outlook.com;` header is | `evil.outlook.com; dmarc=pass` trusted | High | verified (code + MS docs); live header unverified |
| 4 | threatSignals | gmail.com / outlook.com / icloud.com listed as brand domains, so free-mail brand claims are silent | "Google Security" <x@gmail.com> → no signal | High | verified (audit test) |
| 5 | aiMessageKind | AI reclassification of "other" removes no-bulk-signal protection | personal mail → "social" → 30-day expiry | High | verified (code) |
| 6 | protectionPolicy | Promo keywords buy permanent protection | "Your ticket to savings", "Tax-free weekend sale" | Med | verified (probe) |
| 7 | spamSuggestions | One "expires" subject hides a listed spam sender | 0 suggestions | Med | verified (probe) |
| 8 | messageKind / retention | Security notices classed as OTP and expire in 2 days | "Two-factor authentication was disabled" | High | verified (probe + regex) |
| 9 | messageKind | English-only regexes; common OTP/delivered shapes missed | "123456 is your code", "Your order has been delivered", all non-English | Med | verified (probe) |
| 10 | rules / ruleRunner | Rules honour only starred, not the protection policy | Trash rule removes receipts | High | verified (audit test) |
| 11 | threatSignals | Display-name brand match evaded by homoglyph, zero-width, no-space, spaced letters | "PаyPal", "PayPalSupport" → low | Med | verified (probe) |
| 12 | threatSignals | No combosquat / brand-as-subdomain detection | `paypal-secure-login.com`, `paypal.com.evil.io` → low | Med | verified (probe) |
| 13 | threatSignals | Brand words in ordinary names cause false flags | "Spotify Discover Weekly", "Apple Valley Library", "Chase Miller" | Med | verified (probe, audit test) |
| 14 | background quarantine | Auto-quarantine ignores known correspondents and starred | "Chase Miller" you email weekly is quarantined | High (opt-in) | verified (code) |
| 15 | threatSignals / data | Remote dataset can widen allow-lists and block-lists with no signature | publish `gmail.com` to `paypal` or to malware list | Med | verified (code); impact inferred |
| 16 | sortTaxonomy / serverSort | Spoofed or lookalike From gets a trusted category label | DMARC-fail `chase.com` → "Finance"; Outlook `senderContains` substring | Med | verified (probe); Outlook substring inferred |
| 17 | gmailProvider / sort | Sorted-out mail leaves the `in:inbox` security scan | "Invoice overdue" phish → receipt → filed out → never scored again | Med | verified (code) |
| 18 | firstContact | "First seen since install", not "rarely seen"; adds no score | phisher's second message is "known" | Med | verified (code) |
| 19 | protectionPolicy / screener | Known correspondent trusted by address alone, no auth check | spoof of a contact's address is protected and skips Screener | Med | inferred |
| 20 | outlookProvider | Scores `sender`, not `from` | delegated / on-behalf mail judged on the wrong identity | Med | verified (code + Graph docs) |
| 21 | securityTab | `innerHTML` with attacker-shaped address/display name | markup injection into the warning card | Med | verified (code); Gmail acceptance inferred |
| 22 | engagement / neverRead | Unread as disinterest; Cluster's own filing inflates it | muted senders look more ignored | Med | inferred |
| 23 | inboxHealth | Metrics computed without protection context; absolute-count terms | counts differ from action screens; score drops when sample grows | Low | verified (code, audit test) |
| 24 | threatSignals | Free-mail list incomplete and duplicated | gmx.de / proton.me / live.com brand claim only "medium" | Med | verified (probe) |
| 25 | riskyAttachments | Missing modern lures | `.svg`, `.lnk`, `.one`, `.hta`, RTL override → false | Med | verified (probe) |
| 26 | linkMismatch | Symmetric subdomain test; unquoted href; no-domain text never checked | text `paypal.com.evil.example` → evil.example not flagged | Low | verified (probe) |
| 27 | emailAuth | `bestguesspass`, `temperror`, `permerror`, `compauth` dropped | MS bestguesspass → unknown | Low | verified (probe) |
| 28 | aiMessageKind | Positional batch output, no confidence, no language option, not persisted | one hostile subject shifts neighbours | Med | inferred |
| 29 | smartViews | `older-1y` cannot match inside the 180-day query | always 0 | Low | inferred (constants) |
| 30 | explainability | Protection, kind, bucket and AI decisions show counts, not reasons; phishing copy says "people you know" for brands | "5 protected" | Med | verified (code) |

---

## Part B. How competitors and the field do it

### B.1 Products

| Product | How it decides | What learns | Explains? | Source |
|---|---|---|---|---|
| **SaneBox** | Server-side sorting into SaneLater etc. | "Just move the email to the correct folder, and we'll get it right next time!" | Not documented | [SaneBox training](https://www.sanebox.com/help/training) |
| **Clean Email** | Smart Folders (Online Shopping, Rideshare, Food Delivery…) as categories; Auto Clean rules on sender, domain, age, status, keywords, Smart Folder | Rules are explicit; no learning documented | Rules are visible | [Auto Clean](https://clean.email/help/auto-clean/overview), [Smart Folders](https://clean.email/help/basics/smart-folders) (via search summary) |
| **Shortwave** | AI filters written in plain English, plus search-query filters; splits by importance, labels, senders | Prompt-defined | Filter text is the explanation | [Shortwave settings](https://www.shortwave.com/docs/guides/customize-your-shortwave-settings/) (via search summary) |
| **Superhuman** | Auto Labels from "deterministic criteria (From, To, Subject, etc.) or an AI prompt", AND/OR, exclusions; applied to new mail and the last 14 days | Prompt-defined | Label definition visible | [Auto Labels](https://help.superhuman.com/hc/en-us/articles/40127432866323-Auto-Labels) (403 on fetch; via search summary) |
| **Gmail categories** | Five fixed tabs | "Drag and drop the email to the correct category tab… this helps Gmail learn your preferences" | No | [Gmail Help](https://support.google.com/mail/answer/3094499) |
| **Gmail spam** | TensorFlow models over "thousands of potential signals", personalised because "what one person considers spam another person might consider an important message"; about 100M extra spam/day | Per-user | No | [Google Workspace blog](https://workspace.google.com/blog/product-announcements/ridding-gmail-of-100-million-more-spam-messages-with-tensorflow) |
| **Gmail RETVec** | Character-level vectoriser "resilient against… insertion, deletion, typos, homoglyphs, LEET"; ~200k parameters; spam detection +38%, false positives −19.4% | n/a | No | [arXiv 2302.09207](https://arxiv.org/abs/2302.09207); figures via [The Hacker News](https://thehackernews.com/2023/11/google-unveils-retvec-gmails-new.html); Google blog body **not reached** |
| **Outlook Focused Inbox** | Learns "from who you reply to and who you ignore, who you flag, pin, or categorize… explicit Always-move corrections, and server-wide patterns… for known bulk senders" | Per-user + global | No | [Microsoft Support](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978) (via search summary) |
| **Defender for O365** | Spoof intelligence, composite auth with reason codes, first-contact tip ("first time" or "don't often"), user/domain impersonation, "unusual characters" tip, mailbox intelligence that suppresses impersonation verdicts when "the sender and recipient previously communicated" | Contact graph | Safety-tip text + reason codes | [Anti-phishing policies](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about), [headers](https://learn.microsoft.com/en-us/defender-office-365/message-headers-eop-mdo) |
| **Apple Mail** | Primary, Transactions, Updates, Promotions; time-sensitive items also shown in Primary | Per-sender recategorise (page body **not reached**) | No | [Apple Support](https://support.apple.com/guide/iphone/use-categories-iphfe4a36baf/ios) (via search summary) |
| **HEY Screener** | First email from anyone waits for yes/no; "Screener History"; screening in later shows mail "within the last 90 days" | Explicit user decision | The decision is the explanation | [HEY](https://www.hey.com/features/the-screener/) |
| **Proton / Fastmail** | User rules and Sieve scripts | None | Rules are explicit | [Proton Sieve](https://proton.me/support/sieve-advanced-custom-filters), [Fastmail Sieve](https://www.fastmail.help/hc/en-us/articles/1500000280481-Using-Sieve-scripts-in-Fastmail) (via search summary) |

Takeaways (Inference):

- The products that feel smart learn from **corrections the user already makes** (move, drag,
  always-move). Nobody asks users to label training data.
- The products that feel trustworthy show **the rule** (Clean Email, Superhuman criteria, HEY's
  explicit decision). Cluster's Rules screen already fits this pattern. Its automatic decisions
  do not.
- Two Apple and Microsoft details are directly copyable: "time-sensitive mail also shows in
  Primary" (an override channel for protection) and "don't often get email from" (a rate, not a
  first-seen bit).
- Microsoft's mailbox intelligence is the right model for the known-correspondent shortcut:
  history *suppresses* impersonation verdicts, it does not grant blanket trust.

### B.2 Standards and data that fit on-device

- **RFC 8601 trust boundary.** Consumers should ignore Authentication-Results using the receiver's
  id unless the border MTA is known to strip forgeries (§7.1). A "pass" "does not render the
  message trustworthy" (§7.2). Comments may appear anywhere
  ([RFC 8601](https://datatracker.ietf.org/doc/html/rfc8601)). The rfc-editor.org copy was
  **not reached** (connection reset); datatracker served the same text.
- **DMARC is RFC 9989** and **ARC (RFC 8617) is Experimental and does not vouch for
  intermediaries**. Both verified in the intelligence note §4a; not repeated.
- **Microsoft composite authentication** (`compauth`, reason codes 000-905) is a richer verdict
  than raw DMARC and is already in Outlook headers Cluster fetches
  ([Microsoft](https://learn.microsoft.com/en-us/defender-office-365/message-headers-eop-mdo)).
- **Unicode TR39 skeleton.** `internalSkeleton` = NFD, remove Default_Ignorable code points,
  map via confusables, NFD again; the data covers single-, mixed- and whole-script confusables
  ([UTS #39](https://www.unicode.org/reports/tr39/)). Removing default-ignorables is exactly the
  zero-width-space fix, and the same skeleton applies to display names, not just domains.
- **Public Suffix List** gives registrable-domain boundaries. Its own docs warn that embedding
  a static copy without updates "is dangerous" for validity checks
  ([PSL](https://publicsuffix.org/learn/)). (Inference) For grouping and brand matching a
  build-time copy refreshed each release is acceptable; do not use it to reject domains.
- **Chrome built-in AI.** Prompt API: desktop only, ≥22 GB free disk, GPU >4 GB VRAM or 16 GB
  RAM / 4 cores; `responseConstraint` JSON Schema; `expectedInputs` languages en/ja/es/de/fr;
  download needs user activation ([Prompt API](https://developer.chrome.com/docs/ai/prompt-api)).
  Language Detector: stable from Chrome 138, returns `{detectedLanguage, confidence}`, and warns
  "very short phrases and single words should be avoided"
  ([Language Detector](https://developer.chrome.com/docs/ai/language-detection)). Subjects are
  short, so detect language per sender over many subjects, not per message. (Inference)

### B.3 Learning methods suitable for a no-server extension

- **Per-user naive Bayes / logistic regression.** Graham's argument still holds: "each user
  should have his own per-word probabilities", which "makes it hard for spammers to tune mails"
  because a seed filter tells them nothing about trained ones
  ([A Plan for Spam](https://www.paulgraham.com/spam.html)). On-device, the model is a few
  thousand weights.
- **Calibration.** Naive Bayes outputs are pushed toward 0 and 1; Platt scaling or isotonic
  regression fixes this ([Niculescu-Mizil & Caruana, ICML 2005](https://dblp.org/rec/conf/icml/Niculescu-MizilC05.html)).
  (Inference) With per-user data in the tens to hundreds of labels, use Platt (two parameters),
  not isotonic.
- **Reason codes.** US Regulation B requires "a statement of specific reasons" that "must be
  specific and indicate the principal reason(s)", and notes "disclosure of more than four reasons
  is not likely to be helpful"; vague "internal standards" or "failed to achieve a qualifying
  score" statements are insufficient
  ([12 CFR 1002.9](https://www.consumerfinance.gov/rules-policy/regulations/1002/9/)). (Inference)
  That is a good product spec for Cluster: up to four concrete reasons per decision, never "score
  too low".
- **Active learning.** Ask about the cases nearest the decision boundary, not random ones.
  (Inference; standard uncertainty sampling.) In UI terms: one "Is this a receipt?" chip on the
  two or three least certain rows per screen.
- **Rule + model hybrid.** (Inference) Hard rules stay as the floor (starred, Important, known
  correspondent with passing auth, vault). The model can only *rank* and *suggest* inside what
  the rules allow. It can never remove a protection by itself.

### B.4 Adversarial evasion and defences

- **Imperceptible character attacks.** One invisible character, homoglyph, reordering or deletion
  degrades commercial NLP models; "with three injections most models can be functionally
  broken". Authors recommend "careful input sanitization"
  ([Boucher et al., IEEE S&P 2022, arXiv 2106.09898](https://arxiv.org/abs/2106.09898)). Cluster's
  display-name and subject regexes fail on a single such character (probe).
- **Combosquatting.** Brand + phrase domains (`youtube-live.com`); almost 60% of abusive ones
  live more than 1,000 days; used for phishing and APTs
  ([Kintis et al., CCS 2017](https://doi.org/10.1145/3133956.3134002)). Edit distance cannot see
  them; token containment of a brand label in the registrable domain can.
- **Robust encoders.** RETVec's design target is exactly these manipulations (B.1).
- **Header-level gaming.** RFC 8601 §7 (forged results), ARC trust (RFC 8617) and Cluster's own
  parser bugs (A.4).
- **Defences that fit (Inference):** normalise before matching (TR39 skeleton, strip
  default-ignorables and bidi controls, NFKC for display names); prefer structural signals the
  attacker cannot cheaply change (DMARC-aligned identity, sender history, registrable domain age
  is not available without a server, so skip it); make protective rules require two independent
  signals; never let attacker-controlled text lower a safety gate.

### B.5 Privacy-preserving personalisation

- Store **feature counts per class**, not text: e.g. `{token: "deliver", class: shipping, n: 7}`
  or hashed tokens. Keep sender-level aggregates as `engagementModel.ts` already does.
  (Inference)
- Hash tokens with a per-install salt so an exported settings blob does not reveal subject words.
  (Inference) Note: feature hashing of short subjects is still guessable by dictionary; the salt
  only stops cross-install linking.
- **Federated learning is out of scope.** It needs a coordinating server to aggregate model
  updates, which contradicts "no server", and with a 100-user Testing cap there is no population
  to learn from. (Inference) Global priors ship as a static, signed data file instead, the same
  way the blocklist does.

---

## Part C. Recommendations

### C.1 Algorithm upgrades

Effort: S = days, M = 1-2 weeks, L = weeks. No item needs a new OAuth scope or body access.

| # | Change | Fixes caveat | How it works on-device | Expected impact | Effort | Risk | Files |
|---|---|---|---|---|---|---|---|
| U1 | **Tokenised AR parser.** Split on `;` outside comments, strip `(…)` comments, take the method token at the start of each resinfo. Ignore `arc=` sub-results. Prefer the dkim result whose `header.d`/`header.i` aligns with From. Accept `bestguesspass`, `temperror`, `permerror`, and parse `compauth` + reason. | 1, 2, 27 | Pure string parsing | Removes a spoof-to-pass path. Tests with crafted local parts and ARC comments. | S | Low | `src/lib/emailAuth.ts`, `src/lib/unsubscribe.ts:35-49` |
| U2 | **Outlook trust boundary.** Use Microsoft's real shape: trust the AR header Exchange stamps (verify on a live header which one that is), or fall back to `compauth` / `X-Forefront-Antispam-Report`. Drop the `*.outlook.com` suffix trust. Read `from`, not `sender`; record both and flag when they differ. | 3, 20 | Fields already in `internetMessageHeaders`; add `from` to `$select` | Outlook auth becomes real data instead of "unknown" | S | Medium: needs one live header to confirm | `src/lib/emailAuth.ts:29-41`, `src/lib/providers/outlookProvider.ts:138-179` |
| U3 | **Identity normalisation.** One `normalizeIdentity()` for display names and domains: NFKC, strip default-ignorables and bidi controls, TR39 skeleton from vendored `confusables.txt`, collapse spaces between single letters. Match brands on the skeleton. Decode `xn--` and compare the decoded skeleton. | 11, 24 | Build-time vendored data (as blocklist) | Closes the four probe evasions | S-M | Low; bundle size a few hundred KB if full table, far less for Latin/Cyrillic/Greek | `src/lib/threatSignals.ts:159-235`, new `src/lib/identity.ts`, `scripts/` |
| U4 | **Brand model v2.** Separate `freemail` from `brandDomains`: never list gmail.com / outlook.com / icloud.com as brand-owned. Add sending aliases (`facebookmail.com`…). Add combosquat check: brand label as a token in the registrable domain or as a left-hand label of an unrelated registrable domain. Brand match requires the brand as a whole name token, plus a stop-list of common-word brands ("discover", "chase", "apple", "ups") that need a second signal. | 4, 12, 13, 24 | Data + PSL | Fixes Google/MS/Apple free-mail misses and the Chase/Discover/Apple Valley FPs | M | Medium: tune with the corpus (C.4) | `src/lib/data/brandDomains.json`, new `src/lib/data/freemail.json`, `src/lib/threatSignals.ts`, `src/lib/registrableDomain.ts` |
| U5 | **Combine signals with an explicit rule table**, not a sum. Example: `high` needs (identity claim) AND (auth not aligned-pass OR first contact), or blocklist alone. Known-correspondent history with aligned DMARC pass *suppresses* brand/display-name verdicts (Microsoft's mailbox-intelligence pattern). | 13, 14, 19 | Pure logic | Fewer false "high"; reason codes fall out naturally | M | Medium: re-baseline tests | `src/lib/threatSignals.ts:396-429`, `src/background.ts:171-182` |
| U6 | **Sender-rate first contact.** Store per sender `{firstSeen, lastSeen, count, dmarcPassCount}` (counts only). "Rare" = fewer than N messages over M days. Feed into U5. | 18 | Extend `knownSenders` ledger | Matches Microsoft's "don't often" | S | Low | `src/lib/firstContact.ts`, `src/lib/settingsStore.ts` |
| U7 | **One protection policy, everywhere, with reason codes.** Every consumer (rules, ruleRunner trash re-check, smart-view archive and counts, Sort, Screener, quarantine) calls `protectionDecision`. Rules may *opt in* to override specific soft reasons with a visible toggle ("include receipts"). Quarantine skips known correspondents unless auth fails. | 10, 14, 23 | Pure logic | Ends cross-screen disagreement | M | Low-Med | `src/lib/rules.ts:142-160`, `src/lib/ruleRunner.ts:134-145`, `src/lib/smartViews.ts`, `src/lib/autoSort.ts`, `src/lib/screener.ts`, `src/background.ts`, `src/lib/inboxHealth.ts:45-47` |
| U8 | **Two-signal protection and two-signal deletion.** Soft protections (active-offer, sensitive-subject) need corroboration: no List-Unsubscribe, or `Auto-Submitted`, or a transactional domain, or `CATEGORY_UPDATES`. A promo with List-Unsubscribe + "tickets to savings" is not protected. Conversely OTP expiry needs a code-shaped token or `Auto-Submitted` *and* no security-notice words. Spam suggestions ignore active-offer (it is content). | 6, 7, 8 | Pure logic on fetched headers | Smaller, more honest protected set; security notices kept | S | Medium: some true windows lose protection; mitigate with the vault (intelligence note) | `src/lib/protectionPolicy.ts:46-86`, `src/lib/messageKind.ts`, `src/lib/spamSuggestions.ts:57-63` |
| U9 | **Kind as scored features, not first-match regex.** Features: keyword families per kind and language, digit-run shape, order-number shape, `Auto-Submitted`, List-Unsubscribe, `Precedence`, `CATEGORY_*` label, curated domain category, local part (`no-reply`, `verify`). A tiny linear model with shipped weights (hand-set first, learned later) returns kind + margin. Low margin = "other" (protected). | 8, 9 | Pure | Fixes order bugs; adds confidence | M | Medium | `src/lib/messageKind.ts`, `src/lib/senderModel.ts:100-110`, `src/lib/providers/gmailProvider.ts` (expose `labelIds`) |
| U10 | **Language-aware keyword packs.** Detect a sender's language from several subjects with the Language Detector API, apply es/de/fr/pt/hi keyword packs. Fall back to English. | 9 | Chrome 138 Language Detector, stable for extensions | Non-English mailboxes start working | M | Low | `src/lib/messageKind.ts`, new `src/lib/locale/*.ts` |
| U11 | **Per-user learned layer.** Logistic regression (or multinomial NB) on hashed subject tokens + header features, trained only on the user's corrections (C.2). Platt-calibrated. It may re-rank suggestions and propose a kind; it may never remove a hard protection. | 22, plus general accuracy | Plain JS, a few KB of weights in `chrome.storage.local` | Gets better per user, resists tuning (Graham) | L | Medium: needs evaluation harness first | new `src/lib/personalModel.ts`, `src/lib/engagementModel.ts`, `src/lib/settingsStore.ts` |
| U12 | **AI guard rails.** AI may only *raise* protection or move "other" → receipt/shipping. It may not move protected "other" to an unprotected kind unless the message already has a bulk header. One subject per prompt or id-keyed output. Pass `expectedInputs` languages. Show "AI" as a reason code. Persist verdicts as counts per sender, not subjects. | 5, 28 | Prompt API | Removes the one path where a model weakens safety | S | Low | `src/lib/aiMessageKind.ts`, `src/dashboard/dashboard.ts:2326-2366` |
| U13 | **Engagement v2.** Exclude messages Cluster itself filed out from the unread ratio (track mute/sort label ids). Add "opened later" (unread→read transitions between scans, via `history.list`). Treat transactional kinds as neutral. Show the Fit score only when it actually varies, or drop it. | 22 | Labels + history already in scope | Less self-reinforcing advice | M | Low | `src/lib/engagementModel.ts`, `src/lib/incrementalSync.ts`, `src/lib/neverRead.ts` |
| U14 | **Signed datasets.** Ship an Ed25519 public key in the extension; publish `brandDomains.json` etc. with a detached signature; verify with WebCrypto before caching. Reject patches that add free-mail domains to brands or common domains (gmail.com, outlook.com…) to block-lists. | 15 | WebCrypto Ed25519 (Inference: confirm Chrome support version) | Closes the single-site trust root | S | Low | `src/lib/remoteDataset.ts`, `src/lib/threatSignals.ts:82-115`, `src/lib/blocklist.ts`, `src/lib/spamList.ts`, `.github/workflows/publish-datasets.yml` |
| U15 | **Auth-gated categories.** Only give curated-domain categories (and server filters) to mail whose From domain is DMARC-aligned pass. Unauthenticated look-alikes stay unsorted and stay in the inbox for the security scan. Outlook rule: use exact `fromAddresses`/domain predicate rather than `senderContains` where possible. | 16, 17 | Already-parsed verdicts | Phish stops getting trusted labels; security scan keeps seeing it | S | Low | `src/lib/sortTaxonomy.ts`, `src/lib/autoSort.ts`, `src/lib/serverSort.ts:99-119`, `src/lib/providers/gmailProvider.ts:43-47` |
| U16 | **Security scan sees filed mail.** Security lane = `newer_than:Nd -in:spam -in:trash` with a cap, or include Cluster's own labels. | 17 | Query change | Closes the "sorted then forgotten" hole | S | Low: quota +a little | `src/lib/providers/gmailProvider.ts:43-47` |

Smaller fixes worth bundling with U1-U4 (S each): asymmetric subdomain test in
`linkMismatch.ts:38-40` (display domain must be the parent, never the child); quoted and unquoted
`href`; add `.svg .lnk .one .hta .msi .xlam` and RTL / bidi control detection to
`riskyAttachments.ts` (archives like `.zip` stay out: their contents are not visible from
metadata); RFC 2369-aware List-Unsubscribe split on `>,`
not `,`; `textContent` instead of `innerHTML` in `securityTab.ts:253-264` and the "people you
know" copy in `dashboard.ts:933-934`.

### C.2 "Explain why" design

**Reason codes.** One shared enum used by every decision. Each decision returns
`{ verdict, confidence: "high"|"medium"|"low", reasons: ReasonCode[] (max 4, strongest first) }`.
(Inference, modelled on 12 CFR 1002.9's "principal reasons".)

| Code | Plain text shown | Produced by |
|---|---|---|
| `STARRED` | You starred this | protection |
| `PROVIDER_IMPORTANT` | Gmail marked it Important / Outlook put it in Focused | protection |
| `CORRESPONDENT` | You've emailed this address (and it passed DMARC) | protection, threat suppressor |
| `SUBJECT_WINDOW:<word>` | Subject mentions "<word>" (a deadline or return window) | protection |
| `SUBJECT_SENSITIVE:<word>` | Subject mentions "<word>" | protection |
| `KIND:<kind>:<feature>` | Looks like a receipt: subject has "invoice" | kind |
| `NO_BULK_HEADERS` | No unsubscribe or bulk headers, so probably a person | protection |
| `AGE:<days>` | Older than your <n>-day setting for <kind> | expiry |
| `UNREAD_RATE:<pct>` | You left <pct>% of their last <n> unread | engagement |
| `RULE:<id>` | Your rule "<name>" | rules |
| `AUTH:DMARC_FAIL` / `AUTH:COMPAUTH_FAIL:<reason>` | The sender's domain failed its own check | threat |
| `BRAND_CLAIM:<brand>` / `LOOKALIKE:<brand>` / `COMBOSQUAT:<brand>` | Name says <brand>, address is not <brand>'s | threat |
| `RARE_SENDER` | You've had <n> messages from them in <m> days | threat, screener |
| `LIST:<name>` | Domain is on <list name> (updated <date>) | spam, threat |
| `AI:<kind>` | On-device AI thinks this is a <kind> | AI |
| `USER_CORRECTION` | You corrected this before | personal model |

**Confidence.** Deterministic rules give "high". Single-keyword decisions give "medium". Model
outputs map calibrated probability to bands (≥0.9 high, 0.7-0.9 medium, else low and never acted
on automatically). (Inference)

**Where it shows (mapped to existing UI).**

- Protected rows: replace "N protected" with grouped chips ("3 receipts · 2 you starred · 1 'ticket'")
  in `dashboard.ts:2159`, `:2198`, `:2818`, using the counts already in `protectionReasons`
  (`protectionPolicy.ts:88-130`).
- Sort preview: a "why" line under each sender ("Order & shipping: subject has 'shipped'") next
  to the existing "wrong bucket?" select (`sortInbox.ts:275-324`).
- Organize/engagement: keep `reasons` (`engagementModel.ts:185-189`), switch to codes.
- Security card: `describeSignal` (`securityTab.ts:24-49`) already reads like reason codes; add
  confidence and the combining rule ("High because: name says PayPal + DMARC failed").
- Expiry buckets and smart views: one reason line per bucket.
- Recently done (`recentTab.ts`): store reason codes in the action log entry, so undo screens
  can say why something was moved.

**"This is wrong" correction loop.**

1. Every row with an automatic decision gets a small "Not right?" control (one per row, inside
   the existing "…" menu the walkthrough note recommends).
2. Choices are concrete, not free text: "This is a receipt / code / newsletter / person",
   "Keep this sender", "This is really them", "This is not them".
3. Each correction writes three things (Inference):
   - a **hard override** for that sender (exists today for sort: `SortOverride`,
     `sortTaxonomy.ts:90-109`; generalise it to kind and protection),
   - a **feature-count update** for the personal model (hashed tokens + header features with the
     corrected label; no subject text stored),
   - an **engagement feedback** event (exists: `recordEngagementFeedback`).
4. "This is really them" on a phishing card writes a `quarantineReview` verdict (exists) *and*
   a brand-alias candidate the user can approve ("treat mail.brand.com as Brand"), stored
   locally.
5. Active learning: after a scan, pick up to three rows with the lowest margin and show a single
   "Quick check" card on Overview. Never more than three per day. (Inference)

### C.3 Security hardening list (algorithm and action paths)

1. Tokenised Authentication-Results parser; ignore comments and `arc=` sub-results (U1).
2. Outlook: trust only the header shape Exchange stamps, verified once live; use `compauth`; read
   `from` (U2).
3. Never let attacker-controlled text **lower** a safety gate: AI may not unprotect (U12);
   subject keywords alone may not unprotect or delete (U8).
4. Never let attacker-controlled text **raise** trust without auth: categories, known-correspondent
   protection and Screener bypass require aligned DMARC pass (U5, U15).
5. Normalise identities before any match (U3).
6. Sign remote datasets and refuse allow-list widening to free-mail or common domains (U14).
7. Auto-quarantine respects known correspondents with passing auth and starred mail; cap
   per-run volume; log reason codes (U5, U7).
8. Security scan covers mail Cluster filed out (U16).
9. Use `textContent` for every header-derived string in the dashboard (`securityTab.ts:253-264`).
10. Deep scan: refuse OTP / magic-link mail (intelligence note item 4) and never fetch link
    targets; it already only parses.
11. One-click unsubscribe: keep `redirect: "error"`, `credentials: "omit"` (`unsubscribe.ts:147-156`);
    additionally require that the POST host's registrable domain equals the DKIM `d=` registrable
    domain or a known ESP list, so a "verified" header cannot point POSTs at an unrelated host.
    (Inference)
12. Rules drafted by AI stay disabled until reviewed (already true, `aiRuleDraft.ts:118`) and must
    pass `ruleGuardWarning` plus the unified protection gate.

### C.4 Evaluation plan

**Fixture corpus (synthetic, no real mail).**

- Extend `src/test/mailFixtures.ts` with a labelled corpus file, e.g. `src/test/corpus/*.ts`,
  each item `{ meta: NormalizedMessageMetadata, labels: { kind, shouldProtect, shouldExpire,
  threatTier, bucket } , tags: ["i18n:de", "adversarial:homoglyph", …] }`.
- Sources for items: the probe inputs in this note; every `it.fails` case in
  `algorithmAudit.test.ts`; synthetic variants generated by a script (case, spacing,
  zero-width insertion, homoglyph swap, language packs); hand-written realistic headers for
  Gmail and Microsoft AR shapes, including ARC and comment injection.
- Target size: ~300 items to start, at least 20 per class and 30 adversarial. (Inference)
- No real subjects from the user's mailbox in the repo, ever.

**Metrics in vitest.**

- A `src/lib/evaluation.test.ts` that runs the full pipeline over the corpus and computes
  per-class precision and recall for kind, protection (treat "protected when it should be" as the
  positive class, so recall = safety), threat tier (high and elevated as positives) and bucket.
- Assert floors, not exact numbers: e.g. protection recall ≥ 0.99, threat-high precision ≥ 0.9,
  OTP precision ≥ 0.95. Print a confusion matrix on failure. (Inference on thresholds; set them
  from the first run and ratchet upward.)
- Keep `algorithmAudit.test.ts`'s `it.fails` pattern for known bugs. When a fix lands, the test
  flips and the metric floor rises in the same commit.
- Adversarial suite: each evasion transform applied to every positive threat item; report the
  "survival rate" (fraction still flagged). Target 1.0 for zero-width and case, ≥ 0.9 for
  homoglyphs.

**Measuring on the user's own mailbox, locally, without export.**

- A hidden "Accuracy check" panel in the dashboard (dev flag) that samples N decisions from the
  current scan, shows them one by one with the reason codes, and asks right/wrong. Results are
  stored only as counts per (decision type, reason code, right/wrong) in `chrome.storage.local`.
  (Inference)
- Passive signals as a second source: undo rate per reason code (from `actionLog`), release vs
  confirm rate for quarantine (exists), "wrong bucket?" override rate per bucket (exists),
  dismiss rate per engagement reason. These are already local; they just need aggregating.
- Display: "Receipts detection: 41 right, 2 wrong in your checks" in Settings. Nothing leaves the
  browser. An optional "copy anonymised counts" button lets the user share numbers by hand if
  they choose.

### C.5 Phased roadmap

Slots after the earlier notes. Walkthrough note: Phase 0 (first run), Phase 1 (trust and
accuracy), Phase 2 (coverage), Phase 3 (UI calm), Phase 4 (reach). Intelligence note: 1b, 2b,
2c, 3b.

- **Phase 1s: algorithm security (S, ~1 week). Do alongside walkthrough Phase 1.1.**
  U1 AR parser, U2 Outlook trust (after one live header), U12 AI guard rails, U14 signed
  datasets, U15 auth-gated categories, U16 security scan coverage, `textContent` fix, small
  attachment/link fixes. U4's free-mail split is the same change as walkthrough 1.1, so do it
  once.
- **Phase 1t: one policy, with reasons (M).** U7 unified protection gate, U8 two-signal
  protection and expiry, reason-code enum and the protected-chip UI (C.2). This also delivers
  walkthrough 1.5.
- **Phase 1u: evaluation harness (M).** Corpus, metrics test, adversarial suite (C.4). Every later
  phase must move a metric.
- **Phase 2 (existing coverage)**, then **Phase 2a: identity (M).** U3 normalisation, U4 brand
  model v2 with combosquat, U5 rule-table combining, U6 sender-rate first contact. Needs PSL from
  intelligence note item 12.
- **Phase 3 (existing UI calm)** includes the "Not right?" control and the protected chips.
- **Phase 3a: language (M).** U9 feature-based kind, U10 language packs.
- **Phase 4a: learning (L).** U11 personal model, U13 engagement v2, active-learning "Quick check",
  local accuracy panel.

### C.6 Open questions for the user

1. **Protection vs. cleanup trade-off.** U8 makes some promos deletable that are protected today.
   Is "fewer false protections, but a vault for real windows" the direction you want, or should
   anything that says "ticket" stay untouchable?
2. **Security notices.** Should account-security mail (2FA changed, new sign-in, password reset)
   be its own protected kind that never expires, separate from codes?
3. **AI scope.** Is the on-device model allowed to *only* add protection, never remove it (U12)?
   That makes it much less useful for decluttering "other", but safe.
4. **Outlook header check.** Can you paste one real Outlook.com / Microsoft 365
   `Authentication-Results` and `X-Forefront-Antispam-Report` header from your own mail? U2
   depends on it.
5. **Signed datasets.** OK to add a build-time signing key and a signature file to the GitHub
   Pages publish (U14)? Where should the private key live?
6. **Personal model storage.** Hashed token counts in `chrome.storage.local` are not readable as
   text but are guessable for common words. Acceptable, or limit the model to header features
   only?
7. **Corpus.** Do you want the synthetic corpus to include non-English packs from day one, and
   which languages matter to you (the Prompt API covers en/ja/es/de/fr)?
8. **Auto-quarantine default.** It is opt-in today. After U5, should "high" stay label-only, or
   should it ever move to Spam to train the provider's filter?
9. **Missing audit doc.** `algorithmAudit.test.ts` cites `research/2026-10-05-algorithm-and-code-audit.md`,
   which does not exist. Point it at this note, or was another doc lost?
