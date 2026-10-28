# Cluster in six sections: how it works, who does each best, how to improve

## Context
You split Cluster into four groups and we agreed on six: **Authorization, Reading, Understanding, Filtering & sorting, Showing & confirming, Checking & updating**. You asked how Cluster works in each one and which product already on the market does that section best. You also asked why that product excels and what Cluster should take from it.

This builds on the ~45 docs in `research/` and doesn't repeat their sources. Fresh sources were added only for the gaps (sign-in, reading). The full list of unbuilt items is `docs/backlog.md`.


## 1. Authorization

**How Cluster works today**
- It uses Chrome's built-in Google sign-in, `chrome.identity.getAuthToken` (`src/lib/gmailApi.ts:59`). There's no Cluster account or server.
- Outlook signs in with MSAL (Microsoft's sign-in library) and PKCE (`providers/msalAuth.ts`).
- It asks for two Gmail scopes up front: `gmail.modify` and `gmail.settings.basic`. Permanent delete asks for an extra scope only when used (`getElevatedAuthToken`, `gmailApi.ts:628`).
- It handles one Gmail account (whichever Chrome picks) plus one Outlook account.

**Best at it: Clean Email and SaneBox** (`research/2026-10-10-accounts-connect-disconnect.md`)
- Why they excel:
  - One "Add account" entry point.
  - Accounts shown in a list with an avatar switcher.
  - Removal says plainly what gets deleted.
  - SaneBox asks whether to keep or undo the folders it made.
  - Clean Email deletes its own data immediately.
- Google's own rules:
  - Ask for each scope at the moment a feature needs it. Fewer scopes asked means more people say yes ([Google incremental auth](https://developers.google.com/identity/sign-in/web/incremental-auth)).
  - With two or more non-sign-in scopes, Google shows a **granular consent screen** where the user can untick one ([Google, granular permissions](https://developers.google.com/identity/protocols/oauth2/resources/granular-permissions)).

**Gaps**
- **New finding:** Cluster never reads `grantedScopes` from `getAuthToken` (Chrome 87+, [identity.idl](https://chromium.googlesource.com/chromium/src/+/main/chrome/common/extensions/api/identity.idl)). If a user unticks `gmail.settings.basic`, every Gmail filter (Mute, Keep sorted, Sort now) fails later with a confusing error.
- There's no multi-Gmail support, and no sign-out that revokes Google access (Settings has Erase, which clears local data only).

**Improve**
1. Read `grantedScopes`. If the settings scope is missing, hide the filter-based actions and show one "Allow Cluster to create Gmail filters" button. Ask for it at the moment the user taps Mute or Keep sorted. *(S)*
2. Start with `gmail.modify` only, and ask for `settings.basic` the first time a filter is needed. *(S, rides on #1)*
3. Support several Gmail accounts by moving Gmail to `launchWebAuthFlow` + PKCE, as Outlook already does (plan in the 10-10 doc). *(L)*

## 2. Reading emails

**How Cluster works today**
- `mailSync.ts` reads the newest 150 emails first, then the rest in the background.
- Messages go into a local IndexedDB index (`mailIndex.ts`, up to 20k). It also reads up to 5k sent emails.
- Metadata only (`format=metadata` + named headers), with the Gmail request limit tracked in `gmailQuotaLedger.ts`. Changes arrive through `history.list` / Graph delta (`incrementalSync.ts`).
- The progress bar is at the bottom of the screen.

**Best at it: Superhuman**
- It's "local first". The mobile app syncs the last 30 days into a local database so search works offline and never waits on Gmail ([Syntax.fm #918 transcript](https://syntax.fm/show/918/extreme-native-perf-on-the-web-with-superhuman/transcript)). It targets interactions under 100 ms ([Superhuman blog](https://blog.superhuman.com/the-fastest-email-experience-ever-made/)).
- The server-based cleaners (Clean Email, SaneBox) keep a full index on their own server and update it from the provider's change feed (`2026-10-05-sync-and-ui-architecture.md` §1.3).

**Gaps**
- A first full read is limited by Gmail's 6,000 units per minute: about 11 minutes for 3,200 messages, longer for 12k.
- The first screens are built from 150 messages, so early numbers are partial and then jump.

**Improve**
1. Read in Superhuman's order: **the last 30 days complete first**, then go further back. Home's numbers are exact for "this month" almost at once, and older mail fills in behind. *(M, in `mailSync.ts` phase order)*
2. Label every number with the date range it covers until the read is done, for example "last 30 days". This stops numbers jumping without explanation. *(S)*
3. Use `census.ts` counts (search totals) for "how big" figures on day one, as the doc already allows ("describing only, never for actions"). *(S)*

## 3. Understanding (what each email is, and is it safe)

**How Cluster works today**
- Five layers (`docs/algorithm-plan.md`): clean the text → facts → a fixed floor that always protects → the user's own model (`suggestionModel.ts`, `kindModel.ts`) → optional on-device AI.
- `messageKind.ts` sorts by subject and sender name. `verdict.ts` scores safety: 3+ warns, 6+ holds.
- `domainGrouping.ts` merges senders into companies.

**Best at it**
- **Apple Mail categories.** Four kinds decided from sender and header metadata only, on the device. One "Categorize Sender" choice covers all current and future mail from that sender (`2026-10-28-organizing-competitors.md`).
- **Gmail.** It labels mail that came through a platform with "via". Primary means mail between people (`2026-10-28-grouping-rules-organization.md` §A–B).
- **SaneBox.** It learns per sender address and keeps a "Trainings" list the user can edit.

**Why they excel**
- They decide per sender, not per message, and one correction sticks.
- They keep "a person sent this" separate from "this matters".
- They never group a whole platform (myworkday, greenhouse) as one company.

**Gaps (already seen in your real mailbox)**
- Hiring platforms show up as one company.
- Robots appear in People, because starring or replying marks a sender as "known".
- 18 kinds of labels, where others use 4 to 6.

**Improve** (from the 10-28 grouping doc, ranked)
1. Keep a platform list and refuse a platform's domain as a company. Name those senders by display name instead. *(S)*
2. People = not a machine **and** you talk to them. Add a "Companies you talk to" group, and a one-tap "Not a person" fix. *(M)*
3. A "What Cluster learned" list with Reset, like SaneBox Trainings and Apple Reset. *(S)*

## 4. Filtering & sorting

**How Cluster works today**
- Real Gmail filters + labels: Sort now, Keep sorted, Mute (`autoSort.ts`, `serverSort.ts`, `categoryFilters.ts`).
- Local rules (`rules.ts` → `ruleDryRun.ts` → `ruleRunner.ts`, at most 100 messages per run by default, never starred mail).
- Screener, scam holds, inbox time limits, 8 presets.

**Best at it**
- **HEY.** Three places (Imbox, Feed, Paper Trail) plus a Screener. Every decision is per sender and applies to old mail too.
- **SaneBox.** Sorts at delivery, and the **Daily Digest** is the safety net.
- **Clean Email.** "Make this a rule" from any group it shows.
- **Gmail.** "Filter messages like these" starts from a real message and previews the matches.

**Why they excel**
- Few places.
- A rule starts from something the user is looking at, not a blank form.
- There's always one place to check what got moved.

**Gaps**
- Too many buckets.
- The rule sheet starts mostly blank, and the AI draft hangs (audit bug 1).
- There's no single "what did Cluster move today" list.

**Improve** (from the 10-28 competitor doc, top 4)
1. "Moved today" review on Home: Back to inbox, Keep doing this, Archive all. *(S–M, reuses the action log)*
2. "Always do this" after any manual action, prefilled from that action, with a match count before saving. *(M)*
3. One "where does this sender go" choice: Inbox / Read later / Receipts / Muted, applied to old mail too. *(M)*
4. Never move mail a person sent straight to you, shown as a fixed guardrail. *(S)*

## 5. Showing & confirming

**How Cluster works today**
- Five places, a Details panel, ⋯ menus and Kai.
- Destructive actions sit behind a confirm with Undo. `filterOutProtected` is the last check before anything is deleted.
- A word-budget test caps the text on each screen.

**Best at it**
- **Apple iPhone Storage.** One bar, at most 3 recommendations with one button each, then detail.
- **Gmail Manage subscriptions.** One sorted list, one button per row.
- **Superhuman.** Undo instead of confirm dialogs, so actions feel instant. (Superhuman's Undo appears in earlier research; that it replaces confirms is my inference.)

**Why they excel**
- One screen, one job.
- Numbers on one screen come from the same set of mail.
- The safe action is the default, and undo is cheap, so fewer questions get asked.

**Gaps**
- Home shows 250 vs 507 and double counts (audit bug 2).
- Old bulk bar, page scroll carried between screens, Escape closes Details instead of the open menu, unlabelled checkboxes, wrong hint on Protect (audit bugs 3–7).

**Improve**
1. Fix the 7 audit bugs. *(S each)*
2. Build every Home number from one set of messages, and say "of N" whenever a part sits next to a total. *(S)*
3. For actions that can be undone (archive, label, mute), drop the confirm and show "Done · Undo". Keep confirms only for trash and unsubscribe. *(M)*

## 6. Checking & updating

**How Cluster works today**
- The background pass runs every 6 h, plus a 5-min jobs alarm, and only while Chrome is open.
- Changes arrive through `history.list` and Graph delta.
- Unsubscribe gets a 3-day grace period and a 14-day watch (`unsubscribeOutcome.ts`). The Monday summary is optional (`notices.ts`).

**Best at it**
- **Clean Email.** When an unsubscribe is ignored, it automatically sends that sender's future mail to Trash.
- **Unroll.me.** Waits 24 h before sending the request, so the user can change their mind.
- **SaneBox / Leave Me Alone.** Daily digest of what was screened.
- **Gmail Manage subscriptions** (the baseline): it doesn't verify anything.

**Why they excel**
- They close the loop: did it work, and if not, what happens next, without the user having to remember.

**Gaps**
- Mail is only re-checked every 6 hours, and only while Chrome is open.

**Improve** (from the 10-16 unsubscribe doc)
Already built: still sending → "Send their mail to Trash" (`subscriptionsTab.ts`), and mailto unsubscribes sent by Cluster (`gmailApi.ts`).

1. Poll `history.list` on the existing 5-min alarm (about 576 units a day), so new mail joins its group within minutes, not 6 hours. *(S–M)*
2. The rest of the unsubscribe follow-through: `docs/backlog.md` 6.1–6.5.

## Suggested order
1. **Showing & confirming bugs** (the 7 audit bugs). They're small and clear-cut, and they make the rest testable.
2. **Understanding: grouping + People.** These are the most visible wrong results.
3. **Authorization: grantedScopes.** It's a silent failure waiting to happen.
4. **Checking: 5-min sync + unsubscribe follow-through.**
5. **Filtering: Moved today + Always do this.**
6. **Reading: last-30-days-first.**

