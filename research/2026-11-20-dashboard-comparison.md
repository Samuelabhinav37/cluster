# Dashboard vs Stripe, Searchable, Base44, Mercury, n8n (2026-11-20)

Mobbin web screens: Stripe Home ("Organisation performance"), Billing overview, Workbench Health;
Searchable (Search Console view); Base44 Analytics + Workflows Activity; Mercury Banking home + Books home.
n8n is not on Mobbin; incident.io and Base44 workflow "Activity" tables stand in for an automation run log.

Our Dashboard today: greeting; date range + Download; 2x2 metric cards (first filled blue, watermark icon,
arrow button each); "Received Mails" bar chart with Total / Per day / Busiest day; "Mail by category" gauge;
Top senders list; Kai floating bottom right.

| # | What they do | Who | Ours | Change |
|---|---|---|---|---|
| 1 | Action buttons under the greeting | Mercury (Send, Transfer, Deposit, Request) | Greeting only | "Clean up 113", "Check new senders", "Sort now" pills |
| 2 | Every number has a comparison | Stripe ("previous period", +50%), Mercury ("vs prior period"), Base44 (↗ 714%) | None | "+12% vs last 30 days" under each number |
| 3 | Metrics as one joined strip that switches the chart | Searchable, Base44, Substack | 4 separate cards beside a fixed chart | One strip of 4 tabs above one chart; the picked metric drives it |
| 4 | All cards equal, colour only in data | Stripe, Mercury, Base44 | First card filled blue + watermark | Equal cards, no watermark |
| 5 | Breakdown as a ranked list with share bars | Mercury "By ledger account" | Decorative gauge | Ranked category list with % bars, like Top senders |
| 6 | Recent activity / run log on home | Stripe Recent activity, Base44 Activity, incident.io | Only in Settings > Diagnostics | "What Cluster did" card: time, action, count, status pill |
| 7 | Calm empty states | Stripe Health ("✓ No alerts") | "In the Screener 0" as a big number | "✓ Nothing waiting" |
| 8 | Compare control next to date range | Stripe ("Compare: Previous period") | Date range only | Add Compare |
| 9 | "Updated …" stamp per panel | Stripe | None | "Updated just now" |
| 10 | Assistant in a corner button, never over data | Mercury (small ">_" button), Base44 (own column) | Kai + bubble over tables | Smaller Kai, bubble once, keep a gutter |
