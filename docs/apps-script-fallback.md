# Parked: keep sorting with the computer off (Apps Script)

Status: parked 2026-11-17. Build only if people report mail not moving out of
the inbox while their computer is off or Chrome is quit.

## The problem

Cluster runs inside Chrome. With Chrome quit, or the computer off or asleep:
- New mail still gets its label, because Gmail's own filters do that.
- "Move right away" labels still leave the inbox, because a Gmail filter does that too.
- These wait until Chrome runs again:
  - Moving labelled mail out of the inbox after its time (1 hour, 1 day and so on).
  - Holding scams.
  - Sending first-time senders to the Screener.

Closing Chrome's windows alone doesn't stop Cluster. The manifest has the
`background` permission, and Chrome's "Continue running background apps"
setting is on by default.

## The idea

A small Google Apps Script in the user's own Google account, on a 10-minute
timer. It runs on Google's servers as the user, so the mail never leaves Google
and no Cluster server is involved.

First version, the hour-later move only. For each label with a time:

```js
// Untested sketch. Cluster would fill LIMITS with the user's labels and hours.
const LIMITS = { "🏷 Promotions": 1, "📰 Newsletters": 24 };
function sweep() {
  const now = Math.floor(Date.now() / 1000);
  for (const [label, hours] of Object.entries(LIMITS)) {
    const q = `label:"${label}" in:inbox -is:starred before:${now - hours * 3600}`;
    let threads;
    while ((threads = GmailApp.search(q, 0, 100)).length) GmailApp.moveThreadsToArchive(threads);
  }
}
function install() {
  ScriptApp.newTrigger("sweep").timeBased().everyMinutes(10).create();
}
```

Gmail search takes an exact time as `before:` followed by Unix seconds. Check
that, and how the label name with its emoji is matched, before relying on
either.

Later, the script could also:
- Send mail Gmail flags as suspicious to the Screener.
- Hold domains Cluster already marked as scams.

Cluster's full scam and first-time-sender checks are too big to port. Those
still run when Chrome is back.

## Limits (free Gmail account)

Source: [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).

- 90 minutes of timed running a day. Every 10 minutes is about 35 s per run.
- 6 minutes per run.
- 20,000 email reads or writes a day.

It won't speed up the first read. That's about 2 minutes with sender counting,
and getting data back from the script into Cluster adds a lot of moving parts.

## Installing (decided: copy and paste)

1. In Settings, Cluster shows a "Keep sorting when your computer is off" card,
   with the script already filled in with the user's labels and times.
2. The user opens script.google.com, pastes the script, and presses Run on
   `install` once. Google asks for Gmail permission, and the timer starts.
3. Changing a label's time in Cluster means pasting the new script. Or the
   script could read the times from a label description, so it never needs
   re-pasting.

Not chosen: Cluster installs the script itself through the Apps Script API.
- It needs the `script.projects` permission, a consent screen change, and
  likely another Google verification.
- The user must still turn on "Google Apps Script API" by hand at
  script.google.com/home/usersettings
  ([Google's guide](https://developers.google.com/apps-script/api/how-tos/enable)).
- Others report that switch taking hours to start working.
