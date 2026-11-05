# How top products lay out and word Settings

Date: 2026-11-05. Applied to the Settings page in `research/2026-11-05-redesign-mockup.html` (round 5).

## Layout

| Pattern | Who does it | Cluster |
|---|---|---|
| **Section list on the left, content on the right** | GitHub, Linear, Vercel, Notion, macOS System Settings. Sidebar or vertical tabs once there are more than a handful of sections [1][2] | 10 sections on the left, sticky |
| **One scrolling page when there are about 20 settings or fewer**; separate pages only beyond that [3] | Vercel, Linear Preferences | One page; the left list jumps to each section |
| **Grouped by what people look for**: account, preferences, notifications, security, data [2][4] | Linear: Account, Features, Administration [4] | Account, General, Mail, Labels, Security, Notifications, Kai, Keyboard, Privacy & data |
| **Row = label + optional one short line + control on the right** | iOS and macOS lists; the label sits in the row, never on the switch [5] | Same; the short line only where the label alone isn't clear |
| **Changes save as you go**, no page-level Save over controls that already save [3] | iOS, macOS, Linear | No Save button |
| **Destructive actions last, in a "Danger zone"**, set apart, each with confirmation, saying what it affects and whether it can be undone [1][6] | GitHub, Vercel | Disconnect Gmail, Delete all Cluster data, in a red-outlined box |
| **Search at the top** | macOS, Chrome, Android | "Search settings" |
| **Don't repeat system settings** [7] | Apple HIG | Appearance follows "System" by default |

## Language

- **Labels are nouns or short verb phrases** in sentence case: "Scan range", "Blocked senders", "Auto-label incoming mail".
- **The short line says the effect, not how it works:** "Rules keep working when Chrome is closed", "Also trains Gmail's spam filter".
- **Buttons are one verb:** Sign out, Rescan, Manage, View, Export, Disconnect, Delete data.
- **No questions, no "you can…", no exclamation marks.**
- **Destructive copy names what is lost:** "Removes labels, rules and history. Can't be undone."

## Note

Earlier Cluster rules said "no explanation lines, use an (i)". Every product above puts one short line under a setting whose label isn't self-explanatory, so the mockup does that in 9 rows of 23. If you'd rather keep the (i) rule, those lines move into (i) popovers.

## Sources

1. SaaS UI, "Settings page UX patterns": https://www.saasui.design/blog/saas-settings-page-ux-patterns
2. SaaSFrame, "SaaS settings page design examples": https://www.saasframe.io/blog/saas-settings-page-design-examples
3. Threshline, "Settings page UX design": https://threshline.pages.dev/blog/settings-page-ux-design
4. Linear changelog, settings redesign (2024-12-18): https://linear.app/changelog/2024-12-18-personalized-sidebar ; Linear docs, "Preferences": https://linear.app/docs/account-preferences
5. Apple HIG, "Toggles": https://developer.apple.com/design/human-interface-guidelines/toggles
6. Perforce Force design spec, "Settings page": https://the-force-design-spec-site.public.dev.shared.perforce.com/patterns/compositions/settings-page/
7. Apple HIG, "Settings": https://developer.apple.com/design/human-interface-guidelines/settings
