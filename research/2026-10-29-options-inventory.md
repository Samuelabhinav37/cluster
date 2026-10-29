# Options in each place, and what's wrong with them (2026-10-29)

Measured from the dashboard after the test fixture scan (same harness as `wordBudget.dom.test.ts`),
counting every button, switch, field and menu a person can reach, including inside collapsed
sections. Row menus (⋯) come from `dashboard.ts` and `securityTab.ts`.

## Inventory

| Place | Visible controls | Behind "More…" | What's there |
|---|---|---|---|
| Home | 11 | 0 | Details, setup Start / Not now, All mail, 4 kind buttons, 3 place links |
| Clean up | 14 | ~20 | Trash per row + ⋯; More ways: Keep newest N (Trim), By domain (Select safe, Delete selected, Delete domain per domain, grouped by category) |
| Stop mail | 7 | 0 | Unsubscribe all verified one-click, status filter (6 states), select all, per row Unsubscribe + ⋯, Unsubscribe all again at the bottom |
| Organize | 30 | ~30 | Sort now: 8 unnamed switches + Sort my inbox + More options (2 switches). Archive after a while: 7 switches. Arrive on time: 2. Your rules: New rule sheet (sentence box, 3 examples, Draft locally, Save reviewed draft, 14-field manual form). Custom times: 1 switch + 11 time pickers + Save. More tools (empty) |
| Protect | 6 to 8 per tab | 1 | 3 tiles that switch between 3 screens; Scams: Block, Why, ⋯ (Block, It's fine, Report, Deep scan), 4 charts, 3 unnamed Holding switches. New senders: 2 unnamed switches. Held so far: a table toggle |
| Senders | 18 | 0 | 8 lists, search, sort, select box; card: Unsubscribe, File away, Mute, Show emails, This is a person |
| Settings | 13 | 1 | Change name, days + Rescan, Add Outlook, Sign out, 2 notice switches, Safety net Open, theme + 2 switches, Export, Erase, Advanced: Delete forever |
| Row ⋯ menus | | | Unsubscribe, Mute, File away, Show emails, Trash their mail, Snooze (1 day/week/month), Not useful, New rule… |

## Problem types

### 1. One action, many places
The same verb on one sender lives in up to four places, each with its own button.

- **Unsubscribe**: Stop mail row, Stop mail "all" (twice), Senders card, ⋯ menu.
- **Mute**: Senders card, ⋯ menu, Home's never-opened card, Clean up's old Never opened row.
- **Trash a sender's mail**: Clean up row, ⋯ "Trash their mail", By domain "Delete domain", Keep newest "Trim".
- **Block**: Protect row and Protect ⋯ (twice on the same row).

### 2. Several systems for one job inside a place
- **Organize has four ways to move mail out of the inbox**: Sort now (8 switches), Archive
  after a while (7 switches), Custom times (11 pickers), and Rules (sentence or a 14-field form).
  They overlap. Newsletters can be set in Sort now, Archive after a while, Arrive on time and
  Custom times.
- **Clean up has three ways to delete**: Most mail first, Keep newest N, By domain. By domain
  groups by category inside a collapsed section inside another collapsed section.
- **Protect is three screens** behind tiles that look like stats, not tabs.

### 3. Option in the wrong place
- Senders card carries five actions that belong to Stop mail (Unsubscribe), Clean up (Trash)
  and Organize (File away), so Senders isn't only "decide where a sender goes".
- "Delete forever" is in Settings > Advanced but changes what every Trash button does.
- Safety net (undo log) is in Settings; Activity is in the account menu. Two homes for history.
- Setup (Start / Not now) is on Home instead of a first-run sheet.
- Snooze, Not useful and New rule… show up in row menus of places that are not about them.

### 4. Controls you can't read
- 13 switches with no visible name (8 in Sort now, 3 in Holding, 2 in New senders).
- Jargon: "verified one-click", status states "didn't reach them" / "needs your click",
  "Draft rule locally", "Save reviewed draft", "File away", "Select safe", rule "priority",
  "max per run", "stop later rules".

### 5. Too deep
Nested collapsed sections: Clean up > More ways > By domain > Finance. Organize has four
collapsed sections; "More tools" opens to nothing.

### 6. Big actions with one tap
"Unsubscribe all" appears twice on Stop mail. "Delete selected domains…" sits next to "Select
safe". Both act on many senders at once.

## Counts

Organize alone has about 60 reachable controls; the next biggest is Clean up at about 34.
Problem types 1 and 2 account for most of the clutter: fixing them (one home per action, one
system per job) removes the duplicates before any visual change.
