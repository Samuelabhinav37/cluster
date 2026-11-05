# UI wording: why the old names read as unprofessional, and the fix

Date: 2026-11-05. Applied to `research/2026-11-05-redesign-mockup.html` (round 4).

## What the style guides agree on

1. **Sentence case** for titles, tabs, labels and buttons [1][2][3].
2. **Tabs, titles and columns are nouns. Buttons are verbs** [4][5]. "Lists you can leave" is a sentence, not a name.
3. **Short.** Buttons are 1 or 2 words, 4 at most [6]. Labels and buttons drop "a" and "the" [3].
4. **No jargon or idioms. Use the terms the platform already uses** [3]. For Gmail that means Spam, Phishing, Suspicious, Quarantine and Release [7].
5. **No chatty "you" phrasing in names.** Report names are neutral noun phrases, like "Top senders" and "Email received" (see `2026-11-05-kai-placement.md`).

The old copy broke rules 2, 4 and 5. "Look at these", "You pay for these", "Pretends to be" and "Old codes and news" are conversational. They also don't match what Gmail calls the same things.

## Changes

| Where | Before | After |
|---|---|---|
| Sidebar | Clean up / Organize / Protect | Cleanup / Labels / Security |
| Cleanup numbers | Never opened / Old codes and news / Lists you can leave | Unopened / Expired / Unused subscriptions |
| Cleanup tabs | Emails / Subscriptions | Senders / Subscriptions |
| Cleanup columns | Why / Last email / Opened | Reason / Last received / Open rate |
| Reasons | Never opened / Old codes / List | Unopened / Expired code / Mailing list |
| Subscription filters | All / Still sending / Stopped | All / Active / Pending / Unsubscribed |
| Subscription columns | Sends / Last 8 weeks | Frequency / Volume, 8 weeks |
| Button | Unsubscribe from 22 | Unsubscribe (22) |
| Sections | You pay for these / Do this automatically | Paid subscriptions / Automation |
| Switches | Move mail you never open to Read later | Move unopened mail to Read later |
| | Keep only the newest 3 codes from each sender | Keep latest 3 codes per sender |
| | Show newsletters on Saturday only | Deliver newsletters on Saturdays |
| Labels | Sort my inbox / Keep in inbox | Sort inbox / Time in inbox |
| Security numbers | Held this week / Warning signs | Quarantined / Threats detected |
| Security tabs | Suspicious / Held / Blocked | Suspicious / Quarantine / Blocked |
| Security rows | Pretends to be Netflix / High risk | Impersonating Netflix / High |
| Security switches | Holding: Hold emails that look like a scam … Send held emails to Spam | Quarantine settings: Quarantine suspected phishing … Move quarantined mail to Spam |
| Activity | What happened / Where / This week / Undone | Action / Source / Filed this week / Reverted |
| Settings | Look back over / Scan again / Label new mail as it arrives / Keep new mail in the inbox for | Scan range / Rescan mailbox / Auto-label incoming mail / Default time in inbox |
| | Kai learns from what you undo / All shortcuts / Erase everything Cluster stored | Learn from undo actions / View shortcuts / Delete all Cluster data |
| Details | Trash all | Move all to Trash |
| Kai | You have 22 lists you never open. Want me to… / Show them / Not now / See the rule | 22 subscriptions have no opens in 90 days. Unsubscribe from all of them? / Review / Dismiss / View rule |

Kept as is: Overview, Activity, Settings, Details, Kai, Release and Trash (Gmail's own words), and "Welcome back, Samuel!" (asked for).

## Sources

1. Material Design, "Writing": https://m1.material.io/style/writing.html
2. Carbon Design System, "Writing style": https://v10.carbondesignsystem.com/guidelines/content/writing-style
3. Atlassian Design System, "Style, grammar, and punctuation": https://atlassian.design/foundations/content/language-and-grammar
4. Oracle BLAF, "Language in UI": https://download.oracle.com/tech/blaf/specs/language.html
5. KDE HIG, "Labels": https://develop.kde.org/hig/style/writing/labels/
6. Splunk Style Guide, "Button labels": https://help.splunk.com/splunk-style-guide/ui-text-guidelines/button-labels
7. Google Workspace Admin Help, "Gmail log events": https://knowledge.workspace.google.com/admin/reports/gmail-log-events
8. Microsoft, Windows Admin Center UI text guide: https://learn.microsoft.com/en-us/windows-server/manage/windows-admin-center/extend/guides/ui-text-style-guide
