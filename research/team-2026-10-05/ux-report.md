# Cluster UX report: jobs, flows, IA, feedback and wording

_2026-10-05. UX design team. Branch `feature/inbox-time-limits` at `22ba332`. Research only. No
source code changed. Builds on `research/2026-10-05-sync-and-ui-architecture.md` (the "IA note"),
`2026-10-05-end-to-end-walkthrough-and-roadmap.md` (the "walkthrough") and
`2026-10-05-inbox-intelligence-research.md` (the "intelligence note"). It does not repeat them._

Conventions:

- `path:line` points at this branch.
- **(Inference)** marks our own judgement or design proposal.
- **Verified from code** means we read the code path but did not click it in a browser.
  The preview harness (`npm run preview:ui`) exists, but we worked from code. Items marked
  "check in preview" should be clicked once before the fix is scheduled.
- Lane: user needs, flows, structure, wording, findability and feedback. Visual styling goes to
  the UI team, mechanics to the software team (section 7).

## TL;DR

1. **The owner's three complaints have one root.** The UI is organised by *tool* (Delete,
   Organize, Rules, Screener), not by *job*. So one job is spread over several screens, and
   every screen carries several jobs. Fix the structure first, then the styling.
2. **Settings is not findable** because it is an unlabelled gear (`index.html:48-49`). NN/g:
   "Icon labels should be visible at all times." It also hides a coupling: scan settings only
   apply when you press the header **Rescan** button (`dashboard.ts:2270-2291`).
3. **Undo is not where people look, and most actions have none.** "Recently done" is the last
   item under "More" (`index.html:129-132`). Keep sorted, Unsubscribe, Screener Let through or
   Block, and phishing "Block sender" write log entries with no undo
   (`dashboard.ts:2034`, `screenerTab.ts:79`, `:86`, `securityTab.ts:314`).
4. **Feedback is a blank screen.** Every action ends in a full rescan that hides the content
   (`dashboard.ts:524-528`). Results show as small inline text that a re-render then wipes. There
   is no toast, no "last synced" line and no place where background work is reported in plain words.
5. **Several buttons say one thing and do another.** "Block sender" only labels mail already
   scanned. Screener "Block" is a mute. "Keep sorted" makes a new label per sender. The Delete
   screen's floating bar says "nothing permanent, everything here is reversible" above a Trash
   action (`dashboard.ts:1762`). "This is genuinely them" only hides the card until the next render.
6. **Likely dead buttons on the Delete screen.** "Mute all", "Trash" and "Apply plan" fire confirms
   into sections the scan has just hidden (`dashboard.ts:1319`, `:1335`, `:1778-1779` vs `:624-626`).
   Verified from code. Check in preview.
7. **We endorse the proposed IA with five changes:** rename "Categories" to **Sorting** (Gmail
   already owns the word "Categories"); make **Settings** a labelled sidebar item with its own
   page; make **Activity** a real nav item; give the **Screener** a visible switch and a
   "New senders" filter in Senders plus a Today card; and keep one confirm only for Trash.
8. **Reactivity contract:** acknowledge in 0.1 s, update the row in place, toast with Undo for
   every reversible action, inline progress for anything over 1 s, and a progress bar with an
   estimate past 10 s. Never hide content to sync.
9. **One name per concept.** A 17-entry glossary (section 5) retires "bucket", "group",
   "keep sorted", "file out", "time limits", "Recently done", "Rescan" and three meanings of "Block".
10. **Test it with the owner** on five tasks (section 8). The headline target: find Settings
    and Undo first time, in under 10 seconds, without hovering.

---

## 1. Personas and ranked jobs

Three personas. They come from the intelligence note's complaint table (section 5 there), the
walkthrough's first-run findings and the owner's own words. They are proto-personas.
**(Inference)** They have not been validated with real users.

| | **A. Maya, buried** | **B. Sam, private tinkerer** | **C. Ruth, scam-wary** |
|---|---|---|---|
| Inbox | Gmail, 10k+ unread, 50-100 a day, mostly retail, codes, shipping | Gmail plus Outlook, ~3,200 in scan, keeps labels tidy | Gmail, modest volume, gets fake "PayPal" and "Netflix" mail |
| Wants | "Make it calm and keep it calm" | "Do it on my device, show me exactly what you did, let me tune it" | "Tell me if something is dangerous, in plain words" |
| Fears | Deleting the one important email | Data leaving the device; silent automation | Clicking the wrong thing; jargon |
| Tolerance | 2 minutes to a first win, then it should run itself | Will read every setting, wants control | Low. One clear action per screen |
| Current blocker | Plan buttons that seem dead, 50 controls on Organize | Can't find Settings, can't see what background runs did | "Phishing" sits under "Clean up" with SPF/DKIM terms |

Sam is close to the product owner. That matters: "I can't work on it" is also a user need.
The owner must be able to see, in one place, what each part of the product is for.

**Ranked jobs-to-be-done** (rank = frequency × pain across personas, **Inference**):

| # | Job ("When…, I want to…, so I can…") | A | B | C |
|---|---|---|---|---|
| 1 | Clear out mail that's already piling up, without losing anything that matters | ●●● | ●● | ● |
| 2 | Stop a sender for good (unsubscribe, or hide them if they ignore it) | ●●● | ●●● | ●● |
| 3 | Keep routine mail (codes, receipts, shipping, newsletters) out of my inbox automatically, and decide for how long | ●●● | ●●● | ● |
| 4 | Trust it: see what Cluster did, and put anything back | ●● | ●●● | ●●● |
| 5 | Know it's working and current, including while I was away | ●● | ●●● | ● |
| 6 | Find out if anything is dangerous, and deal with it | ● | ●● | ●●● |
| 7 | Decide about senders I've never heard from (Screener) | ● | ●● | ●● |
| 8 | Change a setting once (account, theme, how far back, permanent delete) | ● | ●●● | ● |

Jobs 4 and 5 rank high because they gate the others. Users who cannot see or undo an
automation switch it off. SaneBox's own help leans on easy correction ("Moving an email back to
your Inbox 'retrains' SaneBox", [How does SaneBox work](https://www.sanebox.com/help/155-how-does-sanebox-work)).

---

## 2. Task-flow audit of the current UI (top 8 jobs)

Current shell: header (Connect Outlook, Rescan, gear), sidebar "Overview · _Clean up_: Delete,
Organize, Subscriptions, Phishing · _More_: All senders, Rules, Screener, Recently done"
(`index.html:86-132`), up to four stacked banners (`:179-200`).

### Job 1. Clear out what's piling up

| Step | Screen | What happens |
|---|---|---|
| 1 | Overview | Hero "N messages across N groups" (`dashboard.ts:797`). Two controls go to the same place: **Start cleanup** and **Review suggestions** (`:828`, `:832`). |
| 2 | Delete | "Your cleanup plan" (`index.html:232`). Row 1 says **Mute all** on a screen whose lead says "Everything here ends in Trash" (`index.html:222`, `dashboard.ts:1317`). |
| 3 | Delete | Row primary buttons "Mute all" and "Trash" call `neverReadMuteBtn.click()` / `expiryCleanupBtn.click()` (`:1319`, `:1335`). Their confirms render inside `#never-read-section` / `#expiry-section`, which the scan has just set `hidden` (`:624-626`). **Likely nothing visible happens.** Verified from code, check in preview. |
| 4 | Delete | Floating bar "N groups · nothing permanent, everything here is reversible · Apply plan" (`:1758-1774`). Apply fires up to three confirms in three hidden or distant slots (`:1777-1780`). |
| 5 | Delete | "Review" reveals a "legacy" panel and scrolls to it (`:1428-1436`). There, buttons are "Mute suggested…" and "Trash suggested…" (`index.html:247-248`). |
| 6 | Any | Confirm → blank rescan → result text in the slot, then the slot is re-rendered. |

Where users get lost: two entry links with no difference, a Mute action on the Delete screen,
buttons that appear dead, a "reversible" claim on a Trash bar, and the word "Clean up" used five
ways (nav group `index.html:91`, "Your cleanup plan" `:232`, "Ready to clean up" `:269`,
"Clean up" button `:277`, "Start cleanup" `dashboard.ts:828`). Trim to newest and By domain sit
below the fold with their own vocabulary ("Trim…", "Delete domain…", "Select safe").

### Job 2. Stop a sender

There are four doors: Organize "Senders worth a decision", All senders, Subscriptions and the
Delete never-opened panel.

| Step | Screen | What happens |
|---|---|---|
| 1 | Organize | Up to 8 rows. Primary is "Unsubscribe", "Mute" or "Keep sorted" depending on the sender (`dashboard.ts:1452-1460`). |
| 2 | Organize | The primary button *opens* an "Options" strip and auto-clicks the matching action, which then asks for a confirm (`:1626-1632`). Two clicks look like one. |
| 3 | Organize | The Options strip shows Unsubscribe, Keep sorted, Mute, Snooze and "Not useful" for every row (`:1604-1613`). |
| 4 | Subscriptions | Same sender, different verbs: "Email", "Open page", "Read later…", "Keep", "Unsubscribe + clean…" (`subscriptionsTab.ts:206`, `:212`, `:223`, `:466`, `:151`). The word "Unsubscribe" is missing from mailto and web rows. |

Wording traps:

- **"Keep sorted"** has no confirm. It creates a Gmail filter plus a new label named after the
  *sender* (`dashboard.ts:2021-2034`). It moves existing mail out of the inbox and logs no undo.
  Users who learnt "sorted" from "Sort my inbox" expect a *category* label.
- **"Not useful"** reads as rating the sender, but it dismisses the suggestion (`:1613-1617`).
- **"Bulk unsubscribe selected"**, **"Bulk keep sorted selected"**, **"Bulk snooze selected"**
  (`index.html:338-348`) repeat "Bulk … selected" and put three verbs on one bar.
- The bulk confirm reads "N will be unsubscribed automatically, M need manual review — no
  verified link" (`dashboard.ts:2750`). It doesn't say what happens to the M.

### Job 3. Keep routine mail out of the inbox

| Step | Screen | What happens |
|---|---|---|
| 1 | Sidebar | Nothing says "codes" or "inbox time". The user must guess **Organize**. |
| 2 | Organize | Scroll past the sender list and its bulk bar to **Inbox time limits** (`index.html:352-369`). The hint is 4 sentences with the key caveat last: "Gmail only for now." |
| 3 | Organize | Tick "Use inbox time limits", set 11 selects, press "Save time limits". |
| 4 | Organize | Separately, **Sort my inbox** (`:371-396`): button → preview, plus a closed "Which labels, and where the mail goes" disclosure. It holds "keep in inbox" per category, which is hidden when time limits are on (`sortInbox.ts:143`). It also holds "Keep doing this for new mail" and "Also move one-time codes to Trash after 2 days". |
| 5 | Organize | The codes-to-Trash box only takes effect if "Keep doing this for new mail" is also ticked (`sortInbox.ts:575` sits inside `if (keepOn)`). Nothing tells the user that. |
| 6 | Organize | Turning time limits off says "Time limits off. N Gmail filters kept for Sort my inbox." (`timeLimitsTab.ts:109`). That exposes the two-system model to the user. |

Where users get lost: two sections that set the same thing, a hidden dependency, a hidden
setting, and the Rules screen as a fourth place (IA note 2.2-A). "Straight to label"
(`timeLimitsTab.ts:26`) and "filed out of the inbox" / "labelled in place" (`sortInbox.ts:309`)
are system words.

### Job 4. See what Cluster did, and put it back

| Step | Screen | What happens |
|---|---|---|
| 1 | Anywhere | Right after an action, an inline "Undo" appears only on Trash paths (`recentTab.ts:33-52`, used at `dashboard.ts:2211`, `:2834`, `:2854`). |
| 2 | Sidebar | "Recently done" is the **last** item, under "More" (`index.html:129-132`). The Overview has a 3-entry preview with "Full history" (`dashboard.ts:1025-1046`). |
| 3 | Recently done | Entries show an Undo only if they carry an undo payload. None is written by Keep sorted (`dashboard.ts:2034`), bulk keep sorted (`:2782`), unsubscribe (`:2761`), bulk snooze (`:2803`), Screener Let through or Block (`screenerTab.ts:79`, `:86`), phishing "Block sender" (`securityTab.ts:314`) or the never-opened bulk mute (`dashboard.ts:2900`). |
| 4 | Recently done | Undo triggers a full rescan (`recentTab.ts:44`, `:92`). The screen goes blank. |

Findability failure: the safety net is the hardest thing to find. The Recently done lead
says "Anything here can be put back for 30 days" (`index.html:682-683`), which is not true for
the entries above.

### Job 5. Know it's working and current

- There is no "last synced" indicator. The status line hides after a scan (`dashboard.ts:590`).
- The 15-minute time-limit run is reported only deep in Organize: "Last checked 4 min ago: moved
  12 messages into their labels." (`timeLimitsTab.ts:78-81`).
- The 6-hour triage writes one run-on string, for example "…— 0 actioned by rules, 12 ready to
  clean up, 3 security changes checked (gmail baseline refreshed), 2 held by Screener"
  (`background.ts:365-372`). It appears only at the top of Recently done as "Last background
  sweep: …" (`recentTab.ts:131`).
- Overview "Working while you were away" counts time-limit moves as "cleanups done this month".
  The runner logs them as kind `archive` (`inboxTimeLimitsRunner.ts:76`), and the Overview counts
  `trash` + `archive` as cleanups (`dashboard.ts:984-986`). Wrong label for the user.
- "Rescan" is a primary header pill (`index.html:40-46`). It is the most expensive button in the
  product and the only way to apply scan settings.

### Job 6. Is anything dangerous?

| Step | Screen | What happens |
|---|---|---|
| 1 | Overview | "N senders may be impersonating people you know / Display name matches a known contact, the domain does not." (`dashboard.ts:938-939`). Wrong for brand lookalikes (walkthrough). |
| 2 | Sidebar | "Phishing" sits under the **Clean up** group (`index.html:107-111`). The screen id is `impersonation`. |
| 3 | Phishing | The lead is one 50-word sentence listing five signal types (`index.html:523-528`). |
| 4 | Phishing | **Block sender** confirm: "Move N messages … to the '🚨 Possible phishing' label, out of the inbox?" Result: "Labeled ✓" (`securityTab.ts:300-318`). It does not block future mail (intelligence note TL;DR 2). There is no undo payload. |
| 5 | Phishing | **This is genuinely them** sets `li.hidden = true` only (`securityTab.ts:345-348`). The card returns on the next render, and nothing is learnt. Ruth will think she was ignored. |

### Job 7. Decide about new senders (Screener)

| Step | Screen | What happens |
|---|---|---|
| 1 | Sidebar | Screener is under "More", with a magnifier icon that reads as "search" (`index.html:124-128`). |
| 2 | Screener | "Turn the Screener on" (`:664`). Ticking it **immediately holds** every pending sender (`screenerTab.ts:264-270`) with no preview of how many. Then a blank rescan. |
| 3 | Screener | Each card: "Let through" · "Keep screening" (permanently disabled, `:238-242`) · "Block" (which mutes, `:81-86`). |
| 4 | Screener | Off-state copy is just "Screener is off." (`:102`). |

### Job 8. Change a setting

| Step | Screen | What happens |
|---|---|---|
| 1 | Header | Find a 16 px gear with no text (`index.html:48-54`). Hover gives a title tooltip only. |
| 2 | Sheet | "Scan window (days)", "Max messages per account", Theme, "Fast permanent delete…" (`:56-77`). |
| 3 | Sheet | Theme applies at once (`dashboard.ts:418`). Scan window and Max messages do nothing until you find and press **Rescan** in the header (`:2270-2287`). No Save, no hint. |
| 4 | Header | Account and Outlook connection live in the header, not in Settings (`index.html:33-38`). Label tidy-up and Athena are banners above every screen (`:189-200`). |

### Findability summary

| Thing | Where it is now | Clicks / scrolls | Why it fails |
|---|---|---|---|
| Settings | Unlabelled gear, top right | 1, if spotted | Icon only. NN/g: "a text label must be present alongside an icon" ([Icon usability](https://www.nngroup.com/articles/icon-usability/)) |
| Undo / history | Last nav item under "More" | 1 + scan | Named "Recently done". Grouped with "More" |
| Inbox time limits | Organize, second section | 1 + long scroll | Name not in nav. Sits below a sender list |
| Screener | "More", magnifier icon | 1 | Icon means search. Under "More" |
| Trash old codes | Organize → Sort my inbox → closed disclosure | 2 + scroll | Hidden dependency on another checkbox |
| Last background run | Recently done top, or Organize | 1-2 | Not on Overview, not in header |
| Connect Outlook | Header pill | 1 | Fine to find, wrong home (account setting) |

---

## 3. Information architecture

### 3.1 Validate or challenge the IA note's proposal

The IA note proposes 🏠 Today · 🗂 Categories · 👤 Senders · 🧹 Clean up · 🛡 Security, with
🕘 Activity in the footer and the gear sheet for Settings (IA note 2.4). We agree with the shape.
It maps one area to each of our top jobs: 1 → Clean up, 2 → Senders, 3 → Categories, 6 → Security.
Today serves 4 and 5. Five changes:

| # | Proposal says | We recommend | Why |
|---|---|---|---|
| C1 | "Categories" | **Sorting** (screen title "Sorting: where each kind of mail goes"). Keep "category" as the row noun. | Gmail already shows "Categories" (Primary, Promotions, Social…). Cluster's own query uses `category:promotions` (IA note 1.1). Two meanings in one product is the confusion we are removing. **(Inference)** Manager decision, see open questions. |
| C2 | Settings stays a gear sheet | **Settings** becomes a labelled sidebar item (bottom) and a labelled header button, opening a full page with sections | The owner can't find it. The proposal grows it to 7 groups (Accounts, Sync, Appearance, Deleting, Advanced, Maintenance, Organisation). That is a page, not a popover. NN/g: labels "visible at all times" ([Icon usability](https://www.nngroup.com/articles/icon-usability/)). |
| C3 | Activity in sidebar footer | **Activity** as a full nav item above Settings, with a small count of today's undoable items | Undo is the safety net for every job. NN/g on complex apps: help users "keep a record of their actions" ([complex applications](https://www.nngroup.com/articles/complex-application-design/), via IA note). |
| C4 | Screener as a "New" chip inside Senders | Keep it in Senders, but with (a) a labelled switch at the top of Senders, "Hold mail from new senders", (b) a "New senders (3)" filter that is first when non-empty, (c) a Today card, (d) a count on the Senders nav item | A chip alone repeats today's findability problem. HEY makes the first-contact decision prominent: "The first time someone emails you, you get to decide if you want to hear from them again" ([HEY Screener](https://www.hey.com/features/the-screener/)). |
| C5 | Two-step confirms everywhere | Confirm **only** for Trash and permanent delete. Everything reversible runs at once with Undo | NN/g: "do try your best to offer undo… to reduce anxiety" ([Confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/)). Confirms on reversible actions train people to click through the dangerous ones. |

Also endorsed without change: the one sender sheet, Rules folded under Sorting as "Custom
rules", Security split out with a red count only for high risk, Rescan moved to Settings as
"Rebuild index", and banners moved off the global stack.

### 3.2 Recommended IA

```
Header:  ⬡ Cluster      [● Up to date · 2 min ago]      (SA) sam@…  [⚙ Settings]

Sidebar:                    One job                                   Question it answers
  🏠 Today                  What needs me, what Cluster did           "Anything to do?"
  🗂 Sorting                Where each kind of mail goes, how long    "What happens to codes?"
  👤 Senders            3   Decide about a sender once                "What do I want from them?"
  🧹 Clean up               Clear out mail already there              "What can go now?"
  ───────────
  🛡 Security           1   Suspicious mail, apart from tidying       "Is anything dangerous?"
  ───────────
  🕘 Activity               What changed, put it back                 "Can I undo that?"
  ⚙ Settings                Things you set once                       "Where's the setting?"
  privacy note
```

Navigation rules **(Inference)**:

- Every Today card is a deep link to a *filtered* view (e.g. Senders with "New senders" on).
  The user never lands on a screen and has to search again.
- Every sender name anywhere opens the same sender sheet. No sender actions live outside it except
  the one primary action per row.
- Clean up only moves things to Trash. Sorting only labels and moves out of the inbox. Senders
  only sets future-mail behaviour and unsubscribes. "Existing mail" actions in the sender sheet
  hand off to Clean up's confirm pattern.
- Remember the last screen (already done via `activeTab`), but always land on Today after a
  gap of more than 12 hours, so "while you were away" is seen.

### 3.3 Each area: content in priority order, entry and exit, states

**🏠 Today**

| Priority | Content | Primary action |
|---|---|---|
| 1 | High-risk security finding (only if any) | Review → Security, filtered |
| 2 | "Waiting for you" (max 4): new senders, ready to clear, renewal soon, Sorting not set up | One button each |
| 3 | "While you were away": plain lines from Activity's automatic entries | Undo or View on each |
| 4 | Last 3 of your own actions | Undo |
| 5 | One-line inbox summary (replaces the big health card) | none |

- Entry: app open, the brand mark, the end of onboarding. Exit: deep links only.
- Empty: "You're all caught up. Cluster checked 2 min ago and will keep sorting while Chrome is open."
- Loading (first index): a skeleton of the cards, plus "Getting to know your inbox · 400 of
  3,200 · you can use Cluster while this runs".
- Error: an inline card, not a page takeover: "Couldn't reach Gmail. Showing what we had at
  10:42. [Try again]".

**🗂 Sorting**

| Priority | Content |
|---|---|
| 1 | The category list: on/off · emoji label · "Stays in inbox for [▾]" · "Then [Keep ▾ / Trash after N days]" · "In inbox now: 6" · status ("Works with Chrome closed" or "Only while Chrome is open") |
| 2 | "Sort mail already in my inbox…" with its preview |
| 3 | Last run line: "Last checked 4 min ago · moved 12 · Undo" |
| 4 | ▸ Custom rules (collapsed, count in the summary) |

- Save model: each change saves on change with a toast ("Codes now leave your inbox after
  1 hour · Undo"). There is no page-level Save button to forget. **(Inference)** This differs from
  the IA note's single Save. A forgotten Save is a silent failure.
- Empty (nothing set up): a preset card. "Pick a starting point: Just label things · Calm inbox
  (recommended) · I'll set it myself."
- Loading: rows render from settings at once. Only the "In inbox now" counts show placeholders.
- Error (filter sync failed): the row status turns to "Couldn't update the Gmail filter.
  [Retry]". The row keeps the user's choice.

**👤 Senders**

| Priority | Content |
|---|---|
| 1 | Switch: "Hold mail from new senders (Screener)" with one line of explanation |
| 2 | Search + filters: New senders (n) · Needs a decision · Newsletters · Never opened · Muted · All |
| 3 | Rows: logo · name · "214 · 0% opened" · one recommended action · › opens sheet |
| 4 | Bulk bar when ≥ 1 selected: Unsubscribe · Mute · Send to category ▾ |

- Sender sheet (side panel, no navigation away): **Future mail** radio (Inbox · a category ·
  Muted) · **Unsubscribe** (and its verified status) · **Existing mail**: Move N to Trash… ·
  Keep newest 3… · **Why we suggest this** · **Activity for this sender**.
- Empty, per filter: "No new senders. Everyone who wrote recently is someone you've emailed or let in."
- Loading: skeleton rows. Error: the row stays and shows "Couldn't unsubscribe. [Retry]".

**🧹 Clean up**

| Priority | Content |
|---|---|
| 1 | Page promise: "Everything here moves to Trash. Gmail keeps Trash for 30 days." |
| 2 | Suggestions (each one checkbox + Review): never-opened senders, expired codes and old newsletters, spam-list senders (unchecked) |
| 3 | One action button that states the outcome: "Move 852 to Trash" |
| 4 | Find more: Older than 1 year · Larger than 2 MB · Promotions · By website |

- Mute is not offered here. It lives in Senders.
- Empty: "Nothing to clear right now. Cluster will suggest more as mail arrives."
- Error mid-run: "Moved 400 of 852, then Gmail stopped us. The rest are untouched. [Continue]".

**🛡 Security**

| Priority | Content |
|---|---|
| 1 | Findings, high risk first. Each shows "Says it's from PayPal · Actually from paypa1-secure.co", reasons in plain words, then the technical marks folded under "Details" |
| 2 | Two actions: **Block** (labels existing mail and adds a standing filter) and **It's genuine** (remembered) |
| 3 | Auto-quarantine switch and review list |
| 4 | Caveat: "A prompt to look, not a verdict." |

- Empty: "Nothing suspicious in recent mail." Never a green "You're safe".

**🕘 Activity**

- Grouped by day. Each entry: who (You / Cluster, automatic), what, how many, and Undo or "Can't be undone".
- Filters: All · By you · Automatic · Undone.
- Background runs appear as entries, not a run-on summary line.
- Empty: "Nothing yet. Everything Cluster does will show up here, with a way to put it back."

**⚙ Settings (full page)**

Sections, in order: Accounts (Gmail, Connect Outlook, sign out) · Sync ("Index mail from the last
[6 months ▾]", status, Rebuild index) · Appearance (Theme) · Deleting (Fast permanent delete,
with its warning) · Smart features (on-device classify, digest) · Maintenance (label tidy-up) ·
Organisation (Athena, managed only) · About and privacy. Every control applies on change with a
toast. There is no hidden "apply via Rescan".

### 3.4 First run: connect → first scan → first win

Target: a first visible win in under 2 minutes from clicking Connect. **(Inference)**

1. **Welcome** (on install, Phase 0.1 is done): what is read, what is never read, nothing
   deleted without you, one **Connect Gmail** button. Keep the current copy (`index.html:146-175`).
2. **Getting to know your inbox.** Land on Today at once with skeleton cards and one progress
   line: "Reading senders and subjects · 400 of 3,200 · about 2 min · you can start now".
3. **Pick a starting point** (one card, on Today, while the index fills):
   - **Calm inbox (recommended):** codes, shipping and newsletters leave the inbox after 1 day.
     Codes go to Trash after 2 days. Everything else stays.
   - **Just label things:** label everything, move nothing.
   - **I'll set it up myself:** → Sorting.
   The card ends with "You can change this any time in Sorting."
4. **First win, shown, not told:** "Done. 46 codes and shipping updates moved out of your inbox
   into 🔑 One-time codes and 📦 Shipping · Undo · See Sorting".
5. **Next step card:** "18 senders you never open · Unsubscribe or mute" → Senders, filtered.
6. **Pin tip** once, after the first win, not before.

Screener and auto-quarantine stay off until the user opens them. Each off-state shows a
preview count ("Would have held 2 senders this month").

### 3.5 Undo and activity model

- **Every** user action and every automatic run writes one Activity entry with an undo payload,
  or the explicit text "Can't be undone" and the reason ("Unsubscribe requests can't be recalled.
  [Mute instead]").
- Undo is offered in three places: the toast (about 10 s, matching Superhuman's fixed 10-second
  window, [Superhuman Undo](https://help.superhuman.com/hc/en-us/articles/47278253460499-Undo)),
  the Activity entry (30 days for Trash, unlimited for labels and filters), and the sender sheet's
  activity list.
- Undo is itself instant and optimistic, and it is logged ("Undid: moved 640 to Trash").
- Automatic entries name the feature that did it ("Sorting", "Screener", "Auto-quarantine",
  "Custom rule: Archive old newsletters"), so the user can go and change the cause.

---

## 4. Reactivity from the user's point of view

NN/g response-time limits: 0.1 s feels "instantaneous"; 1 s keeps "the user's flow of thought";
past 10 s give feedback "indicating when completion is expected"
([Response times](https://www.nngroup.com/articles/response-times-3-important-limits/)). Blank
pages make users "assume something is wrong" ([Skeleton screens](https://www.nngroup.com/articles/skeleton-screens/)).

### 4.1 Feedback contract per action class

| Class | Examples | ≤ 0.1 s | ≤ 1 s | > 1 s | After |
|---|---|---|---|---|---|
| **Reversible, local** | Mute, send to category, let in, dismiss, change a Sorting row, snooze | Button pressed state; row updates or slides out | Done | Row shows "Saving…" inline; the rest stays usable | Toast "Muted Groupon. Future mail goes to 🔇 Muted · Undo" |
| **Trash (bulk)** | Clean up suggestions, keep newest N, delete by website | Confirm opens in place with the count and a specific button ("Move 640 to Trash") | | Inline progress on the card: "Moving… 240 of 640" | Toast "Moved 640 to Trash · Undo". Counts update in place |
| **Permanent** | Fast permanent delete | Confirm says "Delete forever. This can't be undone." | | Inline progress | Toast without Undo. Activity says "Can't be undone" |
| **External request** | Unsubscribe | Row shows "Unsubscribing…" | | Stays on the row | Row: "Unsubscribed · verified" or "Didn't go through · Retry". Toast offers "Also mute?" |
| **Long job** | First index, sort mail already in inbox, sort held Screener mail | Progress line appears | | Bar with count and estimate. User can leave the screen | Header chip and Activity entry when done |

Rules for every class:

- **Never hide content to sync.** Keep the last-known screen and mark only what is changing.
- **Results never live only in a transient slot.** The toast and Activity both carry them.
- **Errors stay where the action was**, keep the user's choice visible, say what did and didn't
  happen, and offer Retry.
- **Button labels say the outcome** ("Move 640 to Trash", not "Confirm", `ui.ts:36`). NN/g:
  "provide response options that summarize what will happen"
  ([Confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/)).

### 4.2 Making background work visible and trustworthy

NN/g: "A lack of information often equates to a lack of control", and systems should inform
users about "backstage events" ([Visibility of system status](https://www.nngroup.com/articles/visibility-system-status/)).

**Header status chip** (always visible, text plus a dot, never colour alone):

| State | Copy |
|---|---|
| Idle | ● Up to date · 2 min ago |
| Syncing | ◌ Checking for new mail… |
| Indexing | ◌ Getting to know your inbox · 1,240 of 3,200 |
| Working | ◌ Moving 240 of 640 to Trash |
| Offline | ○ Offline · showing mail from 10:42 |
| Signed out | ○ Gmail sign-in expired · Reconnect |

Clicking the chip opens a small panel:
"Last checked 10:42 · Next check about 10:57 · Sorting moved 12 in the last hour (Undo) ·
6 categories work with Chrome closed, 3 only while Chrome is open · Rebuild index in Settings".

**Toasts for automatic runs** while the dashboard is open, only when something moved:
"Sorting moved 12 codes into 🔑 One-time codes · Undo". Group them. At most one automatic toast
per minute. Otherwise they go to Activity silently.

**Today "While you were away"** shows plain lines, each with Undo or View:

- "Sorting moved 38 messages out of your inbox"
- "Screener held 2 new senders · Review"
- "Auto-quarantine moved 3 messages from 1 sender · Review"
- "Custom rule 'Archive old newsletters' archived 14"

**Honesty about limits.** Each Sorting row says whether it works with Chrome closed (Gmail filter)
or only while Chrome is open (the 15-minute check). Today's text from `index.html:356-359` is
right but buried. Put the fact on the row, where the decision is made.

---

## 5. Content design

### 5.1 Glossary: one name per concept

| Use | Means | Retire |
|---|---|---|
| **Category** | A kind of mail Cluster recognises (One-time codes, Receipts, Shipping…) | bucket, group, smart view, kind, "Which labels" |
| **Label** | The Gmail label (Outlook folder) a category or sender's mail goes to, e.g. "🔑 One-time codes" | "Cluster label", folder (except for Outlook) |
| **Sorting** | The area, and the act of giving mail its category label | "Sort my inbox", "Keep sorted", "Keep doing this for new mail", auto-sort |
| **Stays in inbox for** | How long new mail in a category stays before it leaves the inbox | Inbox time limits, time limit, "Straight to label" ("Leaves at once") |
| **Leaves your inbox** | Inbox label removed. Mail is still in its label and in All Mail | file out, filed out, moved into its label, archive (in user copy, except Clean up filters) |
| **Move to Trash** | Recoverable for 30 days in Gmail | Delete, Clean up (as a button), Trim, Clear |
| **Delete forever** | Permanent, no undo | Fast permanent delete (keep as setting name only, with "Delete forever" in actions) |
| **Clean up** | The area only | Your cleanup plan, Ready to clean up, Start cleanup, Clean up (button) |
| **Unsubscribe** | Ask the sender to stop. Verified one-click when possible | Email, Open page, Bulk unsubscribe selected |
| **Mute** | Future mail skips the inbox into 🔇 Muted. Sender isn't told. Nothing deleted | Screener "Block", Keep sorted |
| **Block** | Security only: label existing mail as 🚨 Possible phishing **and** add a standing filter | Screener "Block", "Block sender" that only labels |
| **Screener** | The feature that holds mail from new senders until you choose | Screen, screening |
| **New senders** | The Screener's queue | first-time senders, unknown senders, "Waiting" |
| **Let in** | Screener decision: future mail reaches the inbox | Let through, Allow, Always allow |
| **Protected** | Mail Cluster never moves or trashes: starred, important, from people you write to, receipts and sensitive subjects | "safe", excluded, skipped, "Select safe" |
| **Activity** | The log of everything done, by you or automatically, with Undo | Recently done, Full history, Last background sweep |
| **Custom rule** | A user-written instruction (lives in Sorting) | Rules, Standing instructions, dry run (say "Preview") |
| **Up to date / Checking / Getting to know your inbox** | Sync status | Rescan, Scanning recent mail, scan |
| **Security / Looks suspicious** | The area and a finding | Phishing (as nav), impersonation, Possible impersonation |

Two pairings to state wherever both appear:
"Unsubscribe asks them to stop. Mute hides them even if they don't." and
"Leaves your inbox ≠ Trash. You can still find it under its label."

### 5.2 Twenty rewrites

| # | Current (file:line) | Problem | Rewrite |
|---|---|---|---|
| 1 | gear icon, no text (`index.html:48-49`) | Not findable | "⚙ Settings" (text label) in header and sidebar |
| 2 | "Rescan" (`index.html:45`) | Costly, vague, is also "apply settings" | Header: status chip. Settings → Sync: "Rebuild index" with "Only needed if counts look wrong. Takes a few minutes." |
| 3 | "Max messages per account" (`index.html:61`) | Implementation detail | "Look back over [6 months ▾]" |
| 4 | "Recently done" (`index.html:131`) | Weak scent for undo | "Activity" with lead "Everything you or Cluster did. Undo anything that can be undone." |
| 5 | "nothing permanent — everything here is reversible" (`dashboard.ts:1762`) | Wrong on a Trash bar | "Moves to Trash. You can undo for 30 days." |
| 6 | "Mute all" on Delete (`dashboard.ts:1317`) | Mute on a Trash screen | Clean up: "Move 640 to Trash". Senders filter: "Mute 18 senders" |
| 7 | "Apply plan" (`dashboard.ts:1774`) | Doesn't say what happens | "Move 852 to Trash" |
| 8 | "Confirm" (`ui.ts:36`) | Generic | The verb plus count: "Move 120 to Trash", "Mute groupon.com" |
| 9 | "Action failed, try again" (`ui.ts:49`) | No what or why | "Couldn't move these to Trash. Nothing changed. [Try again]" |
| 10 | "Keep sorted" (`dashboard.ts:2020`) | Sounds like Sorting, makes a per-sender label | Sender sheet: "Future mail: 🛍 Shopping ▾" |
| 11 | "Not useful" (`dashboard.ts:1613`) | Ambiguous | "Don't suggest this sender" |
| 12 | "Email" / "Open page" (`subscriptionsTab.ts:206`, `:212`) | Unsubscribe word missing | "Unsubscribe by email" / "Unsubscribe on their site" |
| 13 | "Block sender" → "Labeled ✓" (`securityTab.ts:300`, `:318`) | Doesn't block | Until fixed: "Move to Possible phishing", result "Moved 4 to 🚨 Possible phishing · Undo". After fix: "Block" with "Future mail goes to 🚨 Possible phishing." |
| 14 | Screener "Block" (`screenerTab.ts:247`) | It mutes | "Mute" |
| 15 | "Keep screening" disabled (`screenerTab.ts:240-242`) | A button that can't be pressed | Remove. Add hint: "Do nothing and they stay held." |
| 16 | "This is genuinely them" (`securityTab.ts:345`) | Forgets on reload | "It's genuine" with toast "We won't flag paypal.com for this again · Undo" (requires persistence) |
| 17 | "…may be impersonating people you know / Display name matches a known contact" (`dashboard.ts:938-939`) | Wrong for brands | "3 messages look like they're pretending to be PayPal, Netflix and Apple" (the reason comes from the strongest signal) |
| 18 | "Also move one-time codes to Trash after 2 days" (`index.html:386`) | Silent dependency on "Keep doing this" | Sorting row: "🔑 One-time codes · Stays in inbox for [1 hour ▾] · Then [Trash after 2 days ▾]" |
| 19 | "Time limits off. N Gmail filters kept for Sort my inbox." (`timeLimitsTab.ts:109`) | Exposes internal systems | "Codes will stay in your inbox. They still get their label." |
| 20 | "Scanning recent mail… the first run can take a minute." (`dashboard.ts:528`) and "Something went wrong (unknown error). Reload" (`:3001-3003`) | Blanks the screen. Error has no next step | "Checking for new mail…" in the chip, page stays. Error: "Cluster couldn't load your mail. Your settings are safe. [Try again] · [Reconnect Gmail]" |

Bonus fixes worth the same pass: "Bulk … selected" ×3 (`index.html:338-348`) become a selection
bar with "2 selected: Unsubscribe · Mute · Send to ▾". Use "Out of the inbox" or "Labelled
only" instead of "filed out of the inbox" / "labelled in place" (`sortInbox.ts:309`). The Outcome
filter values "quiet in scan" / "not requested" (`index.html:506-508`) become "Stopped" and
"Not unsubscribed yet". "Draft rule locally" / "Save reviewed draft" (`index.html:588-589`) become
"Preview rule" / "Turn on rule".

Style notes for all copy: lead with the outcome, then the count, then the object. Use one
sentence of 12 to 20 words for hints. Put caveats next to the control they qualify, not at the end
of a paragraph. Don't lean on dashes. Several current strings join clauses with em-dashes
(`index.html:222-223`, `:283`, `dashboard.ts:1762`).

---

## 6. Competitor patterns and UX guidance

Primary sources fetched for this report are marked ✓. The others are carried from the IA note and
the walkthrough with their original sourcing.

| Product | Pattern | What Cluster should take | Source |
|---|---|---|---|
| HEY Screener ✓ | First-contact yes/no. "Screener History shows you who've you screened out and lets you screen them back in." "Your decision is private." | A history of decisions (Muted / Let in filters in Senders) and the reassurance line "They aren't told" | [hey.com/features/the-screener](https://www.hey.com/features/the-screener/) |
| HEY Imbox / Feed / Paper Trail ✓ | Places named for the **kind of mail**: Imbox "important, immediate emails"; Feed "shows all of your newsletters"; Paper Trail for "receipts, confirmations, and transactional emails… out of your way, but easy to find" | The Sorting list is Cluster's Paper Trail. Use the "out of your way, but easy to find" promise in its copy | [hey.com/features](https://www.hey.com/features/) |
| Clean Email ✓ | Auto Clean has one master toggle ("click the toggle to the right of the page title"). Rules come from any group: "the action bar… includes the Create Rule action button" | "Always do this" offered from a Clean up suggestion or a sender sheet, landing in Sorting | [clean.email/help/auto-clean/overview](https://clean.email/help/auto-clean/overview) |
| SaneBox | Training by moving mail: "Moving an email back to your Inbox 'retrains' SaneBox." Changes are noticed "almost immediately" | Corrections ("It's genuine", "Don't suggest") must persist and show their effect | [How does SaneBox work](https://www.sanebox.com/help/155-how-does-sanebox-work), [Train SaneBox](https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox) (via search summary) |
| Superhuman | "Hit Z within 10 seconds" to undo the last action. Fixed 10-second window | Toast Undo about 10 s, plus Activity for longer | [Superhuman Undo](https://help.superhuman.com/hc/en-us/articles/47278253460499-Undo) (via search summary) |
| Shortwave ✓ | Bundles group threads "as a single item"; configured in "Settings > Inbox Setup > Bundles & delivery schedules" | Group configuration in one named place (Sorting), daily screens clean | [shortwave.com/docs/guides/bundles](https://www.shortwave.com/docs/guides/bundles/) |
| Gmail | Manage subscriptions: one list, one count, one Unsubscribe per row. Action snackbars like "Conversation moved to Trash. Undo" | One action per row. Snackbar with Undo. **(Inference)** for the snackbar wording, from product use. Support page not reached this session | [Gmail Help: manage subscriptions](https://support.google.com/mail/answer/15621070) (via IA note) |

UX guidance applied:

| Principle | Source ✓ | Applied in |
|---|---|---|
| Labels on icons, always visible | NN/g [Icon usability](https://www.nngroup.com/articles/icon-usability/): "a text label must be present alongside an icon"; "Icon labels should be visible at all times" | Settings, Screener icon, header chip |
| Visibility of system status | NN/g [Visibility of system status](https://www.nngroup.com/articles/visibility-system-status/): "keep users informed about what is going on, through appropriate feedback within reasonable time" | Header chip, toasts, Activity, While you were away |
| Response time limits | NN/g [Response times](https://www.nngroup.com/articles/response-times-3-important-limits/): 0.1 s / 1 s / 10 s | Section 4.1 table |
| No blank screens | NN/g [Skeleton screens](https://www.nngroup.com/articles/skeleton-screens/): blank pages make users "assume something is wrong"; progress bars past 10 s | First index, sync |
| Recognition over recall | NN/g [Recognition and recall](https://www.nngroup.com/articles/recognition-and-recall/): make "information and interface functions visible and easily accessible" | Category list shows current settings inline; sender sheet shows current future-mail choice |
| Progressive disclosure, max 2 levels | NN/g [Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): "Initially, show users only a few of the most important options"; beyond 2 levels "users often get lost" | One primary per row → sheet. Custom rules collapsed. Today's Delete → Review → legacy panel → confirm is 3+ levels |
| Undo over confirm, specific button labels | NN/g [Confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/): "offer undo… to reduce anxiety"; "provide response options that summarize what will happen" | Section 4.1, rewrites 7-8 |

---

## 7. Hand-offs

### 7.1 To the UI team (visual and interaction design)

1. **Labelled Settings**: a text+icon button in the header and a "Settings" sidebar item. Settings
   becomes a full page with section headings (3.3).
2. **Sidebar**: Today, Sorting, Senders, Clean up, a divider, Security, a divider, Activity,
   Settings. Sticky. Counts: Senders (new senders), Security (red only for high risk), Activity
   (today's undoable, neutral).
3. **Header status chip** with the 6 states in 4.2 and a small panel. Text plus a shape, never
   colour alone.
4. **Toast component**: bottom, about 10 s, one action (Undo or Review), stackable to 3, pauses on
   hover or focus, announced with `role="status"`, keyboard reachable.
5. **Row states**: idle, pending ("Saving…" / "Unsubscribing…"), done (slides out or updates),
   error (inline message + Retry). Removing a row must not shift focus to the top.
6. **Skeletons** for Today cards, sender rows and Sorting counts. Inline progress bar style for
   long jobs.
7. **One primary action per row**, the rest in the sender sheet (side panel). Retire the full
   "Options" strip.
8. **Confirm pattern** only for Trash and Delete forever: inline, with the count and the
   outcome-verb button. Delete forever uses a distinct danger treatment.
9. **No global banner stack.** Onboarding becomes the first-run flow. Label tidy-up and Athena move
   to Settings, with at most one dismissible Today card.
10. **Sorting row layout** that fits 11 categories without horizontal scroll, with the status pill
    and "In inbox now" count.
11. **Empty, loading and error states** per screen, using the copy in 3.3.
12. **Security card**: plain-language reason first, technical marks under "Details".

### 7.2 To the software team

1. **Stop rescanning after actions** (IA note A1/A2). Apply the change locally, re-render the
   affected rows, never hide containers. This is the precondition for every feedback rule here.
2. **One action pipeline** that every action goes through. It emits `pending → done | failed`
   events with a count, a human summary and an undo payload (or an explicit "not undoable"
   reason). The toast, row state and Activity all subscribe to it.
3. **Undo payloads for every reversible action**: Keep sorted / future-mail changes (delete the
   filter, restore the inbox), Mute from bulk paths, Screener Let in and Mute, Security label,
   snooze, unsubscribe (log as not undoable, offer Mute).
4. **Fix the Delete plan buttons**: confirms render into hidden sections (`dashboard.ts:1319`,
   `:1335`, `:1777-1780` vs `:624-626`). Check in preview first.
5. **Persist corrections**: "It's genuine" (`securityTab.ts:345`) and "Don't suggest" must be
   stored and must change future scoring.
6. **Block = standing filter** (intelligence note TL;DR 2). Screener "Block" becomes Mute in copy
   and code.
7. **Per-sender future mail** uses category labels or 🔇 Muted, not a new label per sender
   (`dashboard.ts:2021`).
8. **Structured background reports**: replace `lastTriageSummary` (`background.ts:365-372`) with
   per-feature Activity entries (`source: "sorting" | "screener" | "quarantine" | "rule"`). Fix
   time-limit moves being counted as "cleanups" (`dashboard.ts:984-986`).
9. **Sync status store**: `lastSyncAt`, `nextCheckAt`, `inProgress { kind, done, total }`, offline,
   auth state, and per-category "works with Chrome closed". It is read by the header chip.
10. **Settings apply on change.** Decouple scan or index settings from the Rescan button
    (`dashboard.ts:2270-2291`).
11. **Deep links**: `#senders?filter=new`, `#security?risk=high` and so on, so Today cards land
    on filtered views.
12. **One category settings model** (IA note B2), including the codes-to-Trash dependency
    (`sortInbox.ts:575`) folded into each category's "Then".
13. **Screener switch preview**: count how many senders would be held before turning it on
    (`screenerTab.ts:264-270`).
14. **Performance budget**: acknowledgement ≤ 100 ms, local re-render ≤ 250 ms for 10k messages
    (the IA note estimates ~250 ms of summary rebuild), a progress event at least every 500 ms
    for long jobs.

---

## 8. Usability test plan (with the owner, after the redesign)

**Setup.** The preview harness with the fake inbox (`npm run preview:ui`), plus one session on
the owner's real Gmail. Think-aloud, no help from the facilitator. Record the screen. After each
task, ask the Single Ease Question (1-7). Before build, run a 10-minute tree test of the new nav
labels on paper to check C1 (Sorting vs Categories).

| # | Task (read to participant) | Success criteria |
|---|---|---|
| 1 | "Switch Cluster to dark mode, then show me where you'd connect an Outlook account." | First click on Settings within **10 s** and no hover-hunting. Both found in Settings. No reload or Rescan needed. SEQ ≥ 6. |
| 2 | "Make one-time codes leave your inbox after an hour and go to Trash after two days. Will that keep happening if Chrome is closed?" | Done on **one screen** (Sorting) in ≤ 60 s. A toast confirms. Participant answers the Chrome-closed question correctly from the row. No visit to Rules or Organize-style detours. |
| 3 | "Groupon emails you too much. Make them stop and get rid of the ones you already have." | Finds the sender via search or the "Needs a decision" filter in ≤ 30 s. Can say what Unsubscribe vs Mute do. Existing mail goes to Trash with one confirm. **The screen never blanks.** Each step gives feedback within 1 s. |
| 4 | "You just trashed the wrong batch. Put it back. Then tell me what Cluster did on its own since yesterday." | Undo from the toast or Activity, first try, ≤ 15 s. Mail restored and the row reappears without a rescan. Participant finds automatic entries in Activity or on Today and can name the feature that did each one. |
| 5 | "Turn on holding mail from people you've never emailed. Let one sender in and mute another." | Finds the Screener switch in ≤ 20 s without being told the word "Screener". Sees how many will be held before turning it on. Let in and Mute each give a toast with Undo. Participant can say where muted mail went. |

Overall pass: 5/5 tasks completed, at least 4 without facilitator help, median SEQ ≥ 6, zero
"blank screen" moments, and the owner can say in one sentence what each sidebar item is for.
Anything below that goes back to IA, not to styling.

---

## Open questions for the manager

1. **"Sorting" or "Categories"** as the area name (C1)? We recommend Sorting, pending the tree test.
2. **Save on change** in Sorting (our view) or a single Save (IA note)?
3. **Should Block (standing filter to Possible phishing) exist outside Security?** We say no.
   Senders gets Mute only.
4. **Health score**: drop it to a one-line summary on Today, or remove it? It is the least
   actionable thing on the current landing screen.
5. **Is "Calm inbox" the right default preset**, given that it makes a destructive automation
   (codes to Trash after 2 days) part of first run? It can be undone, but it is still Trash.
