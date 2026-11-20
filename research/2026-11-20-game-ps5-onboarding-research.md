# Onboarding like a game: Appcues, the PS5 setup, and game tutorials (2026-11-20)

Research only. No code changed. Written on branch `feat/speed-domains-2026-11`.

This file does not repeat two earlier files. `2026-11-15-kai-duolingo-onboarding.md` covers Duolingo and Kai as a narrator. `2026-11-20-kai-alive-games-research.md` covers how Kai's body and eyes feel alive. This file is about the flow: the screens, the choices, the progress, and the ending.

Status key used below. **Read** means I read the page myself. **Snippet** means I only saw a search summary. **Unverified** means I could not find a source and it comes from the brief or from memory.

## Summary

- **How the PS5 setup ends.** Sony's own Quick Start Guide splits setup into three parts: "Set up your console", "Set up your account" and "Download your content". It then says: "You'll know that setup is complete when Welcome to PlayStation 5 appears on your screen." So the ending is a named welcome moment, and then the home screen. It is not a summary page or a form.
- **The PS5 ends with a gift, not a tour.** Every PS5 ships with Astro's Playroom "pre-loaded". It was "created from the ground up as a showcase for the DualSense". The console teaches its new controller by letting you play, after setup is done.
- **The labelling screen.** Big tiles, one per Cluster label, each with its emoji, its name, a short example from the user's own mail, and a round check. All start ticked. "Continue" saves. "Do this later" keeps the defaults. A small step indicator sits bottom left. Unticked tiles map to the setting that already exists: `autoSort.labelsOff`.
- **The ending for Cluster.** A last, quiet "Welcome to Cluster, Samuel" screen. It shows what the user now owns: the labels made and the mail sorted. Then Kai leads into Home, where the first thing in focus is that same result.
- **The top other changes** are: let the user apply the first label by hand, offer help when someone idles (the PS5 turns on its screen reader after 60 s), end on something the user owns (a link into Gmail), and swap the five-stop tour for tips in context.
- **What I could not verify.** No PlayStation page or walkthrough I could open describes the tile picker with check boxes, the "Download Media Apps" title, or the bottom-left step indicator. Those parts come from the brief. The sound and particle details are only from snippets.

## Part 1. Appcues: "Best User Onboarding Examples: 7 Patterns From 12 Products"

Source: [appcues.com/blog/best-user-onboarding-examples](https://www.appcues.com/blog/best-user-onboarding-examples), Sara Detrik, 19 August 2026. **Read.**

### The 12 examples

| Product | What it does | The lesson it draws | Fits Cluster? |
|---|---|---|---|
| Duolingo | First lesson before the account | "The sequencing is the whole trick." Put the visible result before sign-up | Partly. Cluster needs Gmail to read mail. But the label demo can run before sign-in. |
| Airtable (Omni) | Builds a base from a description | One imperfect starting point beats many options | Yes. The tile picker starts with Cluster's guess, all ticked. |
| Clay | Survey answers build the first workflow, shown for the user to check | A survey must change the product, or it is "a tax" | Yes. Each tile choice changes `labelsOff`. The name question changes little. |
| Linear | No tour. Tasks arrive as real issues | For fluent users, "guidance is friction" | Yes, for the tour. See change 5. |
| Notion | Live preview of the workspace while you answer | "Even a low-fidelity preview is better than a progress bar." | Yes. Tiles show counts from the user's own newest 100 emails. |
| Canva | The home page is the onboarding | Put the first real action where people land | Partly. Overview is where the result should show. |
| ChatGPT | Almost no onboarding. Learns from use | Infer instead of asking. Be careful with defaults that keep data | Yes, the caution. Cluster already learns from moves in Gmail. |
| Cursor | Imports VS Code settings in one click | "Build the importer before you build the tour." | Yes. Cluster's import is the user's existing Gmail labels. |
| Perplexity Comet | Imports the browser profile | Ask what users already have elsewhere | Same as Cursor. |
| Calendly | Ends when the user has a working link | Complete means something the user owns, not a flag the system sets | Yes. This shapes the ending. See Part 4. |
| Productboard | First checklist item is already ticked | People finish more often when they don't start from zero | Yes. The step indicator starts with "You" checked. |
| HubSpot | Checklists branch by role | Start with two paths, not six | Weak fit. Cluster has one path plus "I'll set it up myself". |

### The patterns it recommends

1. The first action should make something real.
2. Show value before the sign-up wall.
3. Let the product do the setup while the user edits.
4. Personalization should change the product, not just the copy.
5. Importing beats configuring.
6. Count the steps to the payoff and cut one each cycle.
7. Use cheap tactics like endowed progress and role paths.
8. Measure activation and 90-day retention, not checklist completion.

Patterns 1, 3, 4, 6 and 7 apply directly. Pattern 2 is limited by Gmail sign-in, but the scan already runs in the background from the moment of sign-in, which is the next best thing.

## Part 2. The PlayStation 5 first-time setup

### Sources

| Source | Status | What it gives |
|---|---|---|
| [Sony, PS5 Digital Edition Quick Start Guide (PDF, 2020)](https://www.playstation.com/content/dam/global_pdc/en/corporate/support/manuals/ps5-docs/1000b-digital-edition/CFI-10XXB_PS5_Quick_Start_Guide_EN_EXP.pdf) | **Read** | Step 7 "Make it your own": the three setup parts, the ending line, the 60 s screen reader, "tailored to your needs", the home screen image |
| [Sony support, "Getting started with your new PS5 console"](https://www.playstation.com/en-us/support/hardware/ps5-get-started-set-up/) | **Read** | The on-screen order of part 1, then sign-in |
| [Sony support, "Getting ready for your PS5"](https://www.playstation.com/en-us/support/getting-ready-for-ps5/) | Snippet | Make the account early in a browser. A "Do This Later" option exists for account upgrade |
| [PlayStation Blog, Hideaki Nishino, "First look: PlayStation 5's next-generation user experience" (15 Oct 2020)](https://blog.playstation.com/2020/10/15/first-look-playstation-5s-next-generation-user-experience/) | **Read** | Design goals: speed, "the less time you spend waiting… the more time you will have to spend playing games." Nothing on setup |
| [PlayStation Blog, Nicolas Doucet, Astro's Playroom (11 Nov 2020)](https://blog.playstation.com/?p=343436) | **Read** | "comes pre-loaded in every PS5", "created from the ground up as a showcase for the DualSense wireless controller" |
| Matt MacLaurin (SIE VP of UX) LinkedIn comments, via [Tom's Guide](https://www.tomsguide.com/news/ps5-interface-design) and [Engadget](https://www.engadget.com/the-ps5-dashboard-will-have-a-whole-new-visual-language-122943960.html) | Snippet | "more subtle than flashy but no pixel is untouched". Experience goals "measured in milliseconds". The original post was deleted |
| [TechRadar, "How to set up a PS5 Pro"](https://www.techradar.com/gaming/how-to-set-up-ps5-pro) | **Read** | "a very cool graphic as the Pro gets going". Data transfer "can complete this step later". Ends with "you're then all ready to go!" |
| [Press Start, "Here's the PS5 boot screen"](https://press-start.com.au/news/playstation/2020/11/06/heres-the-ps5-boot-screen/) | **Read** | 18 s from power to UI. No description of the visuals |
| PlayStation Lifestyle, "PS5 First Boot Start-up Screen" | **Not read** (connection reset) | Says many owners never saw the first-boot animation |
| A launch write-up of the boot sequence | Snippet, outlet not identified | "a dark void, peppered with dust particles, shifts… as we hear several pleasant tones ring out" |
| GDC Vault or a talk by the PS5 UX team on setup | **Not found** | No public talk on the setup flow turned up |

### Every screen in order

Rows marked **Sony** are from Sony's own pages. Rows marked **brief** come from the task brief or memory and are unverified.

| # | Part (Sony's name) | Screen | Source |
|---|---|---|---|
| 0 | | Power on. The light blinks blue, then white. A first-boot animation plays | Sony (light). Animation: snippet |
| 1 | Set up your console | Connect the controller by USB, press the PS button | Sony |
| 2 | | If nothing is pressed for 60 s, the screen reader turns on by itself | Sony |
| 3 | | Language | Sony |
| 4 | | Internet connection | Sony |
| 5 | | System software update, then a restart | Sony; restart per TechRadar |
| 6 | | Display settings (screen size, HDR) | Sony; TechRadar |
| 7 | | Rest Mode power options. Default is Low Power Use | Sony |
| 8 | | User agreement | Sony |
| 9 | Set up your account | Sign in, by QR code from the PlayStation App or a link, or create an account | Sony; TechRadar |
| 10 | | Privacy and data choices | Third-party guides only |
| 11 | Download your content | Transfer data from a PS4 or PS5. Skippable, "can complete this step later" | Sony; TechRadar |
| 12 | | Download purchased games and media apps. Tiles with check boxes, a Download button and Do This Later | Sony names the step. The tile layout is **brief** |
| 13 | End | "Welcome to PlayStation 5" | Sony |
| 14 | | Home screen, games home. Astro's Playroom is already installed | Sony |

Sony adds two notes that matter for Cluster. "The setup options that you see are tailored to your needs, based on information such as your network environment and the account that you're signed into." And: "You can go back and change any of your settings by selecting Settings from the home screen."

### How choices are presented

- **Big focusable tiles.** On a console every choice is a large target reached with the D-pad. Focus is the main state. The focused tile is visibly larger and outlined. (Seen on the home screen image in the Quick Start Guide. The setup tiles themselves are **brief**.)
- **Check boxes on tiles, two buttons below.** For the content step, each app or game is a tile with a check. A primary button acts on the ticked tiles. A second button, "Do This Later", moves on with nothing lost. (**Brief.** Sony confirms "Do This Later" as wording it uses for a deferred account step.)
- **Defer, never refuse.** Data transfer, two-step verification and downloads can all be put off. The settings stay reachable from the home screen. (Sony; TechRadar.)
- **Tailored.** Sony shows only the options that fit the user's network and account. (Sony.)

### The step progress, bottom left

Per the brief: done parts show a checkmark, the current part shows its name, and a thin bar shows progress through it. **Unverified.** I could not find an image or text source. Sony's three part names ("Set up your console", "Set up your account", "Download your content") match the idea of a few named parts, so the indicator most likely names those three. That match is my inference.

What makes it work, as described: it is small and out of the way. It counts parts, not screens, so a part with many screens does not feel long. The checks are a quiet record of what is done.

### Sound, motion and the particle background

- **Particles.** The home screen image in Sony's guide shows a dark, speckled, starry backdrop behind the game art. A launch write-up (snippet) describes "a dark void, peppered with dust particles" at boot that "shifts" while "several pleasant tones ring out".
- **Sound.** PS5 menus make short soft tones on focus and select. **Unverified** beyond the snippet above. I found no interview with the system sound designer.
- **Speed as feel.** MacLaurin's team set "experience goals" measured in milliseconds (snippet). Nishino: "the less time you spend waiting to interact with the system, the more time you will have to spend playing games." (Read.) Fast response is part of what feels good.
- **Restraint.** MacLaurin called it "more subtle than flashy" (snippet). The calm reading fits Cluster's rules.

### How it ends

1. The last setup step is the content step. It can be deferred.
2. The screen says **"Welcome to PlayStation 5"**. Sony uses this line as the definition of done. (Sony.)
3. The console moves to the home screen. The home screen is already full: game tiles across the top and a large hub with art behind them. (Sony's guide image.)
4. A game is waiting. Astro's Playroom is installed on every PS5 and teaches the new controller through play. (PlayStation Blog.)
5. The transition itself (a fade, a sweep of particles, a chime) is **unverified**.

Why it feels good, as far as the sources go:
- **A named arrival.** "Welcome" marks a clear line between setting up and using. The user knows they are done.
- **No empty room.** The home screen is not blank. It already holds their things or a gift.
- **The next step is play, not a lecture.** There is no tour. The controller is taught by a game the user chooses to open.
- **Nothing is lost by skipping.** Every deferred choice sits in Settings, and Sony says so.

### Astro's Playroom as the handoff

Doucet's post calls it "a showcase for the DualSense" and says the team "spent a couple of years experimenting" and kept "the best examples". Coverage of a Famitsu interview says the game helped refine the controller "for nearly two years" ([VGC](https://www.videogameschronicle.com/news/astros-playroom-designer-says-bundled-ps5-game-helped-iterate-dualsense-for-nearly-two-years), snippet). The lesson for Cluster: the tutorial is a short, safe thing to do, waiting on the home screen, not a set of slides.

## Part 3. How games onboard players and feel alive

| Idea | Source | Status | What it says |
|---|---|---|---|
| Teach by doing | [Apple HIG, Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) (local copy in the apple-design skill, updated 2024-06-10) | **Read** | "Teach through interactivity… where people can safely test an action." Make onboarding "fast, fun, and optional". "Postpone nonessential setup… Provide reasonable default settings." "Consider providing a collection of context-specific tips instead of a single onboarding flow." |
| First minute: Mario 1-1 | Miyamoto and Tezuka, Eurogamer video (Sept 2015), via [Game Developer](https://gamedeveloper.com/design/how-miyamoto-built-i-super-mario-bros-i-legendary-world-1-1) and [HotHardware](https://hothardware.com/news/gaming-legend-shigeru-miyamoto-explains-design-philosophy-behind-super-mario-bros-world-1-1) | Snippet | 1-1 was built so players "gradually and naturally understand what they're doing". The first enemy is a Goomba, not a Koopa, because a harder first enemy would frustrate. They made small Mario first so players would "feel satisfied" with big Mario. I did not read a transcript |
| One skill at a time | Kim Swift (Portal), ["10 years of design lessons"](https://gamedeveloper.com/design/10-years-of-design-lessons-from-em-portal-em-s-kim-swift), Game Developer | **Read** | "Teach a skill by itself, with very few distractions. Then you reinforce it." Show it "again and again… a little more challenging". Then combine skills into an "a-ha moment". On confused players: "It's not the player's fault, it's your fault." |
| Playtest the teaching | [Portal GDC 2008 post-mortem slides](https://cdn.fastly.steamstatic.com/apps/valve/2008/GDC2008_PortalPostMortem.pdf); [Portal developer commentary](https://theportalwiki.com/wiki/Portal_developer_commentary) | Snippet | "Playtesting was extremely important to both our gameplay and our story." Early builds let players "stumble through the beginning… without always understanding". Players "will rarely look up" without a prompt |
| Forgiveness | Maddy Thorson, ["Celeste & Forgiveness"](https://maddymakesgames.com/articles/celeste_and_forgiveness/) | **Read** | Ten small helps such as coyote time and jump buffering, "so that everything is fudged a tiny bit in the player's favor". The game feels kind because "it wants you to succeed." |
| Pacing in four beats | Koichi Hayashida on kishōtenketsu (Super Mario 3D Land), via [Kotaku](https://kotaku.com/how-drawing-comics-helped-shigeru-miyamoto-make-great-m-5901805) | Snippet | Introduce, develop, twist, conclude. Each level teaches one idea that way |
| Game feel | Steve Swink, *Game Feel* and ["Game Feel: The Secret Ingredient"](https://GamaSutra.com/design/game-feel-the-secret-ingredient) | Snippet | Feel is real-time control plus "polish". Polish "sells interaction" by giving clues about what happened |
| Juice, and its limit | Jonasson and Purho, ["Juice It or Lose It"](https://gdcvault.com/play/1016487/Juice-It-or-Lose), GDC Europe 2012; counter talk ["Don't Juice It or Lose It"](https://gdcvault.com/play/1020861/Don-t-Juice-It-or) | Snippet; counter talk **not read** | Juice is feedback that wobbles and makes small sounds. Cluster's rules keep only the useful half: every input gets a fast, clear answer, with no confetti or glow |
| Celebrate the first success | Duolingo (covered in the 2026-11-15 file) | Read earlier | Big celebrations only for milestones |

The common thread: one idea per screen, done by the user, with a forgiving default and a fast response. The reward is the result itself.

## Part 4. Recommendations for Cluster

### What exists today (from the code)

- `welcome.ts`: hello (Kai wakes, two lines, Get started), name, email plus Google sign-in. A thick bar along the top counts 6 steps (`ONBOARDING_STEPS`).
- `setupTab.ts`: hello ("You're in"), label demo (one Amazon email gets 📦), scan of the newest 100 emails (10 s cap, starts at sign-in), "I found these" board with "Yes, use these", "Change some" and "No, ask me first". Then `finish()` says "Okay, let's go to your dashboard!", Kai celebrates, 1.6 s wait, Overview, and the tour.
- `dashboardTour.ts`: five spotlight stops with Next and Skip.
- There are 13 sort buckets (`ALL_SORT_BUCKETS` in `sortTaxonomy.ts`). `autoSort.labelsOff` already turns a bucket off, and the Labels page writes it. So the tile picker needs no new setting.
- Cluster has no UI sounds. Kai has an opt-in voice ("Hear Kai").

### A. The new screen: "How labelling works"

**Place.** Right after "This is a label", in place of its "Got it". The user has just seen one label land. The next thing is to choose which labels they want. The scan runs in the background from sign-in, so by this screen some counts are known.

**Layout (desktop, the setup pane as today).**

```
 [Kai] "These are the labels I use. Untick any you don't want."

  Pick your labels

  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │ 🧾        (✓)│ │ 📦        (✓)│ │ 📰        (✓)│ │ 🔑        (✓)│
  │ Receipts     │ │ Orders &     │ │ Newsletters  │ │ One-time     │
  │ Apple, Uber  │ │ shipping     │ │ The Verge    │ │ codes        │
  │ 6 emails     │ │ Amazon · 4   │ │ 11 emails    │ │ 3 emails     │
  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │ 🏷 Promotions │ │ 💬 Social    │ │ 💳 Finance   │ │ 🧳 Travel    │
  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
  More labels (5)

                                   [ Continue ]   Do this later

 ✓ You  ✓ Gmail   Labels
                  ▬▬▬▬▬▬▬▬────────
```

**Tiles.**
- One tile per bucket. The top 8 show by default: Receipts, Orders & shipping, Newsletters, One-time codes, Promotions, Social, Finance, Travel. "More labels" opens the other 5 (Shopping, Work, Education, Accounts, Jobs) in place. Progressive disclosure, as Apple advises against teaching too much at once.
- Order by how much of the user's newest 100 emails would land there, highest first. Sony: options "tailored to your needs". Notion: a live preview beats a progress bar. Before the scan has counts, use the fixed order above and fill counts in when they arrive, without moving tiles that are already on screen.
- Each tile holds the label's own emoji (from `showLabel`, so renames are honoured), its name, and one small line from the user's mail: up to two sender names and a count, such as "Amazon, DHL · 4". With no mail yet, show nothing rather than a made-up example.
- All tiles start ticked. Apple: "Provide reasonable default settings." Airtable and Productboard: start from a guess, not from zero.
- A round check sits top right. Ticked: filled with the one muted accent and a white tick, tile border in the same accent at 1.5 px. Unticked: an empty grey ring, neutral border, the content at full strength (not faded, so it still reads as a choice).
- The whole tile toggles. It is a `button` with `aria-pressed`. The tile grid is a `role="group"` named "Labels".

**Buttons.**
- Primary: **Continue**. It saves unticked buckets to `autoSort.labelsOff`, then goes on to the scan.
- Secondary text button: **Do this later**. It keeps all labels on and moves on. Kai says once that the choice lives in Labels. Like the PS5, later means later, not never.
- There is no third button. "I'll set it up myself" stays in the top bar as today.
- If every tile is unticked, Continue still works. Kai says: "Okay. I'll leave all your mail in the inbox." No error state.

**Kai on this screen (one beat per event).**
- On open: "These are the labels I use." Then, after 2.4 s: "Untick any you don't want."
- First tile turned off: Kai looks at it and does `nodSmall`. "Okay. Receipts stay in your inbox." Later toggles get a glance only, no line. This keeps to "one Kai beat per event" from the 2026-11-15 plan.
- A tile turned back on: a glance and a small nod. No line.
- On "More labels": Kai glances down at the new row.
- On Continue: "Got it. Let's see your mail."

**Feel, within Cluster's rules.**
- Press: the tile scales to 0.98 for 90 ms and springs back with the existing `SPRING` curve. The check draws in 160 ms. No glow, no colour flash.
- Focus is a first-class state, as on a console. A visible 2 px focus ring in the accent. Arrow keys move between tiles (a roving `tabindex`), Space toggles, Enter on a tile toggles, and Enter on Continue continues.
- Hover: Kai's eyes follow the hovered tile with the 200 ms delay already used on the hello screen.
- Reduced motion: no scale or draw. The check appears at once. Kai keeps mood changes only.
- Every press answers within one frame. MacLaurin's "experience goals measured in milliseconds" and Swink's "polish sells interaction" both point here.

**Copy, all of it.** Title "Pick your labels". Kai lines as above. Buttons "Continue", "Do this later", "More labels". No subtitle, no reassurance line.

**Cost: M.** One render function in `setupTab.ts` (a new step between `label` and `scan`), CSS for the tile grid, and a `labelsOff` write. The counts reuse `practiceGuess` on `readMail`.

### B. The step indicator, bottom left

Replace the thick top bar in setup (and in the welcome, for one look) with a small indicator at the bottom left of the pane.

- Four named parts: **You** (name), **Gmail** (sign-in), **Labels** (label demo, picker), **Your mail** (scan, found). The finish screen completes the last part.
- Done parts: a small check and the name in secondary grey. The current part: its name in the primary text colour, and a 2 px bar under it, filled by screens done within the part. Parts still to come are not shown. The user sees where they are, not how far is left.
- "You" is already checked when setup starts. Productboard's endowed progress.
- When a part completes, its bar fills, the name slides left 8 px and turns grey, and a check draws in. 240 ms. Reduced motion: the state just changes.
- `role="progressbar"` stays on the thin bar, with `aria-valuetext` such as "Labels, step 2 of 4".

**Cost: S.** `progressBar()` in `welcome.ts` is the one place both flows call.

### C. How Cluster's onboarding should end, PS5 style

Today the end is a button label change ("All set"), a Kai line, a 1.6 s wait, a cut to Overview, and a five-stop tour. It works but it has no arrival.

The new ending, in three beats:

1. **The work, shown.** After the last choice, the button reads "Setting up…" as today, and Kai says "Making your labels." The step indicator's last bar fills as labels are created.
2. **The welcome screen.** One calm screen in the setup pane. Kai in the middle, settled, `happy` mood, a single `nod` (not `celebrate`). Title: **"Welcome to Cluster, Samuel."** One line under it with what the user now owns, from real numbers: "9 labels in your Gmail. 64 emails sorted." The step indicator shows all four checks. Two buttons: **Go to Cluster** (primary) and **See it in Gmail** (text link, opens Gmail on the first label). Kai's line: "That's it. I'll keep sorting new mail for you."
   - Sony defines done by this kind of screen. Calendly defines done by something the user owns. The Gmail link proves the result is real, in the product they already use.
3. **Into Home.** On Go to Cluster, the setup pane fades out over 300 ms while Overview fades in under it. Kai moves from the centre to its spot in the top bar, the one existing motion that links the two places. Home opens with its first card in focus: the labels just made, with their counts. No tour starts. Instead, the first time the user opens each page, Kai says that page's one tour line (see change 5).
   - If Home is still on its first-read screen (`afterFirstRead`), the welcome screen waits with the button live, so the user never lands on a loading page.

What to leave out: confetti, a glow, a fanfare, a summary list of every setting. The PS5 ends on a word and a full home, not a recap.

Optional, only with "Hear Kai" on: one soft two-note chime on the welcome screen. Cluster has no other UI sound, so this is the only place it would earn its keep. Cost S. I would test it before shipping.

**Cost of C: M.** A new final render in `setupTab.ts`, a change to `finish()`, and a small change in the tour start.

### D. The 8 best other changes

| # | Change | Why (source) | Cost |
|---|---|---|---|
| 1 | **Let the user apply the first label.** On "This is a label", the label sits beside the Amazon email and the user taps it (or drags it) onto the mail. Kai says "Now you try." Then it lands as today. | Apple: "Teach through interactivity… safely test an action." Swift: teach one skill alone first. Mario 1-1 teaches by a safe first action. | S |
| 2 | **Help when someone idles.** After 20 s with no input on a setup screen, Kai offers once: "Want me to read this out?" with the voice button lit. Once per screen, never while typing. | Sony: after 60 s idle at first boot, "the screen reader turns on". Uses the existing voice and the stuck-detection caps. | S |
| 3 | **Back on every setup screen.** Setup has no Back today; welcome does. Add it to label, picker and found. | Celeste: "fudged a tiny bit in the player's favor". Sony: you can change any setting later. Forgiveness keeps people moving. | S |
| 4 | **Forgiving inputs.** The email field accepts a bare name ("samuel") and offers "samuel@gmail.com". Trailing spaces and capitals are ignored. | Celeste's small helps, applied to forms. Every failed Continue is a moment of friction. | S |
| 5 | **Swap the five-stop tour for first-visit lines.** Each page's tour line plays once, the first time the page opens, as a Kai bubble with no spotlight. | Apple: "a collection of context-specific tips instead of a single onboarding flow". Linear: "guidance is friction". The PS5 ends without a tour. | M |
| 6 | **Cut the setup hello.** Kai already said hello in the welcome. "You're in, Samuel" plus "Hi Samuel! I'm Kai" repeats it. Go straight from sign-in to "This is a label", with Kai's line "You're in. Let me show you how I sort." | Appcues: count steps to the payoff and cut one each cycle. Apple: brief, without much to remember. | S |
| 7 | **A quiet first success after setup.** The first time the one-hour sweep moves mail, Kai says once on Home: "Your first 12 emails moved to their labels." A `nod`, no `celebrate`. | Miyamoto made small Mario first so the change would "feel satisfied". Duolingo keeps big moments for milestones. The real payoff happens after setup ends, so mark it. | M |
| 8 | **Press and focus feel on every setup control.** A 0.98 press scale, a visible focus ring, Enter and arrow keys everywhere, and no wait without a visible answer. | Swink: polish "sells interaction". MacLaurin: goals "measured in milliseconds". Nishino: less waiting. | S |

Left out on purpose: confetti, particle backgrounds and glows (Cluster's rules), a privacy step (Cluster's privacy note already sits on the sign-in screen), and a role branch like HubSpot's (one audience).

## Unverified or missing

- **The PS5 tile picker** with check boxes, the title "Download Media Apps", and the Download and Do This Later buttons on that screen. Sony confirms a "Download your content" step for "purchased PS5 games and media apps". The layout and wording come from the brief.
- **The bottom-left step indicator** (checks, current part name, thin bar). No source found. That it names Sony's three parts is my inference.
- **Sound and particles.** Only a snippet from an unnamed launch write-up, plus the starry backdrop in Sony's home screen image. No sound designer interview found.
- **The transition** from "Welcome to PlayStation 5" into the home screen, and whether Astro's Playroom is in focus when home first opens. Not found.
- **The exact screen order** between the user agreement and sign-in may vary by system software version. TechRadar and Sony both say so.
- **Miyamoto's 1-1 quotes** come from coverage of the Eurogamer video, not a transcript.
- **GDC Vault** talks were not opened. Pages are behind a login or reset the connection.
