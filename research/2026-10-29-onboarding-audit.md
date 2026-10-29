# Onboarding audit and round 3 (2026-10-29)

Built version checked in the preview (dark mode, 1568 px wide) after commit 99c474d.

## What the user saw

| Problem | Where | Cause |
|---|---|---|
| Kai's bubble is too big | Right panel, bottom | Full-width bubble (left 24px to right 24px), long two-sentence lines |
| Nothing moves when you choose | Every step | Only a fade on step change. Options, ticks, counts and Continue have no feedback |
| Icons look cheap | Option tiles | Hand-drawn 24px paths at stroke 2 on flat colour squares, unlike the Lucide set Home uses |
| Not professional | Right panel | Cartoon drawings with a grey circle that turns muddy in dark mode, unlike the photo on the sign-in page |
| Logo hard to see | Top left, sign-in and setup | The mark is a near-black tile (#030307) on a black page, at 28px; setup shows only the word |
| Practice rows jump | Step 2 | The pane is centred with `margin: auto`, so the list moves up each time a row leaves |
| "All set" never shows | After Start | Setup closes the moment Start is pressed |

## How other companies do it

- **Duolingo**: the owl sits centred with one short line in a small bubble above Continue,
  for example a "Hi there! I'm Duo!" greeting ([screensdesign](https://screensdesign.com/articles/duolingo-onboarding-design/)). The
  mascot is small next to the question and never covers it. Speech is timed to the words
  ([Duolingo blog](https://blog.duolingo.com/world-character-visemes)). Characters run as state
  machines (idle, reacting, talking) rather than videos ([DEV](https://dev.to/uianimation/building-duolingo-style-ai-mascot-animations-with-rive-2446)).
  The animations are what make a good flow feel delightful ([Appcues](https://goodux.appcues.com/blog/duolingo-user-onboarding)).
- **Linear**: a short flow, about a minute, with no tours. Motion is subtle, such as a gentle pulse
  on the main button and icons that turn into view ([Candu](https://www.candu.ai/blog/linear-onboarding-teardown)).
- **Animation as teaching**: motion can show an action instead of explaining it, and reward motion
  belongs at milestones, not after every click ([Oxford Blue](https://theoxfordblue.co.uk/ui-animation-in-saas-onboarding-improves-retention-and-reduces-early-churn)).
- **Platform guidance** (summaries, not the primary pages): Material 3 uses springs with a slight
  overshoot; Apple keeps feedback brief and avoids motion on things you do often; ticks draw in over
  about 150 to 200 ms; respect reduced motion by keeping fades and dropping movement
  ([M3 motion summary](https://skills.cat/skills/shelbeely/shelbeely-agent-skills/material-design-3-motion),
  [micro-interactions](https://playbooks.com/skills/dylantarre/animation-principles/micro-interactions)).

## Changes in this round

1. **Kai is small and beside a short line.** A 64px Kai with a compact bubble (max 300px, one
   short sentence) at the top of the right panel. The bubble pops from its tail on each new line.
2. **The right panel is a live preview, not a drawing.** The NASA photo from sign-in, darkened,
   with one glass card, "Your Cluster", that fills in as you answer. Each answer adds or changes a
   row with a short rise. This is Duolingo's plan payoff spread across the steps, and it shows
   what each answer does instead of telling you.
3. **Micro-feedback on every choice.** Option cards press down, the tick pops with a small
   overshoot and draws in, options enter one after another, the active progress dot stretches,
   Continue lifts once when it unlocks, practice rows slide toward Keep, Later or Let go with a
   label, and the tally numbers bump.
4. **Icons from Lucide**, the set Home already uses, on gradient squircle tiles like the app icons.
5. **A clear logo.** The mark at 32px with a hairline ring so it holds on dark pages, and the
   word "Cluster" beside it on both sign-in and setup.
6. **Practice rows stay put.** The pane sits at a fixed top, so buttons don't move under the pointer.
7. **Kai says "All set" before Home opens**, with a tick on the Start button.
