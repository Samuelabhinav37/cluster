# Section redesign plan, 2026-10-31

Built from `research/2026-10-31-sections-research.md`.
One section at a time:
1. A true-size mockup in `research/`.
2. You approve it.
3. I build it on `feat/sections-2026-11`, then check tsc, tests, build and screenshots.

Nothing gets pushed until you say so.
Questions for you are marked **Q**.

## 1. Clean up
- Three cards, each with a number, a top-5 bar and one action:
  - **"You never open these"** (was Never opened). Action: Trash.
  - **"Old codes and deliveries"** (was Past its date). Action: Trash.
  - **"Lists you can leave"** (was the Stop mail sub-page). Action: Unsubscribe.
- Clicking a card opens its own page with every company. Clicking a company opens its emails in Details.
- The presets fold into the matching card's page as "Do this automatically" switches:
  - Saturday newsletters and No reply in 3 days go under Lists.
  - Keep newest 3 and Delivered go under Old codes.
  - Never-opened → Read later goes under Never open.
- The confirm step shows the exact count after re-checking that nothing is starred, important or replied.
- **Q1:** Are the three headings right?

## 2. Senders → Contacts
- Rename the screen to **Contacts**, with three tabs: People, Companies, Subscriptions.
- **People** means mail from a free-mail or school address that isn't a role address (no-reply@, support@ and so on).
  - The free-mail list grows from 16 to about 60 domains.
  - A person at a company domain stays inside that company's row, shown by name.
- **Subscriptions** use the paid-subscription card style from Stop mail: logo, how often they send, how much you open, Unsubscribe.
- Every row can be moved to another tab, and the move sticks.
- **Q2:** "Contacts" or "People"?

## 3. Organize
- The label list stays.
- Counts sit right-aligned in muted text, like Apple Mail.
- The status lines become one line.
- Sort my inbox becomes a header button with progress shown inline.
- **Custom rules** read as one sentence with tap-to-fill values, for example: "When mail is from **amazon.in** and the subject has **order**, label it **Shopping**."
  - Each rule is saved as a Gmail filter, so it works with the browser closed.
  - No rule order and no exceptions, since Gmail has neither.

## 4. Protect
- Tapping **Scams per week** opens an 8-week chart with the held emails below it. Each email shows its top 3 reasons, plus Release and Trash.
- Tapping **Warning signs** opens a page grouped by sign, each with a count and its emails.
- Pipeline:
  - Add a "name matches someone you know, address is new" signal.
  - Add "first contact" as a supporting signal only.
  - Measure both against the current tests before turning them on.

## 5. Settings
- One page like iOS: groups of icon rows, with search on top. The groups are Account, Mail, Organize, Protect, Kai, Keyboard, Privacy and About.
- **Keyboard:**
  - Every shortcut has a Change button that waits for a key and warns on a clash.
  - Reset to defaults.
  - A switch turns off single-key shortcuts, which the accessibility rules require.
  - Defaults follow Gmail: `/`, `g` then a letter, and `?` for the full list.

## 6. Home
- Three tiles of real numbers, with no made-up score:
  - **Inbox:** unread, the change this week, an 8-week bar.
  - **Clean up:** what you can clear, plus one action.
  - **Security:** held this week, plus warnings.

## 7. Kai
- Kai sits in the bottom-right corner and opens a small panel with one input.
- Each answer comes with "Take me there", which opens the screen and highlights the row.
- Kai learns on this computer only: the answers people pick rank first next time. Unanswered questions go in a local list you can clear.
- `/` and Ctrl+K open the same panel.

## 8. Details and search
- A search bar sits centered at the top, like Moat. It searches senders, companies and subjects as you type, and Enter shows the results in Details.
- Details becomes the "see before you act" pane: every card and company opens the exact emails an action would touch.

## Order
Clean up, Contacts, Organize, Protect, Settings, Home, Kai, Details.

Search (part of 8) could move first, because every other section uses Details.
- **Q3:** Keep the order, or build search first?
