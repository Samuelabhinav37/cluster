# Section redesign plan, v2 (2026-10-31)

**Sources**
- `research/2026-10-31-sections-research.md`: what to build
- `research/2026-10-31-sections-uiux.md`: how it looks
- `research/2026-10-31-algorithms-gmail.md`: how the numbers are computed and which Gmail functions do the work

**Branch:** `feat/sections-2026-11`. The removals R1–R11 are already done there.

**How each step runs**
1. A true-size mockup in `research/`, light and dark.
2. You approve it.
3. I build it, one commit per sub-step.
4. Checks: `tsc`, the full `vitest` suite, `npm run build` within budgets, then screenshots in the preview.
5. Live Gmail checks wherever filters or labels change.

Nothing is pushed until you say so.

**Design rules that hold throughout:** one muted color (red only for real danger), bare numbers, buttons that say only the verb, no page subtitles, (i) popovers for explanations, no dashes in copy.

---

## Step 0: Shared pieces (built first, because every section uses them)

| | What | Algorithm / Gmail |
|---|---|---|
| 0.1 | **Card → page shell.** A card opens a page on the same screen, with a back arrow, the title, a big number with an 8-week bar, and a list with ticks and a selection bar. | none |
| 0.2 | **Details as the target.** Any list row can send emails to Details. Details stays minimized until then, and its header says what it shows ("Groupon · 14 emails") with the actions that apply. | none |
| 0.3 | **Top search bar.** One field centered at the top. It replaces the sidebar "Ask Kai /" box and Details' own search box. Results are grouped as Companies, People, Emails. The last row is "Search all of Gmail". Gmail-style chips sit under it. | Prefix match over the local index. `messages.list?q=` for anything older. |
| 0.4 | **Open in Gmail** on every email row. | `#search/rfc822msgid:<Message-ID>` |
| 0.5 | **Refresh before acting.** Every bulk action first catches up with Gmail, then removes anything protected. | `history.list` (2 units), then `filterOutProtected` |
| 0.6 | **Fixes found in the screenshots:** Protect shows the same scams twice; Contacts opens on an empty list; the test-data people aren't counted as People; Sort my inbox shows disabled. | |

## Step 1: Clean up

**UI:** three equal cards in a row. Each has a number, a top-4 bar list, one button, and the whole card can be clicked.

| Card | Counts | Button |
|---|---|---|
| **You never open these** | emails | Trash |
| **Old codes and news** | emails | Trash |
| **Lists you can leave** | lists | Unsubscribe |

- "Pick senders" and the Stop mail sidebar item go away.
- **Card page:** the number, an 8-week bar, and every company with a tick. Clicking a row sends its emails to Details.
- At the bottom of each page, a "Do this automatically" group of switches holds the old presets:
  - Never open → Read later goes on "never open".
  - Keep newest 3 goes on "old".
  - Saturday newsletters and No reply in 3 days go on "lists".

**Algorithm**
- Every email belongs to at most one card, so the three numbers add up and nothing is counted twice.
- Cards are sorted by the existing learned acceptance ranking.

**Gmail**
- Switches that act when mail arrives become Gmail filters, so they work with Chrome closed.
- Switches that act on age run in the 5-minute background job, and their row says so with an (i).

**Tests**
- No email appears in two cards.
- The totals equal what each card's page lists.
- Protected mail never shows.

**Q1:** Are the headings right? "Old codes and deliveries" changed to **"Old codes and news"** because delivery emails are never suggested; their return window can run long.

## Step 2: Contacts (was Senders)

**UI**
- Keep the Lists column. It opens on the first list that has anyone in it, and empty lists are hidden.
- **People:** initials, name, address, last email, "You reply" when true.
- **Companies:** logo and name. The row expands to show the people there by name.
- **Subscriptions:** a grid of cards. Each has a logo, a name, how often it sends ("Weekly"), how much you open ("Opened 12%"), a "You pay" tag when there are receipts, and an Unsubscribe button.
- Every row has a "Move to" menu, and the move sticks.

**Algorithm**
- The free-mail list grows to about 60 domains, plus school domains.
- Role addresses (no-reply, support, info and so on) are never People.
- How often it sends comes from the median gap between emails: Daily, Weekly, Monthly, or Now and then.
- "You pay" means the same company sends receipts.

**Tests**
- A domain table covering free mail, school and company domains.
- Role addresses never count as People.
- Frequency buckets.
- The test-data people land in People.

**Q2:** "Contacts" or "People" as the screen name? The keyboard shortcut stays `g s`.

## Step 3: Organize

**UI**
- The label list stays as it is today, with its colors and selects.
- The subtitle goes. A muted count sits on the right, and the weekly rate moves to an (i).
- Sort my inbox becomes a header button, hidden when there's nothing to sort, showing progress while it runs.

**Rules**
- Each rule reads as one sentence with tap-to-fill pills.
- The "New rule" sheet has three parts: When (from, to, subject has, words, not, has attachment), Do (label, skip inbox, mark read, star, trash), and "Also apply to N emails already here".
- It previews the matching emails live in Details.
- 3 starter rules are built from your own top senders.

**Algorithm and Gmail**
- Label counts come from Gmail's own label counts, so they match Gmail exactly.
- Each rule is saved as one Gmail filter. Editing a rule replaces its filter.
- The preview uses the same Gmail search, so what you see is exactly what the rule catches.
- Gmail has no rule order and no exceptions, so neither does Cluster. A "not" field covers most exceptions.
- Rules are capped at 100.

**Tests**
- Each rule turns into the right Gmail filter.
- Editing replaces the filter, deleting removes it.
- A live Gmail check: create a test rule, see the filter in Gmail, then delete it.

## Step 4: Protect

**UI**
- A status line at the top with an icon: "3 emails look like a scam" or "Nothing looks wrong".
- Two clickable tiles, shown only when they have data:
  - **Scams per week** opens an 8-week chart. Pick a week to see its held emails, each with its top 3 reasons and Release / Trash.
  - **Warning signs** opens a page grouped by sign, each with a count and its emails.
- **One list, "Look at these":** each row has a logo with a red mark, the subject, one plain reason, Block, and an (i) for all reasons.
- Holding switches stay at the bottom.

**Algorithm: two new signals**
- **Name matches someone you write to, but the address is new.** It can count toward holding a message.
- **First contact.** Supporting only; it can never hold anything alone.

Both are measured on test cases before they're turned on. They must add no holds on real people or certified companies.

**Gmail:** "Send held mail to Spam" stays. It also teaches Gmail's spam filter.

## Step 5: Settings

**UI**
- One page like iPhone Settings, with search on top.
- Groups in this order: Account, Mail, Organize, Protect, Kai, Keyboard, Privacy, About.

**Keyboard**
- Click a key and press a new one. Esc cancels.
- A clash marks both rows with a warning.
- Reset to defaults.
- A "Single-key shortcuts" switch, which the accessibility rule requires.
- `?` anywhere shows the full list.

**Defaults**

| Key | Does |
|---|---|
| `/` | search |
| Ctrl+K | Kai |
| `g` then h / s / c / o / p | go to a section |
| `?` | list all shortcuts |
| Esc | close |

**Tests:** recording a key, finding clashes, the switch, reset.

## Step 6: Home

**UI**
- Three clickable tiles:
  - **Inbox:** unread count, a 7-day bar, and the change from last week.
  - **Clean up:** how many can go, plus the top card's button.
  - **Security:** held this week, or "All clear".
- The "Your inbox" stacked bar stays below the tiles.
- "Next up" goes.
- The scam banner shows only when there is something to review.

**Algorithm**
- Inbox unread comes from Gmail's own inbox count. One snapshot a day is kept on this computer for the trend.
- The Clean up tile uses the same function as Step 1, so the numbers always match.

## Step 7: Kai

**UI**
- A round Kai button in the bottom-right corner opens a small panel with one input.
- An answer is a card: one sentence, a **Take me there ↵** button, and up to 2 other matches.
- Take me there opens the screen and pulses the target row.

**Algorithm**
- Search-style word matching (BM25) over 5 to 10 example phrasings per answer, with synonyms.
- **Learning on this computer:** words from your questions are linked to the answers you picked, and that link ranks those answers higher next time. The counts halve every 60 days.
- Questions Kai couldn't answer are kept locally (up to 50). You can see and clear them in Settings › Kai.
- Nothing is sent anywhere, and there is no cloud model.

**Tests:** 40 typed questions with expected answers, at least 90% top-1. The learning test checks that a picked answer ranks first next time.

---

## Order and size

| Step | Size | Depends on |
|---|---|---|
| 0 Shared | M | none |
| 1 Clean up | M | 0 |
| 2 Contacts | M | 0 |
| 3 Organize | L (rules) | 0 |
| 4 Protect | M | 0 |
| 5 Settings | M | none |
| 6 Home | S | 1, 4 |
| 7 Kai | M | 0.3 |

Steps 0 and 1 share one mockup, since Clean up is the first screen to use the new pieces. Each later step gets its own mockup.

**Q3:** OK to start with Step 0 + Clean up together?

## Things to know
- **Time rules need Chrome open.** Filters can only act when mail arrives, so any rule based on age runs in Cluster's background job. The UI says this in an (i).
- **Quota:** plan for 6,000 units per user per minute, the lower of Google's two published figures. Every action above stays well under it.
- **"Opened" is approximate.** "Mark all as read" makes everything look opened. Cluster then suggests less, never more.
- **JS budget is 615 KB and tight.** New code replaces old code where it can, such as Details' own search and the Stop mail page.
