# Your data, in plain language

Cluster cleans up, sorts and protects your Gmail or Outlook inbox. This page says exactly what that
involves. For the technical detail (scopes, headers, retention), see [`SECURITY.md`](../SECURITY.md).
For the promises we hold ourselves to, see [Ethics and safety](ethics-and-safety.md).

**In five lines:**

- **Where Cluster runs:** in your browser, on your computer. There is no Cluster server.
- **What it reads:** who sent each email, its subject, date, size and a few technical headers. Not the
  message itself, except when you press "Deep scan" on one email.
- **What it sends to us:** nothing. Cluster's developer receives nothing about you or your mail.
- **What it changes:** only your own mailbox, through Gmail's or Outlook's own tools (labels, filters,
  moving mail). It never deletes mail on its own judgement.
- **What it costs:** nothing. Cluster is free and open source.

## There is no Cluster server

Cluster runs entirely inside your browser and signs in with your own Google or Microsoft account. It
talks directly to Gmail or Microsoft Graph, the same way any app you sign into does. Nothing you do
in Cluster is sent to us, because there is no Cluster server to send it to.

## It reads headers, not your mail

By default Cluster looks only at each message's **metadata**:

- who it is from, and the reply address
- the subject line
- when it arrived and how big it is
- whether it is read or starred, and its labels
- technical headers that show whether the sender is who they claim to be (for example, the results
  of Gmail's own sender checks)

It never reads the body of an email, with one narrow exception below.

## The one exception: Deep scan

If you press "Deep scan" on a flagged sender, Cluster fetches that **one** message's body. It checks
whether each link really goes where its text says, a common phishing trick. Then it throws the body
away. Deep scan never runs on its own, never runs in the background, and never stores or sends the
body anywhere.

## Scam protection

When scam protection is on, Cluster moves suspected scams out of your inbox into a Cluster label in
your own mailbox. This happens inside Gmail or Outlook. Nothing about the email leaves your device.

- Held mail is never deleted by Cluster. It stays in your mailbox under the label.
- You can see why each email was held, in plain words.
- You can release any email with one tap, or by moving it back to your inbox in Gmail.

## Learning stays on your device

Cluster gets better at spotting scams from what you do: releasing an email, or confirming a scam.
That learning stays in your browser. It is never uploaded, and it is never used to train a shared
model. Cluster does not train shared AI on your Gmail.

Cluster also keeps a short history of each sender in your browser: when they first wrote, how often,
and which domains their mail is usually signed by and asks for replies at. That is how it notices
when a familiar sender suddenly changes, a common sign of invoice fraud or a hacked account. It holds
domain names and counts, never subjects or message text, and forgets senders who haven't written in
over a year.

Three features (a plain-English summary, drafting a rule from a sentence you type, and sorting mail
Cluster can't otherwise categorise) use Chrome's **built-in, on-device** AI. It runs on your own
computer. Nothing about your mail goes to an AI company. If your computer doesn't support it, those
features don't appear and everything else works the same.

## What actually leaves your device

This is the complete list.

- **Unsubscribing.** When you press a verified one-click unsubscribe, the request goes straight to
  that sender's own unsubscribe address. It never goes to us. It uses HTTPS only, sends no login
  details and follows no redirects.
- **Deep scan's link check,** described above. One check of a link you are reviewing. It refuses
  private and internal network addresses.
- **Sorting, filters and labels.** Creating a Gmail filter or Outlook rule happens through Gmail's or
  Outlook's own API. It is your mailbox's own settings being changed, just as if you had clicked
  "Create filter" yourself.
- **Signing in.** Chrome itself holds your Gmail sign-in, not Cluster. Your Outlook sign-in is used
  only to talk to Microsoft's servers.
- **Sender icons.** The dashboard shows each sender's website icon from Google's public icon service
  (`google.com/s2/favicons`). The request carries only the sender's domain, with no cookies. It does
  tell Google which sender domains appear in your mail. If an icon can't load, the sender gets a
  coloured initial instead. A future version will make this a setting or bundle icons locally.
- **Daily list updates.** About once a day Cluster downloads a small public file from a page we
  publish (`samuelabhinav37.github.io`). It holds the domains real brands send from and known bad or
  spam domains. The request is identical for everyone and carries nothing about you. If it fails,
  Cluster uses the copy built into the extension.

Your settings, rules, personal learning and the log of what Cluster has done stay in your browser's
local storage. Uninstalling Cluster deletes them.

## Work installs managed by your organisation

This section applies only if your employer or school has set up Cluster through Chrome's managed
policies and connected it to an **Athena** server that **your organisation** runs. A normal install
never does this, and Cluster's developer never receives these events.

When it is set up, and after the connection is allowed in the dashboard, Cluster sends security
events to your organisation's own server. Each event says that Cluster warned about or held a
suspicious sender. It contains:

- the sender's email address and domain
- the kind of warning (for example, "pretends to be PayPal") and the brand involved
- for a Deep scan, the website domains of any dangerous links that were found
- when it happened, and how serious it was

Events never contain the email's subject or body, or anything about the people you write to.

Athena is still in development. This part of Cluster will change as Athena is rebuilt, and this page
will be updated first.

## Open source

You don't have to take any of this on trust. Cluster's full source is on GitHub at
[github.com/Samuelabhinav37/cluster](https://github.com/Samuelabhinav37/cluster), under the
[GPL-3.0](../LICENSE) license. Every claim on this page can be checked against
[`SECURITY.md`](../SECURITY.md) and the `src/` folder.

## If this changes

If we ever change what Cluster sends or where, we will update this page first and say so in the
release notes. Earlier versions of this page stay in the project's history on GitHub.
