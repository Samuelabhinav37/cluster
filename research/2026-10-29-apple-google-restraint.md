# How Apple and Google keep screens quiet, and what Cluster changes

2026-10-29. Asked for after the redesign mockup review: too colorful, too many lines, repeated across the whole dashboard.

## What they do

**Color.** Apple: "Use color sparingly in nongame apps." Use one meaning per color, prefer system colors, and never let color carry meaning alone; pair it with a label or a shape. An app sets one accent color that buttons, icons and text share. ([HIG Color](https://developer.apple.com/design/human-interface-guidelines/color))

**Buttons.** Apple: the label is a verb that names the action ("Save", "Delete"), not "OK" or "Yes". The button's label, style and place should say what it does, with no subtitle explaining it. Material: labels should be concise; avoid long text labels. ([HIG summary](https://dev-moon.notion.site/Human-Interface-Guidelines-9dea209d94664d9ba6a48835c7ebbb27), [Material buttons](https://material.io/go/design-buttons))

**Text.** Material: "simple, concise, and direct", numerals not words. ([Material writing](https://material.io/design/communication/writing.html))

**Cleanup screens they ship** (from using them, not from a guideline):
- Google Files, Clean tab: a card has a title ("Junk files"), one number (the size), one button ("Clean"). No sentence under it.
- iPhone Storage: one bar of what fills the phone, then Recommendations rows (title, button). The detail list is sorted by size, with names and sizes only.
- Apple Mail categories: four tab names, no description on any of them.

## Cluster's rules (in memory as feedback-cluster-design-rules)

1. One accent color plus grays, everywhere. Red only for real danger.
2. No subtitle under page titles.
3. Bare numbers: "111 emails", "191 emails can go". The heading says what they are.
4. Buttons are the verb: "Trash", "Unsubscribe". The count lives in the number above it, not in the button.
5. No reassurance lines ("You can undo this"). The Undo toast already says it at the moment it matters.
6. Legends, tiles and rows: the name and one value. No meta line ("5 addresses · 22% opened").
7. No "Why" or "How it works" paragraphs. One (i) that explains on click.

## Where the live dashboard breaks them (to fix with the mockup build)

- 10 page subtitles (`class="lead"`), including Clean up ("N emails you can clear.") and Protect's shared line.
- Buttons with counts: Home Next up "Trash N" (2), Stop mail "Unsubscribe all N", "Let in all N?" confirm.
- "You can undo this." on Home Next up and in the Stop mail confirm.
- 10 row sub-lines in index.html, 12 hints, 5 " · " meta joins in TS (Clean up rows "5 addresses · 22% opened", Stop mail rows).
- Colored place squircles (orange, purple, indigo, blue) on the sidebar, page titles and Home rows. Charts are already one blue scale.
