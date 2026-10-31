# Sections UI/UX research, 2026-10-31

How each redesigned section should look and behave. This builds on `research/2026-10-31-sections-research.md`, which covers what to build, and feeds `docs/sections-plan-2026-10-31.md`.

The method: take screenshots of today's screens (preview fixture, 1440 wide), name what isn't working, then borrow a pattern from a real product for each problem.

---

## 0. Patterns that apply everywhere

**Summary card → full page (Apple Health)**
- Apple Health's Summary shows small cards, and tapping one opens a full page with the graph and the detail ([iPhoneLife](https://iphonelife.com/content/tip-day-how-use-dashboard-your-health-app)).
- Apple's WWDC22 charts session ([video](https://developer.apple.com/videos/play/wwdc2022-110342)):
  - Small charts drop grid lines and labels, which signals that detail is one tap away.
  - Big interactive charts carry the detail.
- **Rule for Cluster:**
  - Cards: a number, a bar with no axes, and one button.
  - Pages: the full list, with values on the bars.

**Tile per problem, hidden when empty (1Password Watchtower)**
- A category shows on the dashboard only when it has items. Each tile links to its items, and some lists are grouped by the thing they share, such as reused passwords grouped by password ([1Password support](https://support.1password.com/watchtower/), [Northwestern guide](https://services.northwestern.edu/TDClient/30/Portal/KB/Article/2907/1Password-Use-Watchtower-in-1Password)).
- **Rule:** no tile for zero. Lists group by company or by signal.

**Suggestion cards with a reclaim number (Files by Google)**
- Each card says what you'd get back. Some cards appear only past a threshold (5 low-quality photos, for example). Opening a card lists the items with "All items" or a pick ([Digital Trends](https://www.digitaltrends.com/phones/how-to-use-files-go/), [Google help](https://support.google.com/files/answer/11544776?hl=en)).
- **Rule:** the card's number is how many emails go. The card hides below a small threshold. Its page has "Select all" plus ticks.

**Overall status, then groups, then items (Google Security Checkup)**
- An overall green, yellow or red status with an issue count sits on top. Below it are four groups, with severity icons per item ([TechCrunch](https://techcrunch.com/?p=1555355), [MobileSyrup](https://mobilesyrup.com/2017/10/17/google-is-rolling-out-personalized-security-checkup-guides/)).
- Cluster's design rules allow one muted color, so status is shown with a word and an icon, not three colors. Red stays for real danger.

**Chips under the search box (Gmail search chips)**
- Google added chips because people don't remember operators. They sit under the search field, change with the query, and later gained dropdowns ([9to5Google](https://9to5google.com/2020/02/19/gmail-search-chips/), [Chrome Unboxed](https://chromeunboxed.com/gmail-web-search-filters-update)).
- Details already has chips (+Never opened, +Promotions…). Keep that pattern for search.

**Actions with their key shown (Raycast)**
- The action panel groups actions per selected item and shows each action's shortcut next to it. People learn the keys by seeing them ([Raycast manual](https://manual.raycast.com/action-panel)).
- **Rule:** buttons in Kai answers and menus show their key in a `kbd`.

---

## 1. Clean up

**What works today (screenshot `delete-light`)**
- Two cards, Never opened (111) and Past its date (135), with a top-4 bar list and a Trash button. This is already the Apple Health card. Keep it.

**What doesn't**
- Stop mail is a sidebar sub-item. It belongs here as the third card.
- "Past its date" shows "Newsletters 133". The label doesn't match the heading: newsletters aren't "past a date" to a user.
- "Pick senders" is a text link next to the Trash button. Two actions compete.
- Arrive on time and Move out once sit below as two plain lists, so the page reads as three unrelated things.
- Details takes about a quarter of the width, even when nothing here is selected.

**Presentation**
- **Three equal cards in a row:**
  - You never open these
  - Old codes and deliveries
  - Lists you can leave
- Each card holds:
  - an icon and a heading
  - one big number + "emails"
  - a top-4 bar list with no axes
  - "N more"
  - one button
- The whole card is clickable. Clicking it opens the card's page. "Pick senders" goes away.
- **Card page** (same screen, back arrow + title):
  - The number and an 8-week bar first (the Health detail page).
  - Then every company as a row: logo, name, count, opened %, a tick. Grouped by company, like Watchtower.
  - At the bottom, a "Do this automatically" group of switches: the old presets that fit this card.
  - Clicking a row opens that company's emails in Details.
  - A selection bar shows "Trash 37".
- Details starts minimized on Clean up and opens when a row is clicked.

## 2. Contacts (was Senders)

**Today (`senders-light`)**
- The Lists column (People 0, Companies 10, Subscriptions 25) is good.
- The page opens on People with 0 and shows "No senders match this filter".
- Alex Chen and Mom (100% opened) show up in Details, but not in People. In the fixture, the person rule is too strict or their address isn't free mail. Check this when building.

**Presentation**
- Open on the first list that has rows, and hide lists at 0 (Watchtower).
- Keep the Contacts-style Lists column and the search + sort row.
- **People rows:** avatar initials, name, address, last email, "You reply" when it's true.
- **Companies rows:** logo, name. The row expands to show the people at that company by name.
- **Subscriptions** use the subscription-card style in a grid. Each card has:
  - logo and name
  - "Weekly" (how often they send)
  - "Opened 12%"
  - an Unsubscribe button
- Rocket Money puts cancel behind a "⋯" menu. Our users came here to leave lists, so Unsubscribe stays visible.
- Every row has a "Move to" menu (People, Companies, Subscriptions).

## 3. Organize

**Today (`organize-light`)**
- 11 colored label rows, each with an "Off" select. This is the version you liked. Keep it.
- Subtitles like "91 now · about 13 a week" and "None right now" are the part you dislike.
- "Sort my inbox" is a disabled button with "Nothing to sort".
- Rules show an empty dashed box.

**Presentation**
- **Label row:**
  - Icon, name, and on the right a muted count, like Apple Mail's mailbox counts.
  - Then the select.
  - No subtitle. The weekly rate moves into an (i) popover, following the design rule.
- **Sort my inbox:**
  - Move it to the page header as a secondary button.
  - Hide it when there's nothing to sort, instead of showing it disabled.
  - While sorting, the button shows progress ("Sorting 120 of 400").
- **Rules (Outlook wizard + Gmail filter):**
  - A rule row reads as one sentence, with values as tappable pills: "From **amazon.in** · subject has **order** → **Shopping**." ([IONOS](https://www.ionos.com/digitalguide/e-mail/technical-matters/create-outlook-rules.md)).
  - New rule opens a sheet with three steps in one view, Apple Shortcuts style: "When", "Do", then "Also apply to N emails already here" (Gmail's checkbox). Sources: [Apple Shortcuts guide](https://support.apple.com/guide/shortcuts/apdfbdbd7123/), [Ablebits](https://www.ablebits.com/office-addins-blog/filter-email-gmail/).
  - The sheet previews the matching emails live in Details.
  - The empty state is a single "New rule" row, with no dashed box.
- IFTTT's library idea ([IFTTT](https://ifttt.com/explore/ifttt-vs-apple-shortcuts)): show 3 starter rules built from the user's own mail, e.g. "From Amazon → Shopping".

## 4. Protect

**Today (`impersonation-light`)**
- Sender checks 92% and Warning signs bars at the top.
- Then "Doesn't match" (PayPal, Netflix, Apple), then "High priority" with the same three scams again.
- Two lists of the same mail is the biggest problem on this screen.
- "Scams per week" isn't on this screen. It's on the separate Scam report screen.

**Presentation (Security Checkup + Watchtower)**
- **Top:**
  - One status line with an icon: "3 emails look like a scam" or "Nothing looks wrong".
  - Then two tiles: **Scams per week** (8-week bar, this week's number) and **Warning signs** (top 3 signs with bars).
  - Tiles are clickable and show only when they have data.
- **One list,** "Look at these": one row per email, merging Doesn't match and High priority. Each row has:
  - the logo with a red mark
  - the subject in quotes
  - one plain reason line
  - Block, plus an (i) that shows all reasons
- **Scams per week page:**
  - A big bar chart with tappable weeks (Health detail page).
  - Below it, the held emails of the chosen week, each with its top 3 reasons and Release / Trash.
- **Warning signs page:** rows grouped by sign (Watchtower "grouped by what they share"). Each sign is a header with its count and its emails below.
- **Holding** switches stay at the bottom.

## 5. Settings

The screenshot didn't open Settings: there's no `#menu-settings` id, and it lives in the account menu. Judged from `index.html` instead.

**Presentation (iOS Settings, Apple HIG inset-grouped lists)**
- One scrolling page with grouped rows. Each row has a colored square icon, a title, and a value or control on the right.
- **Search** sits at the top, like Moat's "Search settings". Typing filters to the matching rows.
- **Groups, in this order:**
  1. Account
  2. Mail
  3. Organize
  4. Protect
  5. Kai
  6. Keyboard
  7. Privacy
  8. About
- **Keyboard group** (macOS Keyboard Shortcuts + VS Code), per [Apple support](https://support.apple.com/guide/mac-help/mchlp2864/mac) and [DEV](https://dev.to/ma3574/debug-vs-code-keyboard-shortcuts-34i9):
  - Each row shows the action on the left and the key as `kbd` on the right.
  - Clicking the key turns it into a "Press a key" field. Esc cancels.
  - A clash shows a warning icon on both rows plus one line: "Also used by Go to Home".
  - "Reset to defaults" sits at the bottom of the group.
  - A switch, "Single-key shortcuts", is on by default ([WCAG 2.1.4](https://accessibility.huit.harvard.edu/technique-character-key-shortcuts.md)).
  - `?` anywhere opens the same list as a sheet.

## 6. Home

**Today (`overview-light`)**
- The scam banner with Review.
- Three "This week" tiles (0 cleared, 60 arrived, 9 from people).
- "Next up" rows that repeat Clean up's cards.
- A "Your inbox" stacked bar.
- Each piece is fine, but there are four blocks with no order of importance.

**Presentation (Screen Time weekly report + Health Summary)**
- **Three tiles across**, each clickable to its section:
  1. **Inbox:** unread count, a 7-day bar like Screen Time ([design note](https://desirabilitylab.com/backfill/backfill-2024-41-screen-time-weekly-report)), and "▲ 12 from last week" in plain text.
  2. **Clean up:** "246 can go" and the top card's button.
  3. **Security:** "3 held this week" or "All clear", with Review.
- Below the tiles, keep the "Your inbox" stacked bar. It's the one picture of where the mail comes from.
- Drop "Next up", since the Clean up tile replaces it.
- The scam banner shows only when there's something to review, and then sits above the tiles.

## 7. Kai

**Presentation**
- **Launcher:** a round Kai button in the bottom-right corner, 48 px, above the Details strip. This is the Intercom placement ([HelpCenter.io](https://self.helpcenter.io/content/integrate-the-helpcenter-io-widget-with-the-intercom-messenger/export/pdf)).
- **Panel:** about 360 px wide, anchored to the corner, with one input at the bottom ("Ask Kai").
- **An answer is a card**, Raycast style:
  - a one-sentence answer
  - a primary button, "Take me there ↵"
  - up to 2 other matches, as rows with their key shown
- "Take me there" opens the screen and pulses the target row for 1.5 s.
- **Learning:** no visible UI apart from a "Questions Kai couldn't answer" row in Settings › Kai, with Clear.
- The sidebar "Ask Kai /" field becomes the top search bar (section 8). `/` focuses search and Ctrl+K opens Kai.

## 8. Search and Details

**Today**
- Details is a wide right pane with Emails / Senders tabs, its own search, chips and a long table, open on every screen.
- The sidebar holds "Ask Kai /". There are two search boxes and neither is central.

**Presentation (Moat + Gmail)**
- **One search field** centered in a top bar across the main area, about 560 px wide.
- While typing, a dropdown groups results as Companies, People, Emails, with Gmail-style chips under the field.
- Enter opens the results in Details.
- **Details:**
  - Minimized to its edge strip by default.
  - Opens when something sends it emails: search, a Clean up row, a rule preview, a Protect row.
  - The header says what it's showing ("Groupon · 14 emails") with the action buttons that apply.
  - The Emails / Senders tabs and the chips stay.

---

## Fixes found while looking

These are in the code today, independent of the redesign:
1. Protect lists the same three scams twice (Doesn't match + High priority).
2. Senders opens on an empty People list.
3. Fixture people (Alex Chen, Mom, 100% opened) aren't counted as People. Check the fixture addresses against `isPerson`.
4. Organize's "Sort my inbox" shows disabled when it has nothing to do.
