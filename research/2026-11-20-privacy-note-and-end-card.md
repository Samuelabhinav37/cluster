# Privacy note under sign-in, and the tour's end card (2026-11-20)

Research only, no code changed. "Verified" = read on the primary source today. "Unverified" = from memory or a third-party article; check on a live screen before quoting.

## 1. Privacy and permission notes near the sign-in button

### Google
- **Branding guidelines** (verified): only rules for the button itself. Labels are "Sign in with Google", "Sign up with Google" or "Continue with Google"; standard colour G on white; button at least as prominent as other providers. No rule and no pattern for privacy text next to the button. Ask for extra scopes later, when a feature needs them ("incremental authorization").
  https://developers.google.com/identity/branding-guidelines
- **Consent screen** (verified, help centre): users see links to the app's homepage, privacy policy and terms of service. The privacy policy URL must match the one on the app's homepage.
  https://support.google.com/cloud/answer/13463817 , https://support.google.com/cloud/answer/13807376
- **Consent screen wording** (verified on a live Google sign-in, quoted in search results): "Google will share your name, email address, language preference, and profile picture with [App]. Before using this app, you can review [App]'s privacy policy and terms of service." Plain statement of who gets what, then the two documents as inline links. It sits in small grey body text under the account row, with no icon and no shield (the look is unverified, from memory).
  https://support.google.com/accounts/answer/12921417
- **accounts.google.com sign-in page** (unverified, from memory): no privacy sentence beside the button at all. There is one grey helper line ("Not your computer? Use Guest mode to sign in privately." plus "Learn more" as a link), and the Help, Privacy and Terms links sit in a small grey footer.

### Amazon
- **amazon.com sign-in page** (unverified, the exact text only turned up on scraped copies): one small grey line under the Continue button, "By continuing, you agree to Amazon's Conditions of Use and Privacy Notice.", with both names as blue links. No icon.
- **Login with Amazon consent screen** (verified): shows the app name and logo, then the list of requested permissions, then "I agree" and "Cancel", then a link to *your app's* privacy policy and a "Your Account" link where people can remove permissions. Amazon does not set the link text.
  https://developer.amazon.com/docs/login-with-amazon/customer-experience-android.html
- **Login with Amazon button guidelines** (verified): only sizes and colour variants for the button. No privacy text near it.
  https://developer.amazon.com/docs/login-with-amazon/button.html

### Apple
- **HIG, Sign in with Apple** (verified): "display a brief, approachable description of sign-in benefits"; "Be transparent about the data you collect"; "Clarify whether the additional data you request is required or just recommended"; "Give people a chance to engage with your app before asking for optional data." Labels are "Sign in with Apple", "Sign up with Apple" or "Continue with Apple".
  https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
- **Data & Privacy icon** (verified): Apple says "When you see the Data and Privacy icon, you'll find helpful information on what personal data may be shared" and that these screens appear "before you sign in or start using new features."
  https://www.apple.com/privacy/control/
- **How it looks in setup** (unverified, from memory): a small blue handshake glyph above a short blue link ("See how your data is managed…"), centred near the bottom of the screen, under the main button. The icon is Apple's own system mark and belongs to Apple. The link opens a full explanation instead of putting it on the screen.

### What they share
- No green shield and no lock. Google and Amazon use **no icon**. Apple's only icon is its own trademark-style mark, in the link colour and never in green.
- One sentence at most, in **small secondary grey** (about 12 to 13 px), below the button.
- Factual about *who gets what*. No promises and no adjectives.
- The privacy policy is always a **link**. The detail lives behind it.
- A green "safe" badge reads as a sales claim, which is why ours looks cheap. Green also breaks the Cluster rule to keep red and green for real meaning.

### Recommendation
- Text: `Cluster sorts your mail on this computer and moves nothing until you say so. Privacy policy`
- Style: one line (it can wrap to two at narrow widths), centred under the Google button, 12 to 13 px, secondary grey text colour, normal weight.
- Icon: none. Remove the green shield.
- Link: "Privacy policy" in the normal link colour, opening the privacy page in a new tab. If one sentence is too long, cut it to `Your mail stays on this computer. Privacy policy`.

## 2. Last card of the onboarding tour

| Source | Title | Message | Button | Status |
|---|---|---|---|---|
| iPhone setup (older, Home button) | "Welcome to iPhone" | none | "Get Started" | unverified (Trusted Reviews, AT&T guides) |
| iPhone setup (Face ID models) | "Welcome to iPhone" | none | "Swipe up to get started" | unverified (AT&T guides; text from memory) |
| PS5 | "Welcome to PlayStation 5" | none, goes straight to Home | none or a single confirm | partly verified: PlayStation says setup is complete "once the Welcome screen appears" |
| Duolingo | varies | short mascot line | "Continue" on most onboarding screens | unverified (screensdesign.com) |
| Linear (2021 teardown) | "You're good to go!" | none | opens the app | unverified (third-party teardown) |
| Notion | lands on a "Getting Started" page | no end card | none | unverified (third-party) |

Sources: https://www.playstation.com/support/hardware/ps5-get-started-set-up/ , https://www.techradar.com/how-to/how-to-set-up-your-ps5-or-ps5-digital-edition , https://www.trustedreviews.com/how-tos/how-to-set-up-an-iphone , https://www.att.com/device-support/article/156090/apple/iphone-13/ , https://screensdesign.com/explore/apps/duolingo/onboarding/ , https://www.candu.ai/blog/linear-onboarding-teardown

**Apple HIG** (verified):
- Onboarding should be "fast, fun, and optional". "People want to start using your app or game immediately after first launching it."
- If people skip it, don't show it again, but keep it findable in help or settings.
- On button labels: "write a few words that succinctly describe what the button does … consider starting the label with a verb."

https://developer.apple.com/design/human-interface-guidelines/onboarding , https://developer.apple.com/design/human-interface-guidelines/buttons

### What they share
- The final screen is a short welcome or "done" title. The message is often missing.
- The button is a "start" verb ("Get Started", "Continue").
- None of them says "that's the tour". They simply end.

### Should the card close itself?
No. None of the examples closes on a timer. The person ends it, which is also better for accessibility (timed content goes against WCAG 2.2.1). Close it on the button, on Esc or on the X. Once it closes, don't show it again, and keep "Take the tour" in Settings or the account menu, as the HIG asks.

### Recommended copy
- Title: `You're all set, Samuel.`
- Message: `I'll be down here if you need me.`
- Button: `Get started`

Drop "That's the tour." because the card already shows the tour is over. Keep the Kai line so Kai still explains where to find help.
