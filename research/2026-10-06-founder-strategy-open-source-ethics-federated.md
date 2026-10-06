# Cluster founder strategy: open source, ethics, CIA and a federated-learning path

_2026-10-06. Branch `fix/safety-r0`. Research only. No source code was changed._
Builds on, and does not repeat:
`2026-10-06-personas-phishing-and-web-security.md` (personas, layers L0-L3, §C cross-user learning),
`2026-10-06-quarantine-destination.md` (label tiers),
`2026-10-05-inbox-intelligence-research.md` §4-6,
`2026-10-05-algorithm-audit-and-upgrades.md` (B.3-B.5, U11, U14).

Conventions:

- Inline links are the source for each claim.
- **(Inference)** marks my own reasoning or design.
- **[secondary]** marks a claim from a secondary source or a search summary.
- **Not reached** marks a source I could not read this session.
- Code references are `path:line` on this branch. Policy quotes were fetched today (2026-10-06).

## TL;DR

1. **Federated learning on Gmail data is blocked by written text, not by taste.** The Workspace policy (updated 2026-09-03) prohibits "using user data to create, train, or improve a machine learning or artificial intelligence model beyond that specific user's personalized model". "Derived" data counts. DP, hashing and secure aggregation don't change that.
2. **Three allowed paths still deliver "it improves with more data".** (a) Each user's own model on device. (b) Signed global weights trained on public data plus scams users *forward from Gmail themselves* or donate via Takeout, which never pass through Cluster's scopes. (c) Human-reviewed rule packs fed by user-initiated reports.
3. **True federated learning is allowed in Moat.** The Chrome Web Store Limited Use policy has no AI/ML clause and allows transfers "to protect against malware, spam, phishing". Gmail-derived data must never cross into it.
4. **Org-scoped learning in Athena is grey.** "That specific user's" is not "that customer's". Ask Google in writing before building it.
5. **Best FL design for Moat:** small logistic model, FedAvg, two independent aggregators (Prio/DAP style), DP-FedAvg, FLTrust-style root set, a release gate that can only raise protection, signed and logged weights. Cost is about $0-5 a month even at 100k users. Trust and poisoning are the hard parts.
6. **The existing Athena path already sends Gmail-derived data** (sender domain, brand) to an org server. `docs/privacy.md` doesn't mention it. Disclose it.
7. **Cluster has no licence.** Legally it is "all rights reserved". Recommend GPL-3.0-or-later (matches Moat), an Apache-2.0 shared package (fits Athena), AGPL for any server.
8. **Stay free.** StopForumSpam and Safe Browsing terms forbid commercial use. OpenPhish forbids "customer protection" without written consent, so don't use it.
9. **Biggest supply-chain fix is one switch:** Chrome Web Store Verified CRX Uploads. Then signed datasets, artifact attestations and SHA-pinned Actions.
10. **Caregiver mode is dual-use stalkerware risk.** Ship it only with eight safeguards: owner present at setup, always visible, one-tap revoke, no mail content, 90-day re-consent.
11. **Training people doesn't work well; holding mail does.** Two large studies (2022, 2025) found little benefit from phishing simulations. Ideas favour holds, tripwires and call-back prompts over drills.
12. **Top new ideas:** money-request tripwire, call-back card, persona modes, community rule packs, Moat↔Cluster handshake, privacy-safe transparency page, printable family digest.
13. **Next 4 weeks:** licence, Verified CRX Uploads, signed datasets, Athena disclosure, provenance, governance files, and send Google the written question.

## 1. Federated learning: a path that is actually allowed

### 1.1 The exact policy text (fetched 2026-10-06)

Three documents govern Cluster. A fourth governs Moat. I fetched each page today and quote it
word for word.

**Google API Services User Data Policy** (page says "Last updated February 15, 2024")
([policy](https://developers.google.com/terms/api-services-user-data-policy)):

> "Limited Use: Your use of data obtained via the product's specified scopes must comply with
> the below requirements. These requirements apply to the raw data obtained from the scopes and
> data aggregated, anonymized, or derived from them."

> "Limit your use of data to providing or improving user-facing features that are prominent in
> the requesting application's user interface"

> "Transfers of data are not allowed, except: To provide or improve your appropriate access or
> user-facing features that are visible and prominent in the requesting application's user
> interface and only with the user's consent; For security purposes (for example, investigating
> abuse); To comply with applicable laws; or, As part of a merger, acquisition, or sale of assets
> of the developer after obtaining explicit prior consent from the user."

> Humans may not read the data unless (among others) "The data (including derivations) is
> aggregated and used for internal operations in accordance with applicable privacy and other
> jurisdictional legal requirements."

> "Depending on the API being accessed and number of user grants or users, applications must
> pass an annual security assessment and obtain a Letter of Assessment from a Google-designated
> third party."

This general policy has **no AI/ML clause**. It defers: "Unless stated otherwise in the product's
User Data and Developer Policy, additional requirements include". For Gmail, the product policy
is the Workspace one.

**Google Workspace API User Data and Developer Policy** (page footer "Last updated 2026-09-03 UTC")
([policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)):

> "Upon accessing Google Workspace scopes for an appropriate use, your use of the data obtained
> must comply with the below requirements. These requirements apply to data derived from both
> Sensitive and Restricted scopes."

> "Transfers of data are not allowed, except: To provide or improve your appropriate use case or
> user-facing features that are visible and prominent in the requesting application's user
> interface and only with the user's consent; For security purposes (for example, investigating
> abuse); To comply with applicable laws and/or regulations; or, As part of a merger, acquisition
> or sale of assets of the developer after obtaining explicit prior consent from the user."

> "All other transfers, uses, or sale of user data is completely prohibited, including : [...]
> Transferring, selling, or using user data to create, train, or improve a machine learning or
> artificial intelligence model beyond that specific user's personalized model for the
> appropriate use case or user-facing feature."

> "Note: Remember, our Terms of Service prohibits the scraping, building databases (including
> databases for model training purposes), or otherwise creating permanent copies of Google User
> data."

> Approved Gmail use cases include "Applications that enhance the email experience for
> productivity purposes" and "Applications that use information from emails to provide reporting
> or monitoring services for the benefit of users that improve the email experience". Not
> allowed: "Applications that use multiple accounts to abuse Google policies, bypass Gmail account
> limitations, circumvent filters and spam, or otherwise subvert abuse or safety restrictions."

> "Required security measures for Restricted Scopes also include following the Cloud Application
> Security Assessment (CASA)."

**Gmail API scope categories** ([Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)):
`gmail.modify`, `gmail.metadata`, `gmail.readonly` and **`gmail.settings.basic`** are all listed
under "Restricted scopes". `gmail.labels` is "Non-sensitive". `gmail.send` is "Sensitive". The
page adds: "If you store restricted scope data on servers (or transmit), then you must go through
a security assessment." Both scopes in `manifest.json:38-43` are therefore restricted.

**Chrome Web Store Limited Use** (footer "Last updated 2022-11-01 UTC")
([CWS Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)):

> "Extensions may only collect, use, or transmit user data that is necessary for the extension's
> disclosed single purpose, including related operational purposes, such as maintaining,
> securing, or measuring the performance and reliability of those features."

> "Collection and use of web browsing activity is prohibited, except to the extent required for a
> user-facing feature described prominently in the Product's Chrome Web Store page and in the
> Product's user interface."

> "The requirements apply to both the raw data obtained and the data aggregated, anonymized,
> de-identified, or derived from the raw data."

> "Limit your use of user data to providing or improving your single purpose. Only transfer user
> data to third parties: If necessary to providing or improving your single purpose; to comply
> with applicable laws; to protect against malware, spam, phishing, or other fraud or abuse; or,
> as part of a merger, acquisition or sale of assets of the developer after obtaining explicit
> prior consent from the user."

The CWS policy has **no AI/ML training clause** and its "prohibited" list names only personalised
ads, data brokers and credit-worthiness.

### 1.2 Which rule governs which data

| Data class | Example | Governing rules | Key consequence |
|---|---|---|---|
| **G1. Gmail API data** | Headers, label ids, history ids fetched with `gmail.modify` | Google API Services User Data Policy + Workspace policy + CWS Limited Use | AI/ML clause applies |
| **G2. Data Cluster computes from G1** | Feature vectors, sender scores, weight updates, held/released counts, hashes of domains | Same as G1. Both Google texts say "derived". CWS says "de-identified, or derived" | Hashing, DP noise and aggregation do **not** change the class. (Inference) A model gradient computed on header features is derived data |
| **G3. Cluster's own operational data** | Extension version, which toggle is on, crash stack without mail content | CWS Limited Use ("maintaining, securing, or measuring the performance") | Allowed with disclosure. Too thin to train a scam model on (Inference) |
| **G4. Mail the user sends us by their own act** | User forwards a scam from Gmail's own UI to a reporting address, or donates a Google Takeout export | Not obtained "via the product's specified scopes". (Inference) Google's API policies do not reach it. GDPR / UK GDPR and Cluster's own privacy policy do | A legitimate route to a shared training set. Needs a mailbox or upload endpoint, so a server |
| **G5. User-confirmed indicators sent through Cluster** | "Share this scam" button that sends the sender domain from Cluster | G2 (it came through the API). Transfer allowed "for security purposes" and for a visible feature "with the user's consent" | Allowed for **lists and human-reviewed rules**. Using it to fit a shared model hits the AI/ML clause (Inference) |
| **G6. Moat web data** | URL host features of a page Moat blocked, user override of a block | CWS Limited Use only. Not Gmail data | No AI/ML clause. Transfer allowed "to protect against malware, spam, phishing, or other fraud or abuse". Browsing activity needs a prominent user-facing feature |
| **G7. Public data** | Public phishing feeds, the founder's own Takeout export, synthetic mail | Feed licences (see §2.3), GDPR for any personal data in it | Free to train on within licence terms |
| **G8. Org-managed data** | Events Cluster sends to an organisation's Athena (`src/lib/athenaIntegration.ts:106-130`) | Still G2 when it leaves Cluster. The org is a separate controller for what it receives | See option (e) |

**Taint rule (Inference).** Anything in G1/G2 that crosses into Moat (for example through the
Cluster↔Moat handshake, idea 5.5) stays G2. Moat must never feed it into a shared model. Tag it
at the boundary and keep it out of any training buffer.

### 1.3 The seven candidate designs, judged against the quotes

| # | Design | What leaves the device | Verdict | Why (quote it rests on) |
|---|---|---|---|---|
| (a) | Classic FedAvg on header-feature models | Clipped, noised weight deltas from every user | **Blocked** | Deltas are G2 "derived" data. Training a shared model is "beyond that specific user's personalized model". DP and secure aggregation change the privacy, not the category. A server receiving them also triggers "If you store restricted scope data on servers (or transmit), then you must go through a security assessment" |
| (b) | FL over non-user-specific threat indicators only (infrastructure features of mail the user confirmed as a scam) | Deltas over sender-infrastructure features | **Blocked** (grey at best) | The data is still "derived" from a restricted scope. "For security purposes" permits the *transfer*, but the AI/ML clause is a separate prohibition on *use* to "create, train, or improve" a model. Only a written Google ruling could move this (option g) |
| (c) | User-initiated "Share this scam to improve Cluster" | One message's indicators (domains, auth result, brand claim), after the user sees them | **Allowed for lists. Grey for model training** | Transfer: "for security purposes" and "with the user's consent" for a visible feature. Feeding human-reviewed blocklists and rule packs is not ML training. Fitting weights on these reports is "using user data to ... train ... a machine learning ... model". Safer variant: the user forwards the mail from Gmail themselves (G4), so the data never passed through Cluster's scopes |
| (d) | Federated learning on **Moat** web data | Deltas over URL and page features, from users who opt in | **Allowed** with prominent disclosure and opt-in | CWS has no AI/ML clause. Improving phishing blocking is "providing or improving your single purpose". Must not ingest any G1/G2 taint. Must update `moat/PRIVACY.md`, which today promises "Nothing is ever sent automatically" |
| (e) | Org-scoped learning inside a managed Athena deployment | Org's own events to the org's own server | **Grey** | The text says "that specific user's personalized model", not "that customer's". An org-wide model spans many users. Strong mitigations: the org runs its own OAuth client as an **Internal** app (verification not required: "The app is only used by people in your Google Workspace or Cloud Identity organization", [Google](https://support.google.com/cloud/answer/13464323)), so the org, not the founder, is the developer of record for that deployment. The founder never sees the data. Still ask Google (g) |
| (f) | Download-only global weights trained on public / donated data + on-device personal weights | Nothing | **Allowed** | Personal model is "that specific user's personalized model". Global weights come from G4/G7 data. Same shape as the signed blocklist (`src/lib/remoteDataset.ts:61-83`) |
| (g) | Ask Google for a written ruling | Nothing yet | **Allowed, and recommended** | No public advisory-opinion process exists that I found. (Inference) Ask in the OAuth verification thread: describe (b) and (e) exactly and request the answer in writing. Treat silence as "no" |

**A related finding about today's code (Inference, grey).** The managed Athena path already
transmits Gmail-derived data: `targetIndicator` is the sender's domain, `evidence` carries the
claimed brand and signal kind (`src/background.ts:127-140`), posted to the org's `eventsUrl`
(`src/lib/athenaIntegration.ts:117-122`). That is a transfer of G2 data off the device. It is
plausibly a "security purposes" transfer to the customer's own system, and it only runs when an
admin sets managed policy (`src/lib/athenaIntegration.ts:45-50`). But
`docs/oauth-scope-justification.md:6-10` says "No Gmail data ... is transmitted to or stored on
any Cluster-operated system", which is true but silent on org systems. Disclose the Athena path
in the verification submission and in `docs/privacy.md`, which does not mention it today.

### 1.4 What "federated" can honestly mean for Cluster

Putting the verdicts together (Inference):

1. **Cluster (Gmail data): no cross-user training on anything that came through the API.**
   Learning across users happens in three allowed ways instead:
   - **Personal model on device** (algorithm note U11). Warm-started from global weights.
   - **Global weights trained on G4 + G7 data**, published signed, download only. G4 grows as
     more users *forward* scams to a reporting address or donate a Takeout of their Spam folder.
     This is "more data, better model", without touching Cluster's scopes.
   - **Human-reviewed indicator lists** fed by user-initiated reports (option c), merged like
     open-source PRs (idea 5.10).
2. **Moat (web data): real federated learning is allowed**, opt-in, with the design in §1.5.
3. **Org deployments: a tenant-scoped model inside the org's Athena**, built only after Google
   answers option (g) in writing.

So the founder's "algorithm improves as it gathers more weights" goal is met in Moat by true FL,
and in Cluster by better *published* weights plus *personal* weights. That is the line the
written policy allows today.

### 1.5 Technical design for the allowed options

**Model choice.** Logistic regression over 50-300 hand-defined features (auth verdicts, first
contact, brand-claim flags, lookalike distance, TLD class, Reply-To relation, attachment class,
lure-family hits). Optionally a tiny GBDT for the *global* model trained offline. (Inference)
Small linear models suit FL and on-device training: one round's update is a few hundred floats
(about 1 KB as float32), the loss is convex so averaging behaves well, every weight maps to a
reason code (algorithm note B.3), and clipping for DP is cheap. GBDTs do not average cleanly, so
keep them for offline training of the published model.

**Federated averaging (Moat only).** FedAvg trains locally for a few epochs and averages weighted
by sample count; the paper reports 10-100x fewer communication rounds than synchronous SGD
([McMahan et al. 2017, arXiv 1602.05629](https://arxiv.org/abs/1602.05629)). Google's production
system description is the reference for round scheduling and device selection
([Bonawitz et al. 2019, arXiv 1902.01046](https://arxiv.org/abs/1902.01046)).

**Secure aggregation.** Bonawitz et al. let a server learn only the sum of client vectors, and the
protocol tolerates dropouts ([CCS 2017, ePrint 2017/281](https://eprint.iacr.org/2017/281.pdf);
[arXiv 1611.04482](https://arxiv.org/abs/1611.04482)). It needs several interactive rounds with
clients online at the same time. (Inference) That is awkward for MV3 service workers that wake on
alarms. A better fit is **two non-colluding aggregators** in the Prio style: each client splits
its clipped vector into secret shares, each aggregator sees one share, and a validity proof
rejects malformed inputs ([Prio, Corrigan-Gibbs and Boneh, arXiv 1703.06255](https://arxiv.org/abs/1703.06255)).
The IETF PPM working group's Distributed Aggregation Protocol
([draft-ietf-ppm-dap repo](https://github.com/ietf-wg-ppm/draft-ietf-ppm-dap)) and the CFRG VDAF
spec ([repo](https://github.com/cfrg/draft-irtf-cfrg-vdaf)) standardise this. ISRG's Divvi Up
ships open implementations: `divviup/janus` (MPL-2.0, pushed 2026-10-05) and a TypeScript client
`divviup/divviup-ts` (MPL-2.0) (GitHub API, fetched today). **Not reached:** datatracker refused
connections, so I could not confirm the current draft number or whether a vector-sum VDAF is final.
The validity proof matters for poisoning: it can enforce "every coordinate is within the clip
bound", which bounds what one client can push.

**Differential privacy.** DP-SGD clips per-example gradients and adds Gaussian noise, with a
moments accountant for the privacy budget ([Abadi et al. 2016, arXiv 1607.00133](https://arxiv.org/abs/1607.00133)).
DP-FedAvg clips each *user's* update and adds noise at the server, giving user-level privacy
([McMahan et al. 2018, arXiv 1710.06963](https://arxiv.org/abs/1710.06963)). That paper's
experiments needed a very large population for small accuracy cost. (Inference) At 1k users the
noise will dominate. User-level DP is meaningful only from roughly tens of thousands of
participants per round upward. Plan for it, measure it, and publish epsilon per model version.

**Privacy without DP is weak.** Gradients can leak training inputs
([Zhu et al., Deep Leakage from Gradients, arXiv 1906.08935](https://arxiv.org/abs/1906.08935);
[Melis et al., arXiv 1805.04049](https://arxiv.org/abs/1805.04049)). This is one more reason (a)
on Gmail data would be unsafe even if allowed.

**Poisoning and Byzantine robustness.** Scammers will join and push their own domains toward
"safe".

| Defence | Source | Fit |
|---|---|---|
| Krum: pick the update closest to its neighbours | [Blanchard et al. 2017, arXiv 1703.02757](https://arxiv.org/abs/1703.02757) | Needs to see individual updates, so it conflicts with secure aggregation |
| Coordinate-wise median / trimmed mean | [Yin et al. 2018, arXiv 1803.01498](https://arxiv.org/abs/1803.01498) | Same conflict. Works with a trusted aggregator |
| Sybil detection by update similarity (FoolsGold) | [Fung et al., arXiv 1808.04866](https://arxiv.org/abs/1808.04866) | Same conflict |
| Trust bootstrapping from a small clean root dataset (FLTrust) | [Cao et al., arXiv 2012.13995](https://arxiv.org/abs/2012.13995) | Good fit: the founder holds a clean public set (G7) |
| Known attacks | Model replacement backdoors ([Bagdasaryan et al., arXiv 1807.00459](https://arxiv.org/abs/1807.00459)); local model poisoning beats Krum and trimmed mean ([Fang et al., USENIX Sec 2020, arXiv 1911.11815](https://arxiv.org/abs/1911.11815)) | Assume robust aggregation alone is not enough |

Design (Inference): bounded inputs enforced by the VDAF validity proof; norm clipping; DP noise;
then a **release gate**. Each new global model must (1) not lower the score of any domain on the
signed known-bad list, (2) not raise false positives on a fixed public "known-good" set, and (3)
be reviewed by a human who signs it. "ML recommends, a human approves" is Athena's rule
(`C:\Users\samue\Athena\README.md`). The model can only **raise** protection on its own, the same
rule as algorithm note U12.

**Minimum cohort.** (Inference) Do not run a round with fewer than 1,000 contributors, and never
publish per-feature statistics from fewer than 100. Below that, publish nothing.

**Browser-side training.** For logistic regression, plain TypeScript with SGD is enough and
avoids a dependency. If a bigger model is ever needed, TensorFlow.js trains in the browser
(`tensorflow/tfjs`, Apache-2.0) and ONNX Runtime Web added on-device training in 1.17, CPU via
WebAssembly ([Microsoft Open Source blog, Feb 2024](https://opensource.microsoft.com/blog/2024/02/06/on-device-training-training-a-model-in-browser/)
[secondary: search summary]).

**Frameworks.**

| Framework | Licence and activity (GitHub API, today) | Fit for a solo founder |
|---|---|---|
| Flower | `flwrlabs/flower`, Apache-2.0, pushed 2026-10-03 ([paper arXiv 2007.14390](https://arxiv.org/abs/2007.14390)) | Best for simulation and offline experiments in Python. Its clients are Python/mobile, so a browser client would be custom (Inference) |
| TensorFlow Federated | moved to `google-parfait/tensorflow-federated`, Apache-2.0, pushed 2026-10-05 | Research simulation. Heavy |
| FedML | `FedML-AI/FedML`, Apache-2.0, last push 2025-10-28 | Activity has slowed. Avoid as a core dependency |
| OpenFL | now `securefederatedai/openfederatedlearning`, Apache-2.0, pushed 2026-08-25 | Built for cross-silo (organisations). Matches option (e), not consumer devices |
| Divvi Up (janus, divviup-ts) | MPL-2.0 | Aggregation only. Pairs with a hand-written FedAvg loop |

Recommendation (Inference): simulate in Flower with public data first. Ship a hand-written
TypeScript client and a DAP-style aggregator only after the simulation shows a gain.

**Where aggregation runs and what it costs.** GitHub Actions cannot receive uploads (it runs on
triggers, not inbound HTTP), so it can only *train and publish*. Options:

| Host | Fit | Cost |
|---|---|---|
| Cloudflare Worker + Durable Object | Moat already runs a Worker for reports (`moat/report-worker/README.md`) | Workers Free: "100,000 per day" requests. Paid: "$5 USD per month", "10 million included per month, +$0.30 per additional million" ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)). Durable Objects Paid: "1 million / month, + $0.15/million" requests ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)) |
| A second, independent aggregator | Required for the two-server design | Must be run by a different organisation. (Inference) Ask ISRG/Divvi Up or a university partner |
| Athena | Org-scoped only (option e) | Customer pays |

Rough cost (Inference): one weekly round, one upload of about 1 KB per participant.
At 1k participants that is about 4,300 requests a month. It fits the free tier. At 100k
participants it is about 430k requests a month, inside the Paid plan's included 10 million, so
about $5 a month plus a few cents of Durable Object time. Cost is not the constraint. Trust,
poisoning and policy are.

**Making the aggregator verifiable (Inference).**

1. Aggregator code open source in the same repo, built reproducibly, with SLSA provenance (§2.4).
2. Each published model is a file with a version, training-data manifest, round size, DP
   epsilon, and evaluation numbers.
3. Sign every model with the same Ed25519 key scheme Moat already verifies
   (`moat/src/background/liveSignature.ts:1-46`). The client refuses unsigned or older versions.
4. Append every model hash to a public transparency log. Sigstore's Rekor is a public log for
   signed artifacts ([Sigstore docs](https://docs.sigstore.dev/logging/overview/)). The extension
   could check inclusion offline by shipping the log checkpoint with the model (Inference).
5. Publish the release-gate results next to each model.

### 1.6 How "more weights → better" actually behaves

- **Diminishing returns.** (Inference) For a ~200-feature linear model, accuracy saturates
  quickly once each feature has seen a few thousand labelled examples. Beyond that, more users
  mostly buy *freshness* (new campaigns seen sooner) and *coverage* (rare features), not a
  higher ceiling. The bigger gains come from better features (algorithm note U3-U5).
- **Non-IID data.** Each user's mail differs, and FedAvg degrades on skewed data. Zhao et al.
  report large accuracy drops on highly skewed splits and fix part of it with a small shared
  public dataset ([arXiv 1806.00582](https://arxiv.org/abs/1806.00582)). SCAFFOLD corrects
  client drift ([arXiv 1910.06378](https://arxiv.org/abs/1910.06378)). (Inference) The public
  G7 set doubles as the FLTrust root and the Zhao shared set.
- **Concept drift.** New scam campaigns change domains in days. (Inference) Learned weights
  should cover durable *shapes* (free-mail brand claim, lookalike of a pinned domain, first
  contact plus payment words). Fast-changing *indicators* (domains) belong in the signed list,
  refreshed daily, not in the model.
- **Evaluation without seeing data.** Federated evaluation computes metrics on device and
  aggregates only counts ([Kairouz et al., Advances and Open Problems in FL, arXiv 1912.04977](https://arxiv.org/abs/1912.04977)).
  For Cluster's Gmail side, even aggregate accuracy counts are G2 data used to "improve" a model.
  (Inference) So Cluster evaluates on the public set, and shows each user their *own* accuracy
  locally (held, released, confirmed: `src/lib/quarantineReview.ts`). Moat can run true
  federated evaluation.
- **Production precedent.** Gboard trained a next-word model with FL on phones
  ([Hard et al. 2018, arXiv 1811.03604](https://arxiv.org/abs/1811.03604)). That was a Google
  product on its own data, not a third-party app on Gmail data.

## 2. Open source done right

### 2.1 Where things stand

| Item | Today | Source |
|---|---|---|
| Cluster licence | **None.** No `LICENSE` file. `package.json:3` has `"private": true` and no `license` field | repo root |
| Repo visibility | Public (`Samuelabhinav37/cluster`, GitHub API reports `visibility: public`, `license: null`) | GitHub API, today |
| What "no licence" means | "without a license, the default copyright laws apply, meaning that you retain all rights to your source code and no one may reproduce, distribute, or create derivative works from your work" | [GitHub Docs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) |
| Promise in user docs | "Cluster's full source is on GitHub" (`docs/privacy.md:68-72`) | So it is *source-available*, not open source |
| Moat licence | GPL-3.0 (`moat/LICENSE`, `moat/package.json:5`), with a `NOTICE.md` that ships inside the package | local |
| Athena licence | Apache-2.0 (`Athena/LICENSE`) | local |
| Runtime npm deps | None. `package.json:21-33` lists only devDependencies. CI runs `npm audit --omit=dev` (`.github/workflows/ci.yml`) | local |
| Security policy | `SECURITY.md:186-196` points to private GitHub advisories | local |
| CONTRIBUTING / CODE_OF_CONDUCT | Missing in Cluster. Present in Moat and Athena | local |
| CI action pinning | Tags (`actions/checkout@v4`), not commit SHAs | `.github/workflows/ci.yml` |

### 2.2 Licence choice for Cluster

| Licence | Patent grant | Forks must stay open? | Compatible with Moat (GPL-3.0) | Compatible with Athena (Apache-2.0) |
|---|---|---|---|---|
| MIT | No explicit grant | No. A closed, ad-laden fork is legal | MIT code can go into GPL-3.0 | Yes both ways |
| Apache-2.0 | Yes: "each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable ... patent license" (§3, [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)) | No | One way only: "Apache 2 software can therefore be included in GPLv3 projects ... However, GPLv3 software cannot be included in Apache projects" ([ASF](https://www.apache.org/licenses/GPL-compatibility.html)) | Same licence |
| **GPL-3.0-or-later** | Yes: "Each contributor grants you a non-exclusive, worldwide, royalty-free patent license" (§11, `moat/LICENSE:487`) | Yes, for anyone who *distributes* a fork. A Chrome Web Store upload is distribution (Inference) | Same licence. Shared code moves freely | Athena cannot absorb Cluster code. Talking over HTTP is not linking (Inference), so the Athena integration is unaffected |
| AGPL-3.0 | Yes (GPL-3.0 base) | Yes, and also for network use: "your modified version must prominently offer all users interacting with it remotely through a computer network ... an opportunity to receive the Corresponding Source" (§13, [OSI](https://opensource.org/license/agpl-v3)) | Yes | Same as GPL |

**Recommendation (Inference):**

1. **Cluster extension: GPL-3.0-or-later.** It matches Moat, so the shared core ("parts of one
   body") can move between them without relicensing. It stops a company from taking Cluster,
   adding tracking, and shipping it closed. That matters for a product whose whole value is
   trust. It also lets Cluster bundle GPL-3.0 data such as `jarelllama/Scam-Blocklist` without a
   licence puzzle (GitHub API reports GPL-3.0 for that repo).
2. **A small shared protocol package** (event schema, signed-file format, verification code)
   under **Apache-2.0**. Athena, Moat and Cluster can all use it.
3. **Any aggregator server** (Moat FL, report intake): **AGPL-3.0**. Changes to a hosted service
   then stay public too.
4. **Published model weights and rule packs: CC BY 4.0** or CDLA-Permissive-2.0, with the
   training-data manifest attached. Where an upstream feed is GPL or non-commercial, the derived
   file inherits that, and the manifest says so.
5. **Contributions under the DCO** ([Developer Certificate of Origin 1.1](https://developercertificate.org/)),
   not a CLA. The founder keeps no special relicensing power, which is itself a trust signal.
   The trade-off: the founder can no longer relicense contributors' code alone.
6. Add a `NOTICE.md` that ships inside the package, as Moat does.

### 2.3 Data licences (blocklists and feeds)

| Source | Used by | Terms (quoted) | Status for a free Cluster |
|---|---|---|---|
| abuse.ch (URLhaus etc.) | `src/lib/blocklist.ts:1-8`, `scripts/refresh-blocklist.mjs` | "THE ABUSE.CH PLATFORMS ARE PROVIDED FREE OF CHARGE, SUBJECT TO THE FAIR USE PRINCIPLES". Query limits are "volumes reasonably expected for non-commercial or non-profit purposes". Spamhaus "acts as the primary licensee of the abuse.ch datasets". Effective 4 Nov 2025 ([terms](https://abuse.ch/terms-of-use/)) | OK while free. I found no redistribution clause. Ask abuse.ch before bundling a slice in a store package |
| StopForumSpam toxic domains | `scripts/refresh-spam-domains.mjs:6`, `:28-29` | "Your use of this data and supporting software is non-commercial. You will not charge money for any software that utilizes the data." ([legal](https://www.stopforumspam.com/legal)) | OK while Cluster is free. The script comment says "free to use", which understates it. Any paid tier must drop this list |
| disposable-email-domains | `SECURITY.md:163-165` | `LICENSE.txt` is "CC0 1.0 Universal" | No conditions |
| jarelllama/Scam-Blocklist | Moat (`moat/NOTICE.md`) | GPL-3.0 | Fine under a GPL Cluster |
| OpenPhish | Not used | "You agree not to use any part of the Services for any commercial purposes, including, but not limited to, security operations, threat intelligence, detection, enrichment, product development, automation, customer protection" without written consent ([terms](https://openphish.com/terms.html)) | **Do not use** without written consent. A shipped protection product looks like "customer protection" and "product development" even when free |
| Google Safe Browsing | Not used | "Unless you have a separate agreement with Google, you may not use the Safe Browsing API for commercial purposes" (Last modified Nov 20, 2025, [terms](https://developers.google.com/safe-browsing/terms)). "for sale or revenue-generating purposes" ([reference](https://developers.google.com/safe-browsing/reference)) | Allowed while free. Needs Google attribution on warnings. Lost if Cluster ever charges (Inference) |

(Inference) This is a concrete reason to keep Cluster free and non-commercial. Two of the free
feeds stop working the day anything is sold.

### 2.4 Verifiable builds: can a user prove the store package is the source?

| Control | What it gives | Fit |
|---|---|---|
| **Reproducible build** | "A build is reproducible if given the same source code, build environment and build instructions, any party can recreate bit-by-bit identical copies of all specified artifacts" ([reproducible-builds.org](https://reproducible-builds.org/docs/definition/)) | (Inference) Vite output is usually deterministic if the lockfile, Node version (`.nvmrc`) and timestamps are pinned. Add a CI job that builds twice and diffs |
| **Compare against the store** | A user downloads the CRX, unzips it and diffs it with their own build | (Inference) The store adds its own signature and metadata files, so compare file-by-file and ignore `_metadata/`. Publish a script that does this |
| **GitHub artifact attestations** | "GitHub uses Sigstore". Public repos write the bundle "to an immutable transparency log that is publicly readable". Reusable workflows can "meet SLSA v1.0 Build Level 3". Free plans: "only available for public repositories" ([GitHub Docs](https://docs.github.com/en/actions/concepts/security/artifact-attestations)). Verify with `gh attestation verify PATH -R ORG/REPO` ([how-to](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)) | **Yes.** Attest the release ZIP that is uploaded to the store |
| **SLSA** | Build-track levels from "provenance exists" up to "hardened builds". The site says "Version 1.2 is the current version" ([slsa.dev](https://slsa.dev/spec/v1.2/levels)) | Target Build L3 through a reusable GitHub workflow |
| **Sigstore / Rekor** | Public transparency log for signatures ([Sigstore](https://docs.sigstore.dev/logging/overview/)) | Comes with attestations. Also log model and threat-file hashes there (§1.5) |
| **Verified CRX Uploads** | "After opting in, all updates to your extension package must be signed with a key you provide. This can prevent malicious updates if your developer account is compromised." RSA 2048 ([CWS](https://developer.chrome.com/docs/webstore/update)) | **Yes, turn on now.** Closes store-account-takeover (§3) |
| **OpenSSF Scorecard** | Automated checks such as pinned dependencies, branch protection, token permissions. `ossf/scorecard`, Apache-2.0, active (GitHub API) | **Yes.** Run the Scorecard action. Fix pinning (CI uses `@v4` tags today) |

### 2.5 Governance

- `SECURITY.md` already has a private-advisory path (`SECURITY.md:186-196`). Add: supported
  versions, a 90-day coordinated-disclosure window, a safe-harbour sentence for good-faith
  research, and a PGP-free contact (GitHub advisories are enough).
- Add `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`. Moat's can be copied.
- `GOVERNANCE.md` (Inference): one maintainer today. Write down who can merge, who holds the
  signing keys, and what happens if the founder disappears (a named backup maintainer and a
  sealed key-recovery plan). This is the bus-factor answer users of a security tool deserve.
- Rule packs and blocklist changes go through PRs with two-person review once there is a second
  maintainer (idea 5.10).

### 2.6 Funding a free project ethically

| Source | Fact (quoted) | Fit |
|---|---|---|
| **GitHub Sponsors** | "Anyone who contributes to an open source project and lives in a supported region is eligible". The supported list includes India among many others. "GitHub Sponsors does not charge any fees for sponsorships from personal accounts" and "up to 6%" from organisations ([about](https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors), [setup](https://docs.github.com/en/sponsors/receiving-sponsorships-through-github-sponsors/setting-up-github-sponsors-for-your-personal-account)) | **Yes, now** |
| **Open Collective** | Open Source Collective is a "Non-profit fiscal host promoting a healthy and sustainable open source ecosystem" ([page](https://opencollective.com/opensource)). Fee not shown on the page I fetched | Good for transparent spending once there is more than one person |
| **NLnet** | Next deadline "November 3 rd 2026". First grants "Between € 5 000 and € 50 000". "Our EU-supported funds require a strong 'European dimension'; usually this means applicants should (mostly) be from Horizon Europe-eligible countries." NGI Zero Commons Fund's "thirteenth and final call ... closed on June 1 st 2026" ([propose](https://nlnet.nl/propose/), [Commons](https://nlnet.nl/commonsfund/)) | Only if the founder or a partner qualifies on the European dimension. Also: "We are not interested in AI-generated projects or proposals" |
| **OTF Internet Freedom Fund** | "Individuals ages 18+ or organizations ... irrespective of nationality" are eligible, except OFAC-sanctioned countries. "Awards are between $10,000 and $900,000". Rolling, two-stage ([OTF](https://www.opentech.fund/funds/internet-freedom-fund/)) | Fits the high-risk persona (A5) and a security audit. Frame Cluster as protection for journalists and activists. OTF also lists a "Security Lab" and "FOSS Sustainability Fund" ([funds](https://www.opentech.fund/funds/)) |
| **Sovereign Tech Fund** (now part of the Sovereign Tech Agency) | "The cost of the work described in the application must exceed €50,000". Targets "core digital infrastructure" ([STA](https://www.sovereign.tech/), [fund](https://www.sovereign.tech/programs/fund)) | **Poor fit.** Cluster is an end-user app, not infrastructure (Inference). A shared open-source scam-signal library might fit later |

Ethical funding rules (Inference): no ads, no data sales, no affiliate links in the product, no
"premium protection" that leaves free users less safe. Sponsors get a thank-you, never influence
over verdicts or rule packs. Publish income and spending.

## 3. CIA threat model

Scope: the Cluster extension, Moat, the GitHub Pages data host, the Chrome Web Store accounts,
any future aggregator, and an org's Athena. STRIDE letters: **S**poofing, **T**ampering,
**R**epudiation, **I**nformation disclosure, **D**enial of service, **E**levation of privilege.
CIA column: which property is at stake.

### 3.1 Threat table

| # | Threat | STRIDE / CIA | Control today (code) | Control to add | Residual risk |
|---|---|---|---|---|---|
| T1 | **Gmail OAuth token theft** | I, E / C | Token held by Chrome via `chrome.identity.getAuthToken` (`src/lib/gmailApi.ts:58`), not in Cluster storage. Extension-page CSP `script-src 'self'` (`manifest.json:26-28`). No content scripts or `externally_connectable` in the manifest | Keep it that way. Never add a content script on `mail.google.com` | Low. A compromised extension update (T3) would still get tokens |
| T2 | **Outlook refresh token at rest** | I / C | Access token in `chrome.storage.session`, refresh token in `chrome.storage.local` (`src/lib/providers/msalAuth.ts:74-82`). Both set to `TRUSTED_CONTEXTS` (`msalAuth.ts:31-32`) | (Inference) Wrap the refresh token with a non-extractable WebCrypto key kept in IndexedDB, so a copied profile folder alone doesn't yield a usable token. The Workspace policy asks for "tokens such as OAuth access and refresh tokens, encrypted at rest" for Google data, which sets the bar | Medium. Local malware with the user's rights can still use the browser |
| T3 | **Malicious extension update** (store account takeover, stolen upload key, insider) | T, E / C I A | None specific | **Verified CRX Uploads** ("all updates to your extension package must be signed with a key you provide", [CWS](https://developer.chrome.com/docs/webstore/update)). Hardware-key 2FA on the Google and GitHub accounts. Signed release from CI with provenance (§2.4). Two-person release rule once there is a second maintainer | Medium. A single maintainer is a single point of failure |
| T4 | **npm supply chain** | T / C I | No runtime deps (`package.json:21-33`). CI `npm ci` + `npm audit --omit=dev` (`.github/workflows/ci.yml`). Bundle check script (`scripts/check-bundle.mjs`) | Pin Actions to SHAs. `npm ci --ignore-scripts` in release builds. Dependabot. Scorecard | Low-medium. Build tools (Vite, crxjs beta) run with full access at build time |
| T5 | **Poisoned threat data** (bad publish adds `gmail.com` to the blocklist) | T / I A | Lists only *add* to the bundled set (`src/lib/blocklist.ts:39-46`). Shape check (`src/lib/remoteDataset.ts:73-74`). Min refresh interval (`remoteDataset.ts:15`). **Unsigned** | Ed25519 signature on every dataset (algorithm note U14, reuse Moat's `liveSignature.ts`). A deny-list of domains that may never be listed (free-mail, top senders). Rollback to the bundled copy on any verify failure | Low after signing |
| T6 | **Poisoned model weights** (FL in Moat, or bad global weights) | T / I | Not built | §1.5 release gate: bounded inputs, clipping, FLTrust-style root set, "may only raise protection", human sign-off, signed + logged | Medium. Slow-burn poisoning below the gate's thresholds |
| T7 | **Compromised signing key** | S, T / I A | n/a | See 3.2 | Medium |
| T8 | **Exfiltration through the extension** (a future change adds a new host) | I / C | Egress test fails on any new `fetch` caller or host literal (`src/lib/networkEgress.test.ts:42-80`). URL guard rejects non-HTTPS, credentials, private IPs (`src/lib/netGuard.ts:42-67`). Manifest host list is short (`manifest.json:31-37`) | Add the Athena and favicon paths to `docs/privacy.md`. Add a test that `manifest.json` host permissions match an allow-list | Low |
| T9 | **Org telemetry over-collection** (Athena path) | I / C | Managed-policy only (`src/lib/athenaIntegration.ts:45-50`). Endpoints must be public HTTPS (`:34-36`). Events carry domain, brand, rule id, not subjects (`src/background.ts:127-140`). Queue capped at 200 (`athenaIntegration.ts:28`) | Show the user a visible "Your organisation receives security events" line. Document fields. Never send local parts of addresses | Low-medium. Org admins can correlate sender domains with users |
| T10 | **Wrong quarantine of real mail** (inbox integrity) | T / I A | Known-correspondent guard unless auth fails (`src/background.ts:197-207`). Label only, never Spam or Trash (quarantine note §0). Undo via action log. Release lowers the score (`src/lib/quarantineReview.ts`) | Fix AR parser and brand bugs first (algorithm note U1, U4). Treat release in Gmail as "not a scam" (quarantine note TL;DR 9). Weekly "held mail" digest in the label itself. A "never hold" list for pinned domains | Medium. A missed job offer or closing statement is a real harm (§4.5) |
| T11 | **Gmail API quota exhaustion / throttling** | D / A | Retries on 429, 5xx and Gmail's 403 rate-limit reasons, honours `Retry-After` (`src/lib/httpRetry.ts:10-24`, `:73`). Quota headroom ledger gates background work (`src/background.ts:93-102`, `:279`) | Keep the arrival lane at `history.list` (2 units). Back off when headroom is low and say so in the UI | Low |
| T12 | **Chrome closed / service worker asleep** | D / A | Delivery-time Gmail filters for sort buckets (`src/lib/serverSort.ts`) | Security filters for the signed list and user blocks (personas note B.3). Honest "last check" time | Medium. Between Chrome sessions only filters protect |
| T13 | **Filter cap** (1,000 per account) | D / A | Packed `from:` queries | Reserve budget. Never delete user-made filters. Detect and warn near the cap | Low |
| T14 | **User locked out of important mail** (held mail never seen) | D / A | Mail stays in Gmail under a visible label. Never deleted by Cluster | Label name is the warning. No auto-escalation to Spam without a founder decision (quarantine note TL;DR 10) | Low-medium |
| T15 | **Repudiation: "Cluster moved my mail"** | R / I | Action log with undo | Export of the action log. Each hold records its reason codes | Low |
| T16 | **Spoofed Authentication-Results** | S / I | Trusts only provider authserv-ids (`src/lib/emailAuth.ts:29-54`) | Tokenised parser (algorithm note U1) | Low after U1 |
| T17 | **Cluster↔Moat bridge abuse** (another extension pretends to be Cluster) | S, T / I | Not built | Allow-list exact extension ids in `externally_connectable`. One-way, domains only. Taint tag (§1.2) | Low |
| T18 | **GitHub Pages / account takeover** of the dataset host | T / I A | Shape check only | Signatures make the host untrusted. Hardware-key 2FA | Low after signing |

### 3.2 Key management for signing keys

(Inference, sized for a solo founder)

| Key | Purpose | Where it lives | Rotation |
|---|---|---|---|
| Dataset + model signing key (Ed25519) | Signs threat files, rule packs, model weights | Offline, on a hardware token or an encrypted offline file. **Not** a GitHub secret | Ship *two* public keys in each release (current + next). Rotate yearly or on suspicion |
| CI attestation | Build provenance | Keyless, GitHub OIDC + Sigstore (§2.4) | Nothing to store |
| CWS Verified CRX Upload key (RSA 2048) | Gates store updates | Offline, separate from the dataset key | Rotate through the store's process if lost |
| Moat report-worker GitHub token | Files issues | Cloudflare secret, fine-grained, issues only (`moat/report-worker/README.md`) | 90 days |

Rules: different keys for different jobs. Keys never in the repo or in CI logs. A written
recovery plan held by a trusted second person (§2.5).

### 3.3 Incident response (Inference)

1. **Detect.** Watch: store review emails, Scorecard drops, signature-verify failures reported
   by users, unexpected dataset diffs (CI compares each new file to the last).
2. **Contain.** Pull the bad dataset (clients fall back to the bundled copy). Unpublish or
   roll back the store item. Revoke the key by shipping a release that drops it.
3. **Notify.** Users through the extension's "What's new" card and the GitHub advisory. Google
   at `security@google.com` if Google user data may have been exposed: the Workspace policy
   says "You agree to promptly notify Google at security@google.com of any known or suspected
   unauthorized access" ([policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)).
   GDPR breach rules if a server ever holds personal data.
4. **Recover.** New keys, a clean build from a tagged commit, a public post-mortem.
5. **Practise.** One tabletop drill per quarter using T3 and T5.

## 4. Ethics: the lines we will not cross

### 4.1 Dark patterns

- The FTC's 2022 staff report describes "design practices known as 'dark patterns' that can trick
  or manipulate consumers into buying products or services or giving up their privacy". Named
  tactics include "making it difficult for consumers to cancel", "burying key terms" and
  "tricking consumers into sharing their data"
  ([FTC press release, Sep 2022](https://www.ftc.gov/news-events/news/press-releases/2022/09/ftc-report-shows-rise-sophisticated-dark-patterns-designed-trick-trap-consumers);
  [report PDF](https://www.ftc.gov/system/files/ftc_gov/pdf/P214800%20Dark%20Patterns%20Report%209.14.2022%20-%20FINAL.pdf),
  PDF text not extracted this session).
- EU DSA Article 25 bars online platforms from designing interfaces "in a way that deceives or
  manipulates" users or impairs "free and informed decisions", and names repeated prompts for a
  choice already made [secondary: search summary and
  [CMS DigitalLaws](https://www.cms-digitallaws.com/en/dsa/article-25/); **Not reached:** EUR-Lex
  returned empty pages]. (Inference) Cluster is not an "online platform" under the DSA, but the
  article is a good bar to meet anyway.

Cluster rules (Inference): no confirm-shaming ("No, I like scams"). Opt-ins default off and are
equal-weight buttons. Never re-ask a declined opt-in more than once per major version.
Uninstall and "turn off quarantine" are one click away and never hidden. Fear-based copy is
banned: quarantine copy states facts, not threats.

### 4.2 Consent quality for any opt-in (FL in Moat, sharing a scam, link checks)

The Workspace policy already sets a strong bar: the disclosure "Cannot be placed only in a
privacy policy", "Must require affirmative user action", "Must not interpret navigation away
from the disclosure ... as consent" and "Must not utilize auto-dismissing or expiring messages"
([policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)).
Apply the same bar to Moat. Add (Inference): show exactly what will be sent, in the user's
language, before each first send. Make withdrawal as easy as opt-in, and make it delete anything
queued.

### 4.3 Paternalism vs autonomy for older adults

Quarantine-on-by-default is paternalistic. It is justified because held mail stays in the
user's own mailbox, is one tap from release, and is never deleted (quarantine note). The
personas note found older users stay susceptible across repeated exposure (Lin et al. 2019,
cited there). (Inference) The line: Cluster may *hold*, it may never *hide*. The account owner
always sees the label, always can release, and always can turn quarantine off without anyone
else's permission.

### 4.4 Caregiver mode: the abuse risk

The danger is real. The Coalition Against Stalkerware describes tools that "run hidden in the
background, without the affected person knowing or giving their consent", and notes "legitimate
apps and other kinds of technology can and often do play a role in such situations"
([stopstalkerware.org](https://stopstalkerware.org/), [media page](https://stopstalkerware.org/information-for-media/)).
Chatterjee et al. found that most apps usable for intimate-partner surveillance are "dual-use":
legitimate purpose, easily repurposed
([IEEE S&P 2018](https://ieeexplore.ieee.org/document/8418618) [secondary: abstract via
[Semantic Scholar](https://www.semanticscholar.org/paper/The-Spyware-Used-in-Intimate-Partner-Violence-Chatterjee-Doerfler/845f45f8412905137bf4e46a0d434f5856cd3aec)]).
Freed et al. studied 89 participants and describe how abusers "exploit technologies to
intimidate, threaten, monitor, impersonate, harass, or otherwise harm their victims"
([CHI 2018](https://doi.org/10.1145/3173574.3174241) [secondary: abstract via search; ACM
returned 403]).

A "caregiver mode" in Cluster is dual-use by design. Safeguards (Inference), all mandatory:

1. **Set up on the account owner's own browser, with the owner present.** No remote install.
2. **Visible to the owner, always.** A permanent line in the popup: "Helper mode is on. Set up
   by <name> on <date>." No stealth option, ever.
3. **Revocable by the owner in one tap**, without the helper's approval or a password.
4. **No mail content.** The helper never sees subjects, bodies or senders through Cluster. They
   see held mail only through Gmail delegation, which Gmail itself shows to the owner.
5. **No forwarding, no location, no read receipts.** Cluster adds no new channel out.
6. **Periodic re-confirmation.** Every 90 days the owner is asked, privately, "Do you still
   want <name> to help?" with "No" as an equal button.
7. **Abuse-aware copy.** A link to support resources in the helper-mode screen.
8. **Never market it as monitoring** a partner, spouse or adult child.

### 4.5 False positives that harm small legitimate senders

(Inference) A held invoice from a one-person business, a recruiter's first email, or a
landlord's new address is real harm to two people: the user and the sender. Rules:

- Two independent signals before a hold (algorithm note U5). First contact alone never holds.
- No permanent reputation for a domain from one user's report. Lists change only through
  reviewed PRs with evidence (idea 5.10).
- A public, simple appeal path for senders who believe they are wrongly listed (a GitHub issue
  template), answered within a stated time.
- Measure the false-positive rate on a public known-good set before every release.

### 4.6 Bias

(Inference) Expected skews: English-only lure lexicons (`src/lib/threatSignals.ts:291-297`)
miss non-English scams, so non-English users get *less* protection. Senders on free-mail or
new small domains get flagged more, which hits small businesses, community groups, and senders
from countries where free-mail is the norm. Controls: per-language lexicons (algorithm note
U10); never treat free-mail alone as a signal (the brand-claim rule needs a brand); measure
hold rates by sender TLD and language on the public evaluation set and publish them.

### 4.7 Transparency of verdicts

Every hold shows up to three plain reasons (personas note B.6). This follows the reason-code
logic of 12 CFR 1002.9 already cited in the algorithm note. GDPR Article 22 gives a right "not
to be subject to a decision based solely on automated processing ... which produces legal
effects ... or similarly significantly affects him or her"
([gdpr-info.eu, unofficial text](https://gdpr-info.eu/art-22-gdpr/) [secondary]). (Inference)
A reversible label is unlikely to meet that bar, but the spirit applies: explain, and let the
person override.

### 4.8 Accessibility

Target WCAG 2.2 AA ([W3C](https://www.w3.org/TR/WCAG22/)) for the dashboard and popup. Never
colour alone for risk. Plain-language patterns from W3C COGA (personas note A, D.4).

### 4.9 Children's data

COPPA applies to "operators of websites or online services directed to children under 13 years
of age" and to operators with "actual knowledge that they are collecting personal information
online from a child under 13"
([FTC COPPA](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa)).
(Inference) Cluster collects nothing on a server, so it is not "collecting" in the usual sense.
Any server feature (reports, Moat FL) must exclude under-13s, and Cluster should not market to
children. Supervised child Google accounts are out of scope (open question carried from the
personas note).

### 4.10 GDPR and UK GDPR basics, even without a server

- A user running Cluster for themselves is likely within "a purely personal or household
  activity" (GDPR Art. 2(2)(c), [gdpr-info.eu](https://gdpr-info.eu/art-2-gdpr/) [secondary]).
  (Inference) The founder is not a controller of on-device data the founder never receives.
- The moment anything reaches a founder-run endpoint (scam reports, Moat FL, a reporting
  mailbox), the founder is a controller. Legal basis candidates: consent, or legitimate
  interest. Recital 47: "The processing of personal data strictly necessary for the purposes of
  preventing fraud also constitutes a legitimate interest of the data controller concerned."
  Recital 49 covers processing "strictly necessary and proportionate for the purposes of ensuring
  network and information security" ([Recital 47](https://gdpr-info.eu/recitals/no-47/),
  [Recital 49](https://gdpr-info.eu/recitals/no-49/) [secondary: unofficial mirror; EUR-Lex not
  reached]).
- A forwarded scam email contains third parties' data (the user's own address, sometimes names).
  Strip recipient headers on intake, keep only what the rule pack needs, set a retention limit.

### 4.11 The Cluster pledge (draft the founder could publish)

1. Cluster is free. No ads, no data sales, no paid tier that makes free users less safe.
2. Your mail never leaves your device through Cluster unless you press a button that says
   exactly what will be sent. The one exception is a work install your organisation manages,
   which sends minimal security events to your organisation's own server, and Cluster tells
   you when that is on.
3. Cluster holds suspected scams. It never deletes your mail on its own judgement.
4. You can always see why something was held, and undo it in one tap.
5. No one can use Cluster to watch you without you seeing it, and you can switch helpers off
   at any time.
6. We do not train shared AI on your Gmail. Your personal model stays on your device.
7. Every build is open source and verifiable against the code.
8. We publish our mistakes: false-positive rates, incidents and fixes.
9. We treat non-English mail and small senders as fairly as big brands, and we measure it.
10. If we ever change these promises, we will tell you first, and the old version stays
    available.

## 5. New creative product ideas

Persona codes as in the personas note: 1 student, 2 store owner, 3 eighty-year-old, 4 creator,
A1 caregiver, A2 job seeker, A3 home buyer/renter, A4 newcomer, A5 high-risk.
Policy: **allowed** / **grey** / **blocked**, judged against §1.1. Effort: S days, M 1-2 weeks,
L weeks.

Two research results shape this whole list:

- **Training people barely works; holding mail does.** In a 15-month study of more than 14,000
  employees, "embedded training during simulated phishing exercises ... does not make employees
  more resilient to phishing, but instead it can have unexpected side effects that can make
  employees even more susceptible" ([Lain et al., IEEE S&P 2022, arXiv 2112.07498](https://arxiv.org/abs/2112.07498)).
  A 2025 study of over 19,500 UC San Diego Health staff found no link between recent annual
  training and clicking, and limited gains from embedded training
  ([Ho et al., IEEE S&P 2025, PDF](https://people.cs.uchicago.edu/~grantho/papers/oakland2025_phishing-training.pdf)
  [secondary: figures via search summary]).
- **Crowd reports work.** The same Lain study found "using the employees as a collective
  phishing detection mechanism is practical in large organizations" and allows "fast detection
  of new phishing campaigns" (same arXiv abstract). That supports user-initiated reporting
  (option c) over passive telemetry.

### 5.1 Money-request tripwire with pause-and-verify

- **Pain:** BEC $3.05B and real-estate fraud about $275M in IC3 2025 (personas note, evidence
  base). These scams usually pass DMARC.
- **What:** first contact (or rare sender) + payment-change words ("new bank details", "updated
  wire instructions", "change of account") in the subject, or a lookalike of a pinned domain.
  Hold, and show a three-step checklist: "1. Don't reply to this email. 2. Call them on a number
  you already had. 3. Ask: did you change your bank details?"
- **Personas:** 2, A3, freelancer, 3. **Policy:** allowed (on device). **Effort:** S-M.
  **Risk:** false holds on genuine supplier changes. Mitigate with a "we did change" release.

### 5.2 "Call back on a number you already have" card

- **Pain:** callback and tech-support scams ($2.13B, IC3 2025) often carry no link at all.
- **What:** when a held message's subject contains a phone number or a brand claim, the card
  says "Don't call the number in this email". The user can save each real company's number once
  ("Your bank's number: from the back of your card"). Stored only on device.
- **Personas:** 3, A1, 2. **Policy:** allowed. **Effort:** S. **Risk:** low.

### 5.3 Persona modes (one switch, safe presets)

- **Pain:** one threshold can't serve a job seeker (wants strangers) and an 80-year-old (doesn't).
- **What:** "Job search", "Buying a home", "Running a shop", "Helping a parent", "High-risk"
  presets. Each sets Screener, hold thresholds, lexicons, pinned domains. Each shows what it
  changed. Auto-expires (job search and home buying end) with a reminder.
- **Personas:** all. **Policy:** allowed. **Effort:** M. **Risk:** mode confusion. Keep it to
  five.

### 5.4 Scam "vaccine" drills (opt-in, honest)

- **Pain:** people want to learn. But the evidence above says simulated phishing barely helps
  and can backfire.
- **What:** **not** fake emails in the inbox. Instead an opt-in, clearly labelled "Spot the scam"
  card in the dashboard using *the user's own held mail* (already on device): "This was held.
  Can you spot why?" then reveal the reasons. No tracking, no score sent anywhere.
- **Personas:** 1, A2, A4, 4. Not for 3 (prevention over education, personas note D.4).
  **Policy:** allowed. **Effort:** S. **Risk:** low. Do not inject simulated mail into Gmail:
  `gmail.insert` is restricted and fake mail in a real inbox is itself deceptive (Inference).

### 5.5 Moat↔Cluster local handshake

- **Pain:** a held email's link is still clickable from the phone or later from history.
- **What:** Cluster sends Moat the registrable domains of links and senders from held mail,
  over `externally_connectable` between two fixed extension ids. Moat warns (not blocks) if the
  user visits one within 30 days. Nothing leaves the device. Data carries a G2 taint tag and
  never enters Moat's FL buffer (§1.2).
- **Personas:** 3, A1, 4. **Policy:** allowed (local, single-purpose stays intact for each).
  **Effort:** M. **Risk:** cross-extension trust. Both must work alone.

### 5.6 Verified-sender directory from BIMI / VMC (download only)

- **Pain:** users can't tell real brand mail from fakes.
- **Fact:** Gmail BIMI needs "a Verified Mark Certificate (VMC) or a Common Mark Certificate
  (CMC)", and "In Gmail, you'll see a checkmark next to senders verified with a VMC"
  ([Google](https://support.google.com/a/answer/10911320)). The API does not expose that
  verdict (inbox note §4a).
- **What:** the founder crawls public DNS (`default._bimi.<domain>`) for brand domains offline,
  and publishes a signed list "domains with a verified mark". Cluster then says "Verified sender:
  PayPal" only when the From domain is on the list **and** DMARC is aligned-pass.
- **Personas:** 3, A4, 1. **Policy:** allowed (public data, G7). **Effort:** M. **Risk:**
  verified does not mean honest (RFC 8601 point in personas note B.1). Never use it to *lower*
  a hold.

### 5.7 Inbox "will" / legacy contact helper

- **Pain:** bereaved families can't reach accounts, and scammers target the newly bereaved
  (Inference).
- **Fact:** Google's Inactive Account Manager lets you "select up to 10 people to receive this
  data", and Google can "work with immediate family members and representatives to close a
  deceased person's account" ([Google](https://support.google.com/accounts/answer/3036546)).
- **What:** Cluster does not build its own. It walks the user through Google's Inactive Account
  Manager, and offers a printable one-page "where my important mail lives" sheet (vault labels,
  pinned domains) generated on device.
- **Personas:** 3, A1. **Policy:** allowed. **Effort:** S. **Risk:** low. Must never store
  credentials.

### 5.8 Family digest without a server

- **Pain:** the helper isn't present when the scam lands (personas note A1).
- **What:** a weekly on-device summary the owner can **choose** to print or share: "3 scams held
  this week. Types: fake invoice, delivery fee. Nothing needs your attention." Counts and types
  only, never senders or subjects. Shared through the OS share sheet or a PDF. The owner presses
  share every time.
- **Personas:** 3, A1. **Policy:** allowed (user-initiated, contains no Gmail content beyond
  counts). **Effort:** S. **Risk:** low.

### 5.9 Public transparency dashboard (privacy-safe)

- **Pain:** trust in a security tool needs evidence.
- **What:** publish what the founder *does* know without telemetry: dataset versions and sizes,
  signature hashes and log entries, release-gate results, the public false-positive rate, open
  sender appeals and response times, income and spending. For Moat only (if FL ships), round
  sizes and DP epsilon.
- **Personas:** all, plus press and funders. **Policy:** allowed (no user data). **Effort:** S-M.
  **Risk:** low. Do **not** publish Cluster user counts derived from Gmail data.

### 5.10 Community rule packs, reviewed like code

- **Pain:** one founder can't track every scam wave in every language.
- **What:** rule packs (lexicons, brand domains, government suffixes, ATS domains) live as files
  in a public repo. Anyone can propose a change by PR with evidence. CI tests each change against
  the public known-good set. Merged packs are signed and shipped as data (§1.5).
- **Personas:** A4 (languages), A2 (ATS lists), all. **Policy:** allowed (public contributions,
  not Gmail data). **Effort:** M. **Risk:** poisoning by PR. Two-person review, and rules may
  only raise protection.

### 5.11 "Share this scam" (user-initiated reporting, extended)

- **Pain:** the decided one-tap reporting sends to public databases. The founder also wants
  Cluster to improve.
- **What:** one more destination in the report sheet: Cluster's public rule-pack repo, as a
  pre-filled GitHub issue with only the sender domain, link domains and reason codes, shown in
  full before sending, submitted from the user's own GitHub account. Or "forward it to
  reports@<cluster domain>" from Gmail itself (G4), which feeds human-reviewed lists and the
  public training set.
- **Personas:** 1, 4, A2, A5 (power users). **Policy:** allowed for lists; grey if the data then
  trains weights (§1.3 c). **Effort:** S (issue) / M (mailbox). **Risk:** changes the "nothing
  is sent to us" wording. Founder decision.

### 5.12 Offline-first export of your own scam analytics

- **Pain:** users who report to police, banks or IC3 need evidence.
- **What:** export held-mail records (date, sender, reason codes, Gmail message link) as CSV or
  a printable PDF, on device. Pre-formatted for an IC3 or Action Fraud report.
- **Personas:** 2, 3, A1, A3. **Policy:** allowed (user's own data, user's own act).
  **Effort:** S. **Risk:** low.

### 5.13 Pinned "people I pay" list

- **Pain:** BEC and real-estate wire fraud imitate known counterparties (personas note A3).
- **What:** pin up to 20 domains (title company, landlord, suppliers). Lookalikes of a pinned
  domain hold instantly. Pinned real domains are never held without an auth failure.
- **Personas:** 2, A3, freelancer, 1. **Policy:** allowed. **Effort:** M (already ranked #7 in
  the personas note). **Risk:** pinning UX.

### 5.14 "Second opinion" before you pay (on-device AI, user-triggered)

- **Pain:** people ask friends "is this real?" too late.
- **What:** a button on a held or flagged message: "Explain this to me". Chrome's on-device
  Gemini Nano (already used, `docs/privacy.md:28-35`) reads only the subject and Cluster's
  reason codes, never the body unless the user also presses Deep scan, and explains in plain
  words. "The LLM explains" only; it never changes a verdict (Athena's rule).
- **Personas:** 3, A4, 1. **Policy:** allowed (on device). **Effort:** S-M. **Risk:**
  hallucinated reassurance. The model may only add caution, never say "safe".

### 5.15 Moat federated "scam page" model (the real FL)

- **Pain:** new scam shops and fake login pages appear daily. Lists lag.
- **What:** §1.5 design, Moat only, opt-in. A small logistic model over page-host features
  (age bucket from public lists, TLD class, brand token in host, form-on-HTTP, punycode). Local
  updates from the user's own "this is a scam" and "this is fine" taps. Two-aggregator DAP, DP,
  release gate, signed weights.
- **Personas:** all. **Policy:** allowed under CWS Limited Use with prominent disclosure.
  **Effort:** L. **Risk:** poisoning, and Moat's "Nothing is ever sent automatically" promise
  changes. Founder decision.

## 6. Recommendations

### 6.1 Ranked table

Goal codes: **C** confidentiality, **I** integrity, **A** availability, **E** ethics, **L**
learning, **G** growth. Privacy: **none** (nothing new leaves), **opt-in**, **posture** (changes
a written promise).

| # | Item | Goals | Personas | Privacy | Policy | Effort | Risk |
|---|---|---|---|---|---|---|---|
| 1 | Add a licence: **GPL-3.0-or-later** for Cluster, Apache-2.0 shared protocol package, `NOTICE.md` | E, G | all | none | allowed | S | Low |
| 2 | **Verified CRX Uploads** + hardware-key 2FA on Google and GitHub | C, I | all | none | allowed | S | Low |
| 3 | **Sign every dataset** (Ed25519, Moat's verifier), deny-list for never-blockable domains | I, A | all | none | allowed | S | Low |
| 4 | Disclose the Athena managed path in `docs/privacy.md` and the OAuth submission | C, E | org users | none | allowed (disclosure) | S | Low |
| 5 | Release provenance: GitHub artifact attestations, SHA-pinned Actions, Scorecard, reproducible-build diff job | I | all | none | allowed | S-M | Low |
| 6 | Governance files: CONTRIBUTING, CODE_OF_CONDUCT, GOVERNANCE (bus factor, key recovery), SECURITY.md disclosure window | E, I | all | none | allowed | S | Low |
| 7 | Money-request tripwire + pinned "people I pay" (5.1, 5.13) | I, E | 2, A3, 3 | none | allowed | M | Medium (FPs) |
| 8 | Call-back card (5.2) + plain three-reason holds | I, E | 3, A1 | none | allowed | S | Low |
| 9 | Personal on-device model (algorithm note U11), warm-started from signed global weights | L, I | all | none | allowed | L | Medium |
| 10 | Public training set (G7 + forwarded reports + Takeout donations) and offline training pipeline in Flower simulation | L | all | posture (if a reports mailbox) | allowed | M | Medium (GDPR intake) |
| 11 | Community rule packs via PR (5.10) | L, G, E | A4, A2, all | none | allowed | M | Medium (PR poisoning) |
| 12 | "Share this scam" to the rule-pack repo (5.11) | L, G | power users | opt-in / posture | allowed for lists | S | Low-medium |
| 13 | Caregiver mode with the eight safeguards (4.4) | A, E | A1, 3 | none | allowed | M | **High if safeguards are skipped** |
| 14 | Persona modes (5.3) | E, G | all | none | allowed | M | Low |
| 15 | Moat↔Cluster handshake with taint tag (5.5) | C, I | 3, A1, 4 | none | allowed | M | Medium |
| 16 | Transparency dashboard + Cluster pledge (5.9, 4.11) | E, G | all | none | allowed | S-M | Low |
| 17 | BIMI/VMC verified-sender list (5.6) | I | 3, A4 | none | allowed | M | Medium (false trust) |
| 18 | Export + family digest + legacy helper (5.12, 5.8, 5.7) | A, E | 3, A1, 2 | none | allowed | S each | Low |
| 19 | Ask Google in writing about (b) and (e) | L | org, all | none | allowed | S | None |
| 20 | Moat federated scam-page model (5.15) | L | all | opt-in / posture | allowed (CWS) | L | Medium-high (poisoning) |
| 21 | Org-scoped model in Athena | L, G | org users | org posture | **grey** until Google answers | L | Medium |
| 22 | FedAvg or indicator-FL on Gmail-derived data | L | all | posture | **blocked** | — | **Don't** |

### 6.2 Roadmap

**Next 4 weeks (trust foundations, all S).** #1 licence. #2 Verified CRX Uploads and 2FA.
#3 signed datasets. #4 Athena disclosure. #5 provenance and pinning. #6 governance files.
Send #19 to Google with the OAuth verification. Publish a draft of the pledge (4.11) for
comment.

**Next quarter (protection that uses personal context).** #7 tripwire and pinned domains.
#8 call-back card. #14 persona modes. #13 caregiver mode, only with every safeguard. #11
community rule packs. #12 share-to-repo. #18 export and digest. #16 transparency page. Start
#10: build the public evaluation set and run Flower simulations offline.

**Later (learning, after evidence).** #9 personal model once #10 gives a baseline to beat.
#15 Moat handshake. #17 BIMI list. #20 Moat FL, only if simulations show a gain at realistic
cohort sizes and a second aggregator partner exists. #21 only with Google's written answer.

### 6.3 Founder decisions, in plain words

1. **Licence.** GPL-3.0-or-later (forks must stay open, matches Moat) or Apache-2.0 (anyone can
   close a fork, matches Athena)? Recommended: GPL for the extension, Apache for the small shared
   package.
2. **No shared AI on Gmail data.** Do you accept that Cluster will never train a shared model
   on anything read through the Gmail API, and that "learning from everyone" happens through
   public data, donated or forwarded scams, reviewed rule packs, and each user's own on-device
   model?
3. **Will Cluster ever receive anything?** A reports mailbox or a "share this scam" issue makes
   "nothing is sent to us" untrue in its strict form. Keep the strict promise, or change it to
   "nothing is sent to us unless you press Share"?
4. **Real federated learning in Moat?** It is allowed, but it ends Moat's "Nothing is ever sent
   automatically" promise for people who opt in, and it needs a second, independent aggregator.
   Yes, later, or never?
5. **Stay free and non-commercial forever?** StopForumSpam ("You will not charge money for any
   software that utilizes the data") and Safe Browsing ("you may not use the Safe Browsing API
   for commercial purposes") depend on it. Recommended: yes, funded by sponsors and grants.
6. **Caregiver mode.** Ship it only with all eight safeguards in §4.4, including the
   always-visible banner and 90-day re-confirmation? Or not at all?
7. **Org deployments.** Ask Google before building an org-wide model in Athena, and accept "no"
   if that is the answer?
8. **Who is your backup?** Name a second person for keys and repo access before user numbers
   grow.
9. **Publish the pledge?** Once public, every promise becomes a commitment users will hold you
   to.

### Sources not reached or only partly read

- **EUR-Lex** returned empty pages for the DSA and the GDPR. DSA Art. 25 is paraphrased from a
  search summary and CMS DigitalLaws. GDPR text is quoted from the unofficial gdpr-info.eu mirror.
- **datatracker.ietf.org** refused connections. The DAP and VDAF drafts are cited by their
  GitHub repos, with current draft numbers not confirmed.
- **FTC dark patterns report PDF** downloaded but not text-extracted (no PDF library). Quotes
  come from the FTC press release.
- **ACM DL** (Freed et al. CHI 2018) returned 403. IEEE (Chatterjee et al.) returned a
  challenge page. Both summarised from abstracts via search.
- **Ho et al. 2025** figures come from a search summary of the paper and press coverage.
- **ONNX Runtime Web training** status comes from Microsoft's Feb 2024 blog via search.
- **Open Collective fees** were not on the page I fetched.
- No public Google process for advisory rulings on the Limited Use AI/ML clause was found.
