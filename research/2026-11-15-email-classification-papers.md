# Email sorting and identity: what the papers say (2026-11-15)

Question: how should Cluster decide a label per email, learn from corrections, and catch scams that pose as people the user knows?

Read in full (text extracted from the PDFs):

1. Wu, Hong, Chen, Liu, Liu, Yang. *One Email, Many Faces: A Deep Dive into Identity Confusion in Email Aliases.* NDSS 2026 (Best Paper). https://www.ndss-symposium.org/wp-content/uploads/2026-s148-paper.pdf
2. Grbovic, Halawi, Karnin, Maarek (Yahoo Labs). *How Many Folders Do You Really Need? Classifying Email into a Handful of Categories.* CIKM 2014. https://arxiv.org/abs/1606.09296
3. Wendt, Bendersky, et al. (Google). *Hierarchical Label Propagation and Discovery for Machine Generated Email.* WSDM 2016. https://research.google/pubs/hierarchical-label-propagation-and-discovery-for-machine-generated-email/
4. Aberdeen, Pacovsky, Slater (Google). *The Learning Behind Gmail Priority Inbox.* NIPS 2010 workshop. https://research.google/pubs/the-learning-behind-gmail-priority-inbox/
5. Cidon et al. (Barracuda). *High Precision Detection of Business Email Compromise.* USENIX Security 2019. https://www.usenix.org/conference/usenixsecurity19/presentation/cidon

Seen only as abstracts (not used for claims): Di Castro et al., WSDM 2016 (predicting read/reply/forward); Ho et al., USENIX Security 2017 and 2019 (spearphishing, lateral phishing).

## 1. Aliases (NDSS 2026)

- All 28 providers tested treat the part before @ as case-insensitive, though SMTP allows case-sensitive names.
- Only Gmail documents its alias rules: dots ignored, `+tag` ignored, `googlemail.com` = `gmail.com`. 11 providers support aliases without documenting them. Outlook, Hotmail, iCloud, Zoho, Yandex, Mail.ru and Alibaba accept `+tag`. Proton also ignores `.`, `-`, `_`.
- Yahoo supports no `+tag` alias, yet users assumed `alice+friend@yahoo.com` is Alice. 31.65% of participants who knew about aliases mistook a phishing address for a friend's alias. People who believe they understand aliasing were more often fooled.
- Attackers registered up to 139 npm accounts from one Gmail base address.

**What it means for Cluster**
- A sender must be compared by a canonical key, per provider. Today `knownSenderSet` and `sortOverrides` key on the lowercased address, so `a.lice@gmail.com` is a stranger while it is the same mailbox.
- The opposite case is a scam signal: an address that *looks* like a known contact's alias but isn't valid for that provider (`alice+x@yahoo.com`, `al.ice@outlook.com` when `alice@outlook.com` is known).

## 2. Sorting categories (Yahoo, CIKM 2014)

- Found by LDA over users' own folder names: one human category and five machine ones (Shopping, Financial, Travel, Career, Social). Only about 10% of users file mail into folders at all.
- Cascade: (1) cheap rules, including "every reply or forward is human", cover 32% of traffic; (2) a sender lookup table covers most of the rest; (3) a heavy per-message classifier gets the last ~8%.
- Address features: domain parts (`.edu`, `.gov`) and local-part words (`billing`, `noreply`, `payroll`, `careers`), matched against 500+ commercial keywords. Random strings collapse to one token.
- Behaviour features per sender: share read, deleted, replied, moved to spam, and **the names of folders users moved the sender's mail into** (a human label of the sender). Burst features: more than X messages an hour.
- **Domain level is too coarse.** Their Table 3: at `target.com`, `orders@` is Shopping, `target.jobs@` Career, `target.payroll@` Financial and `name.lastname@` human. Senders are grouped by a *canonized sender* pattern (`update+.*@facebookmail.com`), not by domain.
- The "machine-human mix" (a recruiter who sends 90% templates and 10% personal notes) is the main error when aggregating by sender.
- Evaluate per sender, not per message: a few senders send most mail, so message-level accuracy flatters the system.

## 3. Templates (Google, WSDM 2016)

- A template is a `<sender, subject pattern>` pair; the pattern removes numbers, ids and names from the subject.
- Labels spread from labelled templates to similar ones (k-nearest neighbours over template text). Reported >91% precision, >93% recall, coverage up 5.7% to 16.8% per label (Finance, Receipt, Travel). Surfaced in Gmail as Smart Labels.

**What it means**: a correction is best stored for the sender's template when one sender's mail spans labels ("Your order shipped" vs "Deals this week" from Amazon), and for the sender otherwise.

## 4. Learning from the user (Gmail Priority Inbox)

- Features: social (share of a sender's mail the user reads), content (recent terms), thread (did the user start the thread), label (labels applied by filters).
- Model = global weights + per-user weights (log odds added). The user part only stores how the user differs from everyone.
- A manual correction is weighted higher than an implicit signal. New users learn faster (higher weight).
- A per-user threshold. "When a user marks messages in a consistent direction, we perform a real-time increment to their threshold." Users disagree a lot on how much mail is important.
- Accuracy about 80 ± 5%. Error rate: global model 45%, + user models 38%, + user thresholds 31%. Users spent 6% less time reading mail.

## 5. Impersonation (Barracuda BEC-Guard)

- Features: reply-to differs from sender; how many times this sender **name + address pair** has been seen; how often the reply-to address has been seen; reply-to is a known service (LinkedIn, Salesforce); how common the name is.
- 82% of people sent from one address only. Those with many addresses were often the ones being impersonated.
- Names are normalised ("Smith, Jane", "Jane J. Smith") before matching. 98.2% precision, under 1 false positive in 5 million emails.

## What Cluster does today vs. the papers

| Paper idea | Cluster now |
|---|---|
| Reply or forward = human first | Yes (`repliesToYou`, written-by-person), now goes to Personal |
| Domain + local-part keywords | Partly: ~270 domains, a few sender regexes (shipping, receipt, jobs) |
| Sender table from corrections | Yes, exact address only; 2 Gmail swaps to learn |
| Canonized sender patterns | No |
| Template (sender + subject pattern) | No |
| Folder-move votes as labels | Only swaps between two Cluster labels |
| Global + personal, explicit > implicit | Rules + overrides; no read-rate or reply-rate per sender in labelling |
| Per-user threshold | No |
| Alias-canonical sender key | No |
| Name+address pair seen before / contact lookalike | No (has brand lookalike, reply-to to free mail, auth failures) |
