# Motion and first run: Apple vs Cluster (2026-11-15)

Question: how does Apple design motion and onboarding, and what should change in Cluster's
dashboard animations and first-run setup to match? Branch `feat/ui-polish-2026-11`. No code changed.

How the sources were read: `WebFetch` was blocked for developer.apple.com, so the HIG and SwiftUI
pages were read from Apple's own JSON behind each page
(`developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`, same text as the
web page). WWDC transcripts were read from the session pages. apple.com CSS was downloaded and the
easing values counted.

---

## Part 1. What Apple says

### Motion (HIG)

Source: https://developer.apple.com/design/human-interface-guidelines/motion

| Rule | Apple's words, short |
|---|---|
| Purpose | "Add motion purposefully ... Don't add motion for the sake of adding motion." Too much "can distract people" or make them "physically uncomfortable". |
| Never the only signal | "Make motion optional ... avoid using it as the only way to communicate important information." |
| Feedback | "Aim for brevity and precision in feedback animations." Brief motion "tends to feel lightweight and unobtrusive". |
| Frequent actions | "Generally avoid adding motion to UI interactions that occur frequently." People should not spend "extra time paying attention to unnecessary motion every time". |
| Never block | "Let people cancel motion ... don't make people wait for an animation to complete before they can do anything." |
| Oscillation | (visionOS) avoid sustained oscillation, especially near 0.2 Hz. |

### Reduce Motion (HIG Accessibility)

Source: https://developer.apple.com/design/human-interface-guidelines/accessibility

"Be cautious with fast-moving and blinking animations." With Reduce Motion on, reduce "automatic and
repetitive animations, including zooming, scaling, and peripheral motion". Apple's list:

- Tighten springs to reduce bounce.
- Track animations directly with gestures.
- Don't animate depth (z-axis) changes.
- **Replace x, y and z transitions with fades.**
- Don't animate into and out of blurs.

SwiftUI's flag: "UI should avoid large animations, especially those that simulate the third dimension."
https://developer.apple.com/documentation/swiftui/environmentvalues/accessibilityreducemotion

Note: Apple says *replace* movement with fades. It does not say remove all animation.

### Springs and timing (SwiftUI docs + WWDC)

| Fact | Value | Source |
|---|---|---|
| Default animation (iOS 17+) | spring, response 0.55, dampingFraction 1.0 (no bounce). Before iOS 17 it was easeInOut. | https://developer.apple.com/documentation/swiftui/animation/default |
| `spring(duration:bounce:)` defaults | duration 0.5, bounce 0.0 | https://developer.apple.com/documentation/swiftui/animation/spring(duration:bounce:blendduration:) |
| `Spring(duration:bounce:)` | duration is "approximately equal to the settling duration". bounce 0 = critically damped, up to 1.0 = endless oscillation, down to -1.0 = overdamped. | https://developer.apple.com/documentation/swiftui/spring/init(duration:bounce:) |
| Presets | `.smooth` no bounce, `.snappy` "small amount of bounce", `.bouncy` "higher amount of bounce". Each has duration 0.5 and `extraBounce` 0.0 by default. The docs do not print the bounce numbers. | https://developer.apple.com/documentation/swiftui/animation/smooth , /snappy , /bouncy , /smooth(duration:extrabounce:) |
| How bounce feels | 0 "feels like a smooth, gradual change". About 15% "doesn't feel very bouncy yet, but the long tail feels a little more brisk". About 30% gives "noticeable bounciness". | WWDC23 Animate with springs, https://developer.apple.com/videos/play/wwdc2023/10158/ |
| When unsure | "Use a spring with bounce 0." Add bounce to feel playful, or "at the end of a gesture". "A spring doesn't need to bounce to make a great animation." | same |
| Tune order | Pick a duration first, then adjust bounce. | same |
| Why springs | They preserve velocity when interrupted and "naturally come to rest". | WWDC23 Explore SwiftUI animation, https://developer.apple.com/videos/play/wwdc2023/10156/ |
| Taps don't bounce | "We recommend starting with 100% damping." Now Playing opens on a tap with 100% damping because "the tap doesn't have any momentum". Swipe to dismiss uses 80% damping. | WWDC18 Designing Fluid Interfaces, https://developer.apple.com/videos/play/wwdc2018/803/ |
| No delays | "Look for delays everywhere. Everything needs to respond instantly." Be mindful of "latencies or timers". | same |
| Interruptible | Interfaces should allow "constant redirection and interruption". | same |

### apple.com web CSS (measured)

Counted in `globalheader.css`, `ac-localnav.built.css`, `main.built.css` downloaded from apple.com today.

| Easing | Uses | Typical use |
|---|---|---|
| `cubic-bezier(0.4, 0, 0.6, 1)` | 122 | nav menus, color, opacity, height; 0.24s to 0.32s |
| `cubic-bezier(0.25, 0.1, 0.3, 1)` | 13 | transform, width, padding; 0.3s |
| `cubic-bezier(0.28, 0.11, 0.32, 1)` | 8 | background, color; 0.24s |

Token: `--r-globalnav-duration-medium: .24s`. Durations seen: 20ms (link color), 0.24s, 0.3s, 0.32s,
with delays of 0.08s to 0.24s on menu reveals. No overshoot curve anywhere.

### Onboarding (HIG)

Source: https://developer.apple.com/design/human-interface-guidelines/onboarding

- Ideally people learn by using the app. If onboarding is needed, make it "fast, fun, and optional".
- "Teach through interactivity." Prefer context tips near the UI (TipKit) over one long flow.
- A required flow should be "brief" and not make people "memorize a lot".
- A tutorial should be optional. If skipped, "don't present it again", but keep it "easy for people to find" later (help, account or settings).
- Splash: "just long enough for people to absorb the information at a glance".
- "Postpone nonessential setup flows or customization steps. Provide reasonable default settings so most people can immediately start."
- Permissions: ask during onboarding only if the app needs them to function. "Otherwise, present a permission request when people first access the specific function."

### Launching, Loading, Feedback, Progress (HIG)

| Page | Rule |
|---|---|
| [Launching](https://developer.apple.com/design/human-interface-guidelines/launching) | "Launch instantly." People "don't want to wait more than a couple of seconds". Restore previous state. Onboarding comes after launch. |
| [Loading](https://developer.apple.com/design/human-interface-guidelines/loading) | "Show something as soon as possible." Let people do other things while content loads. |
| [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) | Match the feedback to its importance. Status can be passive. Confirm only significant actions; people "only need to know when it doesn't" succeed. |
| [Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) | Prefer determinate. Even out the pace. "Keep progress indicators moving", since a still one looks frozen. Avoid vague words like "loading". Let people cancel when safe. |

### "What's New" sheet

Not found in Apple's current primary sources. The HIG Onboarding page has no What's New section, and a
search of developer.apple.com found only a changelog of the guidelines themselves. The "title, three
rows of icon + title + one line, one Continue button" layout is a convention seen in Apple's own apps
and in community write-ups, not a documented rule. Treat it as a pattern, not a citation.

---

## Part 2. Cluster today

### First-run flow, step by step

| # | Screen | What it shows | Code |
|---|---|---|---|
| 0 | Connect gate | Logo. "Calm your inbox". "Clean up, sort and protect your mail. Connect Gmail to start." Button "Continue with Gmail". Testing note. Trust line "Cluster reads senders, subjects and dates on this computer and moves nothing until you say so." Right: NASA photo with a glass card of 3 rows (Clean up, Sort, Protect, each with one line). Returning users see "Welcome back" / "Sign in with Gmail". | `src/dashboard/index.html:181-209`, `src/dashboard/dashboard.ts:430-490` |
| - | Routing | After sign-in, setup opens if `setupDone` is false. | `dashboard.ts:380-381` |
| 1 | Setup frame | Full-screen overlay. Left: logo, "I'll set it up myself", 4 progress dots. Right: photo, Kai (64px) with a typing bubble and a voice button, and a "Your Cluster" card that adds a row per answer. | `setupTab.ts:207-229`, `468-506`; CSS `dashboard.css:1963-2162` |
| 2 | Who | "What describes you?" 4 options: Just me, I run a business, Keep me safe, Lots of people email me. Continue is disabled until one is picked. Back, Skip, Continue. Kai: "Hi, I'm Kai. Let's set up Cluster." plus a wave. | `setupTab.ts:300-321`, `62-68`, `491-494` |
| 3 | Keep | "What should always stay?" 5 toggles. "People you write to" is locked with "Always on". Kai: "What should always stay?" | `setupTab.ts:323-347` |
| 4 | Hands | "How hands-on?" Ask me first / Tidy for me, each with one line. Kai: "Should I wait for you?" | `setupTab.ts:349-377` |
| 5 | Plan | "Here's your plan". 3 to 4 rows. If the mailbox is over 20,000, a "You have N emails" choice: Newest 20,000 or All. Kai: "Nothing changes until you press Start." | `setupTab.ts:379-465`, `src/lib/onboardingPlan.ts:64-87` |
| 6 | Start | Asks for the notifications permission on the click, shows "Setting up…", saves, shows "All set", Kai says "All set. I'm reading your mail now.", waits 1.1s, opens Overview. | `setupTab.ts:433-458` |

Skip behaviour:

- Per-step **Skip** just goes to the next step with the answers unchanged (`setupTab.ts:288`). On Keep, Skip does the same as Continue, since Continue is always enabled there (`setupTab.ts:346`).
- **I'll set it up myself** stops Kai, sets `setupDone: true` and opens Overview. No plan is applied, so the stored defaults stay (`setupTab.ts:508-512`).
- There is no way back into setup later. A test checks that `settings-change-setup` does not exist (`src/dashboard/setup.dom.test.ts:81`). The file header says setup reopens "after sign-out", but `signOut` does not reset `setupDone`, and `setupDone` is a synced key (`settingsMore.ts:162-180`, `settingsStore.ts:583`).

Findings in the flow:

- **"What describes you?" changes nothing the user can see.** All four `SEEDS` are identical (`onboardingPlan.ts:31-36`). The answer only sets `persona`, and no code reads `persona` (grep: only `setupTab.ts:170` writes it). Scam holding follows "Tidy for me", not "Keep me safe" (`onboardingPlan.ts:87`).
- **Kai repeats the title.** On Keep, the bubble and the heading both say "What should always stay?" (`setupTab.ts:64`, `325`). On Hands the same question has two wordings: "Should I wait for you?" and "How hands-on?".
- **Five screens before the dashboard**: connect, then 4 setup steps.
- Good already: the notifications permission is asked on the Start click, in context (`setupTab.ts:435`). Answers are kept in `settings.onboarding`. Nothing changes until Start.

### Animation inventory

Shared spring token: `.onb { --spring: cubic-bezier(0.34, 1.56, 0.64, 1) }` (`dashboard.css:1964`).
Its curve peaks at about 1.10, so it overshoots by about 10%. That is more than Apple's 30% "noticeable" bounce, which overshoots by about 4.6%.

**Setup and connect**

| Line | Selector | Duration, easing | Animates |
|---|---|---|---|
| 1287 | `.connect-glass` | 0.8s, delay 0.3s, `ease` | rise 14px + fade (`connect-rise`) |
| 1214 | `.connect-btn` | 0.12s / 0.15s | press scale 0.985, hover opacity |
| 2002 | `.onb-dots i` | 0.35s `--spring` | width 8 to 28px |
| 2006-2009 | `.onb-in > *` | 0.45s `ease`, stagger 0/40/80/120ms | rise 10px + fade |
| 2012-2016 | `.onb-in .onb-opt` | 0.4s, stagger up to 280ms | rise 10px + fade |
| 2028, 2031 | `.onb-opt` hover | 0.2s `--spring` | lift 1px, shadow 0 6px 18px |
| 2032 | `.onb-opt:active` | same | scale 0.98 |
| 2035 | `.onb-opt.picked .onb-ic` | 0.4s `--spring` | scale 1.12 + rotate -6deg (`onb-nudge`) |
| 2054-2055 | `.onb-chk` | 0.35s `--spring`; 0.2s draw after 0.1s | scale 0.6 to 1, tick draws |
| 2060 | `.onb-plan li` | 0.45s, delay 150ms + 90ms each | rise + fade |
| 2068-2069 | `.onb-btn` | 0.2s `--spring` | press scale 0.96 |
| 2072 | `.onb-btn.dark.ready` | 0.5s `--spring` | lift 3px + scale 1.04 when Continue unlocks, every step |
| 2106 | `.onb-bubble.pop` | 0.35s `--spring` | scale 0.85 to 1 + fade |
| 2143 | `.onb-card-list li.new` | 0.45s `--spring` | rise + fade |
| JS | `kaiNarrator.say` | 2 chars per 22ms | bubble types out (skipped with reduced motion) | 
| JS | `startPlan` then `setTimeout(1100)` | 1.1s | waits before Overview opens (`setupTab.ts:449`) |

**Dashboard**

| Line | Selector | Duration, easing | Animates |
|---|---|---|---|
| 261, 407, 451, 614, 724, 826 | `button`, `.icon-btn`, rows, `.check` | 0.18s `ease` | background, border |
| 760 | `.logo-mono` | 0.12s | opacity |
| 917, 937 | `.switch`, knob | 0.22s; `cubic-bezier(0.4,0,0.2,1)` | background; knob `left` |
| 1749, 1761, 4341 | `input.switch`, knob | 0.15s; later 0.2s `cubic-bezier(.3,.7,.4,1)` | background; knob transform |
| 2598 | `.nav-icon *` | 0.38s `cubic-bezier(0.34,1.56,0.64,1)` | hover: door, lid, lines move; tick draws 0.5s (`ni-draw`) |
| 2687 | `.kg-tag` (Ask Kai bubble) | 0.22s opacity, 0.32s `cubic-bezier(.2,.9,.3,1.2)`, width 0.3s | scale 0.85 + 6px rise |
| 2706 | `.kg-panel` | 0.4s `cubic-bezier(.2,.9,.25,1.05)` | open from scale 0.6 |
| 2718 | `.kg-panel::before` | 1.6s linear, infinite | light runs round the edge while Kai thinks |
| 2731, 2741, 3579 | `.kg-msg`, `.kai-list`, `#ask-kai-open::after` | 0.3s `cubic-bezier(.2,.8,.2,1)` | rise 8px + fade |
| 2734 | `.kg-msg.typing i` | 1s infinite | typing dots |
| 2748 | `.kai-here` | 2.6s | outline fades in and out on the target |
| 3428 | `.kai-guide` | 0.2s | `right` when Details opens |
| 3438, 4345 | `.btn`, `.chip`, `.tool` | 0.2s bg, 0.12s transform | press scale 0.97 |
| 3482 | `.scam-chev` | 0.15s | rotate |
| 3511 | `.read-track i` | 0.4s linear | progress width |
| 3629, 3742, 3747, 4349, 4356 | rows, `.ov-go` | 0.15s | background, arrow opacity |
| 4170 | `.sort-ring` | 0.6s `cubic-bezier(.2,.7,.2,1)` | ring fill `--p` |
| 4196 | `.sort-preview-bucket.active > summary > i` | 1.2s infinite | `scan-pulse` box-shadow |
| 4220, 4228 | `.sort-ring.is-looking::after`, active row | 1.6s / 0.9s linear infinite | spinner arc |
| 4224 | `.sort-check path` | 0.5s ease-out, delay 0.2s | check draws once |
| 4226-4238 | sort rows, `.sort-choice` | 0.2s to 0.3s | color, border |
| `kai/kai.css:37-49` | Kai face, blush | 0.5s to 0.6s | filter, opacity |
| `kai/kaiLife.js:262-272` | Kai | rAF loop, stops when settled in calm mode; off with reduced motion | blink, glance, talk |
| `kai/kaiLife.js:338-350` | `emote` | 1.4s WAAPI | floating emoji; off with reduced motion |

Screens swap instantly (`dashboard.ts:212-222`). No View Transitions anywhere.

### Reduced-motion handling

| Where | What it does |
|---|---|
| `dashboard.css:329-334` | `* { transition: none !important; animation: none !important; }` kills everything, fades included. |
| `1323`, `2155`, `2651`, `2750`, `4211`, `4245`, `kai.css:74` | Per-feature rules. Mostly redundant under the global rule. `4247` correctly leaves the check drawn. |
| `setupTab.ts:74`, `kaiGuide.ts:95-96,124`, `kaiLife.js:28` | JS checks: no typing, no smooth scroll, Kai holds still. |

Gaps:

1. **Spinners stop.** The global rule freezes `sort-turn` (4220, 4228). Apple: a still indicator reads as "stalled".
2. **Fades are removed too.** Apple says to swap movement for fades, not to remove them, so panels and the bubble now pop in hard.
3. **`subscriptionsTab.ts:369`** scrolls with `behavior: "smooth"` and never checks reduced motion. CSS can't stop that.
4. **`.kai-here`** outline still shows. That is fine, since the global rule removes only the fade.

---

## Part 3. Comparison and changes

### Side by side

| Point | Apple | Cluster | Match? |
|---|---|---|---|
| Default curve | Spring with no bounce (0.55 response, damping 1.0) | `--spring` overshoots ~10% on taps | No |
| Taps | 100% damping, no overshoot | Bounce on option tap, check, Continue, bubble | No |
| Frequent actions | Avoid extra motion | Icon nudge + rotate on every pick, Continue lifts on every step, hover lift on options | No |
| Web durations | 0.24s to 0.32s | Mostly 0.15s to 0.2s (good); setup 0.35s to 0.8s, with delays up to 0.3s | Partly |
| Easing | `cubic-bezier(.4,0,.6,1)` family | `ease`, 6 different custom curves | Partly |
| Waiting on motion | Never | 1.1s timer after Start; up to ~0.7s before the last option settles | No |
| Progress | Determinate, even pace, keeps moving | Sort ring fill + check (good); spinner freezes under reduced motion | Mostly |
| Reduce Motion | Fades replace movement | Everything off | No |
| Onboarding length | Brief, optional, defaults | 4 steps, skippable | Close |
| Each question matters | Postpone nonessential setup | "What describes you?" changes nothing | No |
| Permissions | When first needed | Notifications on Start | Yes |
| Find it later | Easy to find in settings | No way back in (deliberate per test) | No |
| Narrator | Not an Apple pattern; tips near the UI | Kai line repeats the title | Trim |

### Changes, in order

#### 1. One set of motion tokens, with no overshoot by default

**Why.** Apple's default is a spring with no bounce, and taps should not overshoot (SwiftUI `default`, WWDC18 803, WWDC23 10158). apple.com uses one easing family.

**What.** Add these to `:root` in `src/dashboard/dashboard.css`. The `linear()` values are sampled from Apple's spring formula (bounce 0 and bounce 0.15, duration = perceptual duration). CSS `linear()` needs Chrome 113 or later. If it is unsupported, the browser drops the declaration and the change just happens without animation.

```css
:root {
  --ease: cubic-bezier(0.4, 0, 0.6, 1);         /* apple.com nav, color, opacity */
  --ease-out: cubic-bezier(0.25, 0.1, 0.3, 1);  /* apple.com transform, width */
  /* Apple spring, bounce 0 (SwiftUI .smooth / default feel) */
  --spring-smooth: linear(0, 0.06, 0.186, 0.329, 0.466, 0.584, 0.682, 0.76, 0.821, 0.868, 0.903, 0.929, 0.949, 0.963, 0.973, 0.981, 1);
  /* Apple spring, bounce 0.15 ("a little more brisk"), peaks at 1.006 */
  --spring-snappy: linear(0, 0.062, 0.198, 0.356, 0.509, 0.642, 0.75, 0.833, 0.895, 0.938, 0.967, 0.985, 0.996, 1.003, 1.005, 1.006, 1);
  --t-fast: 0.2s;   /* hover, press, color */
  --t: 0.3s;        /* enter, open */
  --t-slow: 0.5s;   /* SwiftUI default duration; ring fills, big panels */
}
```

Then:

- Set `.onb { --spring: var(--spring-snappy) }` at `1964`. Every setup use (2002, 2028, 2035, 2054, 2068, 2072, 2106, 2143) loses its overshoot in one line.
- `.nav-icon *` at `2598`: `transform var(--t) var(--spring-smooth)`.
- `.kg-tag` at `2687`: `transform .3s var(--spring-snappy)` in place of `(.2,.9,.3,1.2)`.
- `.kg-panel` at `2706`: `kg-open var(--t) var(--spring-smooth)`, and start the open from `scale(.92)` instead of `.6`, so it feels like a sheet rather than a pop.
- Switch knobs at `937` and `4341`: `var(--t-fast) var(--spring-smooth)`, one curve for both.
- Plain color and background transitions can keep `ease`. Optional: swap to `var(--ease)`.

#### 2. Calm the setup entrance and cut waits

**Why.** "Launch instantly", "show something as soon as possible", "don't make people wait for an animation" (HIG Launching, Loading, Motion). Look for "timers" (WWDC18).

| Where | Now | Change to |
|---|---|---|
| `1287` `.connect-glass` | 0.8s, delay 0.3s | `connect-rise var(--t-slow) var(--ease-out) both`, no delay; rise 8px |
| `2006-2009` `.onb-in > *` | 0.45s, stagger to 120ms | `onb-rise var(--t) var(--ease-out) both`; delays 0, 30ms, 60ms |
| `2012-2016` options | 0.4s, stagger to 280ms | delete these lines; options arrive with their group |
| `2060` plan rows | 150ms + 90ms each | `calc(var(--i, 0) * 40ms)` delay, `var(--t)` |
| `2147` `onb-rise` | `translateY(10px)` | `translateY(6px)` |
| `setupTab.ts:449` | waits 1100ms | 400ms, so "All set" shows but you aren't kept waiting |

#### 3. Remove decorative motion on frequent actions

**Why.** "Avoid adding motion to UI interactions that occur frequently" and "brevity and precision" (HIG Motion). This also matches the user's earlier "calm motion" choice.

- Delete `onb-nudge` (`2035`, `2151`). The icon already turns accent-colored when picked (`3583`).
- Delete `.onb-btn.dark.ready` lift (`2072`, `2152`) and the `ready` logic at `setupTab.ts:291-293`. Changing from disabled to enabled is signal enough.
- `.onb-opt:hover` (`2031`): keep only `border-color`. Drop the 1px lift and the shadow.
- `onb-pop` (`2149`): start at `scale(0.8)`, not `0.6`, with `var(--spring-snappy)`.
- Keep: press scale (0.96 to 0.98), the tick drawing, the card rows rising in, the dots width.

#### 4. Reduce Motion the Apple way

**Why.** Replace x, y and z movement with fades, tighten springs, keep progress moving (HIG Accessibility, Progress indicators).

Replace `dashboard.css:329-334` with:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.2s !important;
    animation-delay: 0s !important;
    transition-duration: 0.2s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
  /* Movement becomes a fade. */
  @keyframes onb-rise { from { opacity: 0; } }
  @keyframes connect-rise { from { opacity: 0; } }
  @keyframes kg-in { from { opacity: 0; } }
  @keyframes kg-open { from { opacity: 0; } }
  @keyframes onb-bubble { from { opacity: 0; } }
  .onb-opt:active, .onb-btn:active, .btn:active, .chip:active, .tool:active, .connect-btn:active { transform: none; }
  /* Spinners keep turning, slowly, so work never looks stalled. */
  .sort-ring.is-looking::after, .sort-preview-bucket.active > i { animation-duration: 2.4s !important; }
}
```

- Then delete the per-feature duplicates at `1323`, `2155`, and the spinner lines in `4211` and `4246`. Keep `4247`, which leaves the check drawn, and `2651`, which leaves nav icons still.
- Check `@keyframes` overrides inside the media query in Chrome before relying on them. If they fail, add `animation-name: onb-fade` on those selectors instead. `onb-fade` already exists at `2148`.
- `src/dashboard/subscriptionsTab.ts:369`: use `behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"`, like `kaiGuide.ts:95-96`.
- Infinite animations that remain (`kg-sweep` 2718, typing dots 2734, `scan-pulse` 4196) should stay off under reduced motion, as their own rules already say.

#### 5. Make every setup question count, or drop it

**Why.** "Postpone nonessential setup ... Provide reasonable default settings" (HIG Onboarding). Today "What describes you?" has no effect (`onboardingPlan.ts:31-36`, and `persona` is never read).

Option A, the smaller change: remove the Who step. Setup becomes Keep, Hands, Plan (3 dots). Files: `setupTab.ts` (STEPS at 58-59, `renderWho`, KAI_LINES, the card's Who row at 471), `onboardingPlan.ts` (SEEDS, PERSONA_OF), and `setup.dom.test.ts` (which clicks `[data-who=…]` and checks `persona`).
Option B: keep it, but make it seed something real. For example, "Keep me safe" could pick "Ask me first" and turn Strict on. This is a product decision, so ask the user.

#### 6. Kai says something the title doesn't

**Why.** Apple's narrators don't exist. Its rule is short tips near the UI, with nothing to memorize. The bubble currently repeats the heading.

| Step | Title | Kai now | Kai suggested |
|---|---|---|---|
| Who | What describes you? | Hi, I'm Kai. Let's set up Cluster. | keep |
| Keep | What should always stay? | What should always stay? | Everything else gets a label. |
| Hands | How hands-on? | Should I wait for you? | You can undo anything. |
| Plan | Here's your plan | Nothing changes until you press Start. | keep |

File: `setupTab.ts:62-68`. Test: `setup.dom.test.ts:51` expects the Keep line to contain "always stay", so update it.

#### 7. One kind of skip

**Why.** Onboarding should be "optional" with one clear way out (HIG Onboarding). Today there is a top "I'll set it up myself" plus a per-step "Skip". On Keep, that Skip equals Continue.

- Show per-step Skip only while Continue is disabled (Who, Hands). File: `setupTab.ts:288`, using `if (STEPS[at] !== "plan" && !canGo)`.
- Keep "I'll set it up myself" as the single exit.

#### 8. A way back into setup (ask first)

**Why.** If people skip it, keep it "easy for people to find if they want to view it later" (HIG Onboarding). Today it can't be reopened, and the file header comment is wrong about sign-out.

- Either add one Settings row "Set up again" that opens `setup` with the saved answers. The code already keeps them (`freshAnswers`, `setupTab.ts:158-163`). This reverses the test at `setup.dom.test.ts:81`, so it is the user's call.
- Or just fix the header comment at `setupTab.ts:1`.

#### 9. Keep what already matches

- The sort ring's determinate fill, the check that draws once, and the even 0.4s linear `read-track` match Apple's progress guidance.
- The notifications permission asked on Start matches "ask when first needed".
- The connect card's 3 rows (Clean up, Sort, Protect, each title + one line) already follow the What's New convention. No change needed.
- Instant screen swaps fit "avoid motion on frequent actions". Don't add page transitions.

---

## Sources

Read:

- HIG Motion https://developer.apple.com/design/human-interface-guidelines/motion
- HIG Onboarding https://developer.apple.com/design/human-interface-guidelines/onboarding
- HIG Launching https://developer.apple.com/design/human-interface-guidelines/launching
- HIG Loading https://developer.apple.com/design/human-interface-guidelines/loading
- HIG Feedback https://developer.apple.com/design/human-interface-guidelines/feedback
- HIG Progress indicators https://developer.apple.com/design/human-interface-guidelines/progress-indicators
- HIG Accessibility (Motion section) https://developer.apple.com/design/human-interface-guidelines/accessibility
- SwiftUI `Animation.default`, `spring(duration:bounce:blendDuration:)`, `smooth`, `snappy`, `bouncy`, `smooth(duration:extraBounce:)`, `Spring.init(duration:bounce:)`, `accessibilityReduceMotion` under https://developer.apple.com/documentation/swiftui/
- WWDC23 Animate with springs https://developer.apple.com/videos/play/wwdc2023/10158/
- WWDC23 Explore SwiftUI animation https://developer.apple.com/videos/play/wwdc2023/10156/
- WWDC18 Designing Fluid Interfaces https://developer.apple.com/videos/play/wwdc2018/803/
- apple.com CSS: `/api-www/global-elements/global-header/v1/assets/globalheader.css`, `/ac/localnav/9/styles/ac-localnav.built.css`, `/v/homepage/a/styles/main.built.css`

Not reached or not found:

- "Design with SwiftUI" (WWDC23) and "The craft of SwiftUI": not read, so nothing here relies on them.
- The exact bounce numbers of `.snappy` and `.bouncy` are not printed in Apple's docs. The 15% and 30% figures are WWDC23's examples of how bounce feels, not the preset values.
- No Apple primary source for a "What's New" sheet layout.
