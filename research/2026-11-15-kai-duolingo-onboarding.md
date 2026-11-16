# Kai like Duo: onboarding, motion and label emoji (2026-11-15)

Branch `feat/ui-polish-2026-11`. Research only, no code changed.

The ask: setup over-explains, barely moves, and Kai should work like Duolingo's Duo. Duo explains things, moves around and makes setup feel interactive. Labels should show their own emoji (🎓 💳 🧳 …), not generic Lucide icons.

One tension up front: this morning's `2026-11-15-animation-onboarding-apple.md` made setup calmer. This plan keeps that calm. The new motion is **Kai's body and face**: hops, gaze, antenna, nods. It adds no glows, pings, confetti or bouncing UI.

---

## Part 1. Duolingo

### Sources

| Source | Kind | Read? |
|---|---|---|
| [blog.duolingo.com/world-character-visemes](https://blog.duolingo.com/world-character-visemes) | Primary (Duolingo) | Yes |
| [blog.duolingo.com/reshaping-duo](https://blog.duolingo.com/reshaping-duo/) | Primary | Yes |
| [blog.duolingo.com/streak-milestone-design-animation](https://blog.duolingo.com/streak-milestone-design-animation) | Primary | Yes |
| [blog.duolingo.com/widget-feature](https://blog.duolingo.com/widget-feature/) | Primary | Yes |
| [blog.duolingo.com/hub/design](https://blog.duolingo.com/hub/design/) (design.duolingo.com redirects here) | Primary index | Yes. It lists 4 posts, none on onboarding |
| [rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life](https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life) | Vendor case study | **Could not be read** (fetch blocked). Search snippets only |
| [rive.app/blog/rive-as-a-lottie-alternative](https://rive.app/blog/rive-as-a-lottie-alternative) | Vendor | Snippet only |
| [growth.design/case-studies/duolingo-user-retention](https://growth.design/case-studies/duolingo-user-retention) | Secondary teardown | Yes |
| [goodux.appcues.com/blog/duolingo-user-onboarding](https://goodux.appcues.com/blog/duolingo-user-onboarding) | Secondary | Yes |
| [screensdesign.com/articles/duolingo-onboarding-design](https://screensdesign.com/articles/duolingo-onboarding-design/) | Secondary screen catalog, undated | Yes |
| [taplytics.com/blog/duolingo-ab-test-onboarding](https://taplytics.com/blog/duolingo-ab-test-onboarding) | Secondary, quotes a First Round interview | Snippet only. The original First Round piece was not found |
| [uxdesign.cc "Duolingo diaries" onboarding review](https://uxdesign.cc/the-duolingo-diaries-an-honest-ux-review-part-1-onboarding-ed0165d44c58) | Secondary | **Could not be read** (403) |
| [developer.chrome.com MV3 CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) | Primary (Chrome) | Snippet only |

I found **no Duolingo-authored post about onboarding itself**. Everything below about the onboarding flow comes from secondary sources and is marked **[2nd]**.

### What Duolingo says itself (primary)

- **Characters run on Rive state machines.** "Rive's State Machine" links states and "lets code control which states play… how they transition and blend." Each character has body pose states plus **separate mouth states that run at the same time**. The whole thing is "exported from Rive into a single runtime file" and handed to engineers. (visemes post)
- **Lip sync is timing data, not video.** Speech goes through Duolingo's speech models to get word and phoneme timings. Those become viseme timings, which "trigger the animation state machine" in time with the audio. They have 20+ mouths per character, and they send timings because that is "much less than sending down a little movie." (visemes post)
- **There are three character states in lessons.** In **talk**, the character speaks and animates the word you tap, and stops if the exercise ends early. In **idle**, it nods, blinks and moves its eyebrows. In **outcome**, it reacts to a right or wrong answer. (visemes post)
- **Silhouette first.** On Duo's redesign: "if the overall shape is not appealing, then the details within that shape can't compliment it successfully." Movement was added once the shape was settled. (reshaping-duo)
- **Timing is the craft.** "Timing is everything in animation." They made several rough passes before refining rhythm and energy. Big celebrations are kept for **milestone days** (1 week, 1 month, 100 days, 1 year), not every day. An earlier balloon version was "cute, but not quite celebratory enough." (streak milestone post)
- **Mood tells you your state at a glance.** On the widget, Duo looks more worried as the streak nears its deadline and relaxed once you practice. Research found the simple display (streak plus at-risk) was "hugely valuable," so they kept extra stats out. They also worried it would feel like "an extra layer of notifications." (widget post)

### What teardowns say (secondary) [2nd]

- **Learn by doing before sign-up.** Third-party breakdowns say the first lesson happens before any account, and sign-up comes after as "save your progress." Taplytics, quoting a First Round interview with growth lead Gina Gotthilf, credits moving sign-up a few steps later with roughly **+20% DAU**. I could not verify that number at the source.
- **Duo speaks one line per screen in a speech bubble.** Screensdesign's catalog shows a bubble reading "Just 7 quick questions before we start your first lesson!" It sets the cost up front and promises the reward. The same catalog shows a **progress bar at the top** of each question screen, and a transition screen where Duo reads on a stack of books while content loads.
- **Flow order:** welcome from Duo, language, goal, "Why are you learning?", level, placement test, then the path. Appcues notes Duo "waves and encourages," with "animated progress bars and circles throughout."
- **Motivation hooks** (Growth.Design): daily goal, then streak. The Zeigarnik effect ("people remember uncompleted tasks better") explains progress bars. Completion feedback ("…aaaand done!"). One-tap start (Hick's law). They filter their own notifications to avoid annoyance. Sessions end with a feeling of completion, not an endless list.
- **Criticism** (Growth.Design, Appcues): Duo's copy sometimes **guilt-trips or shames**. Cluster's Kai guide already bans that ("Never: Guilt-trip").

### Sound and haptics

No Duolingo primary source on sound or haptics was found. Secondary sources only say sound cues reinforce the habit. The app itself plays a chime on right answers and a lower tone on wrong ones, with haptics on phones. That is commonly observed but **unverified here**. For Cluster: desktop has no haptics, and the user prefers calm, so sound stays off by default. Kai's voice toggle already exists.

### What Duolingo avoids, and what Cluster should take

| Duolingo does | Take it? |
|---|---|
| One short bubble line per screen, from the character | Yes |
| Character reacts to each answer | Yes (nod, tilt, gaze) |
| Celebrate milestones only | Yes. Once, when labels are made, and once at first sorted inbox |
| Product before account | Partly. Gmail sign-in is needed, but setup can use the user's **real** mail before Start changes anything |
| Progress bar on top | Cluster already has dots. Keep them |
| Guilt, panic moods, streak pressure | **No** (Kai guide bans it) |
| Confetti and big full-screen celebrations | **No** (user rejected flashy motion) |
| Sound by default | **No**. Voice stays opt-in |

---

## Part 2. Cluster today

### What Kai can do vs what setup uses

The engine is `src/dashboard/kai/kaiLife.js`, a copy of the portfolio's, with types in `kaiLife.d.ts`. Kai is a front-facing robot head with an antenna: two images (`public/characters/kai-body.w{160,320,640}.webp` and `kai-antenna.*`) plus a live SVG face. There are **no arms or legs**, so pointing is gaze plus an antenna lean.

| Capability | API | Used in setup? |
|---|---|---|
| 15 moods (neutral, happy, joyful, curious, thinking, focused, surprised, scared, sad, shy, sleepy, asleep, proud, suspicious, worried) | `setMood(m, ms)` | Only `proud` on plan and `happy` at done |
| 25 actions: blink, wink, hop, nod, shake, tilt, wave, wiggle, stretch, yawn, startle, celebrate, lookAround, shy, glitch, dizzy, nodSmall, shrug, peek, point, relief, puff, bye, lookAway, squint | `do(name)` (queue of 2) | Only `wave`, once |
| Talking mouth (3-bar mouth animates) | `talk(ms)` | Yes, with each line |
| Look at the pointer or an element | `lookAt(el or xy)` | No |
| Glance plus antenna lean toward an element | `pointAt(el)` | No |
| Thinking face (mouth "types") | `think(true)` | No |
| Antenna light | `lightAntenna(ms)` | No |
| Floating emote text (`!`, `✦`, `?`, any string, so an emoji works) | `emote(text)`, private but on the instance | No |
| Bundled reactions | `react("found" / "miss" / "hello" / "joke")` | No |
| Self-driven brain (pointer follow, fidgets, sleep) | `{ auto: true }` | No (setup uses `calm: true`) |
| Reduced motion | Built in: actions collapse to the mood, no emotes, no blinks | Yes, automatic |

Setup (`setupTab.ts`, `kaiNarrator`) uses a **64px** Kai (`.onb-kai` in `dashboard.css:2088`) next to a typing bubble, with an optional local-voice button. Kai never moves, points or reacts to a pick.

**The in-app guide** (`kaiGuide.ts` plus `kai/kaiWatch.js`) already has Duo-style parts:
- A bubble tag above Kai ("Ask Kai" once a day, "Welcome back." on a later day).
- Stuck detection (rage or dead clicks, loops, switch flipping). Caps: one per screen, 60 s apart, 3 per visit, quiet after 2 ignored, never while typing.
- `pointAt(doc, selector, kai)`: scrolls, Kai glances and leans, then a `.kai-here` ring outlines the control for 2.6 s.
- Reactions to real events: `celebrate` + "All sorted." on a sort action, `bye` after unsubscribes, `nodSmall` + "Undone." on undo, `squint` on the impersonation screen, `nodSmall` once per changed control, `tip(text)` for a 9 s one-liner.
- **No tours, no first-visit lines per page, no empty-state lines.** `tip()` has no callers outside kaiGuide.

### Label icons today: every place a label shows without its emoji

The emoji names live in `src/lib/clusterLabels.ts` (`CLUSTER_LABELS`): `🔑 One-time codes`, `🧾 Receipts`, `📦 Orders & shipping`, `📰 Newsletters`, `💬 Social`, `🏷 Promotions`, `🛍 Shopping`, `🧳 Travel`, `💳 Finance`, `💼 Work`, `🎓 Education`, `🔐 Accounts`, `📋 Jobs`, `👤 Personal`, `🔇 Muted`, `✋ Screener`, `💤 Snoozed`, `🚨 Possible phishing`, `📖 Read later`, `⏰ No reply yet`, `📭 Unsubscribed`. They reach buckets through `sortTaxonomy.ts` (`SORT_BUCKET_LABELS`) and `categoryFilters.ts` (`categoryLabelName`, which honors the user's `labelChoices` renames).

| Where | File:line | Shows now |
|---|---|---|
| Labels page (Organize rows) | `timeLimitsTab.ts:189-196` | Emoji stripped (`/^\S+\s/`), then Gmail color tag + **Lucide `BUCKET_ICON`** + name |
| `BUCKET_ICON` map (13 buckets → key, receipt, package, news, users, tag, bag, plane, card, briefcase, cap, shield-check, user) | `timeLimitsTab.ts:69-83` | Lucide names |
| Overview "This week" rows | `dashboard.ts:1557-1563` → `homeDashboard.ts:733-737` | Color tag + Lucide icon + stripped name |
| Scan card rows | `dashboard.ts:889-895` → `homeDashboard.ts:558` | Color tag + stripped name (icon passed but unused) |
| Details "Label as" picker | `dashboard.ts:2051` → `detailsPanel.ts:598` | Stripped name in `<option>` |
| "Labelled N as X" toast and log | `dashboard.ts:2078` | Stripped name |
| "Learned from Gmail" activity line | `inboxTimeLimitsRunner.ts:536` | Stripped name |
| Sort inbox report rows | `sortInbox.ts:56` (`plainLabel`), `:507`, `:589` | Color tag + stripped name |
| Sort inbox ring center | `sortInbox.ts:233, 240, 275` | Generic gray tag |
| Setup "always stay" options | `setupTab.ts` `renderKeep` | Lucide on tinted squircle (landmark, briefcase, plane, receipt, message) |
| Setup plan rows and card | `onboardingPlan.ts` `lines[].icon` | Lucide (tag, clock, shield-check, inbox, sparkles, eye) |

`gmailLabelIcon(color)` (`homeDashboard.ts:480`) is the Material tag filled in the label's Gmail color (`CLUSTER_LABEL_COLORS`, 13 buckets). Personal, Screener, Muted, phishing and the others have no color.

**Rendering catch:** names are saved **without U+FE0F** on purpose (`clusterLabels.ts:8-9`). `🏷` (U+1F3F7) and `🛍` (U+1F6CD) are text-default characters, so Windows may draw them as flat black glyphs. When displaying (never in the saved name), append `️` or render them in an emoji font span. Check on Windows Chrome.

### Setup copy, word for word

✂ = over-explains or repeats something shown elsewhere. ✓ = keep.

**Frame**
- ✓ Skip link: "I'll set it up myself"
- ✓ Card title: "Your Cluster"
- ✂ Card empty: "Your answers build your plan here." (the card filling in shows this already)
- Voice button label: "Hear Kai"

**Step 1 (keep)**
- ✓ Title: "What should always stay?"
- ✂ Kai: "Hi, I'm Kai. Everything else gets a label." (two ideas in one bubble. The hello is fine, the rule belongs to Kai's reaction)
- Options: ✓ "Bank and bills", ✓ "Work", ✓ "Travel", ✓ "Receipts and orders", "People you write to" with sub ✂ "Always on" (the lock already shows it)

**Step 2 (hands)**
- ✓ Title: "How hands-on?"
- ✂ Kai: "You can undo anything." (reassurance before any choice)
- "Ask me first", sub ✂ "Nothing moves until you say so" (it restates the option)
- "Tidy for me", sub ✓ "New mail sorts itself"

**Step 3 (plan)**
- ✓ Title: "Here's your plan"
- ✂ Kai: "Nothing changes until you press Start." (third reassurance in three screens)
- Plan rows (`onboardingPlan.ts`):
  - "Promotions and newsletters skip your inbox", sub ✂ "They wait in their labels"
  - ✓ "Other mail goes to its label after an hour"
  - "Likely scams are held out of your inbox", sub ✂ "Each one says why"
  - "Always stays: {list}"
  - "New mail sorts itself", sub ✂ "Undo anything in Activity"
  - Ask mode: "Nothing moves until you press Sort my inbox"
- ✂ The plan list **duplicates** the "Your Cluster" card on the same screen (`art.is-plan`).
- Big mailbox: "You have {N} emails", options "Newest 20,000" / "All {N}" with read time
- Buttons: "Back", "Continue", "Start", "Setting up…", "All set", "Try again"
- Kai at done: "All set. I'm reading your mail now." Kai if filters failed: "Saved. Turn on the filters in Labels."

**Connect gate before setup** (`index.html:181-209`): "Calm your inbox" / "Clean up, sort and protect your mail. Connect Gmail to start." / testing note / ✂ trust line plus ✂ a 3-row glass card (Clean up, Sort, Protect). That is four blocks of words before one button.

---

## Part 3. Plan

### Storyboard: install to first sorted inbox

Kai lines are at most 8 words, plain, no dashes. Kai is the main moving thing on every screen. UI moves only as it does today.

| # | Screen | Kai says | What moves |
|---|---|---|---|
| 0 | Welcome tab (connect gate) | "Hi, I'm Kai. Let's tidy your Gmail." | Kai (new on this screen, about 96px) **peeks** up from the bottom edge of the photo card, then **waves**. Glass card cut to the title, one line and the button. Trust line stays as one line under the button |
| 0b | Back from Google consent | "Got it. Let's look." | Kai **nodSmall**, then `think(true)` while the mailbox is counted |
| 1 | What should always stay? | "Pick what stays in your inbox." | Kai (bigger, about 120px, on the photo side) **hops** in. Options show label emoji (💳 💼 🧳 🧾 👤). On each tick: Kai `lookAt` the option, **nodSmall**, and `emote` that option's emoji (🧳 floats up once). On untick: **tilt**. The card gains a row with the emoji |
| 2 | How hands-on? | "Should I sort, or ask first?" | Kai `pointAt` the two options in turn (antenna lean). "Tidy for me": **puff** (proud). "Ask me first": **nod** and line "Fine by me. I'll wait." |
| 3 | Here's your plan | "Here's what I'll do." | Plan rows shown **once**, in the card. The left column keeps only the read choice and Start. Kai `pointAt` the Start button after the rows land |
| 4 | Start pressed: labels made | "Making your labels." then "All 13 labels ready." | Real event. Each label chip (emoji plus name) appears as Gmail confirms it. Kai's gaze follows the newest chip and it does **nodSmall** every few labels. One **celebrate** at the end, once ever |
| 5 | First read (Overview "home-read" bar) | "Reading your mail. You can look around." | Kai in the header `think(true)`, antenna lit at intervals. No line repeats. Reduced motion: still face, thinking mood |
| 6 | First sorted inbox | "Done. 1,240 emails found their labels." | One **celebrate** (existing "sort" moment). The "This week" rows show label emoji. Kai `pointAt` the top row once |

Rules for the storyboard:
- One Kai beat per event, under 1.5 s (kai-character.md motion rule 2).
- Lines describe what is happening or ask the question. No reassurance lines. Undo is shown when the user does something, as today ("Undone.").
- With Reduce Motion: no hop-ins, travel or emotes. Mood changes and the bubble remain (the engine already does this).

**Learn by doing (open question):** Duolingo's strongest pattern is doing the real task first. Cluster can do this without risk because nothing changes until Start. Step 1 could show 3 of the user's **real** top senders as cards ("Where does Amazon go?" with 📦 / 🛍 / Keep) and Kai reacts. The practice inbox was removed on 2026-10-30, so this needs a yes from you.

### Kai after setup (Duolingo-style, not annoying)

| Moment | Kai does | Cap |
|---|---|---|
| First scan running | Thinking face in header. One line at start, one at end | Once per scan |
| First visit to each page (Labels, Cleanup, Security, Details) | `tip()` line plus `pointAt` the main control. Example for Labels: "Pick where each label goes." | Once per page ever, stored in `chrome.storage.local`. Skipped if a nudge already showed this visit |
| Empty states (no promotions, inbox zero, no scams) | One pleased line in the empty box, Kai **relief** | Only when the empty state is new |
| Mistakes: Label as, Undo | Existing `nodSmall` + "Undone." Add "Fixed. I'll remember that." on "Always" relabel | Existing per-visit limits |
| Errors (quota, sign-in expired) | Serious short line, `worried` mood only while it is true | No jokes (character guide) |

Shared limits: kaiWatch's budget (3 per visit, 60 s gap, quiet after 2 ignored). Any line closes on click or Esc. "Show Kai" off (`settings.showKai`) silences all of it. Reduce Motion keeps lines and drops movement.

### Label emoji: where and how

- **Helper:** one function next to `CLUSTER_LABELS`, for example `labelEmoji(name)`. It returns the leading emoji of the *actual* label name (so renames in `labelChoices` are honored) with `️` added for display, and `""` if the name has none. Its partner is the existing strip `name.replace(/^\S+\s/, "")`. Fallback when there is no emoji: today's Lucide icon.
- **Swap the Lucide icon for the emoji** on: Labels page rows, Overview "This week", scan card rows, Sort inbox report rows, the Details "Label as" `<option>` text (emoji plus name; options cannot hold icons), and the toast "Labelled 12 as 🧳 Travel".
- **Gmail color tag:** keep it as the single color cue? Labels and Overview currently show tag **and** icon. With the emoji, one cue is enough. Recommendation: **emoji replaces both**, and the Gmail color stays only where users match it against Gmail (Labels page, as a small dot). Open question.
- **Setup:** keep options and plan rows use the emoji of the matching label (bank → 💳, work → 💼, travel → 🧳, receipts → 🧾, people → 👤, scams → 🚨, promotions → 🏷). Remove the tinted squircles (`iconTile`) there.
- **Not labels, keep Lucide:** clock, inbox, sparkles, eye (these are actions, not labels).
- `BUCKET_ICON` stays only as the fallback.

### Technical approach for Kai motion

| | Existing kaiLife + WAAPI | Rive runtime |
|---|---|---|
| New code | Small: a "stage" wrapper that moves the `.kai` element with `element.animate()` transforms, while Kai does `hop` during travel | New `.riv` character authored in the Rive editor, plus a wrapper |
| Size | 0 KB added (engine already loaded) | `@rive-app/canvas-lite` 2.50.0 is 3.2 MB unpacked on npm (`canvas` 6.4 MB). The shipped `.wasm` is smaller; measure before deciding. Sits outside the 600 KB JS budget but grows the zip |
| MV3 CSP | Unchanged (`script-src 'self'`) | Needs `'wasm-unsafe-eval'` added to `extension_pages` script-src. Allowed in MV3 (Chrome 102+). Chrome DevRel says it shows no install warning |
| License | Own code | Runtime is MIT. Check the Rive editor plan terms for export |
| Consistency | Same Kai in portfolio, Moat, Cluster (shared copies) | Would fork Kai from the other two, or force all three to switch |
| Lip sync | 3-bar mouth `talk(ms)` is enough for one short line | Viseme state machine like Duolingo's, overkill without real speech audio |
| Reduce Motion | Built in | Must be wired by hand |

**Recommendation: stay with kaiLife plus WAAPI.** Kai already has more states than setup uses (25 actions, 15 moods, gaze, pointing, emotes). The gap is **using** them and adding **travel**: Kai's whole element gliding to a spot with two small hops, about 600 ms, one trip per screen at most. Rive is worth it only if Kai gets a new body with arms, which is a character-design project of its own.

### Build order (small shippable steps)

| Step | What | Files | Verify |
|---|---|---|---|
| 1 | `labelEmoji()` helper plus emoji on Labels, Overview week rows, scan card, Sort report, Label-as options, toast | `src/lib/clusterLabels.ts` (+ test), `timeLimitsTab.ts`, `homeDashboard.ts`, `dashboard.ts`, `sortInbox.ts`, `detailsPanel.ts`, `dashboard.css` (`.lbl-emoji` size and line height) | Unit test: emoji, renamed label, no-emoji name, FE0F. `npm test` (timeLimits, today, detailsPanel dom tests). Look at 🏷 and 🛍 in Windows Chrome via `dist` reload |
| 2 | Setup copy trim (✂ lines above), plan shown once, emoji in keep options and plan rows | `setupTab.ts`, `onboardingPlan.ts`, `setup.dom.test.ts` (lines 49 and 52 assert today's Kai lines), `dashboard.css` | Tests, word budget test, read the 3 screens aloud |
| 3 | Kai reacts in setup: bigger Kai, lookAt / nodSmall / tilt / emote emoji on picks, pointAt on hands and Start | `setupTab.ts` (`kaiNarrator` gains `react(option)`), `dashboard.css` `.onb-kai` size | Manual run with Reduce Motion on and off. One beat per click, no queue pile-up (`do()` queue is 2) |
| 4 | Kai travel: stage wrapper, hop-in on step 1, move to Start on step 3 | `setupTab.ts` or a small `kai/kaiStage.ts`, CSS | Reduce Motion: no travel. Resize to narrow width: Kai stays inside the art column |
| 5 | "Making your labels" moment with real per-label progress, celebrate once | `setupTab.ts`, `timeLimitsTab.ts` (`turnOnTimeLimits` may need a per-label callback; check whether it can report), settings flag `kaiCelebrated` | Fresh profile run. Second run shows no celebration. Failure path still says the filters line |
| 6 | Kai on the connect gate (peek and wave, one line), gate copy trimmed | `index.html`, `dashboard.ts` connect code, CSS | Connect dom test, first-run visual |
| 7 | After setup: first-scan thinking, first visit per page tips, empty-state lines | `kaiGuide.ts` (use `tip` + `pointAt`), `dashboard.ts` callers, storage key | kaiGuide tests for the caps. Two tips never show in one visit |
| 8 (optional, needs yes) | Learn by doing with 3 real senders in step 1 | `setupTab.ts`, `onboardingPlan.ts` | Answers change `sortOverrides` only on Start |

Steps 1 and 2 are independent and can go first. Steps 3 to 5 make setup feel like Duo.

### Open questions

1. With the emoji in place, drop the Gmail color tag everywhere, or keep a small color dot on the Labels page only?
2. Bring back "learn by doing" with 3 of your real senders in step 1 (the practice inbox was removed in October)?
3. How big should Kai be in setup? About 120px is proposed (64px today).
4. Should Kai appear on the connect gate before sign-in, or only from setup on?
5. Any sound at all (one soft chime when labels are ready, off by default), or none?
6. First-visit tips on each page: welcome, or too much?
7. Keep the voice button in setup?

### Decisions (user, 2026-11-15)

1. Labels show emoji **and** the Gmail color tag (like the Gmail sidebar).
2. Learn by doing: **yes**. Step 1 uses 3 of the user's real senders; step 8 moves into the main build.
3. Sound: **none**.
4. First-visit tip on each page: **yes, once per page**.
5. Kai size, connect-gate Kai and the voice button: go with the proposals (120px, peek on the gate, voice button kept) unless the user says otherwise.
