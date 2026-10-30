# Store listing copy

Canonical text for the Chrome Web Store listing. Keep the **first sentence the privacy
position**, not the feature list — Cluster's "your mail never touches our servers" claim is stronger than
any competitor's "we don't read your mail with AI" positioning, and it's the reason to choose
Cluster over the incumbents. Update this file in the same PR as any change to what Cluster reads
or transmits, and keep it in sync with [`docs/privacy.md`](privacy.md) and `SECURITY.md`.

---

## Short description (≤132 chars — CWS "summary")

> Clean up Gmail and Outlook and catch scams. Your mail never leaves your browser.

(81 chars. Plain words, one job per sentence, per docs/ui-plan-2026-10-29b.md Step 8.)

## Screenshot captions

One per store screenshot, in this order. Verb first, under eight words, no dashes.

1. **Home:** See what needs you today.
2. **Clean up:** Trash a whole sender in one click.
3. **Protect:** Catch scams that pretend to be brands.
4. **Organize:** Sort new mail with ready presets.
5. **Details:** Find any email by week, day or sender.

## Full description

Cluster cleans up, sorts, and screens your Gmail or Outlook inbox with no server standing
between you and your mail. Reading and sorting run in your browser, under your own sign-in.
Your mail never goes to a Cluster server, and by default Cluster only reads message headers,
never the body of your mail.

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
Cluster. When a sender only accepts an unsubscribe email, Cluster shows you each email (from,
to, subject, body) and sends it from your account only after you press Send. It shows in your
Sent folder. Deep scan makes one outbound check of a link you're actively reviewing. Sorting/rules
features create a filter or rule inside your own Gmail or Outlook account, the same as if you'd
made it yourself. Signing in to Gmail goes through Cluster's small sign-in helper, which adds
Cluster's Google client secret and sees only sign-in tokens, never mail. That's the
complete list — full disclosure at
[`docs/privacy.md`](https://github.com/Samuelabhinav37/cluster/blob/master/docs/privacy.md).

**Why the requested permissions**

Cluster requests only the Gmail/Outlook scopes each feature needs and nothing else (no Drive,
Calendar or Contacts access, and it sends mail only for unsubscribe emails you approve) — the full per-scope justification is in
[`docs/oauth-scope-justification.md`](https://github.com/Samuelabhinav37/cluster/blob/master/docs/oauth-scope-justification.md).

Source: https://github.com/Samuelabhinav37/cluster
