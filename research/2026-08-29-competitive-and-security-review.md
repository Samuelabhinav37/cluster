# Cluster — competitive review, security roadmap, and code audit

_2026-08-29. Covers: (1) how Cluster works today, (2) how the incumbents work and
why they succeed, (3) where Cluster is behind, (4) security features worth adding,
(5) a code audit (dead code / gaps / risks), (6) a prioritised recommendation list._

---

## 1. How Cluster works today

**Shape.** MV3 Chrome extension, ~5.5k LOC TS, 175 tests. No server. Runs on the
user's own Gmail (`chrome.identity`) and Outlook (PKCE) tokens. Everything is
**metadata-only** — `From`, `Subject`, `List-Unsubscribe(-Post)`,
`Authentication-Results`, label IDs, received timestamp, size estimate — via each
API's metadata format. One opt-in exception: "Deep scan" fetches a single
message body for link analysis, then discards it.

**Surfaces (6 dashboard tabs):**

| Tab | What it does | Engine |
|---|---|---|
| Clean up | Category groups, "Ready to clean up" (retention by age), Smart Views, Trim-to-newest-N, "You never open these", **Suggested spam** (new) | `senderModel`, `expiryTriage`, `smartViews`, `keepNewest`, `neverRead`, `spamSuggestions` |
| Subscriptions | Every unsubscribe-capable sender ranked by volume; verified one-click (RFC 8058) + bulk | `unsubscribe` |
| Security | "Possible impersonation", ranked by risk score; manual "Label as suspicious" / "Deep scan" | `threatSignals`, `emailAuth`, `linkMismatch`, `blocklist` |
| Rules | Standing AND-ed conditions → one action (label/archive/trash/mark-read); on-demand + 6-hourly | `rules`, `ruleRunner` |
| Screener | Hold unknown senders (never-emailed) under a label until Allow/Block | `screener` |
| Recently done | Rolling action log, per-entry Undo (Gmail) | `actionLog` |

**Background:** a 6-hour alarm that (a) resurfaces due snoozed mail, (b) runs user
rules, (c) runs the Screener, (d) counts retention-expired mail and sets a toolbar
badge, (e) queues threat "warned" events to Athena (dormant unless a managed
policy configures it). It never deletes on its own.

**Threat detection today:** 6 header-only signal kinds — `blocklisted-domain` (6),
`freemail-brand-claim` (5), `lookalike-domain` (4), `link-mismatch` (4),
`failed-authentication` (3), `brand-impersonation` (3) — summed into a risk score
with high/elevated/low tiers. Homoglyph-normalised brand matching. Two vendored
domain lists (URLhaus malware slice; disposable + StopForumSpam spam slice), no
runtime fetch.

---

## 2. The incumbents — how they work, why they win

| Product | Core job | Model | Distribution |
|---|---|---|---|
| **Clean Email** | Bulk visual cleanup + ongoing automation | $9.99/mo or $29.99/yr per account; free tier 1,000 msgs / 25 unsubs | Web + iOS + Android, heavy SEO, G2 presence, App Store |
| **SaneBox** | Continuous _incoming_ triage that learns you | ~$7–36/mo tiered | Works with any client, no UI change; 15+ yrs reputation |
| **Unroll.me** | Newsletter roll-up only | Free — **monetised by selling subscription data** (Uber/Slice scandal, 2017) | Free = massive install base |
| **Leave Me Alone** | Privacy-first unsubscribe | One-off credits / subscription; **no data sold** | Mailbird partnership, privacy-community word of mouth |
| **Mailstrom** | Bulk cleanup by "bundling" similar mail | Subscription | Long tail, content SEO |
| **AgainstData** | Unsubscribe **+ GDPR/CCPA data-deletion requests** to senders | Freemium | Newer, privacy-angle content |
| **Gmail native** | "Manage subscriptions" view (Jul 2025) + one-click unsub | Free, built in | Every Gmail user, zero install |

### Why they succeed (the parts Cluster can learn from)

1. **Trust is the product.** The category was poisoned by Unroll.me. Leave Me
   Alone and Clean Email built their brands almost entirely on "we don't read or
   sell your mail." Cluster's architecture (no server, metadata-only, open
   source) is _already the strongest possible version of this claim_ — but it is
   invisible: unlisted dev extension, no landing page, no privacy write-up a
   non-engineer can read, no third-party audit, no reviews.

2. **Ongoing value beats one-shot.** Clean Email (Auto Clean, Screener) and
   SaneBox (the learning loop) are things you keep _paying_ for because they keep
   working on new mail. Cluster's centre of gravity is still a one-time
   decluttering pass; Rules + Screener + the background badge are the beginnings
   of recurring value but they are underpowered (see §3).

3. **SaneBox's moat is a per-user model, on metadata only.** It scores every
   incoming message from _your_ behaviour — what you open fast, ignore for days,
   reply to, delete unread — over a 1–2 week training window, and it gets stickier
   the longer you use it. Cluster already _collects_ the raw signal (`unread`
   flag, `neverRead` logic, the action log) but throws it away instead of
   building a model. This is the single biggest capability gap.

4. **Coherent breadth at one price.** Clean Email bundles Unsubscriber + Auto
   Clean + Smart Views + Screener + Privacy Monitor with "no upsells." Cluster
   actually has _more_ surfaces than that — but they're siloed in tabs with no
   shared "here's your inbox health" narrative.

5. **Distribution is a feature.** Clean Email's apps, SEO, and store reviews are
   why people find it. Gmail's native subscription manager now eats the low end
   of the unsubscribe market for free — so a standalone unsubscribe tool has to be
   _multi-account, multi-provider, and verified-honest_ to justify itself, which
   is exactly Cluster's stated wedge but only half-delivered (Outlook is a
   second-class citizen — see §3).

---

## 3. Where Cluster is behind

| Gap | Detail | Competitor that has it |
|---|---|---|
| **No personalisation / learning** | All classification is static heuristics + curated lists. No model of _this user's_ engagement. | SaneBox (whole product), Clean Email (weaker) |
| **Outlook is second-class** | `outlookProvider` implements 5 of 15 provider methods. No keep-sorted, mute, rules, Screener, snooze, suspicious-label, deep-scan, undo for Outlook. "Multi-provider" is true only for scan + trash + unsubscribe. | Clean Email (full parity across providers) |
| **No inbox-health overview** | Six tabs, no single screen that says "you have N subscriptions, M never-opened senders, X% junk, here's the trend." | Clean Email dashboard, SaneBox digest |
| **Rules engine is thin** | One action per rule, AND-only conditions, no OR / no "older than + from domain + unread" combos beyond the fixed set, no per-rule schedule, no dry-run preview count in the UI beyond a number. | Clean Email Auto Clean, Gmail filters |
| **Screener has no "incoming" story** | It's a periodic sweep of the last scan window, not a real-time hold on _new_ unknown senders (MV3 can't intercept delivery, but a tighter alarm + a first-seen ledger would get close). | Clean Email / SaneBox screeners |
| **No breach / exposure monitor** | Clean Email's "Privacy Monitor" checks your address against HaveIBeenPwned and is a headline retention feature. | Clean Email, Proton, F-Secure |
| **No data-deletion / GDPR angle** | AgainstData's whole pitch: after you unsubscribe, also fire a data-deletion request. Natural extension of the honest-unsubscribe wedge. | AgainstData |
| **Digest is on-device-AI-only** | Phase 6's digest depends on Chrome's `Summarizer` API; silently hidden where unavailable. No plain-stats fallback digest. | SaneBox daily digest (deterministic) |
| **No newsletter "read later" / rollup** | Meco/Matter/Gmail bundle newsletters into a reading surface. Cluster only offers unsubscribe or snooze. | Meco, Unroll.me rollup |
| **Not discoverable** | Unlisted, no store listing, no landing page, no reviews, no security write-up for non-engineers. | All of them |

---

## 4. Security features worth adding

Cluster's threat subsystem is already unusually good for a _consumer, metadata-only_
tool (most consumer anti-phishing extensions are heavier and send URLs to
third parties — e.g. PhishGuard posts links to VirusTotal). The additions below
stay within the no-server / no-body-by-default stance unless marked.

### Tier 1 — header/metadata only, no new permissions

1. **Sender-authentication transparency panel.** `emailAuth.ts` already parses
   `Authentication-Results`. Surface it per sender in plain language: "SPF pass ·
   DKIM pass · DMARC none" with a colour. Turns an invisible header into a
   user-facing "is this really from who it says" indicator. Cheap, high trust
   value, no new data.
2. **First-contact flag.** A persistent `firstSeenAt` ledger of every sender
   address (metadata only). Show a "first email from this sender" badge and
   optionally auto-route to Screener. This is the consumer version of the
   enterprise "new sender" banner and pairs naturally with the existing Screener.
3. **Display-name churn detection.** `senderModel` already re-scores identity
   signals on display-name change; record and surface it: "this address has used
   3 different display names" — a strong BEC / account-takeover tell.
4. **Reply-To / From mismatch.** Add `Reply-To` to the metadata header set
   (one more `metadataHeaders` entry, still metadata). Flag when `Reply-To`
   domain ≠ `From` domain — classic phishing redirect. Currently not checked.
5. **Unicode / punycode in the From domain.** Extend the homoglyph skeleton work
   in `threatSignals` to raise a signal on any `xn--` sender domain, not just
   ones that resolve to a known brand skeleton.
6. **Attachment-shape signal (metadata).** Gmail metadata exposes part filenames
   / MIME types without the body. Flag `.html`, `.htm`, `.iso`, `.img`, double
   extensions, and macro-enabled Office types from unauthenticated senders.
7. **Urgency / lure lexicon on the _subject_ only.** `messageKind` already
   classifies subjects. A small, transparent keyword set ("account suspended",
   "verify within 24 hours", "payment failed") as a low-weight signal — subject
   text only, no body, fully auditable.
8. **Bulk "known-bad" sweep in Clean up.** The malware/blocklist hit already
   exists as a threat signal; also expose it in Clean up as a one-confirm
   "trash everything from these N known-bad senders" (mirrors the new Suggested
   spam section).

### Tier 2 — opt-in, wider scope (same model as "Deep scan" / fast-delete)

9. **Time-of-need link check.** On "Deep scan", additionally resolve URL
   shorteners (HEAD request, opt-in, per-message) and re-check the final host
   against the blocklist. Note: this is the first outbound request to a
   non-allowlisted host — gate it hard, per click, and document it in
   `SECURITY.md` + `networkEgress.test.ts`.
10. **OAuth grant review.** Read the user's Google account third-party access
    list (needs an extra read-only scope) and flag over-broad or stale grants —
    "these 6 apps can read your mail; you last used 3 of them over a year ago."
    High security value, and a natural fit with the honest-unsubscribe ethos.
11. **Breach monitor.** Check the connected address against HaveIBeenPwned's
    range-hashed API (k-anonymity — you never send the full address or hash).
    This is Clean Email's "Privacy Monitor" and is a known retention driver.
    One new host, k-anonymous, worth the `networkEgress` exception.

### Tier 3 — structural

12. **Quarantine + review loop for threats.** Today background threat detection is
    _report-only_ (Athena events). Add an opt-in "auto-label high-tier senders as
    suspicious and file them out of the inbox, always reversible from Recently
    done" — matching the "label/quarantine, never delete, always reviewable" rule
    the codebase already lives by. This is the missing protective action.
13. **Per-user risk calibration.** Once a learning loop exists (§3.3), feed "user
    marked safe / user deleted" back into the risk score so false positives decay.

---

## 5. Code audit

Overall: **healthy.** Clean module boundaries, deep per-file header comments,
strong test coverage, an enforced no-egress invariant. Findings below are small.

### Dead / vestigial code

| Item | Location | Action |
|---|---|---|
| `collapsedSmartViews` settings field | `settingsStore.ts` (+ test fixtures) | Never read or written anywhere. Remove, or wire it (Smart View chips aren't collapsible today). |
| `blocklistSize()` | `blocklist.ts` | Exported, zero callers. Keep only if a "N domains loaded" UI is planned; else drop. |
| `spamListSize()` | `spamList.ts` | Same — zero callers (just added; wire it into the Suggested-spam hint or drop). |
| `export` on `createLabel` | `gmailApi.ts` | Only used internally by `getOrCreateLabel`. Drop the `export`. |

### Gaps / correctness watch-items

1. **`dashboard.ts` is 2,227 LOC** — a God file: element refs, rendering,
   confirm flows, and all wiring for 6 tabs in one module. Not a bug, but the
   biggest maintainability risk and the hardest file for an agent to navigate.
   Split per tab (`dashboard/tabs/cleanup.ts`, …) behind a small shared
   `confirmStep` / `section` helper module.
2. **`gmailFetch` / `graphFetch` return `Promise<any>`** — the two API wrappers
   are untyped. Add response interfaces for at least the metadata + list shapes.
3. **No ESLint / Prettier / editorconfig.** Typecheck + tests only. A linter
   would have caught the dead field above and keeps unused vars / imports and
   style from drifting. CRLF/LF is also unpinned (git warns on every commit) —
   add `.gitattributes` with `* text=auto eol=lf`.
4. **27 `console.*` calls in production paths.** Mostly reasonable `console.error`
   in catch blocks, but there's no consistent logger and no way to silence them.
   A 10-line `log.ts` wrapper would tidy this.
5. **Outlook method gaps fail soft but silently.** Callers use `provider?.method`
   and show "Not supported for this provider" — fine — but there's no single
   place that documents the parity matrix for users. Add it to the README and a
   dashboard tooltip.
6. **`runBackgroundTriage` mutates mail** (via `applyRules`) — the one background
   path that changes the mailbox. Intentional and documented, but worth a
   settings-level master switch ("run my rules in the background: on/off") for
   users who want the badge but not autonomous action.
7. **Spam list bundle cost.** `spamDomains.generated.json` adds ~180 KB to the
   dashboard chunk (13 → 79 KB gzip). Acceptable for an unpacked page; revisit
   with a lazy `import()` or a lower `PER_SOURCE_CAP` if it's ever shipped.
8. **No live/E2E test of the dashboard.** Everything is unit-tested; nothing
   exercises the rendered page. The whole power-features build + threat subsystem
   + new Suggested-spam section + new logo are still unverified in a real browser.
9. **`dmarc=fail` may never fire in practice** (usually spam-foldered before it
   reaches the scan). Still unconfirmed against real delivered mail; if it never
   fires, broaden `failed-authentication` to `dmarc=none` + a brand claim.

### Security-posture notes (from the last audit pass, still open)

- `msalAuth` builds an OAuth `state` nonce but doesn't validate it on return
  (Phase 0 note says fixed — re-verify).
- `parseListUnsubscribe` / `optional_host_permissions` were tightened to HTTPS
  (Phase 0) — re-verify no `http://` path remains.
- Outlook tokens sit unencrypted in `chrome.storage.local` (standard for MV3;
  add a code comment acknowledging the trade-off).

---

## 6. Recommendations, prioritised

**Now (small, high leverage):**

1. Delete `collapsedSmartViews` + the two unused `*Size()` exports; drop the
   stray `export`. Add `.gitattributes` (eol=lf) and a minimal ESLint config.
2. **Sender-authentication transparency panel** (§4.1) — days of work, big trust
   payoff, zero new data.
3. **First-contact flag + Reply-To/From mismatch + punycode-domain signal**
   (§4.2, 4.4, 4.5) — all metadata-only, all extend code that already exists.
4. Write the **non-engineer security/privacy page** and a real README top-section
   ("what this is, what it never does"). The strongest privacy story in the
   category is currently unreadable.

**Next (the retention story):**

5. **Inbox-health overview screen** — one page pulling the six tabs' numbers into
   a single "here's your inbox, here's the trend" narrative.
6. **Engagement model v1** — persist per-sender engagement (open/ignore/delete-
   unread/reply-absent) and use it to rank "You never open these", the Screener,
   and Suggested spam. This is the SaneBox moat, and Cluster already has the raw
   signal.
7. **Quarantine + review loop for high-tier threat senders** (§4.12) — turns the
   Security tab from advisory into protective.
8. **Outlook parity** for at least Rules + Mute + Snooze (Graph
   `messageRules` + folder moves).

**Later (differentiators):**

9. **Breach monitor** (k-anonymous HIBP) and **OAuth grant review** — both are
   opt-in, both are proven retention features, both fit the ethos.
10. **Data-deletion requests** after unsubscribe (AgainstData's wedge).
11. Split `dashboard.ts` per tab.
12. A real E2E pass (load unpacked, drive the 6 tabs) before any public listing.

---

### Sources

- https://mailstrom.co/articles/best-email-cleanup-tools-2026/
- https://clean.email/best-sanebox-alternative
- https://leavemealone.com/blog/unsubscribe-apps-for-email/
- https://againstdata.com/blog/clean-email-alternatives
- https://checkthat.ai/brands/clean-email/pricing
- https://clean.email/help/tools/privacy-monitor
- https://leavemealone.com/blog/a-privacy-focused-alternative-to-unroll-me-and-unsubscriber/
- https://medium.com/@boumahdiimad42/sanebox-work-with-ai-f119864fa01a
- https://geekflare.com/software/sanebox-review/
- https://chromewebstore.google.com/detail/phishguard-email-phishing/ikkdkapalndipkjdakoaohdmdofodfee
- https://www.starthaven.com/blog/best-phishing-protection-tools-2026
- https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-protection-spoofing-about
- https://knowledge.workspace.google.com/admin/gmail/advanced/advanced-phishing-and-malware-protection
