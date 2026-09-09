# Your data, in plain language

Cluster cleans up, sorts, and screens your Gmail or Outlook inbox. Here's exactly what that
involves, without the jargon. For the full technical breakdown (scopes, headers, retention),
see [`SECURITY.md`](../SECURITY.md).

## There is no Cluster server

Cluster runs entirely inside your browser, using your own Google or Microsoft sign-in. There is
no Cluster-operated backend anywhere — nothing you do in the extension is sent to us, because
there's no "us" to send it to. The extension talks directly to Gmail's API or Microsoft Graph,
the same way any other app you've signed into does.

## It reads headers, not your mail

By default, Cluster only ever looks at message **metadata**: who a message is from, its subject
line, when it arrived, its size, and whether it's read or starred. It never reads the body of
your email — the part with the actual content — with one narrow, deliberate exception below.

## The one exception: "Deep scan"

If you click "Deep scan" on a specific flagged sender, Cluster fetches that **one** message's
full body, checks whether any link's visible text matches where it actually goes (a classic
phishing trick), and then immediately discards the body. It's never automatic, never runs in the
background, and the body is never stored or sent anywhere — it's read, checked, and thrown away
in the same moment.

## On-device AI, not a server AI

Three features — a plain-English digest, drafting a rule from a sentence you type, and
classifying mail Cluster can't otherwise categorize — use Chrome's **built-in, on-device** AI
(Gemini Nano). These run locally, on your own computer's hardware. Nothing about your mail is
sent to any AI company's servers. If your computer doesn't support Chrome's on-device AI, these
features quietly don't appear — the rest of Cluster works exactly the same either way.

## What actually leaves your device

Being honest about the narrow list of places data does go:

- **Unsubscribing.** When you click a verified one-click unsubscribe, the request goes straight
  to that sender's own unsubscribe link — never to Cluster — over HTTPS only, with no
  credentials attached and no redirects followed.
- **Deep scan's link check**, described above — one outbound check of a link you're reviewing,
  guarded against private/internal addresses.
- **Sorting and filtering.** Creating a Gmail filter or Outlook rule (for "keep sorted," "mute,"
  or the Screener) happens through Gmail's or Outlook's own API — it's your mailbox's own
  settings being changed, the same as if you'd clicked "create filter" yourself in Gmail.
- **Signing in.** Your Gmail token is held by Chrome itself, not by Cluster. Your Outlook token
  is used only to talk to Microsoft's own servers to keep you signed in.

That's the complete list. Everything else — your settings, rules, and the log of what Cluster
has done — stays in your browser's local storage, on your device, and is deleted the moment you
uninstall the extension.

## Open source

All of this is verifiable, not just asserted. Cluster's full source is on GitHub:
[github.com/Samuelabhinav37/cluster](https://github.com/Samuelabhinav37/cluster). If you'd like
to check any claim on this page against the actual code, everything here traces back to
[`SECURITY.md`](../SECURITY.md) and the `src/` directory.
