# Cluster product plan (2026-11-18)

## What Cluster is

Cluster files every Gmail email into the right label, shows what is in the mailbox, helps clear out what isn't wanted, keeps important mail safe, makes each decision easy, and stops spam and phishing. It works inside Gmail's own labels and never reads email bodies.

## The six pillars

| Pillar | Built today | Missing | Done when |
|---|---|---|---|
| 1. Sort into labels | Gmail filters, background labelling, Screener, Personal | Accuracy on real mail (about half of 🧾 Receipts wrong over 60 days); audit bugs B1–B4 | Fewer than 5 corrections per 100 emails filed |
| 2. Analytics | Overview cards, Cleanup charts, Details | Numbers are only as true as the labels under them | You act on a number without checking it |
| 3. Unsubscribe and remove | Stop mail (Unsubscribe, Mute), Clear out, sender table | "Unwanted" comes from a separate model, not the labels | Mail cleared, almost nothing restored with Undo |
| 4. Protect important mail | Starred, people, money and job mail kept, Personal | Protection rules live in several modules | Nothing important trashed or hidden |
| 5. Easier decisions | Kai, cards, one-tap actions, Today | Advice can't be better than what's under it | Suggestions accepted more often than dismissed |
| 6. Spam and phishing | Scam hold to Spam, security scan, Possible phishing label | Filters labelled 22 scams in tests before the hold ran | 0 scams labelled, 0 real mail held |

## One engine under all six

Every pillar asks four questions about each email:

1. **What is it?** Receipt, code, newsletter, a person.
2. **How risky is it?** Safe, warn or scam.
3. **How much does the user care?** Opens, replies, ignores.
4. **Must it be protected?** People, money, jobs, starred.

Today each feature answers these on its own: `sortTaxonomy` for labels, `verdict` for risk, `kindModel` and `engagementModel` for cleanup, and the Gmail filters as a looser fifth copy. They disagree, and a fix in one place doesn't reach the others.

**Decision:** one engine writes one record per email with the four answers. Every screen reads that record.
- Analytics counts exactly what the labels show.
- A correction anywhere changes every screen.
- Every user action trains one system, not four.

The pillars move onto the engine one at a time, each with a test showing the screen is unchanged or better. This is not a rewrite.

## Build order

| Step | Work | Exit when |
|---|---|---|
| 1. Engine and accuracy | Fix audit bugs B1–B4 and the flaky tests. Filters label only near-certain mail. Score all five stages and assert accuracy floors. One record per email. Per-user learning model (on device, metadata only, used only when the rules are unsure, 90% cut) | Suite green 10/10 runs. Filter error under 2%. 0 people or scams labelled in tests |
| 2. Spam, phishing, protection | Move `verdict` and protection onto the engine | 0 scams labelled, 0 important mail moved, on test and real mail |
| 3. Labels | Labelling reads the engine | Under 5 corrections per 100 on beta mailboxes |
| 4. Unsubscribe and removal | Cleanup reads the same "unwanted" answer | Undo rate under 2% |
| 5. Analytics | Every number from the engine's records | Overview, Cleanup and labels agree to the email |
| 6. Easier decisions | Kai and cards from the engine | More accepted than dismissed |

Steps 2–6 already exist as screens; each step moves one onto the engine.

## How we measure

- **North star:** corrections per 100 emails filed. A move of an email Cluster filed is a miss. Cluster already sees moves through Gmail's change feed, so this works on real mail with no hand scoring.
- **Guardrails, must stay 0:** people's mail labelled, scams labelled, important mail trashed.
- **Growth, later:** setup finished, week-4 active, uninstalls.
- Synthetic mailboxes stay as regression tests, not as the score we steer by.

## Gates to "everyone"

1. **Google verification.** Unverified Google sign-in apps are capped at 100 users. Gmail's restricted scopes need verification and a yearly third-party security assessment. Start the paperwork during step 1. (Check Google's current terms.)
2. **Chrome closed.** Only the Gmail filters run then. They label near-certain mail only; the engine does the rest when Chrome opens. A Cluster server is out: it breaks the privacy promise.
3. **Chrome Web Store review** and a privacy policy that matches the code.

## Release path

1. **Stabilise** (step 1 above, about 2 weeks).
2. **Friends beta**, 10–20 people on real mailboxes. Correction rate kept on their device and shared only if they opt in. Exit: under 5 corrections per 100 for 4 weeks, no "where did my email go" reports.
3. **Learn per user** until the correction rate falls week on week without rule commits.
4. **Simplify setup** to 3 steps; hide what the beta didn't use (measured).
5. **Public launch** once Google verification is done.

## Weekly rhythm

- Every Monday: correction rate, guardrails, and the top 5 kinds of correction.
- Work order: a guardrail break, then the most common correction, then setup friction. A feature one person asked for waits until three ask.
- Every rule change ships with a test and must not lower the score on any test mailbox.

## Positioning

SaneBox (about $7 a month) and Superhuman (about $30) read mail on their servers. Cluster works in Gmail's own labels and never reads email bodies. The privacy story only sells once the filing is right, so accuracy comes first.

Background: `research/2026-11-18-labelling-audit.md` (bugs, numbers, competitors).
