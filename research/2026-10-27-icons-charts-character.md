# Icons, charts and a character: how others make the numbers easy

Asked 2026-10-27 after the Protect mockup: no icons, nothing interactive; look at 1Password's
dashboard, Microsoft's dashboard tips, Cleanfox's fox, and how top apps show data.
Result: `2026-10-27-home-cleanup-mockup.html` (serve from the repo root so Kai loads).

## Sources and what they say

- **Microsoft, Power BI dashboard tips**
  ([Learn](https://learn.microsoft.com/en-us/power-bi/create-reports/service-dashboards-design-tips)).
  - Tell the story on one screen.
  - Put the most important number top left.
  - Use bar and column charts to compare. Circular charts are "not ideal".
  - Avoid variety for the sake of variety.
  - Remove data labels that aren't needed.
  - Keep colours consistent for the same thing across charts.
  - Don't mix time frames.
- **1Password Watchtower.**
  - One score up top.
  - Then one tile per problem with its count, shown only when it has items
    ([Support](https://support.1password.com/watchtower/),
    [blog](https://1password.com/blog/improve-watchtower-score-1password)).
- **Apple Screen Time.**
  - Bars of daily totals.
  - Colour for the top three categories, grey for the rest.
  - A ranked list of apps under the chart
    ([Apple](https://support.apple.com/guide/mac-help/mchlf2c0c770),
    [Vicki Boykis](https://vickiboykis.com/2019/04/29/breaking-down-apples-ios-screen-time-report/)).
  - A design guide adds that each chart should connect to an action
    ([screensdesign](https://screensdesign.com/articles/screen-time-app-design/)).
- **Cleanfox** ([site](https://www.cleanfox.io/en-gb/), seen in the browser).
  - A fox states the result in one line ("You have gained 250 GB of space").
  - Big-number tiles each have a small illustration.
  - Cleanup is a Cards / List switch: one sender per card with its stats, swipe to keep or remove.
  - It ends on a results screen
    ([review](https://thebusinessdive.com/cleanfox-review),
    [App Store](https://apps.apple.com/app/cleanfox-email-e-spam-cleaner/id1136298377)).

## What the mockup does with it

1. **Kai says the one line that matters** on Home, then reacts when you act ("150 fewer emails.
   Nice."). The real Kai engine and art, calm mode.
2. **One number, one bar, one trend.**
   - Inbox total.
   - A bar split into the four kinds, which you can hover and click to focus.
   - Eight weeks of stacked columns with a tooltip per week.
   - The same four colours everywhere. Colours checked with the dataviz validator in light
     (#fff) and dark (#161618): blue, aqua, violet, orange.
3. **Every action works in place.**
   - The row turns into "Done · Undo".
   - Counts, the bar and the Protect badge update.
   - No confirm screen for anything Trash can undo.
4. **Clean up has List and Cards.**
   - List rows get the sender's logo and a volume bar.
   - Cards show one business at a time with an 8-week sparkline and its latest subject.
     Drag, click, or ← →.
   - Strangers in Protect use the same deck.
5. **Icons** come from one stroke set (24px grid, 1.8 stroke).
   - Each recommendation and subsection has a tinted icon chip.
   - Red is only for scams, green only for done or safe.
6. **Scam rows show a reason icon, not the brand's logo.** A real PayPal logo next to a fake
   email would lend it trust.

## Found while testing

Dark Reader is installed in the test browser and recolours pages it injects into, including the
localhost preview. It made every colour look muddy (violet rendered as navy). The mockup now
carries `<meta name="darkreader-lock">`. The real dashboard is a `chrome-extension://` page,
which Dark Reader shouldn't reach, but `scripts/preview` pages are affected.

## Round 2 (same day): less on screen, details on demand, Kai that acts

The user's feedback after round 1: still too much, the icons look cheap, the bars are too
colourful, and Kai should be back in its corner on every page, able to do what you type.

- **Details panel.**
  - Each place has a Details button that opens a sheet in the right 25% of the window: sortable
    columns, a filter, and a button to widen it to 50%.
  - Home's trend chart moved there, so Home is down to a number, one bar and three steps
    (39 words).
  - Clean up's "Show all" opens all 39 senders in the sheet. Protect's sheet lists every
    flagged email.
- **Icons.** Lucide 0.460 (ISC) replaces the hand-drawn set, at a 1.75 stroke.
  - Chips are neutral.
  - Only scam chips are red, and only finished rows are green.
- **Colour.** One blue in four muted steps (dark: #9db8ee, #6f92d8, #4d6fb4, #34507f; light:
  #1f4aa8, #3f6fd1, #7d9de0, #b3c6ee). The darkest step is under 3:1 against the panel, so the
  legend always carries labels and counts, and the sheet has the numbers.
- **Kai in the corner, everywhere.**
  - Kai speaks one line, with Undo when it did something.
  - Clicking Kai, the sidebar's Ask Kai, `/` or Ctrl+K opens the Ask box. Results update as
    you type, like Windows search: a best match on the right with one button, more matches on
    the left, and arrow keys plus Enter.
  - It understands sender names ("stop linkedin"), questions ("how many promotions"), topics
    (scams, codes, receipts, new senders) and settings ("turn off new sender hold").
  - In the mockup this is keyword intents. The extension would use the same matcher first and
    Chrome's on-device Prompt API for anything it can't match. Nothing leaves the browser.
