# Dashboards, and how to lay out option labels (2026-10-29)

Two questions: (1) how do Apple, Google and Microsoft build dashboards and decide what a
dashboard does, and (2) Organize's "Sort now" runs its options together as a paragraph; how do
companies lay these out so anyone can read them?

Follows `2026-10-29-how-big-tech-trims-options.md`. Apple HIG pages were read as .md, NN/g and
GOV.UK directly; press is marked.

## What Sort now looks like today

Screenshot from the preview (fixture): one wrapped line of text with 16 checkboxes:

> ☑ 📰 Newsletters: 84 ☐ keep in inbox ☑ 💬 Social: 36 ☐ keep in inbox ☑ 📦 Orders & shipping: 9 ☐
> keep in inbox ☑ 🧾 Receipts: 4 ☐ keep in inbox ☑ 🔑 One-time codes: 2 …

Built in `src/dashboard/sortInbox.ts` `renderSortBucketToggles()`: each bucket is an inline
`<label>` holding checkbox, emoji, "Name: count", and a second inline "keep in inbox" checkbox.
Problems, in the terms the sources below use:

1. **Horizontal, wrapping layout.** You can't tell whether "☐ keep in inbox" belongs to the item
   before or after it. Line breaks fall mid-item ("Receipts: 4 ☐ / keep in inbox").
2. **Two controls per item with opposite senses.** The first box means "include this kind", the
   second "keep it in the inbox", so ticking both means "sort it but don't move it".
3. **No question.** The group has no heading saying what ticking does.
4. **Emoji icons**, while the "Archive after a while" list directly below uses line icons in proper
   rows. Two looks on one page.
5. **The count means something else** than the counts nearby ("Newsletters: 84" here, "about 41
   a week" in the next section).

## How companies lay out options

| Rule | Source |
|---|---|
| Use the switch style only in a list row; the row's content is the label | Apple HIG Toggles ("Use the switch toggle style only in a list row") |
| A checkbox for a single on/off in a form; radio buttons, or a pop-up past ~5 options, for "pick one" | Apple HIG Toggles |
| Introduce a group with a label when the relation isn't clear | Apple HIG Toggles; GOV.UK ("a `<legend>` … usually a question") |
| Checkbox left of its label; stacked one per line in every example | GOV.UK Checkboxes |
| Hint text per option: one short sentence, no full stops | GOV.UK Checkboxes |
| Show a follow-up option only after its parent is ticked, and only if it's simple; otherwise next step | GOV.UK conditional reveal |
| Horizontal only if it's "abundantly clear which choice goes with which label" | NN/g (2004) |
| Vertical lists are easier to scan; avoid horizontal groups | Visa design system, Queensland government standard (secondary) |
| List row anatomy: leading icon, headline, one supporting line, trailing control (switch, checkbox or value) | Material 3 ListItem (Compose docs) |
| Use a checkbox, not a switch, when settings depend on each other; show the dependency with indent | Apple HIG Toggles |

**What this means for Sort now:** make each kind one row, the same component as "Archive after a
while": icon, name, one gray line with the count and where it goes, and one control on the right.
Replace the second "keep in inbox" checkbox with the row's value ("Moves to Newsletters" /
"Stays in inbox", a pop-up like iOS Settings rows), so each row has one meaning. Head the group
with the question it answers ("Which mail should Sort move?"). One button below the list.

## How companies build dashboards

1. **One job: answers at a glance.** NN/g: a dashboard is a "single-page view that imparts
   at-a-glance information" and is "focused on a single task: communicating critical information",
   not exploration. Two kinds: *operational* (act now) and *analytical* (decide where to dig).
2. **Encode numbers with length and position.** NN/g: bars and lines are reliable; avoid pie,
   donut, gauges, treemaps and 3D; color "should not be used to communicate … magnitude", only to
   reinforce something shown another way. Apple HIG Charts: the same, plus "don't require
   interaction to reveal critical information".
3. **Say the message in words above the chart.** Apple HIG Charts: "Summarize the main message
   of your chart"; Weather gives a title and subtitle that state the takeaway, the chart is the
   evidence.
4. **A fixed set the user chooses, plus a few that the system picks.** Apple Health Summary has
   *Pinned* (the user picks categories, today's status) and *Highlights* (on-device ML picks what
   changed, "Show All Highlights" for the rest). Google Analytics 4 Home has fixed overview cards
   plus *Insights & Recommendations* cards; dismissing one hides it for 30 days and it stays in the
   Insights Hub. Universal Analytics' home was a fixed "vital signs" summary.
5. **Every card leads to one place to act.** iPhone Storage recommendations (earlier research,
   `2026-10-27-dashboard-friction.md`): each card says what it frees and has one button.
6. **Defaults and personalization over configuration.** GA4 Home "personalizes more as you use
   the product"; Apple Health Highlights are picked on-device.

**What this means for Home:** Home is an operational dashboard. Keep one total and up to three
cards, each a sentence first ("30 emails you never opened") with one button that opens its
place. Use bars, not area or color, for amounts. Cards that change week to week should be
dismissible (GA4) and the dismissed list reachable elsewhere. Today's Home already follows most
of this; the gaps are the setup card (belongs to first run), and Protect's three brand squares,
which rendered as blank white squares in the preview (logos not loaded; unchecked whether real
Chrome shows them).

## Sources

- Apple HIG: [Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles), [Charts](https://developer.apple.com/design/human-interface-guidelines/charts)
- [GOV.UK Design System, Checkboxes](https://design-system.service.gov.uk/components/checkboxes/)
- [NN/g, Dashboards: Making Charts and Graphs Easier to Understand](https://www.nngroup.com/articles/dashboards-preattentive/)
- [NN/g Alertbox 2004, checkboxes and radio buttons](https://www.nngroup.com/alertbox/20040927.html)
- [Material 3 ListItem (Compose)](https://developer.android.com/reference/kotlin/androidx/compose/material3/ListItem.composable)
- [Visa design system, Checkbox](https://design.visa.com/components/checkbox/usage/); [Queensland gov, radio and checkbox options](https://www.forgov.qld.gov.au/communication-and-publishing/website-standards-guidelines-and-templates/consistent-user-experience-standard/module-4-online-forms/module-4-checkpoint-30-radio-button-and-check-box-options) (secondary)
- [Apple Support, Use the Health app](https://support.apple.com/en-ca/HT203037)
- [Google, GA4 About the Home page](https://support.google.com/analytics/answer/11197963); [Search Engine Land on the GA4 home](https://searchengineland.com/google-launches-new-google-analytics-4-home-page-382094) (press)
