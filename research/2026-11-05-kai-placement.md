# Where Kai should live

Date: 2026-11-05. Asked for after Overview round 12 (no Details pane on Overview).

## What the big products do

| Product | Where the assistant opens from | What it opens |
|---|---|---|
| Gmail (Gemini) | "Ask Gemini" sparkle, top right, beside the profile picture [1] | Panel on the right side of the page |
| Stripe Dashboard | The help icon in the top bar [2] | A drawer on the right |
| Outlook (Copilot) | Button at the top right, at the end of the ribbon row; Microsoft is moving it next to the ribbon [3] | Side pane on the right |

All three put the button in the top bar, on the right, and open a panel on the right. None of them floats a bubble over the page.

## What the design guidance says

- A side panel has room for a long back-and-forth. A floating widget is easy to see but sits over content [4].
- A panel that is always open takes about a fifth of the page from every screen. A small button that opens it is the middle ground [5].
- An overlay that only opens with a keyboard shortcut stays hidden unless someone teaches the shortcut [5].
- These are vendor and design blogs, not controlled studies. No published usability study comparing placements turned up.

## What Cluster already learned

- You rejected Kai at the foot of the sidebar and bottom right over Details (2026-10-27).
- Kai floating over text while Details was open was a bug fixed today.

## Recommendation

1. **Button:** Kai's face as an icon in the top bar, in the slot the "?" icon uses now, beside Details. Same place as Gemini and Stripe.
2. **Panel:** it opens a right-hand panel the same width as Details (360 px) and takes Details' slot. Details and Kai never show at once; opening one closes the other.
3. **Overview:** there is no pane on Overview, so Kai's panel slides in over the right edge and closes with Esc or ×.
4. **Shortcut:** Ctrl+K (⌘K on Mac) opens the same panel. It's a shortcut, not the only way in.
5. **No floating bubble** anywhere, and no Kai in the sidebar.

## Sources

1. 9to5Google, "Gemini side panel in Workspace": https://9to5google.com/2024/06/24/gemini-side-panel-workspace/ ; Mailmeteor, "Gemini in Gmail": https://mailmeteor.com/blog/gemini-in-gmail
2. Stripe Docs, "Dashboard assistant": https://edge-docs.stripe.com/assistant
3. Microsoft Message Center MC1441784: https://m365admin.handsontek.net/microsoft-copilot-outlook-new-copilot-entry-point-classic-outlook/ ; Microsoft known issue: https://support.microsoft.com/en-US/Support/known-issues/copilot-buttons-gone-classic-outlook-windows
4. LogRocket, "Where should AI go in your UI": https://blog.logrocket.com/where-should-ai-go-in-your-ui-a-ux-guide-to-ai-feature-placement
5. Composite, "When sidebar AI beats spotlight overlays": https://composite.com/blog/sidebar-beats-spotlight-ai-pattern
