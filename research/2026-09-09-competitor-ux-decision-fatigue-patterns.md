# Decision fatigue in bulk-inbox-triage UIs — how competitors and UX research solve it

_2026-09-09. Scoped research doc, not an implementation plan. Answers one question: how do
real competitor products and established UX research reduce "too many simultaneous choices"
in bulk-inbox-cleanup UIs — long sender lists, many possible per-item actions, multiple
overlapping "things you could clean up" sections? Written to be read alongside a prior UX
audit of Cluster's own dashboard (not in `research/`, supplied as context) that found five
concrete overload points in `src/dashboard/index.html` and `src/dashboard/dashboard.ts`,
listed in the synthesis section below._

Primary sources cited inline. Where a fetch only returned a partial or secondary account
(vendor page not rendering fully, a report referenced but not fetchable) it's marked
**[secondary]** or **[partial]**.

---

## 1. SaneBox — folder-based, not a review list

SaneBox's core mechanic never presents a list of senders with per-item action controls at
all. Mail is auto-routed into a small set of standing folders (`@SaneLater` for low-priority
mail, `@SaneBlackHole` for permanent block, plus user-defined training folders) by a
background classifier that reads headers only
([SaneBox: how does SaneBox work](https://www.sanebox.com/help/155-how-does-sanebox-work)).
The product's own framing is "We Monitor, Not Manage" — it explicitly does not sit between
the user and their mail server as an action surface.

The "choice" a user makes is never "pick an action from a set of 4 for this sender" — it's a
single drag gesture, applied per-message as mail is encountered in normal use, not in a
dedicated review session:
- Drag a message into `@SaneBlackHole` → that sender is permanently blocked; the folder
  auto-empties to Trash after 7 days
  ([SaneBlackHole](https://www.sanebox.com/help/235-saneblackhole-what-do-i-do-with-my-saneblackhole-folder)).
- Drag a message *out of* `@SaneLater` back to the inbox → retrains the classifier for that
  sender going forward.

Notably, SaneBox's own docs actively discourage building a review-list habit around the
mechanism: they caution that "checking these folders frequently goes against SaneBox's
purpose" — the intended UX is that you *don't* look at the low-priority folder often, because
the point is to not need to. There is no bulk "here are your 200 senders, choose an action for
each" screen anywhere in the product.

**Why this doesn't map cleanly onto Cluster.** SaneBox's decision-reduction trick is
architectural, not presentational: it removes the review list by making the system's action
(route to a folder) fully reversible-by-inaction and requiring zero explicit per-sender
decision from the user at all. Cluster's stated design is the opposite — visible, reviewable,
user-confirmed actions on the user's real inbox (see `protectionPolicy.ts`'s
"label/quarantine, never delete, always reviewable" stance, per the 08-29 review doc). Copying
SaneBox's UI would mean copying its philosophy of "decide never, let the system silently
route," which is a different product than Cluster is building. The transferable idea is
narrower: a **standing per-sender preference that a user sets once and never has to see
again**, not a review list at all — which lines up with the "correction map" work already
under way in `sortTaxonomy.ts` per the 09-01 doc, not with the sender-table redesign.

---

## 2. Clean Email — grouping + single-click-per-bundle, not per-sender-per-action

Clean Email has the closest architecture to Cluster's (a bulk mailbox scan surfaced as
sender/group lists with actions), so its screen flow is the most directly transferable
reference.

**First-run flow**, per Clean Email's own onboarding doc
([Clean Email: Your First Cleaning](https://clean.email/help/basics/getting-started)):
1. **Cleaning Suggestions** — a small number of *pre-computed groupings* ("types of messages
   you may want to clean") each carrying one suggested action (archive / trash). The user
   "quickly and easily accept or reject the suggestions with a single click" — one decision
   per suggestion group, not per message and not per sender.
2. **Unsubscriber** — every mailing list found in the mailbox, but shown as one list where bulk
   selection and a single unsubscribe action apply across many senders at once; it is not a
   per-sender row of 4 independent controls.
3. **Inbox** — mail is grouped by sender identity, and "any action you apply (like Trash or
   Mark Read) will apply to all mail within the group" — the action target is the *group*, not
   the individual message, collapsing what would be hundreds of decisions into one per sender.
4. **Smart Folders** (formerly "Smart Views") — pre-built, criteria-based folders (social,
   travel, large attachments, etc.) that the product computes automatically. Per their feature
   description, Smart Folders "use sophisticated algorithms to analyze email metadata and
   sender information, which saves you from manually categorizing messages without any setup"
   ([Clean Email features](https://clean.email/features) **[partial — page returned limited
   text on fetch]**; corroborated by the 09-01 doc's own read of Clean Email pricing/packaging).
5. **Screener** is offered last, and is opt-in.

The structural trick, stated plainly in their own docs, is **group-first, one-action-per-group,
sequenced across discrete steps** rather than one long page with every mechanism visible at
once. Each step (Suggestions → Unsubscriber → Inbox → Smart Folders → Screener) is its own
screen with its own single job; the user is never shown all five simultaneously.

**Direct relevance to Cluster:** this is the single most transferable pattern found in this
research, because Clean Email is solving the *identical* problem (a real sender/domain list
with real per-item actions) rather than avoiding it architecturally the way SaneBox does.

---

## 3. Unroll.me — collapsing many senders into one digest via a one-time three-way sort

Unroll.me's decision-reduction mechanic is a **one-time, three-way triage per sender**, after
which no further sender-level decisions recur:

> Users make a one-time choice per sender: **"Keep, Block, Rollup."**
> ([unroll.me homepage](https://unroll.me/); corroborated by
> [Unroll.me Support: What is the Rollup?](https://support.unroll.me/hc/en-us/articles/200271733-What-is-the-Rollup))

- **Keep** — stays in the inbox as normal.
- **Block** (their "Unsubscribe" bucket) — moved out of the inbox going forward.
- **Rollup** — held back from the inbox and, at one user-chosen delivery time per day, folded
  into a single composite digest email that shows all the day's rolled-up senders as
  snapshots in one message.

The decision-fatigue win is specifically that the *ongoing* triage decision — "what do I do
with this daily newsletter" — is asked **once per sender, ever**, and then converted into an
ongoing zero-decision digest. The user only makes new decisions when a sender is genuinely
new, not on every scan. The known constraint (only one Rollup and one delivery slot per
account, no per-category digests) is itself informative: it shows the design deliberately
traded flexibility for keeping the "how many things do I have to decide right now" count at
one.

**Caveat on this source:** Unroll.me is flagged elsewhere in this repo's research
(`2026-09-01-state-of-cluster-and-competitors.md` §(c)) as monetizing panel data and now
EU-blocked — the *mechanic* is worth borrowing, the company is not a model to emulate on trust.

---

## 4. Gmail's own bulk/one-tap features

Two separate, both-shipped Google mechanisms are relevant, and they solve different halves of
the problem.

**Manage subscriptions** (rolled out July 2025) collapses the "which senders do I even have
subscriptions to" discovery problem into one list, sorted by volume, with exactly **one**
action per row:

> "You can now view and manage subscription emails in one place and unsubscribe with one
> click ... sorted by the most frequent senders alongside the number of emails they've sent
> you."
> ([Google Workspace Updates blog, Jul 2025](https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html))

Notably, Google chose **not** to add Keep-sorted/Mute/Snooze/Archive options per row — the
list has exactly one possible action (unsubscribe) per sender, which is also its acknowledged
limitation (one unsubscribe click required per sender, no bulk-select across many senders at
once, per the same rollout coverage). The lesson here cuts both ways: fewer choices per row is
easier to scan, but Gmail's version is criticized in the trade coverage precisely for not
supporting bulk multi-select — i.e., collapsing per-row choice count to 1 is good, but it
doesn't by itself solve *volume*.

**Category tabs / bundling** (Primary/Social/Promotions/Updates/Forums) solves the "many
overlapping cleanup sections" problem differently: instead of asking the user to review each
sender, Gmail pre-sorts all mail into five *always-on, automatically maintained* buckets, and
within Promotions, further **bundles multiple messages from the same sender/category into one
visual card**
([support.google.com: Organize your emails into categories](https://support.google.com/mail/answer/3094499)).
The user never explicitly reviews or confirms this sort — it's a default state they can turn
off, not a list they work through. This is the same "smart default, only intervene if you
want to change it" shape as SaneBox's folders, just server-side and built into a full inbox
rather than a third-party layer.

---

## 5. Superhuman — one email, one decision, keyboard-driven

Superhuman's stated design philosophy is explicitly sequential, single-item processing rather
than a multi-column list of many senders/options:

> "Every email has exactly one outcome, and you process it once." Triage collapses to one
> question per message — "is this message for today, for another day, or is it done?" —
> answered via keyboard shortcuts (e.g., `E` mark done, `H` set reminder, `Ctrl+U` unsubscribe)
> rather than a form of checkboxes.
> ([Superhuman blog: What is email triage and what does it do?](https://blog.superhuman.com/email-triage/),
> [Superhuman shortcuts](https://superhuman.com/products/mail/shortcuts))

The stated reasoning ties directly to decision fatigue: the flow is designed to avoid
"analysis paralysis during email management (staring at an email and wondering what to do with
it)" by narrowing every decision to a fixed, small action set applied to a single item in
focus, and by removing visible backlog/clutter from view entirely (their inbox-zero framing —
"maintaining an empty inbox ... reduces cognitive overload"). The command palette (`Cmd/Ctrl+K`)
is the single entry point for every other action, meaning the *default* view never shows more
than the current item and a small fixed action set; everything else is one keystroke away
rather than always-visible chrome.

**Relevance and limits for Cluster:** Superhuman's model works because it's a full email
*client* redesigning the primary reading surface — every message passes through this flow
naturally. Cluster is a bulk-cleanup layer bolted onto the user's existing client, working in
batches of potentially hundreds of already-existing senders, not a stream of new mail arriving
one at a time. The transferable piece isn't "swipe through your whole inbox one message at a
time" (that doesn't fit a one-time backlog-of-hundreds cleanup job) — it's the narrower
pattern of **one focused decision, one fixed small action set, next item only after this one
resolves**, which maps onto *how a single sender row or single review queue is presented*,
not onto restructuring Cluster into a full client.

---

## 6. General UX research on choice overload in list-heavy review UIs

All from Nielsen Norman Group unless noted.

**Progressive disclosure** — the core applicable principle for "10 sections all expanded at
once":
> "Initially, show users only a few of the most important options... offer a larger set of
> specialized options upon request." The guidance requires knowing real feature frequency:
> "You have to disclose everything that users frequently need up front, so that they have to
> progress to the secondary display only on rare occasions."
> ([NN/g: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/))

NN/g also warns against over-nesting: more than two disclosure levels "typically have low
usability" — i.e., the fix is "collapse the rare stuff behind one toggle," not "build a deep
settings tree."

**Minimizing cognitive load** — directly addresses "many independent, equal-weight controls
repeated per row":
> Designers should "reduce visual clutter" (eliminate redundant controls that don't add
> value), lean on "familiar patterns" users already hold, and "offload cognitive tasks ...
> through ... pre-filled information, or 'smart default' settings" rather than asking the user
> to decide from scratch each time.
> ([NN/g: Minimize Cognitive Load](https://www.nngroup.com/articles/minimize-cognitive-load/))

**Hick's Law** — the direct mechanism behind "long list = slow, tiring decisions":
> "The more choices you present to your users, the longer it takes them to reach a decision...
> combining Hick's Law with other design techniques can make long menus easy to use" (grouping,
> categorization, progressive revelation).
> ([NN/g: Hick's Law: Designing Long Menu Lists](https://www.nngroup.com/videos/hicks-law-long-menus/))

**Choice overload** — the specific failure mode of showing every option at once:
> Too many simultaneous offerings "make it harder for users to make decisions due to analysis
> paralysis," or push users into a hasty choice they later regret.
> ([NN/g: Choice Overload Impedes User Decision-Making](https://www.nngroup.com/videos/choice-overload/))
NN/g has a fuller report specifically titled *"Helping Users Make Decisions: Reduce Choice
Overload and Avoid Overwhelming Users"*, referenced from their "Explicit Differences" article
([NN/g: Explicitly State the Difference Between Options](https://www.nngroup.com/articles/explicit-differences/))
but the report's own body text wasn't retrievable via automated fetch — **[secondary/partial]**,
flagged rather than quoted from.

**Defaults** — the mechanism that lets a system reduce a list to "confirm or change," instead
of "choose from scratch":
> People "tend to stick to the defaults." A well-chosen default converts an N-way decision
> into a binary accept/override, which is the same shape as Clean Email's Cleaning Suggestions
> (§2) and Gmail's category tabs (§4).
> ([NN/g: Defaults & Default Sets](https://www.nngroup.com/videos/the-danger-of-defaults/))

Put together, the literature converges on four concrete, combinable techniques for a
list-heavy review UI: (a) progressive disclosure — show the common case, hide the rare one
behind an explicit toggle; (b) chunk/group so the visible unit count shrinks (Hick's Law); (c)
lead with one smart-default recommended action per group and let the user override rather than
choose from a full menu every time (Defaults); (d) reduce simultaneous on-screen choices by
sequencing screens/steps rather than flattening everything onto one page (Cognitive Load,
Choice Overload).

---

## Synthesis — mapping back to Cluster's 5 problem points

### 1. "Clean up" tab stacks ~10 sections, all fully expanded at once
(`src/dashboard/index.html:86-234`)

**Most applicable pattern: progressive disclosure (§6) + Clean Email's sequenced-steps flow
(§2).** NN/g's guidance is explicit that the fix for "many sections visible at once" is not a
denser layout but hiding the rare/secondary sections behind an explicit toggle, disclosing
only what's frequently needed by default. Clean Email demonstrates this concretely for the
*same domain*: Suggestions, Unsubscriber, Inbox-by-sender, Smart Folders, and Screener are
five separate steps/screens, never one page. Applied to Cluster: collapse Digest, Keep-newest,
Never-read, Suggested-spam, and Ready-to-clean into one "Suggestions" surface with one
suggested action each (borrowing the Clean Email pattern directly), and leave the sender table
as its own step reached only after or beside that summary — not stacked below it in one scroll.
Gmail's category tabs (§4) reinforce the same idea from a different angle: pre-computed
groupings that are *on by default and require no review* are a legitimate alternative to a
"section" at all.

### 2. Every sender row carries 4 equal-weight controls (Unsubscribe/Keep-sorted/Mute/Snooze)
(`src/dashboard/dashboard.ts:665-706`)

**Most applicable pattern: single-recommended-action-per-item, secondary actions behind
disclosure (§6 progressive disclosure + Hick's Law) — directly modeled on Clean Email's
group-level single action (§2) and Superhuman's fixed-small-action-set-per-item (§5).** None
of the four researched competitors show 4 always-visible, equal-weight buttons per row. Clean
Email's Cleaning Suggestions and Auto Clean each carry **one** suggested action per group, with
override available but not four parallel buttons. Superhuman narrows every message to a small
number of *keyboard* actions rather than four persistent on-screen controls. The transferable
fix: compute and show one recommended action per sender row (e.g., derived from
`engagementModel`/`unsubscribeOutcome` data Cluster already has, per the 09-01 doc's exec #3),
with the other three actions collapsed behind a menu/expand rather than rendered as four
buttons times N rows.

### 3. Rules tab: 14-field manual form fully visible by default, above a working NL drafter
(`src/dashboard/index.html:314-362`)

**Most applicable pattern: progressive disclosure (§6), textbook case.** This is the single
cleanest match in the whole audit — NN/g's core prescription ("disclose what's frequently
needed up front... progress to the secondary display only on rare occasions") applies almost
without translation: the NL drafter is the frequently-needed path (it already produces the
same rule schema per the 09-01 doc's read of `aiRuleDraft.ts`), the 14-field manual form is the
rare/power-user path, and it should be collapsed behind an explicit "advanced / manual rule"
toggle rather than shown by default beneath the drafter.

### 4. Four independent sections each run their own review→select→confirm flow for the same
kind of decision (Suggested spam, Never-read, Ready-to-clean, Sort-my-inbox's OTP-auto-expire)

**Most applicable pattern: Clean Email's Cleaning-Suggestions-as-one-grouped-step (§2), plus
NN/g's chunking/Hick's-Law logic (§6) that the fix for "many similar small decisions" is to
merge them into fewer, larger units, not present them as separate flows.** These four are
functionally the same UI pattern (review a list → select → confirm) repeated four times
instead of built once and reused. Clean Email's actual architecture is the concrete precedent:
one "Suggestions" surface aggregates disparate suggestion sources (age-based, engagement-based,
type-based) into a single reviewable list with one shared review→confirm interaction, rather
than one bespoke flow per source. Superhuman's "one fixed action set, applied consistently" is
the same idea at the single-item level. **SaneBox does not apply here** — its answer to
"repeated review flows" is to have no review flow at all (§1), which isn't compatible with
Cluster's reviewable-by-design stance; the actionable takeaway is specifically Clean Email's
version, not SaneBox's.

### 5. Scan configuration shown before any results (window/max-messages/Rescan/Settings)
(`src/dashboard/index.html:39-66`)

**Most applicable pattern: smart defaults (§6 Defaults) + Gmail's always-on background
categorization (§4).** None of the researched competitors ask the user to configure a scan
before showing anything — SaneBox and Gmail both categorize continuously in the background
with zero user-visible setup step; Clean Email's first-run flow (§2) goes straight to Cleaning
Suggestions with default parameters, and configuration (if any) is reachable from within
results, not gating them. The transferable fix: run the scan with a sensible default
window/max-messages immediately, show results first, and move the configuration controls to a
settings affordance reachable from the results view — the same "default + change-if-you-want"
shape NN/g's Defaults research describes, rather than a mandatory pre-results form.

### Patterns researched but explicitly not forced onto Cluster
- **SaneBox's fully automated, no-review-list folder model (§1)** doesn't map onto problems
  1-4 despite being literally "how to avoid a sender list with per-item actions" — because
  Cluster's architecture is deliberately manual/reviewable (per `protectionPolicy.ts`'s
  label-quarantine-never-delete-always-reviewable design), and SaneBox's mechanism only works
  by removing the review step and the user's explicit decision entirely. The one narrow piece
  worth reusing from SaneBox is a **standing per-sender preference set once, consulted
  silently thereafter** — which is a data/state pattern (the correction map already scoped in
  `sortTaxonomy.ts`), not a UI-layout pattern, so it doesn't resolve any of the 5 layout/choice
  problems directly.
- **Superhuman's full-client one-message-at-a-time stream (§5)** doesn't map onto a bulk
  backlog-of-hundreds cleanup pass the way it maps onto live incoming mail; only its
  "fixed-small-action-set per item" sub-pattern is transferable (used above for problem 2).

---

## Sources

- [SaneBox: How does SaneBox work?](https://www.sanebox.com/help/155-how-does-sanebox-work)
- [SaneBox: SaneBlackHole](https://www.sanebox.com/help/235-saneblackhole-what-do-i-do-with-my-saneblackhole-folder)
- [Clean Email: Your First Cleaning](https://clean.email/help/basics/getting-started)
- [Clean Email: Features](https://clean.email/features) **[partial fetch]**
- [Unroll.me homepage](https://unroll.me/)
- [Unroll.me Support: What is the Rollup?](https://support.unroll.me/hc/en-us/articles/200271733-What-is-the-Rollup)
- [Google Workspace Updates: Manage email subscriptions from a single location in Gmail (Jul 2025)](https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html)
- [Google: Organize your emails into categories](https://support.google.com/mail/answer/3094499)
- [Superhuman blog: What is email triage and what does it do?](https://blog.superhuman.com/email-triage/)
- [Superhuman: Keyboard Shortcuts](https://superhuman.com/products/mail/shortcuts)
- [NN/g: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
- [NN/g: Minimize Cognitive Load](https://www.nngroup.com/articles/minimize-cognitive-load/)
- [NN/g: Hick's Law — Designing Long Menu Lists](https://www.nngroup.com/videos/hicks-law-long-menus/)
- [NN/g: Choice Overload Impedes User Decision-Making](https://www.nngroup.com/videos/choice-overload/)
- [NN/g: Explicitly State the Difference Between Options](https://www.nngroup.com/articles/explicit-differences/) **[report referenced but body not retrievable — secondary]**
- [NN/g: Defaults & Default Sets](https://www.nngroup.com/videos/the-danger-of-defaults/)

Cross-referenced against this repo's own prior research for Cluster's current architecture and
constraints (not re-derived, only cited for context): `research/2026-08-29-competitive-and-security-review.md`,
`research/2026-09-01-state-of-cluster-and-competitors.md`.
