# Onboarding audit against big apps (Mobbin, 2026-11-20)

Cluster's onboarding as of 4af1aed, compared with web onboarding flows on Mobbin.
Every claim about another app comes from the Mobbin screens linked below.

## What was looked at

| App | Flow | Link |
|---|---|---|
| Stripe | Sign-up, two setup questions, dashboard with setup guide | [flow](https://mobbin.com/flows/ce791608-31e6-4bff-8ac0-b9cb0803de2f) |
| Notion | Sign-up, profile, "What's on your mind?", welcome page | [flow](https://mobbin.com/flows/bf180963-e053-4aab-bab3-8e4ce633b888) · [team flow](https://mobbin.com/flows/6a0c0bb0-ec58-437a-be74-66a9f683b860) |
| Linear | Welcome, 7 dotted steps, empty workspace with example cards | [flow](https://mobbin.com/flows/cbaf58a9-fd84-4afe-b214-e65b24484013) |
| Slack | "Step 1 of 5" questions beside a live preview of the workspace | [flow](https://mobbin.com/flows/e1cb2573-f974-4534-93fe-9718403f4d41) |
| Duolingo (iOS + web) | Owl asks every question in a speech bubble | [iOS flow](https://mobbin.com/flows/b0b4f93f-5637-46ec-9d77-49ecda6b991d) · [web screen](https://mobbin.com/screens/55a115e8-44e3-4efe-a2ee-b0228960b0dd) |
| Characters on web | Trello husky, Brilliant "Hi, I'm Koji!", Deputy coach, Discord tip, Weavy | [Trello](https://mobbin.com/screens/ae84c77b-d245-4952-8ebc-c4fe215bcfdb) · [Brilliant](https://mobbin.com/screens/5c09b9a9-e622-4f2c-bddf-1ce475933753) · [Deputy](https://mobbin.com/screens/9da45d6b-4484-4cda-88b8-8ddc76680255) · [Discord](https://mobbin.com/screens/0c4db483-8b16-4bad-b429-36b500289aef) · [Weavy](https://mobbin.com/screens/fd02c259-7582-4e5d-a8f0-abbfaab37d5b) |
| Dashboard tours | Zoho, Salesforce, Deel, Etsy Pattern, 15Five, Airwallex | [Zoho](https://mobbin.com/screens/4e90996d-cb99-4e9e-8c70-a87e61c0f65b) · [Salesforce](https://mobbin.com/screens/1b478674-9a26-4872-af28-b479c0c6ce08) · [Deel](https://mobbin.com/screens/ba792d2d-588e-42d9-bd88-daa7a9abf533) |
| Checklists | WRITER, Langdock, Discord welcome list | [WRITER](https://mobbin.com/flows/bdf22512-69ae-42ed-877a-2fa8e433e75c) · [Langdock](https://mobbin.com/flows/ce13020c-a232-4e87-8519-a360301da62d) |
| Import progress | ClickUp, Lyssna, Hashnode, Contractbook | [Hashnode](https://mobbin.com/screens/007e2526-7e04-4d12-830c-b38979eba378) · [Lyssna](https://mobbin.com/screens/915a036a-f15d-448c-b977-f8360bacbebb) · [Contractbook](https://mobbin.com/screens/f4654d56-94ee-455f-93a7-afd17b24b2ce) |

## How the big apps do it

**Layout.** One question per screen. The question is the biggest text on the page, set right above its field or options.
- Stripe: a card over the blurred dashboard, with the logo top left and a thin progress bar top right. Back is bottom left; Skip and Continue are bottom right.
- Notion: a narrow white column with a language picker and back arrow at the top. Optional steps add a big illustration on the right half.
- Slack: a white work panel on the right ("Step 1 of 5", then a huge question). The left panel is a live preview of the workspace you are building, and your answer shows up in it as you type.
- Linear: one centred column, with dots at the bottom for 7 steps.

**Language.** Each question says why it's being asked.
- Stripe: "Welcome to Stripe. Tell us a bit about your business and we'll set things up for you." The first words are in the brand colour, the rest in black.
- Notion: a black title with a grey second line ("What's on your mind? / Select as many as you want.").
- Slack: a big question with the user's own team name in the brand colour, plus one helper sentence under it.

**Options.**
- Stripe: rows, each with a title and a grey line of examples ("Magazines, keyboards, food…").
- Notion: icon chips that start at "0 selected", with a count above them.
- Everyone has a way out on optional steps: Stripe "Skip", Notion "Skip for now", Slack "Skip this step", Linear "I'll do this later".

**Sign-in.** Notion and Slack offer "Continue with Google" as a button on its own. Nobody asks you to type your Gmail address before the Google button.

**Background.**
- The work area is plain: white in Stripe, Notion, Slack and Duolingo. Linear is the only dark one.
- Decoration lives in one side panel or on the sign-up page only: Stripe's gradient on sign-up, Notion's illustration, Slack's preview panel, Trello's solid brand blue.
- None of them put a full illustrated world behind every step.

**Characters.**
- Duolingo: the owl is small (about a fifth of the width), top left. The question sits in its speech bubble, right above the options. The bubble is the heading.
- Trello: the husky sits in a circle right next to the live task, and its line is a tiny bubble. The page heading still gives the instruction.
- Brilliant: the character introduces itself by name on its own screen ("Hi, I'm Koji!").
- Deputy: a real coach, Micaela, introduces herself by name and role, then starts a walk-through.
- Discord: the mascot sits inside a tip card ("Got it!" / "Skip all tips").
- The pattern: the character is introduced by name, stays small, and sits right next to what you act on. It never sits far from the field.

**After onboarding (dashboard).**
- Stripe, Notion, Linear, WRITER, Langdock and Discord don't use a multi-stop spotlight tour. They use a **checklist that stays**:
  - Stripe's "Setup guide" panel
  - Notion's "Welcome to Notion!" page, with "Create an account" already ticked
  - WRITER's "Let your Agent do the work" card, 0% → 67% → 100%
  - Langdock's "Get started" card in the sidebar
  - Linear's example cards ("Create a new project")
- Spotlight tours (Zoho, Salesforce, Deel) show "1 of 3" text, Skip and Next. Zoho adds a line saying the arrow keys work.

**Import progress.** Plain bar and count ("0 of 38 lines", "10% complete"). Hashnode and Contractbook say you can leave the page and you'll be notified when it's done.

## Cluster today, and the differences

| # | Area | Cluster now | Big apps | Gap |
|---|---|---|---|---|
| 1 | Question | Only in Kai's bubble on the left panel, about 500px from the field. The right side is a field on black with no heading. | Big question right above the field (Stripe, Notion, Slack). Duolingo puts it in the bubble, but the bubble sits right above the options. | **Big.** The eye has to cross the screen. Add a heading over the field, or move Kai's bubble next to it. |
| 2 | Why we ask | "What should I call you?", "What's your Gmail address?" | Each question gives its reason ("…and we'll set things up for you"). | Small. One reason line per step. |
| 3 | Gmail | Type your address, then "Continue with Google". | A "Continue with Google" button on its own. | **Big.** Typing the address is an extra step Google repeats anyway. |
| 4 | Progress | Step list at the bottom of the scene (You, Gmail, Your mail, Labels, Tour). | Bar or "Step 1 of 5" next to the question (Slack, Stripe, Duolingo). | Medium. Ours is far from the work. |
| 5 | Skip | "I'll set it up myself" top right, only after sign-in. Name step has Back only. | Skip on every optional step, next to Continue. | Medium. |
| 6 | Options | 8 label tiles, all ticked, each with an example sender. "Use these" or "No, ask me first". | Stripe rows with examples (like ours); Notion chips start at 0 with a count. | Small. Example senders are good. All ticked leaves nothing to decide; a count ("8 labels") would help. |
| 7 | Character size and place | Kai at 180px in the middle of a big scene, bubble above it, far from the work. | Small character next to the question or task (Duolingo, Trello). | **Big.** Kai is the biggest thing on screen, but the button should be. |
| 8 | Character introduction | Kai says "Hi, I am Kai!" on the hello screen. | "Hi, I'm Koji!", "I'm Micaela, your Deputy Coach". | None. (First pass of this audit missed it.) |
| 9 | Background | Black page, full Clay-style scene with hills, sky and floating toys behind every step. | Plain work area; decoration in one panel. Slack's panel shows what you're building. | Medium. Our scene is decoration only. A Slack-style panel could show your inbox being sorted as you answer. |
| 10 | Scan | Untangle cube, bar, "58 of 100", senders streaming. | Plain bar and count, plus "you can leave this page, we'll tell you when it's done". | Small. The cube is our own thing. Add the "you can leave" line, since quota pauses can sit for about a minute. |
| 11 | Dashboard | 5-stop spotlight tour with Kai, dots, Skip, then the "You're all set" card. Nothing after that. | Mostly a **checklist that stays** with % done (Stripe, Notion, WRITER, Langdock, Discord). Tours, when used, are 3 to 4 stops. | **Big.** Nothing stays to guide the first week. |
| 12 | Ending | "You're all set, Sam. New mail gets its label as it arrives." Let's go. | Notion lands you in a checklist with the first item already ticked. | Medium. Folds into #11. |

## Where Cluster is already ahead or level

- Real data in onboarding. The Amazon example and the live scan of your own senders match Profound and Visitors, and beat Stripe and Notion, which only ask questions.
- Kai speaks the line as text with a replay button, as masko recommends.
- Tour mechanics (dim, highlight, dots, Skip, Next, arrow keys) match Zoho and Salesforce.
- Label tiles with an example sender match Stripe's rows with examples.

## Suggested order (not built)

1. Heading over the field on every step, plus one reason line (#1, #2).
2. "Continue with Google" button with no email field (#3). Built 2026-11-20.
3. Kai smaller and next to the question (#7).

Step 1 built 2026-11-20: headings and a reason line on every screen, Kai's bubble shortened so it never repeats them.
4. Replace the end card with a "Get started" checklist on the dashboard that stays until done. Shorten the tour to 3 stops (#11, #12).
5. Step count and Skip next to the question (#4, #5).
6. Later: turn the left scene into a live preview of the inbox being sorted (#9).
