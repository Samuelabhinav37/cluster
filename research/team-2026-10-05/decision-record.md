# Cluster decision record and roadmap

_2026-10-05. Product and engineering manager. Approves and merges the UX, UI and engineering
reports in this folder. Research only. No source code was changed._

Inputs and short names used below:

- **UX** = `ux-report.md`. **UI** = `ui-report.md` plus `mockup.html`. **Eng** = `engineering-report.md`.
- **Sync note** = `../2026-10-05-sync-and-ui-architecture.md`. **Audit** = `../2026-10-05-algorithm-audit-and-upgrades.md`.
- **Plan** = `memoized-giggling-kettle.md` (Phase 2, inbox time limits).
- A section reference like "Eng §2.3" points at that report.

To avoid a clash with the plan's "Phase 2" and "Phase 3", the new roadmap phases are called
**R0 to R8**.

---

## 1. Summary for the owner

1. All three teams found the same root problem. Every action throws away what is on screen and
   re-reads about 3,200 emails from Gmail (Eng §1.1, UX §2). We fix that first, before any
   redesign. After R1 an action costs one Gmail call, not a full re-read.
2. We found three safety bugs that can move or delete mail you care about. Undo of a time-limit
   move gets undone again within 15 minutes. The "codes to Trash" option can trash receipts and
   Important mail. Mute moves starred mail (Eng §2.3 A1, A2, A4). These are fixed first, in R0.
3. Settings becomes a labelled button and a sidebar item with its own page. The gear icon looks
   like a sun and has no label (UI §1.4, UX §2 job 8). This lands in R2.
4. The sidebar becomes seven plain places: Today, Sorting, Senders, Clean up, Security, Activity,
   Settings (UX §3.2). One job per place.
5. **Sorting** is where each kind of mail gets its emoji label and its time in your inbox. Primary
   stays your main inbox. Default for every category is "Keep". Nothing goes to Trash unless you
   pick a Trash option on purpose and confirm it.
6. Every reversible action gets an Undo toast and an entry in Activity. Only Trash and Delete
   forever ask "are you sure" (UX §3.1 C5).
7. Phishing gets stronger in R3. "Block" will really block future mail, "It's genuine" will be
   remembered, and fake "PayPal" or "Google" mail gets caught more often (Eng §2.3 A7, A8, A15).
8. Each decision gets a plain "Why?" ("Moved because: 📰 Newsletters, 3 day limit"). One shared
   decision function replaces four that disagree (Eng §1.3, §2.4).
9. We keep the Apple glass v3 look and the purple accent. We use purple less, fix four contrast
   failures, and keep red for real danger only (UI §1.5, §3.1).
10. Phase 2 (inbox time limits) ships after three small fixes and your live test. Its screen is
    temporary. It moves into Sorting in R4. Three questions need you (section 3.1).

---

## 2. Where the teams agree and where they conflict

### 2.1 Agreement (approved as written)

| Topic | What all teams say | Refs |
|---|---|---|
| Root cause of slowness | Rescan after every action. Fix with local state, not tuning | Eng TL;DR 1, UX TL;DR 4, UI §4.3, Sync note TL;DR 1 |
| Never blank the screen | Keep last-known content, mark only what changes | UX §4.1, UI §4.3, Eng §3.5 |
| One action event stream | `pending → done or failed` with count, summary and undo | UX §7.2 #2, UI §7.1 #1, Eng §3.5 and §4.2 |
| Undo for every reversible action | Toast about 10 s plus Activity entry | UX §3.5, UI §3.9, Eng §3.6 |
| Seven-item IA | Today, Sorting, Senders, Clean up, Security, Activity, Settings | UX §3.2, UI §3.2, mockup |
| Settings as a labelled full page | Header button with text plus sidebar item | UX C2, UI §3.2 and §5.8 |
| Activity as a nav item | Rename "Recently done" | UX C3, UI §5.7 |
| Header status pill with 6 states | Text plus shape, never colour alone | UX §4.2, UI §3.3, Eng §4.1 |
| One sender side sheet | Future mail, Unsubscribe, mail already here, why, history | UX §3.3, UI §3.15, Eng §4.3 `setFutureMail` |
| One decision and one safety gate | `decide()` and `canAct()` with reason codes | Eng §2.4, Audit U7, UX §7.2 #5 |
| Glossary | One name per concept, 17 entries | UX §5.1, UI follows it |
| Glass on the navigation layer only | Header, sheet, toast, popover, bulk bar | UI §2 and §3.1 |
| IndexedDB index plus `history.list` sync | Full sync once, then deltas | Eng §3.2-3.3, Sync note §1.4 |

### 2.2 Conflicts and decisions

**C-1. Area name: "Categories" or "Sorting".**

- Options: "Categories" (Sync note §2.4). "Sorting" (UX C1, UI follows).
- **Decision: Sorting.** "Category" stays as the row noun ("One-time codes is a category").
- Why: Gmail already shows "Categories" (Primary, Promotions, Social). Cluster's own filters use
  `category:promotions` (UX C1). Two meanings in one product is the confusion we are removing.
  The UX paper tree test (UX §8) still runs in R0. If it fails, renaming is a label change only.

**C-2. Remove a row after API success, or at once with rollback.**

- Options: UI §4.2 says pending first, remove after success. Eng §3.5 says apply an overlay at
  once and roll back on failure.
- **Decision: both, split by what changes.** The engineering overlay is written at once, as
  Eng §3.5 step 2 describes. The view shows the overlay as **pending** (row dims, button spins,
  "Muting…") within 100 ms. The row leaves and counts change only on API success. Local-only
  changes (a Sorting row, dismiss, theme) apply in full at once. On failure the overlay rolls back
  and the row shows Retry.
- Why: pending meets the 0.1 s acknowledgement rule (UX §4.1). A row that vanishes and comes back
  reads as a bug, and Gmail filter calls can fail on quota (UI §4.2). `batchModify` is one call,
  so the pending state is short. The owner's trust rule ("nothing lost") favours showing the true
  state.

**C-3. "Then: Trash after N days" inside Sorting.**

- Options: put it in every row (mockup, UI §3.14). Leave it out (UX open question 5, Eng Q6,
  Sync note Q2). Keep today's hidden checkbox (`sortInbox.ts:575`).
- **Decision: keep it in Sorting, opt-in only, on four categories, behind a confirm, after the
  safety fix.**
  - Every category defaults to **Keep**. No preset turns on Trash, including "Calm inbox".
  - Trash options appear only for One-time codes, Promotions, Newsletters and Social. Receipts,
    Orders and shipping, Shopping, Travel, Finance, Work and Education show "Keep" as fixed text.
  - Choosing a Trash option opens the one inline confirm the product allows for Trash (UX C5):
    "Move Promotions to Trash 30 days after they leave your inbox? Starred and protected mail is
    skipped."
  - Every automatic Trash goes through `canAct(…, "trash")` (Eng §2.4). Until that exists, it
    goes through the full `protectionDecision` gate (R0 fix A2).
  - The old "Also move one-time codes to Trash after 2 days" checkbox migrates into the codes row.
    A user who had it ticked keeps it. Nobody else gets it.
- Why: the owner said nothing is deleted unless explicitly chosen. Opt-in plus a confirm is an
  explicit choice. It also removes a hidden dependency (UX §2 job 3 step 5) and one of five code
  deciders (Eng §1.3 C).

**C-4. Purple accent or neutral.**

- Options: keep purple for selection and primary (UI Q1). Swap to graphite.
- **Decision: keep purple, use less of it.** Purple is allowed for: the current nav item, selected
  chips, switches that are on, checked boxes, progress bars, and **one** primary button per screen.
  Row actions become **neutral**, including the row's recommended action. This tightens UI §3.4,
  which allowed one accent button per row. Apply the contrast fixes in UI §3.1 (`--accent-solid`
  `#7466cc → #6456c0`, opaque focus ring, `--control-border`).
- Why: purple is part of the liked Apple glass v3 look. The owner's standing rule is to iterate on
  the liked version, not redesign. The rule "neutral palette" is met by removing purple from rows,
  which cuts the ~16 purple controls per viewport on Organize (UI §1.1). Red stays for destructive
  confirms and high-risk Security only (UI §1.1, §5.6). Green stays for real success only.

**C-5. Screener as its own area or a chip in Senders.**

- Options: own area, HEY style (Sync note Q3). A "New" chip (Sync note §2.4). UX C4: inside
  Senders with a switch, a filter, a Today card and a nav count.
- **Decision: UX C4.** A labelled switch at the top of Senders ("Hold mail from new senders"), a
  "New senders (3)" chip that is first and selected when non-empty, a Today card and a count on
  the Senders nav item. Turning it on shows the count first (Eng §4.3 `previewScreener`).
- Why: a chip alone repeats today's findability failure (UX C4). A separate area adds an eighth
  nav item for a feature that is off by default.

**C-6. Ship the action pipeline (E1) before IndexedDB.**

- Options: E1 in memory first (Eng Q1, Sync note Phase A1). Build the index first.
- **Decision: E1 first.** The store, events and `runAction` API are the final shapes from Eng §3.4
  and §3.5. In R1 they sit on top of today's in-memory `SenderSummary[]`. R5 swaps the backing
  store for IndexedDB without changing the API.
- Why: it ends the blank screen in about a week. It unblocks every UI feedback item (UI §7.1).
  Building the index first delays the owner's top complaint by three or more weeks.

**C-7. Save on change or one Save button in Sorting.**

- Options: one Save (Sync note §2.4). Save on change with toast and Undo (UX §3.3, UI §3.14).
- **Decision: save on change.** The only exception is choosing a Trash option, which confirms first.
- Why: a forgotten Save is a silent failure (UX §3.3). Today's "Save time limits" button is one
  of those.

**C-8. Toasts: one at a time, or a stack.**

- Options: one (Material, UI §2). Up to 3 (UX §7.1 #4, mockup).
- **Decision: up to 3, newest at the bottom, bottom left. Automatic-run toasts merge, at most one
  per minute.** Ctrl or Cmd+Z undoes the newest (UI §3.9).
- Why: bulk work can produce two results close together. Bottom left keeps the bulk bar's main
  button clear (UI Q5).

**C-9. Sidebar emoji or line icons.**

- Options: emoji (mockup, Sync note). Line icons (current build, UI Q7).
- **Decision: line icons in the sidebar.** Emoji stay in category and label names, where they
  match the Gmail labels from Phase 1.
- Why: line icons are part of the liked v3 build and render the same on every OS (UI Q7). Emoji in
  both places would make the sidebar louder than the content, the opposite of the Linear lesson
  (UI §2).

**C-10. "Leaves at once" (0-hour filters) for every category.**

- Options: allow everywhere with a warning. Limit to Promotions (Eng Q3, A9).
- **Decision: Promotions only, for now.** Every other category starts at 1 hour, so the time sweep
  (which checks starred, contacts and risk) moves the mail. Revisit for Newsletters and Social
  after R3 lands U15 and U16 (security scan sees labelled mail).
- Why: a 0-hour filter removes mail at delivery with no safety check. The security scan only
  reads the inbox, so a phish filed at delivery is never scanned (Eng §2.3 A9, Audit U16).

**C-11. Settings scope: gear sheet or page; Connect Outlook in the header.**

- **Decision: full page** with the sections in UX §3.3. Connect Outlook, label tidy-up and Athena
  move into Settings. Rescan becomes Settings → Sync → "Rebuild index". All settings apply on
  change (UX §7.2 #10).

**C-12. Status enum names.**

- Eng §4.1 says `syncing`, UI §3.3 says `checking`. **Decision:** code uses Eng's enum. Copy uses
  UX §4.2 ("Checking for new mail…"). The mapping lives in one view module.

---

## 3. Answers to every open question

### 3.1 The questions that need the owner

Only three. Each is a short choice with our recommendation first.

| # | Choice | Recommended | Default if no answer |
|---|---|---|---|
| Q-A | **Push the R0 safety fixes and Phase 2 as soon as your live test passes, ahead of the redesign?** (a) Yes, push after your live test. (b) Hold until the new UI is ready. | (a). Two of the bugs are already live in pushed code (A2, A4). | Nothing is pushed until you say so. |
| Q-B | **How far back should Cluster read your mail?** (a) Last 6 months, about 3,200 messages, ready in a few minutes. (b) All mail, about 33 minutes once, in the background. | (a), with "All mail" as a choice in Settings → Sync. | (a). |
| Q-C | **Do you use Outlook with Cluster day to day?** (a) No. Stay Gmail-first. Outlook keeps working as it does today. (b) Yes. Bring Outlook to parity (adds about 2 weeks in R8). | (a). | (a). |

### 3.2 Full table

"Owner" = owner input needed (Y or N). Y rows are the three choices above.

**UX report open questions (UX "Open questions for the manager")**

| Question | Decision | Reason | Owner |
|---|---|---|---|
| UX-1 "Sorting" or "Categories" | Sorting | See C-1 | N |
| UX-2 Save on change or single Save | Save on change, Trash options confirm | See C-7 | N |
| UX-3 Block outside Security? | No. Senders gets Mute only. Block exists only in Security, as a real standing filter (R3) | Three meanings of "Block" today (UX §5.1). Block implies threat | N |
| UX-4 Health score | Remove the score and the 12-week chart. Keep one summary line on Today (UI §5.2) | Least actionable item on the landing screen (UX Q4) | N |
| UX-5 Is "Calm inbox" the right default preset? | Yes, but without Trash. Calm inbox = codes, shipping, newsletters, promotions leave the inbox on the Plan defaults; every "Then" is Keep | Owner rule: nothing deleted unless chosen. See C-3 | N |

**UI report open questions (UI §7.3)**

| Question | Decision | Reason | Owner |
|---|---|---|---|
| UI-1 Purple accent | Keep, restricted | See C-4 | N |
| UI-2 Ambient gradient | Keep it. Blur leaves content lists only | Part of the liked v3 look. Blur on lists costs paint and adds nothing (UI §1.1) | N |
| UI-3 Page title 34 → 30 px | Approve | Daily tool, title is a label (UI §3.1) | N |
| UI-4 Optimistic removal timing | Pending at once, leave on success | See C-2 | N |
| UI-5 Toast position | Bottom left | See C-8 | N |
| UI-6 "Then: Trash after N days" in Sorting | Yes, opt-in, four categories, confirm | See C-3 | N |
| UI-7 Sidebar emoji or line icons | Line icons | See C-9 | N |

**Engineering report open questions (Eng §7)**

| Question | Decision | Reason | Owner |
|---|---|---|---|
| Eng-1 E1 before IndexedDB | Yes | See C-6 | N |
| Eng-2 Index depth | Default 6 months, "All mail" in Settings | Q-B | **Y** |
| Eng-3 0-hour filters | Promotions only for now | See C-10 | N |
| Eng-4 Outlook parity | Gmail-first, Outlook unchanged | Q-C | **Y** |
| Eng-5 Two-signal protection (U8) | Accept | It only changes what Clean up *offers*. The user still confirms every Trash. It fixes "protection bought with one word" (Audit TL;DR 2) | N |
| Eng-6 Keep "codes to Trash"? | Yes, as the opt-in Sorting option in C-3, after the A2 fix | Users who chose it keep it; it becomes safe and visible | N |
| Eng-7 Push E0 ahead of the redesign | Recommend yes | Q-A. Push needs the owner by standing rule | **Y** |
| Eng-8 CI policy | Yes. Bundle budget and a serial DOM project become required checks. Timing budgets are at least 5× measured, never `it.fails` on time (Eng §5.4) | A timing test turned the suite red this week (Eng §5.3) | N |

**Background notes, still open (answered for completeness)**

| Question | Decision | Reason | Owner |
|---|---|---|---|
| Sync Q4 Custom rules visible? | Yes, collapsed under Sorting as "Custom rules (n)" | UX §3.1 endorses it | N |
| Sync Q6 "Max messages" setting | Replaced by "Look back over [6 months]" once the index exists (R5) | Implementation detail (UX §5.2 #3) | N |
| Sync Q7 Chrome side panel | Not now. Revisit after R7 | Changes the shell, not the IA | N |
| Audit Q2 Security notices as own protected kind | Yes, in R3 (never expires, never a code) | Fixes "Enable 2FA" filed as a code (Eng §2.2 probe) | N |
| Audit Q3 AI may only raise protection | Yes (U12), in R0 as fix A6 | Removes the one path where a model weakens safety | N |
| Audit Q4 Outlook header sample | Deferred with Q-C | Needed only for Outlook work | N |
| Audit Q5 Signed datasets key | Deferred to R8. Ask when scheduled | Not on the critical path | N (later) |
| Audit Q6 Personal model storage | Header features only at first (R8) | Lowest privacy risk | N |
| Audit Q7 Corpus languages | English first. Ask when R8 starts | Not on the critical path | N (later) |
| Audit Q8 Auto-quarantine to Spam | Label only. Never Spam | Owner rule: nothing removed without a choice | N |
| Audit Q9 Missing audit doc | Point `algorithmAudit.test.ts` at the audit note, in R0 | The cited file does not exist | N |

---

## 4. Approved bug list, fix first (R0)

Owner column is the team that fixes it. Severity follows Eng §2.3. Each fix lands with a test that
failed before (Eng §5.5).

| # | Bug | Severity | Evidence | Fix | Owner | Branch |
|---|---|---|---|---|---|---|
| B1 | Undo of a time-limit move is re-moved by the next 15-minute sweep | **High** | Eng §2.2 probe, A1 | Undo adds the ids to `keptInInboxIds` (later `pinnedInInbox` in the index, Eng §3.2) | Eng | `feature/inbox-time-limits` (commit 2e) |
| B2 | Sort's "Trash codes after 2 days" rule trashes "one-time payment receipt", "Enable 2FA" and Important mail | **High** | Eng §2.2 probe, A2 | Route through full `protectionDecision`; require a code-shaped token or `Auto-Submitted`; never Important or security notices (Audit U8) | Eng | `fix/safety-r0` |
| B3 | Mute, Keep sorted and Screener Block move starred and Important mail | **High** | Eng §2.3 A4 (`dashboard.ts:1695`, `:2033`, `bulkActions.ts:65`, `screenerTab.ts:81`) | Filter existing ids through the move-out gate. The future-mail filter stays | Eng | `fix/safety-r0` |
| B4 | `.instead-strip` and other `display` rules beat `[hidden]`, so every Options strip is always open (Mute shows twice per row) | **Medium-High** (doubles controls, 117 on Organize) | UI §1.4 #1, measured | Global `[hidden] { display: none !important }` | UI | `fix/safety-r0` |
| B5 | Search icon overlaps the placeholder | Low | UI §1.4 #2, measured | Fix the `.search input` specificity tie | UI | `fix/safety-r0` |
| B6 | Four WCAG 2.2 AA failures: primary text 3.4:1, control borders 1.4:1, focus ring 2.8:1, 16 px checkboxes | **Medium** | UI §1.5 | Token fixes in UI §3.1 plus a 28 px hit area | UI | `fix/safety-r0` |
| B7 | Test suite is red and the tree fails lint | **High** (process: blocks every commit's definition of done) | Eng §2.2, §5.2, §5.3 | Fix the perf `it.fails` (pre-filter, or `skip` with a comment); drop the unused `recentTab.ts:18` imports; ignore `coverage/`; commit the known-bug suites and research notes; add `check:bundle` to CI | Eng | `fix/safety-r0`, first commits |

Also approved for R0 because they are small and touch safety or trust:

| # | Bug | Severity | Fix | Owner |
|---|---|---|---|---|
| B8 | Auto-quarantine ignores known correspondents (A5) | High | Skip correspondents unless auth fails | Eng |
| B9 | On-device AI can remove protection (A6) | High | AI may only raise protection (U12) | Eng |
| B10 | Sender text through `innerHTML` on the Phishing screen (A17) | Medium-High | `textContent` | Eng |
| B11 | "Mute all", "Trash" and "Apply plan" on Delete fire confirms into hidden sections | Medium | Check in preview first (UX §2 job 1), then render the confirm in a visible slot | Eng + UX |
| B12 | False promises in copy: "nothing permanent, everything here is reversible" over a Trash bar; "Anything here can be put back for 30 days" | Medium | UX §5.2 rewrites #4 and #5 | UX copy, Eng to apply |
| B13 | Time-limit moves counted as "cleanups" on Overview | Low | Log them as Sorting moves (UX §2 job 5, Eng §4.3) | Eng (commit 2g on Phase 2 branch) |
| B14 | 0-hour filters offered for every category | Medium | Promotions only (C-10) | Eng (commit 2f on Phase 2 branch) |

Deferred to R3 with reasons: A3 (rules gate) and the rest of A11-A16 need `canAct` (Eng §2.4); A7
and A8 belong with the phishing work.

---

## 5. Approved roadmap

Effort: S ≤ 2 days, M ≤ 1 week, L > 1 week (Eng §6). Every phase follows Eng §5.1 and §5.5:
feature branch, one tested commit per step, flag or shim so the extension works at every commit,
mockup shown before UI is built, push only when the owner says.

```
Week:     1      2      3      4      5      6      7      8      9+
R0 Safe   ████
R1 Fast          ██████
R2 Find               ██████
R3 Decide                    ████████████
R4 Sorting                               ██████
R5 Index         ·····████████████████████████        (parallel, flagged, invisible)
R6 Senders                                      ████████████
R7 Today+                                                   ██████
R8 Later                                                          ...
```

### What happens to the unpushed Phase 2 branch

**Ship it, after fixes, not folded into the redesign.**

- Add three commits to `feature/inbox-time-limits`: **2e** Undo pins the message (B1), **2f**
  "Straight to label" for Promotions only (B14), **2g** time-limit moves logged as Sorting, not
  cleanups (B13).
- Then the owner runs the Plan's live checklist (Plan "Verification" step 4).
- Push when the owner says (Q-A).
- Its "Inbox time limits" section on Organize is **temporary UI**. R4 replaces it with the Sorting
  screen. The settings v13 data (`inboxHoursByBucket`, filter sync) carries forward. R4's v14
  migration starts from it.
- Why not fold it in: it fixes real sorting gaps today (Plan "Context"), its engine is reused
  as-is, and holding it for weeks lets it drift from master.

### R0. Safe and green (first phase)

| | |
|---|---|
| **Goal** | Nothing Cluster does can move starred or Important mail or undo your Undo. The test suite is green. Phase 2 is ready for your live test. |
| **In scope** | B1-B14 (section 4). Commit the untracked known-bug suites, research notes and `check:bundle` (Eng §5.2). CI runs `check:bundle`. Point `algorithmAudit.test.ts` at the audit note. In parallel, no code: UI produces mockup v2 with the change requests in section 6; UX runs the 10-minute paper tree test of the nav labels (UX §8). |
| **Out of scope** | Any layout change, new nav, removing rescans, IndexedDB, new features. |
| **Deliverables** | Phase 2 branch with 2e-2g. Branch `fix/safety-r0` cut from the Phase 2 tip with about 12 granular commits. Mockup v2. Tree test result. |
| **Dependencies** | None. |
| **Effort** | S-M (about 4-5 working days). |
| **Definition of done** | Each bug has a test that failed before and passes now. Full serial suite, typecheck, lint and `check:bundle` pass locally and in CI. Preview check at desktop and narrow widths, light and dark. Live checklist ticked for filter and quota changes. |
| **Owner sees and tests** | Reload the unpacked extension. (1) Run the Plan's Phase 2 live checklist. (2) Undo a time-limit move, wait 20 minutes, the mail is still in the inbox. (3) Star a message from a sender, Mute the sender, the starred message stays. (4) On Organize, each sender shows one Mute, not two; the Options strip opens only on ⋯. (5) The search icon no longer covers the text. (6) Review mockup v2 and approve or comment. |

### R1. No more blank screen

| | |
|---|---|
| **Goal** | Every action answers in under 0.1 s and never re-reads your mailbox. |
| **In scope** | Eng E1: store, events, `runAction`, `undo` over today's in-memory data (Eng §3.4-3.6). Replace all 13 `rescan()` call sites with local patches. Stop hiding containers (`dashboard.ts:524-528`). Toast component (UI §3.9). Row states pending, leaving, entering, error (UI §3.6). Undo payloads for every reversible action (UX §7.2 #3). Unsubscribe logged as "Can't be undone · Mute instead". Focus moves to the next row (UI §3.6). Reduced motion as 1 ms durations (UI §4.4). |
| **Out of scope** | New nav or screens. IndexedDB. Restyling rows beyond the states. |
| **Deliverables** | `src/lib/store/`, `src/lib/actions/`, toast and row-state CSS, test harness `await dash.op()`, `src/nonfunctional/reactivity.test.ts` (Eng §4.3). Flag `actionPipeline`, default on once the live check passes. |
| **Dependencies** | R0 green suite. Mockup v2 approved for the toast and row states. |
| **Effort** | M (about 1 week). |
| **Definition of done** | No action path calls `rescan()` (source-scan test). Acknowledge ≤ 100 ms and re-render ≤ 250 ms in the reactivity test. Quota ledger shows an action costs only its API call. Every action writes an Activity entry with undo or a "can't be undone" reason. |
| **Owner sees and tests** | Mute a sender: the row dims, slides out, a toast says "Muted Groupon · Undo". Press Undo: the row comes back. The screen never goes blank. The quota line in the ledger shows about 50 units, not about 28,000. |

### R2. Findable

| | |
|---|---|
| **Goal** | You can find Settings, Undo and what Cluster did in under 10 seconds. |
| **In scope** | New shell from the mockup: header with status pill and a labelled Settings button; sidebar Today, Sorting, Senders, Clean up, Security, Activity, Settings, with line icons and `aria-current` (UI §1.5). Existing screens are mapped, not rebuilt: Overview → Today, Organize time limits + Sort my inbox + Rules → Sorting, Organize decisions + All senders + Subscriptions + Screener → Senders, Delete → Clean up, Phishing → Security, Recently done → Activity (Sync note B1). Settings full page (UI §5.8) with Connect Outlook, label tidy-up, Athena, theme, "Rebuild index". Settings apply on change. Global banner stack removed (UI §3.8). Eng E2: sync status slice, structured background reports per feature, `storage.onChanged`, deep-link router (Eng §4.1-4.3). Glossary copy for nav, buttons and confirms (UX §5.2 rewrites 1-9, 11-15, 20). Token cleanup: spacing scale, type scale, radii, single dark block (UI §3.1). |
| **Out of scope** | New Sorting, Senders, Today or Clean up layouts. |
| **Deliverables** | Shell markup and CSS, status pill and popover, Settings page, Activity screen with All, By you, Automatic, Undone filters. |
| **Dependencies** | R1 (events drive the pill and Activity). Tree test result from R0. |
| **Effort** | M (about 1 week; can start halfway through R1). |
| **Definition of done** | No unlabelled icon buttons. Header has at most 3 controls. UX §8 task 1 passes in preview. DOM tests updated for the new nav. Measured controls per screen recorded (section 7). |
| **Owner sees and tests** | Switch to dark mode and find Connect Outlook, with no hover and no Rescan. Read "Up to date · checked 2 min ago" in the header. Find the last background run in Activity in plain words ("Sorting moved 12 messages out of your inbox"). |

### R3. Clear decisions and stronger phishing

| | |
|---|---|
| **Goal** | One rule decides where mail goes and whether it is safe to touch. Each decision says why. Fake brand mail is caught more often and Block really blocks. |
| **In scope** | Eng E3: `decide()`, `canAct()`, reason codes, one phrase table for client and server, consumers migrated one by one behind a source-scan test (Eng §2.4). Fixes A3, A10, A11 (U8), A12, A13, A14. Security notices as a protected kind (Audit Q2). Phishing: U1 parser, U4 free-mail split and brand v2, U15 auth-gated categories, U16 security scan sees labelled mail, small link and attachment fixes (Audit C.1). Block = label plus a standing filter (UX §7.2 #6). "It's genuine" and "Don't suggest" persisted and change scoring (UX §7.2 #5). "Why?" line in the UI from `reasons`. |
| **Out of scope** | U3 identity normalisation, U9 scored kinds, U10 languages, U11 learning (R8). U2 Outlook trust (needs Q-C). |
| **Deliverables** | `src/lib/decision/`, exhaustive `canAct` policy test, dual-run diff in tests (Eng §6 migration), Security copy from UX §5.2 #13, #16, #17. Flag `decisionV1`. |
| **Dependencies** | R1. Can run in parallel with R5. |
| **Effort** | M-L (about 2 weeks). |
| **Definition of done** | No module reads `isProtected` or a kind regex directly. Every probe row in Eng §2.2 has the intended result. Every `it.fails` for A3, A7, A8, A11-A15 is now `it`. Dual-run differences are only the intended ones. |
| **Owner sees and tests** | Send yourself "Your one-time payment receipt": it is a receipt, not a code. A "Google Security" mail from a gmail.com address is flagged. Press Block on a fake sender, then check Gmail → Settings → Filters for the new filter. Hover "Why?" on a moved message and read the reason. |

### R4. Sorting screen

| | |
|---|---|
| **Goal** | One screen sets each category's emoji label, its time in your inbox and what happens after. Primary stays your main inbox. |
| **In scope** | Eng E7 Gmail part: one category settings object (settings v14) from v13. UI §3.14 category row: switch, "Stays in inbox for", "Then" (C-3 rules), "In inbox now" count, status pill ("Works with Chrome closed" for labelling, "Moves out only while Chrome is open" for timed moves). Save on change with toast and Undo. "Sort mail already in my inbox…" with inline progress and Stop. Custom rules collapsed. Presets for first use (Calm inbox, Just label things, I'll set it myself) with no Trash. Retire the Organize time-limits section and Sort my inbox. |
| **Out of scope** | Outlook delta. Per-sender future mail (R6). |
| **Deliverables** | Sorting screen, v14 migration with tests (12 → 13 → 14), filter status per category in the store. |
| **Dependencies** | R2 shell. R3 `canAct` for the Trash options. |
| **Effort** | M (about 1 week). |
| **Definition of done** | UX §8 task 2 passes in preview. 11 rows fit at 390 px with no horizontal scroll. One decider per category (the five code deciders in Eng §1.3 C become one setting). Filter sync diff tests pass. Live check of filters in Gmail. |
| **Owner sees and tests** | Set codes to leave after 1 hour and go to Trash after 2 days on one screen. See the confirm for Trash. Answer "does this keep working with Chrome closed?" from the row. |

### R5. Local index and sync (runs in parallel, invisible)

| | |
|---|---|
| **Goal** | Opening Cluster or acting costs almost no Gmail quota. First paint is instant from local data. |
| **In scope** | Eng E4 IndexedDB schema v1 and cache import, E5 sync engine (full `history.list`, resumable newest-first backfill, 404 resync, daily reconcile, Web Lock single syncer, BroadcastChannel fan-out with a port fallback), E6 readers on the index (time limits, triage, rules, screener, quarantine). "Look back over" setting replaces Max messages (Q-B). "Based on 1,240 of 3,200 so far" while indexing. |
| **Out of scope** | Outlook delta (R8, only if Q-C is "yes"). |
| **Deliverables** | `src/lib/index/`, `src/lib/sync/`, flags `indexV1` and `syncV2`, old-path removal in its own commit after the live check. |
| **Dependencies** | E4 starts after R1 (store API fixed). E6 needs R3 and E5. |
| **Effort** | L (about 3 weeks across E4-E6). |
| **Definition of done** | Quota targets in section 7 met in the live ledger. Worker killed mid-backfill resumes. Lost history resyncs for about 300 units. Turning the flag off returns to the old path with no data loss (Eng §6). |
| **Owner sees and tests** | Close and reopen the dashboard: content shows at once with no "Loading". Next morning, the status popover shows about 600 units used, not about 28,000. |

### R6. Senders and the sender sheet

| | |
|---|---|
| **Goal** | Decide once what you want from a sender, in one place. |
| **In scope** | Sync note B3 and UI §5.4: one list, filter chips (New senders, Needs a decision, Newsletters, Never opened, Muted, All), one action per row, bulk bar, side sheet (UI §3.15). Screener switch with preview count (C-5). `setFutureMail` with category labels or 🔇 Muted, no per-sender labels (UX §7.2 #7). Retire Keep sorted, Subscriptions and the Screener screen. |
| **Out of scope** | Clean up and Today layouts. |
| **Dependencies** | R2, R3. Mockup covers this screen already. |
| **Effort** | L (about 2 weeks). |
| **Definition of done** | UX §8 tasks 3 and 5 pass in preview. At most 2 controls per row. Every sender name opens the same sheet. |
| **Owner sees and tests** | Make Groupon stop and trash its old mail, with one confirm. Turn on "Hold mail from new senders" and see how many would be held first. |

### R7. Today, Clean up, Security and Activity, plus first run

| | |
|---|---|
| **Goal** | The rest of the product matches the new shell. A new user gets a first win in under 2 minutes. |
| **In scope** | Today (UI §5.2, ≤ 8 controls), Clean up (UI §5.5, Trash only, one outcome button), Security layout (UI §5.6), Activity grouping (UI §5.7). First-run flow (UX §3.4). Land on Today after a gap over 12 hours (UX §3.2). |
| **Dependencies** | R4, R6. A short mockup round for Clean up, Security and Activity first (they are placeholders in the mockup). |
| **Effort** | M (about 1-2 weeks). |
| **Definition of done** | All 5 UX §8 tasks pass with the owner on real Gmail. Overall pass criteria in section 7. |
| **Owner sees and tests** | The full UX §8 session, about 20 minutes. |

### R8. Later (scheduled after R7, each needs a go-ahead)

U3 identity normalisation, U5-U6 signal rules, U9-U10 scored kinds and languages, evaluation
corpus and metrics (Audit C.4), U11 personal model, U14 signed datasets, Vault (Plan phase 6),
Outlook delta and U2 if Q-C is "yes". The Plan's old phases 3-6 map here and into R3.

---

## 6. Decision on the mockup

**Approved as the base, with the change requests below.** The shell, status pill, toast, row
states, sheet, skeletons and Settings page are approved. UI produces mockup v2 in R0 for the
owner to review before R1 builds anything visible.

| # | Change request | Why |
|---|---|---|
| M1 | Sorting defaults must match the agreed Plan defaults: codes 1 day, shipping 7 days, receipts 7 days, newsletters 3 days, social 2 days, promotions 1 day, shopping 3 days, travel, finance, work and education stay. Today the mockup shows codes 1 hour, receipts "Stays in inbox" and newsletters "Leaves at once". | Plan "Agreed defaults" |
| M2 | Every "Then" defaults to Keep. Remove "Trash after 2 days" on codes and "Trash after 30 days" on Promotions from the defaults. | C-3, owner rule |
| M3 | "Then" select only on codes, Promotions, Newsletters and Social. Others show "Keep" as text. Show the inline Trash confirm when a Trash option is picked. | C-3 |
| M4 | "Leaves at once" only in the Promotions select. | C-10 |
| M5 | Status pill logic: labelling always works with Chrome closed; a timed move needs Chrome open. Today Receipts ("Stays in inbox") shows "Only while Chrome is open" while Travel shows "Works with Chrome closed". Fix the rule and the copy ("Moves out only while Chrome is open"). | UX §4.2 honesty |
| M6 | Row actions neutral, not accent: "Review" on Today, "Unsubscribe" in rows and the bulk bar, "Sort mail already in my inbox…". Keep accent for the current nav item, selected chip, switch on, progress and one primary per screen. | C-4 |
| M7 | Sidebar uses the current build's line icons, not emoji. | C-9 |
| M8 | Trim copy that leans on "·" or "…" where a short sentence works. Keep "·" only in meta lines like "214 messages · 0% opened". Example: "Gmail filter failed · Retry" becomes "Gmail filter failed" plus a Retry button. | Owner copy rule |
| M9 | Show the empty Sorting preset card (UI §5.3) as a mockup state, with no Trash in any preset. | UX Q5 decision |
| M10 | Clean up, Security and Activity get a mockup round before R7 (not needed now). | Process rule |

---

## 7. Risks, mitigations and how we will know it worked

### 7.1 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| E1 touches 13 call sites and many DOM tests that wait on a rescan | High | Medium | `rescan()` stays as a shim that re-renders from the store (Eng §6). Harness gets `await dash.op()`. One call site per commit. |
| The redesign drifts from the liked v3 look | Medium | High | C-4 and C-9 keep purple and line icons. Mockup v2 review before build. Change only what the owner asks for between rounds. |
| Phase 2 drifts while unpushed | Medium | Medium | Fix and live-test in R0. Push on Q-A. |
| Automatic Trash deletes something wanted | Low after R0 | High | Opt-in only, confirm, four categories, `canAct` trash gate, Activity entry with 30-day Undo. |
| Gmail filters stack labels (Keep sorted plus category) | Medium | Low | R6 removes per-sender labels. R3 adds one phrase table and one filter registry (Eng §1.3 D). |
| IndexedDB migration loses or corrupts the cache | Low | Medium | Flag `indexV1`. Old key readable until the cleanup commit. Derived data is rebuilt, never migrated (Eng §3.2). |
| BroadcastChannel does not reach the service worker | Medium | Medium | Verify in Chrome at the start of R5. Fallback is a `runtime.connect` port (Eng §3.4). |
| Background backfill eats quota | Low | Medium | Existing quota ledger paces it. About 5,000 units per 5-minute step in the worker (Eng §3.3). |
| Owner relearns names (Organize, Delete, Recently done are gone) | Medium | Low | Tree test in R0. One-line lead on each screen. Glossary copy everywhere (UX §5.1). |
| Timing tests turn CI red again | Medium | Low | Budgets at least 5× measured, no `it.fails` on time (Eng §5.4). |
| Two category models during R4 | Medium | Medium | v14 migration is numbered and tested. Organize time-limit UI is removed in the same phase. |

### 7.2 How we will know it worked

Measured after each phase and recorded in the PR description.

| Metric | Today | Target | How measured | Phase |
|---|---|---|---|---|
| Gmail quota per action | about 28,000 units plus the action (Eng §3.8) | The action only, ≤ 100 units for `batchModify` or filter work | Quota ledger | R1 |
| Quota per dashboard open, 1 hour later | about 28,000 | ≤ 100 | Quota ledger | R5 |
| Quota per dashboard open, next morning | about 28,000 | ≤ 1,000 | Quota ledger | R5 |
| Quota per 15-minute time-limit run | up to about 8,000 | ≤ 100 | Quota ledger | R5 |
| Action acknowledgement | blank screen, then rescan | ≤ 100 ms | `reactivity.test.ts` plus preview | R1 |
| Local re-render at 10,000 messages | full rescan | ≤ 250 ms | `reactivity.test.ts` | R1 |
| Time to first paint | rescan before content | < 300 ms from local data, no "Loading" page | Preview timing | R5 (R1 keeps last content during scans) |
| Blank-screen moments | every action | 0 | UX §8 session | R1 |
| Controls on the busiest screen | Organize 117 (UI §1.3) | Sorting ≤ 35 (3 per category plus 2); Senders ≤ 2 per row plus chips; Today ≤ 8 | UI's headless control count | R0 (B4 alone), R4, R6, R7 |
| Global controls on every screen | 11 (UI §1.3) | ≤ 3 (status pill, account, Settings) | Same | R2 |
| WCAG 2.2 AA token failures | 4 (UI §1.5) | 0 | Contrast check on tokens | R0 |
| Starred or Important mail moved or trashed by automation | possible (A1, A2, A4) | 0, proved by the exhaustive `canAct` test and a source-scan test | Tests | R0, R3 |
| Suite and CI | red (Eng §2.2) | green on every commit | CI | R0 onward |

**Usability pass criteria (UX §8),** run in preview after R2 for task 1 and after R7 for all five,
then once on the owner's real Gmail:

- 5 of 5 tasks completed, at least 4 without help.
- Median Single Ease Question score at least 6.
- Zero blank-screen moments.
- First click on Settings within 10 s with no hover-hunting (task 1).
- Codes setting done on one screen in ≤ 60 s, and the Chrome-closed question answered from the row (task 2).
- Undo found first try in ≤ 15 s, and automatic actions named by feature (task 4).
- Screener switch found in ≤ 20 s without being told the word (task 5).
- The owner can say in one sentence what each sidebar item is for.

Anything below that goes back to IA, not to styling (UX §8).
