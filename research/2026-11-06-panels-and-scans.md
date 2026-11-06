# Side panels and scan screens: how big products do it (2026-11-06)

Asked for: the Details side panel looked too big, Emails/Senders looked odd in it, and Sort inbox had too many options. Research how big companies size side panels, and how security and file scanners keep a scan simple and animated.

## Side panels

- **Microsoft Fluent (Panel, v8 source):** a small fixed panel is 340px, a medium one 592px (644px on wide screens), a large one 940px. A side panel that holds a table is medium, not small. [Fluent Panel.types](https://app.unpkg.com/@fluentui/react@8.125.5/files/lib-commonjs/components/Panel/Panel.types.js)
- **Nord Health aside drawer:** 420px by default, resizable within a min and max. [nordhealth.design](https://nordhealth.design/components/aside-drawer)
- **Notion side peek:** the page opens on the right while the list stays on the left. It splits the screen in two, and the same page can open as center peek or full page instead. [Notion release notes](https://www.notion.com/releases/2022-07-20)
- **Gmail density:** Comfortable, Cozy and Compact. Compact exists for when more rows must fit. [BetterCloud](https://www.bettercloud.com/monitor/the-academy/how-to-change-the-text-density-and-spacing-in-gmail/)

What Cluster does now: the full-page Details keeps Mercury's large type. The side panel is about a third of the window (460 to 620px, between Fluent's small and medium). It uses compact density: a 20px title, 13px text, 48px rows and no Kind column. Emails | Senders becomes one segmented control on its own line.

## Scan screens

- **Avast Smart Scan:** one button. While it runs, a bar at the top names the steps in order (browser threats, outdated apps, viruses, vulnerabilities, performance), and Stop is always there. [Avast support](https://support.avast.com/en-ae/article/159/), [Showmetech walkthrough](https://www.showmetech.com.br/en/how-to-configure-and-use-avast)
- **Bitdefender:** one click from the front page. The result is one clear verdict, for example "no threats detected". [TechRadar](https://www.techradar.com/reviews/bitdefender-antivirus-plus), [All About Cookies](https://allaboutcookies.org/bitdefender-total-security-review)
- **CleanMyMac Smart Care:** one large Scan button. The results come grouped in five categories, then one Run. [9to5Mac](https://9to5mac.com/2024/10/16/macpaw-releases-major-update-to-cleanmymac-with-fresh-design-and-new-features), [Mac|Life review](https://magzter.com/stories/technology/Mac-Life/CLEANMYMAC)
- **Malwarebytes:** the progress window lays out each stage. Its first scan now keeps preparing apart from scanning. [404techsupport](https://www.404techsupport.com/2015/03/26/malwarebytes-anti-malware-2-1-4-brings-new-redesign/amp/)
- **Google Security Checkup:** a green shield plus a check means you're fine. Each category gets its own check, and nothing needs reading when all is well. [Google support](https://support.google.com/accounts/answer/46526)
- **Apple HIG, progress indicators:** use a determinate indicator when you can, report it accurately, and keep it moving. Show a short, specific description, not "Loading". Let people stop when stopping is safe. [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)
- **NN/g and Nielsen:** past about 10 seconds, show percent-done rather than a looping spinner. [NN/g animation](https://www.nngroup.com/topic/animation/), [UX Tigers](https://www.uxtigers.com/post/progress-indicators)
- **Carbon status indicators:** pair color with a symbol and text, show no more than five or six at once, and use plain text when no action is needed. [Carbon](https://carbondesignsystem.com/patterns/status-indicator-pattern/)

### The shared pattern

1. **Ready:** one number, one sentence, one button. The options sit behind a quiet link.
2. **Running:** a determinate ring or bar with a count, the current step named in a few words, and an ordered list of steps that go gray, then pulse, then tick. Stop is always there.
3. **Done:** one verdict, one check per step with its count, and one primary button.

## What changed in Sort inbox

- **Ready:** a ring, "2,607 emails", "go into 6 labels", then **Sort inbox** and a **Review first** link. The label rows are a plain list. Review first opens each row to its senders and emails, with the corrections that were always on screen before.
- **Label name clashes** no longer block the page. Cluster uses the label you already have (it was the old primary choice, "Use mine for all"). Review first shows one line with **Keep Cluster's separate**.
- **Sorting:** the ring fills as each label's batch really finishes, with "1,240 of 2,607" inside it. The line under the title names the label being filed, and each row goes gray, then pulses, then ticks. **Stop** finishes the current label and stops there.
- **Done:** a check in the ring, "2,607 emails sorted", one row per label with a tick, its count and an Undo, then **Done**.
- With reduced motion there are no pulses or ring easing. The counts still update.

Not done: progress inside one label. A label's batch is one provider call, so the ring moves label by label. The active row's pulse keeps it from looking stalled.
