# On-device learning and modelling for a unified sender profile (Cluster)

Date: 2026-10-16. Scope: techniques a header-only, no-server Chrome MV3 extension can use to learn "who is normal and who matters" for one person, learn from corrections, explain itself, and be evaluated. Builds on, and does not re-derive, `research/2026-10-11-how-cluster-solves-it.md` ("solves-it note"), `research/2026-10-05-algorithm-audit-and-upgrades.md` ("audit note") and `research/2026-09-07-engagement-model-v1-design.md` ("engagement design"). Findings already established there (Priority Inbox global+per-user error 45%→38%→31%; Ho 2017 name-flood numbers; Boykin 44/54/47%; Graham per-user; Platt vs isotonic; Reg B four reasons; federated learning out of scope) are referenced, not re-sourced in depth.

Labels: **Verified** = a claim with a link to the source I read (or a search summary of that source, noted). **Inference** = my design reasoning. Every recommendation below works with no server receiving mail data.

## 1. Sender identity resolution: what key does a profile hang on?

### Takeaway
No serious system keys on a single identifier. Production systems key relationship strength on the exact address (or group of addresses) and keep separate, coarser profiles for the organisation; Ho et al. key name trust on the (display name, address) pair. Cluster should use a three-level key (address → registrable domain/org → display-name skeleton) with an explicit "sending infrastructure" field for ESP mail, and only merge addresses into one "person" on authenticated evidence or a user action.

### Cited Findings
- Google's implicit social graph keys edges on **implicit groups**: "a unique combination of one or more contacts with whom the user has interacted"; edges have direction (outgoing email sent by the user vs incoming received) and both may exist for the same group. Built only from "metadata (i.e. timestamp, sender, and recipients)"; "message content is not included or examined" — Verified, [Roth et al., KDD 2010, "Suggesting Friends Using the Implicit Social Graph"](https://research.google/pubs/suggesting-friends-using-the-implicit-social-graph/) (full PDF text extracted locally from [Google PDF](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/36371.pdf)).
- Roth et al. excluded bots "via regular expression matching" of addresses such as "info@domain" and "noreply@domain" before building the graph — Verified, same PDF.
- Ho et al. (USENIX Sec 2017) measure name trust by how many earlier days the exact name *and* address appeared together; 52% of names with >100 emails used more than one address — Verified in solves-it note §3.4 ([USENIX](https://www.usenix.org/conference/usenixsecurity17/technical-sessions/presentation/ho)).
- Microsoft Defender mailbox intelligence builds a per-user "contact graph" of who a user normally corresponds with and flags a sender who only *appears* to be someone the user regularly talks to; Microsoft does not publicly document retention windows or how many messages establish trust — Verified (search summary of [Microsoft deck](https://query.prod.cms.rt.microsoft.com/cms/api/am/binary/RWSD6b) and [Microsoft Learn training module](https://learn.microsoft.com/en-us/training/modules/implement-threat-protection-use-microsoft-defender-office-365/2-explore-microsoft-defender-office-365-protection-stack)); gap on mechanics noted below.
- Abnormal's VendorBase keeps a **vendor-level** (organisation) profile: profile info, "relationship analysis, including vendor contacts and internal recipients", common vendor locations and IPs, risk scores, and a timeline of malicious activity; it is described as a cross-customer federated reputation database — Verified (search summary of [Abnormal blog](https://abnormal.ai/blog/abnormal-knowledge-bases-vendorbase) and [data sheet](https://abnormal.ai/resources/data-sheets/vendorbase-security-email-supply-chain)). Vendor marketing; no granularity details published.
- Public Suffix List gives registrable-domain (eTLD+1) boundaries; PSL warns a static embedded copy is risky for validity checks — Verified in audit note B.2 ([PSL](https://publicsuffix.org/learn/)).
- Substack/proton.me grouped by domain is already a locked known bug (shared-platform domains are not organisations) — Verified, audit note A.12 / `algorithmAudit.test.ts`.

### Inferences
- **Three-level identity, not one.**
  1. `addressKey` = lowercased address with plus-tag stripped (`a+news@x` → `a@x`) and, for Gmail/Googlemail consumer domains only, dots removed in the local part. Keep the raw form too. (Plus-addressing is RFC 5233 "subaddress"; dot-insensitivity is Gmail-specific; neither fetched this session.)
  2. `orgKey` = registrable domain via PSL, **except** for free-mail and shared-platform domains (gmail.com, outlook.com, substack.com, medium.com, beehiiv.com, mailchimp-hosted senders…), where the org level is disabled and the address *is* the identity. One shared `freemail+platform.json` (audit note U4 already wants this).
  3. `nameKey` = TR39 skeleton of the display name (audit note U3), used only as an *index* to find "which profiles have used this name", never as an identity on its own.
- **ESP mail (SendGrid, Mailchimp, Amazon SES):** the Return-Path / SPF domain and often the DKIM `d=` belong to the ESP, not the brand. Key the profile on the **From header's** address/org (what the user sees and what DMARC aligns to), and store the observed `{dkimD, spfDomain}` pairs as an **infrastructure set** on the profile. "Normal" = the set seen with aligned DMARC pass over ≥2 distinct days ≥7 days apart (the existing ledger rule). A new ESP for a known org is a weak signal, never a hold on its own.
- **One person, many addresses:** do **not** auto-merge address profiles into a person from display-name equality (Ho: 52% of established names use multiple addresses legitimately; attackers exploit exactly this). Merge only when (a) the user wrote to both addresses, or (b) the user confirms "this is really them" on a card. Represent the merge as a `personId` linking address profiles, so it is reversible.
- **Groups:** follow Roth and also keep a lightweight per-*recipient-set* record for the user's outgoing mail (hash of sorted recipient addresses → IR score). Cheap, and it enables "you usually write to Lisa and Tom together".
- Gap A7 in the solves-it note (`accounts@` vs `billing@` same company) is solved by the org level carrying familiarity/trust that new addresses at the same authenticated org partially inherit (e.g. start at org prior, not stranger prior), but not for free-mail.

### Gaps
- How Gmail itself keys sender reputation for consumer users is not publicly documented; I found no primary source.
- Microsoft's exact contact-graph learning (window, thresholds, update cadence) is not published in material I could reach (developer docs pages blocked by fetch).

## 2. Relationship strength (tie strength) from headers

### Takeaway
The best-documented header-only formula is Google's **Interactions Rank**: a per-contact/group sum of exponentially decayed interactions with a tunable half-life and a separate weight for outgoing mail. Tie-strength research says recency of exchange is the single strongest predictor. Cluster should compute a decayed, direction-weighted score per profile, stored as a running accumulator, plus reciprocity and thread features.

### Cited Findings
- Interactions Rank (IR): "summing the number of emails exchanged between a user and a particular implicit group, weighting each email interaction as a function of its recency. Interaction weights decay exponentially over time, with the half-life, λ, serving as a tunable parameter. An additional parameter… is ω_out, the relative importance of outgoing versus incoming emails." Formula: `IR = ω_out · Σ_{i∈I_out} (1/2)^((t_now − t(i))/λ) + Σ_{i∈I_in} (1/2)^((t_now − t(i))/λ)`; "an interaction from the current time has a contribution of 1… from one half-life λ ago contributes 1/2" — Verified, [Roth et al. KDD 2010 PDF](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/36371.pdf). Edge weights are "determined by the frequency, recency, and direction of interactions". (I did not find the paper's chosen λ and ω_out values in the extracted text.)
- Roth et al. evaluated by predicting future recipients from interactions strictly before the sampled one (a time-split offline evaluation), with precision/recall curves; two Gmail Labs features shipped ("Don't forget Bob!", "Got the wrong Bob?") — Verified, same PDF.
- Gilbert & Karahalios (CHI 2009): a model over ~70 variables from ~2,000 Facebook ties separates strong from weak ties with >85% accuracy — Verified (search summary of [ACM DOI 10.1145/1518701.1518736](https://www.doi.org/10.1145/1518701.1518736)); Roth et al. summarise: "the strongest predictor of tie strength between two individuals is a short elapsed time between message exchanges" — Verified, Roth PDF.
- Priority Inbox's first feature group is social: "degree of interaction between sender and recipient, e.g. the percentage of a sender's mail that is read by the recipient", plus thread features such as "if a user began a thread" — Verified, solves-it note §3.1 ([pub36955](https://research.google/pubs/pub36955/)).
- Mozilla Frecency (a production on-device recency×frequency score): each visit scores `weight × e^(−λ·age)` with `λ = ln2/30` (≈30-day half-life); legacy version used buckets (≤4 d: 100, ≤14 d: 70, ≤31 d: 50, ≤90 d: 30, older: 10); a Mozilla proposal replaced buckets because they were "non-monotonic and discontinuous" — Verified (search summary of [Firefox ranking docs](https://firefox-source-docs.mozilla.org/browser/urlbar/ranking.html), [legacy](https://firefox-source-docs.mozilla.org/browser/urlbar/ranking-legacy.html), [wiki proposal](https://wiki.mozilla.org/User:Jesse/NewFrecency)). Sources also mention a 0.975/day recalculation factor (≈28-day half-life); not reconciled.

### Inferences
- **Store decayed accumulators, not event lists.** For each profile keep `(S, t_ref)`; on a new event at `t`: `S ← S·2^(−(t−t_ref)/λ) + w; t_ref ← t`. Reading at `now` is one multiply. Constant space, exact IR, incremental, order-independent if you sort backfill by time (or apply the decay to each event's own age when backfilling).
- **Keep several accumulators per profile**, each O(1): `outIR` (user → them; weight per message ×1, To > Cc > Bcc, e.g. 1 / 0.5 / 0.5), `inIR` (them → user, To vs Cc vs list), `replyIR` (user replied to their message), `threadStartIR` (user started thread they joined), `readIR`/`unreadIR`, `starIR`. Two half-lives: short (≈30 d, "current") and long (≈365 d, "established"). Choosing λ by evaluation (section 9) rather than guessing; Frecency's 30 d is a reasonable default for the short one.
- **Reciprocity** = `min(outIR, inIR)/max(outIR, inIR)` on long half-life, plus a boolean `everWroteTo`. Boykin & Roychowdhury show the bidirectional header graph alone whitelists ~44% of good mail with no errors (solves-it §3.2), so `everWroteTo ∧ DMARC-aligned` is the strongest single "matters" feature.
- **"Who matters" score** = small logistic model over these features (section 3), not a hand sum. "Who is normal" (security baseline) is a different question: count of distinct days seen, address+name co-occurrence days (Ho), infrastructure set stability, first/last seen. Keep both in one record but as distinct outputs.
- Weight outgoing mail higher than incoming (ω_out > 1): incoming volume is attacker- and marketer-controlled; outgoing is not. This is also a poisoning defence (section 8).

### Gaps
- The λ and ω_out values Google used are not in the extracted text; no published optimum for personal email that I found.
- Full Gilbert & Karahalios variable weights not retrieved (PDF host blocked).

## 3. Lightweight per-user learning and learning from corrections

### Takeaway
The evidence and constraints point to a **global prior + per-user delta logistic regression** (Priority Inbox) over profile aggregates, updated online by one SGD step per label, with per-user thresholds, plus count-based Bayesian (Beta/naive-Bayes) estimates for per-sender rates. Corrections become labelled examples *and* hard overrides. Ask at most a few "uncertainty" questions per day.

### Cited Findings
- Priority Inbox: per-user model weights "only represent how different the user is from the global model"; error 45% (global) → 38% (user models) → 31% (plus per-user thresholds) over 160k corrections; opening mail is a noisy label ("users read mail they acknowledge is not important") — Verified, solves-it §3.1 ([pub36955](https://research.google/pubs/pub36955/)).
- Graham: per-user probabilities "ideally… calculated individually for each user", making it hard for spammers to tune; good counts doubled to bias against false positives; tokens need "more than five" occurrences; unseen tokens default to 0.4; combine the "most interesting fifteen tokens"; clamp probabilities to [0.01, 0.99]; threshold 0.9; "missing legitimate email is an order of magnitude worse than receiving spam" — Verified, [A Plan for Spam](https://www.paulgraham.com/spam.html).
- Outlook Focused Inbox learns from "who you reply to and who you ignore, who you flag, pin, or categorize… explicit Always-move corrections, and server-wide patterns" — Verified via search summary, audit note B.1 ([Microsoft Support](https://support.microsoft.com/en-us/office/focused-inbox-for-outlook-f445ad7f-02f4-4294-a82e-71d8964e3978)).
- Engagement design already specifies `p = σ(w_global·x + w_user·x)`, online logistic SGD with L2 toward zero, ≤500-example FIFO buffer (~80 KB), labels from accept/dismiss/undo/star/reply — Verified (repo doc, engagement design).
- Explanatory Debugging (Kulesza, Burnett, Wong, Stumpf, IUI 2015): system explains each prediction and the user corrects via those explanations; increased participants' understanding by 52% and let them correct mistakes about twice as efficiently as a traditional learning system — Verified (search summary of [City Research Online](https://openaccess.city.ac.uk/id/eprint/13819/) / DOI 10.1145/2678025.2701399).

### Inferences
- **Two model families, each tiny:**
  1. *Per-sender rates* (read rate, reply rate, undo rate, release rate) as **Beta-Binomial posteriors**: `rate = (k + α)/(n + α + β)` where `(α, β)` come from the org profile or a global kind prior (e.g. newsletters α=1, β=4 for "read"). This is the principled replacement for the current EMA and fixes small-sample noise (most senders have 1-3 messages). Decay `k` and `n` with the same half-life accumulator trick.
  2. *Decision models* (important? clean-up candidate? kind?) as logistic regression over ~20-60 features: the profile's accumulators, posterior rates, kind, auth state, provider-important rate. `w_global` shipped in a signed dataset, `w_user` local, L2-pulled to zero. Pure JS, sub-millisecond.
- **Per-user thresholds** matter as much as weights (Priority Inbox: 38%→31%). Store a per-user, per-decision offset `b_user` adjusted by the "more / less" nudge and by corrections (a correction near the threshold moves `b_user` a small step).
- **Label sources, ranked by reliability** (Priority Inbox and Graham both say explicit corrections beat implicit): explicit "Not right?" / release / "This is really them" > undo within N days > reply/star > move to label > read > unread. Weight accordingly (e.g. 3 / 2 / 1.5 / 1 / 0.3 / 0.3).
- **Selection bias:** Cluster only observes outcomes on mail it surfaced; train with a small exploration rate (e.g. 1 in 20 suggestions drawn just below threshold) and record the propensity, or the model never learns its false negatives. This is the "bandit" lens; full contextual bandits are overkill at these data sizes.
- **Corrections write three things** (audit note C.2 step 3): hard override, training example, engagement event. Add: a correction on a security card updates the profile's infrastructure set or `personId` link only after a second confirmation or 7-day re-observation (poisoning rule).
- **Active learning ("ask one good question"):** pick the item with the smallest |p − threshold| among high-impact candidates (would change a hold, a clean-up, or an Important lift); cap at 3/day; never ask about a security hold (that's a release decision, not a quiz). Uncertainty sampling is standard (not re-sourced).
- **When a small model beats rules:** only after ~50-100 labels for that decision type (Inference). Before that, ship `w_global` that reproduces current rule behaviour (so v1 is a no-regression change) and let `w_user` move slowly.

### Gaps
- No public evidence quantifying how many corrections a per-user email model needs before it beats a global prior; Priority Inbox reports only aggregate gains.

## 4. On-device ML precedent and Chrome built-in AI status

### Takeaway
Apple confirms metadata-only, on-device mail categorisation in iOS Mail; Chrome's Prompt API is available to extensions on desktop only, with structured output via `responseConstraint`. For sender profiling, small tabular models in plain JS beat both: the LLM is useful only for text-shaped sub-tasks (kind of an "other" subject), never for the profile itself.

### Cited Findings
- Apple Mail Categorization: "Apple processes certain email metadata in order to help organize your emails into categories. This metadata does not include the body content"; on iOS "categorization processing occurs entirely on-device"; on iCloud.com Apple processes metadata server-side (opt-out available). Categories: Primary, Transactions, Updates, Promotions — Verified (search summary of [Apple Mail Categorization & Privacy](https://www.apple.com/legal/privacy/data/en/mail-categorization/)). Model and signals not published.
- Prompt API: works in Chrome on Windows 10/11, macOS 13+, Linux, Chromebook Plus; not Android, iOS or non-Plus ChromeOS. Extensions have it in Chrome 138+ stable (web was origin trial); Chrome docs page updated 2026-05-19 also lists Chrome 148 with an origin trial for sampling parameters — Verified via search summary of [Prompt API docs](https://developer.chrome.com/docs/ai/prompt-api) (direct fetch blocked). Hardware (≥22 GB free disk; >4 GB VRAM or 16 GB RAM + 4 cores; unmetered download; user activation for download) — Verified in audit note B.2 from the same page.
- Prompt API explainer: `responseConstraint` accepts "either a JSON schema object or a `RegExp`"; unsupported schema features raise `NotSupportedError`; non-compliant output raises `SyntaxError`; `inputQuota` renamed `contextWindow`, `measureInputUsage()` → `measureContextUsage()`, old names "Deprecated in Extensions, Removed in Web"; availability states `unavailable` / `downloadable` / `downloading` / `available`; `expectedInputs` languages "do not affect the context or prompt the language model sees"; sampling params (`topK`, `temperature`, `LanguageModel.params()`) are only functional in extension contexts — Verified, [webmachinelearning/prompt-api README](https://github.com/webmachinelearning/prompt-api/blob/main/README.md).
- Gmail's RETVec character encoder is ~200k parameters (spam detection +38%, FP −19.4%) — Verified in audit note B.1 ([arXiv 2302.09207](https://arxiv.org/abs/2302.09207)).

### Inferences
- **API churn is real** (renames between 2025 and 2026): wrap the Prompt API behind one adapter that feature-detects `contextWindow`/`inputQuota` and `measureContextUsage`/`measureInputUsage`.
- **Hardware gating means the LLM can never be load-bearing**: a large share of users (Android, low-RAM laptops) will report `unavailable`. Every decision must have a deterministic + tabular path; the LLM is an optional feature extractor whose output becomes *one feature* (`aiKind`) with a reason code, under audit note U12 guard rails.
- **TF.js/ONNX models** are unnecessary for the profile: the features are ~50 numbers per sender. A RETVec-class encoder (~200k params ≈ under 1 MB as int8) could be justified later for display-name/subject robustness, but TR39 skeletons + rules cover most of that cheaply. Not recommended for v1.
- Use the LLM where it is genuinely better than features: explaining a decision in plain language from reason codes ("rewrite these 3 codes into one sentence") is low-risk; classifying a sender's relationship is not.

### Gaps
- No official figure for what share of Chrome desktop installs meet Prompt API hardware requirements.
- Could not fetch developer.chrome.com directly to confirm the current (Oct 2026) status table beyond the May 2026 snapshot in search results.

## 5. Federated / privacy-preserving global priors without a server

### Takeaway
Federated learning with DP and secure aggregation is production-proven at Google scale, but every variant needs a coordinating server and a large population. For a small open-source project the realistic "global prior" is a **signed, static prior dataset** fitted by the maintainers on public and synthetic corpora, with optional user-initiated, hand-reviewed export of aggregate counts.

### Cited Findings
- Gboard: all next-word-prediction neural LMs trained with federated learning and formal DP; 30+ on-device LMs in 7+ languages and 15+ countries with (ε, δ)-DP, δ = 10⁻¹⁰, ε between 0.994 and 13.69; "largest known deployment of user-level DP in production"; SecAgg ensures only aggregated updates are accessible — Verified, [Google Research blog 2024](https://research.google/blog/advances-in-private-training-for-production-on-device-language-models/), [Xu et al. ACL Industry 2023](https://aclanthology.org/2023.acl-industry.60), [arXiv 2306.14793](https://arxiv.org/abs/2306.14793).
- Method: DP-FTRL with adaptive quantile-based clipping, which avoids needing uniform device sampling — Verified, [research.google pub52351](https://research.google/pubs/pub52351).
- Audit note B.5 already concluded FL is out of scope (needs a coordinator; no population at a 100-user test cap) and that global priors should ship as a signed static file; U14 specifies Ed25519 signatures verified with WebCrypto — Verified (repo doc).

### Inferences
- **Even at Gboard scale ε reached 13.69** for some models; with hundreds of users any DP aggregate would either leak or be noise. Not realistic for Cluster in 2026.
- **What the signed prior should contain** (all data-free with respect to users): `w_global` per decision; Beta priors per kind and per org category; λ half-lives; thresholds; free-mail/platform/ESP lists; known-ESP DKIM domains; brand list. Version it, sign it, and include a model card listing which corpus each number came from.
- **Optional community contribution** without a server receiving mail: a "copy anonymised counts" button (audit note C.4) that emits only per-decision confusion counts and per-reason-code undo rates; the user pastes it into a GitHub issue. Aggregation is manual by maintainers. That is consent-based, auditable and needs no infrastructure.
- Local DP (randomised response) is possible client-side but pointless without a collector.

### Gaps
- None material; the conclusion is a constraint consequence.

## 6. Explainability: reason codes and evidence that explanations help

### Takeaway
Use credit-scoring-style reason codes (≤4 specific principal reasons) derived directly from the logistic model's per-feature contributions plus rule hits. Evidence shows explanations improve users' understanding and make corrections cheaper; "why is this here" exists in competitors only as rule text, so Cluster has room to lead.

### Cited Findings
- Reg B: "specific reasons", principal reasons, more than four "not likely to be helpful", vague "failed to achieve a qualifying score" insufficient — Verified, audit note B.3 ([12 CFR 1002.9](https://www.consumerfinance.gov/rules-policy/regulations/1002/9/)).
- Explanatory Debugging: +52% understanding, ~2× correction efficiency (IUI 2015) — Verified (search summary of [City Research Online](https://openaccess.city.ac.uk/id/eprint/13819/)). A secondary review notes complete-but-unsound explanations helped mental models but reduced trust — search summary only, primary not read; treat as unverified.
- Products: Gmail categories, Outlook Focused and Apple Mail give no per-message reason; Superhuman/Clean Email/HEY show the rule or decision as the explanation; Microsoft shows safety-tip text ("You don't often get email from…") — Verified in audit note B.1.
- Audit note C.2 already defines the reason-code enum and UI placement — Verified (repo doc).

### Inferences
- **Reason codes fall out of logistic models for free:** contribution_j = `(w_global_j + w_user_j)·(x_j − x̄_j)` relative to a reference sender (the kind's prior mean). Show the top ≤4 positive contributions for the chosen side, mapped to templated text with the user's actual numbers ("You've written to them 14 times; last reply 3 days ago"). The engagement design's "reasons map to top positive contributions" test enforces this.
- **Soundness over completeness for security:** phishing cards should cite only signals that actually fired, with the combining rule ("held because: uses Lisa's name + new address + payment words"), never model-internal weights.
- **Profile transparency page:** a per-sender "What Cluster knows" panel (counts, first/last seen, addresses, signing domains, your corrections, a "forget this sender" button). This doubles as the correction surface Kulesza's work recommends.
- Measure explanation value locally: correction rate and undo rate per reason code (section 9).

### Gaps
- No primary evidence specific to email triage on whether explanations raise correction rates; Kulesza used text classification.

## 7. Cold start and calibration

### Takeaway
Cold start is mostly solved by (a) a one-time full sent-mail backfill (cheap headers) and (b) hierarchical priors: global → kind/category → organisation → address. Calibrate model outputs with a two-parameter Platt fit (shipped globally, nudged per user), and only act automatically in a high-confidence band.

### Cited Findings
- Priority Inbox addresses new users with the global model and per-user deltas — Verified ([pub36955](https://research.google/pubs/pub36955/)).
- Naive Bayes outputs are pushed toward 0/1; Platt scaling or isotonic regression fixes this (Niculescu-Mizil & Caruana ICML 2005); Platt preferred for small data — Verified in audit note B.3.
- Graham's unseen-token default 0.4 (mildly innocent) and clamping to [0.01, 0.99] are explicit cold-start priors — Verified, [A Plan for Spam](https://www.paulgraham.com/spam.html).
- Solves-it note: first run sees 150 sent messages; recommends full sent-history read and ALL-mail index — Verified (repo doc).

### Inferences
- **Hierarchical shrinkage:** an unseen address at a known authenticated org starts at the org's posterior; an unseen org starts at its category prior; free-mail addresses start at the stranger prior. This is the Beta-prior chain from section 3, and is what lets `billing@` inherit from `accounts@`.
- **Day-one importance from sent mail:** after full sent backfill, `outIR` alone ranks contacts well (Roth's whole system is built on it). Treat "never written to + no history" as unknown, not as unimportant.
- **Calibration check locally:** reliability diagram over the user's own labelled decisions (counts per 0.1 bin). If a bin has ≥20 labels and observed rate deviates by >0.15, refit Platt `(a, b)` per user with strong prior toward the global pair.
- **Action bands** (audit note C.2): ≥0.9 may act (still reversible), 0.7-0.9 suggest, <0.7 never act. Bands apply to calibrated p, not raw scores.

### Gaps
- No public calibration data for personal-email importance models.

## 8. Poisoning, gaming resistance, and drift/decay

### Takeaway
Learned baselines are poisonable cheaply: ~1% attacker-controlled training data broke SpamBayes. Defences: make trust depend on signals attackers cannot generate (the user's outgoing mail, DMARC-aligned identity, time), require re-observation across days before baselines change, cap any single sender's influence, and decay stale profiles so dormant trust cannot be cashed in years later without re-verification.

### Cited Findings
- Nelson et al. (LEET 2008): a dictionary attack makes SpamBayes unusable when the attacker controls ~1% of training messages; a focused attack removes a specific target email from the inbox ~90% of the time; a pseudospam attack gets ~90% of target spam seen with <10% of training data — Verified (search summary of [USENIX LEET 08](https://www.usenix.org/conference/leet-08/exploiting-machine-learning-subvert-your-spam-filter) and [Berkeley TR EECS-2008-62](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2008/EECS-2008-62.pdf)).
- Lateral phishing: hijacked real accounts inherit trust; Ho et al. 2019 detector <4 FP per million — Verified in solves-it §3.4 ([arXiv 1910.00790](https://arxiv.org/abs/1910.00790)).
- Cluster's ledger already promotes a new signing/Reply-To domain only after re-observation ≥7 days later and requires ≥3 messages over ≥30 days — Verified (solves-it §2.3, `senderLedger.ts:40`).
- Boykin: "if spammers can impersonate members of your whitelist they can damage the effectiveness of any whitelisting scheme" — Verified, solves-it §3.2.

### Inferences
- **Only train trust features from user-originated or authenticated events.** Incoming volume from an unauthenticated or misaligned sender updates `inIR` for display but must not raise "normal" or "matters". `outIR`, replies, stars and explicit corrections are attacker-proof (barring a compromised account).
- **Per-sender influence cap:** a single profile contributes at most k (e.g. 5) examples per week to `w_user`, so one noisy sender can't drag the global-delta weights (a direct counter to Nelson's dictionary-style attack).
- **Never let learning lower a hard protection** (audit note U11/U12); the model ranks inside what rules permit.
- **Drift and decay:** accumulators decay naturally (half-life). Add explicit states: `active` (long-IR above floor), `dormant` (no events for >12-18 months), `forgotten` (user action or storage pressure). A dormant profile keeps its *security baseline* (infrastructure set, addresses) but its "matters" score decays; a reactivated dormant sender with a changed infrastructure set is exactly the lateral-phish shape and should require the second signal.
- **Weights drift:** apply L2 toward zero on `w_user` every update and a slow time decay (e.g. ×0.99/week), so old corrections fade unless reinforced; keep explicit per-sender overrides permanent until the user removes them.
- **Prior dataset poisoning:** signed datasets (U14) plus monotonic rules (a remote patch may never add free-mail domains to allow-lists).

### Gaps
- No study found of poisoning against per-user *header/relationship* baselines specifically (as opposed to token-based filters).

## 9. Evaluation without collecting user data

### Takeaway
Combine (a) public and synthetic corpora in CI for per-class precision/recall and adversarial survival, (b) a **time-split replay** evaluation on public mailboxes for relationship features (Roth's protocol), and (c) local-only self-metrics (undo, release, correction, override rates per reason code) shown to the user and optionally hand-exported as counts.

### Cited Findings
- Enron (CMU): ~150 users, ~0.5M messages, folders, no attachments, some messages redacted; Klimt & Yang count 619,446 messages / 158 users; non-commercial research use; EDRM no longer hosts it — Verified (search summaries of [CMU Enron](https://www.cs.cmu.edu/~enron/), [Klimt & Yang 2004](https://nl.ijs.si/janes/wp-content/uploads/2014/09/klimtyang04a.pdf), [EDRM 2025](https://edrm.net/2025/08/still-on-dial-up-why-its-time-to-retire-the-enron-email-corpus/)).
- Avocado Research Email Collection (LDC2015T03): emails and attachments from 279 (LDC data section says 282) accounts of a defunct IT company; licensed via LDC agreement, not open download — Verified, [LDC catalog](https://catalog.ldc.upenn.edu/LDC2015T03).
- TREC 2007 public spam corpus (trec07p): 75,419 messages (25,220 ham, 50,199 spam) delivered to one server 8 Apr - 6 Jul 2007; research use under a usage agreement; republishing not permitted — Verified, [Cormack TREC 2007 corpus page](https://plg.uwaterloo.ca/~gvcormac/treccorpus07/about.html).
- Roth et al. evaluate by predicting future interactions using only earlier ones (time split) — Verified, Roth PDF.
- Audit note C.4 specifies a synthetic labelled corpus (~300 items, ≥20 per class, ≥30 adversarial), vitest per-class P/R floors, adversarial survival rate, and local accuracy counts — Verified (repo doc).

### Inferences
- **Which dataset tests what:**
  - Enron / Avocado (real bidirectional corporate headers, multi-year): relationship features. Replay each mailbox chronologically through the profile builder; at each incoming message predict "will the user reply within 7 days" (proxy for "matters") and measure AUC/precision@k vs. baselines (raw count, recency only, current Cluster rules). Use this to choose λ, ω_out, To/Cc weights. Also measure the impersonation false-alarm rate: how often a known display name legitimately arrives from a new address (Ho's 52% question) on real data.
  - trec07p / SpamAssassin public corpus / Nazario phishing (not fetched this session): threat-score and kind precision/recall on header fields only.
  - Synthetic (repo-generated): adversarial transforms, ESP shapes, plus-addressing, i18n, Gmail/Microsoft AR header shapes, poisoning scenarios (attacker sends N benign messages then a lure; measure whether trust rose).
  - Licensing: none of these may be committed to the repo (trec07p forbids republishing; Avocado is LDC-licensed); keep an out-of-repo eval script that reads a local path and writes only metrics.
  - Caveat: Enron/Avocado are 2000s corporate mail with little bulk/marketing; they say little about consumer newsletter behaviour. Use synthetic generators for that.
- **Local self-evaluation metrics** (computed and stored only as counts in `chrome.storage.local`): undo rate per action and reason code; release vs confirm rate for holds; "Not right?" rate per decision type; override rate per bucket; Important-strip click/reply rate vs. baseline inbox; calibration bins (section 7). Show trend in a Settings "How Cluster is doing for you" panel. A rising undo rate on a reason code is the drift alarm.
- **Shadow mode** for any new model: compute new and old decisions side by side locally for N days, show nothing new, record disagreement counts and which side the user's later actions agreed with. Promote only if the new model wins on the user's own data.

### Gaps
- SpamAssassin public corpus, Nazario phishing corpus, W3C mailing-list corpus and Yahoo/Webscope email datasets were not verified this session (sizes, licences, availability).

## 10. Data model and storage/compute

### Takeaway
A unified profile is a few hundred bytes per sender with O(1) incremental updates; a 100k-message header index fits comfortably in IndexedDB under `unlimitedStorage`. Store the decayed aggregates in the profile and keep the per-message index for backfill and recomputation.

### Cited Findings
- Chrome extensions with `unlimitedStorage` have storage "limited only by the availability of space in the user's hard drive" (legacy Chrome Apps doc; may be outdated) — Verified, [Managing HTML5 Offline Storage](https://developer.chrome.com/docs/apps/offline_storage) (via search summary).
- Engagement design sizes a 500-example training buffer at ~80 KB and `w_user` at ~40 floats — Verified (repo doc).

### Inferences
- **Proposed record (IndexedDB object stores):**
  - `addressProfile` (key `addressKey`): `{rawForms[], orgKey, personId?, names: {skeleton → {firstDay, lastDay, days}} , firstSeen, lastSeen, daysSeen, acc: {outIR_s, outIR_l, inIR_s, inIR_l, replyIR, threadStartIR, starIR, tRef}, rates: {read:{k,n}, reply:{k,n}, undo:{k,n}, release:{k,n}, providerImportant:{k,n}}, auth: {alignedPass:{k,n}, infra: {"dkimD|spfDom" → {firstDay,lastDay,days,promoted}}}, replyTo: {...same shape}, kindHist: {kind → n}, overrides: {...}, state: active|dormant, schemaV}`.
  - `orgProfile` (key `orgKey`, absent for free-mail/platform): rolled-up rates and infra set, `category`, count of addresses, earliest familiarity.
  - `nameIndex` (key name skeleton → addressKeys[]) for contact-impersonation lookups.
  - `recipientSet` (hash of sorted recipients → IR) for Roth-style groups (optional).
  - `messageIndex` (key provider message id): `{t, addressKey, toPos, kind, labelsBits, authBits, unread, threadId, sizeKB}` — no subject text, or a salted hash if needed.
  - `trainingBuffer`, `modelState {w_user, b_user, platt}`, `localMetrics`.
- **Sizing:** a header index row of ~150-250 bytes × 100k ≈ 15-25 MB plus index overhead; profiles ~0.5-1 KB × ~5-10k senders ≈ 5-10 MB. Well within `unlimitedStorage`. Compute: one accumulator update per message is microseconds; a full rebuild of 100k rows is seconds in a worker-like context. In MV3 the service worker can be killed, so backfill in resumable batches keyed by a cursor (Gmail quota, 6,000 units/min per solves-it note, is the real bottleneck, not compute).
- **Incremental update:** `history.list` / delta sync → append to `messageIndex` → apply accumulator updates to the affected profiles only. Recompute profiles from the index only on schema/λ change.
- **Migration:** seed `addressProfile` from the four existing stores (knownSenders → `firstSeen`; sent-to set → `outIR` backfill; ledger → `auth.infra`/`replyTo`; engagement records → `rates.read`), then retire them behind one `senderProfile` read API so verdict, protection, screener and engagement all consume the same object (closes solves-it A6).

### Gaps
- Current (2026) Chrome docs on extension IndexedDB quota and eviction under `unlimitedStorage` were not reachable; the legacy doc is the only source.
