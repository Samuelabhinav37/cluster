# Cluster UX problem map: what is wrong, how to split it, how to fix each part

Date: 2026-10-10. Branch audited: `ui/apple-structure` (f1b360e), preview harness with the fake
mailbox, 1440 px light. Labels: **(Measured)** counted in the running UI, **(Code)** verified in
source, **(Source)** external, **(Inference)** my recommendation.

## 0. The owner's feedback, sorted

| # | What the owner said | Group |
|---|---|---|
| 1 | Too much text everywhere, unnecessary text | A. Words and visuals |
| 2 | Boring, no infographics or charts | A. Words and visuals |
| 3 | Clear out goes on and on, too many decisions, options, names, actions | B. Decisions and lists |
| 4 | Too many from the same domain, no filters | B. Decisions and lists |
| 5 | Sender icons look weird | C. Visual consistency |
| 6 | Mute, Unsubscribe, Protected all look different, uneven | C. Visual consistency |
| 7 | Settings has no settings icon | C. Visual consistency |
| 8 | Sorting looks horrible, so do Rules | D. Sorting and Rules |
| 9 | Safety takes too many clicks to learn more | E. Learning and help |
| 10 | No tour, no help guide when stuck | E. Learning and help |
| 11 | Onboarding and "the way it works" are messy | E. Learning and help |
| 12 | Can't sign out, add an account or switch | F. Accounts |
| 13 | Activity is empty, Settings has two options | G. Thin screens |
| 14 | "Just text showing more text", the whole UI is a mess | All of the above |

## 1. Evidence (Measured)

Visible words, controls and page height per screen with the fake mailbox:

| Screen | Words | Buttons | Inputs | Height (px) | Charts |
|---|---|---|---|---|---|
| Clear out | 464 | 53 | 39 | 3,868 (4.3 screens) | 0 |
| Sorting | 577 | 7 | 26 | 1,388 | 0 |
| Subscriptions | 353 | 35 | 20 | 2,515 | 0 |
| Senders | 309 | 29 | 1 | 2,205 | 0 |
| Safety | 202 | 12 | 1 | 1,061 | 0 |
| Home | 141 | 8 | 1 | 1,015 | 0 |
| Scam report | 107 | 0 | 0 | 912 | 3 (empty when holding is off) |
| Rules | 71 | 7 | 14 | 838 | 0 |
| Settings | 32 | 1 | 5 | 468 | 0 |
| Activity | 11 | 0 | 0 | 283 | 0 |

Specific defects seen:

- **Clear out** shows 12 kinds of button (Mute all, Review, Mute, Select safe, Bulk unsubscribe
  selected, Bulk keep sorted selected, Bulk snooze selected, Trim…, Delete selected domains…,
  Delete domain…, Clear, Apply plan), a metric strip of five numbers, a sender list, a "By domain"
  table with six category groups and a red **Delete domain…** box on every row. The floating
  "1 group · Apply plan" bar sits on top of the sender list mid-page.
- **Same company, many rows.** Amazon appears as `store-news@amazon.com` and
  `shipment-tracking@amazon.com` in Senders, twice in Paid subscriptions, again in Newsletters
  and again in By domain.
- **Subscriptions** rows carry a "Monthly" chip, "page · mostly newsletter · address", and three
  differently styled actions: **Email** (link), **Read later…** (grey pill), **Keep** (link).
  Every row says "Monthly", so the chip carries no information.
- **Icons.** Groupon, Old Navy, Nike, Wayfair, UNIQLO, Target, Delta, Sephora, Adobe, Apple all
  show the same grey globe; Notion shows an empty tile.
- **Sorting** is 11 sentence rows, each with a dropdown, then "Save time limits", then "Sort my
  inbox", then "Smart views", then "More tools". Three ways to file mail on one page.
- **Rules** has an AI drafter, three example chips, two buttons, an empty state, a dry-run
  line, a "Customize manually" form and "Apply enabled rules now".
- **Settings** gear icon is drawn as a sun (a circle with eight short rays).

## 2. Root causes (Code)

| Problem | Cause |
|---|---|
| Globe icons | `faviconUrl()` (`src/lib/senderLogos.ts:149`) asks Google's favicon service for the **full sending host** (`email.oldnavy.com`, `r.groupon.com`, `official.nike.com`). Mail subdomains rarely have a favicon, so the service returns its default globe. Checked 2026-10-10 with curl: `email.oldnavy.com`, `r.groupon.com`, `official.nike.com` each return HTTP 404 with the same 726-byte globe; `oldnavy.com`, `groupon.com`, `nike.com` return HTTP 200 with real logos (1,0xx to 1,7xx bytes). Chrome still paints the 404 globe body, so `senderTile.ts`'s monogram fallback (on `error`) never fires. Prior note: `2026-09-18-within-screen-decision-clarity.md` §6. |
| Duplicate Amazon rows | Senders are keyed by address, not by company (registrable domain). |
| No sign out / switch / add | Gmail uses `chrome.identity.getAuthToken` (`src/lib/gmailApi.ts:56`), which returns a token for **the Chrome profile's primary account**. Picking another account needs the `account` option, which typings say "is only supported when the enable-new-profile-management flag is set", and `getAccounts` is "Dev channel only". |
| Outlook already does it differently | `src/lib/providers/msalAuth.ts` uses `launchWebAuthFlow` with PKCE and refresh tokens, so the extension already has a working pattern for a non-Chrome-profile account. |
| Clear out length | Every tool ever built for clean-up renders on one page, fully expanded (`index.html` delete screen). |
| Uneven actions | Each list builds its own buttons with different classes (`btn`, `btn-danger`, links, pills); there is no single action component. |

## 3. How to split the work

Seven workstreams. Each one can ship and be judged alone; the arrows are the only dependencies.

```
C. Visual system ──► A. Charts & less text ──► B. Clear out redesign
        │                                   └► D. Sorting & Rules
        └──────────► G. Thin screens
E. Help, tour, onboarding (after A–D, so it teaches the final screens)
F. Accounts (independent engineering spike, can start any time)
```

**C first** because every other screen reuses its icons, action buttons and badges. **E last**
because a tour of screens that are about to change is wasted. **F runs in parallel**; it is an
auth change, not a design change.

## 4. Research and answer for each workstream

### A. Fewer words, more pictures

**What good products do (Source).**
- Apple HIG, Charting data: "Use a chart when you want to highlight important information";
  add "a headline or summary for a chart" (Weather's "Chance of light rain in the next hour");
  "Keep a chart simple, letting people choose when they want additional details."
- Apple Screen Time on Mac: "The bars represent total usage, and the colored parts represent
  the top three categories… Gray parts represent usage that doesn't fall into those
  categories" ([Apple Support](https://support.apple.com/guide/mac-help/mchlf2c0c770)). One chart,
  three colours, then a ranked list.
- Apple HIG, Writing: "Check each word to be sure it needs to be there."

**Answer (Inference).**
- A **word budget**: page lead ≤ 12 words; row = name + one fact; no explanatory paragraphs on
  screen (they move into Help, workstream E).
- Three charts, one style everywhere (Screen Time look: bars, top three kinds coloured, rest grey):
  1. **Home: "Mail this week"**, daily bars split into the top three kinds (Newsletters,
     Promotions, Receipts…), headline above ("Most of your mail this week was promotions").
  2. **Clear out: "What's taking space"**, one horizontal bar per group with its count.
  3. **Senders: "Top senders"**, ranked list with an inline bar per row (Screen Time's "Most used").
- Scam report: hide the empty chart when holding is off; show one line and a Turn on button.

### B. Clear out: from 53 buttons to one decision per group

**What good products do (Source).**
- Clean Email first run: "Cleaning Suggestions", pre-computed groups that people "accept or
  reject… with a single click"; any action "will apply to all mail within the group"
  ([Clean Email help](https://clean.email/help/basics/getting-started), via
  `2026-09-09-competitor-ux-decision-fatigue-patterns.md` §2).
- Mailstrom groups mail "by sender, subject, time period, size" into bundles
  ([Mailstrom](https://mailstrom.co/articles/mailstrom-vs-clean-email/), vendor claim).
- Apple iPhone Storage: a few recommendations, each with one button
  (`2026-10-10-apple-style-redesign.md` §2).
- One-at-a-time card triage (Avec, Triage) is popular in apps, but no research shows it reduces
  decision fatigue ([Digital Trends on Avec](https://www.digitaltrends.com/cool-tech/hate-boring-email-apps-avec-turns-your-inbox-into-a-swipe-happy-mess-fixer/)). Offer it as an option, not the default.

**Answer (Inference).**
- **Group by company**, not address: one Amazon row with "2 addresses" inside.
- Clear out becomes **3–5 suggestion cards**, each a picture (logo stack), a number, and one
  button: "Never opened · 4 senders · 29 emails · [Clear out]". Review opens a sheet with the
  senders and checkboxes, nothing else.
- **Filter chips** above any list: All · Never opened · Newsletters · Shopping · Large · Old.
- The "By domain" table, "Keep only newest", bulk bars and snooze move into the sender sheet
  (one sender) or the Review sheet (one group). They stop being sections.
- Optional **"Go through them one by one"** button: a card per sender with three equal buttons
  (Keep · Mute · Unsubscribe) and a progress count.
- Fix the floating bar overlap (it must sit at the bottom of the viewport, not mid-list).

### C. One visual system

**What good products do (Source).**
- Apple HIG, Sidebars: "Consider using familiar symbols"; icon colours must "serve a clear purpose".
- Gmail shows verified brand logos via BIMI "for senders that have adopted DMARC and have
  validated their imagery" ([Google Workspace Updates](https://workspaceupdates.googleblog.com/2021/07/BIMI-support-across-gmail.html)).
- Google's favicon service returns a globe "when a given domain's favicon can't be found"
  ([Jim Nielsen](https://blog.jim-nielsen.com/2021/displaying-favicons-for-any-domain/)); it is
  unofficial and unsupported ([logo.dev](https://www.logo.dev/docs/google-favicon-api)).

**Answer (Inference).**
- **Logos:** ask for the registrable domain (`oldnavy.com`, not `email.oldnavy.com`); detect the
  globe (returned image smaller than requested) and fall back to a brand-coloured monogram, so
  every tile is either a real logo or a clean letter, never a globe.
- **One action component:** every row action is the same pill size and weight. Primary action
  = filled pill, secondary = grey pill, destructive = grey pill with red text. Status
  (Protected, Muted, Unsubscribed) is a small grey badge with an icon, not a button.
- **One icon set** (stroke 1.7, 20 px grid, like the sidebar): a real gear for Settings, and
  icons for Mute (bell-slash), Unsubscribe (envelope-x), Protected (lock), Keep (check).
- Remove per-row chips that are the same on every row ("Monthly").

### D. Sorting and Rules

**What good products do (Source).**
- Apple Mail uses four categories: Primary, Transactions, Updates, Promotions, plus a per-sender
  "Categorize Sender" ([MacRumors](https://www.macrumors.com/2024/12/13/ios-18-2-mail-categories/)).
- Apple HIG, Settings: "Minimize the number of settings"; put task options "in the screens they
  affect".

**Answer (Inference).**
- Sorting becomes **one grid of 5 cards** (Updates, Promotions, Shopping & orders, Receipts &
  finance, Codes), each with an emoji/icon, this week's count, and one setting shown as a
  segmented control: *Keep in inbox · 1 day · 1 week · Skip inbox*. The 11 fine-grained kinds
  stay as an "Edit kinds" sheet. One master switch on top. "Sort my inbox" becomes a single
  button ("Apply to mail already here"). Smart views and More tools move out.
- Rules becomes a **gallery of templates** (cards: "Trash codes after 2 days", "Archive old
  newsletters") with a toggle each, plus "Create rule" opening a sheet that holds the AI drafter
  and the manual form.

### E. Help, tour and onboarding

**What good products do (Source).**
- Apple HIG, Onboarding: prefer "context-specific tips" near the area they describe; "if you
  let people skip the tutorial… make sure it's easy for people to find if they want to view it
  later."
- Apple TipKit: popover tips anchor to a control; tips show only when their rules pass and are
  dismissed by a close button or when the person uses the feature
  ([Apple TipKit doc](https://developer.apple.com/documentation/tipkit/highlightingappfeatureswithtipkit)).
- NN/g tested deck-of-cards tutorials with 70 users across 4 apps
  ([NN/g, Mobile tutorials](https://www.nngroup.com/articles/mobile-tutorials/)); practitioner
  advice is to keep any tour "short, optional" ([Uxcel](https://app.uxcel.com/courses/mobile-design/onboarding-734/instructional-onboarding-4248)).
- Microsoft: people "only look for help once they already have a problem", so help must answer
  it quickly and in context ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/design/in-app-help/guidelines-for-app-help)).
- Moat already ships a Help panel and a guide (`moat/src/options/helpPanel.ts`, `kaiGuide.ts`).

**Answer (Inference).**
- **Connect screen:** three picture cards (Clean up · Sort · Protect) and one button; the
  privacy points become one line with a "How Cluster uses your mail" link.
- **After the first scan:** a 4-step skippable tour (Home → Clear out → Sorting → Safety), one
  sentence each, anchored to the sidebar item. Replay from Help.
- **Help panel** (header "?" button): per-screen answers, 3–5 questions each, searchable.
- **Learn more in place:** Safety cards expand inline ("Why is this suspicious?") instead of a
  separate Deep scan step; term hints stay as small (i) popovers.

### F. Accounts: sign out, add, switch

**What the platform allows (Source).**
- `getAuthToken` uses "the primary account for the profile"; choosing another account "is only
  supported when the enable-new-profile-management flag is set"; `getAccounts` is "Dev channel
  only" (`@types/chrome` identity docs, mirroring the Chrome reference).
- `launchWebAuthFlow` runs any OAuth flow and returns to `https://<app-id>.chromiumapp.org/*`
  (same docs). Google's parameters `prompt=select_account` ("Prompt the user to select an
  account") and `login_hint` pick or preselect an account
  ([google-auth-library docs](https://googleapis.dev/nodejs/google-auth-library/8.6.0/interfaces/GenerateAuthUrlOpts.html)).
  Google recommends the code flow with PKCE over the implicit flow
  ([Google, client-side apps](https://developers.google.com/accounts/docs/OAuth2UserAgent)).

**Answer (Inference), needs an engineering spike before design:**
- **Sign out now (small):** clear Cluster's token from Chrome's cache
  (`removeCachedAuthToken`), revoke the grant with Google, wipe local scan data, return to the
  connect screen. The exact revoke endpoint still needs confirming in Google's docs.
- **Add and switch accounts (larger):** move Gmail sign-in to `launchWebAuthFlow` with
  `prompt=select_account`, like Outlook already does. Open question: Google's token exchange
  for a web-type client normally needs a client secret, which an extension cannot keep secret.
  The spike decides between that, the implicit flow (1-hour tokens, silent renew with
  `prompt=none` + `login_hint`), or keeping one Gmail account per Chrome profile.
- **UI:** account menu lists accounts with avatars, a check on the active one, "Add account",
  and "Sign out".

### G. Thin screens

**What good products do (Source).** Empty states should say "what the area is for, why it is
empty, and what the user can do next" ([Salesforce Lightning](https://spring-20.lightningdesignsystem.com/guidelines/empty-state));
NN/g: they "build user confidence, improve learnability"
([NN/g](https://www.nngroup.com/videos/empty-states-in-application-design-guidelines/)).

**Answer (Inference).**
- **Activity:** an icon, "Everything Cluster does shows up here, with Undo.", and one button to
  Home. Once there are entries: group by day, icon per kind of action.
- **Settings** gets the settings that exist but are scattered: Accounts (F), Scam holding,
  Sorting on/off, Hold new senders, Appearance, Help & privacy, Advanced. A real gear icon.

## 5. How we show it before building

Owner rule from earlier rounds: research, then **rendered prototypes at true size**, then build
([[feedback_marketing_site_style]], [[feedback_iterate_on_liked_version]]).

1. Build a **clickable HTML prototype** of the new system with the fake mailbox data:
   Connect → tour → Home (with chart) → Clear out (suggestion cards + review sheet + one-by-one)
   → Sorting cards → Safety (inline why) → account menu with sign out / add.
2. Owner reviews it in the browser, light and dark. Changes are made to the prototype until it
   is liked.
3. Then build in `src/` in the workstream order of §3, one branch per workstream, keeping the
   current element ids where tests rely on them.

## Sources

- Apple HIG (fetched 2026-10-10): Charting data, Writing, Onboarding, Settings, Sidebars
- [Apple Support, Screen Time on Mac](https://support.apple.com/guide/mac-help/mchlf2c0c770)
- [Apple TipKit](https://developer.apple.com/documentation/tipkit/highlightingappfeatureswithtipkit)
- [MacRumors, Mail categories](https://www.macrumors.com/2024/12/13/ios-18-2-mail-categories/)
- [Clean Email help](https://clean.email/help/basics/getting-started) (via 2026-09-09 research)
- [Mailstrom vs Clean Email](https://mailstrom.co/articles/mailstrom-vs-clean-email/)
- [Digital Trends on Avec](https://www.digitaltrends.com/cool-tech/hate-boring-email-apps-avec-turns-your-inbox-into-a-swipe-happy-mess-fixer/)
- [Google Workspace Updates, BIMI](https://workspaceupdates.googleblog.com/2021/07/BIMI-support-across-gmail.html)
- [Jim Nielsen, favicons for any domain](https://blog.jim-nielsen.com/2021/displaying-favicons-for-any-domain/)
- [logo.dev on Google's favicon API](https://www.logo.dev/docs/google-favicon-api)
- [NN/g, Mobile tutorials](https://www.nngroup.com/articles/mobile-tutorials/)
- [NN/g, Empty states](https://www.nngroup.com/videos/empty-states-in-application-design-guidelines/)
- [Uxcel, instructional onboarding](https://app.uxcel.com/courses/mobile-design/onboarding-734/instructional-onboarding-4248)
- [Microsoft Learn, app help guidelines](https://learn.microsoft.com/en-us/windows/apps/design/in-app-help/guidelines-for-app-help)
- [Salesforce Lightning, empty state](https://spring-20.lightningdesignsystem.com/guidelines/empty-state)
- [Google, OAuth 2.0 for client-side web apps](https://developers.google.com/accounts/docs/OAuth2UserAgent)
- [google-auth-library, auth URL options](https://googleapis.dev/nodejs/google-auth-library/8.6.0/interfaces/GenerateAuthUrlOpts.html)
- Chrome identity API (via `@types/chrome` index.d.ts in this repo)
