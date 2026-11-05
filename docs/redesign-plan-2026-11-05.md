# Redesign plan: every section in the Overview style

Date: 2026-11-05. The base is `research/2026-11-05-overview-stripe-mockup.html` (round 13). Every screen gets the same frame, built from the same few parts, so the app reads as one product.

## The frame (same on every screen)

- **Sidebar:** Cluster logo and name, then Overview, Clean up, Stop mail, Organize, Protect, with the Gmail account at the bottom.
- **Top bar:** search in the middle. On the right: Details, Activity (with a dot), Settings, and Kai as the one filled round button. Ctrl+K also opens Kai.
- **Page:** one centered column, 1120 px wide, with 48 px above a 32 px page title. No subtitles.
- **Spacing:** steps of 8 px only. Sections sit 32 px apart and are separated by hairlines, not cards or shadows.
- **Color:** one blue, used for data and the selected nav item. Red only for real danger (scams). Green only for good change badges.

## Shared parts (build once, used everywhere)

| Part | What it is | Used on |
|---|---|---|
| **Widget** | Title + (i) + optional badge, one chart or short list, and the whole widget is a link with a › on hover. No footer buttons. | Overview, Clean up, Protect, Activity |
| **Number row** | Up to 3 numbers side by side, each with a small sparkline. Clicking one filters the table below. | Clean up, Stop mail, Protect |
| **Table** | The Details page table: checkbox, logo + name, muted columns, status pill with a dot, ⋯ menu, 56 px rows, gray header. Filter chips above, "Show: 10" and page numbers below. | Details, Clean up, Stop mail, Protect, Activity |
| **Tabs** | Underline tabs with counts, for switching one table between views. | Stop mail, Protect, Organize |
| **Action bar** | Appears when rows are ticked: "3 selected" and verb buttons (Trash, Unsubscribe). | Details, Clean up, Stop mail |
| **Switch list** | iOS-style grouped switches, for "Do this automatically" settings. | Organize, Protect, Settings |
| **Kai panel** | A 360 px panel on the right, the same slot as Details. Only one of the two is open at a time. | All screens |

## Each section

### Overview (done in the mockup)
Greeting, newest important emails, then 6 widgets. Each widget opens its page.

### Details (done in the mockup)
- Full page from the Details icon, with Emails / Senders tabs.
- On every other section it stays a side pane, as now. On Overview it opens as this full page instead.

### Clean up
- **Number row:** Never opened, Old codes and news, Lists you can leave. Each has a count and an 8-week sparkline.
- **Table:** every sender that can go. Columns: sender, emails, last email, opened, a "Why" pill (Never opened / Old / List), and a ⋯ menu.
  - Clicking a number filters the table.
  - Ticking rows shows the action bar with Trash.
- **Below the table:** a "Do this automatically" switch list holds the old presets.
- **Replaces:** the three cards of different heights that looked glitchy.

### Stop mail
- **Tabs:** All, Still sending, Stopped. The one filled button on the right is "Unsubscribe from 22".
- **Table:**
  - **Columns:** sender, how often it sends (Weekly), opened, a sparkline of mail per week, a status pill (Subscribed / Unsubscribed / Muted), and an action column of fixed width.
  - **Actions:** the action column holds Unsubscribe or Mute.
- **Paid subscriptions:** a short list under the table, with logo, name and "Renews Nov 12".
- **Mockup:** this is the approved-pending layout in `research/2026-11-05-cleanup-stop-mockup.html`. It moves into the new frame.

### Organize
- **Widgets:** two at the top.
  - "Inbox by category" uses the donut from Overview.
  - "Automatically filed" uses the line chart.
- **Labels:** one table with color dot, label, emails, this week, and "Keep in inbox" as a select.
- **Rules tab:** each rule as one sentence. Kai replaces the + button, so "New rule" becomes a normal button at the top right of this page.
- **Below:** the "Keep in inbox" window as a switch list.

### Protect
- **Top:** a status line: "3 emails look like a scam" or "Nothing looks wrong".
- **Number row:** Held this week, Warning signs, Blocked senders.
- **Tabs:** Suspicious, Held, Blocked.
- **Table:**
  - **Columns:** logo with a red mark, subject, "Pretends to be Netflix", a risk pill (High / Medium), and Release / Trash.
  - **(i) column:** opens the reasons.
- **Below:** the holding switches as a switch list.
- **Charts:** the 8-week scams chart becomes a widget above the table, shown only when there is data.

### Activity (top-bar bell)
- **Layout:** a full page with one table, grouped by day.
- **Columns:** time, action ("Moved 12 emails to Promotions"), from which rule, and Undo while it can still be undone.
- **Widget:** one "Automatically filed" widget on top, the same chart as Overview.

### Settings (top-bar gear)
- **Layout:** the current iOS-style grouped list. It gains the frame: centered column, 32 px title and search on top.
- **Groups:** unchanged (Account, Mail, Organize, Protect, Kai, Keyboard, Privacy, About).

### Kai
- **Button:** a filled round button with Kai's face, at the top right of every screen.
- **Panel:** opens Kai's panel on the right. If Details is open, Kai takes its slot; closing Kai brings Details back.
- **Rules:** no floating bubble anywhere. Details: `research/2026-11-05-kai-placement.md`.

## Build order

1. **Frame and shared parts:** sidebar, top bar with the Kai button, widget, table, tabs, action bar. Nothing else can be built without these.
2. **Overview and Details:** already designed, so they prove the parts.
3. **Clean up and Stop mail:** the screens that look worst today.
4. **Protect.**
5. **Organize.**
6. **Activity and Settings:** mostly the frame, little new.
7. **Kai panel.**

Each step:
- gets a mockup in this style first;
- is built after you approve it;
- passes the existing tests plus a screenshot check in light and dark;
- stays inside the JS and CSS budgets.

## Open questions

1. With the + gone, is "New rule" only on Organize? It could also go in Kai ("Make a rule").
2. Should Activity stay behind the bell, or get a sidebar item?
3. Clean up and Stop mail: keep them as two sidebar items, or one page with two tabs?
