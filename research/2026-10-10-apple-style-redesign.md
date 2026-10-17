# How an Apple design team would structure Cluster

Date: 2026-10-10. Branch audited: `ui/copy-trim` (de5b64b), run in the preview harness with the
fake mailbox, 1440 px, dark and light. Compared against Moat 0.11.275 Settings.

Labels: **(Apple)** = Apple's own guidance or shipped product behaviour, with source.
**(Seen)** = observed in the Cluster screenshots. **(Inference)** = my recommendation.

## TL;DR

Cluster's screens are organised by the tools we built (Sorting, Senders, Subscriptions, Rules,
Clear out, Scams, New senders, Scam report), not by the questions a person has. The same sender
shows up with the same **Mute** button on four screens, every page opens under a banner, and
there are 11 sidebar items. Apple's pattern for exactly this kind of product (Mail categories,
Passwords security warnings, iPhone Storage recommendations, Safety Check) is:

1. **One home screen that answers "is everything OK, and what should I do?"** in one sentence,
   then a short list of recommendations, each with one button.
2. **One place per object.** A sender is managed in one detail pane, not on four lists.
3. **Few top-level areas**, two levels at most, settings that are set once kept out of the way.
4. **Quiet visuals**: neutral surfaces, one accent, colour only when it means something.

The October IA proposal (`2026-10-05-sync-and-ui-architecture.md` §2.4) already points this way
and was never built. This doc adds the Apple lens, the screen layouts, and the visual system.

## 1. What Apple's guidelines say (Apple)

| Topic | Guideline (short quote) | Source |
|---|---|---|
| Order | "Place the most important items near the top and leading side." | HIG Layout |
| Grouping | "Group related items" using "negative space, container shapes, or separator lines." | HIG Layout |
| Disclosure | "Use progressive disclosure to make layouts cleaner"; too many choices make it "harder to understand the choices that are available." | HIG Layout |
| Sidebar depth | "Show no more than two levels of hierarchy in a sidebar." Deeper data: a content list between sidebar and detail. | HIG Sidebars |
| Sidebar labels | "Use succinct, descriptive labels… omit unnecessary words." | HIG Sidebars |
| Sidebar colour | Icon colours must "serve a clear purpose"; fixed colour used "sparingly" (Mail's yellow VIP). | HIG Sidebars |
| Sidebar bottom | "Avoid putting critical information or actions at the bottom of a sidebar." | HIG Sidebars (macOS) |
| Split view | Sidebar for top-level areas, then a list, then item details. | HIG Split views |
| Charts | Put a headline above a chart: Weather shows "Chance of light rain in the next hour". "Keep a chart simple." | HIG Charting data |
| Charts vs lists | "Not every collection of data needs to be displayed in a chart"; a list may be better. | HIG Charting data |
| Settings | "Minimize the number of settings." Task options go "in the screens they affect." | HIG Settings |
| Defaults | "Provide reasonable default settings so most people can immediately start." | HIG Onboarding |
| Onboarding | Prefer "context-specific tips" near the area they describe over one big flow. | HIG Onboarding |
| Copy | "Put the most important information first." Buttons use a verb. Avoid "we". | HIG Writing |
| Empty states | "Provide clear next steps on any blank screens." | HIG Writing |
| Settings copy | "Describe what it does when turned on, and people can infer the opposite." | HIG Writing |

## 2. Apple products that already solve Cluster's jobs (Apple)

| Cluster job | Apple's version | What it does that Cluster doesn't |
|---|---|---|
| Sort mail by kind | **Mail categories** (iOS 18.2): Primary, Transactions, Updates, Promotions. "All Mail" is still one swipe away. | **Four fixed kinds** and one per-sender override, "Categorize Sender". No time-limit sliders up front. |
| Act on one sender | **Mail sender view**: open a sender, see all their mail, "Trash All". | **All actions live on the sender**, not repeated on every list. |
| Scams | **Passwords → Security**: one list of warnings grouped by kind (compromised, reused, weak). Each item opens a detail with one fix button ("Change Password"). | **Grouped warnings, one fix each.** Shows up on the home screen as a single card. |
| Clean up | **iPhone Storage → Recommendations**: a short list ("Review Large Attachments", "Offload Unused Apps"), each with a size and one button. | **Recommendations, not tools.** Only shows what applies to you right now. |
| Safety | **Safety Check**: two big choices (fast reset or review step by step), progress saved. | **Two clear paths**, one quick and one careful. |
| Report | **Safari Privacy Report**: one big number for 30 days, then a list by site or by tracker. | **One number + one list**, local data only. |
| Status | **Weather**: one sentence summarising what matters now, above the chart. | **A plain-English headline** before any numbers. |

Sources: [MacRumors on Mail categories](https://www.macrumors.com/2024/12/13/ios-18-2-mail-categories/),
[Apple Passwords guide](https://support.apple.com/guide/passwords/),
[Help Net Security on Passwords](https://www.helpnetsecurity.com/2024/10/03/how-to-use-the-apple-passwords-app/),
[Apple Safety Check](https://support.apple.com/guide/personal-safety/how-safety-check-works-ips2aad835e1/web),
[AppleInsider on Privacy Report](https://appleinsider.com/articles/21/11/08/how-to-use-safaris-privacy-report-in-macos-monterey),
iPhone Storage recommendations via [iPhoneLife](https://iphonelife.com/node/273402) (third party; Apple's own page was not reachable).

## 3. What is confusing in Cluster today (Seen)

1. **11 sidebar items in 3 groups** (Overview; Sorting, Senders, Subscriptions, Rules; Clear out;
   Scams, New senders, Scam report; Activity, Settings). Apple's guidance is fewer areas with
   clear jobs.
2. **The same sender, four places, same button.** Medium Daily Digest has a **Mute** button on
   Sorting, Senders and Subscriptions, and "Mute all" on Clear out. A person can't tell which
   screen is "the" place.
3. **Page and content don't match.** Sorting says "Choose how long each kind of mail stays in
   your inbox", but the first thing on it is a sender list with Mute buttons. The time limits
   are further down.
4. **A banner sits above every page.** "Tidy up Cluster's labels" with a checkbox and two buttons
   pushes every page title down and is the first thing on every screen.
5. **Overview doesn't say anything.** "What Cluster found, and what needs you." Then a setup
   prompt, a note about 150 messages, two cards, and an "Inbox health 57 of 100" card that is
   mostly empty.
6. **Every row shouts.** Boxed Mute buttons on every row, boxed "…" buttons, red-bordered "Block
   sender", green ✓ lines that are decoration, blue counts in the sidebar.
7. **Numbers without meaning.** Clear out shows 29, 27, 0, 29, 0 side by side ("senders
   scanned", "past their window", "suspected spam") before telling you what to do.
8. **Header buttons nobody needs daily.** Connect Outlook and Rescan are big header buttons;
   Rescan is the most expensive action in the product.
9. **Settings expose internals.** "Most messages per account: 150" and "Days of mail to look
   at: 180" are implementation details (HIG: avoid settings you can decide yourself).
10. **Scam report shows an empty chart** when scam holding is off, instead of a next step.

## 4. The Apple-style structure (Inference)

Five areas, each answering one question. Activity and Settings go in a footer menu, not the
main list.

| Area | Question | Built from today's |
|---|---|---|
| **Home** | "Is everything OK, and what should I do?" | Overview |
| **Safety** | "Is anything dangerous?" | Scams, New senders, Scam report |
| **Clean up** | "What can I get rid of now?" | Clear out, Sorting's "worth a decision" |
| **Senders** | "What do I want from this sender?" | Senders, Subscriptions |
| **Sorting** | "Where does each kind of mail go?" | Sorting's time limits, Rules |

### Home (Weather headline + Storage recommendations)

```
Home
Your inbox is in good shape. 3 emails look like scams.          ← one sentence, changes with state

[ ✓ Safety  3 to check  →  ]  [ Sorting on · 5 kinds  → ]       ← two status pills, like Moat's

Recommendations                                                  ← iPhone Storage style
  Mute 4 senders you never open        29 emails     [Review]
  Unsubscribe from 6 newsletters       verified      [Review]
  Turn on scam holding                               [Turn on]

This week  ▁▃▂▅▇▂  142 emails sorted                             ← one chart, headline above it
```

No health score, no "150 messages" note, no setup card. First-run setup becomes the top
recommendation until done.

### Safety (Passwords security list)

```
Safety
3 emails need a look. Nothing has been deleted.

Hold suspicious email   [on]

Needs a look (3)                       ← grouped by kind, like Compromised / Reused / Weak
  Pretends to be a company  2
  Pretends to be someone you know  1
New senders (5)
  …
This month: 12 held, 2 you let back in        → full report
```

Each row opens a detail pane with the reasons and **one** primary action. Block, report and
deep scan sit in that pane, not on the card.

### Senders (Mail sender view, split view)

```
Senders │ [search]  All · Newsletters · Never opened · Muted  │  Medium Daily Digest
        │ Medium Daily Digest   12  ●never opened           │  noreply@medium.com · 12 emails
        │ Morning Brew          10                          │  Future mail:  Inbox · 📰 Updates · Muted
        │ Amazon.com             8                          │  [Unsubscribe]   verified
        │ …                                                 │  Existing mail: [Move to Trash]
```

Rows have no buttons. Click a row and every action is in one pane on the right (HIG split
view). This removes the repeated Mute buttons from four screens.

### Clean up (Storage recommendations)

A short list of recommendations, each one line with a count and **Review**. Review opens a
sheet listing the emails with one confirm button. The metric strip goes away.

### Sorting (Mail categories)

One list of kinds (Codes, Receipts, Shipping, Newsletters, Promotions, Social…), each a
sentence: "**Promotions** stay in your inbox for **1 day**, then go to 🛍 Promotions." Rules
move into a collapsed "Custom rules" section at the bottom.

### Global chrome

- Header: product name, **search** (senders and settings), **Help**. Account, Outlook, Rescan
  and Settings move into one account menu.
- Banners: none above the page. Label tidy-up becomes a Home recommendation.
- Settings: theme, simple mode, delete-forever, accounts. Scan size becomes automatic.

## 5. Visual system (Inference, from Moat's redesign layer)

Take Moat's redesign layer (`moat/src/options/options.css`, "Moat's website look for
Settings"), which already matches this direction:

| Token | Value |
|---|---|
| Page / panel (dark) | `#0a0a0c` / `#161618`, panel-2 `#1f1f22`, line `#262629` |
| Page / panel (light) | `#f5f5f7` / `#ffffff`, line `#e3e3e8` |
| Font | `-apple-system, "SF Pro Text", Inter, system-ui`, 15 px, -0.008em |
| Page title | 30–40 px, weight 600, -0.03em; lead 17 px weight 500, grey |
| Cards | 22 px radius, inset 1 px line, no border, 26×28 px padding |
| Buttons | pill (980 px radius); one solid accent button per screen at most |
| Row actions | none in the row; detail pane or one text link |
| Colour | one blue accent; red only for real danger; green only for "on/safe" status |

## 6. Suggested order

1. **Visual layer** (CSS only, no behaviour change): tokens, type, cards, pills, quieter rows.
2. **Chrome**: header search + Help + account menu; remove the global banner.
3. **Home** rebuilt as headline + status pills + recommendations + one chart.
4. **Senders split view**; remove per-row buttons from all lists.
5. **Merge nav to 5 areas**: Safety (Scams + New senders + report), Clean up, Sorting (+ Rules).
6. Settings trim.

Each step ships on its own branch and is checked in the preview harness, light and dark,
before the next.

## Sources

- Apple HIG: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout),
  [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars),
  [Split views](https://developer.apple.com/design/human-interface-guidelines/split-views),
  [Charting data](https://developer.apple.com/design/human-interface-guidelines/charting-data),
  [Settings](https://developer.apple.com/design/human-interface-guidelines/settings),
  [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding),
  [Writing](https://developer.apple.com/design/human-interface-guidelines/writing),
  [Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)
  (fetched as JSON from developer.apple.com on 2026-10-10)
- [WWDC25 "Meet Liquid Glass"](https://developer.apple.com/videos/play/wwdc2025/102/): hierarchy, harmony, consistency
- Product references listed in §2
- Prior Cluster research: `2026-10-05-sync-and-ui-architecture.md`, `2026-09-18-dashboard-visual-design.md`
