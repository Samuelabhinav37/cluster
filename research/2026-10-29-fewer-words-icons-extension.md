# Fewer words, icons, and extension design (2026-10-29)

Sources read: Qlik "Dashboard design" (7 practices), RonDesignLab "7 key elements of a user
dashboard", Noun Project "How to use icons in UI and UX", Peakboard "The meaning of icons in
dashboard design", Chrome "Best practices" (developer.chrome.com/docs/webstore/best-practices),
NN/g "Concise, scannable, and objective" and "UI copy".

Not read: DataCamp and phData (pages came back empty), both Medium posts (iq-design 5 UX tips,
interface-design ultimate guide; blocked to scripts, need opening in a browser). The YouTube link
(5H7ojeeDk5M, "How To Design A Better Extension", Resi) is about house extensions, not browser
extensions.

## Fewer words

| Finding | Source | For Cluster |
|---|---|---|
| Concise text scored 58% better on usability, scannable 47%, both plus objective 124% | NN/g study, 81 users | Keep the word budget test (wordBudget.dom.test.ts) and keep lowering ceilings |
| Commands are 2 to 4 words, verb first, no articles | NN/g UI copy | "Clear 30", "Turn on", "Let in" are right. Check rows like "Stop this mail" stay ≤4 words |
| Label says the state you move into, not the current one | NN/g UI copy | Switches and toggles: "Pause sorting" while on, "Resume sorting" while paused |
| Never "OK" in confirms; name the action | NN/g UI copy | Confirms already say "Move 30 to Trash". Keep a test that no button reads OK (0 today) |
| Same command, same word everywhere | NN/g UI copy | One verb per action: Trash, Unsubscribe, Mute, Archive. Never "Delete"/"Remove"/"Clear out" for the same thing |
| No branded terms in commands | NN/g UI copy | "Ask Kai" is fine as a name; actions never say "Cluster-ify" style words |
| Tooltips explain icon buttons | NN/g, Noun Project | See icons below |
| Pick the few metrics; users ask for "everything" | Qlik #3 | Home keeps four parts, each one number |
| Top-left is read first, then across, then down | Qlik #6 | Kai's verdict top-left stays |
| Words become shapes: an up arrow replaces "increased compared with" | Peakboard | Delta chips "↑ 18%" replace "18% lighter inbox than last week" |

Ways to cut words, in order:
1. Delete the sentence if the number or chart already says it.
2. Replace a comparison sentence with a delta chip (↑ 18% vs last week).
3. Replace a status sentence with a colored dot or pill plus one word (Held, Safe, New).
4. Move the explanation into a tooltip or the confirm sheet, where it's read when needed.
5. Turn a list of counts into one chart with a one-line caption (Kai's sentence).

## Icons

| Rule | Source | Cluster today | Do |
|---|---|---|---|
| Use conventional icons; don't invent | Noun Project #1, Peakboard | Mostly Lucide, conventional | Keep. Trash = bin, Unsubscribe = envelope with slash, Mute = bell-off, Protect = shield |
| Labels by default; icon-only only with tooltips | Noun Project #2 | Sidebar ≤1000px hides labels with font-size 0 and has no tooltip | Add a hover/focus tooltip to rail items |
| One style: filled or outlined, not both in one area | Noun Project #3 | Sidebar squircles filled, row icons outlined Lucide, Home v2 mockup filled glyphs | Filled glyph on squircle = "place" icons (sidebar, Home, page titles). Outline Lucide = actions in rows and buttons. Never mix inside one list |
| Same size and alignment; under 16 to 20px loses detail | Noun Project | Mixed 16/17/20px | Two sizes only: 16px in rows and buttons, 21px glyph in 36px squircle |
| States: default, hover, pressed, disabled visible | Noun Project #5 | Button system exists | Check icon-only buttons (⋯, Details tab, close) have hover and pressed |
| Color sparingly; red and green carry meaning | Peakboard, Qlik "Get color right" | Matches the existing restraint rule | Gray icons in lists, place colors only on sidebar/titles/Home, red only for scams |
| Icon plus color plus word for status, not color alone | Peakboard accessibility | Risk pills have words | Keep the word in every pill for color-blind users |

## Chrome extension design (Chrome's own guidance)

| Chrome says | For Cluster |
|---|---|
| Store listing sets expectations; say exactly what it does. Screenshots and a video, not blurry or busy | Listing description is long. One-line: "Clean up Gmail and catch scams, in your browser." Five screenshots, one per place, each with a 4-word caption |
| Follow permission warning guidance to raise installs | Ask for Gmail scope at sign-in with one sentence why; optional permissions (notifications) only when the feature is switched on, as today |
| A persistent UI (side panel) helps users finish tasks with as little distraction as possible | If a side panel comes later, it shows only Home's verdict and Next up, not all five places |
| Sign in with Google is preferred | Already the path; keep the split sign-in page |
| Privacy tab must match the privacy policy | Re-check after the Gmail web sign-in helper (the Worker sees tokens) before publishing |
| Choose the right category | Workflow & Planning, or Privacy & Security if scam checks lead the listing |
| Test end to end (Puppeteer) | We have DOM tests; a real-Chrome smoke test of the built extension is missing |
