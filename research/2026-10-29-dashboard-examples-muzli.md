# Dashboard examples (Muzli, 50 for 2026) and what Cluster takes (2026-10-29)

Source: https://muz.li/blog/best-dashboard-design-examples-inspirations-for-2026/ . Looked closely at 12
images: Emaily (email campaigns), FlowMail (email automation), Exon (cybersecurity), Vento and
Dashboard Dark (Felix), Trackify (CRM), Nexo (sales modules), Salezy (sales), Kinship, Noteflow,
Finexy, Caltimes. The article text is one generic paragraph each; the lessons are in the images.

## How they use space

- One grid, three bands: a row of 3 or 4 equal KPI cards, then a wide chart (2/3) beside a side
  card (1/3), then a full-width table. Gaps 16 to 20px, card padding about 20px.
- Every card is filled top to bottom: title, big number with a delta chip, then the chart
  stretches to the bottom edge. No card has an empty half.
- A card holds one question. Nexo puts the chart on top and a one-line "what this tells you" under
  the title.
- Time range is one segmented control at the top of the page (This month / Last month) instead
  of on every card.

## How they use charts

| Pattern | Seen in | When it works |
|---|---|---|
| Number + delta chip ("↑ 12% since last month") | Every example | Any number that changes over time. A number with no comparison says nothing |
| Gray history, one colored bar for now | Salezy (hatched gray, July blue), Trackify (6 tiny gray bars, Dec purple), FlowMail | Showing "today vs normal" in a small space |
| Donut with one slice colored, rest gray, label in center | FlowMail Campaign Types | One part of a whole matters; 4 or 5 parts at most |
| Arc segments + legend list with count and % | Trackify Source | Parts of a whole where the reader needs the exact numbers |
| Segmented gauge (ticks filled to a %) | Exon 76%, Salezy 70.8%, Caltimes 95% | One ratio against a target. Decorative otherwise |
| Horizontal bars as a funnel | Nexo Sales Pipeline (New, Contacted, Qualified, Converted) | Steps where things drop out |
| Heatmap day x hour | Caltimes Meetings | When things happen |
| Table row with mini meter + colored risk pill | Exon Connected Systems (score bar, High/Medium/Low) | Ranking many items by risk |
| Insight sentence next to the chart | Exon "AI Insight", FlowMail "AI Insights", Vento "Ask me anything" | Always: says what the chart means |
| Crosshair tooltip listing each series' value | Trackify, Emaily, Exon | Line charts with 2 or 3 series |

Color: one accent per product (FlowMail purple, Salezy blue, Exon green), gray for everything
else; red/green only on delta chips and risk pills.

What to skip: glass and 3D backgrounds, upsell cards, avatars, and Vento's six chart types on one
screen. That density suits analysts, not Cluster's "one job per screen" rule.

## Where Cluster uses each

| Place | Take |
|---|---|
| Home, This week | Delta chip on each card vs last week. 7-day bar = gray days, today in accent, value label on today. Hover a bar: "Tue: 32 cleared" |
| Home, new optional row | "This week's mail" funnel: Arrived 420 → Sorted 380 → Cleared 214 → Needs you 3. Replaces explaining in words what Cluster did |
| Home, Your inbox | Keep the stacked bar (reads faster at full width). Legend gets % next to counts, like Trackify |
| Clean up | Each sender row gets a thin share-of-inbox bar, so the biggest sources stand out without reading numbers |
| Protect | Senders as Exon's table: mini check meter (passed checks of 4) + High/Medium/Low pill + one action. A segmented gauge "Sender checks passed 94%" is the one place a gauge fits (ratio vs a 100% target) |
| Details / Report | Heatmap of when mail arrives (day x hour); backs the "Newsletters on Saturday" preset. Donut of kinds with one slice highlighted when a chip is picked |
| Organize | Per-kind small bars: how many would leave this week if the time limit were on |
| Everywhere | One time-range control per page; Kai's sentence sits where Exon puts its insight box |
