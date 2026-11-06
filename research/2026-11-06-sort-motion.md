# Sort inbox motion: what transfer apps do (2026-11-06)

Asked for: check how WeTransfer, Dropbox, Google Drive, Send Anywhere and Blip/LocalSend animate transfers, then do the same in Sort inbox.

## What could be confirmed

- **Dropbox brand motion:** four principles, in its own words: prioritize simplicity, deepen understanding, instant feedback, subtle playfulness. Feedback should be a subtle "wink", not confetti. Easing is `cubic-bezier(0.65, 0, 0.45, 1)`. The guide sets no durations. [brand.dropbox.com/motion](https://brand.dropbox.com/motion)
- **Dropbox sync state:** a blue badge while syncing, replaced by a green check when done. [addictivetips](https://www.addictivetips.com/windows-tips/no-green-check-mark-on-the-dropbox-system-tray-icon)
- **Material 3 progress (Google):** determinate linear and circular indicators, plus newer "wavy" variants with amplitude, wavelength and wave speed. The active part and the track never overlap. [Compose LinearWavyProgressIndicator](https://kotlinlang.org/api/compose-multiplatform/material3/androidx.compose.material3/-linear-wavy-progress-indicator.html), [progress_indicator_m3e](https://pub.dev/documentation/progress_indicator_m3e/latest)
- **Send Anywhere:** a 6-digit key starts the transfer, and the waiting screen and loading animation were redesigned over several releases. No design spec is public. [Softpedia changelog](https://mac.softpedia.com/progChangelog/Send-Anywhere-Changelog-140173.html)
- **LocalSend:** discovers nearby devices on the same network, and the receiver confirms. Its 1.12 release made the spin animation cheaper on the GPU. [Neowin](https://www.neowin.net/amp/localsend-1120/)
- **WeTransfer:** nothing official on its progress design turned up. The circle over a shifting color background is from the user's notes and the product itself.

Most of the details in the user's notes (gradients, radar pings, packets) are not documented anywhere. They match what the apps visibly do, so they are used as patterns, not specs.

## What Sort inbox does with it

| From | In Sort inbox |
|---|---|
| WeTransfer | The progress ring sits on a soft, blurred glow of slowly turning color. It brightens and speeds up while sorting and settles when done. The ring's arc runs from blue to violet. |
| LocalSend / Blip | Before you start, two radar rings ping out from the ring, as if it is looking over the inbox. |
| Send Anywhere | While sorting, a radar sweep turns inside the ring. Each time a label finishes, a dot in that label's Gmail color flies from the ring to its row. |
| Google Drive | A thin Material bar slides under the label being filed. The ring is determinate and fills as labels finish. |
| Dropbox | When done, the check draws itself and the ring winks once (a 4% scale). Each row's tick pops in. No confetti. Every move uses Dropbox's easing. |

With reduced motion there is no glow movement, pings, sweep, packets, slide, pop or drawing. The counts and ticks still update.

## Update, same day: the user found this too flashy

Feedback: "less flashy, smooth and easy". The glow, pings, sweep, flying dots, sliding bar, wink and pop are gone. What stays:

- While Cluster looks (scanning, creating labels), a short accent arc turns slowly on the ring.
- While sorting, the ring fills smoothly as each label finishes. The row being filed has a small spinner, and finished rows get a tick.
- At the end the check draws once. Done goes back to the two choices.

The page now starts with two choices: **New mail** (only mail with no Cluster label yet, checked against Gmail) and **Everything** (create every Cluster label, then relabel the whole inbox from the mail index, then "Everything is sorted").
