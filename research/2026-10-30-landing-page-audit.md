# Landing page audit, 2026-10-30

Cluster's page (site/cluster/, commit ee7b930) against eleven mail products and
Unbounce's "40 best landing pages". The user's read: it overexplains.

## What was measured

Rendered at 1440 px in headless Chrome. Words = visible body text.

| Page | Headline | Words | Sections (h2) | Hero visual |
| --- | --- | ---: | ---: | --- |
| Cluster | Your inbox, finally quiet. | 298 | 6 | Full dashboard screenshot |
| Moat | Ads gone. Privacy kept. | 683 | 9 | Film, then drag before/after |
| Spark | Smart. Focused. Email. | 797 | 12 | One product shot, award row |
| Superhuman | Superpowers, everywhere you work | 623 | 16 | Product with a live cursor, 5 videos |
| HEY | We finally fixed your email + calendar! | 1,146 | 2 | "See how HEY works" video |
| Clean Email | Clean your inbox of emails you don't need. Then keep it clean. | 1,716 | 5 | Floating UI pieces, not a screen |
| SaneBox | Eliminate "Inbox Clutter" with SaneBox AI | 958 | 8 | Three checkmark lines |
| Shortwave | Automate your email with AI | 1,067 | 24 | A prompt box, then small flow diagrams |
| Gmail | AI-powered email for everyone | 566 | 8 | Product pieces around the headline |
| Outlook | Your inbox, organized. Your day, planned. | 1,688 | 22 | Devices photo |
| Mailchimp | Turn ideas into emails & SMS that connect | 1,039 | 24 | Product collage |

Cleanfox and Unroll.me only showed cookie walls headless and are left out.

## The finding: it's not length, it's repetition

Cluster has the fewest words of any page. It still reads as overexplained
because each section says the same thing three times:

1. A headline that already makes the point ("Fake PayPal. Caught.").
2. A two or three sentence paragraph that says it again.
3. A full dashboard screenshot, sidebar and Details panel included, that the
   reader has to study to find the same point a third time.

The worst case is Sort. The four group names appear in the paragraph, again in
a list under it, and a third time in the screenshot.

The pages that feel light do the opposite. They make one claim per section and
show only the piece of the product that proves it:

- **Clean Email** never shows its whole app. It floats small cards: "Rideshare
  Receipts → Clean", "Mom → Family", "New Unwanted Sender → Block". Each card
  is one action, readable at a glance.
- **Shortwave** draws a tiny diagram per feature: mail flowing into To-do,
  Archive and Trash with counts.
- **Spark and HEY** use three to five word headlines, one short line, then the
  product. HEY moves all the explaining into a video.
- **Gmail** writes its privacy section as single lines with no body text.
- **Unbounce** names the same rules across all 40 examples: one goal, a strong
  headline, social proof, and no distractions from the call to action. Calm
  is praised for "short n' sweet" copy. Netflix moves detail into a drop-down
  FAQ so the page stays simple and the answers are still there.

## Where Cluster's page falls short

| # | Problem | Where | Fix |
| --- | --- | --- | --- |
| 1 | Paragraph restates the headline | Every section | One line of 12 words or less, or none |
| 2 | Full dashboard screenshots | Clean up, Sort, Protect | Crop to the one card that proves the point, shown large |
| 3 | Sort names the four groups three times | Sort | Keep only the cropped group list |
| 4 | Statement paragraph restates the hero | Under the hero | Remove it |
| 5 | Privacy tiles explain each claim | Private by design | Headlines only; details move to an FAQ |
| 6 | No proof of trust near the button | Hero | One line under the button: "Free. No account. Open source." (Moat does this) |
| 7 | Nothing moves | Hero | A before/after drag of a messy inbox, like Moat's, or the film |
| 8 | No place for the details people do ask | End of page | Short FAQ, closed by default |
| 9 | "Get Cluster" leads to GitHub | Every button | Fine until there is a Chrome Web Store listing, then "Add to Chrome" |

Social proof (reviews, user counts, press) is what every competitor leans on,
and Cluster has none yet. It should not be faked. "Open source" and, later,
the store rating are the honest versions.

## Proposed page, about 120 words before the FAQ

- **Hero.** "Your inbox, finally quiet." / "Cluster clears, sorts and guards
  your Gmail." / Add to Chrome / "Free. No account. Open source." / drag
  before and after on a messy inbox.
- **Clean up.** "Clear years of mail." / "Pick a sender. Trash it all." / the
  Never opened card, large, with its Trash button.
- **Sort.** "Everything in its place." / the four group rows with their keep
  times. No paragraph.
- **Protect** (black). "Fake PayPal. Caught." / "Flagged before you open it." /
  the three Doesn't match rows.
- **Kai.** "Meet Kai." / "Ask him anything about your inbox."
- **Private by design.** Four headlines, no body: Runs in your browser. Reads
  the envelope, not the letter. No account. Nothing deleted for good.
- **FAQ, closed.** Does Cluster read my email? What does it do with my Gmail
  sign-in? Can I undo? Does it work when Chrome is closed? Is it free?
- **End.** "Calm your inbox." / Add to Chrome.

Characters, when they come, replace explanation rather than add to it: one
troublemaker per section, standing where the paragraph used to be.
