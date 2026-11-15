# What the 1,000 and 2,000 email tests teach, and how to catch these mistakes earlier

2026-11-15. Follows `2026-11-15-email-classification-papers.md`.

## What went wrong in the tests, grouped by cause

| Cause | Examples from the 2,000 test | Share of misses |
|---|---|---|
| A domain missing from a hand list | lyftmail.com, redditmail.com, email-marriott.com, shopifyemail.com, docs.google.com | about half |
| A subject phrase the regex didn't know | "used to sign in", "Your sign-in link", bounce subjects, "Jane commented on" | about a quarter |
| Person vs company guessed wrong | mcinfo@ups.com and store+N@t.shopifyemail.com went to Personal; a fake invoice from gmail went to Receipts | about a fifth |
| Mistakes in my own generator | address and name picked separately, three times | inflated the error rate |

The fixes so far are mostly more list entries and more regex words. That works only for the mail I thought of. A real inbox will have senders and subjects neither test has.

## What the research says

1. **Separate person from machine first, and use what every message carries** (Grbovic et al., Yahoo, CIKM 2014; Yahoo's AAAI 2022 human/machine classifier). The strongest cheap signals they used were:
   - words in the address (billing, noreply, commercial words: they used a list of more than 500);
   - an address that starts with a common first name, which points to a person;
   - "unsubscribe" in headers;
   - how often you open a sender's mail (read ratio);
   - Re:/Fwd: volume.

   Yahoo's AAAI 2022 model raised precision from 94.7% to 96.0% and recall from 70.5% to 78.8% over its older sender-level model.
2. **Gmail's own tabs are a classifier we get for free.** Cluster already reads every tab, but sorting only uses Promotions. Updates, Social and Forums are Google's own decision that the mail is machine mail. In the 2,000 test, the Reddit mail sat in the Social tab and still went to Newsletters.
3. **Bulk mail must announce itself.** Google's rules for senders of more than 5,000 emails a day require SPF, DKIM, DMARC alignment and one-click List-Unsubscribe (support.google.com/a/answer/81126). Bulk mail also goes out through a sending service, which shows in the headers:
   - **Return-Path:** a bounce domain such as em.sendgrid.net, amazonses.com or a bounces.* subdomain;
   - **Message-ID:** the sending service's domain.

   A person's mail has a Return-Path equal to their own address, and a Message-ID from their mail app (Gmail's is @mail.gmail.com). **Cluster already fetches Return-Path, Message-ID and Feedback-ID, then uses none of them for sorting** (`returnPathDomain` is read and dropped).
4. **Treat the rules as labelling functions and measure them** (Snorkel, VLDB 2017). For each email, record which rules fired. Report:
   - **coverage:** how much mail at least one rule labels;
   - **overlap:** mail two rules both label;
   - **conflict:** mail where rules disagree.

   Emails where no rule fired, or where rules disagreed, are where the mistakes hide. Those are the cases to look at first.
5. **The Screener is a reject option** (Chow 1957; Geifman and El-Yaniv, SelectiveNet, ICML 2019). The right trade is error on what we label against how much we label (risk against coverage). Pick a target, for example under 2% wrong labels, and send the rest to the Screener. Labelling everything is not the goal.
6. **Metamorphic testing** checks rules that must hold without needing a correct answer for every email. Examples:
   - the same email with a different case or a +tag must land in the same place;
   - adding "Re:" to a friend's mail must not move it out of Personal;
   - moving mail between Gmail tabs must never put a person in Spam.

   This catches the kind of generator mistake I made: if the generator breaks an invariant, the test fails instead of the score dropping quietly.
7. **Learn from corrections only after enough votes.** Yahoo labelled a sender from folder moves only past a vote threshold (50 votes, at least 2 folders). Cluster works for one user, so the matching rule is 2 moves before widening a correction to a pattern or domain.

## Proposed changes, ordered by payoff

| # | Change | Fixes | Size |
|---|---|---|---|
| 1 | Use Gmail's Updates, Social and Forums tabs: a stranger there is never Personal, and the Social tab picks Social when no other label applies | Reddit-type misses, and most person/company errors, with no lists | small |
| 2 | Sending-service evidence from headers we already fetch. Return-Path on a different domain than From, a sending-service Message-ID, or a Feedback-ID means company. A Message-ID from a personal mail app with a Return-Path equal to From means person. This replaces my address-word guess where headers exist | mcinfo@ups, the Shopify store, future unknown stores | medium |
| 3 | The company's category from its signed domain: when DMARC passes through DKIM d=marriott.com, use marriott.com's category even if From is email-marriott.com | many "domain missing from list" misses | small |
| 4 | Sender consistency: label a sender by the majority kind of its mail, so one odd subject doesn't scatter the sender | "Jane commented" type, subject mix-ups | small |
| 5 | Rule trace and report: each email records which rules fired. The simulations print coverage, conflicts and "no rule fired" lists. Real scans log counts only, never addresses | the way we find the next mistakes | medium |
| 6 | Metamorphic tests on both simulations, plus a generator check that a name always matches its address | my generator mistakes | small |
| 7 | Replay the user's own mail: a local-only script exports scanned metadata (no bodies) into a fixture kept out of git. Your corrections and moves become the answer key | the gap between my generated mail and a real inbox | medium |
| 8 | Risk-coverage target: report the share of wrong labels against the share sent to the Screener, and tune the cut-offs on the replay | turns "87% ideal" into a target we choose | small, after 7 |

Items 1 to 4 change sorting. Items 5 to 8 change how we find mistakes. Item 7 matters most because it is the only one that tests against real mail.

## Risks

- Return-Path and Message-ID are written by the sender, so a scammer can fake them. They may decide only between Personal and the Screener. They must never lower a scam check, which matches the existing rule for header shape fields.
- The Gmail tab is Google's guess. A friend's mail in Updates would go to the Screener, not Personal. That is safe, but it is extra work for you.
- Replaying your mail must stay on your machine. The fixture is git-ignored, and nothing is sent anywhere.

## Sources

- Grbovic, Halawi, Karnin, Maarek. "How Many Folders Do You Really Need? Classifying Email into a Handful of Categories." CIKM 2014. https://www.arxiv.org/pdf/1606.09296
- "Classifying Emails into Human vs Machine Category." Yahoo, AAAI 2022. https://arxiv.org/abs/2112.07742
- Google, "Email sender guidelines." https://support.google.com/a/answer/81126
- Identifying the sending service from headers. https://www.suped.com/learn/email-deliverability/how-to-determine-an-email-sending-platform-from-email-headers-or-server-information
- Ratner et al. "Snorkel: Rapid Training Data Creation with Weak Supervision." VLDB 2017. https://arxiv.org/abs/1711.10160 and LFAnalysis docs https://snorkel.readthedocs.io/en/latest/packages/_autosummary/labeling/snorkel.labeling.LFAnalysis.html
- Geifman, El-Yaniv. "SelectiveNet: A Deep Neural Network with an Integrated Reject Option." ICML 2019. https://proceedings.mlr.press/v97/geifman19a.html
- Metamorphic testing of classifiers: Ma et al., IJCAI 2020. https://mlanthology.org/ijcai/2020/ma2020ijcai-metamorphic
