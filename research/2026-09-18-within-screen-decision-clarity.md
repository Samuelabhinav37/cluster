# Within-screen decision clarity — what a single row/card needs to say

_2026-09-18. Scoped research doc, not a redesign. Answers a narrower question than the two
prior UX docs in this folder. `2026-09-09-competitor-ux-decision-fatigue-patterns.md` covers
screen/navigation-level overload (how many sections, how many steps). `2026-09-18-dashboard-visual-design.md`
covers visual weight (glass, color, spacing tokens). This doc is about the third gap the repo
owner surfaced after actually using the redesigned dashboard: even on a single screen, looking
at one sender row / cleanup-plan row / overview stat doesn't yet let them decide in a few
seconds — "they are not written and organized correctly," "overview is not giving overview
properly," "delete is not showing what messages I can delete properly and easily." This is
about what one decision unit contains: field count, microcopy, and disclosure order — grounded
in `src/dashboard/dashboard.ts` and `src/dashboard/index.html` as they exist today, read
directly for this doc._

---

## 1. NN/g — scanning behavior sets the budget for what a row can say

**People scan, they don't read, and most of the page gets skipped.** NN/g's original F-pattern
eyetracking study (232 users, since re-validated) found reading concentrates in a horizontal
sweep across the top, a shorter sweep further down, then a vertical scan down the left edge —
users "won't read your text thoroughly in a word-by-word manner"
([NN/g: F-Shaped Pattern For Reading Web Content](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content-discovered/)).
The **layer-cake pattern** — fixating on headings/labels with only occasional dips into body
text — is, per NN/g, "by far the most effective way to scan pages" short of reading everything
([NN/g: Text Scanning Patterns: Eyetracking Evidence](https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/)).
The direct implication for a row: **the label/title is what gets read; the sub-line is only
partially read**, so a sub-line that packs two or three clauses is effectively a bet that the
user will read past the first fragment — often a bad bet.

**Conciseness has a measured effect, not just an aesthetic one.** NN/g's classic study comparing
promotional, concise, and scannable copy treatments of the same content found concise copy cut
word count roughly in half and alone produced a 58% usability improvement; scannable formatting
(short chunks, front-loaded keywords) added another 47%; objective, non-promotional wording
added 27%; combined, 124%
([NN/g: Concise, Scannable, and Objective: How to Write for the Web](https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/)).
Directly relevant to Cluster's suggestion copy: the same research quotes a user's complaint about
inflated language — "I want to hear fact, not platitudes" — which is the right bar for a "why
this is suggested" line: state the fact, not a justification.

---

## 2. NN/g — recognition over recall, and why address/count clutter doesn't help

Nielsen's "recognition rather than recall" heuristic: interfaces should let users recognize
correct information rather than forcing them to hold it in working memory, because "recognition
is easier than recall... all those cues spread activation to related information in memory... and
make you more likely to pick it right"
([NN/g: Memory Recognition and Recall in User Interfaces](https://www.nngroup.com/articles/recognition-and-recall/)).
This cuts against Cluster's current rows in a specific way: a row like `buildAllSendersRow` in
`src/dashboard/dashboard.ts:1791-1848` shows the sender's raw email address alongside the
display name ("`3 of 12 unread · address@domain.com`") — the address is exactly the kind of raw
identifier recognition-over-recall argues against surfacing by default, since the display name
plus favicon is already the recognizable cue; the address adds a second, less scannable fact
users have to actively read and reconcile rather than just recognize at a glance.

---

## 3. NN/g — microcopy sizing and the "why suggested" line

NN/g's framework splits UX copy into three sizes — long-form, short-form, and **microcopy**
(functional text under ~3 sentences: labels, errors, one-line explanations) — with the guidance
to match the size to the moment rather than defaulting to more text
([NN/g: The 3 Sizes of UX Copy](https://www.nngroup.com/videos/the-3-sizes-of-ux-copy/)). A
per-item "why this is suggested" reason belongs squarely in microcopy: one clause, not a
sentence with a subordinate clause.

**Real products' actual reason-line wording**, checked directly rather than by philosophy:

- **Gmail's Manage Subscriptions** page (rolled out July 2025) shows exactly three pieces of
  information per row plus one action, confirmed against Google's own support doc and rollout
  coverage: sender name, a rough recent-volume count ("the number of emails sent recently from
  the sender" — Gmail defines "recently" as the last 3 weeks), and an **Unsubscribe** button —
  no unread count, no last-message date, no category label
  ([Google: Manage your subscriptions in Gmail](https://support.google.com/mail/answer/15621070),
  [Google Workspace Updates blog, Jul 2025](https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html)).
  The row is sorted by that one count, so the count itself carries the "why this is near the
  top" reasoning — no separate reason sentence is needed at all.
- **"Because you..." explainability pattern** — Netflix's recommendation rows historically used
  "Because you watched X" as a one-clause causal tag; NN/g-adjacent UX-writing commentary notes
  Netflix has since moved toward slightly more abstracted framing ("Top picks for you, based on
  your viewing history") but the shape is unchanged: **one clause, one cause, no elaboration**.
  The pattern generalizes as "because you did the referenced thing, and that's specifically why
  you're seeing this" — a template that reads in under a second because it names one concrete,
  checkable fact rather than a synthesized judgment.
- **Clean Email's Cleaning Suggestions** are described in Clean Email's own onboarding docs only
  at the philosophy level — "suggestions for types of messages you may want to clean... single
  click to accept or reject" — the exact per-card copy wasn't retrievable from public docs on
  this pass **[secondary/partial]**; the transferable fact (already established in the 09-09
  doc) is the one-action-per-suggestion shape, not exact wording.

**Applied template:** `<one concrete, checkable fact> · <the one action available>`. Not
`<fact> · <fact> · <fact>`. Cluster's own `decisionReason` (`dashboard.ts:1354-1363`) is close to
this already for the *sender-level* Organize row — `"3 unread of 12"` plus **at most one**
appended clause (`"· verified one-click unsubscribe"` or `"· new since Cluster started
tracking"`) — but the *group-level* Delete rows in `buildCleanupPlanRow`
(`dashboard.ts:1282-1339`) stack two or three clauses in one sub-line, e.g. `"45 messages, none
opened recently · muting files them out without deleting"` (`dashboard.ts:1229`) or `"12 stale,
3 codes · judged by age alone"` (`dashboard.ts:1245`) — each of these is a fact clause *plus* an
explanation clause *plus*, in the expiry row's case, a caveat clause, three things asked to be
read in what the layer-cake pattern (§1) says will get, at most, a glance.

---

## 4. NN/g — what makes a dashboard/summary screen work vs. a stat grid

NN/g has a dedicated article on this exact distinction. A dashboard is defined as "a collection
of data visualizations... presented in a single-page view that imparts at-a-glance information
on which users can act quickly," and the operative constraint is that it must deliver
"information that can be consumed fast, with a minimum of interaction or cognitive processing" —
relying on **preattentive processing** (perception that happens before conscious attention)
([NN/g: Dashboards: Making Charts and Graphs Easier to Understand](https://www.nngroup.com/articles/dashboards-preattentive/)).
The article's specific, checkable claim: humans are good at preattentively judging **length and
2D position** (bar charts, line/sparkline trends) but bad at judging **area and angle** (pie
charts, gauges, radial dials) — so a "5-second read" dashboard should lean on the former and
avoid the latter, not just "fewer numbers."

NN/g's complex-application guidelines add the disclosure mechanism that keeps a summary screen
from becoming a stat grid: **Guideline 7 — "Ease Transition Between Primary and Secondary
Information"** ("allow users to access and view supplemental information without leaving the
primary screen... hover over visualizations [to] reveal more precise detail... without requiring
users to navigate away") and **Guideline 6 — "Reduce Clutter Without Reducing Capability"**
(staged disclosure: show options "only when they are relevant to the task at hand")
([NN/g: 8 Design Guidelines for Complex Applications](https://www.nngroup.com/articles/complex-application-design/)).
Put together: a good summary screen shows a small number of length/position-based facts up
front, and defers everything that requires calculation or comparison to an on-demand layer.

**Real products' actual home/summary screens**, checked directly:

- **Stripe's Dashboard home** shows exactly five numbers — gross volume, net volume, new
  customers, successful payments, one date-range comparison — each with a small sparkline below
  it and the current period set directly against the prior period in smaller text next to the
  headline number, so the "is this good or bad" judgment is answered on the screen itself rather
  than left for the user to compute; color is reserved strictly for payment status (green
  succeeded / red failed / yellow pending), never used decoratively
  ([Stripe Dashboard design breakdown](https://www.925studios.co/blog/stripe-dashboard-design-breakdown)).
  Stripe's own support docs caveat that these are *estimates* for a fast read, with exact figures
  left to a separate reports view — an explicit fast-vs-precise split, not one screen trying to
  be both.
- **Linear's "My Issues"** view answers "what's going on for me" not with counts, but with
  *pre-sorted, pre-grouped work*: issues are bucketed into a fixed focus order — urgent, SLA-bound,
  blockers, active cycle work, other active work, triage, backlog, completed — so the ranking
  itself is the summary; a separate "overview sidebar" (opened on demand, not shown by default)
  carries the supplemental counts and filters
  ([Linear Docs: My issues](https://linear.app/docs/my-issues)). The headline answer to "what's
  going on" is a ranked worklist, not a number grid at all.

**Applied to Cluster's Overview.** `renderOverview` (`dashboard.ts:660-`) currently opens with a
"Ready when you are" card whose headline is a raw count (`planTotal.toLocaleString()`, a message
count summed across three unrelated categories) captioned `"messages across N groups"`
(`dashboard.ts:704-711`), next to an "Inbox health" score (`dashboard.ts:759-821`) that is a
second, unrelated 0-100 number with its own trend sparkline. These are two independent stat
tiles, not a mental model — the user has to independently interpret "47 messages across 3
groups" and "health: 62, up 4" and mentally combine them. Per Stripe's pattern (comparison stated
inline, not left to the reader) and Linear's pattern (a ranked worklist standing in for a number),
Overview's headline should read closer to a ranked, causally-labeled worklist ("newsletters you
never open: 12 · one-time codes gone stale: 8 · flagged for review: 1") than a bare total, with
the inbox-health score demoted to secondary/trend context rather than a second co-equal hero
number.

---

## 5. Progressive disclosure at the single-item level — Cluster's current rows, field by field

This is distinct from the screen-level progressive disclosure already covered in the 09-09 doc
(which section is expanded). Here the question is: within one visible row, how many *simultaneous
fields* does the user have to read before acting?

Three different row builders in `dashboard.ts` currently show three different field counts for
what is functionally the same decision ("does this sender/group need action, and which"):

- **`buildCleanupPlanRow`** (`dashboard.ts:1282-1339`, the "Your cleanup plan" group rows) — lead
  favicon stack, title, **one** sub-line (though see §3, that sub-line often packs 2-3 clauses),
  one primary button, one optional "Review" button, one optional badge. This is the *closest* of
  the three to a clean single-recommended-action row.
- **`buildSenderRow`**/`decisionReason` (Organize screen, `dashboard.ts:1571-1577`) — lead
  favicon, title, one sub-line (fact + at most one clause), one primary action, one ellipsis
  menu (secondary actions deferred — correct per §4's disclosure guideline), one expandable
  disclosure. Reasonably tight.
- **`buildAllSendersRow`** (the "By domain" list feeding `domain-group-list`,
  `dashboard.ts:1791-1848`) — lead favicon, title (display name), sub-line combining **two**
  facts (unread fraction *and* raw email address), a separate `meta` element rendering **a third
  and fourth fact** (`"N msg"` text plus a visual unread-ratio bar), and one action button. That
  is five visually distinct things — icon, name, unread-fraction-plus-address text, a message
  count, a colored bar — competing for attention in a single row, for what should be a single
  yes/no decision ("delete this sender's mail or not"). This row shape is the most concrete match
  for the "delete is not showing what messages I can delete properly and easily" complaint: nothing
  here is wrong information, but nothing marks which one fact should drive the decision, so the
  user has to read and mentally weigh all five before acting, which is exactly the failure mode
  NN/g's cognitive-load and recognition-over-recall guidance (§§1-2) warns against.

The NN/g complex-application guidance (§4, Guideline 7) is directly applicable here: the
secondary facts (raw address, exact message count, unread ratio bar) are legitimate
*supporting* evidence for someone who wants to double-check, but they don't need to be
always-rendered inline — they belong on hover/expand, not baked into the row's default paint.

---

## 6. Secondary question — Google's S2 favicon service and small-icon quality

**The hypothesis is correct.** Google's `s2/favicons` endpoint (`FAVICON_HOST` in
`src/lib/senderLogos.ts:145`, requested at `sz=128` via `faviconUrl()`,
`senderLogos.ts:149-153`) does not guarantee a genuinely 128px-source icon — it serves whatever
resolution it has cached for that domain and upscales to fill the requested size. This is
documented as a known, recurring issue across multiple independent projects using the same
endpoint or the same class of favicon service, not a one-off report:

- A Dashy (self-hosted dashboard) bug report is titled plainly **"Favicons fetched through
  Google's API are blurry / low resolution"**
  ([Lissy93/dashy#46](https://github.com/Lissy93/dashy/issues/46)) — filed specifically against
  this failure mode.
- A concrete, numbers-bearing case: a competition-logo directory pulling from a favicon service
  found "70 of 100 logos are favicon-sized" (40 at 32×32, 19 at 16×16, 11 at 48×48) despite
  being displayed far larger, described in the issue as images "pulled from a favicon
  service... rather than each organizer's actual logo mark," stretched "roughly 10-20x past
  native resolution"; the fix was sourcing real ≥128px logos directly from each site, not
  requesting a larger size from the favicon service
  ([StudentSuite/StudyMap#226](https://github.com/StudentSuite/StudyMap/issues/226)). This
  confirms the mechanism: **requesting a larger `sz` does not create resolution the source
  domain never had** — for a small/niche sender (a newsletter, a SaaS tool) whose actual favicon
  is a 16×16 or 32×32 `.ico`, Google's service has nothing better to return regardless of what
  size is requested, and silently upscales.
- General favicon-quality guidance corroborates the mechanism from the documentation side: "If
  the requested size isn't available, Google returns the closest available size... not all sizes
  may be available for every domain," and the service "will upscale smaller images to meet the
  requested size, resulting in the blurry appearance" (multiple independent write-ups of the
  same public endpoint's documented behavior).

**One implementation-relevant nuance for Cluster specifically:** `senderTile.ts:54-58`'s
fallback-to-monogram only fires on the image element's `error` event (network failure, 404,
ad-blocker). A blurry-but-technically-valid upscaled image **loads successfully** — it never
fires `error` — so Cluster's existing graceful-degradation path does not and cannot catch this
failure mode; a niche sender's tile will silently render pixelated rather than falling back to
the (already-built, already-correct) colored monogram.

**Do real comparable products lean on tiny real favicons, or default to initials?** The
pattern found is a default-to-initials-with-optional-real-image approach, not real-favicons as
the primary path at small sizes: both Google's own avatar system (Contacts/Gmail default
avatars) and Apple Mail/Contacts render a colored circle with a one- or two-letter initial as
the *default*, only overriding with a real photo/logo when one is confidently available at
adequate resolution — i.e., the two companies most exposed to this exact small-icon problem
default to the monogram, not the scraped icon. Cluster's `senderTile.ts` already builds this
correctly as a *fallback*; per the finding above, the gap is that it's not reliably triggered —
the monogram is the right default mechanism, but the trigger condition (image `error` only)
under-fires for this specific failure mode.

---

## Synthesis — concrete guidance for Cluster's actual rows

**(a) Minimal field set for a Delete-screen decision row.** Collapse `buildAllSendersRow`
(`dashboard.ts:1791-1848`) from its current five simultaneous facts (favicon, name, unread
fraction, raw address, message count, ratio bar) to three: **favicon + name** (recognition
cue, §2), **one fact line** in the `decisionReason` template already used elsewhere
(`"<N> unread of <M>"` — drop the appended email address, which duplicates the recognizable
name/favicon per §2), and **one action button**. Move the raw address, exact message count, and
the visual unread-ratio bar into a hover title / expand-on-click detail — they're legitimate
double-check evidence (§5), not decision inputs. This also makes `buildAllSendersRow` consistent
with the already-tighter `buildSenderRow`/`decisionReason` shape used on Organize, rather than
having three different row densities across the app for the same underlying decision.

**(b) Microcopy template for "why this is suggested."** `<one concrete, checkable fact> · <the
one available action>` — modeled on Gmail's subscriptions row (fact = recent volume, action =
Unsubscribe, §3) and the "because you did X" pattern (§3). Concretely, tighten
`buildCleanupPlanRow`'s sub-lines (`dashboard.ts:1229, 1245, 1258`) to one fact clause each,
dropping the appended explanation/caveat clause from the visible line — e.g. `"45 messages, none
opened recently"` stands alone; `"muting files them out without deleting"` becomes a tooltip on
the "Mute all" button itself (where NN/g's Guideline 2 tooltip pattern, §4, says it belongs —
attached to the action it explains, read only if the user pauses on it) rather than prose
everyone has to read past.

**(c) What Overview should show for a real 5-second read.** Today `renderOverview`
(`dashboard.ts:660-`) leads with two independent, uncombined stat tiles — a summed message count
across three unrelated categories, and a separate 0-100 health score (§4) — that the user must
individually parse and mentally connect. Replace the "Ready when you are" hero number with a
short ranked worklist in the Linear "My Issues" shape (§4): 2-4 lines, each one cause and one
count (`"12 newsletters you never open"`, `"8 one-time codes gone stale"`, `"1 flagged for your
review"`), sorted by what's most worth acting on — the ranking itself carries the "what's going
on" answer, the way Gmail's subscriptions sort *is* its own explanation (§3) and Linear's focus
order *is* its own summary. Keep "Inbox health" as a secondary trend indicator (it already has a
12-week sparkline, which is the right length/position-based shape per §4) rather than a second
co-equal headline number competing with the worklist for the same 5 seconds.

**(d) Should the current always-visible-fields approach move to layered detail, and how.** Yes,
specifically for `buildAllSendersRow`'s address/count/bar cluster (§5) — not for
`buildCleanupPlanRow` or `buildSenderRow`, which are already close to one-fact-plus-action and
mainly need the sub-line trim in (b). Mechanically: keep the tight 3-field row as the default
paint; put the address as the tile/name's `title` attribute (native browser tooltip, zero
additional code); put the exact count and unread ratio behind the existing ellipsis-menu/expand
pattern `buildSenderRow` already has (`dashboard.ts:1571-1577`), rather than inventing a new
disclosure mechanism — this is exactly NN/g's Guideline 7 shape (§4): supplemental detail
reachable without leaving the row, not deleted, just not competing with the one fact that
actually drives the decision.

**Favicon verdict:** confirmed — Google's `s2/favicons` service does not manufacture resolution
a small/niche sender's site never had, it upscales whatever low-res icon is cached, and this is
a recurring, independently-documented failure mode (§6), not a Cluster-specific bug. Cluster's
existing colored-monogram fallback in `senderTile.ts`/`senderLogos.ts` is the industry-standard
answer (Google's and Apple's own avatar systems default the same way), but its trigger is too
narrow — it only fires on a network/load `error`, which a successfully-loaded-but-blurry
upscaled image never raises. No source or CSS change is prescribed here (out of scope for this
research pass), but the concrete gap worth flagging for implementation: the fallback needs a
"did this actually resolve, or did the service just hand back its smallest cached size" signal
beyond `onerror`, or Cluster should simply favor the monogram by default for tile sizes at or
below the smallest size class it uses (`sz-26`), where a genuinely crisp scraped favicon is least
likely regardless.

---

## Sources

- [NN/g: F-Shaped Pattern For Reading Web Content (original eyetracking research)](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content-discovered/)
- [NN/g: Text Scanning Patterns: Eyetracking Evidence](https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/)
- [NN/g: Concise, Scannable, and Objective: How to Write for the Web](https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/)
- [NN/g: Memory Recognition and Recall in User Interfaces](https://www.nngroup.com/articles/recognition-and-recall/)
- [NN/g: The 3 Sizes of UX Copy (video)](https://www.nngroup.com/videos/the-3-sizes-of-ux-copy/)
- [NN/g: Dashboards: Making Charts and Graphs Easier to Understand](https://www.nngroup.com/articles/dashboards-preattentive/)
- [NN/g: 8 Design Guidelines for Complex Applications](https://www.nngroup.com/articles/complex-application-design/)
- [Google: Manage your subscriptions in Gmail](https://support.google.com/mail/answer/15621070)
- [Google Workspace Updates: Manage email subscriptions from a single location in Gmail (Jul 2025)](https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html)
- [Stripe Dashboard design breakdown](https://www.925studios.co/blog/stripe-dashboard-design-breakdown) **[secondary — third-party design writeup, not Stripe's own docs]**
- [Linear Docs: My issues](https://linear.app/docs/my-issues)
- [Clean Email: Your First Cleaning](https://clean.email/help/basics/getting-started) **[partial — exact per-card copy not retrievable via automated fetch]**
- [Lissy93/dashy#46 — Favicons fetched through Google's API are blurry / low resolution](https://github.com/Lissy93/dashy/issues/46)
- [StudentSuite/StudyMap#226 — competition logos are pixelated](https://github.com/StudentSuite/StudyMap/issues/226)

Code cross-referenced directly for this doc: `src/dashboard/dashboard.ts` (`renderOverview`
~660-840, `renderCleanupPlan`/`buildCleanupPlanRow` 1209-1339, `decisionReason`/`buildSenderRow`
1354-1577, `buildAllSendersRow` 1791-1848), `src/dashboard/senderTile.ts`, `src/lib/senderLogos.ts`,
`src/dashboard/index.html` (Overview ~166-176, Delete ~180-280). Cross-referenced against
`research/2026-09-09-competitor-ux-decision-fatigue-patterns.md` and
`research/2026-09-18-dashboard-visual-design.md` for scope boundaries only, not re-derived.
