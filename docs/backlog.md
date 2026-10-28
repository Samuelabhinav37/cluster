# Backlog: researched, not yet built

Checked against the code on 2026-10-28. Background and costs: research/2026-10-28-ten-categories-cost.md and research/2026-10-28-six-sections.md.

This is the master list. It covers today's chat plus research docs `2026-10-10-accounts`, `2026-10-16-unsubscribe-and-grouping`, `2026-10-27-dashboard-friction`, `2026-10-28-first-run-audit`, `2026-10-28-organizing-competitors`, `2026-10-28-grouping-rules-organization` and `docs/algorithm-plan.md` (deferred items).
- I checked each item by searching the code for it (2026-10-28).
- Effort: S under a day, M a few days, L a week or more.
- "Verify" means a match exists in the code but I couldn't tell whether it does the whole job.

## 1. Authorization
| # | Item | Source | Effort |
|---|---|---|---|
| 1.1 | Read `grantedScopes`. If the filter permission was unticked, hide filter actions and ask for it at the moment it's needed | today (new finding) | S |
| 1.2 | Start with `gmail.modify` only and ask for `settings.basic` the first time a filter is made | today | S |
| 1.3 | Sign out that revokes Google access and asks "keep or undo Cluster's labels/filters". Today there's only Erase (local data) | accounts doc | S |
| 1.4 | Several Gmail accounts by moving Gmail to `launchWebAuthFlow` + PKCE (start with a 1-hour spike) | accounts doc | L |
| 1.5 | Connect page: fewer grey lines, and explain "app isn't verified" calmly | audit | S |

## 2. Reading
| # | Item | Source | Effort |
|---|---|---|---|
| 2.1 | Read the last 30 days completely first, then older mail | today (Superhuman) | M |
| 2.2 | Label each number with the date range it covers until reading is done | today | S |
| 2.3 | Use `census.ts` totals for "how big" figures on day one | today | S |
| 2.4 | Spike: real read rate and share of mail the rules place on their own, both on your real mailbox. (Nano measured 2026-10-28: 3.1–3.7 s per 25, unreliable alone; see the cost doc §C) | today | S |
| 2.5 | Check for new mail every 5 min on the existing alarm (verify: the 5-min sweep exists; unclear whether it groups new mail) | sync doc, unsubscribe doc §3 | S–M |

## 3. Understanding
| # | Item | Source | Effort |
|---|---|---|---|
| 3.1 | **Trust first**: warn/hold or failed DMARC mail never gets a normal category | today (gap found) | S |
| 3.2 | **10 categories** with separate fields per email: category, type, company, state, retention, trust. Type wins over sender | today | L |
| 3.3 | Company list: grow `brandDomains.json` past 37 brands; a company only counts when the mail is authenticated | today | M |
| 3.4 | Platform list (myworkday, greenhouse, paylocity, Lever, iCIMS…) in `SHARED_SENDER_PLATFORMS`; none listed today | grouping doc 1.1 | S |
| 3.5 | Data rule: a domain with many unrelated senders is a platform | grouping doc 1.2 | S–M |
| 3.6 | Name platform senders "Walmart (via Workday)" | grouping doc 1.3 | S |
| 3.7 | Group by List-Id before domain (verify: List-Id is read but may not be the grouping key) | grouping doc 1.4 | S |
| 3.8 | "Group by company" as a toggle on Senders | grouping doc 1.5 | S |
| 3.9 | People = not a machine **and** you talk to them (machine = auto headers, list headers, no-reply names) | grouping doc 2.1 | S |
| 3.10 | Starring or replying no longer makes a sender a person | grouping doc 2.2 | S |
| 3.11 | "Companies you talk to" group | grouping doc 2.3 | S |
| 3.12 | One tap "Not a person" / "This is a person", remembered | grouping doc 2.4 | S |
| 3.13 | **Event linking**: order no., booking ref and thread make one event. Lifecycle state then decides what to keep (shipping updates go once delivered) | today | M–L |
| 3.14 | "What Cluster learned" list with Reset | competitors #5 | S |
| 3.15 | Deferred from the algorithm plan: signed global priors file, logistic regression after ~200 labels, 7-class kind model, link shorteners, tracker counts | algorithm plan | M each |
| — | schema.org order/flight markup: **skipped**, because it is in the body and we stay metadata-only | algorithm plan | — |

## 4. Filtering & sorting
| # | Item | Source | Effort |
|---|---|---|---|
| 4.1 | 10 category labels + Gmail filters, replacing today's 11 sort buckets (label migration) | today | M |
| 4.2 | "Moved today" review on Home: Back to inbox, Keep doing this, Archive all | competitors #1 | S–M |
| 4.3 | "Always do this" tick after any manual action, which makes the rule | grouping doc 4.1, competitors #9 | S–M |
| 4.4 | Rule sheet starts prefilled from a sender, one sentence, "More options" | grouping doc 4.2 | M |
| 4.5 | Preview with a match count before saving; "also do this to the 42 you have now" off by default | grouping doc 4.3 | S |
| 4.6 | AI draft off the main path, with a timeout and fallback (also audit bug 1) | grouping doc 4.4 | S |
| 4.7 | Sort now: pick places with counts, then one Sort | grouping doc 4.5 | M |
| 4.8 | Guardrail: mail a person sent straight to you is never moved | grouping doc 4.6 | S |
| 4.9 | Screener bypass: replies to your mail, choose what is held, allow list; never screen out a free-mail domain | competitors #2 | S |
| 4.10 | One "where does this sender go" choice that applies to old mail too | competitors #3 | M |
| 4.11 | Time-sensitive mail (codes, alerts, delivery today) is never held or delayed | competitors #6 | S |
| 4.12 | Block can also unsubscribe | competitors #7 | S |
| 4.13 | Group by sender inside Details | competitors #8 | S |
| 4.14 | Newsletter day for any label, a few schedules (verify how general it is today) | competitors #10 | M |
| 4.15 | Pin a message so no rule touches it | competitors #12 | S |

## 5. Showing & confirming
| # | Item | Source | Effort |
|---|---|---|---|
| 5.1 | Audit bugs: rule-draft hang, Home double count, scroll carries between pages, Escape vs ⋯ menu, old bulk bar, unlabelled checkboxes, wrong Protect hint | audit | S each |
| 5.2 | Home counts from one set of messages, de-duplicated by id, "of N", plus a test | grouping doc 3.1–3.4 | S |
| 5.3 | One sender key and one row everywhere (Details and Clean up still list per address; a fake Netflix sits beside the real one) | audit, grouping doc 5.2 | M |
| 5.4 | One job per place; each sender shows in one home; Details is the only list of emails | grouping doc 5.1, 5.3, 5.4 | M |
| 5.5 | Trash on Clean up rows | audit | S |
| 5.6 | Actions on company cards in Senders; "Keep sorted" says what it does | audit | S |
| 5.7 | Stop mail wording (no "verified one-click", "page"; real frequencies, not "Monthly" everywhere) | audit | S |
| 5.8 | Shorter Organize ("Leave the inbox" → "Archive", "Tidy once" button, rules empty state) | audit | S |
| 5.9 | Setup visible to new users; no "Tidy up old labels" on a fresh install | audit | S |
| 5.10 | Protect reasons lead with "Pretends to be Netflix"; Checkup doesn't repeat the bento | audit | S |
| 5.11 | Senders at 1568 px: 4 columns down to 3 | audit | S |
| 5.12 | "Done · Undo" instead of confirms for reversible actions (archive, label, mute) | today | M |

## 6. Checking & updating
| # | Item | Source | Effort |
|---|---|---|---|
| 6.1 | On unsubscribe, also add a 3-day "file what still comes" filter | unsubscribe doc 2 | S |
| 6.2 | After unsubscribing, offer the company's other bulk addresses | unsubscribe doc 4 | S |
| 6.3 | Say which kind it was ("They've confirmed" / "Sent by email, 2 days" / "Finish on their page") | unsubscribe doc 5 | S |
| 6.4 | Offer Unsubscribe only to senders still sending; others get "Clear out old mail" | unsubscribe doc 6 | S |
| 6.5 | "Stop and archive old" / "Stop and trash old", plus a short grace window with Undo before the request is sent | competitors #4 | S |

**Already built, don't redo:** mailto unsubscribe sent by Cluster (`gmailApi.ts:880`), still-sending → "Send their mail to Trash" (`subscriptionsTab.ts:115`), local data Erase, Track 0–6 dashboard plan, all UI-consistency items.
**Superseded:** "fewer labels by default" (competitors #11), replaced by your 10 categories.

## Build order
1. Spike 2.4 (no product change). Its three numbers replace the estimates in `research/2026-10-28-ten-categories-cost.md` B–D.
2. Build in this order, one commit per item with tests (`npm test`, `npm run typecheck`) and a check in the preview (port 4600, `?reset`):
   - **a.** 5.1 audit bugs and 5.2 Home counts. Small, and they make the app testable.
   - **b.** 3.1 trust first.
   - **c.** 3.4–3.12 grouping and People.
   - **d.** 1.1–1.2 permissions.
   - **e.** 3.2 + 4.1 the 10 categories, after the spike and a hand-labelled accuracy sample.
   - **f.** 3.13 event linking.
   - **g.** The rest of sections 4, 6 and 5 by value, then 2.1–2.3, then 1.3–1.4.


## Done
2026-10-28, on feat/dashboard-simplify-2026-10 (not pushed):
- 2.4 (part): Gemini Nano measured, 3.1–3.7 s per 25, unreliable alone (18ad279).
- 4.6 / 5.1 bug 1: a stalled rule draft falls back after 15 s (a983313).
- 5.1 bug 2 + 5.2: Clean up counts each email once (d3d7bb6); Home is one "All mail" total for everything read, Clean up reads "30 of 150 ready to go" (426bfcf). You chose "All mail everywhere".
- 5.1 bug 3: a new page opens at its top (beff761).
- 5.1 bug 4: Escape closes an open ⋯ menu before Details (59e5be0).
- 5.1 bug 5: old bulk bar hidden (38b90e1). Its code stays until Clean up has row selection.
- 5.1 bug 6: domain and spam row checkboxes labelled (8d0f142).
- 5.1 bug 7: Protect's empty chart names the real switch (a9769b2).
- 3.1: Sort now never labels mail failing DMARC or with a warn/hold verdict (9060707). Gmail filters still match on From text.
- 3.4 + 3.5: platform list (Workday, Greenhouse, Paylocity, Mailchimp) and the platformRoots data rule (d1f064b).
- 3.9 + 3.10: People need a non-machine person sender, role addresses count as machines (fee87cf).

- 3.6 + 3.7 + 3.8 + 3.11 + 3.12: "via myworkday.com" on platform senders, a signed List-Id folds one newsletter across addresses, "Group companies" switch on Senders, "You write to" filter, "This is a person" / "Not a person" on the sender card, remembered (see git log).

Step c is done. Next: d (1.1–1.2 permissions, needs a live Google test).
