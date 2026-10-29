# Onboarding: what big companies do, and a plan for Cluster (2026-10-29)

Mockup: `research/2026-10-29-onboarding-mockup.html` (open it directly or serve `research/`).

## What Cluster does today

One screen, "What describes you?", four answers. The answer is saved as `settings.persona` and
turns on scam holding or Simple mode, or fills in Organize's time limits for you to review. No
other questions, no icons, and nothing happens with the time it takes to read your mail.

## What the big companies do

| Company | Pattern | What we take from it |
|---|---|---|
| Material Design (Google) | Three onboarding models. "Self-select" asks a few questions to tailor the first run; under ten options per screen; ask only what the app uses; show it to new users only ([Material](https://m2.material.io/design/communication/onboarding.html)) | Few screens, few options, each answer must change something |
| Gmail | Inbox type and smart features are choices you can change any time in Settings; turning a feature off never blocks the app ([Google blog](https://blog.google/products-and-platforms/products/gmail/new-settings-smart-features-and-personalization-gmail/), [inbox types](https://blog.google/products/gmail/gmail-inbox-types/)) | Every answer maps to a real setting you can find again |
| Apple Setup Assistant | Express Settings bundles defaults on one screen with a "Customize" path; every step can be skipped and changed later in Settings ([Apple support](https://support.apple.com/guide/imac/apd831707cb3/2022/mac/13)) | A "Use recommended" path plus a way to answer each question |
| Apple Music | Tap bubbles for genres, then artists drawn from those genres; revisit later through "Choose Artists For You", with Reset ([iMore](https://www.imore.com/how-tell-apple-music-what-you)) | Big tappable chips with icons; the second question builds on the first; a way back in |
| Apple News | Pick channels and topics; the feed is built from them and keeps learning from what you read ([Apple support](https://support.apple.com/en-am/107770)) | Answers are a starting point; what you do later refines them |
| Apple Mail (iOS 18.2) | Categories on by default; one switch to List view ([Macworld](https://www.macworld.com/article/2585948/how-to-ios-18-macos-15-change-mail-categories-list-view.html)) | Good defaults, one obvious way out |
| Duolingo | Conversational questions (why, goal, level) before sign-up, a plan at the end, value before effort ([Appcues](https://goodux.appcues.com/blog/duolingo-user-onboarding)) | Friendly one-question screens, and a "your plan" summary at the end |

## How they store answers and act on them

- **Stored as settings, not as a profile.** Gmail's choices are account settings and Apple's are
  Settings values, so the answer and the setting are the same thing. Apple Music and News keep
  your picks as a seed list and keep learning from what you play or read.
- **Each answer changes something you can see.** Material: only ask what the app uses.
- **Always a way back in.** Apple Music's "Choose Artists For You" and Gmail's Settings.

For Cluster: keep the answers in `settings.onboarding = { version, answers, answeredAt }` on this
computer (like every other setting). Each answer maps to settings Cluster already has (table
below). Opening Setup again from Settings starts with your old answers ticked and shows what would
change before saving. Your later actions (Trash, Keep, This is a person) keep refining things the
way they do today; the answers are only the starting point.

## Proposed flow (four questions and a plan)

Each screen has one question, big chips with icons, and Skip. A dot row shows where you are. Mail
keeps reading in the bottom bar the whole time, so setup uses the wait instead of adding to it.

| # | Question | Answers | What it sets |
|---|---|---|---|
| 1 | What describes you? | Just me · I run a business · Keep me safe · Lots of people email me | Starting defaults for 2-4 (today's personas) |
| 2 | What gets in your way most? (pick any) | Promotions · Newsletters I never read · Scams and fake brands · Old mail piling up · Important mail gets buried · App and social alerts | Order of Home cards; which Organize kinds get a time limit; Hold likely scams |
| 3 | What should always stay in your inbox? | Bank and bills · Work · Travel · Receipts and orders · People you write to (always on, can't untick) | Those kinds get "Stays in inbox" in Organize |
| 4 | How hands-on do you want to be? | Ask me first · Tidy for me, I can undo | Ask: nothing moves until you press Sort my inbox. Tidy: "Keep doing this for new mail" on |
| Plan | Here's your plan | A list of what will change, one Start button | Applies the settings; Gmail filters only after Start |

"Keep me safe" in question 1 also offers Simple mode on the plan screen. Skip on any screen keeps
today's defaults for that question.

## Not in this round

- An account-level sync of answers (Cluster has no accounts; Moat stays accountless too).
- Learning answers from mail before asking (it could pre-tick question 2 from what reading finds;
  worth a later round once the read is fast enough to have data during setup).

## Round 2: pictures, motion and a sign-in page (mockup v2)

Mockup: `research/2026-10-29-onboarding-mockup-v2.html` (Sign in · Welcome back · Setup).

- **Sign-in as a split screen** (form left, photo right, as in the Superpower reference the user
  shared). Split screens suit minimal forms: the divide and white space hold attention on one
  action ([SitePoint](https://www.sitepoint.com/how-to-design-a-daring-but-effective-split-screen-layout/),
  [Mockplus](https://www.mockplus.com/blog/post/split-screen-web-design)). Cluster has no
  passwords, so the form is two buttons (Gmail, Outlook) and one trust line. The photo is a NASA
  orbital sunrise (public domain), matching the site's space-and-nature imagery.
- **Practice inbox** (Superhuman). Superhuman's self-serve onboarding centres on a synthetic inbox
  you can practise in without touching real mail ([analysis](https://merge.rocks/blog/we-analysed-the-onboarding-experience-of-dia-superhuman-more-heres-what-makes-users-stay),
  [Gainsight](https://www.gainsight.com/blog/5-lessons-i-learned-from-superhumans-onboarding/)).
  Cluster's "what gets in your way" question becomes "Sort five emails": Keep, Later or Let go on
  made-up mail, including one fake. The answers come from what you do, not from a checklist.
- **Vector scenes per step**, drawn inline as SVG with a slow float, so they cost no image files
  and follow the theme. Each step's picture shows what the step does (bins for sorting, a shield
  for what stays).
- **The plan animates in** item by item, so the result of your answers reads like a payoff
  (Duolingo's plan screen).

For the real build: the extension's CSP blocks remote images and fonts, so the photo ships in the
package (about 150 KB as WebP) and the font is the bundled Inter Tight. Google's sign-in branding
rules may apply to the Gmail button; check them before the store review.
