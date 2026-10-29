# Home v2: inspiration and a proposal (2026-10-29)

Mockup: `research/2026-10-29-home-mockup.html` (three states: something needs you, all clear,
first read; light and dark). Builds on the Mobbin check in `2026-10-29-dashboard-vs-mobbin.md`.

## Why today's Home is hard to read

The four bento tiles each show a number, but none of them says whether things are fine. The
biggest number is "150 emails", which only says how much was read. There's no sense of what
Cluster did for you, and the kind bar has no sentence saying what it means.

## What others do

| Product | Pattern | What we take |
|---|---|---|
| Oura (2025 redesign) | Five tabs folded into three. Today focuses on "one big thing", the score or insight you need now, plus a highlight that changes through the day ([Droid Life](https://www.droid-life.com/2025/11/13/oura-ring-app-gets-big-facelift-ai-gets-more-access-to-your-metrics/), [TechRadar](https://www.techradar.com/health-fitness/oura-ring-users-are-getting-a-revamped-ai-powered-app-and-samsung-galaxy-ring-users-are-going-to-be-seriously-jealous)) | One verdict at the top, said by Kai |
| Apple Screen Time | The weekly report leads with change from last week, such as down 19 percent, then the daily bars ([NBC Boston](https://www.nbcboston.com/news/local/new-iphone-feature-can-help-you-track-and-limit-your-screen-time/8186/?amp=1)) | "18% lighter inbox than last week" with a 7-day bar |
| iPhone Storage | One bar, then a short list of recommendations, each with what it saves and one button | "Next up": at most three rows, each says why and has one button |
| Clean Email | Its dashboard is liked for showing mail patterns and suggested cleanup areas ([Jotform](https://www.jotform.com/ai/agents/sanebox-vs-clean-email/)) | Suggestions come from your own mail, named by sender |
| SaneBox | Reviewers find its dashboard of many options overwhelming ([Trustpilot](https://au.trustpilot.com/review/sanebox.com?page=9)) | Keep Home to four parts; settings stay in their places |
| Mobbin's rules | "So what" first, progress vocabulary, charts with a sentence, empty states that set expectations | All four parts below map to these |

## The proposal: four parts, top to bottom

1. **The verdict, said by Kai.** One sentence in large type. "3 emails need you. The rest is
   handled." with one button, or "All clear. Nothing needs you today." While mail is first read:
   "Reading your mail. You can look around." with the bar. This is the one metric.
2. **This week.** Three cards that show what Cluster did: emails cleared (with a 7-day bar),
   how much lighter the inbox is than last week, and scams stopped. Each is a result, not a count
   of what's there. The data is already in the action log and the scan.
3. **Next up.** At most three rows, most useful first. Each row names the senders or the kind,
   says what will happen in plain words ("They go to Trash, and you can undo"), and has one
   button. When nothing is left, the section disappears instead of showing an empty card.
4. **Your inbox.** The kind bar, now with one sentence on top: "Most of your mail is updates:
   codes, newsletters and alerts. Only 12 of 150 are from people." Kind names are plain:
   People, Receipts and orders, Updates, Promotions.

What goes: the four tiles, the "of 150 ready to go" phrasing, and the Organize tile's "could
leave" number (it becomes a Next up row when it's worth doing).

## Questions for the user

- Keep the bento tiles' app-icon headers in some form, or go fully to this list layout?
- Is "This week" the right window, or since you started using Cluster?

## Round 2 research (same day)

| Source | Finding | Change to the proposal |
|---|---|---|
| Apple Fitness (iOS 14) | Four tabs folded into one Summary of short cards, daily progress on top, then recent activity; iOS 18 lets you reorder cards ([MacStories](https://www.macstories.net/stories/the-new-fitness-app-in-ios-14/), [Digital Trends](https://qa2.www.digitaltrends.com/mobile/how-to-customize-the-apple-fitness-app-in-ios-18)) | Keep Home as one scrolling page of short sections; no card editing for now |
| Monzo home | Users were attached to one number, "left to spend", and objected when it moved ([Monzo community](https://community.monzo.com/t/were-working-on-a-new-look-for-the-monzo-app/65333?page=14), [Monzo](https://monzo.com/blog/the-new-and-improved-home-screen)) | The verdict always sits in the same place with the same wording pattern |
| Google Home (2022 to 2023) | Network status and device counts at a glance on top, then pinned favourites ([9to5Google](https://9to5google.com/2022/10/04/google-home-app-redesign/)) | Status first, then things you act on |
| HEY | Imbox, Feed, Paper Trail and Screener. Reviewers say Feed and Paper Trail get forgotten, with no alert when mail lands there ([HEY](https://hey.com/features/the-imbox/), [Fast Company](https://www.fastcompany.com/90522517/hey-is-a-visionary-alternative-to-gmail-but-its-missing-the-basics)) | Home surfaces what's waiting in places you rarely open: held scams, new senders |
| Streak research | Broken streaks are reported to lower engagement below where it started, and users describe streak anxiety. Mostly practitioner sources; the cited 2023 study (Silverman and Barasch) wasn't checked directly ([Yu-kai Chou](https://yukaichou.com/gamification-analysis/streak-design-gamification-motivation-burnout/), [Habit Doom](https://habitdoom.com/blog/streak-anxiety-habit-trackers)) | No streaks. "Calm for 5 days" became "1,240 emails cleared since you started", which never resets |
| The Progress Principle (Amabile and Kramer) | Small wins are the strongest everyday motivator, and managers underrate them ([HBS Working Knowledge](https://www.library.hbs.edu/working-knowledge/how-small-wins-unleash-creativity)) | After an action, the row leaves, the cleared number counts up and a short toast confirms it with Undo |
| NN/g empty states | Empty states should show system status, teach, and offer a direct path. Never show "nothing" while still loading ([NN/g](https://nngroup.com/articles/empty-state-interface-design)) | First read shows the progress bar and "Found so far" counts that rise as mail is read, plus "Nothing changes in Gmail until you choose" |
| GOV.UK content design | Plain English is required, aiming at a reading age of 9 ([Surrey CC](https://www.surreycc.gov.uk/website/writing-guide/reading-levels-for-web-pages)) | Short sentences, numerals, everyday words such as "People" instead of "Primary" |
| Dashboard design patterns (IEEE VIS 2022) | A review of 144 dashboards, 42 design patterns, and guidance on reducing information load ([paper](https://arxiv.org/pdf/2205.00757v2)) | Supports few sections with one job each |

Answer to the earlier question about the time window: show both. "This week" stays the big
number because it changes and feels current; "since you started" sits under it as a total that
only grows.
