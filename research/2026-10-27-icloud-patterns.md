# iCloud.com patterns for Cluster (2026-10-27)

Looked at iCloud.com in the user's own signed-in browser (layout only). What makes it easy, and where Cluster uses it.

| iCloud | What it does | Cluster |
|---|---|---|
| Home bento | One- and two-unit tiles. Each has a tinted header strip: 36px colored app icon, 21px/600 name, 14px line with a tiny glyph. Body is a picture of the data or one big icon plus one line. `⋯` bottom left, action top right. | Home: Inbox (wide), Protect, Clean up (wide), Organize |
| Storage page | Big pill number, one line ("Free 5 GB • Used 23 MB"), one colored bar, then rows: app icon, name, count, size, color dot matching the bar | Inbox tile: number, kind bar, legend |
| App menu | Grid of big colored icons, then short icon + text links | Colored squircle icons per place, in the sidebar and on page titles |
| Drive "Recents" | Icon + title, then a quiet count line ("50 items, 71.26 GB available"); groups by month with a count | Page titles wear the place's app icon; one-line lead |
| Photos | Sidebar sections (Photos / Collections / Sharing) with small blue line icons; Recently Deleted lives in the sidebar; toolbar actions are icons that stay dim until something is selected; quiet total at the bottom | Senders "Lists" column with blue line icons |
| Contacts | Three panes: Lists, a searchable A–Z list, the detail (big avatar, round blue icon actions) | Senders: Lists column + search and list; Details is the detail pane |
| Reminders | List title in the list's color, round tick circles, short second line in color | Organize presets: one colored icon each, short name, one rule line |
| Mail | Notice card: icon, bold title, two lines, close X, one link | Banners in Settings |
| Apple Account sign-in | Big mark, title, one short line, one field, two buttons, small privacy note | Connect screen |

Not used yet: Photos' dim-until-selected icon toolbar (could suit Details), Drive's month groups (could suit Activity), Contacts' A–Z index.

## Settings, Organize and Protect (round 3)

| Source | Pattern | Cluster |
|---|---|---|
| iOS Settings | Grouped inset lists: a small grey group heading, rounded group, rows of 29px colored icon, name, optional grey second line, a switch or value on the right. No sentence under the screen title. | Organize presets, Settings and Protect use one row style (`.ios-group`, `.ios-row`); page-title sentences hidden |
| Google Security Checkup (myaccount.google.com/security-checkup) | One line per check with a green or red status, issues first | Protect "Checkup": sender checks (SPF/DKIM/DMARC), fake brand names, replies sent elsewhere, known bad links, held so far |
| Gmail "Report spam" / "Block sender" | Spam moves mail out and trains the filter; blocked senders go to Spam | Rule "Send held mail to Spam" adds Gmail's SPAM label to held mail (Undo removes it) |
| Gmail's "Be careful with this message" banners, DMARC | Mail that fails authentication is the strongest single forgery signal | Rule "Hold forged mail": DMARC fail, or SPF and DKIM both fail, from someone you don't write to, held on that alone |
| Apple Mail / iOS "Silence Unknown Callers" | One switch decides what strangers can reach you | Existing Screener (New senders) stays the screen for that |
