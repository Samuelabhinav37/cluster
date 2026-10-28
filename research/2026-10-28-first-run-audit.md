# First-run audit, 2026-10-28

Build: master at 32aca7c (UI as of 4ec0902). Preview on port 4600 with `?reset`, sample mailbox,
window 1568 x 758. Walked as a new user: connect, then each place in the sidebar, then Settings.

Checks: typecheck clean, lint clean, 1157 tests pass (3 expected fail), bundle budgets ok.
Console: no errors or warnings on load, after reset, or during the walk.

## Bugs

1. **Rule drafting hangs.** Organize > New rule > example > Draft stays on "Drafting locally…"
   with the button disabled (9 s+, Chrome with `LanguageModel` "available").
   `src/lib/aiRuleDraft.ts:187` has no timeout and no fallback when `create()` or `prompt()`
   stalls or throws. Fix: race against a few seconds, fall back to `deterministicDraft`.
2. **Home double counts Clean up.** "246 emails ready to go" out of a 250 email inbox.
   `clearOutPlan` (`dashboard.ts:1379`) adds never-opened and past-its-date counts with no
   de-duplication.
3. **Scroll position carries between pages.** Stop mail and Organize opened half scrolled, title
   off screen. `showScreen` should reset the scroll container to the top.
4. **Escape closes Details, not the open ⋯ menu.** The menu stays open.
5. **Old bulk bar on Clean up.** "Select safe · 0 selected · Bulk keep sorted selected · Snooze
   for" sits under a list whose rows have no checkboxes (`#sender-bulk-bar`).
6. **Unlabelled checkboxes** in Clean up's "More ways to clean up" groups (no aria-label).
7. **Protect points to the wrong place.** Empty chart says "Turn on scam holding in Likely
   scams"; the switch is under Holding.

## Hard to understand or find

- **Details and Clean up list one row per address.** LinkedIn x3, Amazon.com x2, and two
  "Netflix" rows. One is the scam `billing@netflix-account-update.xyz` with the same name and
  badge as the real one, no warning. Senders groups by company; Details and Clean up don't.
- **Clean up has no Trash on rows or in ⋯.** The page is named for deleting, but rows offer
  Unsubscribe or Mute, which is Stop mail's job. Trash exists only on the "Past its date" card.
- **Company cards in Senders have no actions**; single-sender cards do (Unsubscribe, Keep sorted,
  Mute, Show emails). "Keep sorted" doesn't say what it does.
- **Stop mail wording**: "verified one-click", "page", Outcome filter ("didn't reach them",
  "needs your click"). Every list says "Monthly" (LinkedIn at 22 emails too); Senders says
  "3 a month" for the same sender. Groupon is "page" but the button says "Unsubscribe by email".
  "Unsubscribe all" (22) is one tap on a floating bar.
- **Organize is the longest page**: Sort now, 7 + 2 switches, Tidy once, rules, custom times,
  Apply, More tools. "Leave the inbox" doesn't say archive. "Tidy once" uses a "Turn on" button.
  "No rules yet" sits beside "Enable a rule to see its dry run" and "Apply enabled rules now".
- **Rule sheet** says "New rule" twice; "Draft rule locally" then "Save reviewed draft" is two
  steps with jargon.
- **Setup is hidden.** "Set Cluster up for you" lives in Settings, which is only in the account
  menu. A new user may never see it. Settings also opens with "Tidy up labels left by older
  versions" on a fresh install, because the account already has a "Travel" label.
- **Protect reasons lead with the technical check** ("failed the check that proves it came from
  netflix-account-update.xyz") instead of "Pretends to be Netflix". Checkup repeats the bento's
  numbers.
- **Four columns on Senders** (Lists, list, card, Details) at 1568 px, with Details repeating the
  sender list.
- Connect page: five lines of small grey text; "app isn't verified" reads as a warning.

## Easy, and why

- **Connect**: one job, one button.
- **Home**: five tiles that each open their place, with one number each. Protect's tile shows the
  faked brands' logos, which says "scam" without words.
- **Progress bar** at the bottom: "Reading your mail · 187 of 206 · about 1 min left", and it says
  when Gmail's speed limit pauses it.
- **Protect rows**: brand logo with a red badge, the subject in quotes, one reason, red Block.
- **Single-sender card** in Senders: big numbers (emails, opened, how often) and plain actions.
- **Settings** reads like iPhone Settings: grouped rows, switches, one action per row.
- **Sidebar**: five places with colored icons and counts; Stop mail shows under Clean up.

## Not checked

Real Gmail, notifications, Erase in real Chrome, narrow windows, keyboard-only use of every
screen, dark/light switching.
