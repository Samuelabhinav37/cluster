# Ethics and safety

These are the lines Cluster will not cross, and the rules every feature must follow. The research
and sources behind them are in
[`research/2026-10-06-founder-strategy-open-source-ethics-federated.md`](../research/2026-10-06-founder-strategy-open-source-ethics-federated.md)
§4. For what data goes where, see [Your data, in plain language](privacy.md).

## The Cluster pledge

1. Cluster is free. No ads, no data sales, no paid tier that makes free users less safe.
2. Your mail never leaves your device through Cluster unless you press a button that says exactly
   what will be sent. The one exception is a work install your organisation manages, which sends
   minimal security events to your organisation's own server. Cluster tells you when that is on.
3. Cluster holds suspected scams. It never deletes your mail on its own judgement.
4. You can always see why something was held, and undo it in one tap.
5. No one can use Cluster to watch you without you seeing it. You can switch helpers off at any time.
6. We do not train shared AI on your Gmail. Your personal model stays on your device.
7. Every build is open source and can be checked against the code.
8. We publish our mistakes: false-positive rates, incidents and fixes.
9. We treat non-English mail and small senders as fairly as big brands, and we measure it.
10. If we ever change these promises, we tell you first, and the old version stays available.

## Rules for every feature

### No dark patterns

- No guilt-trip wording on buttons (never "No, I like scams").
- Opt-ins start off. "Yes" and "No" look the same.
- A declined opt-in is asked again at most once per major version.
- Turning off scam protection and uninstalling are always one click away and never hidden.
- Warnings state facts, not fear.

### Real consent

Before anything leaves the device for the first time, show exactly what will be sent, in the user's
language. Consent needs a clear action. Closing the screen or waiting is not consent, and the message
never disappears on a timer. Withdrawing is as easy as agreeing, and it deletes anything queued.

### Hold, never hide

Scam protection is on by default because it protects people who never open the dashboard. That is
only fair because held mail stays in the owner's mailbox, is one tap from release, and is never
deleted. The account owner always sees the label, can always release mail, and can always turn
protection off without anyone else's permission.

### Helper (caregiver) mode must never become spyware

A tool that helps a family member can be misused to watch a partner. All of these are required before
helper mode ships:

1. It is set up on the account owner's own browser, with the owner present. No remote install.
2. It is always visible to the owner: "Helper mode is on. Set up by <name> on <date>." There is
   no hidden option, ever.
3. The owner can revoke it in one tap, with no password and no approval from the helper.
4. The helper never sees subjects, bodies or senders through Cluster.
5. Cluster adds no forwarding, location or read receipts.
6. Every 90 days the owner is asked privately whether they still want this helper, and "No" is an
   equal button.
7. The helper screen links to support for people experiencing abuse.
8. It is never marketed as a way to monitor a partner, spouse or adult child.

### Protect small senders from false alarms

- Mail is held only when at least two independent signals agree. A first email from someone new is
  never enough on its own.
- One user's report never puts a domain on a shared list. Lists change only through reviewed pull
  requests with evidence.
- Senders who think they were listed by mistake can appeal through a public GitHub issue template,
  and we state how fast we answer.
- Every release is checked against a public set of known-good senders before it ships.

### Measure bias

Scam word lists are English-only today, so non-English readers get less protection. Senders on free
email or new domains get flagged more often, which hurts small businesses. We add word lists per
language, never treat free email alone as a warning sign, and publish hold rates by language and
domain type from the public test set.

### Explain every verdict

Every held email shows up to three plain reasons, and the person can always override the verdict.

### Accessible to everyone

The dashboard and popup target WCAG 2.2 AA. Risk is never shown by colour alone. Copy follows plain
language guidance for people with cognitive or reading difficulties.

### Children

Cluster is not made for or marketed to children. Any future feature that sends data anywhere must
exclude users under 13.

### Data protection law

Cluster keeps your data on your device, so we never hold it. If a future feature sends anything to a
server we run (for example, a scam you choose to report), we become responsible for it under GDPR and
similar laws. That feature must strip other people's addresses, keep only what it needs, and delete
it on a fixed schedule.
