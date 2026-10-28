# Ten categories: market, Gmail cost, Big-O, pipeline

Written 2026-10-28. Estimates in B–D are replaced by the spike's measured numbers (docs/backlog.md 2.4).

## Context
You want Cluster to sort mail as precisely as possible, even if that is slow, into **10 life categories**: Finance, Purchases, Travel, Security, Health, Government & Legal, Home, Career & Education, Personal, Temporary. Suspicious mail is kept separate from all ten. Before any code, you asked for:
- whether anything on the market already does this, and how;
- how slow it is and what it costs (Gmail quota and AI tokens);
- a Big-O estimate of time for 50,000 emails.

## A. Who already does many categories, and how
| Product | Categories | How it decides | Lesson for Cluster |
|---|---|---|---|
| **Inbox by Gmail** (2014–2019) | 7 default bundles: Promos, Purchases, Travel, Finance, Social, Updates, Forums. Users could add their own ([Gmail blog](https://gmail.googleblog.com/2014/11/a-bit-about-bundles-in-inbox.html)) | Google server-side models. **Trip bundles** grouped confirmations by trip date ([Gmail blog](https://gmail.googleblog.com/2015/06/trip-bundles-in-inbox-by-gmail.html)) | The closest to your design, including event linking (trips). Google shut Inbox down and bundles never came to Gmail ([9to5Google](https://9to5google.com/2019/04/01/inbox-gmail-features-havent-arrived/)). The concept works, but it needed Google-scale classifiers. |
| **Clean Email** | 30+ "Smart Folders": Travel, Finance & insurance, Online shopping, Social notifications… ([help](https://clean.email/help/basics/available-smart-folders)) | Mostly **sender catalogs** ("airlines, Airbnb, booking.com", "Amazon or eBay"), indexed on its server | Many categories are doable with domain lists. The catch is that a sender catalog files a Delta receipt under Travel, the weakness your proposal points out. |
| **Yahoo Mail Views** | Receipts, Travel, Subscriptions, Shopping, plus package tracking ([Yahoo help](https://help.yahoo.com/kb/SLN36325.html)) | Server-side extraction | Views are **places to look**, not labels the user has to maintain. |
| Gmail / Apple / Proton | 5 / 4 / 6 | Server or on-device models over metadata | They keep the visible count low and do the detail inside each view. |

**How they solve it:** (1) a sender/domain catalog gives the first guess; (2) a per-message type (receipt, flight, code) overrides it; (3) events are linked by a key (trip date, order number). Nobody creates a label per company. This matches your proposal. None of them does it inside the browser, without a server.

## B. Cost to read and sort 50,000 emails (Gmail side)
Facts from `research/2026-09-06-gmail-quota-403-audit.md`: `messages.get` costs **20 units** whether it fetches metadata or the full body. `messages.list` costs 5 units per page of 500. `batchModify` costs 50 units for up to 1,000 ids. Cluster's Google project is limited to **6,000 units per user per minute**, and Cluster budgets 5,200 of that.

| Step | Calls | Units | Time at 5,200/min |
|---|---|---|---|
| List ids | 100 | 500 | <1 min |
| Read each message (metadata **or** body) | 50,000 | 1,000,000 | **~3.2 h** (2.8 h at the full 6,000) |
| Apply labels | ~50–100 | ≤5,000 | ~1 min |
| Create 10 Gmail filters | 10 | 50 | seconds |
| Keep up to date afterwards | `history.list` | 2 per check | free in practice |

- **Reading is the only cost that matters, and it's the same for metadata and bodies.** Reading bodies changes download size, not time. Metadata is a few KB per email, about 100–200 MB in total. Bodies are often tens of KB each, about 1–4 GB in total (my estimate; to be measured).
- It's a **one-time** 3 hours. After that, only new mail is read.

## C0. What you pay for Gmail (answer to "do I need to pay?")
- **Gmail API calls: $0.** Google sets quotas as speed limits, not as a bill. The 1,000,000 units for 50k emails cost nothing; they cost **time** (about 3.2 h).
- **OAuth verification** for the restricted `gmail.modify` scope: free, but it has to be done before more than 100 users can sign in. Until then the app runs in "Testing" mode, capped at 100 test users.
- **CASA security assessment**: only needed if mail data is stored on or passes through a server (`docs/oauth-scope-justification.md`). Vendors quote thousands of dollars a year (one claims $15k–75k; [Deepstrike](https://deepstrike.io/blog/google-casa-security-assessment-2025), [Nango](https://docs.nango.dev/integrations/google-security-review)). **Cluster avoids it by staying in the browser.** Any cloud AI or server that touches mail would bring it back.
- **Chrome Web Store**: one-time $5 developer fee.

## C. Classifying (no cloud models)
- AI only for the leftovers the rules can't place, using on-device Gemini Nano (Cluster already uses it, in batches of 25, in `aiMessageKind.ts`). Cost: $0.
- Nano's speed has **no published benchmark**. At most 2,000 prompts (50,000 / 25); at 1–3 s each (unmeasured guess) that's **30–100 min**. It runs at the same time as the 3-hour read, so it adds almost nothing to the total. The spike measures it.

## D. Big-O for N = 50,000 (local work)
| Stage | Complexity | Real time (estimate) |
|---|---|---|
| Fetch (network) | O(N) calls, limited by quota | ~3.2 h, **the bottleneck** |
| Clean text, auth/trust check, regex type rules | O(N · P), P = fixed number of patterns → O(N) | <1 s |
| Entity lookup (domain → company in a hash map) | O(N) | <1 s |
| Group by sender | O(N) with a hash map | <1 s |
| Event linking (order no., thread id, trip date → bucket) | O(N) hash buckets, then O(k log k) per event to order its emails by time | <1 s |
| Sort for display | O(N log N) ≈ 50k × 16 ≈ 800k comparisons | milliseconds |
| Save to IndexedDB | O(N) writes, batched | seconds to ~1 min |
| AI for the leftovers only | O(U), U = emails the rules couldn't place | 0 to 100 min, overlapped with fetch |
| Apply labels | O(N / 1000) calls | ~1 min |

**Total ≈ O(N log N) compute, but wall-clock ≈ O(N) network: about 3.2 hours for 50,000 emails on the first run, then minutes per day.** Showing the last 30 days first (§2 below) puts useful results on screen in minutes, not hours.

## E. The clinical pipeline (order matters)
1. **Trust first.** Mail with a warn/hold verdict or failed DMARC never enters the 10 categories. It goes to 🚨 Possible phishing. Closes the gap found in `sortInbox.ts` / `autoSort.ts` / `serverSort.ts` / `categoryFilters.ts`.
2. **Company:** authenticated domain → entity registry (extend `data/brandDomains.json`, 37 brands today). Platform domains are never a company.
3. **Type**, from subject + headers (`messageKind.ts`, extended to the subtypes).
4. **Category = f(type, company)**: the type wins (a Delta receipt goes to Purchases, a Delta promo to Temporary).
5. **Event key** (order no., booking ref, thread) → lifecycle state → retention.
6. **Leftovers only** go to the AI. Every decision stores its reason, so it can be checked.
7. **Measure** against a hand-labelled sample of your own mail before any label is applied.

## Decisions still open (ask before building)
- Bodies: stay metadata-only (recommended; costs the same time, keeps the promise), or opt-in body reading.
