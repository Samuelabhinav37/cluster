# One look everywhere: buttons, menus, lists, charts

Asked 2026-10-28 after the user walked the preview: buttons are bulky and mixed (some big,
some old pills), ⋯ does nothing useful, Home tiles repeat numbers, Senders rows are noisy,
Organize and Rules overlap, Protect wastes space and uses blank icons, Settings is old style,
Kai should sit bottom right with a gap. Builds on `2026-10-27-icloud-patterns.md`,
`2026-10-27-protect-grouping.md` and `2026-10-27-icons-charts-character.md`.

## What the preview shows today (big fake mailbox, 1920 px wide)

- 40 CSS rules start with `.btn`, `.chip` or `.pill`. In use: `btn` (31), `btn-accent` (8),
  `btn-danger` (4), `btn-accent-solid` (4), `btn-ghost` (3), `btn-sm` (2), plus outlined pills in
  Stop mail ("Unsubscribe + clean…", "Read later…"), the Rules chips, Smart views chips and the
  Clean up options strip (bordered "Unsubscribe (verified one-click)", "Keep sorted", "Mute",
  a native week `<select>`, "Snooze").
- ⋯ in Clean up toggles that strip. ⋯ in Protect expands the reasons. Same icon, two jobs,
  and neither is a menu.
- Home: every tile has a subtitle under the title ("+103 this week", "Needs a look", "17 emails
  to clear", "Time limits off"). Clean up says 17 in the subtitle, then 16 and 1 again in rows.
  Protect shows a big red "3" with "look like scams" under it.
- Senders rows: name, "3 a month · address", then "8 msg" over a bar, then a text action
  (Unsubscribe, Mute or Show addresses), so three different right edges.
- Organize: presets (switches), "Make your own" (a 12-row grid of time `<select>`s for the same
  kinds), Sort my inbox (below, with its own kind-to-label list), Smart views (search chips),
  More tools. Rules (separate screen): a sentence box, example pills, a 14-field manual form.
  Protect has a third "Rules" heading for its switches.

## What the references do

**Apple HIG, Buttons** ([source](https://developer.apple.com/design/human-interface-guidelines/buttons)):
"Keep the number of prominent buttons to one or two per view." "Use style, not size, to
visually distinguish the preferred choice." Destructive actions use red and never the primary
role. Hit region at least 44x44 pt (the visible button can be smaller).

**Apple HIG, Pull-down buttons** ([source](https://developer.apple.com/design/human-interface-guidelines/pull-down-buttons)):
a More (⋯) button holds items "that don't need prominent positions"; don't hide a view's
primary actions in it; list at least three items or use plain buttons instead; destructive
items are red and confirmed.

**Apple HIG, Lists and tables** ([source](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)):
keep row text short and move the rest to a detail view; a disclosure chevron drills in, an info
button shows details.

**Apple HIG, Charts** ([source](https://developer.apple.com/design/human-interface-guidelines/charts)):
a chart highlights "a few key pieces of information"; bars compare categories and sums over
time, starting at zero.

**Gmail, Manage subscriptions** ([source](https://support.google.com/mail/answer/15621070?hl=en)):
one row per sender, the recent email count beside a single Unsubscribe button; tapping the
sender shows their mail. Nothing else in the row.

**Apple Passwords, Security** (earlier note; [Apple guide](https://support.apple.com/guide/iphone/change-weak-or-compromised-passwords-iphd5d8daf4f/ios)):
problems split into High Priority and the rest; each row shows the site's own icon, so
you know the account at a glance.

**Google Security Checkup** (earlier note): a status icon per area (green check, yellow or red
mark), issues first, healthy areas collapse to one line.

**Apple Mail and Gmail, sorting vs rules** (earlier note `2026-10-27-organizing-rules.md`):
both keep automatic categories separate from user rules, but each keeps *all* rules in one list.
Neither has two editors for the same thing.

## What this means for Cluster

1. **Three button styles, one size per context.** Filled accent (one per view), gray (row
   actions), plain text (cancel, see all). Red text only for Trash, Block, Delete. Row buttons
   28 px tall, page buttons 32 px. No outlines, no pills, no "…" in labels.
2. **⋯ becomes a real menu** with three or more related items, and only where there are three.
   Clean up row: Keep sorted, Mute, Snooze ▸ (1 day, 1 week, 1 month), Show emails, Not useful.
   Protect row: It's fine, Report, Deep scan, Block sender (red). Reasons open with a chevron.
3. **Home is a glance.** Icon and title, one number, one visual, no subtitles, no row buttons.
   The tile opens its place. Protect shows the brands being faked as small logos.
4. **Senders like Contacts plus Gmail's list.** Row: logo, name, one gray line, count on the
   right. No button in the row. Selecting a row fills a detail card with the actions.
5. **Organize is one list of automations.** Sort now first (one-time), then Automations: presets
   and your own rules in the same list with switches, and "New rule" opens one sheet (sentence
   box on top, the fields below). Rules leaves the sidebar. Smart views become Details chips.
   Protect's switches are renamed "Holding".
6. **Protect uses the width.** Number on the right of each tile, brand logo with a red badge on
   High priority rows, a bento grid for the numbers (held per week bars, faked brands ranked,
   checkup with status icons).
7. **Settings** as grouped lists only, with new groups to choose from (below).
8. **Kai** fixed bottom right, 24 px from the edges, and 24 px left of Details when it is open.

Mockup: `research/2026-10-28-ui-consistency-mockup.html`.
