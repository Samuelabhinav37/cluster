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
