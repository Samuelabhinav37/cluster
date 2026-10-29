# Home against Mobbin's dashboard rules (2026-10-29)

Source: [What good dashboard design looks like](https://mobbin.com/blog/what-good-dashboard-design-looks-like).
Checked against Home as built (`src/dashboard/homeDashboard.ts`): a bento of four tiles (All mail
with the four-kind bar, Protect, Clean up, Organize), Details on the right, Kai in the header.

| # | Rule | Home today | Verdict |
|---|---|---|---|
| 1 | Say what the product is | The title is just "Home". The headline line exists but is screen-reader only | Partly |
| 2 | Encode feeling | Calm tiles, red only for scams, green ticks when all is well | Yes |
| 3 | Scannable in seconds | Four tiles, one number each | Yes |
| 4 | Name concrete outcomes | "ready to go", "kinds tidy themselves" describe state, not results you got | Partly |
| 5 | Annotate charts | The kind bar has a legend with counts, nothing calls out what matters | Partly |
| 6 | Pair charts with interpretation | No sentence says what the bar means | No |
| 7 | Sequence information | All mail, Protect, Clean up, Organize. Scams sit second even when urgent | Mostly |
| 8 | Design for the emotional state | Scams in red with the brands they fake; calm empty tiles | Yes |
| 9 | A vocabulary for progress | Nothing shows change over time (mail cleared, inbox lighter, weeks kept tidy) | No |
| 10 | "So what" first, then evidence | The biggest number is the total email count, which is evidence, not a verdict | No |
| 11 | Leave things out | Four tiles, word budget test guards it | Yes |
| 12 | Progressive disclosure | Tiles open their place; Details holds the lists | Yes |
| 13 | Few primary actions | No buttons on Home; each tile opens one place | Yes |
| 14 | Empty states set expectations | "Nothing to clear" says the state but not what happens next | Partly |
| 15 | Surface the one metric | The one metric is "emails read", not what Cluster did for you | Partly |
| 16 | Blank space as design | Generous gaps, no filler | Yes |

Score: 7 yes, 1 mostly, 5 partly, 3 no.

## What would close the gaps

1. **A verdict line on top, said by Kai** (rules 1, 10, 15). One sentence before the tiles:
   "2 things need you. The rest is handled." or "All quiet. Nothing needs you." The total
   moves into the All mail tile as evidence.
2. **A progress number from the action log** (rules 4, 9). "1,240 emails cleared since you
   started" and "Inbox 30% lighter this month". The log already records every Trash, Archive
   and Mute, so this needs no new data.
3. **One interpreting sentence under the bar** (rules 5, 6). "Promotions are 41% of your mail.
   Clean up can clear most of it."
4. **Scams first when there are any** (rule 7). Protect moves to the first tile only while it
   has something to review.
5. **Empty tiles say what's next** (rule 14). "Nothing to clear. Cluster checks new mail as it
   arrives."
