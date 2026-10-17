# Cluster UI report: visual system, components, reactivity, screens

_2026-10-05. UI team (visual and interaction design). Branch `feature/inbox-time-limits` at
`22ba332`, which already contains `redesign/apple-glass-v3`. No source code was changed._

Companion files in this folder:

- `ux-report.md` (UX team). This report uses its IA (section 3), glossary (section 5) and
  follows its hand-offs to UI (section 7.1). Area names match it: **Today · Sorting · Senders ·
  Clean up · Security · Activity · Settings**.
- `mockup.html`. A static, self-contained mockup of the new shell plus Today, Sorting and
  Senders. Open it in Chrome. It follows the OS light or dark setting. A "Mockup states" pill in
  the corner shows the loading, offline, signed-out and row-error states.

Conventions:

- `path:line` refers to this branch.
- **Measured** means I ran the built dashboard (`dist/`, served by `scripts/preview/serve.mjs`
  on a spare port) in headless Chrome against the fake mailbox and read the DOM.
- **(Inference)** marks my own design reasoning.
- "Via search summary" means I saw the claim in a search result, not on the page.

## TL;DR

1. **The look is fine. The system under it is not.** Tokens for colour are tidy
   (`dashboard.css:11-213`). Spacing, type and radii are not tokenised: 13 font sizes, 13 radius
   values, about 60 distinct padding values, and 53 inline `style.*` writes in `dashboard.ts`.
2. **Too many variants of the same thing.** 18 distinct button class combinations in the live
   DOM, 6 list/row treatments, 4 "banner" uses of one class, 3 checkbox styles, 2 switches.
3. **Density is the real "mess".** Measured controls per screen: Organize **117**, Subscriptions
   73, Delete 68, All senders 30. Plus 11 global controls (header and banners) on every screen.
4. **Two CSS bugs make it worse than designed.** Every sender's "Options" strip is always open,
   because `.instead-strip { display:flex }` beats the `hidden` attribute (`dashboard.css:1411`).
   And the search icon sits on the placeholder because `input[type="search"]` (`:1855`) overrides
   `.search input` padding (`:1183`). Both are measured.
5. **Four WCAG 2.2 AA failures** in the tokens: primary button text 3.4:1 (`--accent-solid` top
   stop), control borders 1.4:1 (needs 3:1 under 1.4.11), focus ring 2.8:1, and 16 px native
   checkboxes under the 24 px target-size floor (2.5.8). Small token fixes solve all four.
6. **Competitors agree on four patterns:** labelled left nav with ≤ 7 items, one list-row anatomy,
   a single bottom toast with one action (Undo) for about 5 to 10 s, and settings as a full page
   reached from a labelled entry. Sources in section 2.
7. **Component system: 15 parts**, each with states and tokens (section 3). Keep glass on the
   navigation layer (header, sheet, toast, bulk bar). Drop blur from content lists, as Apple's
   own Liquid Glass guidance says.
8. **Reactivity spec** (section 4): pressed state < 100 ms, row change < 200 ms, toast 10 s with
   pause on hover or focus, skeletons instead of blank screens, a header status pill with 6
   states, and full reduced-motion fallbacks.
9. **Wireframes for all 7 areas** with priority order (section 5). Control budgets: Today ≤ 8,
   Sorting 3 per category, Senders 2 per row.
10. **The software team owes the UI one event stream** (`pending → done | failed` with count,
    summary and undo) plus a sync-status store. Without those, none of the reactivity works
    (section 7).

---

## 1. Visual audit

### 1.1 Tokens as they are

**Colour** (`dashboard.css:11-93` light, `:95-154` dark via media query, `:156-213` dark via
`data-theme`). Well structured: canvas, 4 glass tints, 4 label levels, accent (fill, text,
solid), danger, success, neutral. Every light token has a dark twin.

Problems:

- **The dark palette is written twice** (`:95-154` and `:156-213`, identical). Any edit must be
  made twice. **(Inference)** Generate one from the other, or use one selector list.
- **Colour literals bypass tokens**: `.avatar` gradient (`:402`), `.check:checked` gradient
  (`:1130`), `.switch > span` white and shadow (`:1352-1353`), `.tile-danger` `#fff` (`:1527`),
  `.trend span.peak` glow (`:1012-1014`), plus brand colours set inline by `senderTile.ts:30-31`
  (that one is correct; logos are content).
- **Accent is used for selection, primary actions, every switch-on, checked boxes, the nav
  highlight and nav counts.** That is within the "selected state" rule from the 2026-09-18 visual
  research, but the Organize screen still shows ~16 purple controls in one viewport. **(Inference)**
  Fine for a primary and a selected state. Not fine for row-level secondary actions (see 3.4).
- **Red is overused on Delete.** 26 red "Delete domain…" buttons in one screen (measured from the
  screenshot of the Delete screen). Red should mean "this destroys", once, at the confirm.

**Type.** System stack (`:88-92`). Weights 400, 500, 590, 600. Sizes found in the CSS
(count of declarations): 11 px (2), 12 (11), 13 (12), 14 (27), 15 (9), 16 (5), 17 (2), 22 (3),
28 (1), 34 (1), 36 (1), 44 (1), plus `0.85em`. **13 sizes, no scale.** Measured on the live page:
11, 12, 13, 13.33 (a native control default), 14, 15, 17, 34. Section labels are 12 px uppercase
in 5 places with 3 different letter-spacings (`.05em` at `:522`, `:619`, `.03em` at `:2100`).
`.text-meta`, `.hint`, `.caveat`, `.recent-detail`, `.section-head .muted` are 5 names for one
style; the file admits it (`:1949-1953`).

**Spacing.** No tokens. About 60 distinct `padding` values (for example `9px 14px`, `9px 15px`,
`9px 16px 12px`, `8px 14px`, `8px 15px`, `8px 16px`) and gaps of 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
12, 13, 14, 16, 18, 20, 26 and 28 px. Inline styles add more: `dashboard.ts:787-790`, `:821-825`,
`:848-862`, `:1234-1248`, `:1408-1411`, `screenerTab.ts:172-175`, separator insets of 18, 56 and
66 px set inline at `dashboard.ts:965`, `:1007`, `:1555`.

**Radii.** 7 tokens (`:81-86`: 24, 20, 14, 12, 11, 980) plus literals 13, 10 (×4), 9, 8 (×3),
4/2, 3 and 50%. **(Inference)** 4 are enough: 20 (cards and lists), 12 (controls and inner
panels), 8 (small chips, focus), pill.

**Shadows.** 4 tokens (`:69-76`), sensible two-layer light shadows and deep dark ones. Fine. Two
surfaces stack `--shadow-card-lg` inside a list that already has `--shadow-card`, which reads as
floating cards inside floating cards on Overview.

**Glass.** `backdrop-filter: var(--blur)` is applied 20 times, including every `.grouped-list`,
`.banner`, `.review-panel`, `.category-group` and each `#quarantine-review-list li`. The page
background is a near-flat tint (`--ambient`, `:18-21`), so the blur has almost nothing to blur.
It costs paint time on long lists and adds no depth. `prefers-reduced-transparency` is handled
(`:300-313`), which is good.

### 1.2 Component inventory and duplicates

Measured class combinations on `<button>` in the live DOM (18):
`pill-btn`, `icon-btn` (via `summary`), `nav-item`, `btn`, `btn btn-accent`, `btn btn-danger`,
`btn btn-ghost`, `btn btn-icon`, `btn btn-sm`, `btn btn-accent btn-sm`, `btn-sm` (no base!),
`btn-accent-solid`, `danger` (bare), `(no class)` (styled by the global `button` rule at
`:240-268`), `link-btn`, `chip`, `smart-view-chip`, plus `segmented button` and `.switch`.

| Kind | Variants found | Where | Keep |
|---|---|---|---|
| Button | 7 real looks: base `button`, `.btn`, `.btn-accent`, `.btn-accent-solid`, `.btn-danger`, `.btn-ghost`, `.link-btn`; 2 sizes (44 / 40 px); plus `.pill-btn` and `.icon-btn` in the header | `:240`, `:733-833`, `:409-451`, `:1431` | 5 looks × 2 sizes (3.4) |
| List / row | `.grouped-list` + `.list-row` (4 grid shapes, `:689-703`), plus inline grid at `dashboard.ts:728`, `:1057`, `screenerTab.ts:143`; HTML `<table>` (3 places: domains, spam, paid subs); `.evidence-list`; `.subject-list`; `.metric-line`; `#quarantine-review-list li` | many | 1 row anatomy (3.3) |
| Card / panel | `.glass-card`, `.metric-band`, `.review-panel`, `.inner-panel`, `.compare-cell`, `.category-group`, `.sort-preview-bucket`, `.rule-preview-row`, `.toolbar` (as a panel) | `:648-676`, `:934`, `:1269`, `:1455`, `:2109-2179`, `:1919` | 1 card + 1 inset panel |
| Banner | `.banner` used for onboarding, label tidy, Athena, time-limits backlog, sort seed card, screener backlog (6 uses) | `index.html:181-200`, `:368`, `:394`, `:667` | 1 notice, never stacked globally |
| Status text | `.status-line`, `.hint` with `role=status` (4 places), `.confirm-summary`, `.connect-error`, `.field-error` | | toast + inline row status |
| Toggle | Native checkbox (`accent-color`, `:2203`), round `.check` (`:1113`), `.switch` (`role=switch`, `rulesTab.ts:106`) | Screener, time limits, auto-quarantine and Sort use native checkboxes as on/off switches | `.switch` for on/off, `.check` for selection |
| Select | Native `select` with 3 paddings (`:1864`, `:1850`, `.form-grid`) | | 1 select |
| Chips / filters | `.chip`, `.smart-view-chip`, `.segmented`, `.pill` (5 tones), `.pill.dashed` acting as a button | `:844-918`, `:1201-1230` | filter chip + status pill |
| Disclosure | `<details class="disclosure">`, `.category-group`, `.sort-preview-*`, `.instead-strip` | | 1 disclosure |
| Metric | `.metric-hero` 44 px, `.metric-card-num` 22, `.metric-band`, `.metric-line`, trend chart | Overview, Delete | 1 summary line (Today) |

### 1.3 Density (measured)

Visible interactive elements inside each screen, at 1440 × 900, fake mailbox with 27 senders:

| Screen | Controls in screen | Page height | Global controls above it |
|---|---|---|---|
| Overview | 5 | 784 px | 11 |
| Delete | 68 | 3,068 px | 11 |
| Organize | **117** | 2,341 px | 11 |
| Subscriptions | 73 | 2,596 px | 11 |
| Phishing | 13 | 2,096 px | 11 |
| All senders | 30 | 2,172 px | 11 |
| Rules | 22 | 906 px | 11 |
| Screener | 1 | 516 px | 11 |
| Recently done | 0 | 327 px | 11 |

"Global" is header (4) plus the onboarding and label-tidy banners (they render outside `.screen`,
`index.html:179-200`, so they also lose the 32 px gutter and sit flush against the sidebar and
the window edge; visible in every screenshot).

Why Organize hits 117: 8 sender rows × (checkbox, Mute, ⋯, Unsubscribe, Keep sorted, Mute again,
snooze select, Snooze, Not useful) because of the `[hidden]` bug below, plus the bulk bar (6),
11 time-limit selects, Save, Apply, Sort, the config disclosure and 5 smart-view chips. Each
sender shows **Mute twice**.

### 1.4 Bugs that look like design problems (measured)

1. **Options strips are never hidden.** `buildDecisionRow` sets `disclosure.hidden = true`
   (`dashboard.ts:1599`), but `.instead-strip { display: flex }` (`dashboard.css:1411`) wins
   over the UA `[hidden] { display:none }`. Measured: `hidden = true`, computed `display: flex`.
   The ⋯ button toggles nothing visible. Same risk for every class that sets `display` without a
   `[hidden]` override (`.status-line` and `.banner` and `.toolbar` have one; `.instead-strip`,
   `.confirm-slot`, `.tidy-actions` do not). Fix: one global `[hidden] { display: none !important }`.
2. **Search icon overlaps the placeholder.** `.search input` (specificity 0,1,1, `:1183-1195`)
   and `input[type="search"]` (also 0,1,1, `:1855-1866`) tie, and the later rule resets padding
   to `12px 14px`. Measured `padding-left: 14px` instead of 38 px.
3. **The Settings icon reads as a sun.** The gear path (`index.html:50-53`) is a circle with 8
   straight rays. Next to a light theme it reads as "brightness". Combined with no label, this is
   the owner's "unfindable Settings".
4. **Banner stack outside the content column** (see 1.3).
5. **Delete-domain tables** are one `<table>` per category, each auto-sized, so the Count and
   Action columns jump between groups (Delete screenshot).

### 1.5 Accessibility (WCAG 2.2 AA)

Contrast was computed from the token values, composited over the real backgrounds
(`--glass` 80% white over `--canvas` ≈ `#fbfafc`; dark ≈ `#18181d`).

| Check | Value | Result | Fix |
|---|---|---|---|
| Body labels `--label-2/3/4` on glass and canvas | 5.4 to 15:1 light, 6.4 to 6.7:1 dark | Pass 1.4.3 | none |
| White on `--accent-solid` top stop `#8b7fd8` (Connect, Start cleanup, Apply plan) | **3.43:1** light, 2.9:1 dark | **Fail 1.4.3** (16 px semibold is not "large") | Gradient `#7466cc → #6456c0` (4.65 to 5.78:1) |
| Control boundary `--neutral-border` (16% ink) on glass: checkbox, select, input, switch off | **1.39:1** light, 1.43:1 dark | **Fail 1.4.11** (3:1 for component boundaries) | New `--control-border` 50% ink light (3.34:1), 36% white dark (3.33:1). Cards keep the hairline. |
| Focus ring `rgba(106,92,198,.75)` on canvas | **2.84:1** | **Fail 1.4.11** for the indicator | Opaque `#6a5cc6` (4.34:1 canvas, 5.1:1 glass); dark `#a99cf0` (8.3:1) |
| White tick on `.check:checked` `#a094e2` | 2.68:1 | Fail 1.4.11 (graphic) | Fill with `--accent` (5.3:1) |
| Native checkbox 16 × 16 (`:2211-2216`) with no padding: label tidy, time limits, Sort config, domain tables | 16 px | **Fail 2.5.8** unless spaced; tables put them 10 px apart | Wrap in a 28 px hit area, or use `.switch` / `.check` |
| Danger text on canvas | 4.97:1 | Pass | none |
| Disabled text | 1.7:1 | Exempt (1.4.3 excludes inactive) | Still pair with a reason text |

Keyboard and semantics:

- **Good:** the sidebar is a real ARIA tab list with roving tabindex and arrow keys
  (`dashboard.ts:202-264`); `.switch` has `role=switch`; nav counts get `aria-label` with meaning
  (`:287-296`); `prefers-reduced-motion` and `prefers-reduced-transparency` are both handled.
- **Missing:** no `aria-live` region for action results. Results are written into `.confirm-summary`
  spans that a rescan then destroys (4.1.3 Status messages). No toast at all.
- **Focus loss:** after any action the rescan rebuilds the list, so focus drops to `<body>`
  (`scanAndRender` hides and re-renders the containers, `dashboard.ts:524-528`). Fails the
  intent of 2.4.3 Focus order in practice.
- **Focus obscured (2.4.11, new in 2.2 AA):** the sticky header (56 px) and the sticky floating
  bar can cover a focused row when tabbing. Needs `scroll-padding-top: 64px` and
  `scroll-padding-bottom` equal to the bar height.
- **Tab pattern vs page pattern.** The 7-item IA has Settings and Activity as pages. **(Inference)**
  Switch the sidebar from `role=tablist` to a plain `nav` with `aria-current="page"`. Tabs imply
  one panel set; this is site navigation. The mockup does this.
- **Clickable rows** use `role=button` on a `div` that also contains buttons (`listRow.ts:110-125`).
  Nested interactive content confuses screen readers. Use a real "Open" chevron button instead
  (mockup does this).
- **Reduced motion** is a global `transition: none` (`:315-320`). That also kills useful state
  fades. **(Inference)** Prefer 1 ms durations (keeps `transitionend` events firing) and keep
  opacity changes.

---

## 2. Competitor reference

Only patterns relevant to Cluster's shell. Values are from primary docs where I could reach
them; apple.com HIG pages and linear.app reset my connections, so those rows rely on search
summaries and are marked.

| Product | Layout and sidebar | List-row anatomy | Background status and undo | Settings placement |
|---|---|---|---|---|
| **Gmail (Material 3)** | Left navigation with text labels; M3 navigation drawer max width **280 dp**, item icon 24 dp, active indicator a **full pill**, dividers between groups, one-line labels ([MDC Android NavigationDrawer.md](https://github.com/material-components/material-components-android/blob/master/docs/components/NavigationDrawer.md)) | M3 list item: **56 / 72 / 88 px** for one, two, three lines; leading avatar **40 px**; 16 px leading and trailing space; label Body Large, supporting text Body Medium ([material-web list tokens](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-comp-list.scss)) | Snackbar: "Only one snackbar will be shown at a time"; "up to one action button"; well suited to "undoing recent actions" ([MDC Snackbar.md](https://github.com/material-components/material-components-android/blob/master/docs/components/Snackbar.md)). Without an action it auto-dismisses after **4 to 10 s**; with an action it may stay until used (via search summary of [m2.material.io snackbars](https://m2.material.io/components/snackbars)). Gmail shows "Message sent" with Undo at the **bottom left**, undo window 5, 10, 20 or 30 s ([Gmail Help](https://support.google.com/mail/answer/2819488?hl=en&co=GENIE.Platform%3DDesktop), via search summary) | **Settings** at top right, opens a Quick settings panel with a **"See all settings"** link to a full page with tabs ([Gmail Help](https://support.google.com/mail/answer/6562?hl=en&co=GENIE.Platform%3DDesktop), via search summary) |
| **Apple Mail (macOS)** | Sidebar with Favorites, Smart Mailboxes, then per-account mailboxes; Favorites can also show as a bar ([Apple Support](https://support.apple.com/guide/mail/use-the-sidebar-or-favorites-bar-mlhl1178673f/mac), via search summary) | Not documented in prose. **(Inference from the product)** Sender bold, subject, one-line snippet, date top right | No toast; Edit > Undo and ⌘Z. **(Inference from the product)** | App menu > Settings window, the macOS standard. Liquid Glass "is best reserved for the navigation layer that floats above the content" and should be avoided in the content layer (WWDC25 "Meet Liquid Glass", [video](https://developer.apple.com/videos/play/wwdc2025/219/), via search summary) |
| **HEY** | Fixed top-level places by **kind of mail**: Imbox, The Feed, Paper Trail, Screener ([HEY features](https://www.hey.com/features/)) | Screener shows new senders for a yes/no decision. "HEY doesn't send anything back to the sender" ([The Screener](https://www.hey.com/features/the-screener/)) | Screener History lets you "screen them back in" (same page) | Top menu ("Me") **(Inference from the product)** |
| **Superhuman** | Split inbox tabs across the top, configured in Settings (via IA note) | Dense single-line rows **(Inference from the product)** | Undo: press **Z within 10 seconds**; the window cannot be extended ([Superhuman Help: Undo](https://help.superhuman.com/hc/en-us/articles/47278253460499-Undo), via search summary; direct fetch 403) | Settings page; split and label libraries live there (via IA note) |
| **Linear** | Dim, quiet sidebar so content leads: "the navigation sidebar was made dimmer"; sidebar, tabs, headers and panels adjusted "to reduce visual noise" and "increase the hierarchy and density" ([Linear: A calmer interface](https://linear.app/now/behind-the-latest-design-refresh) and [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui), both via search summary). Theme colours generated in LCH for even lightness (same source) | One-line rows with status, title, meta right-aligned **(Inference from the product)** | Toasts bottom right with Undo, ⌘Z **(Inference from the product)** | Settings is its own full-page area in the sidebar, reached from the workspace menu **(Inference from the product)** |
| **Clean Email** | Left navigation with Tools grouped; **History** under Tools lists "all cleaning actions… in the past 30 days, including automatic actions" ([History](https://clean.email/help/tools/history), via search summary) | Groups of senders with an action bar on selection (IA note) | **Quick Cancel** bar "appears briefly at the bottom of the page with a Cancel button" and a **five-second** timer ([Quick Cancel](https://clean.email/help/cleaning/canceling-accidental-action-with-quick-cancel), via search summary) | Left nav **(Inference from the product)** |
| **GitHub Primer** (dense-tool reference, from the 2026-09-18 visual research) | Flat canvas; saturated colour only for selected, destructive and confirm states ("MUST use for destructive action buttons like delete"); "xsmall/small for dense UIs" control sizes | Rows share one container; no per-row shadow | | |

What Cluster should take **(Inference)**:

1. **Labelled sidebar, ≤ 7 items, groups split by dividers, active state as a filled pill.**
   Cluster already has the pill. Make the sidebar quieter than content (Linear), not louder.
2. **One row anatomy at 64 px** for two-line rows (between M3's 56 and 72), 34 px tile, 16 px side
   padding. Today's rows run 72 to 100 px with 44 px buttons.
3. **One bottom toast at a time, one action, about 10 s** (Superhuman's fixed window; Material's
   upper bound). Bottom left, as Gmail does, so it never covers the bulk bar's primary action.
   The UX team asks for a stack of up to 3; the mockup stacks 3, newest at the bottom.
4. **History as a real place** (Clean Email's History, Gmail's All settings page). Cluster's
   Activity and Settings both become labelled nav items.
5. **Glass on the navigation layer only.** Header, popovers, side sheet, toast, bulk bar.
   Content lists become near-opaque surfaces without blur. This keeps the Apple glass identity
   where Apple itself puts it.

---

## 3. Proposed component system

Small on purpose. 15 parts. Names match the UX glossary.

### 3.1 Tokens

Keep every colour token name from `dashboard.css:11-213`. Changes:

| Token | Now | Proposed | Why |
|---|---|---|---|
| `--accent-solid` | `#8b7fd8 → #6f62c4` | `#7466cc → #6456c0` (both themes) | White text ≥ 4.65:1 |
| `--focus-ring` | 75% alpha | `#6a5cc6` light, `#a99cf0` dark, 2 px, offset 2 | 4.3:1 and 8.3:1 |
| `--control-border` | (new) | `rgba(24,22,48,.5)` light, `rgba(255,255,255,.36)` dark | 1.4.11 for form controls |
| `--inverse`, `--inverse-label`, `--inverse-action` | (new) | `#26262d / #f5f5f7 / #c9c0ff` light; `#f2f1f7 / #1b1b22 / #45389f` dark | Toast surface, 13:1 and 8.5:1 |
| `--skeleton`, `--skeleton-hi` | (new) | 7% and 13% ink | Skeleton blocks and shimmer |
| `--s-1…--s-12` | (new) | 4, 8, 12, 16, 20, 24, 32, 48 | Replace ~60 padding literals |
| Type scale | 13 sizes | 12 (meta, caps), 13 (sub, chip), 14 (body small, buttons), 15 (body, row title), 17 (lead on wide), 22 (section number), 30 (page title) | 7 sizes |
| Radii | 13 values | `--r-lg` 24 (sheet), `--r-list` 20 (cards, lists), `--r-ctl` 12 (inner panels), `--r-sm` 11 (buttons, selects), `--r-pill` | Drop 14, 13, 10, 9, 8, 4, 3 literals |
| Motion | literals `.18s`, `.22s` | `--dur-fast` 120 ms, `--dur` 180 ms, `--dur-slow` 260 ms, `--ease-out` `cubic-bezier(.2,.8,.2,1)` | One vocabulary |
| Glass | blur on 20 surfaces | blur only on header, popover, sheet, toast, bulk bar | Apple's navigation-layer rule; paint cost |
| Dark block | written twice | one source of truth | Maintenance |

Page title drops from 34 to 30 px and the lead from 17 to 15 px. **(Inference)** On a tool used
daily, the title is a label, not a headline. The mockup shows it still reads as Apple-like.

### 3.2 App shell

- **Header** (56 px, sticky, glass): brand · **status pill** · spacer · account pill · **Settings**
  button with gear icon **and text**. No Rescan, no Connect Outlook (both move to Settings).
- **Sidebar** (240 px, sticky, transparent on canvas, quieter than content): Today, Sorting,
  Senders, Clean up, divider, Security, divider, Activity, Settings, then the privacy note.
  Each item: 20 px emoji or icon, 15 px label, optional count right-aligned. Active: accent
  fill pill (existing). Counts are neutral text; only Security high-risk gets a filled red
  badge, because it is the one real danger signal.
- Below 860 px the sidebar becomes a horizontal strip (current behaviour, kept). Below 520 px the
  account pill hides; Settings keeps its label.

States: nav item default / hover (neutral fill) / focus (ring) / current (`aria-current="page"`).

### 3.3 Status pill (header)

Text plus a shape, never colour alone. Six states, copy from UX 4.2:

| State | Shape | Copy | Colour |
|---|---|---|---|
| Idle | ● filled dot | Up to date · checked 2 min ago | neutral |
| Checking | ◌ spinning ring | Checking for new mail… | neutral, accent ring |
| Indexing | ◌ spinning ring | Getting to know your inbox · 1,240 of 3,214 | neutral |
| Working | ◌ spinning ring | Moving 240 of 640 to Trash | neutral |
| Offline | ○ hollow dot | Offline · showing mail from 10:42 | neutral |
| Signed out | ◆ diamond | Gmail sign-in expired · Reconnect | danger fill (action needed) |

Click opens a popover (glass): last checked, next check, index size, Sorting runs, which
categories work with Chrome closed, "Check now", link to Settings > Sync. Below 860 px only the
short text shows. `aria-expanded` on the pill; the popover is a non-modal dialog closed by Esc.

### 3.4 Buttons (5 looks × 2 sizes)

| Look | Use | Rule |
|---|---|---|
| Primary (solid accent) | One per screen at most: the outcome button of a flow ("Move 852 to Trash" is danger instead) | Never in a row |
| Accent (tinted) | The one recommended action in a row or card | ≤ 1 per row |
| Neutral | Secondary actions | |
| Ghost | Tertiary, toolbars, Undo in lists | |
| Danger (tinted red) | Only the final confirm of Trash or Delete forever | Never as an entry point; the entry is neutral "Move 214 to Trash…" |

Sizes: **regular 34 px** (rows, toolbars) and **large 44 px** (first-run and confirm on touch).
Hit area stays ≥ 24 px everywhere (2.5.8). States: default, hover (+5% ink), pressed
(`scale(.98)`, < 100 ms), focus (ring), disabled (disabled-fg plus a reason nearby), **loading**
(12 px spinner + verb in -ing form, width locked so the row does not jump), **done** (brief
check, then the row updates).

### 3.5 Page header and section

- Page header: title 30/1.15 semibold, lead 15/1.5 `--label-3`, max 62ch, optional right-side
  primary action. 24 px gap to content.
- Section: 12 px uppercase label (`.05em`), optional meta count, optional right link. 8 px to
  its card. 24 px between sections.

### 3.6 List row (the one anatomy)

```
[check?] [tile 34] Title 15/590 ·············· [meta?] [one action] [›]
                   Sub 13/400 label-3, one line
```

- Grid: `auto | minmax(0,1fr) | auto | auto | auto`; min height 64 px; padding 10 / 16 px;
  separator 0.5 px between rows (not inset, so no per-call inset literals).
- Checkbox in a 28 px hit target. Tile: favicon or monogram (`senderTile.ts`, unchanged).
- **One** recommended action (accent) or none. Everything else lives in the side sheet behind ›.
  This retires the always-open Options strip.
- States: default · hover (`--row-hover`) · focus-within (ring on the focused control only) ·
  selected (checked box, no row tint) · **pending** (62% opacity, button shows spinner, other
  rows stay live) · **leaving** (slide 16 px right + fade, then height collapses, 260 ms) ·
  **entering** (fade down 4 px, 260 ms, for Undo) · **error** (row stays, one line under it in
  `--danger-text`: "Couldn't unsubscribe. Gmail didn't answer. Nothing changed." and the
  button becomes "Retry").
- When a row leaves, focus moves to the next row's action button, or the previous one if last.

### 3.7 Card

One card: glass, `--r-list` 20, 20/24 padding, `--shadow-card`. Used for Today groups, the
Screener switch, progress jobs and the confirm area. An **inset panel** (neutral fill, 12 radius,
no shadow) is the only nested surface. No card inside a card.

### 3.8 Notice (replaces the banner stack)

Same card with a leading tile, title, one line, one action. Tones: neutral, danger (security
only). Lives inside a screen, never above the screen title, never more than one per screen.
Onboarding becomes the first-run flow; label tidy and Athena move to Settings with at most one
dismissible Today card (UX 7.1 #9).

### 3.9 Toast with Undo

- Inverse surface (dark in light mode, light in dark mode), 14 px radius, min 320 / max 520 px,
  bottom left of the content column (left = sidebar + 24 px; full width minus 32 on mobile).
- Content: message, **one** action (Undo, Review, Retry, Also mute), dismiss ✕.
- **10 s** visible. Pauses on hover and on focus within (WCAG 2.2.1 Timing adjustable). A 2 px
  timer line runs along the bottom; hidden under reduced motion.
- Stack up to 3, newest nearest the bottom; a 4th removes the oldest. Automatic-run toasts are
  merged, at most 1 per minute (UX 4.2).
- Container is `role="status" aria-live="polite"`. The action is a real button reachable by Tab;
  **⌘/Ctrl+Z** triggers the newest Undo while the toast is visible (Superhuman uses Z).
- After the toast leaves, Undo stays available in Activity.

### 3.10 Inline progress

4 px bar, accent fill, in the card that started the job, with "240 of 640" text and a **Stop**
ghost button. Determinate whenever a total is known (Apple HIG: "When possible, use a
determinate progress indicator", [Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)).
`role="progressbar"` with `aria-valuenow`. The header pill mirrors it so the user can leave the
screen.

### 3.11 Skeleton rows

Same geometry as the real row (64 px, 34 px tile, two bars at 13 and 11 px, a 72 to 96 px button
block). 7% ink blocks with a 1.4 s shimmer; static under reduced motion. Containers get
`aria-busy="true"`; skeletons are `aria-hidden`. Show after 150 ms of waiting (not before, to
avoid a flash), keep for at least 300 ms once shown.

### 3.12 Empty state

Dashed outline, neutral fill, centred: title 16/590 and one sentence, optional one action. Copy
from UX 3.3, for example "No new senders. Everyone who wrote recently is someone you've emailed
or let in." Never a green "all clear" for Security.

### 3.13 Filter chips (and segmented)

Chips for filters that carry counts (Senders filters, Clean up "Find more"): 32 px, pill,
`aria-pressed`. Selected uses the accent fill. Segmented control only for 2 to 3 mutually
exclusive views without counts (Activity: All · By you · Automatic · Undone). Both 13 px.

### 3.14 Category row (Sorting)

```
[switch] 🔑 One-time codes       [1 hour     ▾] [Trash after 2 days ▾]    6   ○ Only while Chrome is open
         Sign-in and verification codes
```

- Columns: switch 48 · name 1.3fr (emoji label + one-line description) · "Stays in inbox for"
  select · "Then" select · "In inbox" count (right-aligned, tabular) · status pill.
- One header row with column labels on wide screens; below 1080 px each row wraps to three lines
  with small labels above the selects. 11 rows fit without horizontal scroll at 390 px (measured
  in the mockup: page width 390).
- Status pill: "● Works with Chrome closed" (Gmail filter), "○ Only while Chrome is open" (15-min
  check), "Off", or danger "Gmail filter failed · Retry". Shape differs, not only text colour.
- States: on, off (selects disabled, count shows –), **saving** (the changed control shows a
  small spinner after 300 ms), saved (toast), error (status pill turns danger, the user's choice
  stays visible).
- Saves on change with a toast and Undo (UX 3.3). No page-level Save.
- "Then" options include "Trash after N days". These are destructive automations, so the toast
  for choosing one says it plainly ("Promotions are moved to Trash after 30 days in the label").

### 3.15 Side sheet (sender)

- Right side, 420 px (full width on mobile), 8 px from the window edges, `--r-lg`, glass, scrim
  18% black. Enters with a 24 px slide and fade (260 ms).
- `role="dialog" aria-modal="true"`, focus moves to Close, Tab is trapped, Esc and scrim close it,
  focus returns to the row's › button.
- Sections (UX 3.3): header (tile, name, address) · stats line · **Future mail** radio list
  (Inbox · its category · 🔇 Muted) · **Unsubscribe** + verified pill · **Mail already here**
  (neutral "Move 214 to Trash…", "Keep newest 3…") with an **inline confirm** that names the
  count and uses the danger button · **Why we suggest this** · **Activity for this sender**.
- Each change applies on change with a toast. The sheet stays open.

### 3.16 Switch, checkbox, select

- Switch (on/off settings): 42 × 26, `--control-border` when off, accent when on, `role=switch`.
  Replaces the native checkboxes used as switches for Screener, time limits, auto-quarantine and
  each category.
- Checkbox (selection only): 20 px round, in a 28 px hit area.
- Select: 34 px, `--control-border`, custom chevron, opaque `--glass-solid` background.

### 3.17 Bulk bar

Sticky at the bottom of the screen when ≥ 1 row is selected. Glass. "2 selected" · Unsubscribe
(accent) · Mute · "Send to…" select · Clear. Appears with a 120 ms rise. Never shows disabled
buttons; it is absent when nothing is selected (today's bar shows 4 disabled buttons).

---

## 4. Reactivity spec

This turns the UX feedback contract (UX 4.1) into timings and visuals. Response-time limits from
NN/g: 0.1 s feels instant, 1 s keeps flow, 10 s needs an estimate
([Response times](https://www.nngroup.com/articles/response-times-3-important-limits/)).

### 4.1 Budgets

| Moment | Budget | What the user sees |
|---|---|---|
| Pointer down / key press | **< 100 ms** | Pressed state on the control |
| Optimistic local change | **< 100 ms** to start, **< 200 ms** for the DOM update | Row goes pending, or leaves, or the select shows its new value |
| Count updates (chip, nav count, section meta) | Same frame as the row change | Numbers change without a reload |
| Local re-render of a whole screen from the index | **< 200 ms** for 3,200 messages, **< 250 ms** for 10,000 | No skeleton needed |
| API round trip finishes | Any | Toast appears; row was already updated |
| Waiting > 150 ms with no local data | Show skeleton | |
| Job > 1 s | Inline progress in the card + header pill | |
| Job > 10 s | Add an estimate ("about 2 min") | |
| First paint of the dashboard | **< 300 ms** from the last-known index | Never a blank or "Loading your senders…" page |

### 4.2 Optimistic sequence (per reversible action)

1. **t = 0.** Button pressed. Row gets `pending`, button shows a spinner and "Muting…".
2. **t ≤ 100 ms.** If the change is local-only (category setting, dismiss), apply at once.
3. **API success.** Row plays `leaving` (260 ms) or updates in place. Counts update in the same
   frame. Focus moves to the next row. Toast: "Muted Groupon. Future mail goes to 🔇 Muted · Undo".
4. **Undo.** Reverse the change locally at once, row plays `entering`, a short toast confirms
   ("Unmuted Groupon"), Activity logs it.
5. **API failure.** Row leaves `pending`, stays in place, shows the inline error and "Retry".
   No toast for errors that belong to a visible row (the error sits where the action was). A
   toast only when the row is gone (for example the user switched screens).

Why optimistic only after API success for removals: Gmail filter creation can fail (quota,
permission), and a row that disappears and comes back reads as a bug. **(Inference)** For local
settings, apply first; for Gmail mutations, show pending first, then remove. The pending state
is the instant feedback.

### 4.3 Never blank the screen

- Remove the hide-on-scan behaviour (`dashboard.ts:524-528`). Render from the last-known data.
- During sync, only the pill changes. If a sync changes rows on screen, insert or remove them with
  the same enter and leave animations, and do not move focus.
- First run with no index yet: skeleton rows plus the indexing card (mockup "Mockup states →
  Show skeletons").

### 4.4 Motion and reduced motion

| Motion | Default | Reduced motion |
|---|---|---|
| Row leave | slide 16 px + fade + collapse, 260 ms | removed at once; toast still says what happened |
| Row enter | fade + 4 px drop, 260 ms | appears at once |
| Toast in / out | 8 px rise + fade, 260 / 180 ms | appear and disappear without movement |
| Toast timer line | 10 s linear | hidden; the text stays 10 s and still pauses on hover/focus |
| Skeleton shimmer | 1.4 s loop | static blocks |
| Status ring spin | 900 ms loop | static ring with a gap |
| Sheet | 24 px slide + fade | fade only (1 ms) |
| Switch knob | 180 ms | instant |

Implement reduced motion as 1 ms durations, not `none`, so JS that waits for `animationend`
still runs (the mockup does this).

### 4.5 Live regions

- One polite live region holds the toasts. Each toast's text is the announcement.
- Row pending text is not announced (too chatty). Row errors use `role="alert"` once.
- The status pill text is not live. **(Inference)** It changes every few minutes; announcing it
  would be noise. The popover is there on demand.

---

## 5. Screen layouts

Priority numbers come from UX 3.3. Wireframes are at 1440 px. The mockup builds the first three.

### 5.1 Shell

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ⬡ Cluster      (● Up to date · checked 2 min ago)        (SA) sam@…  [⚙ Settings] │ 56
├────────────────┬─────────────────────────────────────────────────────────────────┤
│ 🏠 Today        │  Page title                                       [primary?]    │
│ 🗂 Sorting      │  Lead, one sentence                                             │
│ 👤 Senders    3 │                                                                 │
│ 🧹 Clean up     │  SECTION LABEL                              link               │
│ ──────────     │  ┌──────────────────────────────────────────────────────────┐   │
│ 🛡 Security  (1)│  │ rows…                                                    │   │
│ ──────────     │  └──────────────────────────────────────────────────────────┘   │
│ 🕘 Activity   4 │                                                                 │
│ ⚙ Settings     │  [toast · Undo]  (bottom left)          [bulk bar, sticky]      │
│ privacy note   │                                                                 │
└────────────────┴─────────────────────────────────────────────────────────────────┘
  240 px            content max 1080 px, 32 px gutters
```

### 5.2 Today (budget ≤ 8 controls)

```
Today
What needs you, and what Cluster did while you were away.

1 ┌ ! 1 message looks like phishing · Says PayPal, sent from paypa1-secure.co [Review] ┐  (only if high risk)
2 WAITING FOR YOU  3 things
  ┌ 👤 3 new senders want into your inbox · Priya Raman, Figma…        [Review]  ┐
  │ 🧹 852 messages ready for Trash · 18 senders you never open…        [Review]  │
  └ N  Netflix renews in 3 days · $15.49 on 8 Oct                       [Got it]  ┘
3 WHILE YOU WERE AWAY                                            All activity
  ┌ 🗂 Sorting moved 38 messages out of your inbox        2 h ago      Undo   ┐
  │ ✋ Screener held 2 new senders                          5 h ago      Review │
  └ 📭 Unsubscribed from 4 lists                            Yesterday    View   ┘
4 (your last 3 actions, same rows, Undo)
5 Inbox: 214 messages, 61 unread. 38 fewer than last Monday.
```

Max 4 "Waiting" rows. The health score card and 12-week chart go; the summary line replaces
them. First run: the indexing card and the "Pick a starting point" card sit at position 2.

### 5.3 Sorting (3 controls per category + 2)

```
Sorting
Where each kind of mail goes, and how long it stays in your inbox. Changes save as you make them.

┌ ON  CATEGORY                 STAYS IN INBOX FOR   THEN                  IN INBOX  STATUS ┐
│ (●) 🔑 One-time codes        [1 hour       ▾]    [Trash after 2 days▾]       6   ○ Only while Chrome is open │
│ (●) 🧾 Receipts              [Stays in inbox▾]   [Keep             ▾]      14   ○ Only while Chrome is open │
│ (●) 📦 Orders & shipping     [1 day        ▾]    [Keep             ▾]       9   ○ Only while Chrome is open │
│ (●) 📰 Newsletters           [Leaves at once▾]   [Keep             ▾]       0   ● Works with Chrome closed  │
│ …  💬 Social · 🏷 Promotions · 🛍 Shopping · 🧳 Travel · 💳 Finance · 💼 Work                                │
└ ( ) 🎓 Education             [disabled      ]    [disabled         ]       –   Off                        ┘
[Sort mail already in my inbox…]   Last checked 4 min ago · moved 12 · Undo
  └ while running: card with "Sorting 120 of 214" bar and Stop
› Custom rules (2)      (collapsed; composer and list inside)
```

Empty (nothing set up): a card with three presets (Calm inbox, Just label things, I'll set it
myself) above a disabled list.

### 5.4 Senders (2 controls per row + sheet)

```
Senders
Decide once what you want from a sender. Unsubscribe asks them to stop. Mute hides them even if they don't.

┌ ✋ Hold mail from new senders (Screener)                               (●) ┐
└   Mail from people you've never written to waits here until you let them in. ┘
[🔍 Search senders                                                          ]
(New senders 3) (Needs a decision 6) (Newsletters 5) (Never opened 4) (Muted) (All 12)
┌ ○ [G] Groupon       214 messages · 0% opened · deals@…   🛍 Shopping  [Unsubscribe] › ┐
│ ○ [M] Medium Daily  88 messages · 4% opened · noreply@…  📰 Newsletters [Unsubscribe] › │
│ ○ [D] Duolingo      61 messages · 0% opened · hello@…    🏷 Promotions  [Mute]        › │
└ …                                                                                      ┘
╔ 2 selected                       [Unsubscribe] [Mute] [Send to… ▾]  Clear ╗   (sticky)

                                           ┌ side sheet, 420 px ───────────┐
                                           │ [G] Groupon  deals@r.groupon… ✕│
                                           │ 214 messages · 0% opened       │
                                           │ FUTURE MAIL  ( ) Inbox          │
                                           │              (•) 🛍 Shopping    │
                                           │              ( ) 🔇 Muted       │
                                           │ UNSUBSCRIBE [Unsubscribe] ✓ verified │
                                           │ MAIL ALREADY HERE [Move 214 to Trash…] [Keep newest 3…] │
                                           │ WHY WE SUGGEST THIS • …         │
                                           │ ACTIVITY FOR THIS SENDER        │
                                           └────────────────────────────────┘
```

The "New senders" chip is first and selected by default when it has a count (UX C4). Its row
action is **Let in**; Mute is in the sheet.

### 5.5 Clean up (1 control per suggestion + 1 outcome button + 4 filters)

```
Clean up
Everything here moves to Trash. Gmail keeps Trash for 30 days.

SUGGESTED
┌ [✓] 🙈 18 senders you never open · 640 messages        [Review ›] ┐
│ [✓] ⌛ 212 expired codes and old newsletters             [Review ›] │
└ [ ] 🚫 6 senders on a spam list · 40 messages            [Review ›] ┘
                                              [ Move 852 to Trash… ]   ← neutral entry
   └ inline confirm: "Move 852 messages to Trash? Starred and protected mail is skipped."
                     [Move 852 to Trash] (danger)  [Cancel]
   └ running: "Moving 240 of 852" bar · Stop
FIND MORE   (Older than 1 year) (Larger than 2 MB) (Promotions) (By website)
   └ selected filter shows a list of the same rows with checkboxes and the same outcome button
```

"Review ›" opens the group in a side sheet using the same row anatomy, not a hidden legacy
section. "By website" replaces the per-category tables with one list (domain tile, count,
protected count, checkbox), so columns align.

### 5.6 Security (≤ 3 controls per finding)

```
Security
Suspicious mail, kept apart from tidying. A prompt to look, not a verdict.

┌ ! Says it's from PayPal · Actually sent from paypa1-secure.co     High risk ┐
│   Why: the display name matches a contact, the domain is 3 days old,        │
│        and it failed sender checks.                                         │
│   Subjects: "Your account is limited", "Confirm your details"               │
│   › Details (SPF fail · DKIM none · DMARC fail · lookalike of paypal.com)    │
└                                          [It's genuine]   [Block] (danger) ┘
AUTO-QUARANTINE  (●) Move high-risk mail out of the inbox in the background
QUARANTINED, WAITING FOR YOU   rows: sender · count · [Release] [Keep blocked]
A prompt to look, not a verdict. Cluster reads headers, never message bodies.
```

The two-column comparison grid (`.compare-cell`) stays for "Says / Actually". Red is used for
the risk tile, the "High risk" pill and the Block confirm only.

### 5.7 Activity

```
Activity                         [All | By you | Automatic | Undone]
TODAY
┌ You     Muted Groupon · 214 messages                 10:41   Undo ┐
│ Sorting Moved 12 codes out of your inbox              10:30   Undo │
│ You     Unsubscribed from The Verge                   09:58   Can't be undone · Mute instead │
└ …                                                                  ┘
YESTERDAY …
```

### 5.8 Settings (full page)

```
Settings
Things you set once. Every change applies right away.
ACCOUNTS       Gmail sam@… · [Connect Outlook] · Sign out
SYNC           Index mail from the last [6 months ▾] · Up to date, 3,214 messages · [Rebuild index]
APPEARANCE     Theme [System | Light | Dark]
DELETING       (switch) Delete forever instead of Trash   ⚠ can't be undone · needs a permission
SMART FEATURES (switch) On-device classify   (switch) Digest
MAINTENANCE    Tidy up Cluster's labels (1 to rename)  [Review]
ORGANISATION   Athena (managed installs only)
ABOUT          What Cluster reads, and what it never does
```

One section per card, the row anatomy with a trailing control. A left in-page index is not
needed at 8 sections.

---

## 6. Mockup notes (`mockup.html`)

- Single file, no external requests, system font stack (Inter listed as a fallback only), tokens
  copied from `dashboard.css:11-213` with the section 3.1 changes marked `NEW` / `CHANGED`.
- Light and dark from `prefers-color-scheme`; the reviewer panel can force either.
- Working: nav with deep links (`#senders?filter=new`), status pill and popover, Sorting switches
  and selects with toasts and Undo, "Sort mail already in my inbox…" with inline progress and
  Stop, Senders filters with live counts, search, selection with the bulk bar, row actions with
  pending → leave → toast → Undo → re-enter, the sender sheet with focus trap and the inline Trash
  confirm, skeletons, a row error with Retry, and the 6 status states.
- Checked in headless Chrome at 1440 × 900 (light and dark) and 390 × 844: no horizontal scroll at
  390 px. Emoji render as monochrome glyphs in headless Chrome on Windows; real Chrome shows
  colour emoji.
- Clean up, Security and Activity are shown as the empty-state component pointing to section 5.

---

## 7. Hand-offs and open questions

### 7.1 To the software team: what the UI needs

These line up with UX 7.2. The UI cannot be reactive without items 1 to 4.

1. **Action events.** Every action emits `{ id, kind, target, phase: "pending" | "done" |
   "failed", count, summary, undo?: payload | { reason } }`. Rows subscribe by target; the toast
   and Activity subscribe to all. `summary` is final user copy.
2. **No `rescan()` after actions** and no hiding of `senderGroupsEl`, `domainSectionEl`,
   `expirySectionEl` (`dashboard.ts:524-528`). Re-render only the affected rows from local state.
3. **Sync status store** read by the pill: `{ state: idle | checking | indexing | working |
   offline | signedOut, lastSyncAt, nextCheckAt, progress?: { done, total, label }, indexSize,
   categoriesClosedOk: n, categoriesOpenOnly: n }`. Emit on change; the pill is a pure view.
4. **Stable row keys** (`sender.key`, category `bucket`) so a re-render can diff instead of
   replacing `innerHTML`, which is what keeps focus and allows enter/leave animations.
5. **Counts as derived state**: per filter chip, per nav item, per category "in inbox now". The
   UI updates them in the same frame as the row.
6. **Per-category filter status**: `"closedOk" | "openOnly" | "off" | "error"` with an error
   message for the Retry pill.
7. **Deep links**: `#senders?filter=new`, `#security?risk=high`, `#cleanup?group=never`,
   `#activity?source=sorting`. The mockup already parses the first form.
8. **Focus handoff helper**: after a row leaves, the list returns the next focus target.
9. **CSS hygiene** (can ship before the redesign): global `[hidden] { display:none !important }`,
   fix the `.search input` specificity tie, move the 53 inline `style.*` writes in
   `dashboard.ts` and the 22 in `screenerTab.ts` into classes, merge the duplicate dark block.
10. **Token fixes** from 3.1 (accent-solid, focus ring, control border). Small, isolated, and
    they clear the four AA failures.
11. **Keyboard**: Ctrl/⌘+Z for the newest toast's Undo; Esc closes sheet and popover;
    `scroll-padding` for the sticky header and bulk bar.

### 7.2 To the UX team

- Toast duration: we propose 10 s with pause on hover and focus; UX says "about 10 s". Agreed.
- The UX report puts Activity and Settings as nav items (C2, C3). The mockup does this and keeps
  a labelled Settings button in the header too.
- Copy in the mockup follows the glossary ("Leaves at once", "Let in", "Move to Trash",
  "Activity", "Sorting"). Please review the "Then" option wording ("Trash after 2 days").

### 7.3 Open questions (for the manager)

1. **Accent purple: keep or neutralise?** The owner's rule is a neutral palette, and the current
   identity uses purple for selection and primary. We kept it for selected and primary states
   only. A neutral (graphite) primary is an easy token swap if wanted.
2. **Ambient gradient.** The 2026-09-18 research recommends removing it. We kept it, because it is
   part of the liked v3 look, and removed blur from lists instead. Decide whether to go further.
3. **Page title size** 34 → 30 px. Small, but visible. OK?
4. **Optimistic removal timing**: remove after API success (our default) or immediately with
   rollback? Immediate feels faster but can "bounce back" on Gmail errors.
5. **Toast position**: bottom left (Gmail) or bottom centre (M3 default on wide screens)? We chose
   left so it does not cover the bulk bar's primary action on the right.
6. **Sorting "Then: Trash after N days"** (also UX open question). It puts a destructive
   automation in a settings row. We show it with plain wording in the toast; confirm the owner
   wants it there.
7. **Sidebar emoji vs line icons.** The mockup uses emoji (matching the IA note and the label
   names). The current build uses 17 px line icons. Emoji carry the identity but render
   differently per OS; line icons are steadier. Pick one.

## Sources

- Material: [MDC Android Snackbar.md](https://github.com/material-components/material-components-android/blob/master/docs/components/Snackbar.md),
  [NavigationDrawer.md](https://github.com/material-components/material-components-android/blob/master/docs/components/NavigationDrawer.md),
  [List.md](https://github.com/material-components/material-components-android/blob/master/docs/components/List.md),
  [material-web list tokens](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-comp-list.scss),
  [M2 snackbars](https://m2.material.io/components/snackbars) (via search summary; m3.material.io
  pages render client-side and returned no text).
- Gmail Help: [Change your Gmail settings](https://support.google.com/mail/answer/6562?hl=en&co=GENIE.Platform%3DDesktop),
  [Send or unsend Gmail messages](https://support.google.com/mail/answer/2819488?hl=en&co=GENIE.Platform%3DDesktop) (both via search summary).
- Apple: [HIG Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) (read via the HIG JSON endpoint),
  [WWDC25 Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) (via search summary),
  [Mail sidebar](https://support.apple.com/guide/mail/use-the-sidebar-or-favorites-bar-mlhl1178673f/mac) (via search summary).
  HIG Sidebars and Materials pages: **not reached** (connection reset).
- HEY: [Features](https://www.hey.com/features/), [The Screener](https://www.hey.com/features/the-screener/).
- Superhuman: [Undo](https://help.superhuman.com/hc/en-us/articles/47278253460499-Undo) (403 on fetch; via search summary).
- Linear: [A calmer interface](https://linear.app/now/behind-the-latest-design-refresh),
  [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) (both via search summary).
- Clean Email: [Quick Cancel](https://clean.email/help/cleaning/canceling-accidental-action-with-quick-cancel),
  [History](https://clean.email/help/tools/history) (both via search summary; direct fetch blocked).
- NN/g: [Response times](https://www.nngroup.com/articles/response-times-3-important-limits/) (cited in UX report).
- WCAG 2.2: success criteria 1.4.3, 1.4.11, 2.2.1, 2.4.3, 2.4.7, 2.4.11, 2.5.8, 4.1.3
  ([w3.org/TR/WCAG22](https://www.w3.org/TR/WCAG22/)).
- Earlier repo research: `research/2026-09-18-dashboard-visual-design.md` (Primer, Plausible,
  Linear, NN/g glassmorphism), `research/2026-10-05-sync-and-ui-architecture.md`.

---

## v2 changes (after the manager's review)

_Applies `decision-record.md` section 6 (M1 to M9) and the decisions in 2.2 and 3.2. The new file
is `mockup-v2.html`; `mockup.html` (v1) is unchanged for comparison. M10 (Clean up, Security and
Activity) is scheduled for a later round, so those screens still show the empty-state card._

| # | Change | Where in v2 |
|---|---|---|
| M1 | Sorting defaults now match the agreed plan. Codes 1 day. Receipts 7 days. Orders & shipping 7 days. Newsletters 3 days. Social 2 days. Promotions 1 day. Shopping 3 days. Travel, Finance, Work and Education stay in the inbox. Education is now on by default. | Sorting rows |
| M2 | Every "Then" starts at **Keep**. No row moves anything to Trash by default. | Sorting rows, page lead |
| M3 | A "Then" select appears only on One-time codes, Newsletters, Social and Promotions. The other 7 rows show "Keep" as plain text. Picking a Trash option opens an inline confirm under the row: "Move Social to Trash 30 days after they leave your inbox? Starred and protected mail is skipped. Gmail keeps Trash for 30 days." The buttons are a danger button ("Move to Trash after 30 days") and "Keep instead", which puts the select back. Confirming shows a toast with Undo. | Sorting |
| M4 | "Leaves at once" is only in the Promotions select. All other selects start at "1 hour". | Sorting |
| M5 | The status pill follows one rule: labelling is a Gmail filter, so it always works with Chrome closed. A timed move needs Chrome open. "Stays in inbox" and "Leaves at once" show "Works with Chrome closed". Any time limit shows "Moves out only while Chrome is open". The status popover says the same in one sentence. | Sorting, header popover |
| M6 | Row actions are neutral. This covers "Review" on Today, "Let in", "Unsubscribe" and "Mute" in sender rows, "Unsubscribe" in the bulk bar and the sheet, and "Sort mail already in my inbox…". Purple is left for the current nav item, selected chips, switches that are on, checked boxes, progress bars and the Trash-option focus. The v2 page has no accent buttons at all (measured: 0). The red "Review" on the phishing card stays, because high-risk Security is one of the two red uses. | All screens |
| M7 | The sidebar uses the current build's 17 px line icons (home, layers, trash, shield, clock) plus a matching person and gear. Emoji stay only in category and label names. | Sidebar |
| M8 | Copy trims. "Gmail filter failed · Retry" is now a danger pill plus a real Retry button. "Last checked 4 min ago · moved 12 · Undo" is now a sentence plus an Undo button. Settings sub-lines are sentences. "·" stays only in meta lines such as "214 messages · 0% opened". | Sorting, Today, Settings |
| M9 | New mockup state "Empty: preset card" with three presets: Calm inbox (recommended), Just label things, and I'll set it up myself. The card says "None of these moves anything to Trash." Picking one hides the card and shows a toast. | Mockup states → Sorting |
| Owner Q-B | History depth is **all mail**. The status pill has a one-time state, "Reading your mail… 4,180 of 18,412". The first-run card says "This happens once and takes about 40 minutes. You can use Cluster while it runs." The popover shows "All mail, 18,412 messages", and Settings → Sync says "Cluster reads all your mail." Message counts and the 40-minute estimate are illustrative. | Status pill, Today skeleton state, Settings |
| Owner Q-C | Gmail-first. Settings → Accounts says "You can add Outlook here." There is no Outlook button in the header. | Settings |
| C-8 | Toasts stay bottom left, up to 3, newest at the bottom. This is unchanged from v1. | Global |
| C-2 | Rows show a pending state at once and leave only after success. This is unchanged from v1. The "Row error" state shows the rollback with Retry. | Senders |

New reviewer controls in "Mockup states": "Reading all mail" (status pill), "Empty: preset card"
and "Filter failed" (it turns the Shopping row's status into the error pill with Retry).

Checked in headless Chrome at 1440 × 900 in light and dark and at 390 × 844 (no horizontal
scroll). On wide screens the Sorting status column now wraps the longer "Moves out only while
Chrome is open" pill onto two lines, rather than clipping it.

Changes to the component spec from v2:

- 3.4 Buttons: the row's recommended action uses the **neutral** look, not accent (C-4).
- 3.14 Category row: the "Then" cell is a select on 4 categories and fixed "Keep" text on the
  rest. A Trash choice always opens the inline confirm. The status rule is the one in M5.
- 3.2 Shell: line icons, not emoji, in the sidebar (C-9).
