# Protect: how others split safety into parts

Asked 2026-10-27: Protect (Safety, New senders, Scam report) is too wordy; find how to divide it
into subsections and group decisions. Mockup: `2026-10-27-home-cleanup-mockup.html`, Protect.

## Today (preview, `?big`)

| Screen | Words | Controls | Notes |
|---|---|---|---|
| Safety | 202 | 13 | each scam lists up to 3 full-sentence reasons and 4 buttons |
| New senders | 54 | 1 | mostly explanation; one row per sender when holding is on |
| Scam report | 107 | 0 | four charts, no action |

## What others do

- **Apple Passwords, Security Recommendations.** One Security card; problems split into
  "High Priority" (compromised) and "Other" (reused, weak). Tap an item to fix it.
  ([Apple Platform Security](https://support.apple.com/guide/security/sec7f0432063/web),
  [Macworld](https://www.macworld.com/article/1531754/update-passwords-apple-security-recommendations.html))
- **1Password Watchtower.** One tile per kind of problem with its count; "any Watchtower
  category that has items in it will appear", empty ones don't.
  ([1Password Support](https://support.1password.com/watchtower/))
- **Google Security Checkup.** Green check when healthy, red/yellow items first, and only
  sections relevant to your account appear.
  ([Google Account Help](https://support.google.com/accounts/answer/46526?hl=en))
- **iOS 26 Messages, Screen Unknown Senders.** Unknown senders go to their own list, out of the
  main one; "Mark as Known" lets one in. Senders you've replied to are not filtered.
  ([Apple Support](https://support.apple.com/en-gb/125068),
  [iPhone Life](https://iphonelife.com/content/how-to-filter-unknown-known-senders-messages-your-iphone))
- **HEY Screener.** One yes/no per first-time sender; contacts skip it; a whole domain can be
  screened at once; the sender is never told.
  ([HEY Help](https://help.hey.com/article/722-the-screener))
- **Gmail's banner.** One line of reason ("Be careful with this message") plus report or mark
  safe. ([Brown University IT](https://ithelp.brown.edu/kb/articles/gmail-anti-spoofing-warning-banner))

## What Protect takes from them

1. **Three tiles as the subsections:** Likely scams, New senders, Held so far. Each shows a
   count; the selected one shows its list below (Watchtower). A tile with nothing in it reads
   "None" or is hidden, and the screen says "All clear" with a check (Google).
2. **Scams in two tiers:** "High priority" (hold-level) and "Worth a look" (warn-level), like
   Apple's High Priority / Other. One row per email: the subject, the single strongest reason in
   one line, one button (Trash for high, "It's fine" for worth a look) and ⋯ for Block, Report,
   Deep scan and the full reasons.
3. **New senders in batches:** people you've written to and businesses you already get mail
   from are each one row with "Let in all" (iOS skips people you've replied to; HEY lets
   contacts through). Only strangers are reviewed, one card at a time, Hold / Let in, ← →.
4. **Held so far replaces the Scam report:** who they pretended to be, with counts, and one line
   for the period. No charts without a decision.
5. **Each switch lives with its subsection** (Hold likely scams, Hold new senders) instead of a
   paragraph above the list.

Measured in the mockup: Likely scams 80 words, New senders 44, Held so far 36; 18 controls each.
