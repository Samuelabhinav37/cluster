# Dashboard visual design — what dense, utilitarian productivity tools actually do

_2026-09-18. Scoped research doc, not a redesign. Answers one question: for a Chrome-extension
dashboard whose job is bulk email triage (dense lists, many small decisions, frequent scanning —
not a marketing site, not a one-time delight surface), what does real, well-regarded product
design actually use for visual weight, color, and card/row treatment? Written against Cluster's
own current implementation in `src/dashboard/dashboard.css` (2099 lines) and
`src/dashboard/dashboard.ts`, both read directly for this doc (not assumed). Every token value,
line number, and usage count below was pulled from those two files or from the cited primary
source, not invented. This follows the same standard applied to the sibling Moat project: pull
real tokens from real shipped products, not vibes.

---

## 1. GitHub Primer — a design system built specifically for a dense, all-day, utilitarian tool

Primer is GitHub's own open-source design system
([`primer/primitives`](https://github.com/primer/primitives)), and GitHub is the closest
real-world analogue to Cluster's actual job: a working tool used for hours a day by technical
users to scan long lists (PRs, issues, commits, files) and make many small decisions. Its tokens
are MIT-licensed and fully readable.

**Backgrounds are flat, not ambient.** `bgColor.default` is defined as `{base.color.neutral.0}`
(pure white in light mode) with an explicit usage rule in the token's own metadata:

> "Use as the primary background for pages and content areas. Do NOT use for emphasis or
> highlighting."
> ([`src/tokens/functional/color/bgColor.json5`](https://github.com/primer/primitives/blob/main/src/tokens/functional/color/bgColor.json5))

There is no ambient-gradient token, no radial-gradient token, and no blur/translucency token
anywhere in Primer's functional color, size, or typography sets — the only token categories that
exist are color, spacing, typography, motion, and size
([`primitives` README](https://github.com/primer/primitives/blob/main/README.md)). A page
background in Primer is a solid, opaque color; depth comes from a 1px `borderColor.default`
(`{base.color.neutral.6}`,
[`borderColor.json5`](https://github.com/primer/primitives/blob/main/src/tokens/functional/color/borderColor.json5))
around a flat surface, not from shadow/blur stacking.

**Color is gated by explicit semantic rules, not applied freely.** Every emphasis-strength color
token in `bgColor.json5` carries a machine-readable usage rule. These are Primer's own words, not
a paraphrase:

- `accent.emphasis`: "**MUST use for selected or active states.** Pair with `fgColor.onEmphasis`
  for text."
- `danger.emphasis`: "**MUST use for destructive action buttons like delete.** Use
  `fgColor.onEmphasis` for text on this background."
- `success.emphasis`: "Use for **positive action buttons like merge or confirm.** Pair with
  `fgColor.onEmphasis` for text."
- `neutral.muted`: "Use for neutral semantic meaning... **Do NOT use for status indicators.**"

(All from
[`bgColor.json5`](https://github.com/primer/primitives/blob/main/src/tokens/functional/color/bgColor.json5),
lines ~295–405.) The pattern is consistent across the whole file: every saturated color is scoped
to one real state (selected, destructive, positive-confirming, warning, draft, done) and
explicitly forbidden from decorative use. This is the same standard already confirmed on Moat —
Primer is the primary-source proof that it's not house style, it's how the most-imitated dense
dev-tool UI in the industry actually works.

**Control sizing is context-aware, and dense UI gets the smallest size, not the biggest.**
Primer's control-size tokens carry their own usage rule:

> "Match control size to context: **xsmall/small for dense UIs**, medium for standard forms,
> large/xlarge for prominent CTAs. Use `minTarget` values to ensure touch accessibility on coarse
> pointer devices."
> ([`src/tokens/functional/size/size.json5`](https://github.com/primer/primitives/blob/main/src/tokens/functional/size/size.json5))

Primer treats "large enough to tap on a phone" (its `minTarget.coarse` = `base.size.44`, i.e. the
same 44px Apple HIG number) as a *pointer-accessibility floor for touch*, not as the default size
for every button in a mouse-driven, list-heavy screen. Repeated-row action buttons in Primer's own
products (PR file-list row actions, issue-list row actions) run at the `small`/`xsmall` control
size, well under 44px, precisely because they appear dozens of times per screen.

**List rows in Primer's component layer** (`ActionList`, `Box` list patterns used throughout
github.com) use `bgColor.default`/`bgColor.muted` flat fills, a 1px `borderColor.muted` separator
between rows, and no independent shadow or blur per row — the "card" treatment, where it exists at
all, is applied once to the list container, not to each row.

---

## 2. Plausible Analytics — flat rows and gray-scale hero numbers, even for the headline stats

[Plausible Analytics](https://github.com/plausible/analytics) is an open-source, AGPL-licensed
analytics dashboard — the same "list/table of many similar items, scanned repeatedly" shape as
Cluster's sender/rule tables, built with React + Tailwind, fully readable.

**Repeated data-row treatment (`Bar` component)** — the component that renders every row of every
ranked list in the product (top pages, referrers, sources — the direct analogue of Cluster's
sender rows) is a plain relative-positioned `div` with a single flat, low-saturation fill bar and
`rounded-sm` corners. No shadow, no border, no gradient, no blur:

```jsx
// assets/js/dashboard/stats/bar.js
<div className="w-full h-full relative" style={style}>
  <div className={`absolute top-0 left-0 h-full rounded-sm ${bg || ''}`}
       style={{ width: `${width}%` }}></div>
  {children}
</div>
```
([`bar.js`](https://github.com/plausible/analytics/blob/master/assets/js/dashboard/stats/bar.js))

**Even the headline "hero" numbers get no card treatment.** `TopStats` — the component rendering
the big visitor/pageview/bounce-rate numbers at the top of every dashboard, functionally
equivalent to Cluster's Overview health-score number — styles its value purely with typography and
gray-scale, not a background surface:

```
className="font-semibold text-[1.2rem] text-gray-900 dark:text-gray-100"
```
([`top-stats.js`](https://github.com/plausible/analytics/blob/master/assets/js/dashboard/stats/graph/top-stats.js))

Visual hierarchy for the single most important number on the page comes entirely from font-weight
and a `gray-900`/`gray-500` two-step scale (primary stat vs. its secondary/comparison stat), never
from a glass panel, gradient, or colored tile. This is a useful data point specifically for
Cluster's Overview hero card question: even a product whose *whole job* is presenting one
big number doesn't reach for heavy surface treatment to do it.

---

## 3. Linear — restraint as the explicit, stated design position of the reference dense productivity tool

Linear is closed-source, so it can't be read the way Primer/Plausible can, but its own team has
repeatedly stated the philosophy in public, in their own words, which is the primary source NN/g
and every UX writeup ultimately point back to.

**On opinionated defaults over decoration/flexibility** — Linear co-founder Jori Lallo, in an
interview run on Figma's blog:

> "We design it so that there's one really good way of doing things." ... "Flexible software lets
> everyone invent their own workflows, which eventually creates chaos as teams scale."
> ([Figma Blog: The Linear Method: Opinionated Software](https://www.figma.com/blog/the-linear-method-opinionated-software/))

The design corollary Linear draws from this (documented on Linear's own blog, title alone states
the direction even where full-text fetch was blocked by the site — see note below): their 2023
palette revision moved *away* from a cooler, more saturated blue-ish theme toward, in their own
framing, a "more neutral and timeless appearance" with an explicitly "less saturated" palette,
keeping one chromatic accent (their signature lavender-blue, `#5e6ad2`) for interactive/status
meaning against an otherwise near-monochrome UI
([Linear: How we redesigned the Linear UI (part II)](https://linear.app/now/how-we-redesigned-the-linear-ui)
— **[fetched via search-index snippet; linear.app returned `ECONNRESET` to direct WebFetch]**).

The throughline across both the workflow-opinionation quote and the palette-desaturation move is
the same idea applied at two layers: reduce the number of things competing for the user's
attention, whether that's process choices or on-screen color. This is the primary-source backing
for treating "restrained, mostly-neutral, one accent" as the industry-standard shape for a fast
dense tool, not a specific palette recipe.

---

## 4. Nielsen Norman Group — glassmorphism has a documented, specific usability failure mode

NN/g has published directly on glassmorphism (frosted-glass/translucency effects) as a named UI
trend, which is the closest primary UX-research source to Cluster's stated "Liquid Glass" theme.

> "One of the most significant issues with glassmorphism stems from text readability problems,
> with text either being too light or too dark or backgrounds being too busy."
> ([NN/g: Glassmorphism](https://www.nngroup.com/articles/glassmorphism/))

Their core failure mode is specifically about translucent surfaces sitting over *variable*
content: contrast that's fine over one patch of what's showing through the glass and broken over
another patch, in the same element, depending on what's behind it — which is exactly the risk
profile of a full-page ambient gradient sitting behind dozens of independently-scrolling glass
list rows, versus a single static hero surface. NN/g's own recommendation is not "never use it,"
but a scoping rule that maps directly onto question 1 of this research:

> Glassmorphism works best "when utilized sparingly to create an illusion of depth," in design
> systems like Apple's and Microsoft's where it "help[s] establish visual hierarchy and depth" —
> but "without a solid grasp of visual-design principles or if overused, glassmorphism can pose
> significant accessibility and usability challenges."
> ([NN/g: Glassmorphism](https://www.nngroup.com/articles/glassmorphism/))

NN/g's own worked examples of "sparingly" are OS chrome elements (Control Center, notification
panels — small, few-per-screen, over a backdrop the user isn't reading text through) — not
scrollable data tables with 50-200 rows of text the user needs to read quickly and repeatedly.
That distinction (OS-chrome/one-off surface vs. repeated-content surface) is the load-bearing
finding for Cluster: it's not that translucency is universally bad, it's that NN/g's own
documented sweet spot is structurally the opposite shape from a triage table.

---

## Synthesis — mapped against Cluster's actual current tokens and markup

All figures below were read from `src/dashboard/dashboard.css` (2099 lines) and
`src/dashboard/dashboard.ts` (2912 lines) during this research pass, not assumed.

### Should the ambient gradient background stay or go?

**Cut it, or reduce it to a single subtle static tint.** Cluster's `--ambient` token
(`dashboard.css:18-21`) is a three-layer stack — two radial gradients plus a linear gradient —
applied once to the page background (`dashboard.css:295`, `background: var(--ambient)`), sitting
*underneath* ~10+ translucent glass surfaces (`--glass: rgba(255,255,255,0.8)` at
`dashboard.css:23`, consumed by `.glass-card`, `.grouped-list`, `.metric-band`, each with
`backdrop-filter: var(--blur)` — `blur(30px) saturate(180%)`, `dashboard.css:78`). This is
precisely the configuration NN/g flags as highest-risk: multiple translucent panels rendering
*through* a busy, non-uniform background, on a screen (Clean-up tab, Senders table) where the
content behind the glass is a long, independently-scrolling list — not a fixed backdrop. Primer
and Plausible, the two real dense-dashboard primary sources here, use flat, opaque
`bgColor.default`/`gray-50`-class canvases with zero ambient treatment. Recommendation: drop the
ambient gradient entirely for list-heavy tabs (Senders, Rules, Clean-up, Threats), and if any
ambient tint is kept for the Overview tab specifically, flatten it to a single static, low-alpha
tint rather than the current three-gradient stack — Overview's health-score card is the one place
in the app closest to Plausible's "hero number" case, and even Plausible renders that with
typography alone, no surface treatment.

### Should glass/translucency be dialed back, and where specifically?

**Dial back for `.grouped-list` (the sender/rule/threat row container) and `.list-row`; the
Overview hero card is the more defensible place to keep some of it, if any.** Concretely:
`.grouped-list` (`dashboard.css:661-669`) — the container wrapping every sender row, rule row, and
threat card — currently gets the same `backdrop-filter: blur(30px) saturate(180%)` +
`box-shadow: var(--shadow-card)` treatment as the one-off Overview `.glass-card`
(`dashboard.css:648-659`, confirmed in use for the health-score hero at
`dashboard.ts:607-784`). Primer's ActionList/list containers and Plausible's ranked-list rows both
use flat opaque fills for exactly this repeated-content case. The one place a heavier surface is
earned, per both NN/g's "sparingly, for one-off depth" guidance and Plausible's willingness to
spend *zero* surface treatment even on its headline number, is nowhere in Cluster today — meaning
even the current hero-card glass treatment is more than the closest real precedent uses, but it is
the more defensible of the two if only one gets to keep any glass at all. Recommendation: give
`.grouped-list` an opaque `--glass-solid`-style background (the token already exists,
`dashboard.css:24`, currently reserved for `prefers-reduced-transparency` fallback — promote it to
the default for list containers) and drop `backdrop-filter` there; leave `.glass-card` as the one
surface allowed to keep blur, reserved for true one-off hero placements.

### Is the purple accent used restrained or overused?

**Mostly restrained in actual markup usage; the token surface area looks larger than the real
footprint.** Grepping `dashboard.css` for token references: `--accent*` tokens (all variants:
`--accent`, `--accent-text`, `--accent-fill`, `--accent-fill-border`, `--accent-fill-text`,
`--accent-fill-hover`, `--accent-solid`, `--accent-solid-border`, `--accent-solid-text`) total 53
references; `--danger*` totals 39; `--success*` totals 12. That sounds high, but nearly all of it
is state-variant plumbing (default/hover/border/text) for a small number of actual components
(`.btn-accent`, `.btn-accent-solid`, `.pill.accent`, `.tile-danger`, trend-chart peak bars) — not
53 independently-placed colored elements. Checking real usage in `dashboard.ts`: `btn-accent-solid`
(the full saturated gradient CTA button, `dashboard.css:769-787`,
`linear-gradient(180deg, #8b7fd8, #6f62c4)`) appears only **2 times**; plain `btn-accent`
(text-tinted, not gradient-filled) **1 time**; `tile-danger` **1 time**; `pill.accent` /
`pill.danger` / `pill.success` combined **3 times**. That distribution — one saturated gradient
button reserved for the primary CTA, danger reserved for a single destructive-context tile — is
already close to Primer's "MUST use for selected/active," "MUST use for destructive," rule. The
actual risk isn't decorative accent-spam; it's that **the two real semantic buckets (accent as
"primary action," danger as "destructive/risk") share visual weight with the ambient/glass
system** rather than standing out against a calmer backdrop — i.e. the accent gradient button
doesn't read as more special than the rest of the page, because everything around it (ambient
gradient, glass cards, 3 shadow tiers) is already highly decorated. Recommendation: the accent
usage itself doesn't need to shrink; the *surroundings* need to calm down so one gradient CTA per
screen actually reads as the one high-emphasis element, per Primer's `accent.emphasis` /
`danger.emphasis` "must-use, reserved" model.

### List-heavy screens (sender rows, rule rows, threat cards) vs. one-off hero cards (Overview health score)

**Confirmed structural finding worth preserving:** Cluster already separates these correctly at
the component level — `.list-row` (`dashboard.css:678-684`) itself carries no independent glass,
shadow, or gradient; the glass/shadow is applied once to the `.grouped-list` wrapper, not per row
(`dashboard.ts:640` creates each row with `className = "list-row"`, `dashboard.ts:842/915/1432`
wrap them in one shared `"grouped-list"` container). That's the right shape and matches Primer's
list-container-not-list-row pattern — the fix identified above (drop blur on the *container*, keep
it reserved for true hero cards) doesn't require restructuring markup, just retargeting which
container gets the glass treatment.

**One concrete density problem specific to rows:** `.row-actions` (`dashboard.css:827-832`) is
built from `.btn`/`.btn-icon`, both set to `min-height: 44px` (`dashboard.css:730, 822-824`) — the
same touch-target size used for primary hero CTAs — and every `.list-row` already carries
`padding: 14px 18px` (`dashboard.css:682`). A 44px action control plus 14px vertical row padding
puts each sender/rule/threat row at roughly 70-90px tall before any secondary line of text, in a
screen meant to show "50-200 rows" scannably per the brief. Primer's own control-size token rule —
"xsmall/small for dense UIs... large/xlarge for prominent CTAs," with the 44px `minTarget` figure
scoped explicitly to *touch-pointer accessibility*, not desktop-mouse row actions
(`primer/primitives` `size.json5`) — is the direct precedent for shrinking row-level action buttons
to a smaller control size class than hero-CTA buttons, which would meaningfully increase how many
rows fit on screen without any color or glass change at all.

### Bottom line, ranked by expected impact

1. Drop the ambient multi-gradient page background on list-heavy tabs (Senders, Rules, Clean-up,
   Threats); keep at most a flat/static tint, if any, on Overview only.
2. Make `.grouped-list` (the sender/rule/threat row container) opaque — swap
   `background: var(--glass)` + `backdrop-filter` for the existing `--glass-solid` token, no
   blur. Reserve blur for `.glass-card` used as a genuine one-off hero surface.
3. Leave the accent/danger/success token usage as-is (it's already reserved to a handful of real
   components), but expect it to read as properly restrained *only after* 1 and 2 land — right now
   it's competing with a busier system than it needs to.
4. Shrink `.row-actions` buttons to a smaller control-size class than hero CTAs (Primer's
   dense-UI-gets-small-controls rule) to recover row height for actual scanning density.

---

## Sources

- [GitHub Primer Primitives — `bgColor.json5`](https://github.com/primer/primitives/blob/main/src/tokens/functional/color/bgColor.json5)
- [GitHub Primer Primitives — `fgColor.json5`](https://github.com/primer/primitives/blob/main/src/tokens/functional/color/fgColor.json5)
- [GitHub Primer Primitives — `borderColor.json5`](https://github.com/primer/primitives/blob/main/src/tokens/functional/color/borderColor.json5)
- [GitHub Primer Primitives — `size.json5` (functional)](https://github.com/primer/primitives/blob/main/src/tokens/functional/size/size.json5)
- [GitHub Primer Primitives — README](https://github.com/primer/primitives/blob/main/README.md)
- [Plausible Analytics — `bar.js`](https://github.com/plausible/analytics/blob/master/assets/js/dashboard/stats/bar.js)
- [Plausible Analytics — `top-stats.js`](https://github.com/plausible/analytics/blob/master/assets/js/dashboard/stats/graph/top-stats.js)
- [Figma Blog: The Linear Method: Opinionated Software](https://www.figma.com/blog/the-linear-method-opinionated-software/) (interview quotes from Linear's Jori Lallo, Cristina Cordova)
- [Linear: How we redesigned the Linear UI (part II)](https://linear.app/now/how-we-redesigned-the-linear-ui) **[direct WebFetch blocked by linear.app — content taken from search-index snippet, flagged secondary]**
- [NN/g: Glassmorphism](https://www.nngroup.com/articles/glassmorphism/)

Cross-referenced against direct reads of this repo's own current implementation (not
re-derived, cited throughout): `src/dashboard/dashboard.css`, `src/dashboard/dashboard.ts`.
