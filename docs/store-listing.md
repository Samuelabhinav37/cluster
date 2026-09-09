# Store listing copy

Canonical text for the Chrome Web Store listing. Keep the **first sentence the privacy
position**, not the feature list — Cluster's "there is no server at all" claim is stronger than
any competitor's "we don't read your mail with AI" positioning, and it's the reason to choose
Cluster over the incumbents. Update this file in the same PR as any change to what Cluster reads
or transmits, and keep it in sync with [`docs/privacy.md`](privacy.md) and `SECURITY.md`.

---

## Short description (≤132 chars — CWS "summary")

> Sort, declutter, and secure your Gmail/Outlook inbox — no server, metadata-only, on-device AI, open source.

(109 chars.)

## Full description

Cluster cleans up, sorts, and screens your Gmail or Outlook inbox with no server standing
between you and your mail. Everything runs in your browser, under your own sign-in — there's
no Cluster-operated backend to send anything to, and by default it only ever reads message
headers, never the body of your mail.

**What it does**

- **Sort my inbox** — one preview-then-confirm pass that files mail into flat categories
  (Shopping, Newsletters, One-time codes, …) by what it is or who it's from, with a standing
  Gmail filter or Outlook rule to keep new mail sorted automatically.
- **Subscriptions** — tracks newsletter senders with a verified one-click unsubscribe, and
  separately flags paid subscriptions and free trials from their billing emails so nothing
  auto-renews without you noticing.
- **Security** — plain-language phishing signals (lookalike domains, failed sender
  authentication, brand impersonation, risky attachment types) read entirely from headers, with
  an opt-in review queue for anything automatically quarantined and an optional, strictly
  manual, one-message "Deep scan" for a deeper link check.
- **Rules and Screener** — standing cleanup rules with a dry-run preview, and an opt-in Screener
  that holds mail from senders you've never emailed until you allow or block them.
- **Gmail and Outlook**, with feature parity across sorting, subscriptions, rules, Screener, and
  quarantine review; a couple of Gmail-only features (snooze, Deep scan) are noted in the app.
- **Optional on-device AI** (Chrome's built-in Gemini Nano, not a server) for a plain-English
  inbox digest, drafting a rule from a typed sentence, and classifying mail the regular sorting
  logic can't otherwise place. Quietly absent on hardware that doesn't support it — nothing else
  depends on it.

**What leaves your device**

Verified unsubscribe requests go straight to the sender's own unsubscribe link, never to
Cluster. Deep scan makes one outbound check of a link you're actively reviewing. Sorting/rules
features create a filter or rule inside your own Gmail or Outlook account, the same as if you'd
made it yourself. Signing in talks only to Google's or Microsoft's own servers. That's the
complete list — full disclosure at
[`docs/privacy.md`](https://github.com/Samuelabhinav37/cluster/blob/master/docs/privacy.md).

**Why the requested permissions**

Cluster requests only the Gmail/Outlook scopes each feature needs and nothing else (no Drive,
Calendar, Contacts, or send/compose access) — the full per-scope justification is in
[`docs/oauth-scope-justification.md`](https://github.com/Samuelabhinav37/cluster/blob/master/docs/oauth-scope-justification.md).

Source: https://github.com/Samuelabhinav37/cluster
