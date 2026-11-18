# UI glitch plan (2026-11-18)

From the user's five live-test screenshots, then a walk through every screen in
the preview (Overview, Cleanup, Labels, Security, Screener, Settings, the top
bar menus). Each item says what's wrong, why, and the fix. Build order is the
step order.

## Step 1. No more black screen on open

**Seen:** the dashboard shows only "Good evening, Samuel!" for 5 to 10 seconds.

**Why:** `scanAndRender` (dashboard.ts) waits for Gmail's changes
(`CHANGES_WAIT_MS = 4000`, longer on a quick read), then reads the whole mail
index, the census, sent mail and the sender ledger, writes settings, and only
then draws Overview. The "Getting your mailbox ready" card is hidden on
Overview on purpose (`#index-status.home-shows`), so nothing says it's working.

**How others do it:** stale-while-revalidate. Draw from data you already have,
fetch fresh data behind it, update in place. Skeletons only when nothing is
saved yet; later refreshes get a small "updating" sign. No sign at all if fresh
data lands within about a second. Linear feels instant because it reads a
local copy first; Cluster already has one (the mail index), it just waits for
Gmail before using it.

**Fix:**
1. Every visit after the first: draw Overview from the mail index right away,
   then fetch Gmail's changes. A small "Updating…" next to the date range;
   numbers update in place; it turns to "Updated just now" and fades. If Gmail
   is slow or offline, the old numbers stay and it says "Last updated 5 min ago".
2. First visit (no index yet): the first-read screen below, instead of grey
   outlines.
3. Same for Cleanup, Labels, Security and the Screener: draw from the index
   first, never blank.
4. Under one second: no indicator, so nothing flickers.

**Check:** reload timing in the preview (today 650 ms to the greeting, the rest
only after the sync); Overview must have numbers on the first frame after a
reload. numbersAgree test still passes after the in-place update.

### Step 1b. The first read, shown like a file copy

**Asked:** show that Cluster is reading the inbox, what it's reading and how,
like the Windows and Mac copy windows, with an animation like sui.io.

**References:**
- sui.io: a black page, light streaks rushing out of the centre, and a small
  "100%" counter at the edge while it loads.
- Windows copy window: "Copying 8,302 items", percent, a speed graph, the
  current file name, time and items left.
- Mac Finder copy: one bar, "1,240 of 8,302", "about 2 minutes".

**Design** (full screen, first read only):
1. A big percent counter, as on sui.io.
2. "Reading your mail" with one bar and "1,240 of 8,302 emails · about 2
   minutes left". The time comes from the real reading rate and updates every
   few seconds.
3. "Now reading" with the sender's logo and name and the month, for example
   "Amazon · March 2024". It changes as it goes, like the current file name.
4. A small emails-per-second line, like the Windows speed graph.
5. Each label fills as mail lands in it (Finance 12, Orders & shipping 40,
   Newsletters 74 …), like folders filling.
6. The animation: thin streaks moving into the centre, in the one muted
   colour, calmer than sui.io (flashy glow and pings were rejected before).
   It stops under `prefers-reduced-motion`.
7. Kai says one line about what's happening, since Kai explains during setup.
8. When it ends, the screen fades into Overview with real numbers.

The data is already there: the read reports done and total
(`updateIndexStatus`). Rate, sender and month come from each batch as it
lands. Nothing leaves the computer.

## Step 2. Rebuild the Screener in the house style

**Seen:** old card rows, the email address as the row title, a long grey
sub-line, a blue "Block" link next to a filled "Let in" button, an old blue info
banner, and "Waiting" smaller than the row text.

Also found:
- **The switch shows the wrong setting.** "Hold mail from new senders" reads
  `settings.screenerEnabled` (the retired Screener), but holding is really
  `autoSort.holdUnsorted`. So it shows Off while 309 emails are held, the page
  says "Holding is off, so new senders go straight to your inbox", and "Hold
  people too" is On under an Off parent.
- **"N senders you already get mail from" isn't true.** The group is "a mailing
  list, or first wrote over two weeks ago" (`isFamiliar`), not senders you
  already get mail from.

**Fix:**
1. The switch reads and writes `autoSort.holdUnsorted`. "Hold people too" is
   disabled while the main switch is off. The empty-state line follows the real
   setting.
2. Waiting list becomes the same table as Cleanup and Security: Sender (logo,
   name, address under it), Emails, First email, Label, then Let in and Block.
   Block uses the same red text button as Security's Block.
3. The group row says what it is: "N mailing lists and older senders", with Let
   in all.
4. "Waiting" and "People you let in by hand" use the card title style every
   other card uses.
5. The backlog banner ("Sort the held mail") uses the plain banner style, no
   blue info icon.

## Step 3. Rows that break when they have no icon

**Seen:** "Fixes this week" wraps one word per line (Labels). Same bug, found
in Settings: "Scam lists" sits in the middle of its row.

**Why:** `.ios-row` / `.set-row` grids assume icon | text | control. A row with
fewer parts drops its text into the 30 px icon column (Fixes) or into the
second of two equal columns (Scam lists, `.settings-list .set-row`). The row
grid is defined four times in dashboard.css (lines ~3076, 3187, 3189, 3513,
3594, 4237), each patching the last.

**Fix:** one row grid rule that sizes columns by what the row holds, and delete
the overrides. "Fixes this week · 0 per 100" means nothing to most people:
hide it until a fix has happened this week.

## Step 4. Page subtitles off

**Seen:** Cleanup, Labels and Security have a grey sentence under the title
(`p.page-sub`, index.html 244, 315, 339, 356). The design rules say no page
subtitles; Overview, the Screener and Settings already have none. Remove them.
The (i) popover carries any explanation still needed.

## Step 5. One menu and popover style

**Seen:** the account menu (glass, 15 px rows), the Sort and Download menus
(solid, bordered, 14 px rows) and the status popover ("✓ Up to date", the tick
typed as text) look like three different apps.

**Fix:** one menu surface (background, border, radius, shadow, 14 px rows, the
same hover) for account, Sort, Download and the status popover. The status uses
the Step 1 "Updating… / Updated just now" words and a real icon, not "✓ ".
Settings' "Sign out" stays (it's the Account section); the account menu keeps
it too.

## Step 6. One type ladder

**Seen:** section headings smaller than the text under them, and sizes that
differ page to page.

**Why:** `.page-title` and `.section-label` are each defined two or three times
(dashboard.css ~532/1586, ~548/1596/2963/3539), and the file has 21 font sizes
and 83 hex colours, many in the "Legacy / utility surfaces" block.

**Fix:** one ladder, Apple-style: page title, card title, row title (15 px),
secondary (13 px), caption (12 px). Card and section headings are never
smaller than row text. Delete the duplicate definitions, then the Legacy rules
nothing uses (measure with a used-selector scan before deleting).

## Check for every step

- Screenshot each screen in the preview before and after, light and dark.
- `npm run typecheck`, lint and the full test suite (word budget, numbersAgree,
  Screener tests).
- Bundle budgets (CSS 180 KB) still pass; Step 6 should lower CSS size.
