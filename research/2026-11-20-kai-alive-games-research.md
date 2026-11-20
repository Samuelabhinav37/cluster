# Making Kai feel alive: what games, films, apps and robots do (2026-11-20)

Research only. No code changed. Written on branch `feat/speed-domains-2026-11`.

The question: how do games and character apps make a character feel alive and likeable, and what should Kai do differently? Kai's rules still hold. Setup stays calm. No glows, confetti or bouncing UI. Motion lives in Kai's body and face. Reduced-motion users get fades only.

## Summary

- Every Kai in the dashboard is built with `calm: true`. Calm turns off the float, the breathing, the sway and the idle antenna. So the hello screen shows a Kai that is perfectly still between beats. It only blinks and glances. This is the biggest gap.
- The welcome screen has no brain (`auto` is off). Kai does not look at the cursor, does not notice the Get started button and does not react to the mouse.
- The sources agree on a small set of cheap signals of life. A slow breath. Blinks at a natural rate. Quick eye jumps that then hold still. Looking at what the person looks at. A short wind-up before a big move. A settle after a landing. And restraint: life signals are small, and gestures are rare.
- The top three changes are all size S. Give calm Kais a CSS breath. Let the hello Kai follow the cursor with a human delay. Make glances quick jumps instead of slow drifts.

## Sources and what each one says

Status key. **Read** means I read the page myself. **Snippet** means I only saw a search summary or an abstract. **Not found** means I looked and found nothing usable.

### Sony: Astro Bot (Team Asobi) and other PlayStation characters

| Source | Status | What it says |
|---|---|---|
| [The Verge, Jay Peters, "Astro Bot's director on making a PlayStation icon" (GDC 2025), read via a mirror](https://techyes.pages.dev/games/689596/astro-bot-director-playstation-icon-gdc-2025) | Read, but only a mirror. **Not verified on verge.com** | Doucet showed an idle where Astro hops and points forward, "almost like a little kid that's demanding you go to the playground." Many games idle with breathing or looking left and right. Asobi tied the idles to looking around instead, because the game is about finding bots. They added them "very, very late". They also shortened the delay before idles start, "a subliminal way to put players in the mood to move faster." Astro began as "a simple character design instead of a human that might require a lot of facial animations." |
| [PlayStation Blog, "Astro Bot: How Team Asobi created a unified vision for fun" (2024)](https://blog.playstation.com/2024/09/09/astro-bot-how-team-asobi-created-a-unified-vision-for-fun/) | Read | Jamie Smith, Principal Animation Director: "When creating animations, we model how children express joy." He pays "close attention to 'playfulness.'" The post has nothing on idle timing or eyes. |
| [PlayStation Blog, "Astro Bot Rescue Mission: Inside the Art and Animation" (2019)](https://blog.playstation.com/2019/01/24/astro-bot-rescue-mission-inside-the-art-and-animation-of-japan-studios-ps-vr-hit/) | Read | "Nearly every object in the game reacts to touching or punching it, which cements the player's presence." Cartoon exaggeration "did not bode well in VR", so "timings had to be adjusted". The bots balance "cuteness with mischievous undertones". |
| [PlayStation Blog, Insomniac on Rift Apart animation](https://blog.playstation.com/?p=352844) | Read | Only general lines: "keep the personality in each character with clear reads for every state." **Nothing specific on Clank.** |
| Sackboy (Sumo Digital) | **Not found** | The Unreal Engine developer interview returned 403. No animator interview on Sackboy's personality turned up. |
| GDC Vault pages for the Astro Bot talks | **Not read** | Vault pages are behind a login. I relied on press coverage. |

### Nintendo

| Source | Status | What it says |
|---|---|---|
| [Iwata Asks, The Wind Waker HD, part 3](https://www.nintendo.com/en-gb/Iwata-Asks/Iwata-Asks-The-Legend-of-Zelda-The-Wind-Waker-HD/The-Legend-of-Zelda-The-Wind-Waker-HD/3-The-First-Part-Is-Perfect-But-/3-The-First-Part-Is-Perfect-But--807230.html) | Read | Arimoto: "We made it so when you stop, the eyes move, looking this way and that way." Aonuma: "That's when we had the idea of Link's gaze providing a hint." Takizawa: they made expressions richer "by increasing the number of patterns for the eyes and mouth." |
| [Iwata Asks, How the Nintendo 3DS was made](https://iwataasks.nintendo.com/interviews/3ds/how-nintendo-3ds-made/3/2) | Snippet | Earlier pets had painted eyes that "didn't move like real eyes". They then modeled eyeballs so the pets could track moving things. |
| Nintendo robot mascots (R.O.B. and similar) | **Not found** | No primary source on how a Nintendo robot face is animated. |

### Pixar: WALL-E, EVE, and the principles

| Source | Status | What it says |
|---|---|---|
| [NPR, "Pixar's Andrew Stanton: Animating From Life" (2008)](https://www.npr.org/2008/07/10/92400669/pixars-andrew-stanton-animating-from-life) | Snippet (the page timed out) | WALL-E's hinged eyes came to Stanton when a seatmate at a baseball game passed him binoculars. |
| [Deep Focus Review on WALL-E](https://deepfocusreview.com/definitives/wall%C2%B7e) | Snippet | Quotes Stanton: "You don't need a mouth, you don't need a nose, you get a whole personality just from [them]." **Secondary. Not checked against a transcript.** |
| [Twelve basic principles of animation (Wikipedia)](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation), citing Thomas and Johnston, [*The Illusion of Life*](https://books.disney.com/?p=21668) (1981; Disney Editions reprint) | Read (secondary summary of the book) | Anticipation readies the audience for an action. Squash and stretch shows weight, and volume stays the same. Follow-through: loose parts keep moving after the body stops. Secondary action adds life without stealing focus. Timing sets weight, mood and personality. Exaggeration "requires restraint". Appeal is like an actor's charisma. |
| [Lasseter, "Principles of Traditional Animation Applied to 3D Computer Animation" (SIGGRAPH 1987)](https://www.ics.uci.edu/~fowlkes/class/ics162/exercises/lasseter.pdf) | **Not read** | I downloaded the PDF but could not extract its text. It is cited here only as the classic source. |

### Duolingo and other app characters

| Source | Status | What it says |
|---|---|---|
| [Duolingo blog, world character visemes](https://blog.duolingo.com/world-character-visemes) | Read (also in `2026-11-15-kai-duolingo-onboarding.md`) | Characters run on a Rive state machine. "We can also show idle behavior like head nods, blinking, and eyebrows moving." Talk, idle and outcome are separate states. Mouth shapes are triggered "in sync with the audio" from word and phoneme timings. |
| [Rive blog, animated login screen](https://rive.app/blog/animated-login-screen-design) | Read | "Teddy looks at the text field and follows with his eyes." He covers his eyes for the password. The idle is "a slow animation, accompanied by one or two blinks." The eye move into a look uses a 200 ms blend. The return to idle after success uses 1000 ms. It names "the anticipation before Teddy raises his hands" as a detail worth adding. |
| Anki Cozmo ([IEEE Spectrum](https://spectrum.ieee.org/anki-cozmo-robotic-toy), [Wikipedia](https://en.wikipedia.org/wiki/Cozmo)) | Read (Spectrum), Snippet (others) | Anki: "charming, a bit mischievous, and unpredictable." The eyes have no pupils and change shape with mood, like EVE's. Former Pixar animator Carlos Baena led animation. When ignored, Cozmo's eyes turn into Pong to show it is bored. **The Baena details are from secondary coverage.** The Design News interview returned 403. |
| Clippy: Luke Swartz, "Why People Hate the Paperclip" (Stanford thesis, 2003), via [Jerz](https://jerz.setonhill.edu/?p=1399) and [The Harvard Crimson](https://www.thecrimson.com/article/2005/4/28/what-not-to-do-with-a/) | Snippet. **Thesis PDF not read** | An agent should leave users in control and follow etiquette. Clippy broke norms: repetition, staring, never learning. The thesis cites research that a human-like style is "cute the first time, silly the second time, and an annoying distraction the third time." |

### Robotics and HRI

| Source | Status | What it says |
|---|---|---|
| [Takashima et al., "Effects of avatar's blinking animation on person impressions", Graphics Interface 2008](https://dblp.org/rec/conf/graphicsinterface/TakashimaOYIKK08.html) and the [IPSJ Japanese version](https://ipsj.ixsq.nii.ac.jp/records/9351) | Snippet (abstracts) | About 18 blinks a minute gave the friendliest impression. With cartoon characters, 18 a minute was also judged most familiar. 36 a minute read as "inactive". 9 a minute read as "intelligent". **Methods and sample size not checked.** |
| [Lee, Badler and Badler, "Eyes Alive" (SIGGRAPH)](https://www.cis.upenn.edu/~badler/papers/EyesAlive.pdf) | Snippet (the PDF now redirects) | Saccades are modeled by size, direction, duration, speed and the gap between them, with separate talking and listening modes. Saccade reaction time averages 180 to 220 ms. Faces with statistically shaped saccades were compared with still eyes and random saccades. **Exact distributions and the year not checked.** |
| [Andrist, Tan, Gleicher and Mutlu, "Conversational Gaze Aversion for Humanlike Robots", HRI 2014](https://www.microsoft.com/en-us/research/?p=557574), with [IEEE Spectrum's write-up](https://spectrum.ieee.org/what-robot-behavior-makes-people-feel-uncomfortable) | Read (abstract and article) | The system mixes face tracking, idle head motion and planned gaze aversions. In a study with 30 people, the aversions were "perceived as intentional" and the robot seemed "more thoughtful". Spectrum gives the human base rates. Listeners look at the speaker about 70% of the time. Speakers look at the listener about 40%. Upward looks mean thinking 39.3% of the time. A robot that stares feels "like a laser into my soul". |
| [Koller et al., Frontiers in Robotics and AI (2023)](https://doi.org/10.3389/frobt.2023.1062714) and [a systematic review of robot gaze aversion](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10123290/) | Snippet | With a low gaze aversion ratio, people ended the talk sooner. People partly copied the robot's ratio. People also looked away more when the robot stared. |
| [Pan et al., "Realistic and Interactive Robot Gaze", Disney Research, IROS 2020](https://la.disneyresearch.com/publication/realistic-and-interactive-robot-gaze/), via [IEEE Spectrum](https://spectrum.ieee.org/disney-research-robotic-gaze) | Read (article) | The goal is "an interaction which demonstrates the illusion of life." There are high-level states: read (the default), glance, engage and acknowledge. Under them sit "breathing, small head movements, eye blinking, and saccades." The article gives no timings. |
| [Terzioglu, Mutlu and Şahin, "Designing Social Cues for Collaborative Robots: The Role of Gaze and Breathing", HRI 2020](https://peopleandrobots.wisc.edu/publications/Designing-Social-Cues-for-Collaborative-Robots-the-Role-of-Gaze-and-Breathing-in-Human-Robot-collaboration/) | Read (abstract) | They added breathing "through Secondary Action", taken from character animation. Breathing had "a positive effect on most measures of robot perception." **The breathing rate and size are not in the abstract.** |
| [Casso et al., "The Effect of Robot Posture and Idle Motion on Spontaneous Emotional Contagion", RO-MAN 2022 workshop](https://arxiv.org/abs/2209.00983) | Read (abstract) | The Buddy robot nodded its head at low, medium or high frequency (N=15). At low frequency it seemed more natural and more knowledgeable. Fast idle motion made listeners stiffer. |

### Game UX: idle timers and variety

| Source | Status | What it says |
|---|---|---|
| [Animancer docs, Unity 3D Game Kit idle sample](https://kybernetik.com.au/animancer/docs/samples/animator-controllers/3d-game-kit/idle) | Snippet | The common pattern is a default idle loop. A timer (5 s in that sample) then plays a different idle to show fidgeting or boredom. Any input resets the timer. |
| Engine forums ([Unreal](https://forums.unrealengine.com/t/start-a-random-idle-animation-after-a-period-of-time/331361), [Godot](https://forum.godotengine.org/t/idle-animations-in-no-particular-order/130450)) and [TV Tropes, Idle Animation](https://TVTropes.org/pmwiki/pmwiki.php/Main/IdleAnimation) | Snippet. **Practice, not research** | About 10 s before a rare idle, so it does not fire in short pauses. Make the base loop play a few times before a special idle. Common fidgets are glancing around, tapping, yawning and stretching. |

I found no rigorous study on how often idle gestures should repeat before they annoy people. The caps below come from the Clippy finding and from Astro's short, purposeful idles. They are judgment, not measurement.

## What Kai already does (from the code)

From `src/dashboard/kai/kaiLife.js` and `kaiLife.d.ts`:

- **15 moods.** Each mood sets eye openness, lid cover and slant, a bottom lid for the happy ^, eye scale, a resting gaze and a mouth (flat, smile, frown, talk, dots, wobble, o). The face eases to a new mood at 16% per frame, which takes about 300 ms.
- **25 one-shot actions** keyed over 0 to 1: blink 160 ms, wink, hop 640 ms (it already has a crouch, air and land squash), nod 760 ms, wave 1400 ms, lookAround 2600 ms, startle, stretch, yawn, shy, shrug, peek, point, relief, puff, bye and more. One action runs at a time, and at most two wait in a queue.
- **Antenna.** A damped spring driven by head turns and vertical moves. Some actions add a kick. This is real follow-through.
- **Idle body (not calm).** A float every 4.2 s at 1.4% of width. A breath every 3.1 s at 1.1% height. A sway every 7.3 s at 0.8°. An antenna sway every 5.1 s at 1.5°. Saccades every 0.7 to 2.4 s within ±14 by ±8 SVG units.
- **Calm mode (every dashboard Kai).** All of the idle body above is off, and frames stop once Kai settles. Blinks come every 2.5 to 6.5 s (mean 4.5 s, about 13 a minute), and 20% are double. Glances come every 2.6 to 6.2 s within ±16 by ±9. Gaze always eases at 12% per frame, so a glance is a slow drift (about 300 ms), not a quick jump.
- **Brain (only with `auto`).** It follows the pointer and looks at hovered links and buttons. It looks at focused inputs and holds still while you type. It leans with the scroll. It reacts to a shake of the mouse, to clicks on Kai and to coming back to the tab. It fidgets every 20 to 40 s and dozes after 60 s. **No dashboard screen turns the brain on.**
- **Talking.** The mouth is three bars bouncing on a sine about every 95 ms, unrelated to the words.
- **Reduced motion.** No frames at all. Moods snap. Actions only set the mood they would show halfway through.

From `src/dashboard/welcome.ts`, the hello timeline. At 0 s Kai fades, grows and unblurs in over 1.2 s (CSS `wel-appear`, from 0.3 s) with eyes shut (`asleep`). At 1.5 s it turns curious, blinks, and looks around 0.4 s later. At 2.5 s it turns happy, waves and types "Hi, I am Kai!". At 4.6 s it nods and types the second line. At 6.0 s Get started rises in and takes focus. Text types 2 characters every 22 ms, about 90 a second. The mouth talks for `min(2400, length × 45)` ms, so line 1 finishes typing in about 140 ms while the mouth keeps going for about 585 ms.

## The gap

1. **No breath on any dashboard Kai.** Between beats Kai is a still picture. Breathing is the cue Terzioglu found helped "most measures", and Disney's gaze system runs it at the lowest layer.
2. **Kai ignores the person on the hello screen.** No cursor following and no notice of the button. Teddy, Wind Waker's Link and Disney's bust all look at what you do.
3. **Glances drift.** Real eyes jump in tens of ms and then hold. Kai's 12% lerp makes every glance a slow slide, which reads as floaty rather than attentive.
4. **Blinks are a little slow and random.** About 13 a minute against 18 for "friendly". Blinks also never line up with what Kai is doing.
5. **No wind-up before the wave.** The wave starts tilting straight away. The hop has a crouch. The wave, nod and wake do not.
6. **The entrance has no landing.** The CSS grow ends on a spring ease, but the body never settles with weight.
7. **The mouth is not tied to the words,** and the text types faster than anyone reads.
8. **No restraint system for later screens.** Calm Kais have no fidgets at all, and brain Kais fidget without a cap. Neither matches "rare and purposeful".

## Ranked top 10 for Kai

Every item runs only when `REDUCED` is false. `start()` already returns early for reduced motion, so these get no frames there. Item 1 is CSS, so it needs its own `prefers-reduced-motion: no-preference` guard. Sizes: S is under 30 lines, M is a new small function or state, L is a new system.

| # | Change | In kaiLife.js terms | Why (source) | Cost |
|---|---|---|---|---|
| 1 | **Breathing for calm Kais, in CSS** | In `kai.css`, under `@media (prefers-reduced-motion: no-preference)`, animate the individual `scale` and `translate` properties on `.kai-rig` (not `transform`, which JS writes inline, so the two compose). Use a 3.6 s cycle (about 17 breaths a minute), ease-in-out, alternate. Scale goes from `1 1` to `0.996 1.010`. Translate goes from `0 0` to `0 -0.4cqw`. Keep `transform-origin` at the bottom so Kai stays seated. No JS frames, so calm's frame saving holds. | Breathing as secondary action improved robot perception (Terzioglu 2020). Breathing is part of Disney's low-level layer (Pan 2020). Slow idle motion read as more natural (Casso 2022). | S. **Measure p95 frame time on a busy screen first**, because calm exists for perf. The SVG glow filter may repaint under a scale. |
| 2 | **Eyes follow the cursor on hello** | In welcome, add a throttled `pointermove` that calls `kai.lookAt({x, y})` about 200 ms after the move. Ignore moves under 24 px from the last target. After 1500 ms without movement, call `lookAt(null)` to look back at the person. The existing `reach = min(1, d/420)` already scales the eye travel. Remove it on `askName`. | Teddy "follows with his eyes" with 200 ms blends (Rive). Saccade reaction time is 180 to 220 ms (Eyes Alive). Looking back after a still spell avoids the "laser" stare (Andrist / Spectrum). | S |
| 3 | **Glances jump, then hold** | In `render`, use a faster gaze lerp while a new saccade target is fresh. Use `gk = 0.35` for the first 90 ms after `sacc` or `gazeTarget` changes, then 0.12 for small drift. For calm glances, hold each one 1.2 to 3 s, and come back to centre (eye contact) about 60% of the time. Keep the size at ±16 by ±9. | Statistical saccades were tested against random ones and still eyes (Eyes Alive). Listeners look at the speaker about 70% of the time (Andrist). Wind Waker's eyes "looking this way and that way" when Link stops. | S |
| 4 | **Blink timing** | Calm blink loop: make the gap `rand(1800, 5200)` (mean about 3.5 s, about 17 a minute) instead of 2500 to 6500. Keep 20% doubles. Always blink once when a gaze move is over 40 SVG units, and when a mood changes. While `thinking`, slow to `rand(4000, 7000)`. Keep blink length at 150 to 160 ms. | 18 a minute read as friendliest. 9 a minute read as "intelligent". 36 a minute read as "inactive" (Takashima 2008). The "Teddy idle" has "one or two blinks" (Rive). **Blinking with big gaze shifts is my assumption, not checked here.** | S |
| 5 | **Anticipation before the wave (and the nod)** | In `ACTIONS.wave`, add a crouch in the first 12%: `c = bump(p, 0, .12)`, giving `dy += .012*c`, `sy *= 1 - .03*c`, `bottom: .25*c` (eyes squint) and `ant: -10*c` (antenna dips back). Then start the tilt at p .12. Raise `dur` to 1550 ms. For `nod`, add a 60 ms chin lift first (`dy -.006`). | Anticipation readies the audience (Thomas and Johnston). Rive calls out "the anticipation before Teddy raises his hands." | S |
| 6 | **A landing squash at the end of the entrance** | Add an action `land` (dur 380 ms): `s = bump(p, 0, .45)`, `r = bump(p, .45, 1)`, with `sy: 1 - .05*s + .015*r` and `sx: 1 + .035*s - .01*r`, plus `kick: 8` so the antenna spring follows through. Call `kai.do('land')` at 1500 ms, when `wel-appear` ends, before the wake. | Squash and stretch shows weight, with constant volume. Follow-through: loose parts keep moving after the body stops (Thomas and Johnston). The antenna spring already does the follow-through. | S |
| 7 | **Notice the Get started button** | Once the button is shown, if the pointer comes within 140 px of its edge, call `kai.pointAt(go)` and `setMood('happy', 1200)`. Do it once per approach, with a 5 s cooldown. On hover, keep `lookAt(go)`. On press, `nodSmall` before moving on. Never animate the button itself. | Link's "gaze providing a hint" (Iwata Asks). Astro's idles "put players in the mood to move faster" (Doucet via The Verge, mirror). Objects reacting "cements the player's presence" (PS Blog 2019). | S |
| 8 | **A proper wake-up** | Replace the instant `asleep` to `curious` switch at 1500 ms with three steps. First `setMood('sleepy')` for 350 ms, so the lids lift halfway. Then `blink(true)`. Then `curious` at +700 ms, with `lookAt(null)` so the first thing Kai looks at is the person, before `lookAround`. Shift the later beats by about 300 ms, or trim `lookAround` to 1800 ms. | Timing and slow-in (Thomas and Johnston). Disney's "acknowledge" state is the look when Kai recognises someone (Pan 2020). | S/M |
| 9 | **Talk tied to the text** | Slow typing to 1 character every 34 ms. Drive the mouth from the typed text: add `kai.mouthOpen(0..1)` or let `talk()` take a string. The mouth opens on vowels, closes on spaces, and holds closed 160 ms at `, . !`. End talking when the line ends plus 120 ms, not on the length × 45 guess. | Duolingo triggers mouth shapes "in sync with the audio" from per-word timings (visemes post). Idle and talk are separate states. | M |
| 10 | **Rare, capped idle gestures on screens where Kai waits** | Add a small `idleBeat` for calm Kais. After 8 s with no input, do one quiet gesture (`tilt`, `nodSmall`, `lookAround` or a glance at the main button). Then wait `rand(15000, 25000)`. Never repeat the same gesture twice in a row. Stop after 3 per screen. Any input resets the timer, and typing pauses it. | Idle timers with variety are standard (Animancer, engine forums). Clippy-style repetition goes "cute, silly, annoying" (Swartz 2003, secondary). Cozmo shows boredom only when ignored. | M |

### Left out on purpose

- **Hearts in the eyes, emotes and Pong eyes.** These are fun in Astro and Cozmo, but they add symbols on screen. That is close to the "no confetti" rule. `emote()` exists, but the hello screen should not use it.
- **Turning the full brain on for setup.** Its shake detection, scroll lean and doze are built for the portfolio, and its fidget loop has no cap. Taking items 2, 7 and 10 on their own is smaller and safer.

## Unverified or missing

- The Astro Bot GDC 2025 idle details come from a mirror of The Verge, not verge.com. The GDC Vault pages were not read.
- No primary source was found on Clank, Sackboy or a Nintendo robot mascot.
- The Stanton "eyes" quote and the Cozmo and Baena details are from secondary coverage.
- The Takashima blink rates, the Eyes Alive saccade numbers and the Andrist 70/40/39.3% figures come from abstracts or press write-ups, not the full papers.
- The breathing rate and size used by Terzioglu are not public in the abstract. The 3.6 s and 1% values in item 1 are my choice, near Kai's existing 3.1 s breath.
- The Lasseter 1987 paper could not be read. The twelve principles are cited through a summary of Thomas and Johnston.
- No study gives a safe count of idle gestures before annoyance. The cap in item 10 is judgment.
