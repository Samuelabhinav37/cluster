# Stripe Dashboard: how it uses charts, and what Cluster takes from it

Date: 2026-11-05. Asked for after Clean up and Stop mail "look like a glitch".

## What Stripe does (sources at the bottom)

1. **Answer first, chart second.** The current value sits above the chart, so
   the user gets the answer before reading the trend. Stripe calls this "the
   pattern used on the Stripe Dashboard home page". [1]
2. **The chart matches the question, not the data.**
   - "Is this going up or down?" → line
   - "How much is each?" → bar from zero
   - "What's the breakdown?" → one meter bar
   - "Quick trend?" → sparkline with no axes, beside the number. [1]
3. **At most three charts in a row.** Below about 200 px wide a chart stops
   reading. Charts in one row share one height: 180 px in a card, 320 px for a
   featured chart. [1]
4. **The size is fixed before the data arrives.** Every chart sits in a
   fixed-height box. Loading, empty, error and full states all use the same
   height, so nothing below it jumps. [1]
5. **No flash of loading.** Spinners wait 200–300 ms before showing. Buttons
   show their own pending state instead of a separate spinner. Each section
   loads on its own, and tab bars never get replaced by a spinner. [2]
6. **Color only means status.** Green, red and yellow mean succeeded, failed
   and pending. Everything else is monochrome, so red always means "look
   here". Sparklines are monochrome. [3]
7. **Comparison under the number.** The previous period sits in small text
   under each headline number, for the same kind of period the user picked. [3]
8. **Lists are one filterable table.** Payments opens on one list with filters
   (date, status, amount). It isn't split into a card for each status. [3]
9. **Home is a few numbers, chosen for you.** Users can add, remove and
   reorder widgets, but the defaults are a handful of decision metrics. [3][4]

## Seen live (user's Stripe Express account, 2026-11-05)

The account opened on Stripe Express, the payout dashboard Stripe gives
contractors, not the full merchant Dashboard. It was empty ($0, no
transactions), so this shows layout and states, not real charts.

- **Flat page, no cards.** Sections are a bold 18 px heading with a small gray
  "See all" button at the right, then content separated by hairlines only.
- **Two columns, 2/3 + 1/3.** The main column holds Recent earnings with a
  chart, then Recent transactions. The side column holds Total balance and
  Activity.
- **Number above chart, period picker beside it.** "$0.00" sits under the
  heading, with "Past 12 months" as a small select on the right.
- **Empty chart keeps its shape.** Gray ghost bars at full chart height, with
  one icon and "View trends in your earnings over time" on top. The page
  doesn't collapse when there's no data.
- **Skeletons, not spinners, for tables.** While loading, each row shows gray
  pills in the real column positions, of varying widths. The final rows land
  in the same place.
- **Tables:** header row in small bold gray, amounts right-aligned, filter
  buttons above the table (Date, Transfer date, Type) with Export on the
  right, and underline tabs (All / Payouts) above those.
- **Empty table:** a bold line ("No transactions yet") and one gray sentence,
  centered in a fixed-height area.

## What this means for Cluster

| Screen | Now | Stripe rule it breaks | Change |
|---|---|---|---|
| Clean up | Three cards of different heights, each with its own bar list and button | 3, 8 | One row of three numbers with sparklines (same height), then **one** sender table with filter chips (Never opened / Old codes / Lists) and one action bar |
| Stop mail | Toolbar crammed into a strip, two-column grid, buttons of different widths, loose "Show all 29" | 8, 6 | One single-column table: logo, name, sparkline of mail per week, opened %, one action column of fixed width. Filter on the left, the one filled button on the right. "Show all" becomes the table's footer |
| Stop mail, paid | Chips of three different widths | 3 | Small list module with three rows: logo, name, "Renews Nov 12" |
| Overview | Tiles with no trend | 1, 7 | Each tile gets a sparkline and "vs last week" (already designed in Home v2) |
| Everywhere | Lists render, then reflow | 4 | Fixed row and chart heights, skeleton rows of the same height |

## Sources

1. Stripe Docs, "Chart layout for Stripe Apps": https://docs.stripe.com/stripe-apps/patterns/chart-layout
2. Stripe Docs, "Loading for Stripe Apps": https://docs.stripe.com/stripe-apps/patterns/loading
3. 925 Studios, "Stripe Dashboard Design Breakdown" (secondary; the metric list is unverified): https://www.925studios.co/blog/stripe-dashboard-design-breakdown
4. Stripe Support, "Dashboard home page charts": https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights

No Stripe engineering post on Dashboard page-load speed was found. Stripe's job
listings name performance budgets and profiling as goals, but no technique is
public, so "fast" above means the layout rules (fixed sizes, delayed spinners,
sections loading on their own), not a measured claim.
