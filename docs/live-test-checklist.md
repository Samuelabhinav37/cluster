# Cluster live test checklist

Run this in your own Chrome against your own Gmail. Tests can't cover OAuth,
real Gmail filters, or what happens with Chrome closed. Rewritten 2026-11-19
for the current screens. Outlook is frozen, so it isn't here.

Two parts. Part 1 is a one-time pass over every screen. Part 2 is the 7-day log
(plan step 4.1) that sets the numbers for everything after it.

## Load

1. `npm run build`. Not `npm run dev`; the dev server gives an unstable load.
2. `chrome://extensions`, Developer mode on, **Load unpacked**, pick `dist/`.
3. No load error. The toolbar icon is the Cluster mark.
4. Click it. The dashboard opens in a new tab.

Keep DevTools open on the dashboard and on the service worker
(`chrome://extensions` > Cluster > "service worker"). Note any red error with
the screen you were on.

## Part 1: one pass over every screen

### Setup (fresh install, or `?reset`)

- [ ] Welcome asks your name, then signs in to Google.
- [ ] Kai explains each step in a line or two.
- [ ] The scan runs live, then shows what it found.
- [ ] Setup says plainly that mail waits in the inbox for an hour, and stays
      there with Chrome closed until Chrome opens again.
- [ ] Setup ends on the dashboard tour. Nothing asks the same question twice.

### First read

- [ ] The first read shows as a file copy: percent, "Now reading" a sender and
      month, a time left, labels filling in.
- [ ] Close the tab halfway, open it again. The read carries on from where it
      was. No "done" before it's done.
- [ ] Note how long the whole read took and how many emails: ____ min, ____ emails.

### Dashboard

- [ ] Opens straight away from the saved index, with "Updating…" while it syncs.
- [ ] Four groups: People, Transactions, Updates, Offers.
- [ ] Clicking a number opens Details for the same range, with the same count.
- [ ] The sidebar card shows what Cluster is doing and how much is left.

### Labels

- [ ] Every label has a count that matches Gmail's own count for that label
      (spot check three).
- [ ] **Fixes this week** shows "N per 100".
- [ ] New labelled mail stays in the inbox for about an hour, then leaves.
- [ ] A label set to **Move right away** skips the inbox at once.
- [ ] Gmail Settings > Filters has Cluster's filters. None was rejected.
- [ ] Move one email to a different label in Gmail. Within a sweep, Cluster
      counts it as a fix and sorts that sender's next email the new way.

### Top bar

- [ ] **Sort > New mail** finishes in seconds.
- [ ] **Sort > All mail** opens Sort mail, shows the plan, then progress per label.
- [ ] **Check for new mail** picks up an email you just sent yourself.
- [ ] **Search** (or `/`) finds an email by sender and by subject word.
- [ ] **Details** opens, minimizes to the right edge, and remembers that.

### Screener (Security > New senders)

- [ ] **Hold mail from new senders** is on. Mail from a first-time sender lands
      in the Screener, even if it would get a label.
- [ ] Codes and account emails from new senders are not held.
- [ ] **Hold people too** works both ways.
- [ ] Let someone in. Their mail goes back to the inbox and they're not held again.
- [ ] Senders you already had mail from before installing are not held.

### Security

- [ ] The four numbers make sense: threats, kept out, sender checks, new senders.
- [ ] **Checks** lists each check with a result. **Scan now** runs them.
- [ ] Phishing hold is on by default. A held scam has no sort label on it.
- [ ] Spam goes to Spam. Marketing is never trashed or unsubscribed on its own.

### Cleanup and Stop mail

- [ ] The four cards: total, never opened, old codes and news, lists.
- [ ] **Senders** and **Mailing lists** tabs each show a table with its tools.
- [ ] Trash a sender's mail. It asks first, then it lands in Activity with Undo.
- [ ] Undo puts every email back.
- [ ] Unsubscribe from one list. It shows as pending, and later whether it worked.
- [ ] A bulk trash of 500+ emails survives closing the tab halfway.

### Activity

- [ ] Account menu > **Activity** lists what Cluster did, newest first.
- [ ] Every action that changed mail has a working Undo.

### Settings

- [ ] Sections shown: Account, Sorting, Security, Notifications, General,
      Danger zone. (What Cluster learned, Diagnostics, Mail, Automation,
      Privacy, Kai and Advanced are hidden for now.)
- [ ] The toolbar badge never shows `!`. If it does, note when; that's a
      failing background job.
- [ ] Settings sync to a second Chrome signed in to the same Google account.
- [ ] Danger zone > **Remove from Gmail** removes Cluster's labels and filters
      and leaves your own alone.

### Chrome closed

- [ ] Close Chrome for 3+ hours with mail arriving. Gmail filters still label it.
      It stays in the inbox until Chrome opens, then the sweep moves it.
- [ ] Phishing arriving while closed is held once Chrome opens.

## Part 2: the 7-day log

Use Gmail as normal. Fix anything that's in the wrong place, in Gmail or from
Details, so it's counted. Once a day, fill in one row.

| Day | Fixes per 100 (Labels) | New senders waiting | Emails in inbox | Wrong label you saw (sender, label, should be) | Errors |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |

On day 7, run `clusterExportReplay()` in the dashboard console and keep the
file it saves. It lets us replay your week against every later change.

**Pass:** under 5 fixes per 100 for the week, a Screener share you think is
fair, no person ever given a sort label, no lost email.

## Known open questions to watch

- Does Discover payment mail move out of Receipts after the daily relabel?
- Does a scam that looks like a receipt (the Netflix case) still get Receipts?
- A sender whose From has a comment after `<address>` (plan 4.7). Note any
  sender shown with a broken address.
- How long a `from:(a OR b …)` list does Gmail accept before it rejects a filter?
