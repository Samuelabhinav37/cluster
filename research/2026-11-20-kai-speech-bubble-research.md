# Kai's speech bubble: how games and apps show a character talking (2026-11-20)

The user says the way Kai's box appears, and the way its text appears, "looks so bad".
This file says why, what well-known games and apps do, and what to build instead.
No code was changed.

## Summary

- The box grows as the text types. It changes width on every letter, and the sound button beside it slides right. This is the main fault.
- The box is a near-white slab (`rgba(255,255,255,.92)`) with semibold dark text on a pure black page. It is the brightest thing on screen and shouts over the title.
- It has no real tail. One corner is squared off (`14px 14px 14px 4px`), and that corner sits at the bottom left, away from Kai's face.
- In setup it re-pops with a springy scale from 0.85 on every new line. In the welcome it does not animate at all. The two screens disagree.
- The fix: a dark grey bubble (`#2C2C2E`), white regular text, an 18px radius, a small tail pointing at Kai, a short fade-and-settle on the first line only, and text typed into a box that already has its final size.

## What is there now (from the code)

- `src/dashboard/dashboard.css:1908` `.onb-bubble`: max-width 280px, padding 9px 13px, radius `14px 14px 14px 4px`, background `rgba(255,255,255,0.92)`, text `#18181b`, `500 13.5px/1.4`, a `0 6px 20px rgba(0,0,0,.18)` shadow (invisible on black), `transform-origin: 0 100%`.
- `:1920` `.onb-bubble.pop` plays `onb-bubble` (opacity 0 and scale 0.85 to 1) over 0.35s on `var(--spring)` (snappy spring).
- `:3959` `.wel-bubble`: max-width 440px, padding 14px 18px, radius `16px 16px 16px 4px`, `600 19px/1.35`.
- `:3951-3953` hello step: `.wel-bubble` above Kai, radius 14px, `500 15px`, a rotated-square tail pointing down.
- `:3974` `.onb-kai-words` is a flex row: bubble, then the voice button. `:4746` `.onb-kai-row` centres Kai and the words. `:4748` setup bubble is 15px.
- `:334` reduced motion swaps the pop for `onb-fade`.
- `welcome.ts:85` `say()` and `setupTab.ts:152` `say()`: clear the old interval, then set `bubble.textContent = text.slice(0, n)` every `TYPE_MS` = 34 ms. Each tick calls `kai.voice(char)`, which opens the mouth on letters (wider on vowels) and shuts it on spaces and punctuation (`kaiLife.js:332`). No pause at punctuation. No skip. Reduced motion shows the full line at once.
- `setupTab.ts:161-163` restarts the `pop` class on every line, so every line bounces.
- The bubble has `aria-live="polite"` and its text changes 30 times a second, so a screen reader can read fragments.

## What the screenshots show

- `05-email.png` (welcome): a light grey box, semibold 19px, top-aligned with Kai's head. The box is wider than the text needs in the end only because it grew to fit. The squared corner is at the bottom left, under the text, not at Kai.
- `07-setup.png`: "Let me show you how it works." The box hugs the text, and the round voice button sits right after it.
- `08-setup.png`: caught mid-line, "I'll do this for all your". The box is narrower than in `07`, and the voice button has moved left with it. As typing goes on, both slide right. This is the jumping the user sees.
- In both setup shots the bubble's top lines up with Kai's antenna base. Its tail corner points at nothing.

## What others do

Confidence marks: **Primary** = the maker or platform owner. **Data** = disassembly or engine docs. **Secondary** = fan wiki or press. **Unverified** = my own observation or memory, not checked against a source in this session.

### Animal Crossing (Isabelle, Tom Nook)

- A rounded, cream, slightly wobbly box at the bottom of the screen. The speaker's name sits in a coloured tab on the top-left edge. A small bouncing arrow at the bottom right means "press A". **Unverified** (from play).
- Text reveals per character. Each character plays a syllable of "Animalese". Nookipedia: "each spoken letter is matched to the basic sound of that letter". Pitch depends on personality and species, and mood moves it: "happy villagers will speak in a higher pitch". **Secondary** ([Nookipedia, Animalese](https://nookipedia.com/wiki/Animalese)).
- Holding B speeds it up: "If text is quickly scrolled, the Animalese also speeds up, sounding more high-pitched." **Secondary** (same page).
- Words can grow, shake or pop for emphasis, and the box can shake when a character is surprised. **Unverified.**
- Lesson for Kai: the voice follows the text, letter by letter. Kai's mouth already does this.

### Undertale

- A black box with a thick white border at the bottom, a portrait on the left, and white pixel text. **Unverified** (from play).
- One blip per letter. Each character has its own blip (Sans, Papyrus and Toriel sound different). Punctuation pauses the text. **Secondary**: a forum comment says turning text speed up removes the pauses after punctuation.
- Create Your Frisk, an Undertale engine clone, documents the default as "1 character every 4 frames", plus `[w:n]` waits, `[instant]`, and a player skip on X. **Data** ([CYF text API](https://rhenaudthelukark.github.io/CreateYourFrisk/pages/api-text.html)). The frame rate is not given on that page. At 60 fps that is about 67 ms per character. **Unverified** for Undertale itself.
- Lesson: pauses at punctuation are what make typed text read like speech.

### Pokémon

- Gen III text speed is a frame delay between characters: Slow 5, Medium 3, Fast 1 (about 83, 50 and 17 ms at 60 fps). A disassembly edit adds "None" at 0. **Data** ([Glitch City forum](https://archives.glitchcity.info/forums/board-107/thread-9092/page-0.html), [gist](https://gist.github.com/Kraballa/b21f5f5eb8898facd358409d395bb846)).
- Bulbapedia lists Slow, Normal and Fast. "Fast" is the default in Legends: Arceus. **Secondary** (Bulbapedia blocked this session; seen in search results only).
- Pressing A mid-line finishes it. Pressing again advances. **Unverified** (from play).
- Lesson: players choose fast. The default has drifted to fast over the years.

### Zelda: Tears of the Kingdom

- A dark, translucent, rounded box near the bottom. The speaker's name sits above it. Key words are coloured. A small triangle at the bottom means "more". **Unverified** (from play). An accessibility review describes "white text on a darkened background" and colour for important words. **Secondary** ([Can I Play That](https://caniplaythat.com/2023/09/28/the-legend-of-zelda-tears-of-the-kingdom-accessibility-review/)).
- Lesson: the most Apple-like game box is dark, soft and quiet. It never outshines the scene.

### Celeste

- A wide box at the top with a large character portrait. Portraits change with emotion. **Unverified.**
- The dialogue audio is driven by the portrait: one audio event per character for the length of the conversation, switched by emotion. **Secondary**: Power Up Audio's creative director, Kevin Regamey, in a thread (threadreaderapp blocked this session; quoted from search results).
- Lesson: the face carries the emotion. The box stays plain.

### Astro Bot and Astro's Playroom

- Astro "fundamentally does not talk". His sounds mix English with other languages. **Primary** ([PlayStation Blog, Astro's character design](https://blog.playstation.com/?p=395223); seen in search results).
- I could not verify how the tutorial bots in Playroom show text, or whether they use speech bubbles. From memory, most teaching is done with controller prompts and the world, not with dialogue boxes. **Unverified.**
- Lesson: Sony teaches with action first and words second. Kai's lines should stay short.

### Duolingo

- Duolingo drives each character's mouth "in sync with the audio" from per-word and per-phoneme timings. Mouth states run alongside body poses. Idle has "head nods, blinking, and eyebrows moving". **Primary** ([Duolingo blog, visemes](https://blog.duolingo.com/world-character-visemes)).
- In lessons the speech bubble appears whole, beside the character, with a tail pointing at it. The text does not type. **Unverified** (from use).
- Lesson: an app that reads fine without typing at all. The voice and mouth give life, not the letters.

### Apple: Messages and Siri

- Messages bubbles are shrink-wrapped to the text, with a large radius and a small curved tail at the bottom corner nearest the sender. In dark mode the received bubble is a mid grey with white text. **Unverified** (from use; no Apple spec for the exact radius).
- The typing indicator is a grey bubble with three dots that pulse in turn. Common CSS clones stagger the dots by about 200 ms. **Secondary** ([CodeMyUI iMessage clone](https://codemyui.com/?p=247)).
- Messages never types text letter by letter. A message appears whole. **Unverified** (from use).
- Siri on iOS 18 and later shows its reply as text in a rounded card, which fades in. **Unverified.**
- HIG, motion: "Don't add motion for the sake of adding motion. Gratuitous or excessive animation can distract people." And: "Aim for brevity and precision in feedback animations." **Primary** (HIG Motion, local copy in the apple-design skill).
- HIG, Reduce Motion: reduce "zooming, scaling, and peripheral motion", tighten springs "to reduce bounce effects", replace movement "with fades", and avoid "animating into and out of blurs". **Primary** (HIG Accessibility).
- HIG, dark mode: foreground layers use brighter "elevated" greys over a dim base. **Primary** (HIG Dark Mode). The UIKit dark values are `#1C1C1E` (systemGray6) and `#2C2C2E` (systemGray5). **Unverified** values, widely quoted.
- HIG, type: iOS body text is 17 pt by default, 11 pt minimum. **Primary** (HIG Typography).

### Accessibility and reading speed

- Game Accessibility Guidelines: "Instead of a timer, dismiss information on a player action", because "it is not possible to set a speed for text to be displayed which will be appropriate for all readers." **Primary** ([GAG](https://gameaccessibilityguidelines.com/allow-players-to-progress-through-text-prompts-at-their-own-pace/)).
- Sakurai (Kirby, Smash) made a video on text advancement (April 2024). He argues players should control how fast text streams in. **Secondary** ([GoNintendo](https://www.gonintendo.com/contents/34858-masahiro-sakurai-talks-text-speed-in-a-new-dev-video)); no transcript checked.
- Adults read English silently at about 238 words a minute (Brysbaert 2019 meta-analysis). That is about 20 to 24 characters a second, or 42 to 50 ms a character. **Unverified** in this session; from memory of the paper.

## The pattern across all of them

1. **The box is drawn at its final size before the text types.** Game boxes are fixed size. Text fills a box that never moves. Kai's box is the opposite.
2. **The box is quieter than the scene.** Zelda, Celeste and Undertale use dark boxes. Animal Crossing's cream box sits on a bright, busy world, so it is not loud there. On black, a white box is loud.
3. **The speaker owns the box.** A portrait, a name tab, or a tail. Kai has a corner that points nowhere.
4. **Typing is per character, fast, with pauses at punctuation.** 17 to 67 ms a character, plus a beat at commas and full stops.
5. **The player can always finish the line early.** First press shows the whole line. Second press moves on.
6. **The box enters once.** It does not bounce on every line. New lines replace text inside it.
7. **Apple does not type at all.** Messages and Duolingo show the line whole. Typing is a game habit. Kai can keep it because the mouth follows it, but it must be quick and calm.

## Recommendation for Kai

### Look

| Part | Value |
|---|---|
| Fill | `#2C2C2E` (one muted grey, one step above the `#1f1f22` inputs) |
| Text | `#F5F5F7`, contrast about 13:1 on the fill |
| Border, shadow, glow | none |
| Radius | `18px` on all four corners |
| Padding | `10px 14px` (setup), `12px 16px` (welcome) |
| Font, setup | `450 15px/1.4 var(--font)` (Inter Tight is variable; falls back to 400) |
| Font, welcome ask | `500 17px/1.35 var(--font)` (it is the only prompt on that screen, so a little larger) |
| Max width | `34ch` (about 300px at 15px) |
| Box sizing | `border-box` |
| Tail | a 10px square, rotated 45 degrees, same fill, its outer corner rounded 2px. It pokes 6px out of the bubble's left edge, at the bubble's vertical middle. |
| Hello step (bubble above Kai) | the same tail on the bottom edge, centred, pointing down |
| Light theme | fill `#E9E9EB`, text `#1D1D1F` |

### Where it sits

- To the right of Kai, 14px gap, vertically centred on Kai's face. The tail points at Kai.
- Not top-aligned with the head. The current top alignment makes the tail land on empty space.
- The voice button moves out of the flow: `margin-left: auto` at the right end of the Kai row. It must never ride on the bubble's width.

### Entry, change and exit

- **First line of a screen:** opacity 0 to 1, `translateX(-4px) scale(0.97)` to none. 200 ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`. `transform-origin` at the tail (left centre). No spring, no overshoot. Typing starts 120 ms in.
- **Next line on the same screen:** no re-entry. The old text fades out over 100 ms. The box tweens from its old size to the new line's final size over 200 ms, same curve. Then typing starts.
- **Leaving (screen change):** opacity to 0 over 150 ms. No scale.
- Drop the `pop` restart in `setupTab.ts` that bounces every line.

### Reveal rules

- **Per character**, so Kai's mouth stays in sync. Not per word.
- **32 ms a character** (about 31 a second). This is faster than reading speed, so nobody waits on the text. Keep `TYPE_MS` close to today's 34.
- **Pauses**, added after the mark when a space or the end follows it:
  - `,` `;` `:` and an em dash: 120 ms
  - `.` `!` `?`: 260 ms (skip it at the very end of the line)
  - `…`: 360 ms
- **Mouth:** keep `kai.voice(ch)`. During a pause the mouth stays shut. The talk ends 120 ms after the last letter.
- **Skip:** a click on the bubble, or Space or Enter while it types, shows the whole line at once. The next press does what the page's button does. Never block a button until typing ends.
- **No continue arrow.** Cluster's own buttons are the "continue". An arrow would repeat them.
- **Chained lines** (for example `later(2600, ...)` in setup): start the next line only after this one has finished typing, plus a reading hold of `max(1200, 50 × characters)` ms. A fixed delay can cut a line short.
- **Sound:** none by default. The page already offers a spoken voice. If blips are added later: one blip every second letter, none on spaces or punctuation, a short sine at about 600 Hz with ±5% random pitch, very quiet, only when the voice switch is on and speech synthesis is off.

### Keeping the box still

Put the whole line in the bubble before typing starts. Split it into two spans: the typed part, and the rest with `visibility: hidden`. Both spans are in the same text flow, so the line wraps exactly as the finished line will. The box never changes size while typing, and a half-typed word never jumps to the next line. Typing just moves the split point.

An overlay of the typed text on top of hidden full text does not do this. The overlay wraps on its own, so a half-typed word at a line end can sit on line one and then jump.

Screen readers: put the full line once in a visually hidden `aria-live="polite"` span. Mark the visible spans `aria-hidden="true"`. Today the live region changes 30 times a second.

### Reduced motion

- No typing. The full line appears with a 150 ms opacity fade.
- No scale, no slide. The box size changes at once between lines, under the fade.
- Kai's mouth talks for a short fixed time (about 600 ms), as now with `talk()`.
- This matches HIG: replace movement with fades, no zooming or scaling.

## Snippet

HTML:

```html
<div class="kai-row">
  <div class="kai" aria-hidden="true"><!-- Kai --></div>
  <p class="kai-bubble">
    <span class="kai-said" aria-hidden="true"><span class="kai-on"></span><span class="kai-off"></span></span>
    <span class="sr-only" aria-live="polite"></span>
  </p>
  <button class="kai-voice" type="button" aria-pressed="false" aria-label="Kai's voice">…</button>
</div>
```

CSS:

```css
.kai-row { display: flex; align-items: center; gap: 14px; }
.kai-voice { margin-left: auto; } /* never rides on the bubble's width */

.kai-bubble {
  --kai-fill: #2C2C2E;
  position: relative;
  box-sizing: border-box;
  max-width: 34ch;
  margin: 0;
  padding: 10px 14px;
  border-radius: 18px;
  background: var(--kai-fill);
  color: #F5F5F7;
  font: 450 15px/1.4 var(--font);
  transform-origin: 0 50%;
}
/* Tail: a rounded 10px diamond, 6px out of the left edge, at the middle. */
.kai-bubble::before {
  content: "";
  position: absolute;
  left: -4px;
  top: 50%;
  width: 10px;
  height: 10px;
  margin-top: -5px;
  background: inherit;
  border-radius: 0 0 0 2px;
  transform: rotate(45deg);
}
.kai-bubble.is-in { animation: kai-in 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.kai-off { visibility: hidden; }
@keyframes kai-in { from { opacity: 0; transform: translateX(-4px) scale(0.97); } }

@media (prefers-reduced-motion: reduce) {
  .kai-bubble.is-in { animation: kai-fade 150ms ease both; }
}
@keyframes kai-fade { from { opacity: 0; } }

/* Light theme */
:root[data-theme="light"] .kai-bubble { --kai-fill: #E9E9EB; color: #1D1D1F; }
```

JS (the reveal rules; replaces both `say()` bodies):

```js
const TYPE_MS = 32;
const PAUSE = { ",": 120, ";": 120, ":": 120, "—": 120, ".": 260, "!": 260, "?": 260, "…": 360 };
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let timer = 0;

async function say(bubble, text, kai) {
  const on = bubble.querySelector(".kai-on"), off = bubble.querySelector(".kai-off");
  clearTimeout(timer);
  const first = !on.textContent && !off.textContent;
  if (!first && !reduced) await on.animate([{ opacity: 1 }, { opacity: 0 }], 100).finished;
  const before = bubble.getBoundingClientRect();
  on.textContent = ""; off.textContent = text;               // final size and wrap, now
  bubble.querySelector(".sr-only").textContent = text;
  const after = bubble.getBoundingClientRect();
  if (first || reduced) { bubble.classList.remove("is-in"); void bubble.offsetWidth; bubble.classList.add("is-in"); }
  else bubble.animate([{ width: `${before.width}px`, height: `${before.height}px` },
                       { width: `${after.width}px`, height: `${after.height}px` }],
                      { duration: 200, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
  if (reduced) { on.textContent = text; off.textContent = ""; kai?.talk(600); return; }
  let n = 0;
  const step = () => {
    n += 1;
    on.textContent = text.slice(0, n); off.textContent = text.slice(n);
    const ch = text[n - 1];
    kai?.voice(ch);
    if (n >= text.length) return;
    const pause = text[n] === " " ? PAUSE[ch] ?? 0 : 0;   // only between words, never at the end
    timer = setTimeout(step, TYPE_MS + pause);
  };
  timer = setTimeout(step, first ? 120 : 200);
  bubble.onclick = () => { clearTimeout(timer); n = text.length - 1; step(); };  // skip to the full line
}
```

Notes on the snippet:

- During the size tween the hidden text already has its new wrap, so nothing visible reflows. Add `overflow: hidden` during the tween if the tail clips oddly; the tail sits outside, so prefer leaving it off and testing.
- The skip handler covers clicks. Hook Space and Enter on the page the same way while typing.
- `.sr-only` is the usual visually hidden class. Check the codebase has one before adding another.

## Not verified

- Exact box shapes, colours and arrows for Animal Crossing, Zelda, Undertale, Celeste and Pokémon. From play, not from a source.
- How Astro's Playroom tutorial bots show text, if they do.
- Apple's exact Messages bubble radius, tail shape and dark grey. No Apple spec found.
- Undertale's real per-character rate. Only the CYF clone's default was found.
- The 238 words a minute figure (Brysbaert 2019) was not re-checked.
- Celeste's audio thread and Bulbapedia were blocked this session; quoted from search results only.
- The Game UI Database and interfaceingame.com pages were not reached.
