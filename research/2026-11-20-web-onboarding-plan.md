# Web-first onboarding, untangle scan, nicer tour, livelier Kai (2026-11-20)

Research first, then the plan. Nothing in the plan is built yet except the privacy line.

## What was read

- **masko.ai, web onboarding mascot tutorial + use-case page** (read in full). Desktop page: brand mark on top, then the mascot (200 x 200 px) with its spoken line as a visible caption next to it, a numbered step list (1 Your space, 2 First project, 3 Ready), then "STEP 1 OF 3", a heading, helper text and the form. The caption sits beside the mascot and the instruction beside the field. The mascot never covers the form. Three states, each fired by an event: welcome (enter setup), guide (after a save), done (after the last save). The mascot only moves on after validation and a successful save. Idle loop 5 s: breathe in, one blink, breathe out. A "Hear" button replays the line. Lines stay visible as text with `aria-live="polite"`.
  https://masko.ai/docs/tutorials/web-onboarding-mascot , https://masko.ai/docs/use-cases/web-onboarding
- **svgapp.ai, app onboarding examples** (read in full). No real app examples, only advice: the mascot points to the next action, small pose changes beat heavy animation, a pose per step (welcome, setup, waiting, success), no interruptions while the person is acting, the button stays the strongest thing on screen.
  https://svgapp.ai/blog/app-onboarding-examples/
- **SaaSFrame, 12 SaaS onboarding examples** (read in full) plus screenshots of Dust and Rankfender. Web onboarding is a **page with a header**: logo top left, exit or Next top right. Dust puts the question in a wide column with a **three-column tile grid** and Next under it on the right. Rankfender uses **two panels**: a left panel with "Step 1 of 7", a segmented bar, what to do and the list of stages, and a right card with the form and a live "Analyzing competitors…" state. Other patterns: tiles instead of typing, a step count, a real result from your own data early (Profound's ranking, Visitors' live counter), a short tour for one rule, and an end that hands you something to use.
  https://www.saasframe.io/blog/saas-onboarding-ux-examples
- **Tours** (Appcues, UserGuiding; vendor blogs, so biased toward tours): 3 to 5 steps, about 140 characters or less, say the value rather than the click, one strong spotlight, always skippable, never block the product.
- **Rubik's cube in SVG**: no ready "untangle" loader exists. Closest references: a 3x3x3 isometric SVG cube whose layers twist (21st.dev, MIT) and an SVG cube assembling sub-cubes in sequence (CodePen). So this one is drawn from scratch.
- **Kai** (our own code and research/2026-11-20-kai-alive-games-research.md): Kai has 15 moods, 25 actions, a spring antenna, an idle body and a brain (cursor follow, look at the focused input, hold still while typing). Every onboarding Kai runs with `calm: true` and the brain off, so most of that never shows.
- **Mobbin**: no Mobbin tool is connected in this session, so nothing was pulled from Mobbin.

## Why it feels like an app, not a website

1. No header. A website has the logo top left and a way out top right; ours floats a Back link and a bottom-right skip.
2. One narrow column (480 to 640 px) in the middle of a 1440 px window. The rest is empty sky.
3. Kai is small (104 to 120 px) and sits in a row with the bubble, like a chat app.
4. The step tracker is a game-console strip in the bottom-left corner, far from the content.

## Plan

### 1. Web layout (all onboarding screens)
- Header bar: Cluster logo left; "Step 2 of 5" and "I'll set it up myself" right.
- Two panels at 1000 px and wider:
  - **Left, the world**: the Clay-style scene as a large rounded panel. Kai stands on the hill at about 200 px with the speech bubble above, like masko's caption next to the mascot. The step list (You, Gmail, Your mail, Labels, Tour) sits in the panel, so progress lives next to Kai.
  - **Right, the work**: heading-sized line, field or tiles, and the main button, on the plain page. Label tiles use three columns.
- Under 1000 px: one column, scene as a short band on top, Kai at 120 px.
- The PS5 strip goes; the step list in the left panel replaces it.

### 2. Privacy line (done)
"Cluster sorts your mail on this computer." followed by an underlined "Privacy policy" link.

### 3. Untangle animation (replaces the envelope stack while mail is read)
- Same line style as now: thin lines, isometric, one blue accent.
- A 3 x 3 x 3 cube of small blocks. Each block is a few emails. It starts scrambled, with mixed label colours.
- As reading goes on, one layer turns at a time, about 600 ms per quarter turn with a small overshoot. After each turn the blocks on the front faces take the colour of the label they belong to, so the faces slowly become single colours.
- At 100% the cube is solved: each face is one label. It lifts slightly and settles.
- Progress drives the turns, so a slow scan turns slowly and never runs ahead of the real count.
- A small 3D projection in plain SVG, no library. Reduced motion shows a static cube that fills face by face.
- The same cube is used on the setup scan screen, smaller, so both scans look alike.

### 4. Dashboard tour
- 4 stops, not 5. Each line says what you get, not where to click, in 140 characters or less.
- A soft spotlight: a dimmed page with a rounded cut-out and a slow glow around the target, plus an arrow from the card to the target.
- Kai flies to each stop (already built) and points at the target with the existing `point` action.
- The card shows "2 of 4" as dots. Arrow keys and Esc work.

### 5. End card
- Real padding (32 px all round, 20 px gaps) and a wider card (440 px).
- Kai sits above the title with space between them and does a small hop when the card appears.
- Title "You're all set, Sam.", one line saying what happens next ("New mail gets its label as it arrives."), and the button "Open my inbox".

### 6. Kai, more alive (onboarding only)
- Turn off `calm` on onboarding screens: breathing, float and antenna sway come back.
- Turn on part of the brain: follow the cursor with a short delay, look at the field you are typing in, hold still while you type.
- Reactions: a nod when the name or email is valid, a hop when you press the main button, a small wave on arrival, a proud pose at the end.
- Quick glances (snap, then hold) instead of slow drifts.
- No confetti, no emotes.

## Order

1 layout → 6 Kai → 3 cube → 4 tour → 5 end card. Each one is a separate commit and a screenshot round with you.
