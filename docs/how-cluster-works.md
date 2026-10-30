# How Cluster works

Cluster is a Chrome extension that cleans up, sorts and protects a Gmail or Outlook inbox. It runs in your browser. There is no Cluster server holding your mail, and the only server of our own is a small sign-in helper that never sees mail.

This guide walks through it in the order you meet it: signing in, the first read, each place in the app, what runs in the background, how scams are caught, and what data goes where.

## 1. The parts

| Part | What it is | Where |
| --- | --- | --- |
| Dashboard | The app window you see. All screens live here. | `src/dashboard/` (`index.html`, `dashboard.ts` and one file per screen) |
| Background worker | Runs on timers while Chrome is open, even with the dashboard closed. | `src/background.ts` |
| Logic | Pure functions: reading senders, sorting, scam signals, rules. Most are tested on their own. | `src/lib/` |
| Bundled data | Lists that ship inside the extension: public suffixes, brand registry and logos, known-bad and spam domains. | `public/data/`, `src/lib/data/` |
| Sign-in helper | A Cloudflare Worker that adds Cluster's client secret when Google hands back a sign-in code. Sees tokens, never mail, stores nothing. | `auth-worker/` (not deployed yet) |

## 2. Signing in

- **Gmail**: you pick an account in Google's own window. Cluster asks for two permissions: `gmail.modify` (read headers, label, archive, trash) and `gmail.settings.basic` (create Gmail filters so sorting keeps working with the browser closed). Permanent delete needs a third, `mail.google.com`, and is only asked for if you turn it on.
- **Outlook**: Microsoft's sign-in window with PKCE. Cluster asks for `Mail.ReadBasic`, `Mail.ReadWrite` and `offline_access`.
- Tokens stay in Chrome's extension storage on your computer.

## 3. The first read

Cluster builds a **mail index**: a local copy of every message's headers, kept in IndexedDB on your computer (`src/lib/mailIndex.ts`, `mailSync.ts`).

- It reads headers only (`format=metadata`): From, To, Subject, Date, List-Unsubscribe, Authentication-Results and a few more. Not the body.
- It reads the last 30 days fully first, so the screens fill in quickly, then works backwards.
- Gmail allows 6,000 quota units a minute per user and each message costs 20, so Cluster paces itself to about 5,500 a minute (`gmailQuotaLedger.ts`). 50,000 emails take a few hours the first time. The bar at the bottom shows progress and the time left.
- After that, Gmail's change history (`historyId`) means Cluster only reads what is new. The index keeps up to 20,000 messages per account.

## 4. How Cluster understands mail

Every message is given a **kind** and every sender a **profile**.

- **Kind** (`messageKind.ts`, `sortTaxonomy.ts`): codes, shipping, receipts, newsletters, social, promotions, people and so on. Rules on the subject and headers decide first. The sender's domain category (Shopping, Finance, Travel...) helps when the subject says little.
- **Learning from you** (`kindModel.ts`, `engagementModel.ts`): when you answer a question like "Receipts? Keep them", a small local model learns what your receipts look like. It can only add protection, never remove it.
- **On-device AI, optional** (`aiMessageKind.ts`): Chrome's built-in Gemini Nano is asked only about mail the rules couldn't place. It runs on your computer.
- **Senders** (`senderModel.ts`, `senderProfile.ts`): messages are grouped by sender, then by company, so PayPal's five addresses show as one PayPal. Cluster tracks how much each sends, how much you open, and whether it's a person or a machine.

## 5. The places

### Home
One sentence from Kai saying whether anything needs you, such as "2 emails pretend to be PayPal and Chase." Below that: what was cleared, what arrived and how much came from people this week, up to three next steps, and your inbox by kind.

### Senders
Everyone who emails you, in Contacts-style lists (All, People, Companies, Never opened, Verified). Pick one to see a card with counts, how often they send, their addresses, and one main action: Unsubscribe if they offer it, otherwise Mute. Verified companies show their real logo (see section 7).

### Clean up
Mail that can go, in two main groups:
- **Never opened**: senders whose mail you never open (`neverRead.ts`).
- **Past its date**: old codes, expired offers, delivered parcels (`retentionPolicy.ts`, `expiryTriage.ts`).

More ways: keep only the newest few from a sender, trash by website, and known spam domains.

Everything goes to **Trash**, never straight to permanent delete, and every action can be undone from Activity. Starred mail is never touched.

### Stop mail
Unsubscribing, done honestly (`unsubscribe.ts`, `unsubscribeQueue.ts`):
- **One click**: the standard RFC 8058 request, sent straight to the sender. Chrome asks your permission for that sender's site the first time.
- **By email**: Cluster sends exactly the unsubscribe email the sender asked for, from your account. These are spaced out so a long list never looks like bulk mail.
- **On their site**: Cluster opens the page and you finish there.

Afterwards Cluster watches whether the mail actually stops (`unsubscribeOutcome.ts`), and "Still sending" shows senders that ignored you.

### Organize
Pick how long each kind of mail stays in your inbox (keep, a month, a week, 3 days, a day). After that it moves out to its own label. Mail from people always stays.
- Gmail filters label new mail as it arrives, even with the browser closed (`serverSort.ts`, `categoryFilters.ts`).
- Every 5 minutes the background worker moves mail whose time is up (`inboxTimeLimits.ts`).
- Presets and your own rules live here too (`rules.ts`, `ruleRunner.ts`).

### Protect
Scams and strangers:
- **This scan**: senders with warning signs, ranked High or Elevated (section 6).
- **Doesn't match**: senders that use a company's name from an address the company doesn't use, each with Check, Trust and Block (section 7).
- **New senders**: the Screener (`screener.ts`) holds mail from people you've never written to until you let them in. It's off until you turn it on.
- **Holding**: what Cluster set aside, with one tap to release it.

### Settings and Activity
Settings: how far back to read, rescan, accounts, notifications, theme, simple mode, what Cluster learned, privacy (what's stored, export, erase everything), keyboard shortcuts.
Activity: everything Cluster did, by day, each with Undo.

### Kai and Details
- **Kai** is the narrator. It says the one-line verdict on Home and guides first-run setup. Ask Kai (press `/`) understands short typed requests and takes you to the right place.
- **Details** is the right-hand panel that lists the actual emails behind any number you tap.

## 6. How scams are caught

Each sender gets signals (`threatSignals.ts`), and the signals add up to a risk tier:

| Signal | What it means |
| --- | --- |
| Brand claim | The display name says "PayPal" but the address isn't PayPal's. |
| Free-mail brand claim | "Chase Fraud Team" writing from a Gmail address. |
| Lookalike domain | `paypa1.com`, `pаypal.com` with a Cyrillic а, `paypal-secure-login.com`. |
| Failed authentication | DMARC, SPF or DKIM say the mail didn't come from who it claims. |
| Known-bad domain | On the URLhaus malware list. |
| Reply-To redirect | Replies would go to a free-mail address instead of the sender. |
| Punycode, risky attachment, urgent wording | Weaker signs that add weight. |

For senders already flagged, Cluster also reads the newest message's links (`bodyChecks.ts`) and keeps only two counts: links whose text names a different site, and links to known-bad sites. Never the text itself.

If you turn on holding, the background worker files High-risk senders out of your inbox under "Possible Phishing". Releasing one teaches Cluster it was wrong (`quarantineReview.ts`).

## 7. The brand registry (new)

To tell a real company email from a fake one, Cluster keeps a list of companies, the domains they really send from, and their logos (`public/data/brand-registry.json`).

- **Certified** (287 companies): taken from **BIMI mark certificates**, the same source behind Gmail's blue checkmark. A certificate authority (DigiCert, GlobalSign, SSL.com, Entrust) checks a company's registered trademark before issuing one, and the certificate ties together the legal name, the email domains and the logo. Our build script checks each certificate's signature all the way up to the authority's own root certificate.
- **Listed** (35 companies): from Wikidata, only for well-known brands with no certificate (Google, Microsoft, Netflix...). Anyone can edit Wikidata, so these are trusted less.
- **Hand-checked** (70 brands): our original list. Only these brands are matched against display names, so the registry can add real domains to a brand but can never invent a new trusted brand.

`npm run refresh:brands` rebuilds the list in about a minute (our brands plus the 5,000 most popular domains).

**When a sender doesn't match**, it appears in Protect under Doesn't match:
1. **Check** looks up that one domain's certificate and verifies it in your browser against the pinned authorities (`markCheck.ts`). If it's certified to the company it claims, it's marked Real automatically. If it's certified to someone else, you see who. A home-made or altered certificate fails.
2. With no certificate, you decide: **Trust** makes the domain count as that brand from then on, **Block** holds it.

## 8. What runs in the background

| Every | Job |
| --- | --- |
| 5 minutes | Move mail whose inbox time is up. Resume interrupted jobs and queued unsubscribe emails. |
| 6 hours | Triage: count what's ready to clean, run your rules, hold scams if that's on, resurface snoozed mail, reply reminders, weekly summary. |
| 1 day | Fetch the latest signed lists (known-bad domains, brand domains) from Cluster's GitHub Pages. |

The background worker never deletes on its own. It counts, labels and moves things you've already set up, and every change is logged with Undo.

## 9. Your data

**Stays on your computer**: the mail index (headers only), settings, what Cluster learned, the activity log. Settings → Privacy shows the size, exports it, or erases it all.

**What leaves, and to whom**:

| Goes to | What | When |
| --- | --- | --- |
| Gmail / Microsoft Graph | API calls with your token | Reading and acting on your mail |
| Cluster's sign-in helper | Sign-in codes and tokens, never mail | Signing in, refreshing access |
| Cluster's GitHub Pages | A plain download of public lists, the same for everyone | Once a day |
| A sender's unsubscribe address | The unsubscribe request | When you unsubscribe |
| Cloudflare DNS and the certificate's host | One domain name | When you tap Check |

The published lists are signed with Cluster's key and checked before use, so a tampered copy is ignored. A test (`networkEgress.test.ts`) fails the build if any new place in the code starts talking to the network.

## 10. Where things stand (2026-10-30)

- **Built and tested**: everything above except what's listed below. 1,237 tests, typecheck and lint pass. Some dashboard tests time out when the whole suite runs at once on a busy machine; they pass on their own.
- **Mockups awaiting approval** (`research/2026-10-29-redesign-mockup.html`): the round 2 redesign of Home, Senders, Protect (Doesn't match), Clean up, Stop mail, Organize and Settings.
- **Not live-tested**: the brand check and most of October's work haven't run against your real mailbox yet.
- **Waiting on you**: deploying the sign-in helper (`wrangler login`, then set the secret), the Outlook redirect on Azure, and a hand-labelled sample for the 10 life categories.
- **Nothing pushed**: all of this sits on `feat/ui-plan-2026-10`.
