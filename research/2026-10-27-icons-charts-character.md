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
