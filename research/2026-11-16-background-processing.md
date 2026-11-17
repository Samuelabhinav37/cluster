# Keeping Cluster's work going when Chrome is closed

2026-11-16. Question: can Cluster keep reading and sorting mail with no Cluster
window open, and even with Chrome closed? How do other email tools do it?

## What Cluster does today

- The first mail read now continues in the extension's background worker when
  the last Cluster tab closes (commit fa215ca, `src/lib/backgroundRead.ts`).
  A one-minute alarm picks it up again if Chrome stops the worker.
- Sorting new mail mostly happens in **Gmail filters** that Cluster creates.
  Those run on Google's servers, so they keep working with Chrome closed and
  the computer off.
- Everything else (the read, the one-hour inbox sweep, scam holds, the Today
  email) runs only while Chrome is running.

## How long a Chrome extension can run

- Chrome stops an extension's background worker after 30 seconds without
  events. Receiving an event or calling an extension API resets that timer.
  Since Chrome 110 a worker stays alive while it keeps receiving events.
  Chrome also says to design workers to survive being stopped and to use
  alarms for recurring work. Since Chrome 120, alarms can fire as often as
  every 30 seconds.
  ([Chrome: service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle),
  [Chrome blog: longer worker lifetimes](https://developer.chrome.com/blog/longer-esw-lifetimes))
- A pending `fetch()` is not a reliable way to keep the worker alive
  ([Chromium extensions group](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/L3EbiNMjIGI)).
  Cluster's background read calls `chrome.tabs.query` every 15 seconds, which
  resets the timer, and the one-minute alarm restarts the read if the worker
  is stopped anyway.
- **When the last Chrome window closes:** Chrome quits completely unless some
  extension has the `"background"` permission and the Chrome setting
  "Continue running background apps when Google Chrome is closed" is on (it
  is on by default). With both, Chrome keeps running from the system tray
  and extension workers keep working until the user quits Chrome.
  ([Chromium extensions group: state with no windows](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/n9uReJzQv1I/m/E6nS0MfcAwAJ),
  [Native messaging stops when windows close](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1ccmfmH8F0o),
  [Background mode on Mac](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/7E5W4HQ8v_Y))
  The `"background"` permission can be made optional and requested when the
  user turns it on
  ([Stack Overflow](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/11993115/chrome-extension-close-background-page-after-closing-chrome)).
  This comes from forum posts, not an official Chrome page, so test it before
  relying on it. macOS behavior changed around Chrome 109 and 110.
- **Nothing in Chrome can run after the user quits Chrome (Quit or Exit in the
  tray menu) or the computer sleeps or shuts down.** Only a server can.

## How other email tools do it

- **SaneBox:** a server connects to the mailbox over IMAP and moves mail
  between folders on the mail server. No app or extension is needed, and it
  runs while your computer is off.
  ([SaneBox: how it works](https://sanebox.com/help/155-how-does-sanebox-work),
  [Geekflare review](https://geekflare.com/software/sanebox-review/))
- **Server tools on the Gmail API in general:** `users.watch` sends mailbox
  changes to a Google Cloud Pub/Sub topic. The server then calls
  `users.history.list` to fetch the changes. A watch expires after at most
  7 days and must be renewed, usually daily, with a stored refresh token.
  ([Gmail API: users.watch](https://developers.google.com/gmail/api/v1/reference/users/watch),
  [Unipile guide](https://www.unipile.com/gmail-api-push-notifications/),
  [Nylas guide](https://cli.nylas.com/guides/gmail-push-notifications))
- I found no public engineering write-ups for Clean Email, Shortwave or
  Unroll.me.

## What a server costs

- Storing or sending restricted Gmail data through a server (Cluster uses
  `gmail.modify`) requires Google's restricted-scope verification **plus a
  yearly CASA security assessment** by an approved lab before the app can go
  to production.
  ([Google: restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification?hl=ja),
  [Nylas: security assessment guide](https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide/),
  [Nango: Google security review](https://nango.dev/docs/api-integrations/google-shared/google-security-review))
- It also ends Cluster's promise that mail never leaves the device ("Nothing
  in this report left your device").

## Options

| | Runs with window closed | Runs with Chrome quit or computer off | Cost |
|---|---|---|---|
| A. Today (worker + alarm) | Yes, while Chrome is open | No | Done |
| B. Optional `"background"` permission, a Settings switch | Yes, Chrome stays in the tray | No | Small: one switch, a permission prompt |
| C. More of the work as Gmail filters | Yes | Yes, for what filters can do | Medium: filters can label, archive, skip the inbox. They can't do time-based moves or scam checks |
| D. Cloud worker (Gmail watch + Pub/Sub + refresh tokens) | Yes | Yes | Large: server, token storage, yearly CASA, and the end of the on-device promise |

## Recommendation

B now: the smallest change that keeps work going after the last window
closes. Then C: move whatever a Gmail filter can express into filters, since
those run on Google's servers for free. D only if running with the computer
off matters more than the on-device promise, as a separate product decision.

## Done (2026-11-16)

- B for everyone, not optional: `"background"` is in the manifest.
- C, first pass: newsletters held for their delivery day are filed by their
  Gmail filter on arrival. A stranger caught as a scam gets a Gmail filter
  that holds their future mail as Suspicious; "It's fine", "Not a scam" and
  Undo remove only that filter. Still needing Chrome: the timed inbox sweep,
  Screener detection of brand-new senders, scam checks of first emails,
  the unsubscribe backstop for senders without a List-Id, the Today email.
