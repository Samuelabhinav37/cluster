# How email security scans work, and what Cluster should copy (2026-11-06)

Asked for: research how a security scan works and how security companies do it, so Cluster can do the same. Research only.

## How the big vendors do it

### Microsoft Defender for Office 365
Source: Microsoft Learn, anti-phishing policies (primary, updated 2026-08).

- **Two different attacks.** Spoofing forges the From address or domain. It is caught with SPF, DKIM and DMARC, plus "composite authentication", Microsoft's combined verdict. Impersonation uses a lookalike name or domain (`ćóntoso.com`, `contosososo.com`). Impersonation can pass SPF, DKIM and DMARC, so it needs its own checks.
- **Authentication failure alone does not block.** Microsoft combines "the overall suspicious nature of a message" with the auth result, so senders with sloppy DNS aren't punished.
- **Signals shown to the user** (a few words each):
  - "?" on the sender photo when SPF or DKIM fails and DMARC fails.
  - A "via" tag when the From domain differs from the DKIM or MAIL FROM domain.
  - First contact tip: "You don't often get email from …".
  - Impersonation tip: "appears similar to someone who previously sent you email".
  - Unusual characters tip.
- **Mailbox intelligence.** It learns who each user writes to. A lookalike from someone the user already talks to is not flagged. A stranger is.
- **Confidence tiers.** Low, medium, high and very high. An admin threshold from 1 (Standard) to 4 (Most aggressive) promotes lower tiers to the harshest action. Higher thresholds catch more phishing and cause more false positives.
- **Actions in order of severity:** no action, then Junk, then quarantine with release rules, then reject or delete.
- **Trusted senders list.** It overrides impersonation checks, up to 1,024 entries.

### Google Gmail
Source: Workspace security whitepaper (primary). Banner details come from university IT pages (secondary).

- ML models plus Safe Browsing for URLs. Google claims more than 99.9% of threats are blocked; this is not independently audited.
- **Early phishing detection.** A small share of mail (under 0.05%) is delayed so a phishing model can look harder. Cluster's 5-minute scam hold is the same idea.
- Unauthenticated senders get a "?" on their avatar. Likely spoofed mail gets a yellow "Be careful with this message" banner with Report buttons.

### Abnormal Security (API-based, like Cluster)
Source: vendor and partner material only, unverified.

- It connects through the Gmail and Microsoft Graph APIs, with no MX change. This is the same position Cluster is in.
- It builds a known-good baseline per person and per organisation, then flags departures from it. The vendor cites 43–45k signals. The point is behaviour, not known-bad lists. That is how it catches business email compromise mail that has no bad link at all.

### Proofpoint (gateway)
Source: third-party write-ups, not vendor docs.

- Attachments are detonated in a sandbox. Script types are quarantined without running. Mail is delivered with the attachment held until a verdict arrives.
- Links are rewritten and checked at the moment of the click: allow, warn or block.
- Cluster can't do this. It doesn't sit in the mail path and can't rewrite links. Skip it.

### Desktop scanners (Bitdefender, the screen the user shared)
The UX pattern:
1. A scan runs with visible progress.
2. A result screen shows one verdict line.
3. Each check is a row: name, a count found, and "View details".
4. A note says to review before acting, then one primary button.

## What Cluster already has (src/lib/threatSignals.ts and friends)

| Vendor idea | Cluster today |
|---|---|
| SPF/DKIM/DMARC | `emailAuth.ts`, `failed-authentication`, a hold for forged mail that fails DMARC |
| Domain impersonation | `lookalike-domain`, `punycode-domain`, `brand-impersonation` (`brandRegistry.ts`) |
| Free mail claiming a brand | `freemail-brand-claim` |
| "via" / reply mismatch | `reply-to-mismatch` |
| First contact | `firstContact.ts`, Screener |
| Mailbox intelligence | `sentCorrespondents` (people you write to) |
| URL checks | `linkMismatch.ts`, `blocklisted-domain` |
| Attachments | `risky-attachment` (type only, no sandbox) |
| Delay to look harder | 5-minute scam hold |
| Gmail's own verdict | `provider-flagged` |
| Body language | `lure-language`, `bodyChecks.ts` |

Cluster covers most of the API-reachable layer already. What is missing is mostly how it is shown, plus a few signals.

## What to build (proposed order)

1. **A scan screen that shows its checks.** Security already has the result layout as of this commit: a ring, a verdict, and one row per check. Next comes a "Scan now" run that walks the checks in order, each row turning ✓ or showing a count:
   - Sender authentication
   - Lookalike domains
   - Brand impersonation
   - Links that hide their target
   - Risky attachments
   - First-time senders
   - Gmail's own warnings

   The progress is real, one check at a time over the index, and nothing is faked with a timer.
2. **Confidence tiers instead of only "High".** Map signal combinations to Low, Medium and High. Hold only High automatically. Add a strictness setting that mirrors Microsoft's 1–4: Standard, Strict.
3. **Mailbox intelligence rule.** Never flag a lookalike from someone in `sentCorrespondents`. Microsoft does exactly this to cut false positives. Check whether the current code already applies it to every impersonation signal.
4. **Per-message tips in Details**, in the Microsoft wording style: "You don't often get email from …", "Looks like Netflix, but the address isn't one Netflix uses", "Sent via other-domain.com".
5. **Trusted senders list.** An allow list that overrides impersonation checks. "Let in" in Screener might already cover this; check before adding anything.
6. **A scan report history.** Per scan: date, checks run, found, held, released. Pairs with the Sort report idea (`2026-11-06-sort-page.md`).

Not worth copying: link rewriting, sandboxing and MX-level blocking. Cluster sits behind the inbox, not in the mail path.

## Open questions for the user

1. Should Scan now be a button on Security, or should a scan also run on its own each day?
2. Should Security get a strictness setting (Standard / Strict), or should it stay one fixed level?
