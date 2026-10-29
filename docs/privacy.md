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
your email — the part with the actual content — with the narrow exceptions below.

## The exceptions: links in mail that looks like a scam

When a sender is already flagged as a possible scam, Cluster reads the newest flagged message's
full body to check its links. It checks two things. Does a link's visible text match where it
really goes? Does any link go to a site on a public list of scam and malware sites? It does this
for at most 20 messages each time you open Cluster, and the "Deep scan" button does the same for
one message when you click it.

Cluster keeps only two numbers per message: how many links didn't match, and how many went to a
listed site. The body itself is read, checked and thrown away in the same moment. It's never
stored and never sent anywhere, and the background pass never reads a body.

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
- **Unsubscribe emails.** Some senders only take an unsubscribe request by email. Cluster lists
  each one it would send (from, to, subject, body) and sends nothing until you press Send. It
  sends from your own Gmail account, to the address the sender gave, with the sender's own
  subject and body and nothing added. Each one shows in your Sent folder. Cluster won't send to
  an address the sender didn't sign, or for mail in Spam. On Outlook, Cluster can't send mail;
  it saves the email as a draft in your Outlook account for you to send.
- **Deep scan's link check**, described above — one outbound check of a link you're reviewing,
  guarded against private/internal addresses.
- **Sorting and filtering.** Creating a Gmail filter or Outlook rule (for "keep sorted," "mute,"
  or the Screener) happens through Gmail's or Outlook's own API — it's your mailbox's own
  settings being changed, the same as if you'd clicked "create filter" yourself in Gmail.
- **Signing in.** Gmail sign-in uses Google's own window. Google only completes it with
  Cluster's client secret, which can't be kept safe inside an extension, so a small Cluster
  sign-in helper adds it. The helper sees your sign-in tokens on their way through, never your
  mail, and keeps nothing. Your Outlook token is used only to talk to Microsoft's own servers to
  keep you signed in.
- **Sender site icons.** The dashboard shows each sender's favicon, fetched from Google's public
  favicon service (`google.com/s2/favicons`) by domain only — an uncredentialed image request,
  no cookies, no other data, one per unique sender domain. This does tell Google which sender
  domains appear in your mail; if that trade isn't worth it to you, the list still works
  without it (each sender falls back to a coloured initial). A future build may make this a
  toggle or cache the icons locally.
- **Reference-list updates.** Roughly once a day, Cluster fetches a small public data file — the
  list of domains known-legitimate brands send from, and known-bad/spam domains — from a page
  Cluster itself publishes (`samuelabhinav37.github.io`), so a fix can reach you without waiting
  for a new Chrome Web Store release. It's a plain, uncredentialed request for "today's file,"
  identical for every install — the same shape as an app checking for an update. **Nothing about
  you or your mail is in this request or its response**: no address, no sender, no subject, no
  identifier of any kind. If the fetch ever fails, or you're offline, Cluster just keeps using the
  copy already bundled in the extension — this is a convenience, never a dependency.

That's the complete list. Everything else — your settings, rules, and the log of what Cluster
has done — stays in your browser's local storage, on your device, and is deleted the moment you
uninstall the extension.

## Open source

All of this is verifiable, not just asserted. Cluster's full source is on GitHub:
[github.com/Samuelabhinav37/cluster](https://github.com/Samuelabhinav37/cluster). If you'd like
to check any claim on this page against the actual code, everything here traces back to
[`SECURITY.md`](../SECURITY.md) and the `src/` directory.
