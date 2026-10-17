# Suggestions, sorting and filtering on the mail index

Date: 2026-10-16. Follows `research/reports/Cluster sender algorithm deep dive.md` (ranks 4, 5, 7 and 8) and the mail index on `feat/mail-index`.

## Where we are

The mail index now holds up to 20,000 messages per account, with labels, read state, relationship headers, the Sent folder and a per-sender census. The code that suggests, sorts and filters was written before any of that existed. It still works from one scan's worth of mail, so it ignores most of what we now know.

| Surface | What it does today | What goes wrong |
|---|---|---|
| Never-opened suggestions (`engagementModel.ts`) | Compares unread ratios across dashboard opens, saved as an EMA in settings. Needs 2 or more "changed snapshots" | Shows nothing on the first open, which is exactly when the user wants it. The reason text ("rolling unread pattern across 3 changed snapshots") means nothing to a person. A sender that stopped mailing still gets "Unsubscribe" |
| "You never open these" (`neverRead.ts`) | Every non-protected message unread, 3 or more | One opened message out of 200 hides the sender. Mail that arrived an hour ago counts as "not opened" |
| Senders worth a decision (`pickDecisionSenders`) | Unread share times log volume, top 8 | Doesn't know who you write to, who is still sending, or how recently you last opened one |
| Suggested spam (`spamSuggestions.ts`) | Domain on a block or spam list | Fine as is. Out of scope |
| Senders screen | Filters: All, Never opened, Subscriptions, Muted. One sort: most mail | No way to see people versus companies, unread first, newest, or senders that went quiet |
| Sort my inbox (`autoSort.ts`, `sortTaxonomy.ts`) | Per message: subject kind first, then sender domain category | One subject keyword flips a message to another bucket. Gmail's own categories and List-Id are ignored. Two messages from one sender can land in two buckets |
| Smart views (`smartViews.ts`) | Five fixed predicates over scanned messages | Fine. They can run over the index for free |

## The one missing piece: a sender profile

Everything above re-derives "what is this sender to me" from scratch, each in its own way. Build it once, from the index, as a pure function. No new storage is needed, since the index already holds every input.

`senderProfiles(rows, sent, census, now)` → one `SenderProfile` per provider and address:

| Field | From |
|---|---|
| `received`, `unread`, `starred`, `important` | Index rows, then census totals when larger |
| `openRate` | Read share of mail **older than 3 days**, so new mail isn't counted as ignored |
| `lastOpenedAt` | Newest read message (a good stand-in for "last time you cared") |
| `firstSeenAt`, `lastSeenAt`, `perMonth` | Received times |
| `stillSending` | Last message within 2 times their usual gap, or within 30 days |
| `youWrote`, `lastWroteAt`, `replied` | Sent store (To/Cc), and In-Reply-To matching their Message-IDs |
| `kind` | Per-sender vote, below |
| `bulk` | List-Id, List-Unsubscribe, Precedence, Auto-Submitted, Gmail category |

### Kind, decided per sender, not per message

Every message votes, and the sender gets the winning kind when it wins 70% or more of the votes. Otherwise the sender is "mixed", and only then do we fall back to the per-message subject kind. That stops the single-keyword flip and follows Yahoo's per-sender cascade.

Vote strength, strongest first: a reply to your own mail (person), Gmail's CATEGORY_PERSONAL or IMPORTANT with no bulk headers (person), List-Id or one-click unsubscribe (list), Gmail Promotions (promotion), Gmail Updates plus a receipt, shipping or code subject (that record kind), Social (social), Forums (list). The domain category stays as a tie-break.

### Who matters

`matters` is a tier, not a hidden number:

| Tier | Rule | Effect |
|---|---|---|
| Close | You wrote to them 3 or more times, at least once in the last year | Never suggested for clean-up. Sorted first under "People" |
| Known | You ever wrote to them, or you starred their mail, or the protection rules mark them | Never suggested for clean-up |
| Regular | Machine sender you open 40% or more of the time | Leave alone. Offer "Keep sorted" only |
| Ignored | Machine sender, 5 or more messages, opened under 10%, nothing starred | Suggestion candidate |
| New | First seen under 14 days ago | Never suggested yet |

Starting thresholds are guesses. They get tuned against real inboxes in shadow mode before they drive anything.

## Suggestions v2

One function, `suggestFor(profile)`, returns at most one action per sender with the reasons and the numbers behind them. It works from the first open, because the history is already in the index.

| Suggestion | When | Reason text (real numbers) |
|---|---|---|
| Unsubscribe | Ignored, still sending, unsubscribe link present | "You opened 2 of their last 140. They send about 12 a month." |
| Mute | Ignored, still sending, no unsubscribe link (or a mailto link only) | "No working unsubscribe. You haven't opened one since March." |
| Clear out old mail | Ignored and stopped sending | "Stopped sending in June. 310 messages left, none opened." |
| Keep sorted | Regular, bulk, lands in the inbox | "You read these, but they fill your inbox. 30 a month." |
| Delete codes | One-time codes older than 2 days | "48 old sign-in codes." |

The order is mail saved per action, so the biggest win comes first. The cap stays at 8 on Home.

Safety rules carry over unchanged:

- Actions use read, protected-checked messages only, never census ids.
- A dismissed suggestion stays hidden for 30 days.
- An undo counts heavily against the sender.

`senderEngagement` drops to feedback only (accepted, dismissed, undone, snoozedUntil), and the snapshot EMA goes. That also shrinks the settings blob.

## Sorting and filtering the Senders screen

**Filters** (one row of chips, combinable with search):

- All
- People
- Companies
- Subscriptions
- Never opened
- Gone quiet
- Muted

**Sort** (one small menu):

| Option | Order |
|---|---|
| Most mail | The default, as today |
| Most unread | Highest unread count first |
| Newest | Most recent message first |
| Least opened | Lowest open rate first, with ties broken by volume |
| People first | Close, then Known, then the rest by volume |

Each row also gets one quiet line from the profile, such as "Opens 4% · 12 a month · still sending". The line is plain, with no badges.

## Sort my inbox on the sender kind

`buildSortPlan` asks the profile for the sender's kind first, and uses the per-message subject kind only for "mixed" senders. This is the same change as the Kind section above, applied where it is most visible. The bucket set and the Gmail filters stay as they are.

## Build order

1. `senderProfile.ts`: profiles, kind votes and tiers from the index, pure and tested. Shadow mode: log how often v2 disagrees with today's suggestions.
2. Suggestions v2 on Home and in the clean-up plan, replacing `buildEngagementSuggestions` and `neverReadSenders`. Feedback-only `senderEngagement`, with a migration.
3. Senders screen: the new filters, a sort menu and the profile line.
4. Sort my inbox on the per-sender kind.
5. Later, from the deep dive: the Important strip (rank 5) and the impostor checks keyed on tiers (rank 6).

## Risks

- **Read state is weak on Outlook preview.** A preview pane can mark mail read without the user really reading it. Open rate on Outlook may run high, so we lean on "Ignored" only when the signal is clearly low.
- **Census senders have no read rows.** The open rate comes from read rows only. A sender is suggested only when we have read 5 or more of their messages.
- **Dashboard bundle is at 495/500 KB.** `senderProfile.ts` must stay small, and the old engagement code it replaces has to come out in the same step.
