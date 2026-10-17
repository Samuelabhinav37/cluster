# How Apple makes sign-in feel calm and premium, and what Cluster takes from it

Date: 2026-10-10. Owner asked: research how Apple designs auth on its websites (neat, classy,
premium, calm) and apply it to Cluster's first run.

Method: loaded account.apple.com/sign-in and the iCloud.com sign-in sheet in Chrome (1440 px,
light and dark), measured computed styles inside Apple's sign-in frame (`idmsa.apple.com`),
typed a sample address to see the second step, and read the Apple HIG pages Managing accounts,
Sign in with Apple, Loading and Progress indicators (fetched 2026-10-10).

## 1. What Apple's sign-in actually looks like (Measured)

| Element | account.apple.com value |
|---|---|
| Layout | One centred column, **460 px** wide, no card on the page; iCloud puts the same column in a sheet with ~36 px corners over a dimmed page |
| Symbol | ~180 px circular dot halo around the logo, above the title |
| Title | SF Pro Display **600, 28/32 px**, colour `#1d1d1f` |
| Subtitle | SF Pro Text **400, 17/25 px**, letter-spacing −0.374 px |
| Field | **460 × 56 px**, radius **12 px**, floating label inside ("Email or Phone Number"), 17 px text; focus border **2 px `#0071e3`**, resting border 1 px `rgba(134,134,139,…)` |
| Second step | Password field appears **stacked under** the email field (bottom field radius `0 0 12 12`), same column, no new page |
| Privacy note | Small two-person glyph, then **12/16 px** text, one link ("See how your data is managed…") |
| Buttons | Two side by side, **225 × 38 px**, radius 8 px, 14 px text; blue `#0071e3` primary, near-black secondary; primary is **pale and disabled until the field is valid**; pressing it shows a spinner in place of the label ("Verifying…") |
| Colour | White page, near-black text, one blue; no gradients except the symbol |
| Words on screen | Title, one subtitle, one field label, one note, two buttons |

## 2. What Apple's guidelines say (Source: Apple HIG)

**Managing accounts**
- "Explain the benefits of creating an account… write a brief, friendly description… Display
  this message in your sign-in view."
- "Always identify the authentication method you offer… title it using a phrase like 'Sign In
  with Face ID' instead of a generic phrase like 'Sign In.'"
- Deleting: "Provide a clear way to initiate account deletion within your app"; revoke tokens;
  "Tell people when account deletion will complete, and notify them when it's finished."

**Sign in with Apple**
- "Ask people to sign in only in exchange for value… display a brief, approachable description of
  sign-in benefits."
- "As soon as Sign in with Apple completes, welcome people to their new account. Help people use
  their new account right away; don't delay the experience by asking for information that isn't
  required."
- "Indicate when people are currently signed in… a phrase like 'Using Sign in with Apple'."
- "Don't ask people to supply a password."

**Loading**
- "Show something as soon as possible… consider showing placeholder text, graphics, or
  animations as content loads."
- "Let people do other things in your app or game while they wait for content to load."
- "If loading takes an unavoidably long time… display tips, or introduce people to new features.
  Gauge the remaining loading time as accurately as possible."

**Progress indicators**
- "When possible, use a determinate progress indicator… can help people decide whether to do
  something else while waiting."
- "Consider evening out the pace of advancement… Showing 90 percent completion in five seconds and
  the last 10 percent in 5 minutes… can even feel deceptive."
- "Keep progress indicators moving… If a process stalls… provide feedback that helps people
  understand the problem."
- "Avoid vague terms like loading or authenticating."
- "Display a progress indicator in a consistent location."
- "When it's feasible, let people halt processing… include a Cancel button… a Pause button."

## 3. Why it feels calm and premium (Inference)

1. **One thing per screen.** One question, one field, one primary action. Steps grow in place
   instead of jumping to new pages.
2. **Space does the work.** No boxes around the form on the main page, one narrow column, large
   gaps between the symbol, title, field and buttons.
3. **Two type sizes carry everything.** 28 px title, 17 px body, 12 px fine print. Nothing else.
4. **One colour.** Near-black, white, one blue. The only colour is in the symbol.
5. **Fine print is small and honest.** Privacy text is present but quiet, with a glyph and a link.
6. **Buttons tell the truth.** Disabled until ready, a spinner while working, named for the method.
7. **The symbol is the only flourish.** A single still illustration above the title.

## 4. What changes in Cluster's first run (Inference)

| Step | Before (mockup v1) | After (v2) |
|---|---|---|
| Welcome | Card with title, lead, three feature tiles, button, note | No card. Cluster symbol with a quiet halo of dots, "Cluster", one subtitle, one button. Features as a single quiet line |
| Choose email | Field plus two provider buttons and hints | Floating-label field. **Continue** is pale until the address is valid, then reads **Continue with Google** / **Continue with Microsoft** when the domain tells us. Unknown domains get a second, stacked question: "Which service is this address on?" |
| Heads-up | Modal "One more thing first" | Inline waiting state: "Finish signing in with Google" with what Google will ask, plus "Open the window again" and "Use a different email". The provider window opens over it |
| Connected | Straight to dashboard | Welcome moment: "Welcome, Sam." with "Using Google · sam@gmail.com", then the dashboard opens by itself |
| Scan pill | Progress, stages | Same place always, descriptive stage names, even pace, **Pause** and **Stop** in the details, stall message when Gmail slows us down |
| Fine print | Lock icon lines | One 12 px note with a glyph and "How Cluster uses your mail" |

Sizes adopted: column 440–460 px; title 28/32 semibold; subtitle 17/25; field 56 px tall,
12 px radius, 2 px focus ring in the accent; fine print 12/16; buttons 44 px (Cluster keeps pill
shapes from its app UI so sign-in and dashboard match).

## Sources

- account.apple.com/sign-in and icloud.com sign-in, rendered and measured 2026-10-10
- Apple HIG: [Managing accounts](https://developer.apple.com/design/human-interface-guidelines/managing-accounts),
  [Sign in with Apple](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple),
  [Loading](https://developer.apple.com/design/human-interface-guidelines/loading),
  [Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)
