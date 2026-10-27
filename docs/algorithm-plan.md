# Algorithm plan: smarter, safer, measurable

Sources: `research/2026-10-05-algorithm-audit-and-upgrades.md` (the audit, 20 known-bug tests in
`src/lib/algorithmAudit.test.ts`) and `research/2026-10-26-gmail-headers-body-and-accuracy.md`
(R1-R11 below refer to its §7).

## The idea in one paragraph

Cluster decides two things about every email: **what it is** (personal, receipt, code,
newsletter...) and **whether it's safe**. Today both come from English keyword lists and
hand-set scores. We keep those rules as a floor that can only protect, then add a small model
that learns from *your own* choices to rank suggestions. Every change is measured against a
fixed test set first, so "smarter" is a number, not a feeling.

## The five layers

| Layer | Plain words | Can it make mail deletable? |
|---|---|---|
| 0 Clean | Turn `PаyPal` (Cyrillic а), `Pay​Pal` (zero-width) and `PAYPAL` into the same thing before any check | n/a |
| 1 Facts | What Gmail itself verified (login checks, labels, signing domain) plus what the sender claims (List-Unsubscribe, Precedence...) | Only provider-verified facts may lower a gate |
| 2 Floor | Fixed rules: starred, receipts, tickets, people you write to, phishing holds | Never lowered by anything above |
| 3 Learn | Per-user model from your keep / trash / unsubscribe / undo | Ranks suggestions inside what layer 2 allows |
| 4 AI | Optional Gemini Nano for non-English subjects | Can add protection, never remove |

## Stages

Each stage is its own branch and commits; nothing is pushed until told.

### Stage A: the measuring stick (R7) - M

- `src/test/corpus/`: synthetic fixtures, ~20 per class (personal, transactional, OTP,
  newsletter, marketing, social/notification, phishing), plus adversarial variants
  (homoglyph, zero-width, combosquat, keyword bait like "Free delivery").
- `src/lib/accuracy.test.ts`: runs every fixture through the real pipeline, prints a confusion
  matrix and per-class precision/recall, computes cost per 1,000 messages from the cost matrix.
- Hard gates (fail CI): no personal/transactional fixture reaches Trash; no adversarial
  transform lowers the threat tier; no model-only decision removes protection.
- Cost budget stored in a committed file; CI fails if cost goes up.
- **Done when:** the report runs, today's numbers are the recorded baseline.

### Stage B: clean the input (R1) - S

- New `src/lib/normalize.ts`: NFKC, strip default-ignorable and bidi controls, UTS #39
  skeleton from vendored `confusables.txt` (Unicode version recorded).
- Used before every match on display names, subjects and domain labels; replaces the
  hand-picked `CONFUSABLES` table in `threatSignals.ts`.
- Combosquat check: a brand label inside the registrable domain (`paypal-secure-login.com`).
- **Done when:** adversarial fixtures from Stage A stop slipping through; cost goes down.

### Stage C: fix the 20 known bugs - M

Grouped by cause. Each fix flips its `it.fails` to `it`.

1. Keyword bait in kind (4): "Free delivery", "tracking" and "statement" in newsletters;
   "verify your device" not seen as a code. Fix: a keyword only counts when the sender
   structure agrees (no bulk headers, or a transactional local part like `orders@`).
2. Protection bought with a word (3): "ends tonight" protects promos; plural "tickets",
   "reservations" don't protect. Fix: protection words need a transactional sender, and
   match plurals.
3. Brand false hits and misses (6): Chase on gmail, chess.com ≈ chase.com, "Start-Ups"
   ≈ UPS, and "Microsoft / Google / Apple" claims from outlook.com / gmail.com / icloud.com.
   Fix: whole-word brand match, edit distance scaled by length, free-mail domains split
   from the brand's own domains.
4. Renewals and subscriptions (3): Netflix's "will renew on", Apple's "is renewing soon",
   marketing from a subscription domain listed as paid.
5. Robustness (4): one 404 fails the scan; newsletters on a shared platform merge into one
   domain; a Trash rule matches protected receipts; score depends on sample size.

### Stage D: free new facts (R2-R6) - S each

- R6 first: one live `format=metadata` call to see if `snippet` comes back. If yes, drop it
  with `fields=` so "Metadata-only" stays true.
- R2: fetch `Content-Type`, `List-Post`, `X-Auto-Response-Suppress`, `Date`, `X-Mailer`.
- R5: "this is a reply to something you sent" from In-Reply-To / References against your
  Sent Message-IDs. Strongest personal signal, hard to fake.
- R4: trust List-Id / Feedback-ID only when a passing, aligned DKIM signature covers them.
- R3: Outlook's own spam verdicts (BCL, CAT, SFV), after one live check.

### Stage E: one safety floor (R8) - M

`protectionPolicy.ts` + `verdict.ts` become the single gate that rules, Sort, Screener,
smart views and delete paths all call, each decision carrying up to four plain reasons.

### Stage F: the per-user model (R9, R11) - L

- Two questions: **kind** (7 classes) and **wanted** (keep / don't need).
- Naive Bayes first, logistic regression after ~200 labels. A signed global priors file (on
  GitHub Pages, hand-made, never from user mail) plus your own weights, added together.
- Features: named structural ones (readable as reasons) + salted hashed subject words.
- Labels from your actions, weighted: undo is strong, trash is weak, unsubscribe ≠ spam.
- Old evidence fades over ~90 days. Stored in `chrome.storage.local`, never sync.
- Later: 2-3 "Is this a receipt?" chips per screen on the least certain rows.

### Stage G: bodies only when it matters (R10) - M

Read a body only in Deep scan or for mail already warned/held. Keep yes/no facts (order
markup, link mismatch, tracker count), never text. Update "Metadata-only" copy first.

## Never

- Let sender-written headers, body, markup, model or AI lower a safety gate or release a hold.
- Read bodies in the background scan, or store body text or snippets.
- Federated learning, gradient sharing, or any server touching mail (Google's Workspace
  policy forbids models beyond the user's own).
- Train the phishing layer from Trash.
- Commit corpora without a clear licence (Enron, SpamAssassin, TREC).

## Decisions needed

1. Cost matrix (draft in the research note §6.3): trashing personal or transactional mail = 100,
   missing phishing = 50, wrongly suggesting cleanup = 5, missing a promo = 1. Sign off or adjust.
2. Stage D's live checks (snippet, Outlook headers) need you to load the build in your browser.
