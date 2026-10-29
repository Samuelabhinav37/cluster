# How Apple, Microsoft and Google cut down options (2026-10-29)

Question: how do big design teams handle "too many things happening" on a screen, and what does
that mean for the six problem types in `2026-10-29-options-inventory.md`?

Primary sources were read where they loaded (Apple HIG pages as .md, Microsoft's IUI guidelines,
NN/g). Press coverage is marked as such.

## How they work on it (the process)

1. **Measure what people actually use, then rank.** Microsoft redesigned Office 2007 from
   usage data: Paste, Save, Copy, Undo and Bold were about 32% of all Word 2003 command use, Paste
   alone over 11% (Jensen Harris's blog, quoted on Microsoft Q&A; original post not loaded). The
   2018 Outlook Simplified Ribbon kept the ~10 commands that make up most actions and moved the rest
   behind "…" (press coverage: GeekWire, Engadget). NN/g: pick the up-front set with "task analysis,
   field studies, and frequency-of-use data", then check with observation, because high click
   counts can be mistakes.
2. **Write one task per screen, as a sentence.** Microsoft's Inductive UI guidelines (2001):
   "Focus each screen on a single task", title it with that task in the user's words, put only the
   controls for that task in the content, and list "secondary tasks" as links in one subordinate,
   consistent spot. The problem it solves: "deductive" screens where people must study the controls
   to guess what the screen is for, and "pay this cost over and over again".
3. **Find the top tasks with users, not the team.** Gerry McGovern's Top Tasks: users vote up to 5
   from a long list; the top 5 to 10 tasks ("the long neck") get the easy path, the rest can be
   harder to reach.
4. **Group the bulk, act on the group.** Google Inbox Bundles (2014) and Apple Mail categories
   (iOS 18.2) group low-priority bulk mail by type or sender so one action covers many messages.
   Apple's sender digest is one row per sender.
5. **Defaults over settings.** Apple HIG Settings: "Aim to provide default settings that give the
   best experience to the largest number of people" and "Minimize the number of settings you offer."
   Gmail's 2020 quick settings panel added no options; it surfaced a few (density, inbox type,
   reading pane, theme) with "See all settings" behind them.

## The rules they write down

| Rule | Source |
|---|---|
| Only one primary (prominent) action per toolbar or screen | Apple HIG Toolbars ("Only specify one primary action"); Fluent ("only use one primary button in a layout"); Material FAB |
| At most about three groups of controls | Apple HIG Toolbars ("aim for a maximum of three"), Context menus ("not more than about three groups") |
| Hide details until relevant, most-used on top, only one disclosure per view | Apple HIG Disclosure controls ("Use no more than one disclosure button in a single view") |
| Two disclosure levels at most | NN/g ("beyond 2 disclosure levels typically have low usability"); Apple submenus "restrict them to a single level" |
| Don't offer several ways to reach the same secondary options | NN/g ("rarely a good idea to offer multiple ways to progress to secondary options") |
| Each item appears once in a menu; context menu items must also exist in the main UI | Material menus; Apple HIG Context menus ("Always make context menu items available in the main interface") |
| Context menu = the few commands likely in this context, not advanced or rare ones; hide what doesn't apply | Apple HIG Context menus |
| Destructive items last, marked red | Apple HIG Context menus |
| Every control's meaning must be clear without experimenting | Apple HIG Toolbars ("Don't make people guess"); Microsoft IUI |
| Task options (filter, show/hide) live on the screen they affect, not in Settings; Settings holds rarely changed, general options | Apple HIG Settings |
| A "More" menu only if really needed, for the less important actions | Apple HIG Toolbars |

## What this means for Cluster

Mapped to the six problem types from the inventory.

1. **One action, many places** → *each item once; secondary places link.* Give every verb one
   home and make other places link to it (IUI "secondary tasks"). The ⋯ menu may repeat a row's
   commands only because Apple requires context-menu items to also exist in the main UI, never
   the other way around. Unsubscribe lives in Stop mail, Trash in Clean up, Block in Protect.
2. **Several systems for one job** → *one task sentence per place, measured.* Write each
   place's title as its task ("Delete old mail", "Stop mail you don't want", "Choose where mail
   goes"). Anything that doesn't serve that sentence moves or goes. Organize's four ways to move mail
   need to become one (the rule list), with presets as the quick path, like Gmail quick settings
   over full settings.
3. **Wrong place** → *Apple's Settings rule.* Delete forever is a task option, so it belongs in
   Clean up's Trash confirm, not Settings > Advanced. Setup is a first-run flow, not a Home card.
   One history: pick Activity or Safety net.
4. **Unreadable controls** → *label every switch; user's words.* All 13 unnamed switches get
   labels. Remove jargon like "verified one-click" and "Draft rule locally".
5. **Too deep** → *two levels max, one disclosure per view.* Clean up > More ways > By domain >
   Finance breaks both rules. Organize's four collapsed sections break "one disclosure per view".
6. **Big one-tap actions** → *one primary action; destructive last and marked.* "Unsubscribe
   all" can be the page's single primary action once, with a count in the confirm, like Apple
   Mail's titled menu for multiple selection ("states the number of selected messages").

### How to pick what stays (the process to copy)

1. **Usage counts from Cluster's own action log.** The undo log already records every action
   locally. Rank verbs by use per place, like Microsoft's command data. Nothing leaves the device.
2. **A top-tasks vote from you** (and any testers): pick up to 5 from the full list of ~40 verbs.
3. **One task sentence per place**, then cut every control that doesn't serve it, moving the
   rest to a single "More" per place.
4. **Check with one real-mailbox walk-through** before building, as NN/g advises (frequency
   alone can mislead).

## Sources

- Apple HIG: [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), [Context menus](https://developer.apple.com/design/human-interface-guidelines/context-menus), [Menus](https://developer.apple.com/design/human-interface-guidelines/menus), [Disclosure controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls), [Settings](https://developer.apple.com/design/human-interface-guidelines/settings)
- [Microsoft Inductive User Interface Guidelines (2001)](https://learn.microsoft.com/en-us/previous-versions/ms997506(v=msdn.10))
- [NN/g, Progressive Disclosure (2006)](https://www.nngroup.com/articles/progressive-disclosure/)
- [Office command usage, quoted on Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/4828738/what-is-the-percentage-of-features-of-word-excel-a?forum=msoffice-all) (secondhand)
- Outlook Simplified Ribbon: [Microsoft Support](https://support.microsoft.com/en-us/outlook/use-the-simplified-ribbon), [GeekWire 2018](https://www.geekwire.com/2018/office-gets-new-look-subtle-changes-microsoft-flagship-service-aim-reflect-new-era-work/), [Engadget 2018](https://www.engadget.com/2018-06-13-microsoft-office-ui-redesign-simpler-ribbon.html) (press)
- [Gmail quick settings, Workspace Updates 2020](https://workspaceupdates.googleblog.com/2020/05/new-gmail-quick-settings-optimize-inbox.html)
- [Fluent 2 button usage](https://fluent2.microsoft.design/components/android/core/button/usage); [Material Design menus (M1)](https://m1.material.io/components/menus.html)
- [Gmail blog, Bundles in Inbox (2014)](https://gmail.googleblog.com/2014/11/a-bit-about-bundles-in-inbox.html); Apple Mail categories via [9to5Mac](https://9to5mac.com/mail-app-ios-18/) (press)
- Gerry McGovern Top Tasks via [University of Glasgow guide](https://www.gla.ac.uk/myglasgow/ux/explore/toptasks)
