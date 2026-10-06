# Where should Cluster put a suspected scam, and how should it look?

_2026-10-06. Branch `fix/safety-r0`. Research only. No source code was changed._

Builds on, and does not repeat:
`2026-10-06-personas-phishing-and-web-security.md` (B.4 layers, B.6 quarantine UX, C.2 learning, D.4 warnings, E.3 Q4),
`2026-10-05-inbox-intelligence-research.md` §4 and platform facts,
`2026-09-18-phishing-security-ux-separation.md`,
`docs/privacy.md`.

Conventions:

- Inline links are the source for each claim.
- **(Inference)** marks my own reasoning or design.
- **[secondary]** marks a claim from a secondary source or a search summary.
- **Live test** marks a fact no document settles. It must be checked in a real Gmail account before shipping.
- **Not reached** marks a source I could not read this session.
- Code references are `path:line` on this branch.

## TL;DR

1. **Default destination: a Cluster label with INBOX removed.** It is private, reversible, visible on every Gmail client, and the mail stays findable by normal Gmail search.
2. **Not Spam by default.** Moving mail into Spam sends Google a copy ([Gmail Help](https://support.google.com/mail/answer/1366858)). Spam is deleted after 30 days and normal search skips it ([Gmail Help](https://support.google.com/mail/answer/7015314), [search operators](https://support.google.com/mail/answer/7190)). A false positive there is close to lost.
3. **Never Trash on Cluster's own verdict.** Trash also deletes after 30 days, and the dashboard already promises "suspicious mail is never auto-deleted" (`src/dashboard/index.html:194`).
4. **Only a delivery-time Gmail filter stops the phone notification.** Mail that Cluster moves a minute later has very likely already buzzed the phone (Inference). So the known-bad list and user blocks must become filters.
5. **Gmail filters cannot send to Spam.** Google's filter action table has "Never mark as spam" but no "mark as spam" row ([filter guide](https://developers.google.com/workspace/gmail/api/guides/filter_settings)). Filters can add a label and skip the inbox (same table).
6. **Whether API-added `SPAM` counts as a user report is undocumented.** `messages.modify` says nothing about it ([modify](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/modify)). Treat it as "probably yes" for privacy and "unknown" for training.
7. **Two tiers, two places.** High confidence: held label, out of the inbox. Medium: stays in the inbox with an amber "check first" label. Low: nothing.
8. **The label name is the warning.** Rename "🚨 Possible phishing" (`src/lib/clusterLabels.ts:61`) to plain words, colour it red via `labels.create` ([labels](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels)).
9. **Release anywhere teaches the model.** Moving held mail back in Gmail itself (phone or desktop) should count as "Not a scam" for the personal model, not only the dashboard button.
10. **Escalation is an owner decision.** Recommended: unreviewed high-tier mail moves to Spam after 30 days (so Gmail deletes it 30 days later). Off until the owner accepts the Spam privacy trade.

---

## 0. What Cluster does today

| Area | Today | Where |
|---|---|---|
| Switch | `autoQuarantineHighRisk`, default `false` | `src/lib/settingsStore.ts:58-60`, `:171` |
| When it runs | Only inside the 6-hour triage (`cluster-triage`, `periodInMinutes: 360`) | `src/background.ts:61`, `:337` |
| Who is held | Senders whose adjusted score is "high". Known correspondents are skipped unless DMARC fails or SPF and DKIM both fail | `src/background.ts:191-211` |
| Gmail action | Get or create "🚨 Possible phishing", `batchModify` add that label, remove `INBOX`. Never touches `SPAM` or `TRASH` | `src/lib/clusterLabels.ts:61`, `src/lib/providers/gmailProvider.ts:40`, `:229-232` |
| Label look | Created with `labelShow` / `show` and **no colour** | `src/lib/gmailApi.ts:535-546` |
| Outlook action | Adds category "Possible Phishing", then moves to the **Archive** folder | `src/lib/providers/outlookProvider.ts:434`, `:345-359`, `:298`, `:597-603` |
| Undo | Action-log entry with `via: "unlabel-suspicious"`; removes label, adds INBOX back | `src/background.ts:238-247`, `src/lib/providers/gmailProvider.ts:234-237`, `src/dashboard/recentTab.ts:75-77` |
| Review | Dashboard "Quarantine review": Confirm or Release. Release nudges the sender score by -1, Confirm by +1 | `src/dashboard/securityTab.ts:149-204`, `src/lib/quarantineReview.ts:21-36` |
| Manual hold | Security tab "Label as suspicious" with a confirm dialog | `src/dashboard/securityTab.ts:308-329` |
| Delivery filters | Sort buckets can add a label and strip INBOX at delivery (`fileOut`). No security filters | `src/lib/serverSort.ts:61-78` |
| Promise in UI | "Mailbox cleanup stays local and suspicious mail is never auto-deleted." | `src/dashboard/index.html:194` |
| Stale copy | Toggle hint says "6-hourly" and "Gmail only", but Outlook also implements it | `src/dashboard/index.html:532-540`, `src/lib/providers/outlookProvider.ts:625-626` |

Two consequences (Inference):

- Today's design already picked option 1 (label, out of inbox). The question is whether to keep it as the default for everyone, and what to add around it.
- Release only happens in the dashboard. An 80-year-old who never opens it, or a caregiver on their own phone, can only "release" by moving the mail in Gmail. Cluster doesn't notice that today.

---

## 1. Platform facts

### 1.1 Gmail Spam

| Question | Answer | Source |
|---|---|---|
| Auto-delete | "Emails in your trash or spam are permanently deleted after 30 days or when you manually empty your trash or spam." | [Gmail Help: messages missing](https://support.google.com/mail/answer/7015314) |
| Does Google see it? | "When you report spam or move an email into Spam, Google receives a copy of the email and may analyze it to help protect users from spam and abuse." | [Gmail Help: spam](https://support.google.com/mail/answer/1366858) |
| Does API `SPAM` = user report? | **Undocumented.** The labels guide only says SPAM can be applied manually. `messages.modify` describes label changes and nothing about reports or training | [labels guide](https://developers.google.com/workspace/gmail/api/guides/labels), [modify](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/modify) |
| My reading | (Inference) The Help text says "move an email into Spam", not "click Report spam". An API move is a move. Assume Google gets a copy and may learn from it. Whether it weighs an API move like a click is unknown | |
| Undo | "Not spam" in the Spam view restores mail to the inbox | [Gmail Help: spam](https://support.google.com/mail/answer/1366858) |
| Images | "If Gmail thinks a sender or message is suspicious, you won't see images automatically." | [Gmail Help: images](https://support.google.com/mail/answer/145919) |
| Banner in Spam | Gmail shows a "Why is this message in spam?" explanation, and for known-bad links "This message might be dangerous" [secondary: search summaries]. No Google page I read says links are disabled in Spam | search summary only |
| Banner when *Cluster* moved it | **Live test.** (Inference) Gmail may show a generic or "you reported this" banner, or none. Do not promise the user a red Gmail banner |
| Filter can send to Spam? | **No documented way.** The API filter table lists `removeLabelIds=['SPAM']` "Never mark as spam" and `addLabelIds=['TRASH']` "Delete the email", but no row adds SPAM. The Help page lists filter actions as "send email to a label, or archive, delete, star, or automatically forward" | [filter guide](https://developers.google.com/workspace/gmail/api/guides/filter_settings), [Gmail Help: filters](https://support.google.com/mail/answer/6579) |
| Live test | Try `filters.create` with `addLabelIds: ["SPAM"]`. (Inference) Expect a rejection. If it is accepted, still don't rely on it, since it is undocumented |

### 1.2 Labels and filters

| Question | Answer | Source |
|---|---|---|
| Filter can label and skip inbox at delivery | Yes. `removeLabelIds=['INBOX']` "Archive the email (skip the inbox)"; `addLabelIds=['<user label id>']` "Tag the mail with a user-defined label". "Only one user-defined label is allowed per filter." | [filter guide](https://developers.google.com/workspace/gmail/api/guides/filter_settings) |
| Name length | "up to 225 characters" | [Workspace Updates 2011](https://workspaceupdates.googleblog.com/2011/04/need-more-characters-for-labels-longer.html) |
| Emoji | Not documented. Cluster already creates emoji-led names in production (`src/lib/clusterLabels.ts:47-63`). Its comment notes U+FE0F is avoided because it is invisible | code |
| Colour via API | `color.textColor` and `color.backgroundColor` from a fixed palette. Red options include `#cc3a21`, `#ac2b16`, `#822111`, `#fb4c2f`, `#e66550`. Amber includes `#ffad47`, `#eaa041`, `#cf8933`. White `#ffffff`, black `#000000`. "Color is only available for labels that have their `type` set to `user`." | [labels resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels) |
| Limits | Help: "You can create up to 5,000 labels." API: max 10,000 labels per mailbox. 1,000 filters | [Gmail Help: labels](https://support.google.com/mail/answer/118708), [labels resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels), [filters.create](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.filters/create) |
| Mobile rendering | **Live test.** (Inference) Gmail Android and iOS list user labels in the side menu and show label chips on a message. Whether chip colour carries over on each app is unverified. Never rely on colour alone |

### 1.3 Search and recoverability

| Question | Answer | Source |
|---|---|---|
| Default search | `in:anywhere` "Find emails across Gmail. This includes emails in Spam and Trash." So plain searches skip Spam and Trash | [search operators](https://support.google.com/mail/answer/7190) |
| API | `includeSpamTrash`: "Include messages from `SPAM` and `TRASH` in the results." Off by default | [messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list) |
| Trash | Recoverable "Up to 30 days after deletion"; "After 30 days: The message is permanently deleted." | [Gmail Help: delete](https://support.google.com/mail/answer/7401) |
| Held label | (Inference) Mail with a user label and no INBOX is in All Mail. A normal search for "grandson" or "Chase statement" finds it, and the red label chip shows next to the result. It never expires on its own |

This is the decisive difference for false positives. A grandchild's email held under a label turns up when grandma searches for it. The same email in Spam does not, and is gone in 30 days.

### 1.4 Notifications

| Question | Answer | Source |
|---|---|---|
| Android default | "By default, notifications are turned on for any messages in your Primary label." Per-label notifications are set via "Manage labels" | [Gmail Help: Android notifications](https://support.google.com/mail/answer/1075549?co=GENIE.Platform%3DAndroid) |
| iOS default | "By default, notifications are turned on for any email messages in your Primary label" | [Gmail Help: iOS notifications](https://support.google.com/mail/answer/1075549?co=GENIE.Platform%3DiOS) |
| Desktop | "If you use inbox categories and turn on notifications for new mail, you only get notifications about messages in your Primary category." | [Gmail Help: desktop](https://support.google.com/mail/answer/1075549?co=GENIE.Platform%3DDesktop) |
| Caveat | Android: "High priority emails will override any other notifications settings for certain labels." | Android page above |
| Skip-inbox mail | No Google page says so directly. Long-standing user reports say mail filtered to skip the inbox does not notify [secondary: HowToGeek and XDA via search summary] | [HowToGeek](https://www.howtogeek.com/171178/how-to-get-notifications-for-only-the-emails-you-care-about-with-gmail-on-android/) [secondary] |
| Spam | (Inference) Spam is not Primary, so it does not notify by default |
| Moved a minute later | **Live test, and it matters most.** (Inference) The phone sync happens at delivery. Mail that Cluster's 1-minute lane moves out has probably already shown a notification with sender and subject. Whether Gmail then withdraws that notification is unknown |

What this means (Inference): **for notification suppression, the destination matters less than the timing.** Label and Spam both stay silent if applied at delivery. Only a Gmail filter acts at delivery with Chrome closed, and filters can only label, not Spam. So the label is the only destination that can be silent at delivery.

### 1.5 Outlook

| Question | Answer | Source |
|---|---|---|
| Junk folder | Graph well-known name `junkemail`, "The junk email folder." Also `archive`, `deleteditems`, `inbox` | [mailFolder](https://learn.microsoft.com/en-us/graph/api/resources/mailfolder?view=graph-rest-1.0) |
| Junk retention | "Messages in your Junk folder are automatically deleted between 10 and 30 days after they arrive." | [Microsoft Support](https://support.microsoft.com/en-us/office/mail-goes-to-the-junk-folder-by-mistake-f409b58c-2617-47e2-8a97-cab612d98eff) |
| Plain move to Junk reports? | Not documented. Microsoft only says "Marking email as Not junk also helps us improve our service." | same |
| Explicit report API | `reportMessage` (beta): "Report a message as junk, phishing, or not junk, which improves mail filtering." Values `junk`, `notJunk`, `phish`; `IsMessageMoveRequested`. Works for personal accounts with `Mail.ReadWrite`. Beta "use ... in production applications is not supported" | [reportMessage](https://learn.microsoft.com/en-us/graph/api/message-reportmessage?view=graph-rest-beta) |
| Old API | `markAsJunk` is deprecated and "will stop returning data on December 30, 2025" | [markAsJunk](https://learn.microsoft.com/en-us/graph/api/message-markasjunk?view=graph-rest-beta) |
| Rules | Actions include `moveToFolder`, `delete`, `assignCategories`, `markAsRead`, `stopProcessingRules`; predicates include `headerContains` | [messageRuleActions](https://learn.microsoft.com/en-us/graph/api/resources/messageruleactions), [predicates](https://learn.microsoft.com/en-us/graph/api/resources/messagerulepredicates) |
| Custom folder | Graph can create folders (`Create mail folder`) and rules can `moveToFolder` it | [mailFolder](https://learn.microsoft.com/en-us/graph/api/resources/mailfolder?view=graph-rest-1.0) |

(Inference) Outlook is the opposite of Gmail on one point: a rule *can* send to Junk at delivery, and an explicit, documented report API exists. But Junk can delete in 10 days, and the API is beta. Today Cluster puts held Outlook mail in **Archive** with a category (`outlookProvider.ts:345-359`). Archive is a poor place for a warning: nothing about the folder name says "scam". A dedicated folder, "Held by Cluster: looks like a scam", is the Outlook twin of the Gmail label.

---

## 2. What others do

| Product | Destination | Who releases | Retention | Source |
|---|---|---|---|---|
| Gmail itself | "might show a warning or move the email to Spam" | User ("Not spam", "Report not phishing") | 30 days | [Gmail Help](https://support.google.com/mail/answer/8253) |
| Microsoft Defender quarantine | Separate quarantine, not the mailbox. "Malware and high-confidence phishing messages are always quarantined" | Users can release spam, phishing, spoof and impersonation by default. High-confidence phishing and malware are admin-only; users can at most "request" release | Anti-spam default 15 days (1-30 configurable); 30 days in Standard/Strict presets and for malware. "When messages expire ... permanently deleted and can't be recovered." Preview shows HTML "with all links disabled" | [quarantine-about](https://learn.microsoft.com/en-us/defender-office-365/quarantine-about), [quarantine-end-user](https://learn.microsoft.com/en-us/defender-office-365/quarantine-end-user) |
| Google Workspace quarantine | Admin holding area | Admins and reviewer groups only. "Recipients are never notified when a message is quarantined." | "permanently deleted after 30 days" | [Workspace Help](https://knowledge.workspace.google.com/admin/gmail/advanced/set-up-email-quarantine) |
| Guardio | Label "Flagged by Guardio" in the inbox. Does not move. Push alert from its phone app | User | n/a | [Guardio help](https://help.guard.io/hc/en-us/articles/16222692346388-What-is-Email-Security) **Not reached** (403); [secondary: security.org, aura.com via search summary] |
| Proton Mail | PhishGuard adds phishing warnings; spam folder; optional auto-delete of spam and trash after 30 days, off by default, paid plans | User | 30 days if enabled | [Proton auto-delete](https://proton.me/support/auto-delete-unwanted-messages) [secondary: search summary] |
| Apple Mail, Clean Email | Not researched this session | | | |

Patterns (Inference):

- **Confidence decides who may release.** Defender lets users release ordinary phishing but not high-confidence phishing. That is a tiered design, not one bucket.
- **Every real quarantine expires.** 15 to 30 days is the norm. None keep held mail forever.
- **Guardio warns but doesn't move.** That is option 5. Cluster can do better for the 80-year-old by moving.
- **Defender's preview disables links.** Gmail gives Cluster no such control over a held message. A held Gmail message opened from the label still has live links. This is the main weakness of option 1 (see §4).

---

## 3. What the research says about warn vs hold

| Finding | Source | Implication (Inference) |
|---|---|---|
| Active, interrupting phishing warnings were heeded by 79%; one passive-warning participant heeded it | [Egelman, Cranor, Hong, CHI 2008](https://www.semanticscholar.org/paper/You've-been-warned:-an-empirical-study-of-the-of-Egelman-Cranor/114580bca9932bfc4e0018886646751adfac724f) [secondary: figures via search summary] | A label chip in the inbox is a passive warning. Option 5 is the weak form |
| Users clicked through about a tenth (Firefox) to a quarter (Chrome) of malware/phishing warnings, vs 70.2% of Chrome SSL warnings | [Akhawe & Felt, USENIX Security 2013](https://www.usenix.org/conference/usenixsecurity13/technical-sessions/presentation/akhawe) | Even good warnings leak. A hold removes the click from the inbox path |
| SSL warnings: too many participants behaved dangerously under every warning design; the authors suggest blocking unsafe connections and removing warnings in benign cases | [Sunshine et al., USENIX Security 2009](https://www.usenix.org/conference/usenixsecurity09/technical-sessions/presentation/crying-wolf-empirical-study-ssl-warning) [secondary: abstract via search summary; PDF not parsed] | "Block when sure, stay quiet when not" is the literature's own advice |
| Link-focused warnings beat banners; forcing attention to the real URL worked best | [Petelka, Zou, Schaub, CHI 2019](https://dblp.org/rec/conf/chi/PetelkaZS19.html) [secondary] | Cluster can't put a warning on the link inside Gmail. One more reason to move, not warn |
| Habituation: repeated identical warnings stop registering; polymorphic warnings resist it | [Anderson et al., CHI 2015](https://dl.acm.org/doi/10.1145/2702123.2702322) [secondary: abstract via search summary] | The medium-tier inbox label will habituate fast if it fires often. Keep it rare |
| Older users' susceptibility "remained stable" over 21 days and they reported lower awareness | [Lin et al., TOCHI 2019](https://doi.org/10.1145/3336141) [secondary] | For the 80-year-old, prevention beats teaching |
| W3C COGA: "Use Clear Words", "Help the user stay safe" | [W3C COGA](https://www.w3.org/TR/coga-usable/) | Label names in plain words, not "phishing" |

The other side of holding is false positives (Inference). A hold that swallows a real bank alert or a grandchild's email is a harm the user may never notice. The literature above argues for blocking only "when sure". So the hold must be reserved for high confidence, must be easy to find by search, and must not expire quickly.

---

## 4. Comparison

Legend: ●●● strong, ●● partial, ● weak, ✗ none. Personas: 80 = eighty-year-old, CG = caregiver, SO = store owner, CR = creator.

| | 1. Label, out of inbox | 2. Spam | 3. Trash | 4. Hybrid (label → Spam later; tiered) | 5. Label, stays in inbox |
|---|---|---|---|---|---|
| Protection (keeps it off the inbox) | ●●● | ●●● | ●●● | ●●● for high, ● for medium by design | ● (passive warning) |
| Gmail's own warning UI | ✗ Opened from label: live links, normal view | ●● Spam view explanations; image blocking for suspicious mail. Banner when Cluster moved it: **live test** | ✗ | Same as 1, then 2 | ✗ |
| Notification suppression | ●●● if a delivery filter applies it. ✗ if moved by the 1-minute lane after the buzz | ●● only if moved after delivery, so same buzz problem. Filters can't Spam | Same as 2 (filters can Trash) | Same as 1 | ✗ |
| False-positive cost | Low. Mail sits in All Mail, found by search, never expires | High. Hidden from default search, deleted at 30 days, and Google gets a copy that may count against a real sender | Highest. Hidden, deleted at 30 days, reads as "Cluster deleted my mail" | Low for 30 days, then like Spam | Lowest |
| Recoverability | Remove label / Move to Inbox in any Gmail client, or Cluster Undo (`gmailProvider.ts:234-237`) | "Not spam" in Gmail, ≤30 days | Restore from Trash, ≤30 days | Both, in sequence | Nothing to recover |
| Trains Google? | No | Probably (undocumented for API; "move an email into Spam" sends a copy) | No documented effect | Only for escalated mail | No |
| Works at delivery, Chrome closed | Yes, via filter (`serverSort.ts:61-78` shape) | No (no filter action) | Yes (filter `TRASH`) | Label part yes; escalation needs Chrome | Yes, via filter (label only) |
| Privacy impact | None. Mailbox's own label | Copy of mail analysed by Google (who already holds it). Contradicts nothing in `docs/privacy.md` but should be disclosed | None | Disclose escalation | None |
| Fit: 80 | ●●● if named plainly | ●● disappears; she won't look in Spam for a missing email | ✗ | ●●● | ● she still opens it |
| Fit: CG | ●●● visible in her Gmail via delegation | ●● | ✗ | ●●● | ● |
| Fit: SO | ●●● invoices held by mistake are searchable | ● a held supplier invoice could vanish | ✗ | ●● | ●● |
| Fit: CR | ●●● sponsorship false positives recoverable | ● | ✗ | ●● | ●● |

Conclusion (Inference): **option 4 built on option 1** wins. High tier gets the label hold. Medium gets option 5. Spam is used only as a late, optional escalation and when the user says "this is a scam". Trash is never Cluster's call.

---

## 5. Recommended design

### 5.1 Confidence tiers and destinations

| Tier | What qualifies | Destination | Applied by |
|---|---|---|---|
| **Certain** | Signed known-bad domain list (personas note C.2 #5); user's own "Block"; DMARC fail on a domain in the brand list (`src/lib/threatSignals.ts:208-235`) if the `header:` filter test passes | Held label, INBOX removed | **L1 Gmail filter at delivery.** Silent on the phone. Re-checked by L2 |
| **High** | Today's high tier from header scoring, after the parser fixes (personas note E.1 #1). Known-correspondent guard stays (`background.ts:202-207`) | Held label, INBOX removed | **L2 1-minute lane.** The phone may already have buzzed. Accept this and say so |
| **Medium** | Elevated tier with at least two independent signals, or one identity signal plus first contact | Amber label, **stays in inbox** | L2 |
| **Low** | One weak signal | Nothing in Gmail. Dashboard only | n/a |

(Inference) The 1-minute lane can't beat the phone notification. Two mitigations: (1) get as much as possible into the Certain tier, which filters can catch; (2) remove UNREAD on held mail so the app's unread badge for the inbox drops. Whether Gmail withdraws the buzz is a **live test**.

### 5.2 Labels: names and colours

| Label | Name (exact) | Colour (`labels.create` `color`) | Visibility |
|---|---|---|---|
| Held | `🚨 Held by Cluster: looks like a scam` | `backgroundColor: "#cc3a21"`, `textColor: "#ffffff"` | `labelListVisibility: "labelShow"`, `messageListVisibility: "show"` |
| Check first | `⚠ Check before you act` | `backgroundColor: "#ffad47"`, `textColor: "#000000"` | same |

Notes:

- Both colours come from the documented palette ([labels](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels)). `createLabel` sends no colour today (`gmailApi.ts:535-546`). Existing labels need a `labels.patch` to gain colour (Inference).
- No U+FE0F after the emoji, to match the rule in `clusterLabels.ts:7-9`. `⚠` without U+FE0F may render as a text glyph on some phones (Inference, **live test**). The words carry the meaning either way.
- Add `"🚨 Possible phishing"` and `"Possible Phishing"` as legacy names via `spec()` (`clusterLabels.ts:36-45`), so existing held mail moves to the new name.
- "Phishing" is jargon for the 80-year-old (COGA "Use Clear Words"). "Looks like a scam" is plain. "Held by Cluster" says who did it, so she doesn't think Gmail lost mail.
- Name length is 39 characters, far below 225.
- Outlook: a folder with the same name for Held; category with the same name for Check first. Move held Outlook mail to that folder, not Archive (`outlookProvider.ts:358`).

### 5.3 Retention and escalation

| When | High / Certain tier | Medium |
|---|---|---|
| Day 0 | Held label, out of inbox, marked read | Amber label, in inbox |
| Day 7 | Included in the weekly summary (§5.5) | Amber label removed if the user opened the message and did nothing (Inference: avoids a permanently amber inbox) |
| Day 30, still unreviewed | **Option A (recommended, owner decision):** add `SPAM`, keep the held label. Gmail deletes it 30 days later. 60 days of recovery in total. **Option B:** stay held forever | n/a |
| Never | Trash by Cluster | Trash by Cluster |

Why 30 days (Inference): it matches Defender's Standard/Strict and malware retention and Workspace quarantine. It gives at least four weekly summaries before anything changes. Escalating to Spam, not Trash, keeps the wording in `index.html:194` true (Cluster never deletes; Gmail's own Spam rule does). The owner should still confirm that reading, since a user may see it differently.

### 5.4 Release and report flows

**Release ("Not a scam")**, from any of three places:

1. Dashboard button (today's Release, `securityTab.ts:184-204`).
2. **In Gmail itself**: the user or caregiver drags the mail back to the inbox or removes the held label on any device. (Inference) L2 already reads `history.list`. Watching for `labelRemoved` on the held label or `labelAdded` INBOX on a held id and treating it as a release covers the user who never opens Cluster. **Live test** the history types on this branch.
3. Gmail "Not spam" for mail already escalated. Cluster sees SPAM removed the same way.

Each release:

- Records `released` in `quarantineReview` (`quarantineReview.ts:38-45`).
- Feeds the on-device personal model as a negative example (personas note C.2 #1). It must only lower the score for *this user and this sender*, never remove a Certain-tier list match (same rule as `quarantineReview.ts:21-29`).
- Adds the sender to a "trusted after release" set so L1 filters skip it (negatedQuery). (Inference)

**Confirm ("Yes, it's a scam")**:

- Records `confirmed` (`quarantineReview.ts`).
- Moves to Spam **only now**, with plain consent text: "This also sends a copy to Google so Gmail can catch it for others." This is the one place Spam is the right destination: the user chose it, and Google's filter learns.
- Offers **Report**: open the message in Gmail and show "Press More ⋮, then Report phishing" ([Gmail Help](https://support.google.com/mail/answer/8253) documents the desktop path; the mobile path is not on that page, **live test**). Then optionally show the APWG (`reportphishing@apwg.org`) and UK NCSC (`report@phishing.gov.uk`) forwarding steps from the personas note C.2. The user sends; Cluster never does.
- Outlook: `reportMessage` with `phish` would be the clean path, but it is beta and "not supported" in production. Use it only behind a flag, or send the user to Outlook's own Report button.

### 5.5 What the user sees

**Phone, Gmail app (80-year-old, caregiver):**

- Certain tier: nothing arrives. No buzz (Inference, filter at delivery).
- High tier: possibly one buzz, then the mail is gone from the inbox within about a minute.
- Side menu: `🚨 Held by Cluster: looks like a scam`, red where the app shows colour.
- Opening a held message shows the red label chip. There is no Gmail banner and the links still work. (Inference) This is the gap. The label name must say "scam" so plainly that opening it is a warning in itself.
- Searching for a missing email finds it, with the red chip beside it.

**Desktop Gmail:** same label in the left list, chip in the message list and the message header.

**Weekly "held for you" summary.** Cluster has no `gmail.send` and should not add it (personas note C.2). Candidates:

| Channel | Reaches the 80-year-old? | Notes |
|---|---|---|
| A message placed in her own inbox via `users.messages.insert` | Yes, on every device, and a delegate caregiver sees it | **Not reached** this session: I could not confirm that `gmail.modify` authorises `insert`. Must be clearly from Cluster and contain no links. Owner decision on whether a self-inserted message feels like spam |
| Chrome desktop notification | Only when Chrome is running on that computer | Needs the `notifications` permission (not in today's manifest per personas note §0). Not re-verified this session |
| Dashboard card | No | Today's only surface |

Suggested summary text (Inference, COGA style):

> Cluster held 3 emails this week that look like scams.
> • "PayPal" sent from a Gmail address
> • "Norton renewal" with a phone number to call
> • A new sender asking for a wire transfer
> They are in the label "Held by Cluster: looks like a scam". If one is real, move it back to your inbox. Cluster will learn.

Rules: at most once a week, silent if nothing was held (1Password Watchtower pattern in the 2026-09-18 note §3), no links, max three lines of reasons.

### 5.6 Fit with the three layers

| Layer | Destination work |
|---|---|
| L1 filter at delivery | One user label per filter ([filter guide](https://developers.google.com/workspace/gmail/api/guides/filter_settings)): held label + remove INBOX (+ remove UNREAD). Packed `from:` OR-lists. Cannot Spam. Reconcile when the signed list updates |
| L2 1-minute lane | Same held label via `batchModify`, or amber label without INBOX removal. Detect releases from `history.list` label events |
| L3 sweep | Day-7 summary, day-30 escalation if enabled, colour/legacy-name tidy, filter reconciliation |

---

## 6. Open questions for the owner

1. **Default on for everyone?** The brief says on by default. Today it is off (`settingsStore.ts:171`). Turning it on is safe only after the parser and brand fixes (personas note E.1 #1). Agree to gate "default on" on those fixes?
2. **Day-30 escalation to Spam (Option A) or hold forever (Option B)?** A sends Google a copy of unreviewed mail and lets Gmail delete it. B never expires but the label grows.
3. **Does "Gmail deletes it from Spam" break the "never auto-deleted" promise** (`index.html:194`) in users' eyes? If yes, pick B or reword the promise.
4. **Mark held mail as read?** It helps quiet the badge. It also hides the label's unread count, which is a cue for the caregiver.
5. **Weekly summary channel.** Self-inserted inbox message (needs scope check and a decision about how it looks) or Chrome notification (needs a new permission)?
6. **Outlook:** move held mail to a new "Held by Cluster" folder instead of Archive? Use beta `reportMessage` behind a flag?
7. **Medium tier at all?** A second inbox label risks habituation (Anderson 2015). Alternative: medium stays dashboard-only.

## 7. Live tests before shipping

1. Phone notification when a filter labels and skips inbox (Android, iOS).
2. Whether a notification is withdrawn when INBOX is removed 30-60 seconds later.
3. What banner, if any, Gmail shows on mail Cluster moved to Spam via API; whether links work there.
4. `filters.create` with `addLabelIds: ["SPAM"]`.
5. Label colour and `⚠` rendering on Gmail Android and iOS.
6. `history.list` with `labelRemoved` / `labelAdded` to detect in-Gmail releases.
7. Whether `gmail.modify` authorises `users.messages.insert`.

## Sources not reached or only partly read

- Guardio help page returned 403. Its behaviour is from search summaries.
- Sunshine 2009 PDF could not be parsed. ACM pages for Anderson 2015 and Lin 2019 were not opened. Findings are from abstracts via search summaries.
- `users.messages.insert` and `chrome.notifications` reference pages: session limit hit before fetch.
- No Google document states whether API-added `SPAM` counts as a user report or trains the filter. No Google document states that skip-inbox mail is silent on phones.
