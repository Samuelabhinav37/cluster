# General dashboard-design-principle literature — checked against Cluster's actual dashboard

_2026-09-18. Fifth research doc in this set, filling a gap the other four don't cover: established,
general dashboard/BI-design-practitioner literature (not competitor-specific UX). The other four
docs already cover navigation-level decision fatigue, phishing/security separation, glass/color
visual weight, and within-row microcopy — see their Synthesis sections, skimmed for this doc so it
doesn't repeat them. This doc is about dashboard *composition*: layout grids, the "5-second rule,"
metric grouping, density, and named anti-patterns, cross-referenced against
`src/dashboard/index.html` (Overview `data-screen="overview"` ~line 166, Delete
`data-screen="delete"` ~line 180) and `src/dashboard/dashboard.css`/`dashboard.ts`, read directly
for this pass, not assumed.

---

## 1. Pencil & Paper — UX Pattern Analysis: Data Dashboards

([pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards))

**Specific and actionable:**

- **F/Z eye-tracking placement.** "The top left area gets more attention, that's where you want to
  showcase the most global numbers, or the most relevant data" — top-down structure: global
  metrics first, overview middle, detail last.
- **Metric grouping as a comprehension mechanism, not just tidiness.** "Charts and graphs are
  conceptually grouped together — so that people can understand what should be considered together
  and separately." Ungrouped, disconnected data displays alienate the reader.
- **Named anti-pattern: "data eyeball attack."** Showing everything a system has data for, at once,
  causes disengagement: "We have it, so why not show it?" is explicitly called out as the wrong
  instinct — curate ruthlessly, don't dump.
- **Deltas over raw numbers.** Numbers without a baseline, target, or historical comparison "lack
  meaning" — "deltas are used to showcase differences."
- **Sensible defaults, not maximal defaults.** "Just because you have the data, doesn't mean it
  should be shown" by default; use progressive disclosure (tooltips, legend toggles) for secondary
  detail.

**Generic filler:** the color-accessibility guidance (avoid red-green stoplight, use texture for
colorblind users) is sound but chart-specific — thin overlap with Cluster, which has no charts
besides one sparkline.

---

## 2. UXPin — Dashboard Design Principles

([uxpin.com/studio/blog/dashboard-design-principles](https://www.uxpin.com/studio/blog/dashboard-design-principles/))

**Specific and actionable:**

- **Hierarchy by position + type scale.** "Place the most critical data at the top or left-hand
  side of the dashboard"; "larger, bolder fonts can be used for titles and main metrics, while
  smaller fonts work well for labels."
- **Grouping via visual separators, not just proximity.** "Use borders, spacing, and background
  colors to separate these groups and create distinct sections" — a stronger, more mechanical claim
  than Pencil & Paper's (§1), naming the actual CSS-level techniques.
- **Cognitive-load reduction as subtraction.** "Remove non-essential elements," reduce "duplicate or
  redundant information," provide "additional information on demand, rather than displaying
  everything upfront."
- **Named anti-patterns:** information overload, inappropriate visualization choices (3D charts,
  pie charts for time-series — doesn't transfer to Cluster), ignoring user workflow, inconsistent
  visual language across screens.

**Generic filler:** as fetched, this piece gives no quantitative thresholds (no "N metrics max," no
grid spec) — directionally identical to §1 but without ThoughtSpot's (§3) or Klipfolio's (§6)
numbers.

---

## 3. ThoughtSpot — Dashboard Design: Examples and Best Practices

([thoughtspot.com/data-trends/dashboard-design-examples-best-practices](https://www.thoughtspot.com/data-trends/dashboard-design-examples-best-practices))

**Specific and actionable — the most quantitative of the four required sources:**

- **Grid regions by role:** "Top row: most important KPIs and alerts. Middle section: primary
  charts and visualizations. Bottom area: detailed tables and secondary metrics. Sidebar: filters,
  navigation, and controls." Explicitly framed as matching reading order: "this layout follows
  natural reading patterns and puts the most critical information where users expect to find it."
- **The Rule of Six.** "Use a maximum of six visualizations per group to maintain focus," with four
  named grouping patterns: Focus (one primary + supporting), Scorecard (grid of equal-weight KPIs),
  Comparison (two side by side), Breakdown (one aggregate + smaller supporting).
- **Tab/section scope limit.** Each screen or tab should hold "four to five groups (up to ~25
  visualizations)," with each tab answering one high-level question — a concrete number for how
  much a single screen should carry before it needs to split.
- **Named anti-patterns, explicit list:** cramming too many metrics, inconsistent color schemes,
  poor mobile responsiveness, lacking visual hierarchy, missing metric context, slow loading,
  designs misaligned with user workflows.
- **Whitespace as a two-sided tradeoff, stated directly:** "too much white space makes information
  hard to scan; too little creates overwhelming layouts" — this is the one source among the four
  that names the density tradeoff as bidirectional rather than only warning against clutter.

**Generic filler:** "consider your audience first," "choose the right dashboard type" — present but
not elaborated.

---

## 4. Tableau — Dashboard Best Practices (help.tableau.com)

([help.tableau.com/current/pro/desktop/en-us/dashboards_best_practices.htm](https://help.tableau.com/current/pro/desktop/en-us/dashboards_best_practices.htm))

**Specific and actionable:**

- **Upper-left placement**, same claim as §1/§2: "be sure to place your most important view so
  that it occupies or spans the upper-left corner."
- **A hard view-count ceiling: 2–3.** "Restrict to 2-3 views maximum" per dashboard — visual
  clarity and the big picture "can get lost in the details" past that, with a secondary practical
  reason (published-dashboard performance degrades with more views). This is a stricter ceiling
  than ThoughtSpot's Rule of Six (§3), though the two aren't measuring the same unit (Tableau
  "view" = a full chart/table; ThoughtSpot "visualization" = a smaller tile) — flagged as
  divergence, not contradiction.
- **Size for the actual display target**, not just "responsive": author at final fixed dimensions,
  or use Tableau's own "Range" auto-sizing feature; warns that plain automatic sizing without Range
  "may cause scrunched views or scrollbars."
- **Filters need explicit instructional labeling**: "edit the title of a filter to give your
  viewers clear instructions," not just a bare control.

**Generic filler:** most of the page is Tableau-feature-specific mechanics (highlighting between
views, filter widget types) that don't transfer to a hand-built HTML/CSS dashboard at all — flagged
as not applicable to Cluster, not forced.

**Overall note on this source:** the *least* transferable of the four required sources — it's a
product manual for an interactive BI authoring tool, not a general design-principle essay. Its one
durable, source-agnostic idea is the 2–3-view ceiling and the upper-left-placement convention;
everything else is Tableau UI mechanics.

---

## 5. Amplitude — How to Build the Perfect Analytics Dashboard

([amplitude.com/blog/analytics-dashboard](https://amplitude.com/blog/analytics-dashboard)) — added
because Amplitude is a product-analytics/engagement-metrics vendor, the closest domain match to
what Cluster's Overview screen is actually trying to show (engagement/never-read/health-score
metrics), distinct from the four BI-chart-authoring sources above.

**Specific and actionable:**

- **Narrative flow, not a metric dump.** "Craft a story from your data by ordering reports so they
  provide a clear, logical flow from top to bottom" — ordering as a deliberate act, not a side
  effect of build order.
- **Audience-first structure**, explicitly contrasted by role: "executives want revenue summaries
  while product teams need activation-to-retention pipelines" — the same dashboard shape is wrong
  for two different audiences.
- **Named anti-pattern: decision paralysis from irrelevant metrics.** Teams "may stall rather than
  make any decisions because they're unsure what to tackle first" when metrics that don't advance
  the dashboard's purpose are included — this is the closest any source gets to naming Cluster's own
  failure mode directly (a dashboard whose job is to drive a decision, undermined by breadth).
  "Aesthetics matter, but functionality is a more important consideration."
- **Named anti-pattern: misleading metric juxtaposition.** Showing two related numbers side by side
  without connecting them can be misread — the example given (total visitors next to CAC) is a
  general instance of the same problem the within-screen-clarity doc already found in Cluster's
  Overview (two uncombined stat tiles the user must mentally connect — see Synthesis below).

---

## 6. Klipfolio — Dashboard Design: Principles, Visualizations, and Best Practices

([klipfolio.com/articles/dashboard-design](https://www.klipfolio.com/articles/dashboard-design)) —
added as a second BI-vendor source distinct from ThoughtSpot/Tableau, chosen because it gives the
most concrete color and comparison-value rules of anything fetched for this doc.

**Specific and actionable:**

- **Upper-left + grouping**, same claim as §1/§2/§4, stated with a mechanism: "when viewers have to
  jump between unrelated panels to piece together a picture, the dashboard is doing extra work" —
  frames grouping as reducing literal navigation cost, not just aesthetics.
- **A number is not information without a comparison value.** "A number without context tells you
  very little." Names six specific comparison shapes: vs. explicit target, vs. previous period, vs.
  same period last year, vs. 30-day trailing average, projected vs. forecast, vs. a related metric.
- **Hard color ceiling: 5.** "Never use more than 5 distinct colors [per page], or contrast becomes
  visual noise." Reserve saturated color for outliers/alerts only; use desaturated neutrals for
  regular data; keep red=negative/green=positive consistent once chosen.
- **Maintenance anti-pattern, unique to this source:** "dashboards update data automatically, but
  the structure, metrics, and design do not update themselves" — a dashboard can silently go stale
  in relevance even while its numbers stay live. No other source flags this.

**Generic filler:** the chart-type-selection table (when not to use bar/line/area/pie/gauge/heat
map) is thorough but doesn't transfer — Cluster has one sparkline and otherwise no charts.

---

## Synthesis

### (a) Principles recurring across 3+ sources, ranked by how much they'd change Cluster's actual dashboard

1. **Cap how much is shown on one screen at once (recurs in §1, §3, §4, §5 — 4 of 6 sources,
   the strongest consensus in this doc).** Names vary — Pencil & Paper's "data eyeball attack,"
   ThoughtSpot's Rule of Six + 4-5-groups-per-tab, Tableau's 2-3-view ceiling, Amplitude's
   decision-paralysis warning — but all converge on "screens with more independent decision units
   perform worse," which is the *composition* half of a problem the existing decision-fatigue doc
   already diagnosed at the *navigation* level (10 stacked sections on Delete,
   `research/2026-09-09-...md:249-263`). **This is the highest-impact principle for Cluster** because
   it applies independently at a level the other docs didn't measure: even after collapsing to one
   "Suggestions" surface (the existing recommendation), the *metric-band* itself
   (`src/dashboard/dashboard.css:926-938`, rendered by `renderSuggestedMetricBand`,
   `dashboard.ts:1125-1192`) already shows 5 numbers simultaneously (1 hero + 4 secondary tiles:
   senders scanned, past-window, never-opened, suspected-spam) — within ThoughtSpot's Rule of Six
   but past Tableau's 2-3-view ceiling, and none of the 5 numbers carries a comparison value (see
   #2 below).

2. **A number needs a comparison value to mean anything (recurs in §1 "deltas," §5 "misleading
   juxtaposition," §6 "a number without context tells you very little," all naming the identical
   idea independently).** Cluster's Overview *does* do this in one place — the health-score card
   shows a delta pill against the previous scan (`dashboard.ts:764-771`,
   `pill ${delta > 0 ? "success" : "danger"}`) — but the Delete screen's metric-band does not: all 5
   numbers in `renderSuggestedMetricBand` (`dashboard.ts:1152-1191`) are bare counts with no
   comparison to a previous scan, a target, or a trailing average. This is new, concrete evidence
   this research pass adds: the within-screen-clarity doc flagged Overview's *two hero numbers*
   as uncombined (§(c) of that doc's synthesis) but didn't examine the metric-band's 4 secondary
   tiles, which have the same "bare number, no context" issue at a smaller scale.

3. **Upper-left / reading-order placement of the most important number (recurs in §1, §2, §4, §6 —
   4 of 6 sources, the most repeated single claim in this literature).** Low practical delta for
   Cluster: `.metric-band` (`dashboard.css:926-938`) is a horizontal flex row with the hero first
   and a real type-scale difference already in place (`.metric-hero` 44px, `dashboard.css:914-918`,
   vs `.metric-secondary .n` 22px, `dashboard.css:947-950`) — the hero-first, larger-first pattern
   these sources ask for is already the implementation. Flagged as confirming what's already right,
   not a gap.

4. **Grouping via explicit visual separation, not just stacking (recurs in §2, §3's pattern
   taxonomy, §6's "unrelated panels" framing).** Cluster's `.grouped-list` (`dashboard.css:661-669`)
   and `.list-row` grid shapes (`dashboard.css:678-695`) do group same-kind rows into one bordered
   container — this part matches. What doesn't match this principle is *between* Delete's own
   sections: `#suggested-actions-section` → `#keep-newest-section` (a `<details>` disclosure) →
   `#domain-groups` (`src/dashboard/index.html:193-273`) are three structurally different
   containers (a `<section>`, a `<details>`, another `<section>`) stacked in sequence with no shared
   visual grouping mechanism connecting them — each reads as an independent page section rather than
   grouped views of the same "cleanup plan" concept. This is compositional, not a navigation-level
   finding (the decision-fatigue doc's fix is to merge them into one review flow; this finding is
   that even short of a merge, they don't currently read as one group).

### (b) Cross-reference to the other four docs

- **Reinforces, with independent sourcing, not new:** the core "too much shown at once" finding.
  The decision-fatigue doc (09-09) already diagnosed Delete's 10-section stack and the 4
  equal-weight per-row buttons using NN/g's progressive-disclosure/Hick's-Law framing and Clean
  Email's competitor precedent. This doc reaches the same conclusion — screens should carry fewer
  simultaneous decision units — from a completely different literature (BI/dashboard-composition
  practitioners, not UX-research or competitor products), which raises confidence in that
  conclusion rather than adding a new one. Likewise, §4's "grouping via visual separation" echoes
  the visual-design doc's (09-18) recommendation to make `.grouped-list` the shared, consistent
  container — this doc adds the generic-principle backing NN/g's glassmorphism-specific critique
  didn't need, but doesn't change that doc's recommendation.
- **Genuinely new:** the **comparison-value gap** (§(a)#2 above). None of the other four docs
  examined whether Cluster's *numbers* carry context (target, prior period, trend) — they examined
  screen structure, security separation, glass/color, and row microcopy, but not "does this count
  mean anything on its own." This is a concrete, previously-unflagged finding: 4 of the 5 numbers in
  the Delete screen's metric-band, and the "Ready when you are" hero number on Overview
  (`dashboard.ts:704-711`, `planTotal` with no comparison to a prior scan despite `healthHistory`
  already existing in settings and being used two cards over), have no comparison value even though
  the data to build one (`ctx.settings.healthHistory`) is already in the codebase and already used
  for exactly this purpose on the neighboring health-score card.
- **Genuinely new:** Klipfolio's **maintenance/staleness anti-pattern** ("structure doesn't update
  itself") — none of the other docs raised this angle (they're about current-state layout, not
  drift over time). Noted here as a real but lower-priority idea for Cluster: worth a mental check-in
  as new screens (Rules, Subscriptions, Phishing) get built, not an immediate code change.
- **No source in this doc materially changes** the phishing-separation doc's or the within-screen
  microcopy doc's conclusions — those operate at a level (security isolation; per-row field count)
  this literature doesn't address directly.

### (c) Anti-patterns Cluster is currently guilty of, with evidence

- **Bare numbers without comparison values (new finding, §(a)#2).** `renderSuggestedMetricBand`
  (`src/dashboard/dashboard.ts:1125-1192`) renders 5 numbers with zero deltas/targets/trends; the
  Overview "Ready when you are" hero (`dashboard.ts:704-711`) is the same gap, one card away from a
  working precedent (`dashboard.ts:754-771`) it doesn't reuse.
- **Independent screen sections without a shared grouping treatment (§(a)#4).** Delete's three
  section types stacked with no shared container (`src/dashboard/index.html:193-273`) — this is a
  narrower, compositional restatement of the decision-fatigue doc's finding, not a duplicate: even
  Cluster's existing `.grouped-list` primitive isn't applied *between* these sections, only within
  each one.
- **Does not apply / not guilty:** chart-selection anti-patterns (wrong chart type, 3D charts, axis
  truncation, pie charts for time series) — Cluster has exactly one sparkline
  (`dashboard.ts:786-`) and otherwise renders no charts, so most of §3/§4/§6's most detailed,
  numerous warnings simply have no surface to apply to. Tableau's filter-labeling and
  responsive-sizing-feature guidance (§4) is BI-authoring-tool-specific and doesn't map onto a
  hand-built HTML dashboard at all.
- **Does not apply / already handled elsewhere:** excessive color and glass-surface overuse — both
  are real named anti-patterns in this literature (§1, §2, §6's 5-color ceiling), but the existing
  visual-design doc (09-18) already audited Cluster's actual token usage in detail (53 `--accent*`
  references resolving to ~6 real component usages) and found the *effective* footprint restrained;
  this doc's more generic "avoid too much color" warning doesn't add a new finding on top of that
  more precise, code-level audit.

---

## Sources

- [Pencil & Paper: UX Pattern Analysis — Data Dashboards](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
- [UXPin: Dashboard Design Principles](https://www.uxpin.com/studio/blog/dashboard-design-principles/)
- [ThoughtSpot: Dashboard Design — Examples and Best Practices](https://www.thoughtspot.com/data-trends/dashboard-design-examples-best-practices)
- [Tableau Help: Dashboard Best Practices](https://help.tableau.com/current/pro/desktop/en-us/dashboards_best_practices.htm)
- [Amplitude: How to Build the Perfect Analytics Dashboard (7 Examples)](https://amplitude.com/blog/analytics-dashboard)
- [Klipfolio: Dashboard Design — Principles, Visualizations, and Best Practices](https://www.klipfolio.com/articles/dashboard-design)
